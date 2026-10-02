import { type ClientMessage, parseServerMessage } from "@shared/protocol";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { initialRoomState, roomReducer } from "./roomReducer";

export const PING_INTERVAL_MS = 30_000;
const BASE_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/** Exponential backoff with jitter, so a room restart doesn't stampede. */
export function retryDelay(attempt: number): number {
  const ceiling = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** attempt);
  return Math.round(ceiling * (0.5 + Math.random() / 2));
}

export function roomSocketUrl(location: Location): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/ws`;
}

export function useRoomSocket() {
  const [state, dispatch] = useReducer(roomReducer, initialRoomState);
  const [enabled, setEnabled] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  // Owns the socket lifecycle: open, ping, reconnect with backoff, and close
  // on disconnect() or unmount.
  useEffect(() => {
    if (!enabled) {
      dispatch({ type: "status", status: "disconnected" });
      return;
    }

    let stopped = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const ping = () => send({ type: "ping", t: Date.now() });

    const open = () => {
      dispatch({ type: "status", status: "connecting" });
      const socket = new WebSocket(roomSocketUrl(window.location));
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        ping();
        pingTimer = setInterval(ping, PING_INTERVAL_MS);
      };
      socket.onmessage = (event) => {
        const message = parseServerMessage(event.data);
        if (!message) return;
        dispatch({ type: "message", message, receivedAt: Date.now() });
      };
      socket.onclose = () => {
        clearInterval(pingTimer);
        socketRef.current = null;
        if (stopped) return;
        dispatch({ type: "status", status: "connecting" });
        retryTimer = setTimeout(open, retryDelay(attempt++));
      };
    };

    open();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled, send]);

  const connect = useCallback(() => setEnabled(true), []);
  const disconnect = useCallback(() => setEnabled(false), []);

  return { ...state, send, connect, disconnect };
}
