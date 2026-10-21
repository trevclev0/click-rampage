import { useRoom } from "@hooks/useRoom";
import {
  type FocusEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { PlayerCard } from "./PlayerCard";
import styles from "./PlayerGrid.module.css";
import { orderPlayers } from "./playerDisplay";

/**
 * Everyone in the room: you first, then by clicks. Ties keep the order
 * last shown, so players racing level don't swap on every click. Cards
 * are keyed by player id, so they move as counts change rather than
 * remount.
 *
 * While the pointer or focus is inside, the order holds still, so a card
 * doesn't move out from under someone reading or about to tap it. Counts
 * keep updating, and the latest order applies on leave.
 */
export function PlayerGrid() {
  const { you, online, status } = useRoom();
  const headingId = useId();
  const shown = useRef<string[]>([]);
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const players = orderPlayers(online, you?.id, {
    previous: shown.current,
    frozen: pointerInside || focusInside,
  });

  // Saved on commit rather than during render, so a render React throws
  // away doesn't become the order the next one keeps.
  useLayoutEffect(() => {
    shown.current = players.map(({ id }) => id);
  });

  const handleBlur = (event: FocusEvent) => {
    // Focus moving between cards stays inside.
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setFocusInside(false);
    }
  };

  return (
    <section
      className={styles.section}
      aria-labelledby={headingId}
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => setPointerInside(false)}
      onFocus={() => setFocusInside(true)}
      onBlur={handleBlur}
    >
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
