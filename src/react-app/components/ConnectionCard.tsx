import type { ConnectionStatus } from "@hooks/roomReducer";
import { useRoom } from "@hooks/useRoom";
import { roomSocketUrl } from "@hooks/useRoomSocket";
import { useId } from "react";
import styles from "./ConnectionCard.module.css";

const statusLabels: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  disconnected: "Disconnected",
};

/** Status, server and round-trip latency of the room connection. */
export function ConnectionCard() {
  const { status, latency } = useRoom();
  const headingId = useId();

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        Connection
      </h2>
      <dl className={styles.details}>
        <dt>Status</dt>
        <dd className={styles.status} data-status={status}>
          <span className={styles.dot} aria-hidden="true" />
          <span aria-live="polite">{statusLabels[status]}</span>
        </dd>
        <dt>Server</dt>
        <dd>
          <code className={styles.url}>{roomSocketUrl(window.location)}</code>
        </dd>
        <dt>Latency</dt>
        <dd>{latency === null ? "—" : `${latency} ms`}</dd>
      </dl>
    </section>
  );
}
