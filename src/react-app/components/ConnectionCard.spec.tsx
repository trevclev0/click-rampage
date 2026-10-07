import { roomSocketUrl } from "@hooks/useRoomSocket";
import { MockWebSocket } from "@test-utils/mockWebSocket";
import {
  joinRoom,
  makePlayer,
  receive,
  renderWithRoom,
} from "@test-utils/roomTestUtils";
import { act, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionCard } from "./ConnectionCard";

const card = () => screen.getByRole("region", { name: "Connection" });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ConnectionCard", () => {
  it("shows the status as the connection changes", () => {
    renderWithRoom(<ConnectionCard />);
    expect(within(card()).getByText("Connecting…")).toBeInTheDocument();

    joinRoom(makePlayer());
    expect(within(card()).getByText("Connected")).toBeInTheDocument();

    act(() => MockWebSocket.latest().drop());
    expect(within(card()).getByText("Connecting…")).toBeInTheDocument();
  });

  it("shows the room's server URL", () => {
    renderWithRoom(<ConnectionCard />);
    expect(
      within(card()).getByText(roomSocketUrl(window.location)),
    ).toBeInTheDocument();
  });

  it("updates latency from each pong", () => {
    renderWithRoom(<ConnectionCard />);
    joinRoom(makePlayer());
    expect(card()).toHaveTextContent("Latency—");

    receive({ type: "pong", t: 10_000 - 42 });
    expect(card()).toHaveTextContent("Latency42 ms");

    receive({ type: "pong", t: 10_000 - 7 });
    expect(card()).toHaveTextContent("Latency7 ms");
  });
});
