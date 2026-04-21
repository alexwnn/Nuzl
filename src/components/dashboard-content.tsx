"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Heart, Link2, Pencil, Skull, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { AccentToggle } from "@/components/accent-toggle";
import { AddEncounterModal } from "@/components/add-encounter-modal";
import { FontToggle } from "@/components/font-toggle";
import { ModeToggle } from "@/components/mode-toggle";
import { PokemonNameplate } from "@/components/pokemon-nameplate";
import { TeamAnalysis } from "@/components/team-analysis";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAbilityName } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { EncounterRow } from "@/lib/database.types";

/*
Input: Initial encounters loaded server-side on first render.
Transformation: Holds realtime-aware local state, applies insert/update/delete events, and computes UI metrics.
Output: Renders the dashboard sections plus Add Encounter engine with immediate UI updates.
*/
type DashboardContentProps = {
  initialEncounters: EncounterRow[];
};

const PARTY_DROPZONE_ID = "party-dropzone";
const BOX_DROPZONE_ID = "box-dropzone";
const BOX_EMPTY_SLOT_PREFIX = "box-empty-slot-";
const BOX_COLUMNS = 6;

type PokemonIntel = {
  types: string[];
  stats: Array<{ label: string; value: number }>;
  artworkUrl: string | null;
  typeDefenses: Array<{ type: string; multiplier: number }>;
};

type PairIntel = {
  pokemonA: PokemonIntel;
  pokemonB: PokemonIntel;
};

const typeColorMap: Record<string, string> = {
  normal: "bg-zinc-200 text-slate-950 dark:bg-zinc-500/30 dark:text-zinc-200",
  fire: "bg-red-200 text-slate-950 dark:bg-red-500/30 dark:text-red-200",
  water: "bg-blue-200 text-slate-950 dark:bg-blue-500/30 dark:text-blue-200",
  electric: "bg-yellow-200 text-slate-950 dark:bg-yellow-500/30 dark:text-yellow-200",
  grass: "bg-green-200 text-slate-950 dark:bg-green-500/30 dark:text-green-200",
  ice: "bg-cyan-200 text-slate-950 dark:bg-cyan-500/30 dark:text-cyan-200",
  fighting: "bg-orange-200 text-slate-950 dark:bg-orange-500/30 dark:text-orange-200",
  poison: "bg-purple-200 text-slate-950 dark:bg-purple-500/30 dark:text-purple-200",
  ground: "bg-amber-200 text-slate-950 dark:bg-amber-600/30 dark:text-amber-200",
  flying: "bg-sky-200 text-slate-950 dark:bg-sky-500/30 dark:text-sky-200",
  psychic: "bg-pink-200 text-slate-950 dark:bg-pink-500/30 dark:text-pink-200",
  bug: "bg-lime-200 text-slate-950 dark:bg-lime-600/30 dark:text-lime-200",
  rock: "bg-stone-200 text-slate-950 dark:bg-stone-500/30 dark:text-stone-200",
  ghost: "bg-violet-200 text-slate-950 dark:bg-violet-500/30 dark:text-violet-200",
  dragon: "bg-indigo-200 text-slate-950 dark:bg-indigo-500/30 dark:text-indigo-200",
  dark: "bg-slate-300 text-slate-950 dark:bg-slate-600/40 dark:text-slate-200",
  steel: "bg-gray-200 text-slate-950 dark:bg-gray-500/30 dark:text-gray-200",
  fairy: "bg-fuchsia-200 text-slate-950 dark:bg-fuchsia-500/30 dark:text-fuchsia-200",
};

const ALL_ATTACK_TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
];

const typeDefenseCache = new Map<
  string,
  {
    doubleDamageFrom: string[];
    halfDamageFrom: string[];
    noDamageFrom: string[];
  }
>();

function useHasMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function isTypingTarget(element: Element | null) {
  if (!(element instanceof HTMLElement)) return false;
  const tagName = element.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || element.isContentEditable;
}

class SmartKeyboardSensor extends KeyboardSensor {
  static activators: typeof KeyboardSensor.activators = [
    {
      eventName: "onKeyDown" as const,
      handler: (event, options, context) => {
        const element = event.target as HTMLElement;
        if (isTypingTarget(element)) {
          return false;
        }

        const baseActivator = KeyboardSensor.activators[0];
        return baseActivator ? baseActivator.handler(event, options, context) : false;
      },
    },
  ];
}

function getStatBarColor(value: number) {
  if (value < 60) return "bg-orange-500";
  if (value < 90) return "bg-yellow-500";
  if (value < 120) return "bg-lime-400";
  if (value < 145) return "bg-green-500";
  return "bg-sky-400";
}

function formatMultiplier(value: number) {
  if (value === 0) return "0x";
  if (Number.isInteger(value)) return `${value}x`;

  // Preserve quarter steps (0.25, 0.5, 0.75, etc.) without over-rounding to a single decimal.
  const roundedToQuarter = Math.round(value * 4) / 4;
  if (Math.abs(value - roundedToQuarter) < 0.001) {
    return `${roundedToQuarter.toString()}x`;
  }

  const trimmed = Number(value.toFixed(2)).toString();
  return `${trimmed}x`;
}

function getDefenseTone(multiplier: number) {
  if (multiplier === 0) {
    return {
      container:
        "border-slate-700/35 bg-slate-900/10 dark:border-slate-300/35 dark:bg-slate-100/15",
      value: "text-slate-800 dark:text-slate-200",
    };
  }

  if (multiplier < 1) {
    return {
      container: "border-emerald-500/35 bg-emerald-500/10",
      value: "font-semibold text-emerald-700 dark:text-emerald-200",
    };
  }

  if (multiplier > 1) {
    return {
      container:
        "border-red-200 bg-red-100 dark:border-red-500/35 dark:bg-red-500/10",
      value: "font-bold text-red-900 dark:font-semibold dark:text-red-200",
    };
  }

  return {
    container: "border-slate-200/80 bg-white/70 dark:border-slate-700/60 dark:bg-slate-900/60",
    value: "text-slate-300",
  };
}

function toDisplayNameUpper(value: string) {
  return value.replaceAll("-", " ").toUpperCase();
}

async function getTypeDefenseProfile(typeName: string, signal: AbortSignal) {
  if (typeDefenseCache.has(typeName)) {
    return typeDefenseCache.get(typeName)!;
  }

  const response = await fetch(`https://pokeapi.co/api/v2/type/${typeName}`, { signal });
  if (!response.ok) {
    throw new Error(`Unable to fetch type profile for ${typeName}`);
  }

  const payload = await response.json();
  const profile = {
    doubleDamageFrom: payload.damage_relations.double_damage_from.map(
      (entry: { name: string }) => entry.name,
    ),
    halfDamageFrom: payload.damage_relations.half_damage_from.map((entry: { name: string }) => entry.name),
    noDamageFrom: payload.damage_relations.no_damage_from.map((entry: { name: string }) => entry.name),
  };

  typeDefenseCache.set(typeName, profile);
  return profile;
}

/*
Input: Defender typing list from PokeAPI (e.g. ['water', 'flying']).
Transformation: Uses type damage relations from the PokeAPI `/type/{name}` endpoints to multiply
incoming effectiveness for each attacking type across both defender types.
Output: A full attack-type multiplier grid (0x, 0.5x, 1x, 2x, 4x) used by the Intel panel.
*/
async function computeTypeDefenses(defenderTypes: string[], signal: AbortSignal) {
  const profiles = await Promise.all(defenderTypes.map((typeName) => getTypeDefenseProfile(typeName, signal)));

  return ALL_ATTACK_TYPES.map((attackType) => {
    const multiplier = profiles.reduce((current, profile) => {
      if (profile.noDamageFrom.includes(attackType)) return current * 0;
      if (profile.doubleDamageFrom.includes(attackType)) return current * 2;
      if (profile.halfDamageFrom.includes(attackType)) return current * 0.5;
      return current;
    }, 1);

    return { type: attackType, multiplier };
  });
}

