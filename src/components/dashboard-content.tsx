"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Link2, Shield, Trash2, Trophy, Users } from "lucide-react";
import { toast } from "sonner";

import { AddEncounterModal } from "@/components/add-encounter-modal";
import { CollapsibleSidebar } from "@/components/collapsible-sidebar";
import { PokemonNameplate } from "@/components/pokemon-nameplate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import type { EncounterRow, SessionRow } from "@/lib/database.types";

/*
Input: Initial encounters/sessions loaded server-side on first render.
Transformation: Holds realtime-aware local state, applies insert/update/delete events, and computes UI metrics.
Output: Renders the dashboard sections plus Add Encounter engine with immediate UI updates.
*/
type DashboardContentProps = {
  initialEncounters: EncounterRow[];
  sessions: SessionRow[];
};

const PARTY_DROPZONE_ID = "party-dropzone";
const BOX_DROPZONE_ID = "box-dropzone";

type PokemonIntel = {
  types: string[];
  stats: Array<{ label: string; value: number }>;
};

type PairIntel = {
  pokemonA: PokemonIntel;
  pokemonB: PokemonIntel;
};

const typeColorMap: Record<string, string> = {
  normal: "bg-zinc-500/30 text-zinc-200",
  fire: "bg-red-500/30 text-red-200",
  water: "bg-blue-500/30 text-blue-200",
  electric: "bg-yellow-500/30 text-yellow-200",
  grass: "bg-green-500/30 text-green-200",
  ice: "bg-cyan-500/30 text-cyan-200",
  fighting: "bg-orange-500/30 text-orange-200",
  poison: "bg-purple-500/30 text-purple-200",
  ground: "bg-amber-600/30 text-amber-200",
  flying: "bg-sky-500/30 text-sky-200",
  psychic: "bg-pink-500/30 text-pink-200",
  bug: "bg-lime-600/30 text-lime-200",
  rock: "bg-stone-500/30 text-stone-200",
  ghost: "bg-violet-500/30 text-violet-200",
  dragon: "bg-indigo-500/30 text-indigo-200",
  dark: "bg-slate-600/40 text-slate-200",
  steel: "bg-gray-500/30 text-gray-200",
  fairy: "bg-fuchsia-500/30 text-fuchsia-200",
};

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
      className={`${className} ${isOver ? "ring-1 ring-emerald-400 ring-offset-2 ring-offset-slate-950" : ""}`}
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
  onSelect: () => void;
  isActionPending: boolean;
  isReleasePending: boolean;
  isSelected: boolean;
};

type EncounterCardBodyProps = {
  encounter: EncounterRow;
  actionLabel: "Move to Party" | "Move to Box";
  onAction: () => void;
  onRelease: () => void;
  isActionPending: boolean;
  isReleasePending: boolean;
  dragHandle: React.ReactNode;
};

function EncounterCardBody({
  encounter,
  actionLabel,
  onAction,
  onRelease,
  isActionPending,
  isReleasePending,
  dragHandle,
}: EncounterCardBodyProps) {
  return (
    <div className="flex h-full min-h-[260px] flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-[11px] text-emerald-300">
          {encounter.location ?? "Unknown"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRelease();
            }}
            disabled={isReleasePending}
            className="inline-flex items-center gap-1 rounded-md border border-red-500/30 px-2 py-1 text-xs text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Release pair"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          {dragHandle}
        </div>
      </div>

      <div className="flex flex-1 items-start justify-between gap-2">
        <PokemonNameplate
          pokemonName={encounter.pokemon_a ?? "Unknown"}
          nickname={encounter.nickname_a}
          ability={encounter.ability_a}
        />
        <div className="grid place-items-center pt-7 text-slate-500">
          <Link2 className="h-4 w-4" />
        </div>
        <PokemonNameplate
          pokemonName={encounter.pokemon_b ?? "Unknown"}
          nickname={encounter.nickname_b}
          ability={encounter.ability_b}
        />
      </div>
      {/* `mt-auto` in a `flex-col` container consumes remaining vertical space, pinning this row to the bottom. */}
      <div className="mt-auto pt-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAction();
          }}
          disabled={isActionPending}
          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function DraggableEncounterCard({
  encounter,
  actionLabel,
  onAction,
  onRelease,
  onSelect,
  isActionPending,
  isReleasePending,
  isSelected,
}: EncounterCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: encounter.id,
    data: { inParty: encounter.is_in_party },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition: "transform 160ms ease" }}
      onClick={onSelect}
      className={`h-full min-h-[260px] rounded-lg border border-emerald-500/20 bg-slate-950/70 ${isSelected ? "ring-2 ring-emerald-500" : ""} ${isDragging ? "opacity-50 scale-105" : ""}`}
    >
      <EncounterCardBody
        encounter={encounter}
        actionLabel={actionLabel}
        onAction={onAction}
        onRelease={onRelease}
        isActionPending={isActionPending}
        isReleasePending={isReleasePending}
        dragHandle={
          <button
            type="button"
            {...listeners}
            {...attributes}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 px-2 py-1 text-xs text-slate-300 hover:bg-emerald-500/10"
            aria-label="Drag encounter card"
          >
            <GripVertical className="h-3 w-3" />
            Drag
          </button>
        }
      />
    </div>
  );
}

