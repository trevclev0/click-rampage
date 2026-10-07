// Applies the saved theme before first paint so a returning player never
// sees a flash of the wrong theme. Loaded as an external file because the
// CSP (public/_headers) blocks inline scripts. Keep the storage key in sync
// with THEME_STORAGE_KEY in src/react-app/hooks/useTheme.ts.
try {
  const theme = localStorage.getItem("cr-theme");
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
  }
} catch {
  // Storage blocked (private mode, disabled cookies): fall back to the OS.
}
