import { createContext, useContext } from "react";
import type { RoomSocket } from "./useRoomSocket";

/** The one shared room connection, provided by `RoomProvider`. */
export const RoomContext = createContext<RoomSocket | null>(null);

/**
 * Reads the shared room connection. Components use this rather than
 * `useRoomSocket`, which would open a socket per caller.
 */
export function useRoom(): RoomSocket {
  const room = useContext(RoomContext);
  if (!room) throw new Error("useRoom must be used inside <RoomProvider>");
  return room;
}
