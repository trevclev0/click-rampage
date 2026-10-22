import type { Player } from "@shared/player";

export type RankedPlayer = Player & { rank: number };

// Code-unit order, not localeCompare: the same on every runtime, so a tie
// never reorders between pushes.
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Players with at least one click, best first. Tied players share a rank
 * (1, 2, 2, 4) and are ordered by name, then id.
 */
export function rankStandings(players: Iterable<Player>): RankedPlayer[] {
  const sorted = [...players]
    .filter(({ count }) => count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        compareText(a.name, b.name) ||
        compareText(a.id, b.id),
    );
  let rank = 0;
  return sorted.map((player, index) => {
    // A tie keeps the rank of the first player at that count.
    if (index === 0 || sorted[index - 1].count !== player.count) {
      rank = index + 1;
    }
    return { ...player, rank };
  });
}