type DroppableGridProps = {
  id: string;
  className: string;
  children: React.ReactNode | ((isOver: boolean) => React.ReactNode);
};

function DroppableGrid({ id, className, children }: DroppableGridProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const renderedChildren = typeof children === "function" ? children(isOver) : children;

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? "ring-1 ring-accent ring-offset-2 ring-offset-background" : ""}`}
    >
      {renderedChildren}
    </div>
  );
}

type EncounterCardProps = {
  encounter: EncounterRow;
  actionLabel: "Move to Party" | "Move to Box";
  onAction: () => void;
  onRelease: () => void;
  onToggleFainted: () => void;
  onEncounterUpdated: (encounter: EncounterRow) => void;
  onEvolveSlot: (slot: "a" | "b", nextPokemon: string) => void;
  onSelect: () => void;
  isActionPending: boolean;
  isReleasePending: boolean;
  isFaintingPending: boolean;
  isEvolvingA: boolean;
  isEvolvingB: boolean;
  isSelected: boolean;
  isSwapTarget?: boolean;
};

type EncounterCardBodyProps = {
  encounter: EncounterRow;
  actionLabel: "Move to Party" | "Move to Box";
  onAction: () => void;
  onRelease: () => void;
  onToggleFainted: () => void;
  onEncounterUpdated: (encounter: EncounterRow) => void;
  onEvolveSlot: (slot: "a" | "b", nextPokemon: string) => void;
  isActionPending: boolean;
  isReleasePending: boolean;
  isFaintingPending: boolean;
  isEvolvingA: boolean;
  isEvolvingB: boolean;
  isFainted: boolean;
};

const pokemonSpriteCache = new Map<string, string | null>();
const evolutionOptionsCache = new Map<string, string[]>();

type PokeApiSpritePayload = {
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

type EvolutionChainNode = {
  species: { name: string };
  evolves_to: EvolutionChainNode[];
};

function toPokemonSlug(value: string) {
  return value.trim().toLowerCase().replaceAll(" ", "-");
}

async function fetchPokemonSprite(pokemonName: string, signal?: AbortSignal) {
  const slug = toPokemonSlug(pokemonName);
  if (pokemonSpriteCache.has(slug)) {
    return pokemonSpriteCache.get(slug) ?? null;
  }

  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`, { signal });
  if (!response.ok) {
    pokemonSpriteCache.set(slug, null);
    return null;
  }

  const payload: PokeApiSpritePayload = await response.json();
  const spriteUrl: string | null =
    payload.sprites?.front_default ??
    payload.sprites?.other?.home?.front_default ??
    payload.sprites?.other?.["official-artwork"]?.front_default ??
    null;
  pokemonSpriteCache.set(slug, spriteUrl);
  return spriteUrl;
}

