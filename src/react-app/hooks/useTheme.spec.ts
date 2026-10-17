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

/**
 * Stubs localStorage with writes that fail until `recover()`. `store` is
 * the backing map, for simulating another tab's writes.
 */
const stubFlakyStorage = (saved: "light" | "dark" | null) => {
  const store = new Map<string, string>();
  if (saved) store.set(THEME_STORAGE_KEY, saved);
  let failing = true;
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failing) throw new Error("quota exceeded");
      store.set(key, value);
    },
  });
  return {
    store,
    recover: () => {
      failing = false;
    },
  };
};

/** Simulates another tab changing the saved theme. */
const notifyStorageChange = (key: string | null) =>
  window.dispatchEvent(new StorageEvent("storage", { key }));

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

  it("saves and shows a toggle once storage recovers", () => {
    stubSystemTheme("light");
    const { store, recover } = stubFlakyStorage("dark");
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("light");
    expect(store.get(THEME_STORAGE_KEY)).toBe("dark");

    recover();
    act(() => result.current.toggleTheme());

    expect(store.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("lets another tab's newer save win over a failed toggle", () => {
    stubSystemTheme("light");
    const { store } = stubFlakyStorage(null);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");

    act(() => {
      store.set(THEME_STORAGE_KEY, "light");
      notifyStorageChange(THEME_STORAGE_KEY);
    });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("doesn't revive a failed toggle when storage moves back", () => {
    stubSystemTheme("light");
    const { store } = stubFlakyStorage("dark");
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("light");

    // Another tab saves light, then dark again: the value the failed
    // toggle was made over. The newest save still wins.
    for (const saved of ["light", "dark"] as const) {
      act(() => {
        store.set(THEME_STORAGE_KEY, saved);
        notifyStorageChange(THEME_STORAGE_KEY);
      });
    }

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("drops a failed toggle even when both saves land before the events", () => {
    stubSystemTheme("light");
    const { store } = stubFlakyStorage("dark");
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("light");

    // Another tab saves light, then dark, before this tab handles either
    // event, so every read already sees dark: only the events say so.
    store.set(THEME_STORAGE_KEY, "light");
    store.set(THEME_STORAGE_KEY, "dark");
    act(() => {
      notifyStorageChange(THEME_STORAGE_KEY);
      notifyStorageChange(THEME_STORAGE_KEY);
    });

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("follows the OS when cleared elsewhere after a failed toggle", () => {
    stubSystemTheme("light");
    const { store } = stubFlakyStorage("light");
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");

    act(() => {
      store.clear();
      notifyStorageChange(null);
    });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBeUndefined();
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
