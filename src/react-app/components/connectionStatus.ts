import type { ConnectionStatus } from "@hooks/roomReducer";

/** How each room connection status reads, on screen and aloud. */
export const statusLabels: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  disconnected: "Disconnected",
};
