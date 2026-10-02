import { MockWebSocket } from "@test-utils/mockWebSocket";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PING_INTERVAL_MS,
  retryDelay,
  roomSocketUrl,
  useRoomSocket,
} from "./useRoomSocket";

const you = { id: "a".repeat(32), name: "Player aaaa", count: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});

afterEach(() => {
  vi.useRealTimers();
});

const connect = () => {
  const hook = renderHook(() => useRoomSocket());
  const socket = MockWebSocket.latest();
  act(() => {
    socket.open();
    socket.receive({ type: "welcome", you, online: [you] });
  });
  return { ...hook, socket };
};

describe("roomSocketUrl", () => {
  it.each([
    ["https:", "wss://example.com/api/ws"],
    ["http:", "ws://example.com/api/ws"],
  ])("uses the matching scheme for %s", (protocol, expected) => {
    expect(roomSocketUrl({ protocol, host: "example.com" } as Location)).toBe(
      expected,
    );
  });
});

describe("retryDelay", () => {
  it("doubles per attempt with jitter, capped at 30s", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    expect(retryDelay(0)).toBe(1_000);
    expect(retryDelay(3)).toBe(8_000);
    expect(retryDelay(10)).toBe(30_000);

    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(retryDelay(3)).toBe(4_000);
  });
});

describe("useRoomSocket", () => {
  it("connects to /api/ws and applies the welcome", () => {
    const { result, socket } = connect();

    expect(socket.url).toBe(roomSocketUrl(window.location));
    expect(result.current.status).toBe("connected");
    expect(result.current.you).toEqual(you);
  });

  it("pings on open and every 30s, and records latency", () => {
    const { result, socket } = connect();
    expect(socket.sent).toEqual([{ type: "ping", t: 1_000 }]);

    act(() => {
      vi.setSystemTime(1_040);
      socket.receive({ type: "pong", t: 1_000 });
    });
    expect(result.current.latency).toBe(40);

    act(() => vi.advanceTimersByTime(PING_INTERVAL_MS));
    expect(socket.sent).toHaveLength(2);
  });

  it("ignores frames that fail the schema", () => {
    const { result, socket } = connect();
    act(() => socket.receive({ type: "explode" }));
    expect(result.current.status).toBe("connected");
  });

  it("send() writes JSON only while open", () => {
    const { result, socket } = connect();

    act(() => {
      expect(result.current.send({ type: "increment" })).toBe(true);
    });
    expect(socket.sent.at(-1)).toEqual({ type: "increment" });

    act(() => socket.drop());
    expect(result.current.send({ type: "increment" })).toBe(false);
  });

  it("reconnects with backoff after a drop", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const { result, socket } = connect();

    act(() => socket.drop());
    expect(result.current.status).toBe("connecting");
    expect(result.current.online).toEqual([]);
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1_000));
    expect(MockWebSocket.instances).toHaveLength(2);

    // A failed retry waits longer.
    act(() => MockWebSocket.latest().drop());
    act(() => vi.advanceTimersByTime(1_999));
    expect(MockWebSocket.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("disconnect() closes without retrying; connect() reopens", () => {
    const { result, socket } = connect();

    act(() => result.current.disconnect());
    expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    expect(result.current.status).toBe("disconnected");
    expect(result.current.you).toEqual(you);

    act(() => vi.advanceTimersByTime(60_000));
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => result.current.connect());
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(result.current.status).toBe("connecting");
  });

  it("closes the socket on unmount", () => {
    const { unmount, socket } = connect();
    unmount();
    expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    act(() => vi.advanceTimersByTime(60_000));
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
