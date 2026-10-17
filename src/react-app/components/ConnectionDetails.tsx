import { ConnectionCard } from "./ConnectionCard";
import styles from "./ConnectionDetails.module.css";
import { HealthStatus } from "./HealthStatus";

/**
 * Connection and API status for debugging, collapsed by default. Players
 * don't need it: the header's Live switch already shows the connection.
 */
export function ConnectionDetails() {
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>Connection details</summary>
      <div className={styles.body}>
        <ConnectionCard />
        <HealthStatus />
      </div>
    </details>
  );
}
