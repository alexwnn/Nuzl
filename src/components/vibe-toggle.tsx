"use client";

import { Paintbrush } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useVibe, type Vibe } from "@/components/vibe-provider";

/*
Input: Vibe context from VibeProvider.
Transformation: Guards render until mounted (matches ModeToggle pattern to dodge hydration
mismatches), then cycles Modern → Terminal → Classic on click.
Output: A small header button surfacing the current vibe label + accent-tinted icon.
*/
const LABELS: Record<Vibe, string> = {
  modern: "Modern",
  terminal: "Terminal",
  classic: "Classic",
};

export function VibeToggle() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { vibe, cycleVibe } = useVibe();

  if (!mounted) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={cycleVibe}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground transition hover:bg-muted/60"
      aria-label={`Cycle vibe (current: ${LABELS[vibe]})`}
      title={`Vibe: ${LABELS[vibe]} — click to cycle`}
    >
      <Paintbrush className="h-4 w-4 text-accent" />
      <span>{LABELS[vibe]}</span>
    </button>
  );
}
