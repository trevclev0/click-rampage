import type { RoomState } from "@hooks/roomReducer";
import { useRoom } from "@hooks/useRoom";
import {
  cleanPlayerName,
  MAX_NAME_LENGTH,
  visibleLength,
} from "@shared/player";
import { MAX_RENAME_UNITS } from "@shared/protocol";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import styles from "./RenameDialog.module.css";

interface PendingRename {
  name: string;
  /** The room's last error when we sent, so only a newer one counts. */
  errorBefore: RoomState["lastError"];
}

type ServerError = NonNullable<RoomState["lastError"]>;

/** The inline error for a cleaned draft, or `null` when there's none. */
function draftError(cleaned: string, length: number): string | null {
  if (length > MAX_NAME_LENGTH) {
    return `Use at most ${MAX_NAME_LENGTH} characters.`;
  }
  // Stacked combining marks can fit the visible limit yet overflow the
  // protocol's bound, and the room would drop the message as invalid.
  if (cleaned.length > MAX_RENAME_UNITS) return "That name is too long.";
  return null;
}

/** What to show inline when the room answers a save with an error. */
const rejectionMessage = (error: ServerError) =>
  error.code === "invalid_name" && error.message
    ? error.message
    : "That name couldn't be saved.";

/**
 * Your name with a button that opens a native modal <dialog> to change it.
 * The dialog stays open until the room confirms the rename or rejects it,
 * so a server error can show inline.
 */
export function RenameDialog() {
  const { you, status, lastError, send } = useRoom();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingRename | null>(null);
  // A rename in flight when the connection changes may never be answered,
  // so it stops counting as pending (adjusting state during render).
  const [seenStatus, setSeenStatus] = useState(status);
  if (status !== seenStatus) {
    setSeenStatus(status);
    setPending(null);
  }
  const titleId = useId();
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const noteId = useId();

  const connected = status === "connected";
  // Measure the name as the server will store it (normalizePlayerName's
  // rules), so the counter, the error and Save all agree with what is sent.
  const cleaned = cleanPlayerName(draft);
  const length = visibleLength(cleaned);
  const invalidDraft = draftError(cleaned, length);
  const name = cleaned && !invalidDraft ? cleaned : null;
  const confirmed = pending !== null && you?.name === pending.name;
  // Any error newer than the save is its answer: a name the room refuses
  // (invalid_name) or a frame it couldn't parse (invalid_message).
  const rejection =
    pending && lastError !== pending.errorBefore ? lastError : null;
  const serverError = rejection && rejectionMessage(rejection);
  const saving = pending !== null && !confirmed && !rejection;
  const error = invalidDraft ?? serverError;
  const canSave = connected && !saving && name !== null && name !== you?.name;
  const describedBy = [hintId, error && errorId, !connected && noteId]
    .filter(Boolean)
    .join(" ");

  // The rename went through: close the dialog (the DOM owns its open state).
  useEffect(() => {
    if (confirmed) dialogRef.current?.close();
  }, [confirmed]);

  // The room refused the name: focus may be stranded on Save or <body>, so
  // put it back in the field with the text selected, ready to correct.
  useEffect(() => {
    if (!rejection) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [rejection]);

  const open = () => {
    // Commit the draft first, or select() would act on the old value and
    // the re-render would then drop the selection.
    flushSync(() => {
      setDraft(you?.name ?? "");
      setPending(null);
    });
    dialogRef.current?.showModal();
    inputRef.current?.select();
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave || name === null) return;
    if (send({ type: "rename", name })) {
      setPending({ name, errorBefore: lastError });
    }
  };

  return (
    <div className={styles.identity}>
      <p className={styles.playingAs}>
        Playing as <strong className={styles.name}>{you?.name ?? "…"}</strong>
      </p>
      <button
        type="button"
        className={styles.secondary}
        onClick={open}
        disabled={!connected || !you}
      >
        Change name
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={titleId}
        onClose={() => setPending(null)}
      >
        <form className={styles.form} onSubmit={save} noValidate>
          <h2 id={titleId} className={styles.title}>
            Change your name
          </h2>
          <label htmlFor={inputId} className={styles.label}>
            Name
          </label>
          <input
            ref={inputRef}
            id={inputId}
            className={styles.input}
            value={draft}
            // Locked while a save is in flight: an edit would drop the
            // pending rename, so its confirmation could no longer close
            // the dialog. Editing after a rejection clears the error.
            readOnly={saving}
            onChange={(event) => {
              setDraft(event.target.value);
              setPending(null);
            }}
            autoComplete="nickname"
            spellCheck={false}
            aria-invalid={error !== null}
            aria-describedby={describedBy}
          />
          <p id={hintId} className={styles.hint}>
            {length}/{MAX_NAME_LENGTH} characters
          </p>
          {error && (
            <p id={errorId} className={styles.error} role="alert">
              {error}
            </p>
          )}
          {/* Always rendered, so text added on a drop is announced. */}
          <p id={noteId} className={styles.note} role="status">
            {!connected &&
              "Reconnecting… you can save once you're back online."}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.primary}
              disabled={!canSave}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
