import { useRoom } from "@hooks/useRoom";
import { useId } from "react";
import { PlayerCard } from "./PlayerCard";
import styles from "./PlayerGrid.module.css";

/** Everyone in the room, you first, then in the order they joined. */
export function PlayerGrid() {
  const { you, online, status } = useRoom();
  const headingId = useId();
  const players = [
    ...online.filter((player) => player.id === you?.id),
    ...online.filter((player) => player.id !== you?.id),
  ];

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
