"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/*
Input: A persisted vibe slug (if any) from localStorage + child subtree.
Transformation: Writes the active slug onto <html data-vibe="..."> so the CSS presets in
globals.css swap --primary-accent / --primary-font atomically, and mirrors every change
back into localStorage so refreshes keep the user's pick.
Output: `vibe` + `cycleVibe` + `setVibe` via React context for any component in the tree.
*/
export const VIBES = ["modern", "terminal", "classic"] as const;
export type Vibe = (typeof VIBES)[number];

const STORAGE_KEY = "nuzl.vibe";
const DEFAULT_VIBE: Vibe = "modern";

type VibeContextValue = {
  vibe: Vibe;
  setVibe: (next: Vibe) => void;
  cycleVibe: () => void;
};

const VibeContext = createContext<VibeContextValue | null>(null);

function isVibe(value: string | null): value is Vibe {
  return value !== null && (VIBES as readonly string[]).includes(value);
}

export function VibeProvider({ children }: { children: React.ReactNode }) {
  const [vibe, setVibeState] = useState<Vibe>(DEFAULT_VIBE);

  // Hydrate from localStorage on first client mount so SSR defaults don't clobber choice.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isVibe(stored)) {
        setVibeState(stored);
      }
    } catch {
      // localStorage can be disabled (private mode) — fall back to the default vibe.
    }
  }, []);

  // Reflect state into the DOM + storage every time the vibe changes.
  useEffect(() => {
    document.documentElement.setAttribute("data-vibe", vibe);
    try {
      window.localStorage.setItem(STORAGE_KEY, vibe);
    } catch {
      // Ignore storage errors; data-vibe still applies for the current session.
    }
  }, [vibe]);

  const setVibe = useCallback((next: Vibe) => {
    setVibeState(next);
  }, []);

  const cycleVibe = useCallback(() => {
    setVibeState((current) => {
      const index = VIBES.indexOf(current);
      return VIBES[(index + 1) % VIBES.length];
    });
  }, []);

  return (
    <VibeContext.Provider value={{ vibe, setVibe, cycleVibe }}>{children}</VibeContext.Provider>
  );
}

export function useVibe() {
  const ctx = useContext(VibeContext);
  if (!ctx) {
    throw new Error("useVibe must be used within a VibeProvider");
  }
  return ctx;
}