function toDisplayName(value: string) {
  return value
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function findEvolutionNode(node: EvolutionChainNode, pokemonName: string): EvolutionChainNode | null {
  if (node.species.name === pokemonName) {
    return node;
  }

  for (const child of node.evolves_to) {
    const found = findEvolutionNode(child, pokemonName);
    if (found) {
      return found;
    }
  }

  return null;
}

async function fetchEvolutionOptions(pokemonName: string) {
  const slug = toPokemonSlug(pokemonName);
  if (!slug) return [];
  if (evolutionOptionsCache.has(slug)) {
    return evolutionOptionsCache.get(slug) ?? [];
  }

  const speciesResponse = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${slug}`);
  if (!speciesResponse.ok) return [];
  const speciesPayload = await speciesResponse.json();
  const evolutionChainUrl: string | undefined = speciesPayload.evolution_chain?.url;
  if (!evolutionChainUrl) return [];

  const chainResponse = await fetch(evolutionChainUrl);
  if (!chainResponse.ok) return [];
  const chainPayload = await chainResponse.json();
  const rootNode: EvolutionChainNode | undefined = chainPayload.chain;
  if (!rootNode) return [];

  const currentNode = findEvolutionNode(rootNode, slug);
  const options = currentNode ? currentNode.evolves_to.map((node) => node.species.name) : [];
  evolutionOptionsCache.set(slug, options);
  return options;
}

function EncounterCardBody({
  encounter,
  actionLabel,
  onAction,
  onRelease,
  onToggleFainted,
  onEncounterUpdated,
  onEvolveSlot,
  isActionPending,
  isReleasePending,
  isFaintingPending,
  isEvolvingA,
  isEvolvingB,
  isFainted,
}: EncounterCardBodyProps) {
  const [openEvolutionMenu, setOpenEvolutionMenu] = useState<"a" | "b" | null>(null);
  const [evolutionOptionsA, setEvolutionOptionsA] = useState<string[]>([]);
  const [evolutionOptionsB, setEvolutionOptionsB] = useState<string[]>([]);
  const [evolutionLoadingSlot, setEvolutionLoadingSlot] = useState<"a" | "b" | null>(null);
  const [evolutionError, setEvolutionError] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const evolutionAreaRef = useRef<HTMLDivElement | null>(null);
  const noEvolutionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evolutionMenuRef = useRef<HTMLDivElement | null>(null);
  const evolutionButtonARef = useRef<HTMLButtonElement | null>(null);
  const evolutionButtonBRef = useRef<HTMLButtonElement | null>(null);

  const recomputeEvolutionMenuPosition = useCallback(
    (slot: "a" | "b") => {
      if (typeof window === "undefined") return;
      const anchor = slot === "a" ? evolutionButtonARef.current : evolutionButtonBRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const margin = 12;
      const menuWidth = 220;
      const optionsCount = slot === "a" ? evolutionOptionsA.length : evolutionOptionsB.length;
      const estimatedHeight = Math.min(240, 44 + Math.max(optionsCount, 1) * 32);
      const shouldOpenUpward = rect.bottom + estimatedHeight > window.innerHeight - margin;

      const top = shouldOpenUpward
        ? Math.max(margin, rect.top - estimatedHeight - 8)
        : Math.min(window.innerHeight - estimatedHeight - margin, rect.bottom + 8);
      const left = Math.min(
        window.innerWidth - menuWidth - margin,
        Math.max(margin, rect.left + rect.width / 2 - menuWidth / 2),
      );

      setMenuPosition({ top, left });
    },
    [evolutionOptionsA, evolutionOptionsB],
  );

  useEffect(() => {
    if (!openEvolutionMenu) return;

    const handleOutsidePointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const clickedInsideCardArea = evolutionAreaRef.current?.contains(target);
      const clickedInsideMenu = evolutionMenuRef.current?.contains(target);
      if (!clickedInsideCardArea && !clickedInsideMenu) {
        setOpenEvolutionMenu(null);
        setEvolutionError(null);
      }
    };

    document.addEventListener("mousedown", handleOutsidePointer);
    return () => document.removeEventListener("mousedown", handleOutsidePointer);
  }, [openEvolutionMenu]);

  useEffect(() => {
    return () => {
      if (noEvolutionTimeoutRef.current) {
        clearTimeout(noEvolutionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!openEvolutionMenu) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => recomputeEvolutionMenuPosition(openEvolutionMenu);
    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [openEvolutionMenu, recomputeEvolutionMenuPosition]);

  async function handleOpenEvolutionMenu(slot: "a" | "b") {
    const pokemonName = slot === "a" ? encounter.pokemon_a : encounter.pokemon_b;
    setEvolutionError(null);
    setEvolutionLoadingSlot(slot);
    if (noEvolutionTimeoutRef.current) {
      clearTimeout(noEvolutionTimeoutRef.current);
      noEvolutionTimeoutRef.current = null;
    }

    try {
      const options = await fetchEvolutionOptions(pokemonName);
      if (slot === "a") {
        setEvolutionOptionsA(options);
      } else {
        setEvolutionOptionsB(options);
      }
      setOpenEvolutionMenu(slot);
      if (options.length === 0) {
        setEvolutionError("No further evolutions.");
        if (noEvolutionTimeoutRef.current) {
          clearTimeout(noEvolutionTimeoutRef.current);
        }
        noEvolutionTimeoutRef.current = setTimeout(() => {
          setOpenEvolutionMenu(null);
          setEvolutionError(null);
        }, 2000);
      }
    } catch {
      setEvolutionError("Unable to load evolutions.");
      setOpenEvolutionMenu(slot);
    } finally {
      setEvolutionLoadingSlot(null);
    }
  }

  function handleSelectEvolution(slot: "a" | "b", nextPokemon: string) {
    onEvolveSlot(slot, nextPokemon);
    setOpenEvolutionMenu(null);
    setEvolutionError(null);
  }

  return (
    <div className="flex h-full min-h-[260px] flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded-full border border-accent/30 bg-accent/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
          {encounter.location ?? "Unknown"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFainted();
            }}
            disabled={isFaintingPending}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label={isFainted ? "Mark pair as revived" : "Mark pair as fainted"}
          >
            <Skull className={`h-3 w-3 ${isFainted ? "text-red-500" : ""}`} />
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onRelease();
            }}
            disabled={isReleasePending}
            className="inline-flex items-center gap-1 rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-700 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-200 dark:hover:bg-red-500/20"
            aria-label="Release pair"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <AddEncounterModal
            mode="edit"
            sessionId={encounter.session_id}
            encounter={encounter}
            onEncounterUpdated={onEncounterUpdated}
            trigger={
              <span
                className="inline-flex items-center gap-1 rounded-md border border-accent/45 px-2 py-1 text-xs text-accent hover:bg-accent/10"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </span>
            }
          />
        </div>
      </div>

      <div ref={evolutionAreaRef} className="flex flex-1 items-start justify-between gap-2">
        <div className="relative">
          <button
            ref={evolutionButtonARef}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              void handleOpenEvolutionMenu("a");
            }}
            disabled={isEvolvingA || evolutionLoadingSlot === "a"}
            className="absolute -right-2 top-0 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-accent bg-accent text-white shadow-[0_0_10px_-4px_var(--accent-primary)] transition hover:bg-accent/90 disabled:opacity-50"
            aria-label="Evolve Pokemon A"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
          <PokemonNameplate
            pokemonName={encounter.pokemon_a ?? "Unknown"}
            nickname={encounter.nickname_a}
            ability={encounter.ability_a}
          />
        </div>
        <div className="grid place-items-center pt-7 text-slate-500">
          <Link2 className="h-4 w-4" />
        </div>
        <div className="relative">
          <button
            ref={evolutionButtonBRef}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              void handleOpenEvolutionMenu("b");
            }}
            disabled={isEvolvingB || evolutionLoadingSlot === "b"}
            className="absolute -right-2 top-0 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-accent bg-accent text-white shadow-[0_0_10px_-4px_var(--accent-primary)] transition hover:bg-accent/90 disabled:opacity-50"
            aria-label="Evolve Pokemon B"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
          <PokemonNameplate
            pokemonName={encounter.pokemon_b ?? "Unknown"}
            nickname={encounter.nickname_b}
            ability={encounter.ability_b}
          />
        </div>
      </div>
      {openEvolutionMenu &&
        menuPosition &&
        createPortal(
          <div
            ref={evolutionMenuRef}
            style={{ top: menuPosition.top, left: menuPosition.left }}
            className="fixed z-[140] min-w-[220px] rounded-lg border border-border bg-card p-2 text-foreground shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="mb-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Evolve To</p>
            {evolutionError && <p className="text-xs text-muted-foreground">{evolutionError}</p>}
            {(openEvolutionMenu === "a" ? evolutionOptionsA : evolutionOptionsB).map((option) => (
              <button
                key={`evolve-${openEvolutionMenu}-${option}`}
                type="button"
                onClick={() => handleSelectEvolution(openEvolutionMenu, option)}
                className="block w-full rounded px-2 py-1 text-left text-xs text-foreground hover:bg-muted/60"
              >
                {toDisplayName(option)}
              </button>
            ))}
          </div>,
          document.body,
        )}
      {/* `mt-auto` in a `flex-col` container consumes remaining vertical space, pinning this row to the bottom. */}
      <div className="mt-auto pt-2">
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onAction();
          }}
          disabled={isActionPending}
          className="rounded-md border border-accent bg-accent px-2 py-1 text-xs font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isFainted ? "Rest in Peace" : actionLabel}
        </button>
      </div>
    </div>
  );
}

function SortablePartyCard({
  encounter,
  actionLabel,
  onAction,
  onRelease,
  onToggleFainted,
  onEncounterUpdated,
  onEvolveSlot,
  onSelect,
  isActionPending,
  isReleasePending,
  isFaintingPending,
  isEvolvingA,
  isEvolvingB,
  isSelected,
  isSwapTarget = false,
}: EncounterCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: encounter.id,
    data: { inParty: true },
  });
  const mounted = useHasMounted();

  return (
    <div
      ref={setNodeRef}
      {...(mounted ? listeners : {})}
      {...(mounted ? attributes : {})}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={`h-full min-h-[260px] rounded-lg border bg-white/80 transition-colors dark:bg-slate-950/70 ${encounter.is_fainted ? "border-red-300 grayscale dark:border-red-700/60" : "border-accent/40"} ${isSelected ? "ring-2 ring-accent shadow-[0_0_22px_-10px_var(--accent-primary)]" : ""} ${isSwapTarget ? "border-dashed border-accent shadow-[0_0_18px_-8px_var(--accent-primary)]" : ""} ${isDragging ? "cursor-grabbing opacity-50 scale-105" : "cursor-grab"}`}
    >
      <EncounterCardBody
        encounter={encounter}
        actionLabel={actionLabel}
        onAction={onAction}
        onRelease={onRelease}
        onToggleFainted={onToggleFainted}
        onEncounterUpdated={onEncounterUpdated}
        onEvolveSlot={onEvolveSlot}
        isActionPending={isActionPending}
        isReleasePending={isReleasePending}
        isFaintingPending={isFaintingPending}
        isEvolvingA={isEvolvingA}
        isEvolvingB={isEvolvingB}
        isFainted={encounter.is_fainted}
      />
    </div>
  );
}

type SortableBoxMiniCardProps = {
  encounter: EncounterRow;
  onSelect: () => void;
  isSelected: boolean;
  isSwapTarget?: boolean;
};

type BoxMiniCardProps = {
  encounter: EncounterRow;
  spriteA: string | null;
  spriteB: string | null;
  isSelected: boolean;
  isDragging: boolean;
  isSwapTarget?: boolean;
};

type GraveyardMiniCardProps = {
  encounter: EncounterRow;
  onSelect: () => void;
  onRevive: () => void;
  isReviving: boolean;
  isSelected: boolean;
};

function BoxMiniCard({
  encounter,
  spriteA,
  spriteB,
  isSelected,
  isDragging,
  isSwapTarget = false,
}: BoxMiniCardProps) {
  return (
    <div
      className={`h-32 rounded-lg border border-accent/30 bg-white/85 p-2 transition duration-150 hover:scale-[1.02] hover:border-accent/55 dark:bg-slate-950/85 ${isSelected ? "ring-2 ring-accent shadow-[0_0_18px_-10px_var(--accent-primary)]" : ""} ${isSwapTarget ? "border-dashed border-accent shadow-[0_0_18px_-8px_var(--accent-primary)]" : ""} ${isDragging ? "scale-105 opacity-50" : ""}`}
    >
      <div className="mb-2 flex items-center justify-start">
        <span className="block max-w-full truncate rounded-full border border-accent/30 bg-accent/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
          {encounter.location}
        </span>
      </div>
      <div className="flex items-center justify-center gap-2">
        <div className="grid h-14 w-14 place-items-center rounded-md border border-accent/25 bg-white dark:bg-slate-900">
          {spriteA ? (
            <Image src={spriteA} alt={`${encounter.pokemon_a} sprite`} width={52} height={52} />
          ) : (
            <span className="text-[10px] text-slate-500">N/A</span>
          )}
        </div>
        <div className="grid h-14 w-14 place-items-center rounded-md border border-accent/25 bg-white dark:bg-slate-900">
          {spriteB ? (
            <Image src={spriteB} alt={`${encounter.pokemon_b} sprite`} width={52} height={52} />
          ) : (
            <span className="text-[10px] text-slate-500">N/A</span>
          )}
        </div>
      </div>
    </div>
  );
}

function GraveyardMiniCard({ encounter, onSelect, onRevive, isReviving, isSelected }: GraveyardMiniCardProps) {
  const [spriteA, setSpriteA] = useState<string | null>(null);
  const [spriteB, setSpriteB] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadSprites = async () => {
      try {
        const [nextA, nextB] = await Promise.all([
          fetchPokemonSprite(encounter.pokemon_a, controller.signal),
          fetchPokemonSprite(encounter.pokemon_b, controller.signal),
        ]);

        if (!controller.signal.aborted) {
          setSpriteA(nextA);
          setSpriteB(nextB);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    };

    void loadSprites();
    return () => controller.abort();
  }, [encounter.pokemon_a, encounter.pokemon_b]);

  return (
    <div
      onClick={onSelect}
      className={`h-32 cursor-pointer rounded-lg border border-slate-300 bg-slate-100/90 px-2 pb-2 pt-1 grayscale transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900/80 ${isSelected ? "ring-2 ring-red-400" : ""}`}
    >
      <div className="mb-1 flex items-start justify-between">
        <span className="block max-w-[calc(100%-2rem)] truncate rounded-full bg-red-500/15 px-2 py-1 text-[10px] uppercase text-red-700 dark:text-red-300">
          {encounter.location}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRevive();
          }}
          disabled={isReviving}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          aria-label="Revive pair"
        >
          <Heart className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-center gap-2">
        <div className="grid h-14 w-14 place-items-center rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
          {spriteA ? (
            <Image src={spriteA} alt={`${encounter.pokemon_a} sprite`} width={52} height={52} />
          ) : (
            <span className="text-[10px] text-slate-500">N/A</span>
          )}
        </div>
        <div className="grid h-14 w-14 place-items-center rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
          {spriteB ? (
            <Image src={spriteB} alt={`${encounter.pokemon_b} sprite`} width={52} height={52} />
          ) : (
            <span className="text-[10px] text-slate-500">N/A</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SortableBoxMiniCard({
  encounter,
  onSelect,
  isSelected,
  isSwapTarget = false,
}: SortableBoxMiniCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: encounter.id,
    data: { inParty: false },
  });
  const mounted = useHasMounted();
  const [spriteA, setSpriteA] = useState<string | null>(null);
  const [spriteB, setSpriteB] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadSprites = async () => {
      try {
        const [nextA, nextB] = await Promise.all([
          fetchPokemonSprite(encounter.pokemon_a, controller.signal),
          fetchPokemonSprite(encounter.pokemon_b, controller.signal),
        ]);

        if (!controller.signal.aborted) {
          setSpriteA(nextA);
          setSpriteB(nextB);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        throw err;
      }
    };

    void loadSprites();
    return () => controller.abort();
  }, [encounter.pokemon_a, encounter.pokemon_b]);

  return (
    <div
      ref={setNodeRef}
      onClick={onSelect}
      {...(mounted ? listeners : {})}
      {...(mounted ? attributes : {})}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="cursor-grab active:cursor-grabbing"
    >
      <BoxMiniCard
        encounter={encounter}
        spriteA={spriteA}
        spriteB={spriteB}
        isSelected={isSelected}
        isDragging={isDragging}
        isSwapTarget={isSwapTarget}
      />
    </div>
  );
}

function PairDragPreview({ encounter }: { encounter: EncounterRow }) {
  return (
    <div className="w-[280px] rounded-lg border border-accent/60 bg-white/95 p-3 shadow-[0_14px_40px_-10px_var(--accent-primary)] dark:bg-slate-950/95">
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded-full border border-accent/30 bg-accent/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
          {encounter.location ?? "Unknown"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <PokemonNameplate
          pokemonName={encounter.pokemon_a ?? "Unknown"}
          nickname={encounter.nickname_a}
          ability={encounter.ability_a}
        />
        <div className="grid place-items-center pt-6 text-slate-500">
          <Link2 className="h-4 w-4" />
        </div>
        <PokemonNameplate
          pokemonName={encounter.pokemon_b ?? "Unknown"}
          nickname={encounter.nickname_b}
          ability={encounter.ability_b}
        />
      </div>
    </div>
  );
}

function BoxEmptySlot({ index }: { index: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${BOX_EMPTY_SLOT_PREFIX}${index}` });

  return (
    <div
      ref={setNodeRef}
      className={`grid h-32 place-items-center rounded-lg border border-dashed border-accent/25 bg-accent/[0.04] p-4 text-center transition ${isOver ? "border-accent bg-accent/15 shadow-[0_0_16px_-8px_var(--accent-primary)]" : ""}`}
    >
      <p className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">EMPTY SLOT</p>
    </div>
  );
}

