import { useRoom } from "@hooks/useRoom";
import { roomSocketUrl } from "@hooks/useRoomSocket";
import { useId } from "react";
import styles from "./ConnectionCard.module.css";
import { statusLabels } from "./connectionStatus";

/**
 * Status, server and round-trip latency of the room connection. Status
 * changes are announced by `ConnectionDetails`, not here, so a screen reader
 * hears them once, whether or not the card is showing.
 */
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
          <span>{statusLabels[status]}</span>
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
