/** Response body of `GET /api/me`. */
export interface MeResponse {
  playerId: string;
}

/** A player as stored by the Room and sent to clients. */
export interface Player {
  id: string;
  name: string;
  count: number;
}

export const MAX_NAME_LENGTH = 20;

// Control characters (Cc) and invisible format characters (Cf: zero-width,
// bidi overrides, BOM) that can make names render deceptively. Note this
// also strips the zero-width joiner, so ZWJ emoji sequences split apart.
const UNSAFE_CHARS = /[\p{Cc}\p{Cf}]/gu;

// Counts what a person sees as one character (👍🏽 is two code points but
// one grapheme), so the length limit matches the visible name.
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const visibleLength = (text: string) => [...graphemes.segment(text)].length;

/**
 * Cleans a requested display name. Returns `null` when nothing usable is
 * left or the result is longer than {@link MAX_NAME_LENGTH}.
 */
export function normalizePlayerName(input: string): string | null {
  const name = input.replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim();
  if (name.length === 0 || visibleLength(name) > MAX_NAME_LENGTH) return null;
  return name;
}

export const defaultPlayerName = (playerId: string) =>
  `Player ${playerId.slice(0, 4)}`;
