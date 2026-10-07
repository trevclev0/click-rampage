import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

// Keep in sync with public/theme-init.js.
export const THEME_STORAGE_KEY = "cr-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

const systemTheme = (): Theme =>
  window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";

// Re-render when the OS theme changes or another tab saves a choice.
function subscribe(onChange: () => void) {
  const media = window.matchMedia?.(DARK_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) onChange();
  };
  media?.addEventListener?.("change", onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    media?.removeEventListener?.("change", onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme() {
  const stored = useSyncExternalStore(subscribe, readStoredTheme);
  const system = useSyncExternalStore(subscribe, systemTheme);
  // Holds the choice when storage is blocked; setting it also re-renders
  // this tab after a successful save (the storage event only fires in
  // other tabs).
  const [unsaved, setUnsaved] = useState<Theme | null>(null);
  const choice = stored ?? unsaved;
  const theme = choice ?? system;

  // Only an explicit choice pins the theme; without one, the CSS media
  // query keeps following the OS.
  useEffect(() => {
    const root = document.documentElement;
    if (choice) {
      root.dataset.theme = choice;
    } else {
      delete root.dataset.theme;
    }
  }, [choice]);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice still applies for this visit.
    }
    setUnsaved(next);
  }, [theme]);

  return { theme, toggleTheme };
}
