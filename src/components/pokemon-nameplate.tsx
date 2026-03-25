"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

/*
Input: Pokemon species name plus optional nickname from encounter rows.
Transformation: Resolves a lowercase PokeAPI slug and fetches the matching front sprite.
Output: Renders a compact HUD nameplate with sprite + text for dashboard team/box displays.
*/
type PokemonNameplateProps = {
  pokemonName: string | null;
  nickname?: string | null;
};

type PokeApiPokemon = {
  sprites: {
    front_default: string | null;
  };
};

/*
Input: Raw species value from Supabase.
Transformation: Trims and lowercases to make the value API-safe.
Output: Stable slug used for sprite fetch requests.
*/
function toSlug(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function PokemonNameplate({ pokemonName, nickname }: PokemonNameplateProps) {
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null);
  const slug = useMemo(() => toSlug(pokemonName), [pokemonName]);
  const resolvedSpriteUrl = slug ? spriteUrl : null;

  useEffect(() => {
    if (!slug) {
      return;
    }

    const controller = new AbortController();

    const loadSprite = async () => {
      try {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          setSpriteUrl(null);
          return;
        }

        const pokemon: PokeApiPokemon = await response.json();
        if (!controller.signal.aborted) {
          setSpriteUrl(pokemon.sprites.front_default);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSpriteUrl(null);
        }
      }
    };

    void loadSprite();
    return () => controller.abort();
  }, [slug]);

  return (
    <div className="flex items-center gap-2">
      <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-md border border-emerald-500/20 bg-slate-900">
        {resolvedSpriteUrl ? (
          <Image
            src={resolvedSpriteUrl}
            alt={`${pokemonName ?? "Pokemon"} sprite`}
            width={30}
            height={30}
          />
        ) : (
          <span className="text-[10px] text-slate-500">N/A</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-100">{pokemonName ?? "Unknown"}</p>
        {nickname && <p className="truncate text-xs text-emerald-300">{`"${nickname}"`}</p>}
      </div>
    </div>
  );
}
