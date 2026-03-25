"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, TriangleAlert } from "lucide-react";

/*
Input: Controlled Pokemon name value + change handler from AddEncounterModal.
Transformation: Watches typed names, queries PokeAPI for sprite metadata, and tracks loading/error states.
Output: Renders an input plus live sprite preview so users can validate each Pokemon before submit.
*/
type PokemonSearchProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPokemonResolved?: (payload: { name: string; abilities: string[] }) => void;
};

type ResolvedPokemonPayload = {
  name: string;
  abilities: string[];
};

type PokeApiPokemon = {
  sprites: {
    front_default: string | null;
  };
  abilities: Array<{
    ability: {
      name: string;
    };
  }>;
};

type PokeApiListResponse = {
  results: Array<{
    name: string;
  }>;
};

let pokemonNameCache: string[] | null = null;
let pokemonNameCachePromise: Promise<string[]> | null = null;

/*
Input: No direct user input; called when autocomplete initializes.
Transformation: Fetches the complete Pokemon name catalog once and stores it in module-level cache.
Output: Returns a cached list to every PokemonSearch instance without repeating network calls.

Performance note: We fetch once up-front so typing filters a local array in-memory. This avoids
making a network request on every keystroke, which reduces latency, API load, and UI jitter.
*/
async function getCachedPokemonNames() {
  if (pokemonNameCache) return pokemonNameCache;
  if (pokemonNameCachePromise) return pokemonNameCachePromise;

  pokemonNameCachePromise = (async () => {
    const response = await fetch("https://pokeapi.co/api/v2/pokemon?limit=2000");
    if (!response.ok) {
      throw new Error("Failed to load Pokemon list.");
    }

    const payload: PokeApiListResponse = await response.json();
    pokemonNameCache = payload.results.map((entry) => entry.name);
    return pokemonNameCache;
  })();

  return pokemonNameCachePromise;
}

/*
Input: A user-typed Pokemon string.
Transformation: Converts the string into a stable, lowercase API slug.
Output: A query-safe Pokemon name used by the PokeAPI fetch effect.
*/
function toPokemonSlug(value: string) {
  return value.trim().toLowerCase();
}

