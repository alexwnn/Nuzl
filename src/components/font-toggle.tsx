"use client";

import { Type } from "lucide-react";
import { useSyncExternalStore } from "react";

import { FONT_LABELS, useAppTheme } from "@/components/theme-context";

/*
Input: Font vibe from AppThemeContext.
Transformation: Cycles Modern → Retro → Technical → Elegant on click; mount guard prevents hydration flash.
Output: A compact header button showing the current font label.
*/
export function FontToggle() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { fontVibe, cycleFontVibe } = useAppTheme();

  if (!mounted) return null;

  return (
    <button
      type="button"
      onClick={cycleFontVibe}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground transition hover:bg-muted/60"
      aria-label={`Cycle font (current: ${FONT_LABELS[fontVibe]})`}
      title={`Font: ${FONT_LABELS[fontVibe]} — click to cycle`}
    >
      <Type className="h-4 w-4 text-accent" />
      <span>{FONT_LABELS[fontVibe]}</span>
    </button>
  );
}
