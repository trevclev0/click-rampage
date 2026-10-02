import { HealthStatus } from "@components/HealthStatus";
import { RoomDebug } from "@components/RoomDebug";
import { createFileRoute } from "@tanstack/react-router";
import styles from "./index.module.css";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Click Rampage</h1>
      <p className={styles.lead}>
        A real-time multiplayer click counter. The game is on its way.
      </p>
      <HealthStatus />
      <RoomDebug />
    </section>
  );
}
