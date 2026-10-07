import { useRoom } from "@hooks/useRoom";
import styles from "./RoomDebug.module.css";

/** Temporary readout of the room connection; replaced by the real UI. */
export function RoomDebug() {
  const { status, you, online, latency } = useRoom();

  return (
    <dl className={styles.debug} aria-label="Room connection">
      <dt>Status</dt>
      <dd>{status}</dd>
      <dt>You</dt>
      <dd>{you ? `${you.name} (${you.count})` : "—"}</dd>
      <dt>Online</dt>
      <dd>{online.length}</dd>
      <dt>Latency</dt>
      <dd>{latency === null ? "—" : `${latency} ms`}</dd>
    </dl>
  );
}
