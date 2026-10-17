import { useRoom } from "@hooks/useRoom";
import { ConnectionCard } from "./ConnectionCard";
import styles from "./ConnectionDetails.module.css";
import { statusLabels } from "./connectionStatus";
import { HealthStatus } from "./HealthStatus";

/**
 * Connection and API status for debugging, collapsed by default. Players
 * don't need it: the header's Live switch shows the connection, but only
 * visually. So a hidden status line outside the details announces
 * connection changes to screen readers, even while the details are closed.
 */
export function ConnectionDetails() {
  const { status } = useRoom();

  return (
    <>
      <p className={styles.announcer} role="status">
        {statusLabels[status]}
      </p>
      <details className={styles.details}>
        <summary className={styles.summary}>Connection details</summary>
        <div className={styles.body}>
          <ConnectionCard />
          <HealthStatus />
        </div>
      </details>
    </>
  );
}
