/** Display helpers shared by the components that show players. */

import { defaultPlayerName, type Player } from "@shared/player";

const numberFormat = new Intl.NumberFormat();

export const formatCount = (count: number) => numberFormat.format(count);

/** The first few characters of a player id, enough to tell names apart. */
export const shortId = (id: string) => id.slice(0, 6);

// Splits by what a person sees as one character, so an emoji name keeps
// its whole emoji as the initial.
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const firstGrapheme = (word: string) =>
  graphemes.segment(word)[Symbol.iterator]().next().value?.segment ?? "";

/**
 * Up to two initials for a player's avatar: the first character of the
 * first two words of their name. Default names ("Player 89c2") would all
 * start with "P", so those use the first two characters of the id instead.
 */
export function initials({ id, name }: Pick<Player, "id" | "name">): string {
  if (name === defaultPlayerName(id)) return id.slice(0, 2).toLocaleUpperCase();
  const words = name.trim().split(/\s+/).filter(Boolean);
  const result = words.slice(0, 2).map(firstGrapheme).join("");
  return result ? result.toLocaleUpperCase() : "?";
}

/**
 * The grid's order: you first, then the most clicks. The sort is stable,
 * so ties keep their order in `players`, which is join order (see
 * `RoomState.online`). Returns a new array of the same player objects,
 * leaving `players` as it was.
 */
export const orderPlayers = (
  players: readonly Player[],
  youId: string | undefined,
): Player[] =>
  players.toSorted(
    (a, b) =>
      Number(b.id === youId) - Number(a.id === youId) || b.count - a.count,
  );

export const AVATAR_TONES = 8;

/**
 * Picks one of {@link AVATAR_TONES} avatar colours from the player id with
 * a 32-bit FNV-1a hash, so a player keeps their colour everywhere.
 */
export function avatarTone(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % AVATAR_TONES;
}
