import { useRoom } from "@hooks/useRoom";
import { useId } from "react";
import { PlayerCard } from "./PlayerCard";
import styles from "./PlayerGrid.module.css";
import { orderPlayers } from "./playerDisplay";

/**
 * Everyone in the room: you first, then by clicks (ties in join order).
 * Cards are keyed by player id, so they move as counts change rather
 * than remount.
 */
export function PlayerGrid() {
  const { you, online, status } = useRoom();
  const headingId = useId();
  const players = orderPlayers(online, you?.id);

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        {players.length} {players.length === 1 ? "player" : "players"} online
      </h2>
      {players.length === 0 ? (
        <p className={styles.empty}>
          {status === "disconnected"
            ? "You're offline. Switch Live back on to rejoin."
            : "Waiting for the room…"}
        </p>
      ) : (
        <ul className={styles.grid}>
          {players.map((player) => (
            <li key={player.id}>
              <PlayerCard player={player} isYou={player.id === you?.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
