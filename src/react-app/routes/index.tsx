import { HealthStatus } from "@components/HealthStatus";
import { createFileRoute } from "@tanstack/react-router";
import styles from "./index.module.css";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>cf-starter</h1>
      <p className={styles.lead}>
        React + Hono on a single Cloudflare Worker. Replace this page with your
        app.
      </p>
      <HealthStatus />
    </section>
  );
}
