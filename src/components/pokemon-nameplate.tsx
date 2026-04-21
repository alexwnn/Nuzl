"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatAbilityName } from "@/lib/utils";

/*
Input: Pokemon species name plus optional nickname from encounter rows.
Transformation: Resolves a lowercase PokeAPI slug and fetches the matching front sprite.
Output: Renders a compact HUD nameplate with sprite + text for dashboard team/box displays.
*/
type PokemonNameplateProps = {
  pokemonName: string | null;
  nickname?: string | null;
  ability?: string | null;
};

type PokeApiPokemon = {
  sprites?: {
    front_default?: string | null;
    other?: {
      home?: {
        front_default?: string | null;
      };
      ["official-artwork"]?: {
        front_default?: string | null;
      };
    };
  };
};

/*
Input: Raw species value from Supabase.
Transformation: Trims and lowercases to make the value API-safe.
Output: Stable slug used for sprite fetch requests.
*/
function toSlug(value: string | null) {
  return value?.trim().toLowerCase().replaceAll(" ", "-") ?? "";
}

function toDisplayName(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function PokemonNameplate({ pokemonName, nickname, ability }: PokemonNameplateProps) {
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null);
  const lastSlugRef = useRef<string>("");
  const spriteFrameRef = useRef<HTMLDivElement | null>(null);
  const slug = useMemo(() => toSlug(pokemonName), [pokemonName]);
  const resolvedSpriteUrl = slug ? spriteUrl : null;

  useEffect(() => {
    if (!slug) return;
    if (!lastSlugRef.current) {
      lastSlugRef.current = slug;
      return;
    }

    if (lastSlugRef.current !== slug) {
      const spriteFrame = spriteFrameRef.current;
      if (spriteFrame) {
        spriteFrame.classList.remove("sprite-evolve-flash");
        void spriteFrame.offsetWidth;
        spriteFrame.classList.add("sprite-evolve-flash");
      }
      lastSlugRef.current = slug;
    }
  }, [slug]);

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
          setSpriteUrl(
            pokemon.sprites?.front_default ??
              pokemon.sprites?.other?.home?.front_default ??
              pokemon.sprites?.other?.["official-artwork"]?.front_default ??
              null,
          );
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
    <div className="flex min-h-[118px] w-full max-w-[140px] flex-col items-center text-center">
      {/*
      Flexbox note: `flex-col items-center` keeps the larger sprite and text vertically stacked
      and centered, so names/nicknames stay visually aligned directly under each sprite.
      */}
      <div
        ref={spriteFrameRef}
        className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-md border border-accent/25 bg-slate-100/50 dark:bg-slate-900"
      >
        {resolvedSpriteUrl ? (
          <Image
            src={resolvedSpriteUrl}
            alt={`${pokemonName ?? "Pokemon"} sprite`}
            width={72}
            height={72}
          />
        ) : (
          <span className="text-[10px] text-slate-500">N/A</span>
        )}
      </div>
      <p className="mt-1 w-full truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
        {toDisplayName(pokemonName)}
      </p>
      <p className="w-full truncate text-[11px] text-slate-400">{nickname ? `"${toDisplayName(nickname)}"` : "-"}</p>
      <p className="mt-auto w-full truncate text-[11px] font-semibold text-accent">{formatAbilityName(ability)}</p>
    </div>
  );
}
