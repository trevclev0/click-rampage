import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY, useTheme } from "./useTheme";

const stubSystemTheme = (theme: "light" | "dark") => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: theme === "dark" && query === "(prefers-color-scheme: dark)",
    })),
  );
};

afterEach(() => {
  // Runs before Vitest's own unstub, so restore the real storage first.
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("useTheme", () => {
  it("falls back to the system preference", () => {
    stubSystemTheme("dark");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("prefers a saved choice over the system preference", () => {
    stubSystemTheme("dark");
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("light");
  });

  it("ignores an unknown saved value", () => {
    stubSystemTheme("light");
    localStorage.setItem(THEME_STORAGE_KEY, "neon");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("light");
  });

  it("toggles, saves the choice and updates <html>", () => {
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
});
