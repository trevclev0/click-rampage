import type { Player } from "@shared/player";
import styles from "./PlayerCard.module.css";
import { avatarTone, formatCount, initials, shortId } from "./playerDisplay";

interface PlayerCardProps {
  player: Player;
  isYou: boolean;
}

export function PlayerCard({ player, isYou }: PlayerCardProps) {
  const cardClass = isYou ? `${styles.card} ${styles.you}` : styles.card;

  return (
    <div className={cardClass}>
      <span
        className={`${styles.avatar} ${styles[`tone${avatarTone(player.id)}`]}`}
        aria-hidden="true"
      >
        {initials(player.name)}
      </span>
      <div className={styles.identity}>
        <p className={styles.name}>{player.name}</p>
        <p className={styles.meta}>
          <span className={styles.id}>#{shortId(player.id)}</span>
          {isYou && <span className={styles.badge}>You</span>}
        </p>
      </div>
      <p className={styles.count}>
        {formatCount(player.count)}{" "}
        <span className={styles.unit}>
          {player.count === 1 ? "click" : "clicks"}
        </span>
      </p>
    </div>
  );
}
