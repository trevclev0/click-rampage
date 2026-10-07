import { useRoom } from "@hooks/useRoom";
import styles from "./ClickButton.module.css";

/**
 * Sends one `increment` per press. The count itself only moves when the
 * server broadcasts it back, so the display stays server-authoritative.
 */
export function ClickButton() {
  const { status, send } = useRoom();

  return (
    <button
      type="button"
      className={styles.button}
      disabled={status !== "connected"}
      onClick={() => send({ type: "increment" })}
    >
      Click!
    </button>
  );
}
