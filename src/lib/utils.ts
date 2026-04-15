import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/*
Input: Raw ability string from DB or PokeAPI (often kebab-case, e.g. "quark-drive").
Transformation: Hyphens → spaces, then title-cases each word for display only.
Output: Human-readable label (e.g. "Quark Drive"); "-" when empty.
*/
export function formatAbilityName(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "-";
  return trimmed
    .replaceAll("-", " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}
