"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, TriangleAlert } from "lucide-react";

/*
Input: Controlled Pokemon name value + change handler from AddEncounterModal.
Transformation: Watches typed names, queries PokeAPI for sprite metadata, and tracks loading/error states.
Output: Renders an input plus live sprite preview so users can validate each Pokemon before submit.
*/
type PokemonSearchProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

type PokeApiPokemon = {
  sprites: {
    front_default: string | null;
  };
};

/*
Input: A user-typed Pokemon string.
Transformation: Converts the string into a stable, lowercase API slug.
Output: A query-safe Pokemon name used by the PokeAPI fetch effect.
*/
function toPokemonSlug(value: string) {
  return value.trim().toLowerCase();
}

export function PokemonSearch({ label, value, onChange }: PokemonSearchProps) {
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const pokemonSlug = useMemo(() => toPokemonSlug(value), [value]);

  useEffect(() => {
    if (!pokemonSlug) {
      setSpriteUrl(null);
      setHasError(false);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        setIsLoading(true);
        setHasError(false);

        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonSlug}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          setSpriteUrl(null);
          setHasError(true);
          return;
        }

        const pokemon: PokeApiPokemon = await response.json();
        setSpriteUrl(pokemon.sprites.front_default);
      } catch {
        if (!controller.signal.aborted) {
          setSpriteUrl(null);
          setHasError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 280);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [pokemonSlug]);

  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</label>
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-slate-950/80 p-2">
        <Search className="h-4 w-4 text-emerald-300" />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type Pokemon name..."
          className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />

        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />}
        {!isLoading && hasError && <TriangleAlert className="h-4 w-4 text-amber-400" />}
        {!isLoading && !hasError && spriteUrl && (
          <Image
            src={spriteUrl}
            alt={`${value} sprite`}
            width={40}
            height={40}
            className="h-10 w-10 rounded-md border border-emerald-500/20 bg-slate-900 p-1"
          />
        )}
      </div>
      {hasError && (
        <p className="text-xs text-amber-300">
          Pokemon not found. Check spelling (e.g. `mr-mime`, `farfetchd`).
        </p>
      )}
    </div>
  );
}
