"use client";

import { Palette } from "lucide-react";
import { useSyncExternalStore } from "react";

import { ACCENT_HEX, ACCENT_LABELS, useAppTheme } from "@/components/theme-context";

/*
Input: Accent color from AppThemeContext.
Transformation: Cycles Ruby → Sapphire → Emerald → Amber → Rose → Amethyst → Slate → Gold on click;
mount guard prevents hydration flash.
Output: A compact header button showing the current accent label with a colored dot.
*/
export function AccentToggle() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { accentColor, cycleAccentColor } = useAppTheme();

  if (!mounted) return null;

  return (
    <button
      type="button"
      onClick={cycleAccentColor}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground transition hover:bg-muted/60"
      aria-label={`Cycle accent color (current: ${ACCENT_LABELS[accentColor]})`}
      title={`Accent: ${ACCENT_LABELS[accentColor]} — click to cycle`}
    >
      <Palette className="h-4 w-4 text-accent" />
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: ACCENT_HEX[accentColor] }}
        aria-hidden
      />
      <span>{ACCENT_LABELS[accentColor]}</span>
    </button>
  );
}
