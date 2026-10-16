import { RoomProvider } from "@components/RoomProvider";
import type { Player } from "@shared/player";
import { act, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MockWebSocket } from "./mockWebSocket";

export const makePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: "a".repeat(32),
  name: "Player aaaa",
  count: 0,
  ...overrides,
});

/** Renders `ui` inside a RoomProvider backed by a MockWebSocket. */
export function renderWithRoom(ui: ReactElement) {
  return render(<RoomProvider>{ui}</RoomProvider>);
}

/** Opens the latest mock socket and delivers a `welcome`. */
export function joinRoom(you: Player, online: Player[] = [you]) {
  const socket = MockWebSocket.latest();
  act(() => {
    socket.open();
    socket.receive({ type: "welcome", you, online });
  });
  return socket;
}

/** Delivers a server message to the latest mock socket. */
export function receive(message: unknown) {
  act(() => MockWebSocket.latest().receive(message));
}
