"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useTheme as useNextTheme } from "next-themes";

/*
Input: Persisted font/accent slugs from localStorage + next-themes for mode.
Transformation: Writes `data-font` + `data-accent` onto <html> so the CSS presets in
globals.css swap --app-font and --accent-primary atomically. Theme mode (light/dark)
is owned by next-themes (class="dark" on <html>) and re-exposed here so one hook covers
all three axes.
Output: `{ fontVibe, accentColor, themeMode }` plus setters + 3 cycle helpers for any
component in the tree.
*/

/*
The ordering of FONT_VIBES and ACCENT_COLORS defines the cycle direction when the user
clicks the toggle buttons. Keep Modern / Emerald first so they remain the obvious defaults.
All values here MUST match the [data-font="..."] / [data-accent="..."] selectors in
globals.css — the attribute string is the contract between the provider and CSS.
*/

export const FONT_VIBES = ["modern", "retro", "technical", "elegant"] as const;
export type FontVibe = (typeof FONT_VIBES)[number];

export const ACCENT_COLORS = [
  "ruby",
  "sapphire",
  "emerald",
  "amber",
  "rose",
  "amethyst",
  "slate",
  "gold",
] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];

export type ThemeMode = "light" | "dark";

// Hex values mirror the CSS presets in globals.css and power the colored dot in AccentToggle.
export const ACCENT_HEX: Record<AccentColor, string> = {
  ruby: "#dc2626",
  sapphire: "#2563eb",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  amethyst: "#9333ea",
  slate: "#64748b",
  gold: "#ca8a04",
};

export const FONT_LABELS: Record<FontVibe, string> = {
  modern: "Modern",
  retro: "Retro",
  technical: "Technical",
  elegant: "Elegant",
};

export const ACCENT_LABELS: Record<AccentColor, string> = {
  ruby: "Ruby",
  sapphire: "Sapphire",
  emerald: "Emerald",
  amber: "Amber",
  rose: "Rose",
  amethyst: "Amethyst",
  slate: "Slate",
  gold: "Gold",
};

const STORAGE_KEYS = {
  font: "nuzl.fontVibe",
  accent: "nuzl.accentColor",
} as const;

type AppThemeContextValue = {
  fontVibe: FontVibe;
  accentColor: AccentColor;
  themeMode: ThemeMode;
  setFontVibe: (next: FontVibe) => void;
  setAccentColor: (next: AccentColor) => void;
  setThemeMode: (next: ThemeMode) => void;
  cycleFontVibe: () => void;
  cycleAccentColor: () => void;
  toggleThemeMode: () => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function isFontVibe(value: string | null): value is FontVibe {
  return value !== null && (FONT_VIBES as readonly string[]).includes(value);
}

function isAccentColor(value: string | null): value is AccentColor {
  return value !== null && (ACCENT_COLORS as readonly string[]).includes(value);
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme, setTheme } = useNextTheme();
  const [fontVibe, setFontVibeState] = useState<FontVibe>("modern");
  const [accentColor, setAccentColorState] = useState<AccentColor>("emerald");

  // Hydrate from localStorage on first client mount so SSR defaults don't clobber user choice.
  useEffect(() => {
    try {
      const storedFont = window.localStorage.getItem(STORAGE_KEYS.font);
      const storedAccent = window.localStorage.getItem(STORAGE_KEYS.accent);
      if (isFontVibe(storedFont)) setFontVibeState(storedFont);
      if (isAccentColor(storedAccent)) setAccentColorState(storedAccent);
    } catch {
      // Private mode / disabled storage — stay on defaults.
    }
  }, []);

  // Reflect font + accent into <html data-*> and persist on every change.
  useEffect(() => {
    document.documentElement.setAttribute("data-font", fontVibe);
    try {
      window.localStorage.setItem(STORAGE_KEYS.font, fontVibe);
    } catch {}
  }, [fontVibe]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accentColor);
    try {
      window.localStorage.setItem(STORAGE_KEYS.accent, accentColor);
    } catch {}
  }, [accentColor]);

  const setFontVibe = useCallback((next: FontVibe) => setFontVibeState(next), []);
  const setAccentColor = useCallback((next: AccentColor) => setAccentColorState(next), []);

  const cycleFontVibe = useCallback(() => {
    setFontVibeState((current) => {
      const index = FONT_VIBES.indexOf(current);
      return FONT_VIBES[(index + 1) % FONT_VIBES.length];
    });
  }, []);

  const cycleAccentColor = useCallback(() => {
    setAccentColorState((current) => {
      const index = ACCENT_COLORS.indexOf(current);
      return ACCENT_COLORS[(index + 1) % ACCENT_COLORS.length];
    });
  }, []);

  const themeMode: ThemeMode = resolvedTheme === "light" ? "light" : "dark";
  const setThemeMode = useCallback((next: ThemeMode) => setTheme(next), [setTheme]);
  const toggleThemeMode = useCallback(
    () => setTheme(themeMode === "dark" ? "light" : "dark"),
    [setTheme, themeMode],
  );

  return (
    <AppThemeContext.Provider
      value={{
        fontVibe,
        accentColor,
        themeMode,
        setFontVibe,
        setAccentColor,
        setThemeMode,
        cycleFontVibe,
        cycleAccentColor,
        toggleThemeMode,
      }}
    >
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const ctx = useContext(AppThemeContext);
  if (!ctx) {
    throw new Error("useAppTheme must be used within an AppThemeProvider");
  }
  return ctx;
}
