import { MockWebSocket } from "@test-utils/mockWebSocket";
import {
  joinRoom,
  makePlayer,
  receive,
  renderWithRoom,
} from "@test-utils/roomTestUtils";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RenameDialog } from "./RenameDialog";

const you = makePlayer({ name: "Rage" });

const trigger = () => screen.getByRole("button", { name: "Change name" });
const dialog = () =>
  screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
const input = () => screen.getByLabelText("Name");
const save = () => screen.getByRole("button", { name: /^(Save|Saving…)$/ });
const renames = (socket: MockWebSocket) =>
  socket.sent.filter((m) => (m as { type: string }).type === "rename");

async function openDialog() {
  const user = userEvent.setup();
  renderWithRoom(<RenameDialog />);
  const socket = joinRoom(you);
  await user.click(trigger());
  return { user, socket };
}

describe("RenameDialog", () => {
  it("shows your name and only opens once connected", () => {
    renderWithRoom(<RenameDialog />);
    expect(trigger()).toBeDisabled();

    joinRoom(you);

    expect(screen.getByText("Rage")).toBeInTheDocument();
    expect(trigger()).toBeEnabled();
  });

  it("opens a modal prefilled with your name, Save disabled", async () => {
    await openDialog();

    expect(dialog()).toHaveAttribute("open");
    expect(dialog()).toHaveAccessibleName("Change your name");
    expect(input()).toHaveValue("Rage");
    // Selected, so typing replaces the old name.
    expect(input()).toHaveProperty("selectionStart", 0);
    expect(input()).toHaveProperty("selectionEnd", 4);
    expect(screen.getByText("4/20 characters")).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it.each([
    ["empty", "   "],
    ["unchanged after trimming", "  Rage  "],
  ])("keeps Save disabled when the name is %s", async (_, value) => {
    const { user } = await openDialog();

    await user.clear(input());
    if (value) await user.type(input(), value);

    expect(save()).toBeDisabled();
  });

  it("flags names over 20 characters inline", async () => {
    const { user } = await openDialog();

    await user.clear(input());
    await user.type(input(), "x".repeat(21));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Use at most 20 characters.",
    );
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(save()).toBeDisabled();
  });

  it("sends the trimmed name with Enter and closes once confirmed", async () => {
    const { user, socket } = await openDialog();

    await user.clear(input());
    await user.type(input(), "  Click   Queen {Enter}");

    expect(renames(socket)).toEqual([{ type: "rename", name: "Click Queen" }]);
    expect(save()).toHaveTextContent("Saving…");
    expect(dialog()).toHaveAttribute("open");

    receive({ type: "renamed", id: you.id, name: "Click Queen" });

    expect(dialog()).not.toHaveAttribute("open");
    expect(screen.getByText("Click Queen")).toBeInTheDocument();
  });

  it("shows a server rejection inline and keeps the dialog open", async () => {
    const { user } = await openDialog();
    await user.clear(input());
    await user.type(input(), "Nope");
    await user.click(save());

    receive({
      type: "error",
      code: "invalid_name",
      message: "Names must be 1-20 visible characters",
    });

    expect(dialog()).toHaveAttribute("open");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Names must be 1-20 visible characters",
    );
    expect(save()).toHaveTextContent("Save");

    // Editing the name clears the old error.
    await user.type(input(), "!");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores an error that arrived before you saved", async () => {
    const { user } = await openDialog();
    receive({
      type: "error",
      code: "invalid_name",
      message: "an older rejection",
    });

    await user.clear(input());
    await user.type(input(), "Fresh");
    await user.click(save());

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(save()).toHaveTextContent("Saving…");
  });

  it("closes on Cancel without sending", async () => {
    const { user, socket } = await openDialog();
    await user.type(input(), "Other");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(dialog()).not.toHaveAttribute("open");
    expect(renames(socket)).toEqual([]);
  });

  it("stops waiting when the connection drops", async () => {
    const { user } = await openDialog();
    await user.clear(input());
    await user.type(input(), "Lost");
    await user.click(save());
    expect(save()).toHaveTextContent("Saving…");

    act(() => MockWebSocket.latest().drop());

    expect(save()).toHaveTextContent("Save");
    expect(save()).toBeDisabled();
    expect(trigger()).toBeDisabled();
  });
});