/*
Input: Encounter row from Supabase insert callback.
Transformation: Adds new encounter to state while preventing duplicate IDs.
Output: Updated state reflected instantly in stats/team/box cards.
*/
function addEncounterOptimistically(current: EncounterRow[], encounter: EncounterRow) {
  return [encounter, ...current.filter((entry) => entry.id !== encounter.id)];
}

function updateEncounterOptimistically(current: EncounterRow[], encounter: EncounterRow) {
  return current.map((entry) => (entry.id === encounter.id ? encounter : entry));
}

export function DashboardContent({ initialEncounters }: DashboardContentProps) {
  const router = useRouter();
  const params = useParams<{ sessionId?: string }>();
  const rawSessionId = typeof params?.sessionId === "string" ? params.sessionId : null;
  const sessionId = rawSessionId ? decodeURIComponent(rawSessionId) : null;
  const [encounters, setEncounters] = useState<EncounterRow[]>(initialEncounters);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingEncounterIds, setPendingEncounterIds] = useState<string[]>([]);
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [releasingEncounterIds, setReleasingEncounterIds] = useState<string[]>([]);
  const [faintingEncounterIds, setFaintingEncounterIds] = useState<string[]>([]);
  const [evolvingSlots, setEvolvingSlots] = useState<string[]>([]);
  const [pairIntel, setPairIntel] = useState<PairIntel | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [hoveredSwapTargetId, setHoveredSwapTargetId] = useState<string | null>(null);
  const previousSessionIdRef = useRef<string | null>(null);
  const activeSessionDbId = sessionId;
  const currentSessionId = sessionId ?? "No Session";

  const refreshSessionEncounters = useCallback(async () => {
    console.log("Current Session ID from URL:", sessionId);
    if (!sessionId) {
      setEncounters([]);
      setIsSessionLoading(false);
      return;
    }

    setIsSessionLoading(true);
    try {
      const { data, error } = await supabase
        .from("encounters")
        .select(
          "id, session_id, location, pokemon_a, nickname_a, ability_a, pokemon_b, nickname_b, ability_b, status, is_in_party, is_fainted, order_index, created_at",
        )
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false });

      if (error) {
        setActionError(`Failed to refresh session encounters: ${error.message}`);
      } else {
        setEncounters(data ?? []);
      }
    } finally {
      setIsSessionLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (previousSessionIdRef.current && previousSessionIdRef.current !== activeSessionDbId) {
      setEncounters([]);
      setSelectedPairId(null);
      setPairIntel(null);
      setActiveDragId(null);
      setHoveredSwapTargetId(null);
      setActionError(null);
    }
    previousSessionIdRef.current = activeSessionDbId;
  }, [activeSessionDbId]);

  useEffect(() => {
    if (!activeSessionDbId) {
      setRealtimeConnected(false);
      return;
    }

    const channel = supabase
      .channel(`encounters-live-feed-${activeSessionDbId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "encounters",
          filter: `session_id=eq.${activeSessionDbId}`,
        },
        () => {
          void refreshSessionEncounters();
        },
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeSessionDbId, refreshSessionEncounters]);

  useEffect(() => {
    void refreshSessionEncounters();
  }, [refreshSessionEncounters, sessionId]);

  const nonFaintedEncounters = encounters.filter((encounter) => !encounter.is_fainted);
  const fallenEncounters = encounters
    .filter((encounter) => encounter.is_fainted)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const graveyardSlotCount =
    Math.max(BOX_COLUMNS, Math.ceil(Math.max(1, fallenEncounters.length) / BOX_COLUMNS) * BOX_COLUMNS);
  const graveyardSlots = Array.from({ length: graveyardSlotCount }, (_, index) => fallenEncounters[index] ?? null);
  const orderedPartyEncounters = nonFaintedEncounters
    .filter((encounter) => encounter.is_in_party)
    .sort((a, b) => {
      const aIndex = a.order_index ?? Number.MAX_SAFE_INTEGER;
      const bIndex = b.order_index ?? Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.created_at.localeCompare(b.created_at);
    });
  const activeTeam = orderedPartyEncounters.slice(0, 6);
  const partyIds = activeTeam.map((encounter) => encounter.id);
  const partySlots = Array.from({ length: 6 }, (_, index) => activeTeam[index] ?? null);
  const boxedEncounters = nonFaintedEncounters
    .filter((encounter) => !encounter.is_in_party)
    .sort((a, b) => {
      const aIndex = a.order_index ?? Number.MAX_SAFE_INTEGER;
      const bIndex = b.order_index ?? Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.created_at.localeCompare(b.created_at);
    });
  const boxedIds = boxedEncounters.map((encounter) => encounter.id);
  const boxSlotCount = Math.ceil((boxedEncounters.length + BOX_COLUMNS) / BOX_COLUMNS) * BOX_COLUMNS;
  const boxSlots = Array.from({ length: boxSlotCount }, (_, index) => boxedEncounters[index] ?? null);
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const keyboardSensor = useSensor(SmartKeyboardSensor);
  const sensors = useSensors(pointerSensor, keyboardSensor);
  const selectedPair = selectedPairId ? encounters.find((encounter) => encounter.id === selectedPairId) ?? null : null;
  const activeDragEncounter = activeDragId
    ? encounters.find((encounter) => encounter.id === activeDragId) ?? null
    : null;

  useEffect(() => {
    if (!selectedPairId) return;
    const stillExists = encounters.some((encounter) => encounter.id === selectedPairId);
    if (!stillExists) {
      setSelectedPairId(null);
    }
  }, [encounters, selectedPairId]);

  useEffect(() => {
    if (!selectedPair) {
      setPairIntel(null);
      return;
    }

    const controller = new AbortController();
    const fetchPokemonIntel = async (pokemonName: string): Promise<PokemonIntel> => {
      const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonName}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Unable to fetch intel for ${pokemonName}`);
      }

      const payload = await response.json();
      const types = payload.types.map((entry: { type: { name: string } }) => entry.type.name);
      return {
        types,
        stats: payload.stats.map((entry: { base_stat: number; stat: { name: string } }) => ({
          label: entry.stat.name,
          value: entry.base_stat,
        })),
        artworkUrl: payload.sprites.other?.["official-artwork"]?.front_default ?? null,
        typeDefenses: await computeTypeDefenses(types, controller.signal),
      };
    };

    const loadIntel = async () => {
      try {
        setIntelLoading(true);
        const [pokemonA, pokemonB] = await Promise.all([
          fetchPokemonIntel(selectedPair.pokemon_a),
          fetchPokemonIntel(selectedPair.pokemon_b),
        ]);

        if (!controller.signal.aborted) {
          setPairIntel({ pokemonA, pokemonB });
        }
      } catch {
        if (!controller.signal.aborted) {
          setPairIntel(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIntelLoading(false);
        }
      }
    };

    void loadIntel();
    return () => controller.abort();
  }, [selectedPair]);

  function applyEncounterLayoutOptimistically(
    current: EncounterRow[],
    nextPartyIds: string[],
    nextBoxIds: string[],
  ) {
    const partyOrderMap = new Map(nextPartyIds.map((id, index) => [id, index]));
    const boxOrderMap = new Map(nextBoxIds.map((id, index) => [id, index]));

    return current.map((entry) => {
      const nextPartyIndex = partyOrderMap.get(entry.id);
      if (nextPartyIndex !== undefined) {
        return { ...entry, is_in_party: true, order_index: nextPartyIndex };
      }

      const nextBoxIndex = boxOrderMap.get(entry.id);
      if (nextBoxIndex !== undefined) {
        return { ...entry, is_in_party: false, order_index: nextBoxIndex };
      }

      return entry;
    });
  }

  async function persistEncounterLayout(nextPartyIds: string[], nextBoxIds: string[]) {
    if (!activeSessionDbId) return;
    const updates = [
      ...nextPartyIds.map((id, index) =>
        supabase
          .from("encounters")
          .update({ is_in_party: true, order_index: index })
          .eq("id", id)
          .eq("session_id", activeSessionDbId),
      ),
      ...nextBoxIds.map((id, index) =>
        supabase
          .from("encounters")
          .update({ is_in_party: false, order_index: index })
          .eq("id", id)
          .eq("session_id", activeSessionDbId),
      ),
    ];

    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error)?.error;
    if (failed) {
      throw failed;
    }
  }

  async function commitEncounterLayout(nextPartyIds: string[], nextBoxIds: string[]) {
    const impactedIds = [...nextPartyIds, ...nextBoxIds];
    if (impactedIds.length === 0) return;

    const previous = encounters;
    setActionError(null);
    setPendingEncounterIds((current) => [...new Set([...current, ...impactedIds])]);

    // Use optimistic ordering first so dnd-kit animations (arrayMove) feel immediate.
    setEncounters((current) => applyEncounterLayoutOptimistically(current, nextPartyIds, nextBoxIds));

    try {
      await persistEncounterLayout(nextPartyIds, nextBoxIds);
    } catch (error) {
      setEncounters(previous);
      const message = error instanceof Error ? error.message : "Unknown error";
      setActionError(`Failed to update encounter layout: ${message}`);
    } finally {
      setPendingEncounterIds((current) => current.filter((id) => !impactedIds.includes(id)));
    }
  }

  async function moveEncounter(encounterId: string, nextInParty: boolean) {
    if (pendingEncounterIds.includes(encounterId)) return;
    const targetEncounter = encounters.find((entry) => entry.id === encounterId);
    if (!targetEncounter) return;
    if (targetEncounter.is_in_party === nextInParty) return;

    if (nextInParty) {
      if (partyIds.length >= 6) {
        toast.error("Party is full!");
        setActionError("Party is full (6). Move one pair to box first.");
        return;
      }

      const nextPartyIds = [...partyIds, encounterId];
      const nextBoxIds = boxedIds.filter((id) => id !== encounterId);
      await commitEncounterLayout(nextPartyIds, nextBoxIds);
      return;
    }

    const compactedPartyIds = partyIds.filter((id) => id !== encounterId);
    const nextBoxIds = boxedIds.includes(encounterId) ? boxedIds : [...boxedIds, encounterId];
    await commitEncounterLayout(compactedPartyIds, nextBoxIds);
  }

  async function toggleFainted(encounterId: string) {
    if (!activeSessionDbId) return;
    if (faintingEncounterIds.includes(encounterId)) return;
    const target = encounters.find((entry) => entry.id === encounterId);
    if (!target) return;

    const nextFainted = !target.is_fainted;
    const nextOrderIndex = nextFainted ? null : boxedIds.length;
    const updatePayload = {
      is_fainted: nextFainted,
      is_in_party: false,
      order_index: nextOrderIndex,
    };

    setFaintingEncounterIds((current) => [...current, encounterId]);
    setActionError(null);

    const previous = encounters;
    setEncounters((current) =>
      current.map((entry) => (entry.id === encounterId ? { ...entry, ...updatePayload } : entry)),
    );

    const { error } = await supabase
      .from("encounters")
      .update(updatePayload)
      .eq("id", encounterId)
      .eq("session_id", activeSessionDbId);
    if (error) {
      setEncounters(previous);
      setActionError(`Failed to update fainted status: ${error.message}`);
    }

    setFaintingEncounterIds((current) => current.filter((id) => id !== encounterId));
  }

  async function evolveEncounterSlot(encounterId: string, slot: "a" | "b", nextPokemon: string) {
    if (!activeSessionDbId) return;
    const pendingKey = `${encounterId}:${slot}`;
    if (evolvingSlots.includes(pendingKey)) return;

    const normalizedPokemon = toPokemonSlug(nextPokemon);
    if (!normalizedPokemon) return;

    const updatePayload =
      slot === "a" ? { pokemon_a: normalizedPokemon } : { pokemon_b: normalizedPokemon };

    setEvolvingSlots((current) => [...current, pendingKey]);
    setActionError(null);

    const previous = encounters;
    setEncounters((current) =>
      current.map((entry) => (entry.id === encounterId ? { ...entry, ...updatePayload } : entry)),
    );

    const { error } = await supabase
      .from("encounters")
      .update(updatePayload)
      .eq("id", encounterId)
      .eq("session_id", activeSessionDbId);
    if (error) {
      setEncounters(previous);
      setActionError(`Failed to evolve Pokemon: ${error.message}`);
    }

    setEvolvingSlots((current) => current.filter((key) => key !== pendingKey));
  }

  async function releaseEncounter(encounterId: string) {
    if (!activeSessionDbId) return;
    if (releasingEncounterIds.includes(encounterId)) return;
    const confirmed = window.confirm("Are you sure you want to release this pair?");
    if (!confirmed) return;

    setReleasingEncounterIds((current) => [...current, encounterId]);
    setActionError(null);

    const previous = encounters;
    setEncounters((current) => current.filter((entry) => entry.id !== encounterId));

    const { error } = await supabase
      .from("encounters")
      .delete()
      .eq("id", encounterId)
      .eq("session_id", activeSessionDbId);
    if (error) {
      setEncounters(previous);
      setActionError(`Failed to release pair: ${error.message}`);
    }

    setReleasingEncounterIds((current) => current.filter((id) => id !== encounterId));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
    setHoveredSwapTargetId(null);
  }

  function handleDragOver(event: DragOverEvent) {
    if (!event.over) {
      setHoveredSwapTargetId(null);
      return;
    }

    const overId = String(event.over.id);
    if (
      overId === PARTY_DROPZONE_ID ||
      overId === BOX_DROPZONE_ID ||
      overId.startsWith(BOX_EMPTY_SLOT_PREFIX)
    ) {
      setHoveredSwapTargetId(null);
      return;
    }

    setHoveredSwapTargetId(overId);
  }

  function handleDragCancel() {
    setActiveDragId(null);
    setHoveredSwapTargetId(null);
  }

  async function handleCopyLink() {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Session link copied.");
    } catch {
      toast.error("Failed to copy session link.");
    }
  }

  function handleExitSession() {
    setEncounters([]);
    setSelectedPairId(null);
    setPairIntel(null);
    setActiveDragId(null);
    setHoveredSwapTargetId(null);
    setActionError(null);
    router.push("/");
  }

  /*
  Input: dnd-kit drag end event containing active card id and target dropzone/card id.
  Transformation: Handles party reordering, box reordering, party<->box moves, and cross-swaps.
  Output: Persists both `is_in_party` and `order_index` so custom layout survives refreshes.
  */
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) {
      setActiveDragId(null);
      setHoveredSwapTargetId(null);
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);

    try {
      const activeIsParty = partyIds.includes(activeId);
      const overIsParty = overId === PARTY_DROPZONE_ID || partyIds.includes(overId);
      const overIsBox =
        overId === BOX_DROPZONE_ID || boxedIds.includes(overId) || overId.startsWith(BOX_EMPTY_SLOT_PREFIX);

      if (activeIsParty && overIsParty) {
        if (overId === PARTY_DROPZONE_ID) return;

        const oldIndex = partyIds.indexOf(activeId);
        const newIndex = partyIds.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

        const reorderedPartyIds = arrayMove(partyIds, oldIndex, newIndex);
        await commitEncounterLayout(reorderedPartyIds, boxedIds);
        return;
      }

      if (activeIsParty && overIsBox) {
        const compactedPartyIds = partyIds.filter((id) => id !== activeId);
        const overBoxIndex = boxedIds.indexOf(overId);
        const overEmptySlotIndex = overId.startsWith(BOX_EMPTY_SLOT_PREFIX)
          ? Number(overId.replace(BOX_EMPTY_SLOT_PREFIX, ""))
          : Number.NaN;
        const insertAt =
          overBoxIndex >= 0
            ? overBoxIndex
            : Number.isNaN(overEmptySlotIndex)
              ? boxedIds.length
              : Math.min(overEmptySlotIndex, boxedIds.length);
        const nextBoxIds = [...boxedIds];
        nextBoxIds.splice(insertAt, 0, activeId);
        await commitEncounterLayout(compactedPartyIds, nextBoxIds);
        return;
      }

      if (!activeIsParty && overIsParty) {
        if (partyIds.includes(overId)) {
          const targetIndex = partyIds.indexOf(overId);
          if (targetIndex < 0) return;

          const nextPartyIds = [...partyIds];
          nextPartyIds[targetIndex] = activeId;

          // Dual mutation: dragged box pair enters party slot, replaced party pair is inserted back into box.
          const nextBoxIds = boxedIds.filter((id) => id !== activeId);
          nextBoxIds.splice(targetIndex, 0, overId);
          await commitEncounterLayout(nextPartyIds, nextBoxIds);
          return;
        }

        if (partyIds.length >= 6) {
          toast.error("Party is full!");
          setActionError("Party is full (6). Move one pair to box first.");
          return;
        }

        const nextPartyIds = [...partyIds, activeId];
        const nextBoxIds = boxedIds.filter((id) => id !== activeId);
        await commitEncounterLayout(nextPartyIds, nextBoxIds);
        return;
      }

      if (!activeIsParty && overIsBox) {
        const oldIndex = boxedIds.indexOf(activeId);
        if (oldIndex < 0) return;

        let nextIndex = boxedIds.indexOf(overId);
        if (overId.startsWith(BOX_EMPTY_SLOT_PREFIX)) {
          const slotIndex = Number(overId.replace(BOX_EMPTY_SLOT_PREFIX, ""));
          if (!Number.isNaN(slotIndex)) {
            nextIndex = Math.min(slotIndex, boxedIds.length - 1);
          }
        }

        if (nextIndex < 0 || oldIndex === nextIndex) return;
        const reorderedBoxIds = arrayMove(boxedIds, oldIndex, nextIndex);
        await commitEncounterLayout(partyIds, reorderedBoxIds);
      }
    } finally {
      setActiveDragId(null);
      setHoveredSwapTargetId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors">
      <header className="sticky top-0 z-[60] border-b border-border bg-background">
        {/*
        Three-column grid so the Center section stays perfectly centered in the
        viewport regardless of how wide the Left/Right clusters grow.
        */}
        <div className="mx-auto grid h-[60px] w-full max-w-screen-2xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 md:px-6 xl:px-8">
          {/* Left Section: Nuzl brand + session identity + connection actions */}
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold tracking-wide text-foreground">Nuzl</p>
            <span className="hidden text-[10px] text-foreground/70 md:inline">
              {isSessionLoading ? "Loading..." : realtimeConnected ? "Connected" : "Disconnected"}
            </span>
            <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent">
              {currentSessionId}
            </span>
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="rounded-md border border-border bg-card px-2 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-foreground/80 hover:bg-muted/60"
            >
              Copy Link
            </button>
            <button
              type="button"
              onClick={handleExitSession}
              className="rounded-md border border-border bg-card px-2 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-foreground/80 hover:bg-muted/60"
            >
              Exit
            </button>
          </div>

          {/* Center Section: Add Encounter trigger, perfectly centered by 1fr_auto_1fr grid */}
          <div className="flex items-center justify-center">
            <AddEncounterModal
              sessionId={activeSessionDbId ?? ""}
              onEncounterAdded={(encounter) =>
                setEncounters((current) => addEncounterOptimistically(current, encounter))
              }
            />
          </div>

          {/* Right Section: Theme controls (font + accent + mode) */}
          <div className="flex items-center justify-end gap-2">
            <span className="hidden text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:inline">
              Change Theme:
            </span>
            <FontToggle />
            <AccentToggle />
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-2xl px-4 pb-6 pt-6 md:px-6 xl:px-8">
          <DndContext
            sensors={sensors}
            collisionDetection={rectIntersection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
          >
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className="space-y-4 xl:col-span-7">
                <Card>
                <CardHeader className="flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">Live Team</CardTitle>
                  </div>
                  <Users className="h-5 w-5 text-accent" />
                </CardHeader>
                <CardContent>
                  <DroppableGrid
                    id={PARTY_DROPZONE_ID}
                    className="grid min-h-[400px] gap-3 rounded-xl md:grid-cols-2"
                  >
                    {(isOver) => (
                      <SortableContext items={partyIds} strategy={rectSortingStrategy}>
                        {partySlots.map((encounter, index) =>
                          encounter ? (
                            <SortablePartyCard
                              key={encounter.id}
                              encounter={encounter}
                              actionLabel={encounter.is_fainted ? "Move to Box" : "Move to Box"}
                              onAction={() => void moveEncounter(encounter.id, false)}
                              onRelease={() => void releaseEncounter(encounter.id)}
                              onToggleFainted={() => void toggleFainted(encounter.id)}
                              onEncounterUpdated={(updated) =>
                                setEncounters((current) => updateEncounterOptimistically(current, updated))
                              }
                              onEvolveSlot={(slot, nextPokemon) =>
                                void evolveEncounterSlot(encounter.id, slot, nextPokemon)
                              }
                              onSelect={() => setSelectedPairId(encounter.id)}
                              isActionPending={pendingEncounterIds.includes(encounter.id)}
                              isReleasePending={releasingEncounterIds.includes(encounter.id)}
                              isFaintingPending={faintingEncounterIds.includes(encounter.id)}
                              isEvolvingA={evolvingSlots.includes(`${encounter.id}:a`)}
                              isEvolvingB={evolvingSlots.includes(`${encounter.id}:b`)}
                              isSelected={selectedPairId === encounter.id}
                              isSwapTarget={hoveredSwapTargetId === encounter.id && activeDragId !== encounter.id}
                            />
                          ) : (
                            <div
                              key={`party-empty-slot-${index}`}
                              className={`grid h-full min-h-[260px] place-items-center rounded-lg border border-dashed border-border bg-muted/50 p-4 text-center transition ${isOver ? "border-accent bg-accent/10 shadow-[0_0_18px_-10px_var(--accent-primary)]" : ""}`}
                            >
                              <p className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                                EMPTY SLOT
                              </p>
                            </div>
                          ),
                        )}
                      </SortableContext>
                    )}
                  </DroppableGrid>
                </CardContent>
              </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl">PC</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DroppableGrid
                      id={BOX_DROPZONE_ID}
                      className="grid min-h-[300px] grid-cols-2 gap-2 rounded-xl md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6"
                    >
                      <SortableContext items={boxedIds} strategy={rectSortingStrategy}>
                        {boxSlots.map((encounter, index) =>
                          encounter ? (
                            <SortableBoxMiniCard
                              key={`pc-${encounter.id}`}
                              encounter={encounter}
                              onSelect={() => setSelectedPairId(encounter.id)}
                              isSelected={selectedPairId === encounter.id}
                              isSwapTarget={hoveredSwapTargetId === encounter.id && activeDragId !== encounter.id}
                            />
                          ) : (
                            <BoxEmptySlot key={`box-empty-slot-${index}`} index={index} />
                          ),
                        )}
                      </SortableContext>
                    </DroppableGrid>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl">Graveyard</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid min-h-[160px] grid-cols-2 gap-2 rounded-xl bg-slate-100/60 p-2 dark:bg-slate-900/40 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                      {graveyardSlots.map((encounter, index) =>
                        encounter ? (
                          <GraveyardMiniCard
                            key={`grave-${encounter.id}`}
                            encounter={encounter}
                            onSelect={() => setSelectedPairId(encounter.id)}
                            onRevive={() => void toggleFainted(encounter.id)}
                            isReviving={faintingEncounterIds.includes(encounter.id)}
                            isSelected={selectedPairId === encounter.id}
                          />
                        ) : (
                          <div
                            key={`grave-empty-slot-${index}`}
                            className="grid h-32 place-items-center rounded-lg border border-dashed border-accent/20 bg-accent/[0.04] p-4 text-center"
                          >
                            <p className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                              EMPTY SLOT
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="xl:col-span-5 xl:sticky xl:top-20 xl:h-[calc(100vh-96px)] xl:overflow-y-auto bg-card shadow-sm">
                <CardHeader>
                  <CardTitle className="text-2xl">Info</CardTitle>
                  <CardDescription>Types and base stats for the selected pair.</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Conditional render: show empty state until a user selects an encounter card. */}
                  {!selectedPair && (
                    <div className="grid min-h-[260px] place-items-center rounded-lg border border-dashed border-border bg-muted/50 p-4 text-center">
                      <p className="text-sm text-slate-400">Select a pair to view intel.</p>
                    </div>
                  )}
                  {selectedPair && (
                    <div className="space-y-4">
                      {intelLoading && <p className="text-sm text-slate-400">Loading intel...</p>}
                      {!intelLoading && pairIntel && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-sm">
                              <div className="grid place-items-center rounded-lg border border-slate-200 bg-slate-100/50 p-2 dark:border-slate-700 dark:bg-slate-900/60">
                                {pairIntel.pokemonA.artworkUrl ? (
                                  <Image
                                    src={pairIntel.pokemonA.artworkUrl}
                                    alt={`${selectedPair.pokemon_a} artwork`}
                                    width={170}
                                    height={170}
                                    className="h-36 w-36 object-contain"
                                  />
                                ) : (
                                  <p className="text-xs text-slate-500">No artwork</p>
                                )}
                              </div>
                              <p className="text-xs font-semibold tracking-[0.16em] text-slate-900 dark:text-slate-50">
                                {toDisplayNameUpper(selectedPair.pokemon_a)}
                              </p>
                              <div className="space-y-1 border-t border-border/80 pt-2">
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Nickname: {selectedPair.nickname_a?.trim() ? selectedPair.nickname_a : "-"}
                                </p>
                                <p className="text-xs font-semibold text-accent">
                                  Ability: {formatAbilityName(selectedPair.ability_a)}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {pairIntel.pokemonA.types.map((type) => (
                                  <span
                                    key={`a-${type}`}
                                    className={`rounded-full px-2 py-1 text-[10px] uppercase ${typeColorMap[type] ?? "bg-slate-700/30 text-slate-200"}`}
                                  >
                                    {type}
                                  </span>
                                ))}
                              </div>
                              <div className="space-y-2 pt-1">
                                {pairIntel.pokemonA.stats.map((stat) => (
                                  <div key={`a-stat-${stat.label}`}>
                                    <div className="mb-1 flex items-center justify-between text-[11px] uppercase text-slate-400">
                                      <span>{stat.label.replaceAll("-", " ")}</span>
                                      <span>{stat.value}</span>
                                    </div>
                                    <div className="h-3 rounded bg-slate-200 dark:bg-slate-800">
                                      <div
                                        className={`h-full rounded ${getStatBarColor(stat.value)}`}
                                        style={{ width: `${Math.min(100, (stat.value / 180) * 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-sm">
                              <div className="grid place-items-center rounded-lg border border-slate-200 bg-slate-100/50 p-2 dark:border-slate-700 dark:bg-slate-900/60">
                                {pairIntel.pokemonB.artworkUrl ? (
                                  <Image
                                    src={pairIntel.pokemonB.artworkUrl}
                                    alt={`${selectedPair.pokemon_b} artwork`}
                                    width={170}
                                    height={170}
                                    className="h-36 w-36 object-contain"
                                  />
                                ) : (
                                  <p className="text-xs text-slate-500">No artwork</p>
                                )}
                              </div>
                              <p className="text-xs font-semibold tracking-[0.16em] text-slate-900 dark:text-slate-50">
                                {toDisplayNameUpper(selectedPair.pokemon_b)}
                              </p>
                              <div className="space-y-1 border-t border-border/80 pt-2">
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Nickname: {selectedPair.nickname_b?.trim() ? selectedPair.nickname_b : "-"}
                                </p>
                                <p className="text-xs font-semibold text-accent">
                                  Ability: {formatAbilityName(selectedPair.ability_b)}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {pairIntel.pokemonB.types.map((type) => (
                                  <span
                                    key={`b-${type}`}
                                    className={`rounded-full px-2 py-1 text-[10px] uppercase ${typeColorMap[type] ?? "bg-slate-700/30 text-slate-200"}`}
                                  >
                                    {type}
                                  </span>
                                ))}
                              </div>
                              <div className="space-y-2 pt-1">
                                {pairIntel.pokemonB.stats.map((stat) => (
                                  <div key={`b-stat-${stat.label}`}>
                                    <div className="mb-1 flex items-center justify-between text-[11px] uppercase text-slate-400">
                                      <span>{stat.label.replaceAll("-", " ")}</span>
                                      <span>{stat.value}</span>
                                    </div>
                                    <div className="h-3 rounded bg-slate-200 dark:bg-slate-800">
                                      <div
                                        className={`h-full rounded ${getStatBarColor(stat.value)}`}
                                        style={{ width: `${Math.min(100, (stat.value / 180) * 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Type Defenses</p>
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                              <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                                  {toDisplayNameUpper(selectedPair.pokemon_a)}
                                </p>
                                <div className="grid grid-cols-4 gap-2">
                                  {pairIntel.pokemonA.typeDefenses.map((defense) => (
                                    <div
                                      key={`a-defense-${defense.type}`}
                                      className={`rounded-md border p-2 text-center ${getDefenseTone(defense.multiplier).container}`}
                                    >
                                      <p
                                        className={`rounded px-1 py-0.5 text-[10px] uppercase ${typeColorMap[defense.type] ?? "bg-slate-700/30 text-slate-200"}`}
                                      >
                                        {defense.type.slice(0, 3)}
                                      </p>
                                      <p
                                        className={`mt-1 text-[11px] font-semibold ${getDefenseTone(defense.multiplier).value}`}
                                      >
                                        {formatMultiplier(defense.multiplier)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                                  {toDisplayNameUpper(selectedPair.pokemon_b)}
                                </p>
                                <div className="grid grid-cols-4 gap-2">
                                  {pairIntel.pokemonB.typeDefenses.map((defense) => (
                                    <div
                                      key={`b-defense-${defense.type}`}
                                      className={`rounded-md border p-2 text-center ${getDefenseTone(defense.multiplier).container}`}
                                    >
                                      <p
                                        className={`rounded px-1 py-0.5 text-[10px] uppercase ${typeColorMap[defense.type] ?? "bg-slate-700/30 text-slate-200"}`}
                                      >
                                        {defense.type.slice(0, 3)}
                                      </p>
                                      <p
                                        className={`mt-1 text-[11px] font-semibold ${getDefenseTone(defense.multiplier).value}`}
                                      >
                                        {formatMultiplier(defense.multiplier)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
            <DragOverlay>
              {activeDragEncounter ? (
                <div className="z-[120] pointer-events-none">
                  <PairDragPreview encounter={activeDragEncounter} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          {actionError && (
            <p className="mt-3 text-xs text-amber-300">{actionError}</p>
          )}
          <section className="mt-6">
            <TeamAnalysis encounters={encounters} />
          </section>
      </main>
    </div>
  );
}
