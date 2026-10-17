import { useRoom } from "@hooks/useRoom";
import styles from "./ConnectionToggle.module.css";

/** Header switch to leave the room and come back. */
export function ConnectionToggle() {
  const { enabled, status, connect, disconnect } = useRoom();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      className={styles.toggle}
      data-status={status}
      onClick={enabled ? disconnect : connect}
      title={enabled ? "Disconnect from the room" : "Reconnect to the room"}
    >
      <span className={styles.dot} aria-hidden="true" />
      Live
    </button>
  );
}