function SortablePartyCard({
  encounter,
  actionLabel,
  onAction,
  onRelease,
  onSelect,
  isActionPending,
  isReleasePending,
  isSelected,
}: EncounterCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: encounter.id,
    data: { inParty: true },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={`h-full min-h-[260px] rounded-lg border border-emerald-500/20 bg-slate-950/70 ${isSelected ? "ring-2 ring-emerald-500" : ""} ${isDragging ? "opacity-50 scale-105" : ""}`}
    >
      <EncounterCardBody
        encounter={encounter}
        actionLabel={actionLabel}
        onAction={onAction}
        onRelease={onRelease}
        isActionPending={isActionPending}
        isReleasePending={isReleasePending}
        dragHandle={
          <button
            type="button"
            {...listeners}
            {...attributes}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 px-2 py-1 text-xs text-slate-300 hover:bg-emerald-500/10"
            aria-label="Reorder party encounter card"
          >
            <GripVertical className="h-3 w-3" />
            Drag
          </button>
        }
      />
    </div>
  );
}

/*
Input: Current encounter list + a Supabase realtime payload.
Transformation: Merges change events into local state with immutable updates.
Output: Returns the next encounter state that drives dashboard rendering.
*/
function applyRealtimeChange(
  current: EncounterRow[],
  payload: {
    eventType: "INSERT" | "UPDATE" | "DELETE";
    new: EncounterRow | null;
    old: Partial<EncounterRow> | null;
  },
) {
  if (payload.eventType === "INSERT" && payload.new) {
    return [payload.new, ...current.filter((entry) => entry.id !== payload.new?.id)];
  }

  if (payload.eventType === "UPDATE" && payload.new) {
    return current.map((entry) => (entry.id === payload.new?.id ? payload.new : entry));
  }

  if (payload.eventType === "DELETE" && payload.old?.id) {
    return current.filter((entry) => entry.id !== payload.old?.id);
  }

  return current;
}

/*
Input: Encounter row from Supabase insert callback.
Transformation: Adds new encounter to state while preventing duplicate IDs.
Output: Updated state reflected instantly in stats/team/box cards.
*/
function addEncounterOptimistically(current: EncounterRow[], encounter: EncounterRow) {
  return [encounter, ...current.filter((entry) => entry.id !== encounter.id)];
}

