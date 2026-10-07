import { ClickButton } from "@components/ClickButton";
import { HealthStatus } from "@components/HealthStatus";
import { PlayerGrid } from "@components/PlayerGrid";
import { RoomDebug } from "@components/RoomDebug";
import { YourCount } from "@components/YourCount";
import { createFileRoute } from "@tanstack/react-router";
import styles from "./index.module.css";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Get ready to rampage</h1>
      <p className={styles.lead}>
        Every click counts, and everyone online sees it live.
      </p>
      <div className={styles.game}>
        <YourCount />
        <ClickButton />
      </div>
      <PlayerGrid />
      <HealthStatus />
      <RoomDebug />
    </section>
  );
}
