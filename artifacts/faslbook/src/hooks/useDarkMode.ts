/**
 * useDarkMode
 * Persists dark/light preference to localStorage and syncs the `dark`
 * class on <html> so Tailwind `dark:` variants activate app-wide.
 */
import { useEffect, useState } from "react";

const KEY = "faslbook_dark_mode";

function getInitial(): boolean {
  const stored = localStorage.getItem(KEY);
  if (stored !== null) return stored === "1";
  // Fallback: respect OS preference on first visit
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function applyClass(dark: boolean) {
  if (dark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    const v = getInitial();
    applyClass(v);
    return v;
  });

  useEffect(() => {
    applyClass(dark);
    localStorage.setItem(KEY, dark ? "1" : "0");
  }, [dark]);

  const toggle = () => setDark((d) => !d);

  return { dark, toggle, setDark };
}
