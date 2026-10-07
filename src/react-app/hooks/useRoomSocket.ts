import { type ClientMessage, parseServerMessage } from "@shared/protocol";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { initialRoomState, roomReducer } from "./roomReducer";

export const PING_INTERVAL_MS = 30_000;
export const PONG_TIMEOUT_MS = 10_000;
export const STABLE_CONNECTION_MS = 10_000;
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
    let closeCurrent: (() => void) | undefined;

    const open = () => {
      dispatch({ type: "status", status: "connecting" });
      const socket = new WebSocket(roomSocketUrl(window.location));
      socketRef.current = socket;

      let closed = false;
      let pingTimer: ReturnType<typeof setInterval> | undefined;
      let pongDeadline: ReturnType<typeof setTimeout> | undefined;
      let stableTimer: ReturnType<typeof setTimeout> | undefined;

      // Runs once per socket, for a close event, a missed pong or cleanup.
      // Handlers are detached first, so a late event from this socket can
      // never touch a newer one.
      const handleClose = () => {
        if (closed) return;
        closed = true;
        clearInterval(pingTimer);
        clearTimeout(pongDeadline);
        clearTimeout(stableTimer);
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        if (socketRef.current === socket) socketRef.current = null;
        socket.close();
        if (stopped) return;
        dispatch({ type: "status", status: "connecting" });
        retryTimer = setTimeout(open, retryDelay(attempt++));
      };
      closeCurrent = handleClose;

      // A half-open connection never fires close, so an unanswered ping is
      // treated as a drop.
      const ping = () => {
        if (!send({ type: "ping", t: Date.now() })) return;
        pongDeadline ??= setTimeout(handleClose, PONG_TIMEOUT_MS);
      };

      socket.onopen = () => {
        ping();
        pingTimer = setInterval(ping, PING_INTERVAL_MS);
        // Only a connection that stays up resets the backoff; one that
        // drops right after the handshake keeps backing off.
        stableTimer = setTimeout(() => {
          attempt = 0;
        }, STABLE_CONNECTION_MS);
      };
      socket.onmessage = (event) => {
        const message = parseServerMessage(event.data);
        if (!message) return;
        if (message.type === "pong") {
          clearTimeout(pongDeadline);
          pongDeadline = undefined;
        }
        dispatch({ type: "message", message, receivedAt: Date.now() });
      };
      socket.onclose = handleClose;
    };

    open();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      closeCurrent?.();
    };
  }, [enabled, send]);

  const connect = useCallback(() => setEnabled(true), []);
  const disconnect = useCallback(() => setEnabled(false), []);

  return { ...state, send, connect, disconnect };
}

export type RoomSocket = ReturnType<typeof useRoomSocket>;
