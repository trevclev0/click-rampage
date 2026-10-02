import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import styles from "./AppShell.module.css";
import { ThemeToggle } from "./ThemeToggle";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          Click Rampage
        </Link>
        <ThemeToggle />
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        Click as fast as you can. Everyone is watching.
      </footer>
    </div>
  );
}
