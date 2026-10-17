import { makePlayer } from "@test-utils/roomTestUtils";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerCard } from "./PlayerCard";
import { avatarTone } from "./playerDisplay";

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

  it("shows id initials for a default-named player", () => {
    const id = "89c2".padEnd(32, "0");
    render(
      <PlayerCard
        player={makePlayer({ id, name: "Player 89c2" })}
        isYou={false}
      />,
    );

    expect(screen.getByText("89")).toHaveAttribute("aria-hidden", "true");
  });

  it("marks your own card", () => {
    render(<PlayerCard player={player} isYou />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("colours the avatar from the player's id", () => {
    const other = makePlayer({ name: "Other Player" });
    // Two ids with different tones, so a fixed tone could not pass.
    expect(avatarTone(other.id)).not.toBe(avatarTone(player.id));

    render(<PlayerCard player={player} isYou={false} />);
    render(<PlayerCard player={other} isYou={false} />);

    // CSS Modules hash class names in tests (`_tone0_<hash>`), so match
    // the local name, not the full class.
    const tone = (id: string) => new RegExp(`tone${avatarTone(id)}(?!\\d)`);
    expect(screen.getByText("CQ").className).toMatch(tone(player.id));
    expect(screen.getByText("OP").className).toMatch(tone(other.id));
  });

  it("uses the singular for one click", () => {
    const { container } = render(
      <PlayerCard player={{ ...player, count: 1 }} isYou={false} />,
    );
    expect(container).toHaveTextContent("1 click");
    expect(container).not.toHaveTextContent("1 clicks");
  });
});
