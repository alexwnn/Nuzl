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
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Shield, Swords, Trophy, Users } from "lucide-react";
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

type DroppableGridProps = {
  id: string;
  className: string;
  children: React.ReactNode;
};

function DroppableGrid({ id, className, children }: DroppableGridProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? "ring-1 ring-emerald-400 ring-offset-2 ring-offset-slate-950" : ""}`}
    >
      {children}
    </div>
  );
}

type DraggableEncounterCardProps = {
  encounter: EncounterRow;
  actionLabel: "Move to Party" | "Move to Box";
  onAction: () => void;
  isActionPending: boolean;
};

function DraggableEncounterCard({
  encounter,
  actionLabel,
  onAction,
  isActionPending,
}: DraggableEncounterCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: encounter.id,
    data: { inParty: encounter.is_in_party },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition: "transform 160ms ease" }}
      className={`rounded-lg border border-emerald-500/20 bg-slate-950/70 px-3 py-2 ${isDragging ? "opacity-50 scale-105" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300">
          {encounter.location ?? "Unknown"}
        </span>
        <button
          type="button"
          {...listeners}
          {...attributes}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 px-2 py-1 text-xs text-slate-300 hover:bg-emerald-500/10"
          aria-label="Drag encounter card"
        >
          <GripVertical className="h-3 w-3" />
          Drag
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <PokemonNameplate pokemonName={encounter.pokemon_a ?? "Unknown"} nickname={encounter.nickname_a} />
        <Swords className="h-4 w-4 text-slate-500" />
        <PokemonNameplate pokemonName={encounter.pokemon_b ?? "Unknown"} nickname={encounter.nickname_b} />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {encounter.ability_a ?? "Unknown"} / {encounter.ability_b ?? "Unknown"}
      </p>
      <div className="mt-2">
        <button
          type="button"
          onClick={onAction}
          disabled={isActionPending}
          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </div>
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
  const fallenCount = encounters.filter((encounter) => encounter.status?.toLowerCase() === "dead").length;
  const partyCount = aliveEncounters.filter((encounter) => encounter.is_in_party).length;
  const activeTeam = aliveEncounters.filter((encounter) => encounter.is_in_party).slice(0, 6);
  const partySlots = Array.from({ length: 6 }, (_, index) => activeTeam[index] ?? null);
  const boxedAliveEncounters = aliveEncounters.filter((encounter) => !encounter.is_in_party);
  const latestLocation = encounters[0]?.location ?? "No encounters yet";
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  /*
  Input: Encounter id and destination flag (`true` for party, `false` for box).
  Transformation: Optimistically updates local state, persists `is_in_party` in Supabase, and rolls back on error.
  Output: Updated encounter placement across Live Team and PC Box sections.
  */
  async function moveEncounter(encounterId: string, nextInParty: boolean) {
    if (pendingEncounterIds.includes(encounterId)) return;

    const targetEncounter = encounters.find((entry) => entry.id === encounterId);
    if (!targetEncounter) return;
    if (targetEncounter.is_in_party === nextInParty) return;

    if (nextInParty && partyCount >= 6) {
      toast.error("Party is full!");
      setActionError("Party is full (6). Move one pair to box first.");
      return;
    }

    setActionError(null);
    setPendingEncounterIds((current) => [...current, encounterId]);

    const previous = encounters;
    setEncounters((current) => {
      const moved = current.find((entry) => entry.id === encounterId);
      if (!moved) return current;

      const withoutMoved = current.filter((entry) => entry.id !== encounterId);
      const updatedMoved = { ...moved, is_in_party: nextInParty };

      if (!nextInParty) {
        return [...withoutMoved, updatedMoved];
      }

      // Append to the next available party slot by inserting after current party entries.
      const insertIndex = withoutMoved.filter((entry) => entry.is_in_party).length;
      const before = withoutMoved.slice(0, insertIndex);
      const after = withoutMoved.slice(insertIndex);
      return [...before, updatedMoved, ...after];
    });

    const { error } = await supabase
      .from("encounters")
      .update({ is_in_party: nextInParty })
      .eq("id", encounterId);

    if (error) {
      setEncounters(previous);
      setActionError(`Failed to move encounter: ${error.message}`);
    }

    setPendingEncounterIds((current) => current.filter((id) => id !== encounterId));
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

    const targetIsParty =
      over.id === PARTY_DROPZONE_ID ? true : over.id === BOX_DROPZONE_ID ? false : null;
    if (targetIsParty === null) return;

    const sourceIsParty = Boolean(active.data.current?.inParty);
    if (sourceIsParty === targetIsParty) return;

    await moveEncounter(String(active.id), targetIsParty);
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
                  {partySlots.map((encounter, index) =>
                    encounter ? (
                      <DraggableEncounterCard
                        key={encounter.id}
                        encounter={encounter}
                        actionLabel="Move to Box"
                        onAction={() => void moveEncounter(encounter.id, false)}
                        isActionPending={pendingEncounterIds.includes(encounter.id)}
                      />
                    ) : (
                      <div
                        key={`party-empty-slot-${index}`}
                        className="grid min-h-[120px] place-items-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40"
                      >
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Empty Slot</p>
                      </div>
                    ),
                  )}
                </DroppableGrid>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">PC Box</CardTitle>
                <CardDescription>Alive encounters where is_in_party is false.</CardDescription>
              </CardHeader>
              <CardContent>
                <DroppableGrid id={BOX_DROPZONE_ID} className="min-h-[400px] space-y-2 rounded-xl">
                  {boxedAliveEncounters.length === 0 && (
                    <div className="grid min-h-[120px] place-items-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40">
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Empty Slot</p>
                    </div>
                  )}
                  {boxedAliveEncounters.length > 0 && (
                    <>
                    {boxedAliveEncounters.map((encounter) => (
                      <DraggableEncounterCard
                        key={`pc-${encounter.id}`}
                        encounter={encounter}
                        actionLabel="Move to Party"
                        onAction={() => void moveEncounter(encounter.id, true)}
                        isActionPending={pendingEncounterIds.includes(encounter.id)}
                      />
                    ))}
                    </>
                  )}
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
