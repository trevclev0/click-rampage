import { useHealthQuery } from "@hooks/useHealthQuery";
import styles from "./HealthStatus.module.css";

export function HealthStatus() {
  const { data, isPending, isError } = useHealthQuery();

  if (isPending) {
    return (
      <p className={styles.status} role="status">
        Checking API…
      </p>
    );
  }

  if (isError) {
    return (
      <p className={`${styles.status} ${styles.error}`} role="alert">
        API unreachable
      </p>
    );
  }

  return (
    <p className={`${styles.status} ${styles.ok}`} role="status">
      API ok · <code className={styles.env}>{data.environment}</code>
    </p>
  );
}
