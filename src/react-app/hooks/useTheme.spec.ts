import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY, useTheme } from "./useTheme";

/** Stubs matchMedia; the returned setter simulates an OS theme change. */
const stubSystemTheme = (initial: "light" | "dark") => {
  let dark = initial === "dark";
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return dark;
      },
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    })),
  );
  return (theme: "light" | "dark") => {
    dark = theme === "dark";
    for (const listener of listeners) listener();
  };
};

afterEach(() => {
  // Runs before Vitest's own unstub, so restore the real storage first.
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("useTheme", () => {
  it("follows the system preference without pinning <html>", () => {
    stubSystemTheme("dark");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("keeps following the OS while no choice is saved", () => {
    const setSystemTheme = stubSystemTheme("light");
    const { result } = renderHook(() => useTheme());

    act(() => setSystemTheme("dark"));

    expect(result.current.theme).toBe("dark");
  });

  it("prefers a saved choice over the system preference", () => {
    stubSystemTheme("dark");
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("ignores an unknown saved value", () => {
    stubSystemTheme("light");
    localStorage.setItem(THEME_STORAGE_KEY, "neon");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("light");
  });

  it("toggles, saves the choice and pins <html>", () => {
    stubSystemTheme("light");
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggleTheme());

    expect(result.current.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => result.current.toggleTheme());

    expect(result.current.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("picks up a choice saved in another tab", () => {
    stubSystemTheme("light");
    const { result } = renderHook(() => useTheme());

    act(() => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(
        new StorageEvent("storage", { key: THEME_STORAGE_KEY }),
      );
    });

    expect(result.current.theme).toBe("dark");

    // Toggling from here builds on the other tab's choice.
    act(() => result.current.toggleTheme());
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("still toggles when storage is blocked", () => {
    stubSystemTheme("light");
    const blocked = () => {
      throw new Error("blocked");
    };
    const setItem = vi.fn(blocked);
    vi.stubGlobal("localStorage", { getItem: blocked, setItem });

    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());

    expect(setItem).toHaveBeenCalled();
    expect(result.current.theme).toBe("dark");
  });

  it("applies a toggle that fails to save over an older saved choice", () => {
    stubSystemTheme("light");
    vi.stubGlobal("localStorage", {
      getItem: () => "dark",
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");

    act(() => result.current.toggleTheme());

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("follows the OS again when the saved choice is cleared elsewhere", () => {
    stubSystemTheme("light");
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");

    act(() => {
      localStorage.removeItem(THEME_STORAGE_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
