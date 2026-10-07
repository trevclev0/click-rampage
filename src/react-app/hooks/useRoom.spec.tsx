import { RoomProvider } from "@components/RoomProvider";
import { MockWebSocket } from "@test-utils/mockWebSocket";
import { joinRoom, makePlayer } from "@test-utils/roomTestUtils";
import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRoom } from "./useRoom";

function Status({ label }: { label: string }) {
  const { status } = useRoom();
  return <p>{`${label}: ${status}`}</p>;
}

describe("useRoom", () => {
  it("throws outside a RoomProvider", () => {
    // React logs the uncaught render error; keep the test output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useRoom())).toThrow(
      "useRoom must be used inside <RoomProvider>",
    );
  });

  it("shares one socket between every consumer", () => {
    render(
      <RoomProvider>
        <Status label="first" />
        <Status label="second" />
      </RoomProvider>,
    );
    joinRoom(makePlayer());

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(screen.getByText("first: connected")).toBeInTheDocument();
    expect(screen.getByText("second: connected")).toBeInTheDocument();
  });
});
