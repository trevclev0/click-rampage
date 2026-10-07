import { RoomContext } from "@hooks/useRoom";
import { useRoomSocket } from "@hooks/useRoomSocket";
import type { ReactNode } from "react";

/** Opens the app's single room socket and shares it via `useRoom`. */
export function RoomProvider({ children }: { children: ReactNode }) {
  const room = useRoomSocket();
  return <RoomContext value={room}>{children}</RoomContext>;
}
