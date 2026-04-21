"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EncounterRow } from "@/lib/database.types";
import { ALL_TYPES, TYPE_COLORS, getEffectiveness, type PokemonType } from "@/lib/type-chart";

/*
Input: Full encounter list for the active session.
Transformation: Filters down to the live (non-fainted, in-party) team, fetches each Pokemon's types
from PokeAPI once (cached across renders/sessions), computes the dual-type defensive multiplier per
attacking type via `getEffectiveness`, then reduces into a single net team score per attacker
(+1 per resistant/immune Pokemon, -1 per weak Pokemon, 0 for neutral).
Output: 18 colored chips summarizing the team's current defensive coverage.
*/
type TeamAnalysisProps = {
  encounters: EncounterRow[];
};

const pokemonTypesCache = new Map<string, string[]>();

function toSlug(value: string) {
  return value.trim().toLowerCase().replaceAll(" ", "-");
}

async function fetchPokemonTypes(name: string, signal: AbortSignal): Promise<string[]> {
  const slug = toSlug(name);
  if (!slug) return [];

  const cached = pokemonTypesCache.get(slug);
  if (cached) return cached;

  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`, { signal });
  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  const types: string[] =
    payload.types?.map((entry: { type: { name: string } }) => entry.type.name) ?? [];

  pokemonTypesCache.set(slug, types);
  return types;
}

export function TeamAnalysis({ encounters }: TeamAnalysisProps) {
  const partyEncounters = useMemo(
    () => encounters.filter((encounter) => encounter.is_in_party && !encounter.is_fainted).slice(0, 6),
    [encounters],
  );

  const partySignature = useMemo(
    () =>
      partyEncounters
        .flatMap((encounter) => [toSlug(encounter.pokemon_a), toSlug(encounter.pokemon_b)])
        .filter(Boolean)
        .sort()
        .join("|"),
    [partyEncounters],
  );

  const [typesMap, setTypesMap] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    if (!partySignature) {
      setTypesMap({});
      setIsLoading(false);
      return () => controller.abort();
    }

    const slugs = partySignature.split("|");

    const run = async () => {
      try {
        setIsLoading(true);
        const entries = await Promise.all(
          slugs.map(async (slug) => [slug, await fetchPokemonTypes(slug, controller.signal)] as const),
        );
        if (!controller.signal.aborted) {
          setTypesMap(Object.fromEntries(entries));
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void run();
    return () => controller.abort();
  }, [partySignature]);

  const scores = useMemo(() => {
    const base: Record<PokemonType, number> = Object.fromEntries(
      ALL_TYPES.map((type) => [type, 0]),
    ) as Record<PokemonType, number>;

    for (const encounter of partyEncounters) {
      for (const name of [encounter.pokemon_a, encounter.pokemon_b]) {
        const defenderTypes = typesMap[toSlug(name)] ?? [];
        if (defenderTypes.length === 0) continue;

        for (const attacker of ALL_TYPES) {
          const multiplier = getEffectiveness(defenderTypes, attacker);
          if (multiplier > 1) {
            base[attacker] -= 1;
          } else if (multiplier < 1) {
            base[attacker] += 1;
          }
        }
      }
    }

    return base;
  }, [partyEncounters, typesMap]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Team Weaknesses</CardTitle>
        <CardDescription>
          Net defensive score for the Live Team across types.
          {isLoading && partyEncounters.length > 0 ? " Loading types..." : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {partyEncounters.length === 0 ? (
          <div className="grid min-h-[120px] place-items-center rounded-lg border border-dashed border-border bg-muted/40 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Add pairs to the Live Team to see team coverage.
            </p>
          </div>
        ) : (
          /*
          Layout: 18 single-row cells arranged in a responsive 1/2/3-column grid.
          Each row keeps the colored type pill pinned to the left and the net score pinned to the right
          so the numeric column stays vertically aligned across the whole matrix (tabular-nums enforces
          equal glyph widths for the +/- digits).
          */
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_TYPES.map((type) => {
              const score = scores[type];
              const rowTone =
                score < 0
                  ? "border-red-400/50 bg-red-500/10 hover:bg-red-500/15 dark:border-red-400/40"
                  : score > 0
                    ? "border-emerald-400/50 bg-emerald-500/10 hover:bg-emerald-500/15 dark:border-emerald-400/40"
                    : "border-border bg-muted/30 hover:bg-muted/50";

              const scoreTone =
                score < 0
                  ? "text-red-700 dark:text-red-200"
                  : score > 0
                    ? "text-emerald-700 dark:text-emerald-200"
                    : "text-muted-foreground";

              const label = score > 0 ? `+${score}` : `${score}`;

              return (
                <div
                  key={type}
                  className={`group flex items-center justify-between gap-3 rounded-lg border px-2 py-1.5 transition hover:outline hover:outline-1 hover:outline-offset-[-1px] hover:outline-emerald-400/60 ${rowTone}`}
                >
                  <span
                    className="inline-flex min-w-[72px] items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-sm"
                    style={{ backgroundColor: TYPE_COLORS[type as PokemonType] }}
                  >
                    {type}
                  </span>
                  <span
                    className={`font-mono text-sm font-semibold tabular-nums ${scoreTone}`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
