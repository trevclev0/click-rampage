import type { RoomState } from "@hooks/roomReducer";
import { useRoom } from "@hooks/useRoom";
import {
  MAX_NAME_LENGTH,
  normalizePlayerName,
  visibleLength,
} from "@shared/player";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import styles from "./RenameDialog.module.css";

interface PendingRename {
  name: string;
  /** The room's last error when we sent, so only a newer one counts. */
  errorBefore: RoomState["lastError"];
}

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

  const connected = status === "connected";
  // Same rules the server applies, so a valid draft is what gets stored.
  const name = normalizePlayerName(draft);
  const tooLong = visibleLength(draft.trim()) > MAX_NAME_LENGTH;
  const confirmed = pending !== null && you?.name === pending.name;
  const serverError =
    pending &&
    lastError !== pending.errorBefore &&
    lastError?.code === "invalid_name"
      ? lastError.message
      : null;
  const saving = pending !== null && !confirmed && !serverError;
  const error = tooLong
    ? `Use at most ${MAX_NAME_LENGTH} characters.`
    : serverError;
  const canSave = connected && !saving && name !== null && name !== you?.name;

  // The rename went through: close the dialog (the DOM owns its open state).
  useEffect(() => {
    if (confirmed) dialogRef.current?.close();
  }, [confirmed]);

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
            onChange={(event) => {
              setDraft(event.target.value);
              setPending(null);
            }}
            autoComplete="nickname"
            spellCheck={false}
            aria-invalid={error !== null}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          />
          <p id={hintId} className={styles.hint}>
            {visibleLength(draft.trim())}/{MAX_NAME_LENGTH} characters
          </p>
          {error && (
            <p id={errorId} className={styles.error} role="alert">
              {error}
            </p>
          )}
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
