// Shared by the Room and the Worker routes that talk to it. Kept free of
// `cloudflare:workers` imports so Node-based unit tests can load routes.

/** Every player shares one Room instance. */
export const ROOM_NAME = "global";

/** Set by the Worker from the player cookie; never trusted from clients. */
export const PLAYER_ID_HEADER = "x-click-rampage-player";
