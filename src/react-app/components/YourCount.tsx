import { useRoom } from "@hooks/useRoom";
import styles from "./YourCount.module.css";

const formatCount = new Intl.NumberFormat();

export function YourCount() {
  const { you } = useRoom();

  return (
    <div className={styles.count} role="status" aria-label="Your clicks">
      {/* A new key per count remounts the number, replaying the bounce. */}
      <span key={you?.count} className={styles.value}>
        {you ? formatCount.format(you.count) : "—"}
      </span>{" "}
      <span className={styles.label}>
        {you?.count === 1 ? "click" : "clicks"}
      </span>
    </div>
  );
}
