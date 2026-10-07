import type { Player } from "@shared/player";
import type { ServerMessage } from "@shared/protocol";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

type ServerError = Extract<ServerMessage, { type: "error" }>;

export interface RoomState {
  status: ConnectionStatus;
  /** Kept across disconnects so the UI can still show your name and count. */
  you: Player | null;
  /** Online players, including you. Empty unless connected. */
  online: Player[];
  /** Round-trip time of the last ping, in milliseconds. */
  latency: number | null;
  lastError: ServerError | null;
}

export type RoomAction =
  | { type: "status"; status: Exclude<ConnectionStatus, "connected"> }
  | { type: "message"; message: ServerMessage; receivedAt: number };

export const initialRoomState: RoomState = {
  status: "connecting",
  you: null,
  online: [],
  latency: null,
  lastError: null,
};

const updatePlayer = (
  state: RoomState,
  id: string,
  patch: Partial<Player>,
): RoomState => ({
  ...state,
  you: state.you?.id === id ? { ...state.you, ...patch } : state.you,
  online: state.online.map((player) =>
    player.id === id ? { ...player, ...patch } : player,
  ),
});

function applyMessage(
  state: RoomState,
  message: ServerMessage,
  receivedAt: number,
): RoomState {
  switch (message.type) {
    case "welcome":
      return {
        ...state,
        status: "connected",
        you: message.you,
        online: message.online,
        lastError: null,
      };
    case "player_joined":
      return {
        ...state,
        online: [
          ...state.online.filter((p) => p.id !== message.player.id),
          message.player,
        ],
      };
    case "player_left":
      return {
        ...state,
        online: state.online.filter((p) => p.id !== message.id),
      };
    case "count":
      return updatePlayer(state, message.id, { count: message.count });
    case "renamed":
      return updatePlayer(state, message.id, { name: message.name });
    case "pong":
      return { ...state, latency: Math.max(0, receivedAt - message.t) };
    case "error":
      return { ...state, lastError: message };
  }
}

export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  if (action.type === "message") {
    return applyMessage(state, action.message, action.receivedAt);
  }
  // Any non-connected status means the online list is no longer live.
  return { ...state, status: action.status, online: [], latency: null };
}