/*
Input: Current text value and selection callback handlers from AddEncounterModal.
Transformation: Provides autocomplete filtering from cached names and resolves selected Pokemon data.
Output: Updates parent form with chosen Pokemon and available abilities, plus sprite preview in-field.
*/
export function PokemonSearch({ label, value, onChange, onPokemonResolved }: PokemonSearchProps) {
  const [allPokemonNames, setAllPokemonNames] = useState<string[]>([]);
  const [isListLoading, setIsListLoading] = useState(false);
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isListOpen, setIsListOpen] = useState(false);
  const lastResolvedSignatureRef = useRef<string>("");

  const pokemonSlug = useMemo(() => toPokemonSlug(value), [value]);
  const filteredPokemonNames = useMemo(() => {
    if (!pokemonSlug) return [];

    return allPokemonNames
      .filter((name) => name.toLowerCase().includes(pokemonSlug))
      .slice(0, 12);
  }, [allPokemonNames, pokemonSlug]);

  /*
  Input: Pokemon name or slug.
  Transformation: Fetches specific Pokemon metadata and extracts sprite + abilities.
  Output: Returns normalized species name, sprite URL, and ability options.
  */
  async function fetchPokemonDetails(name: string, signal?: AbortSignal) {
    const slug = toPokemonSlug(name);
    if (!slug) {
      return null;
    }

    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`, {
      signal,
    });

    if (!response.ok) return null;
    const pokemon: PokeApiPokemon = await response.json();
    const abilities = pokemon.abilities.map((entry) => entry.ability.name);

    return {
      name: slug,
      spriteUrl: pokemon.sprites.front_default,
      abilities,
    };
  }

  /*
  Input: A resolved Pokemon payload intended for the parent form.
  Transformation: Builds a signature and only forwards payloads that are actually new.
  Output: Prevents duplicate parent state updates that can cause referential-equality loops.

  Why this fix exists: React effect dependencies track by reference. If parent callbacks are
  recreated or called with unchanged payloads, effects can retrigger and cause update-depth loops.
  */
  const emitResolvedIfChanged = useCallback(
    (payload: ResolvedPokemonPayload) => {
      const signature = `${payload.name}|${payload.abilities.join(",")}`;
      if (signature === lastResolvedSignatureRef.current) {
        return;
      }

      lastResolvedSignatureRef.current = signature;
      onPokemonResolved?.(payload);
    },
    [onPokemonResolved],
  );

  useEffect(() => {
    let isCancelled = false;

    const loadPokemonNames = async () => {
      try {
        setIsListLoading(true);
        const names = await getCachedPokemonNames();
        if (!isCancelled) {
          setAllPokemonNames(names);
        }
      } catch {
        if (!isCancelled) {
          setAllPokemonNames([]);
        }
      } finally {
        if (!isCancelled) {
          setIsListLoading(false);
        }
      }
    };

    void loadPokemonNames();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pokemonSlug) {
      setSpriteUrl(null);
      setHasError(false);
      setIsDetailLoading(false);
      emitResolvedIfChanged({ name: "", abilities: [] });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        setIsDetailLoading(true);
        setHasError(false);
        const details = await fetchPokemonDetails(pokemonSlug, controller.signal);

        if (!details) {
          if (!controller.signal.aborted) {
            setSpriteUrl(null);
            setHasError(true);
            emitResolvedIfChanged({ name: pokemonSlug, abilities: [] });
          }
          return;
        }

        if (!controller.signal.aborted) {
          setSpriteUrl(details.spriteUrl);
          emitResolvedIfChanged({ name: details.name, abilities: details.abilities });
        }
      } catch {
        if (!controller.signal.aborted) {
          setSpriteUrl(null);
          setHasError(true);
          emitResolvedIfChanged({ name: pokemonSlug, abilities: [] });
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsDetailLoading(false);
        }
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [emitResolvedIfChanged, pokemonSlug]);

  /*
  Input: A selected Pokemon name from the autocomplete list.
  Transformation: Updates the input immediately and resolves details right away for instant feedback.
  Output: Parent form receives normalized name + ability options without waiting for debounce.
  */
  async function handleSelectPokemon(name: string) {
    onChange(name);
    setIsListOpen(false);

    try {
      setIsDetailLoading(true);
      setHasError(false);

      const details = await fetchPokemonDetails(name);
      if (!details) {
        setSpriteUrl(null);
        setHasError(true);
        emitResolvedIfChanged({ name: toPokemonSlug(name), abilities: [] });
        return;
      }

      setSpriteUrl(details.spriteUrl);
      emitResolvedIfChanged({ name: details.name, abilities: details.abilities });
    } catch {
      setSpriteUrl(null);
      setHasError(true);
      emitResolvedIfChanged({ name: toPokemonSlug(name), abilities: [] });
    } finally {
      setIsDetailLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</label>
      <div className="relative">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-slate-950/80 p-2">
          <Search className="h-4 w-4 text-emerald-300" />
          <input
            type="text"
            value={value}
            onFocus={() => setIsListOpen(true)}
            onBlur={() => setTimeout(() => setIsListOpen(false), 140)}
            onChange={(event) => {
              onChange(event.target.value);
              setIsListOpen(true);
            }}
            placeholder="Search Pokemon..."
            className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />

          {isListLoading && <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />}
          {!isListLoading && isDetailLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
          )}
          {!isDetailLoading && hasError && <TriangleAlert className="h-4 w-4 text-amber-400" />}
          {!isDetailLoading && !hasError && spriteUrl && (
            <Image
              src={spriteUrl}
              alt={`${value} sprite`}
              width={40}
              height={40}
              className="h-10 w-10 rounded-md border border-emerald-500/20 bg-slate-900 p-1"
            />
          )}
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </div>

        {isListOpen && filteredPokemonNames.length > 0 && (
          <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-emerald-500/20 bg-slate-900 p-1 shadow-xl">
            {filteredPokemonNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => void handleSelectPokemon(name)}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-emerald-500/15 hover:text-emerald-100"
              >
                {name}
              </button>
            ))}
          </div>
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
