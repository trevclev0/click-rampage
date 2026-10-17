import { MockWebSocket } from "@test-utils/mockWebSocket";
import { createQueryWrapper } from "@test-utils/queryTestUtils";
import { joinRoom, makePlayer } from "@test-utils/roomTestUtils";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConnectionDetails } from "./ConnectionDetails";
import { RoomProvider } from "./RoomProvider";

const renderDetails = () => {
  const { wrapper } = createQueryWrapper();
  render(
    <RoomProvider>
      <ConnectionDetails />
    </RoomProvider>,
    { wrapper },
  );
  const summary = screen.getByText("Connection details");
  return { summary, details: summary.parentElement as HTMLElement };
};

// Everything a screen reader treats as a live region.
const liveRegions = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      '[aria-live], [role="status"], [role="alert"], [role="log"]',
    ),
  );

describe("ConnectionDetails", () => {
  it("starts collapsed behind a Connection details summary", () => {
    const { summary, details } = renderDetails();

    expect(summary.tagName).toBe("SUMMARY");
    expect(details.tagName).toBe("DETAILS");
    expect(details).not.toHaveAttribute("open");
  });

  it("holds the Connection card and the API status", async () => {
    const { details } = renderDetails();

    expect(
      within(details).getByRole("region", { name: "Connection" }),
    ).toBeInTheDocument();
    expect(await within(details).findByText("test")).toBeInTheDocument();
    expect(within(details).getByRole("status")).toHaveTextContent("API ok");
  });

  // Closed details hide their contents from screen readers too, and the
  // Live switch only shows the connection visually.
  it("announces connection changes from outside the details", () => {
    const { details } = renderDetails();
    const announcers = liveRegions().filter(
      (region) => region.textContent === "Connecting…",
    );

    // Just one, so an open card doesn't announce each change twice.
    expect(announcers).toHaveLength(1);
    const [announcer] = announcers;
    expect(details).not.toContainElement(announcer);

    joinRoom(makePlayer());
    expect(announcer).toHaveTextContent(/^Connected$/);

    act(() => MockWebSocket.latest().drop());
    expect(announcer).toHaveTextContent(/^Connecting…$/);
  });

  it("opens and closes from the summary", async () => {
    const user = userEvent.setup();
    const { summary, details } = renderDetails();

    await user.click(summary);
    expect(details).toHaveAttribute("open");

    await user.click(summary);
    expect(details).not.toHaveAttribute("open");
  });

  // happy-dom doesn't open a summary on Enter or Space, so opening it from
  // the keyboard is covered in e2e/connection.spec.ts.
  it("puts the summary in the tab order", async () => {
    const user = userEvent.setup();
    const { summary } = renderDetails();

    await user.tab();
    expect(summary).toHaveFocus();
  });
});
