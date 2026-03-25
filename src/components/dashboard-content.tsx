"use client";

import { useEffect, useState } from "react";
import { Shield, Swords, Trophy, Users } from "lucide-react";

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
  const activeTeam = aliveEncounters.slice(0, 6);
  const latestLocation = encounters[0]?.location ?? "No encounters yet";

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

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-2xl">Live Team</CardTitle>
                  <CardDescription>Top six alive Soul Link pairs by recency.</CardDescription>
                </div>
                <Users className="h-5 w-5 text-emerald-400" />
              </CardHeader>
              <CardContent>
                {activeTeam.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No active pairs yet. Catch your first linked encounter.
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {activeTeam.map((encounter) => (
                      <div
                        key={encounter.id}
                        className="rounded-xl border border-emerald-500/20 bg-slate-950/70 p-4"
                      >
                        <p className="mb-2 text-xs uppercase tracking-wider text-emerald-300">
                          {encounter.location ?? "Unknown Location"}
                        </p>
                        <div className="flex items-center justify-between gap-3">
                          <PokemonNameplate
                            pokemonName={encounter.pokemon_a ?? "Unknown"}
                            nickname={encounter.nickname_a}
                          />
                          <Swords className="h-4 w-4 text-slate-500" />
                          <PokemonNameplate
                            pokemonName={encounter.pokemon_b ?? "Unknown"}
                            nickname={encounter.nickname_b}
                          />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                          <span>A: {encounter.ability_a ?? "Unknown"}</span>
                          <span>B: {encounter.ability_b ?? "Unknown"}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">Status: {encounter.status ?? "unknown"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">PC Box</CardTitle>
                <CardDescription>Caught Pokemon pool (currently all alive encounters).</CardDescription>
              </CardHeader>
              <CardContent>
                {aliveEncounters.length === 0 ? (
                  <p className="text-sm text-slate-400">No boxed Pokemon yet.</p>
                ) : (
                  <div className="space-y-2">
                    {aliveEncounters.map((encounter) => (
                      <div
                        key={`pc-${encounter.id}`}
                        className="rounded-lg border border-emerald-500/20 bg-slate-950/70 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <PokemonNameplate
                            pokemonName={encounter.pokemon_a ?? "Unknown"}
                            nickname={encounter.nickname_a}
                          />
                          <Swords className="h-4 w-4 text-slate-500" />
                          <PokemonNameplate
                            pokemonName={encounter.pokemon_b ?? "Unknown"}
                            nickname={encounter.nickname_b}
                          />
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                          {encounter.ability_a ?? "Unknown"} / {encounter.ability_b ?? "Unknown"}
                        </p>
                        <span className="mt-2 inline-flex rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300">
                          {encounter.location ?? "Unknown"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
}
