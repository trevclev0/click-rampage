import { makePlayer } from "@test-utils/roomTestUtils";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerCard } from "./PlayerCard";

const player = makePlayer({
  id: "c0ffee".padEnd(32, "0"),
  name: "Click Queen",
  count: 1234,
});

describe("PlayerCard", () => {
  it("shows the avatar, name, short id and count", () => {
    const { container } = render(<PlayerCard player={player} isYou={false} />);

    expect(screen.getByText("Click Queen")).toBeInTheDocument();
    expect(screen.getByText("#c0ffee")).toBeInTheDocument();
    expect(screen.getByText("CQ")).toHaveAttribute("aria-hidden", "true");
    expect(container).toHaveTextContent(`${(1234).toLocaleString()} clicks`);
    expect(screen.queryByText("You")).not.toBeInTheDocument();
  });

  it("marks your own card", () => {
    render(<PlayerCard player={player} isYou />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("uses the singular for one click", () => {
    const { container } = render(
      <PlayerCard player={{ ...player, count: 1 }} isYou={false} />,
    );
    expect(container).toHaveTextContent("1 click");
    expect(container).not.toHaveTextContent("1 clicks");
  });
});
