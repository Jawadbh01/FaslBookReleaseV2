/**
 * useDarkMode — Zustand singleton so ANY component that calls this
 * hook re-renders reactively when dark mode is toggled from any screen.
 * Persists to localStorage and syncs the `dark` class on <html>.
 */
import { create } from "zustand";

const KEY = "faslbook_dark_mode";

function readPref(): boolean {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored !== null) return stored === "1";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  } catch { return false; }
}

function applyClass(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

interface DarkStore {
  dark: boolean;
  toggle: () => void;
}

const _store = create<DarkStore>((set) => {
  const initial = readPref();
  applyClass(initial);
  return {
    dark: initial,
    toggle: () =>
      set((s) => {
        const next = !s.dark;
        try { localStorage.setItem(KEY, next ? "1" : "0"); } catch {}
        applyClass(next);
        return { dark: next };
      }),
  };
});

export function useDarkMode() {
  return _store();
}
