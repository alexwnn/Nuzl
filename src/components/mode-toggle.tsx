"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useAppTheme } from "@/components/theme-context";

/*
Input: Theme mode from AppThemeContext (thin wrapper over next-themes).
Transformation: Guards rendering until mounted, then toggles between `light` and `dark`.
Output: A header-ready icon button that switches dashboard theme modes.
*/
export function ModeToggle() {
  const { themeMode, toggleThemeMode } = useAppTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) {
    return null;
  }

  const isDark = themeMode === "dark";

  return (
    <button
      type="button"
      onClick={toggleThemeMode}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground transition hover:bg-muted/60"
      aria-label={`Toggle theme (current: ${isDark ? "Dark" : "Light"})`}
      title={`Mode: ${isDark ? "Dark" : "Light"} — click to toggle`}
    >
      {isDark ? <Sun className="h-4 w-4 text-accent" /> : <Moon className="h-4 w-4 text-accent" />}
      <span>{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}