export function DashboardContent({ initialEncounters, sessions }: DashboardContentProps) {
  const [encounters, setEncounters] = useState<EncounterRow[]>(initialEncounters);
  const [sessionOptions, setSessionOptions] = useState<SessionRow[]>(sessions);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingEncounterIds, setPendingEncounterIds] = useState<string[]>([]);
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [releasingEncounterIds, setReleasingEncounterIds] = useState<string[]>([]);
  const [pairIntel, setPairIntel] = useState<PairIntel | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel("encounters-live-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "encounters" },
        (payload) => {
          setEncounters((current) =>
            applyRealtimeChange(current, {
              eventType: payload.eventType,
              new: (payload.new as EncounterRow | null) ?? null,
              old: (payload.old as Partial<EncounterRow> | null) ?? null,
            }),
          );
        },
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const aliveEncounters = encounters.filter((encounter) => encounter.status?.toLowerCase() === "alive");
  const orderedPartyEncounters = aliveEncounters
    .filter((encounter) => encounter.is_in_party)
    .sort((a, b) => {
      const aIndex = a.order_index ?? Number.MAX_SAFE_INTEGER;
      const bIndex = b.order_index ?? Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.created_at.localeCompare(b.created_at);
    });
  const fallenCount = encounters.filter((encounter) => encounter.status?.toLowerCase() === "dead").length;
  const activeTeam = orderedPartyEncounters.slice(0, 6);
  const partyIds = activeTeam.map((encounter) => encounter.id);
  const partySlots = Array.from({ length: 6 }, (_, index) => activeTeam[index] ?? null);
  const boxedAliveEncounters = aliveEncounters.filter((encounter) => !encounter.is_in_party);
  const boxedIds = boxedAliveEncounters.map((encounter) => encounter.id);
  const latestLocation = encounters[0]?.location ?? "No encounters yet";
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));
  const selectedPair = selectedPairId ? encounters.find((encounter) => encounter.id === selectedPairId) ?? null : null;

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
      return {
        types: payload.types.map((entry: { type: { name: string } }) => entry.type.name),
        stats: payload.stats.map((entry: { base_stat: number; stat: { name: string } }) => ({
          label: entry.stat.name,
          value: entry.base_stat,
        })),
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

  /*
  Input: Party encounter IDs in their intended visual order + optional IDs moved to box.
  Transformation: Rewrites local `is_in_party`/`order_index` fields so party order is compacted from top to bottom.
  Output: Returns next encounter state with gravity/compaction applied before server confirmation.
  */
  function applyPartyLayoutOptimistically(
    current: EncounterRow[],
    nextPartyIds: string[],
    movedOutIds: string[] = [],
  ) {
    const orderMap = new Map(nextPartyIds.map((id, index) => [id, index]));
    const movedOutSet = new Set(movedOutIds);

    return current.map((entry) => {
      const nextIndex = orderMap.get(entry.id);
      if (nextIndex !== undefined) {
        return { ...entry, is_in_party: true, order_index: nextIndex };
      }

      if (movedOutSet.has(entry.id)) {
        return { ...entry, is_in_party: false, order_index: null };
      }

      return entry;
    });
  }

  async function persistPartyLayout(nextPartyIds: string[], movedOutIds: string[] = []) {
    const updates = [
      ...nextPartyIds.map((id, index) =>
        supabase.from("encounters").update({ is_in_party: true, order_index: index }).eq("id", id),
      ),
      ...movedOutIds.map((id) =>
        supabase.from("encounters").update({ is_in_party: false, order_index: null }).eq("id", id),
      ),
    ];

    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error)?.error;
    if (failed) {
      throw failed;
    }
  }

  async function commitPartyLayout(nextPartyIds: string[], movedOutIds: string[] = []) {
    const impactedIds = [...nextPartyIds, ...movedOutIds];
    if (impactedIds.length === 0) return;

    const previous = encounters;
    setActionError(null);
    setPendingEncounterIds((current) => [...new Set([...current, ...impactedIds])]);

    // Use optimistic ordering first so dnd-kit animations (arrayMove) feel immediate.
    setEncounters((current) => applyPartyLayoutOptimistically(current, nextPartyIds, movedOutIds));

    try {
      await persistPartyLayout(nextPartyIds, movedOutIds);
    } catch (error) {
      setEncounters(previous);
      const message = error instanceof Error ? error.message : "Unknown error";
      setActionError(`Failed to update party order: ${message}`);
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
      await commitPartyLayout(nextPartyIds);
      return;
    }

    const compactedPartyIds = partyIds.filter((id) => id !== encounterId);
    await commitPartyLayout(compactedPartyIds, [encounterId]);
  }

  async function releaseEncounter(encounterId: string) {
    if (releasingEncounterIds.includes(encounterId)) return;
    const confirmed = window.confirm("Are you sure you want to release this pair?");
    if (!confirmed) return;

    setReleasingEncounterIds((current) => [...current, encounterId]);
    setActionError(null);

    const previous = encounters;
    setEncounters((current) => current.filter((entry) => entry.id !== encounterId));

    const { error } = await supabase.from("encounters").delete().eq("id", encounterId);
    if (error) {
      setEncounters(previous);
      setActionError(`Failed to release pair: ${error.message}`);
    }

    setReleasingEncounterIds((current) => current.filter((id) => id !== encounterId));
  }

  /*
  Input: dnd-kit drag end event containing the dragged card id and target dropzone id.
  Transformation: Determines destination (party/box) and calls moveEncounter, which performs
  an optimistic UI update first so cards visually move immediately before Supabase confirms.
  Output: Persisted `is_in_party` value in Supabase and synchronized dashboard sections.
  */
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const activeIsParty = partyIds.includes(activeId);
    const overIsParty = overId === PARTY_DROPZONE_ID || partyIds.includes(overId);
    const overIsBox = overId === BOX_DROPZONE_ID || boxedIds.includes(overId);

    if (activeIsParty && overIsParty) {
      if (overId === PARTY_DROPZONE_ID) return;

      const oldIndex = partyIds.indexOf(activeId);
      const newIndex = partyIds.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

      const reorderedPartyIds = arrayMove(partyIds, oldIndex, newIndex);
      await commitPartyLayout(reorderedPartyIds);
      return;
    }

    if (activeIsParty && overIsBox) {
      const compactedPartyIds = partyIds.filter((id) => id !== activeId);
      await commitPartyLayout(compactedPartyIds, [activeId]);
      return;
    }

    if (!activeIsParty && overIsParty) {
      if (partyIds.length >= 6) {
        toast.error("Party is full!");
        setActionError("Party is full (6). Move one pair to box first.");
        return;
      }

      const nextPartyIds = [...partyIds, activeId];
      await commitPartyLayout(nextPartyIds);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-[1700px]">
        <CollapsibleSidebar />

        <main className="w-full flex-1 p-4 md:p-6 xl:p-8">
          <section className="mb-6 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/20 via-emerald-500/5 to-transparent p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-300/90">
                  Nuzl Command Center
                </p>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Soul Link Dashboard</h1>
                <p className="max-w-2xl text-sm text-slate-300">
                  Track live encounters, monitor active pairs, and keep your run survivability visible
                  at a glance.
                </p>
                <p className="text-xs text-slate-400">
                  Realtime:{" "}
                  <span className={realtimeConnected ? "text-emerald-300" : "text-amber-300"}>
                    {realtimeConnected ? "Connected" : "Connecting..."}
                  </span>
                </p>
                {actionError && <p className="text-xs text-amber-300">{actionError}</p>}
              </div>

              <AddEncounterModal
                sessions={sessionOptions}
                onEncounterAdded={(encounter) =>
                  setEncounters((current) => addEncounterOptimistically(current, encounter))
                }
                onSessionAdded={(session) =>
                  setSessionOptions((current) => [session, ...current.filter((item) => item.id !== session.id)])
                }
              />
            </div>
          </section>

          <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">Total Encounters</CardDescription>
                <CardTitle className="text-4xl">{encounters.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-emerald-300">All logged Soul Link attempts.</CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">Live Pairs</CardDescription>
                <CardTitle className="flex items-center gap-2 text-4xl">
                  {aliveEncounters.length}
                  <Shield className="h-6 w-6 text-emerald-400" />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-300">
                Pairs currently marked as alive.
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">Fallen Pairs</CardDescription>
                <CardTitle className="flex items-center gap-2 text-4xl">
                  {fallenCount}
                  <Trophy className="h-6 w-6 text-emerald-400" />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-300">Pairs lost during the run.</CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">Latest Location</CardDescription>
                <CardTitle className="line-clamp-2 text-xl">{latestLocation}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-300">Most recent encounter area.</CardContent>
            </Card>
          </section>

          <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragEnd={handleDragEnd}>
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader className="flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">Live Team</CardTitle>
                    <CardDescription>Only alive pairs where is_in_party is true (max 6).</CardDescription>
                  </div>
                  <Users className="h-5 w-5 text-emerald-400" />
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
                              actionLabel="Move to Box"
                              onAction={() => void moveEncounter(encounter.id, false)}
                              onRelease={() => void releaseEncounter(encounter.id)}
                              onSelect={() => setSelectedPairId(encounter.id)}
                              isActionPending={pendingEncounterIds.includes(encounter.id)}
                              isReleasePending={releasingEncounterIds.includes(encounter.id)}
                              isSelected={selectedPairId === encounter.id}
                            />
                          ) : (
                            <div
                              key={`party-empty-slot-${index}`}
                              className={`grid h-full min-h-[260px] place-items-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-4 text-center transition ${isOver ? "border-emerald-500/40 bg-emerald-500/10" : ""}`}
                            >
                              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">EMPTY SLOT</p>
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
                  <CardTitle className="text-2xl">Soul Link Intel</CardTitle>
                  <CardDescription>Types and base stats for the selected pair.</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Conditional render: show empty state until a user selects an encounter card. */}
                  {!selectedPair && (
                    <div className="grid min-h-[260px] place-items-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-4 text-center">
                      <p className="text-sm text-slate-400">Select a pair to view intel.</p>
                    </div>
                  )}
                  {selectedPair && (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-emerald-500/20 bg-slate-950/60 p-3">
                        <p className="text-sm font-semibold text-slate-100">
                          {selectedPair.pokemon_a} / {selectedPair.pokemon_b}
                        </p>
                        <p className="text-xs text-slate-400">{selectedPair.location}</p>
                      </div>
                      {intelLoading && <p className="text-sm text-slate-400">Loading intel...</p>}
                      {!intelLoading && pairIntel && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">
                                {selectedPair.pokemon_a}
                              </p>
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
                            </div>
                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">
                                {selectedPair.pokemon_b}
                              </p>
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
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              {pairIntel.pokemonA.stats.map((stat) => (
                                <div key={`a-stat-${stat.label}`}>
                                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-slate-400">
                                    <span>{stat.label.replaceAll("-", " ")}</span>
                                    <span>{stat.value}</span>
                                  </div>
                                  <div className="h-1.5 rounded bg-slate-800">
                                    <div
                                      className="h-full rounded bg-emerald-400"
                                      style={{ width: `${Math.min(100, (stat.value / 180) * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="space-y-2">
                              {pairIntel.pokemonB.stats.map((stat) => (
                                <div key={`b-stat-${stat.label}`}>
                                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-slate-400">
                                    <span>{stat.label.replaceAll("-", " ")}</span>
                                    <span>{stat.value}</span>
                                  </div>
                                  <div className="h-1.5 rounded bg-slate-800">
                                    <div
                                      className="h-full rounded bg-emerald-400"
                                      style={{ width: `${Math.min(100, (stat.value / 180) * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">PC Box</CardTitle>
                  <CardDescription>Alive encounters where is_in_party is false.</CardDescription>
                </CardHeader>
                <CardContent>
                  <DroppableGrid
                    id={BOX_DROPZONE_ID}
                    className="grid min-h-[300px] gap-3 rounded-xl md:grid-cols-2 xl:grid-cols-3"
                  >
                    {boxedAliveEncounters.length === 0 && (
                      <div className="grid h-full min-h-[260px] place-items-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-4 text-center">
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">EMPTY SLOT</p>
                      </div>
                    )}
                    {boxedAliveEncounters.length > 0 &&
                      boxedAliveEncounters.map((encounter) => (
                        <DraggableEncounterCard
                          key={`pc-${encounter.id}`}
                          encounter={encounter}
                          actionLabel="Move to Party"
                          onAction={() => void moveEncounter(encounter.id, true)}
                          onRelease={() => void releaseEncounter(encounter.id)}
                          onSelect={() => setSelectedPairId(encounter.id)}
                          isActionPending={pendingEncounterIds.includes(encounter.id)}
                          isReleasePending={releasingEncounterIds.includes(encounter.id)}
                          isSelected={selectedPairId === encounter.id}
                        />
                      ))}
                  </DroppableGrid>
                </CardContent>
              </Card>
            </section>
          </DndContext>
        </main>
      </div>
    </div>
  );
}
