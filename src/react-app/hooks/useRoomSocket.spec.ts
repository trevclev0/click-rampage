import { MockWebSocket } from "@test-utils/mockWebSocket";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONNECT_TIMEOUT_MS,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
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

  it("treats an unanswered ping as a drop and reconnects", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const { result, socket } = connect();

    act(() => vi.advanceTimersByTime(PONG_TIMEOUT_MS));

    expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    expect(result.current.status).toBe("connecting");
    act(() => vi.advanceTimersByTime(1_000));
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("gives up on a socket that never opens and retries", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const { result } = renderHook(() => useRoomSocket());
    const stalled = MockWebSocket.latest();

    act(() => vi.advanceTimersByTime(CONNECT_TIMEOUT_MS));

    expect(stalled.readyState).toBe(MockWebSocket.CLOSED);
    expect(result.current.status).toBe("connecting");
    act(() => vi.advanceTimersByTime(1_000));
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("keeps a socket that opens before the connect deadline", () => {
    renderHook(() => useRoomSocket());
    const socket = MockWebSocket.latest();

    act(() => vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 1));
    act(() => {
      socket.open();
      socket.receive({ type: "pong", t: 1_000 });
      vi.advanceTimersByTime(CONNECT_TIMEOUT_MS);
    });

    expect(socket.readyState).toBe(MockWebSocket.OPEN);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("keeps a connection whose pings are answered", () => {
    const { socket } = connect();

    act(() => {
      socket.receive({ type: "pong", t: 1_000 });
      vi.advanceTimersByTime(PING_INTERVAL_MS - 1);
    });

    expect(socket.readyState).toBe(MockWebSocket.OPEN);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("keeps backing off when connections drop right after opening", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const { socket } = connect();

    act(() => socket.drop());
    act(() => vi.advanceTimersByTime(1_000));
    act(() => {
      MockWebSocket.latest().open();
      MockWebSocket.latest().drop();
    });

    // Second retry waits 2s, not 1s: the brief open did not reset backoff.
    act(() => vi.advanceTimersByTime(1_999));
    expect(MockWebSocket.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("resets backoff once a connection stays up", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const { socket } = connect();
    act(() => socket.drop());
    act(() => vi.advanceTimersByTime(1_000));

    const second = MockWebSocket.latest();
    act(() => {
      second.open();
      second.receive({ type: "pong", t: Date.now() });
      vi.advanceTimersByTime(10_000);
    });
    act(() => second.drop());

    act(() => vi.advanceTimersByTime(1_000));
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("ignores a late close from a replaced socket", () => {
    const { result, socket } = connect();
    const lateClose = socket.onclose;

    act(() => result.current.disconnect());
    act(() => result.current.connect());
    act(() => MockWebSocket.latest().open());
    act(() => lateClose?.());

    expect(result.current.send({ type: "increment" })).toBe(true);
    expect(MockWebSocket.latest().sent.at(-1)).toEqual({ type: "increment" });
  });

  it("closes the socket on unmount", () => {
    const { unmount, socket } = connect();
    unmount();
    expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    act(() => vi.advanceTimersByTime(60_000));
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
