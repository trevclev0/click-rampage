import { useRoom } from "@hooks/useRoom";
import { useId, useState } from "react";
import styles from "./Leaderboard.module.css";
import { formatCount } from "./playerDisplay";

/** Rows shown before "Show all". */
const COLLAPSED_SIZE = 3;

interface RowProps {
  rank: number;
  name: string;
  count: number;
  isYou: boolean;
  online: boolean;
}

function Row({ rank, name, count, isYou, online }: RowProps) {
  return (
    <li className={isYou ? `${styles.row} ${styles.you}` : styles.row}>
      <span className={styles.rank}>{rank}</span>
      <span className={styles.name}>{name}</span>
      {online && (
        <span className={styles.online}>
          <span className={styles.hidden}>online</span>
        </span>
      )}
      {isYou && <span className={styles.badge}>You</span>}
      <span className={styles.count}>{formatCount(count)}</span>
    </li>
  );
}

/**
 * All-time standings the Room pushes: the room total, the top players
 * (offline ones too) and, when you're not among those shown, your own rank.
 * Online players get a dot, from the room's live online list.
 */
export function Leaderboard() {
  const { you, online, leaderboard } = useRoom();
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const listId = useId();

  const heading = (
    <h2 id={headingId} className={styles.heading}>
      All-time leaderboard
    </h2>
  );
  if (!leaderboard) {
    return (
      <section className={styles.section} aria-labelledby={headingId}>
        {heading}
        <p className={styles.note}>Waiting for the room…</p>
      </section>
    );
  }

  const { top, total } = leaderboard;
  // Online names update on rename; the board's wait for the next push.
  const onlineNames = new Map(online.map(({ id, name }) => [id, name]));
  const collapsible = top.length > COLLAPSED_SIZE;
  const shown = expanded ? top : top.slice(0, COLLAPSED_SIZE);
  // By id, not rank: a tie can leave you ranked 10th but off the list.
  const youShown = shown.some(({ id }) => id === you?.id);
  const standing = leaderboard.you;
  // Players listed before you; past the top list, those ranked above you.
  const youIndex = top.findIndex(({ id }) => id === you?.id);
  const ahead = youIndex >= 0 ? youIndex : (standing?.rank ?? 1) - 1;

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      {heading}
      <p className={styles.total}>
        Everyone together: <strong>{formatCount(total)} clicks</strong>
      </p>
      {top.length === 0 ? (
        <p className={styles.note}>No clicks yet. Be the first!</p>
      ) : (
        <ol id={listId} className={styles.list}>
          {shown.map((entry) => (
            <Row
              key={entry.id}
              {...entry}
              name={onlineNames.get(entry.id) ?? entry.name}
              isYou={entry.id === you?.id}
              online={onlineNames.has(entry.id)}
            />
          ))}
          {you && standing && !youShown && (
            <>
              {ahead > shown.length && (
                <li className={styles.gap} aria-hidden="true">
                  ⋯
                </li>
              )}
              <Row
                rank={standing.rank}
                name={you.name}
                count={standing.count}
                isYou
                online={onlineNames.has(you.id)}
              />
            </>
          )}
        </ol>
      )}
      {top.length > 0 && !standing && (
        <p className={styles.note}>Click to get on the board</p>
      )}
      {collapsible && (
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? `Show top ${COLLAPSED_SIZE}` : `Show all ${top.length}`}
        </button>
      )}
    </section>
  );
}
