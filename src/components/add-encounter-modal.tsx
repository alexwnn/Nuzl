"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { encounterInsertSchema } from "@/lib/encounter-schema";
import { sessionInsertSchema } from "@/lib/session-schema";
import { supabase } from "@/lib/supabase";
import type { EncounterRow, SessionRow } from "@/lib/database.types";
import { PokemonSearch } from "@/components/pokemon-search";

/*
Input: Session options and an optional callback from the dashboard state layer.
Transformation: Captures form values, validates them with the encounter schema, and inserts typed rows into Supabase.
Output: Emits the inserted encounter to the parent and closes/reset the modal.
*/
type AddEncounterModalProps = {
  sessions: SessionRow[];
  onEncounterAdded?: (encounter: EncounterRow) => void;
  onSessionAdded?: (session: SessionRow) => void;
};

/*
Input: Session rows from Supabase.
Transformation: Selects a safe default session id for initial form state.
Output: Returns a string id used in the controlled select input.
*/
function getDefaultSessionId(sessions: SessionRow[]) {
  return sessions[0] ? String(sessions[0].id) : "";
}

/*
Input: Pokemon name candidate from the encounter form.
Transformation: Normalizes to lowercase and verifies existence through PokeAPI.
Output: Returns true when the Pokemon is valid, false when not found or request fails.
*/
async function verifyPokemonExists(name: string) {
  const slug = name.trim().toLowerCase();
  if (!slug) return false;

  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`);
    return response.ok;
  } catch {
    return false;
  }
}

export function AddEncounterModal({ sessions, onEncounterAdded, onSessionAdded }: AddEncounterModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [showCreateSessionForm, setShowCreateSessionForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionErrorMessage, setSessionErrorMessage] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [formState, setFormState] = useState({
    session_id: getDefaultSessionId(sessions),
    location: "",
    pokemon_a: "",
    nickname_a: "",
    ability_a: "",
    pokemon_b: "",
    nickname_b: "",
    ability_b: "",
    status: "alive",
    is_in_party: false,
    order_index: null as number | null,
  });
  const [abilityOptionsA, setAbilityOptionsA] = useState<string[]>([]);
  const [abilityOptionsB, setAbilityOptionsB] = useState<string[]>([]);

  const hasSessions = sessions.length > 0;
  const sessionPlaceholder = useMemo(
    () => (hasSessions ? "Choose a session" : "Create a session first"),
    [hasSessions],
  );

  useEffect(() => {
    if (!formState.session_id && hasSessions) {
      setFormState((state) => ({ ...state, session_id: getDefaultSessionId(sessions) }));
    }
  }, [formState.session_id, hasSessions, sessions]);

  /*
  Input: Resolved Pokemon A payload from PokemonSearch (normalized name + abilities list).
  Transformation: Synchronizes the canonical Pokemon name and hydrates Ability A options.
  Output: Updates form state so the ability dropdown can be selected without manual typing.
  */
  /*
  Referential-equality fix: useCallback keeps this handler identity stable across renders.
  This prevents child effects that depend on the callback from retriggering indefinitely.
  */
  const handlePokemonAResolved = useCallback((payload: { name: string; abilities: string[] }) => {
    setAbilityOptionsA(payload.abilities);
    setFormState((state) => ({
      ...state,
      pokemon_a: payload.name || state.pokemon_a,
      ability_a: payload.abilities[0] ?? "",
    }));
  }, []);

  /*
  Input: Resolved Pokemon B payload from PokemonSearch (normalized name + abilities list).
  Transformation: Synchronizes the canonical Pokemon name and hydrates Ability B options.
  Output: Updates form state so the ability dropdown can be selected without manual typing.
  */
  /*
  Referential-equality fix: stable callback identity avoids repeated child effect execution.
  */
  const handlePokemonBResolved = useCallback((payload: { name: string; abilities: string[] }) => {
    setAbilityOptionsB(payload.abilities);
    setFormState((state) => ({
      ...state,
      pokemon_b: payload.name || state.pokemon_b,
      ability_b: payload.abilities[0] ?? "",
    }));
  }, []);

  /*
  Input: Raw `sessionName` from the nested "create first session" form.
  Transformation: Validates with Zod and inserts a new row into `sessions`.
  Output: Returns a typed `SessionRow`, updates parent session state, and auto-selects `session_id`.

  Foreign key note: `encounters.session_id` references `sessions.id` (encounters_session_id_fkey),
  so every encounter must point to an existing session before insertion is valid.
  */
  async function handleCreateSession() {
    try {
      setIsCreatingSession(true);
      setSessionErrorMessage(null);

      const parsed = sessionInsertSchema.parse({ name: sessionName });
      const { data, error } = await supabase
        .from("sessions")
        .insert(parsed)
        .select("id, name, created_at")
        .single();

      if (error) {
        setSessionErrorMessage(error.message);
        return;
      }

      if (data) {
        onSessionAdded?.(data);
        setFormState((state) => ({ ...state, session_id: String(data.id) }));
        setSessionName("");
        setShowCreateSessionForm(false);
      }
    } catch {
      setSessionErrorMessage("Enter a valid session name.");
    } finally {
      setIsCreatingSession(false);
    }
  }

  /*
  Input: Submit event from modal form.
  Transformation: Validates with Zod, performs Supabase insert, and handles success/error control flow.
  Output: Sends new encounter to parent callback and updates UI state.
  */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasSessions) return;

    try {
      setIsSaving(true);
      setErrorMessage(null);

      const selectedSession = formState.session_id.trim();
      const location = formState.location.trim();
      const pokemonA = formState.pokemon_a.trim();
      const nicknameA = formState.nickname_a.trim();
      const abilityA = formState.ability_a.trim();
      const pokemonB = formState.pokemon_b.trim();
      const nicknameB = formState.nickname_b.trim();
      const abilityB = formState.ability_b.trim();

      console.log("[AddEncounter] selectedSession:", selectedSession);
      console.log("[AddEncounter] location:", location);
      console.log("[AddEncounter] pokemonA:", pokemonA);
      console.log("[AddEncounter] nicknameA:", nicknameA);
      console.log("[AddEncounter] abilityA:", abilityA);
      console.log("[AddEncounter] pokemonB:", pokemonB);
      console.log("[AddEncounter] nicknameB:", nicknameB);
      console.log("[AddEncounter] abilityB:", abilityB);

      if (!selectedSession) {
        setErrorMessage("Please select a session.");
        return;
      }

      if (!location) {
        setErrorMessage("Please provide a location.");
        return;
      }

      if (!pokemonA) {
        setErrorMessage("Please enter Pokemon A.");
        return;
      }

      if (!pokemonB) {
        setErrorMessage("Please enter Pokemon B.");
        return;
      }

      if (!nicknameA) {
        setErrorMessage("Please enter Nickname A.");
        return;
      }

      if (!abilityA) {
        setErrorMessage("Please enter Ability A.");
        return;
      }

      if (!nicknameB) {
        setErrorMessage("Please enter Nickname B.");
        return;
      }

      if (!abilityB) {
        setErrorMessage("Please enter Ability B.");
        return;
      }

      const pokemonAFound = await verifyPokemonExists(pokemonA);
      if (!pokemonAFound) {
        setErrorMessage("Pokemon A not found.");
        return;
      }

      const pokemonBFound = await verifyPokemonExists(pokemonB);
      if (!pokemonBFound) {
        setErrorMessage("Pokemon B not found.");
        return;
      }

      const parsed = encounterInsertSchema.safeParse(formState);
      if (!parsed.success) {
        const field = parsed.error.issues[0]?.path[0];
        if (field === "session_id") {
          setErrorMessage("Please select a valid session.");
        } else if (field === "location") {
          setErrorMessage("Please provide a valid location.");
        } else if (field === "pokemon_a") {
          setErrorMessage("Pokemon A is invalid.");
        } else if (field === "nickname_a") {
          setErrorMessage("Nickname A is invalid.");
        } else if (field === "ability_a") {
          setErrorMessage("Ability A is invalid.");
        } else if (field === "pokemon_b") {
          setErrorMessage("Pokemon B is invalid.");
        } else if (field === "nickname_b") {
          setErrorMessage("Nickname B is invalid.");
        } else if (field === "ability_b") {
          setErrorMessage("Ability B is invalid.");
        } else {
          setErrorMessage("Please verify all encounter fields.");
        }
        return;
      }

      const validatedEncounter = parsed.data;
      const { data, error } = await supabase
        .from("encounters")
        .insert(validatedEncounter)
        .select(
          "id, session_id, location, pokemon_a, nickname_a, ability_a, pokemon_b, nickname_b, ability_b, status, is_in_party, order_index, created_at",
        )
        .single();

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data) {
        onEncounterAdded?.(data);
      }

      setFormState({
        session_id: getDefaultSessionId(sessions),
        location: "",
        pokemon_a: "",
        nickname_a: "",
        ability_a: "",
        pokemon_b: "",
        nickname_b: "",
        ability_b: "",
        status: "alive",
        is_in_party: false,
        order_index: null,
      });
      setAbilityOptionsA([]);
      setAbilityOptionsB([]);
      setIsOpen(false);
    } catch {
      setErrorMessage("Unable to save encounter right now. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/25"
      >
        <Plus className="h-4 w-4" />
        + Add Encounter
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-emerald-500/30 bg-slate-900 p-5 shadow-[0_20px_60px_-25px_rgba(16,185,129,0.45)]">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Capture Engine</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-100">Add New Encounter</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md border border-emerald-500/20 p-1 text-slate-300 hover:bg-emerald-500/15"
                aria-label="Close add encounter modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Session</label>
                <select
                  value={formState.session_id}
                  onChange={(event) =>
                    setFormState((state) => ({ ...state, session_id: event.target.value }))
                  }
                  disabled={!hasSessions}
                  className="w-full rounded-xl border border-emerald-500/20 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none"
                >
                  {!hasSessions && <option value="">{sessionPlaceholder}</option>}
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name}
                    </option>
                  ))}
                </select>
              </div>

              {!hasSessions && (
                <div className="rounded-xl border border-emerald-500/20 bg-slate-950/60 p-3">
                  {!showCreateSessionForm ? (
                    <button
                      type="button"
                      onClick={() => setShowCreateSessionForm(true)}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/25"
                    >
                      Create your first Session
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <label className="block text-xs uppercase tracking-[0.18em] text-slate-400">
                        Session Name
                      </label>
                      <input
                        type="text"
                        value={sessionName}
                        onChange={(event) => setSessionName(event.target.value)}
                        placeholder="e.g. FireRed Soul Link"
                        className="w-full rounded-xl border border-emerald-500/20 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      {sessionErrorMessage && (
                        <p className="text-sm text-red-300">{sessionErrorMessage}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCreateSession()}
                          disabled={isCreatingSession}
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
                        >
                          {isCreatingSession ? "Creating..." : "Create Session"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCreateSessionForm(false)}
                          className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Location</label>
                <input
                  type="text"
                  value={formState.location}
                  onChange={(event) =>
                    setFormState((state) => ({ ...state, location: event.target.value }))
                  }
                  placeholder="e.g. Route 34"
                  className="w-full rounded-xl border border-emerald-500/20 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <PokemonSearch
                  label="Pokemon A"
                  value={formState.pokemon_a}
                  onChange={(pokemon_a) => setFormState((state) => ({ ...state, pokemon_a }))}
                  onPokemonResolved={handlePokemonAResolved}
                />
                <PokemonSearch
                  label="Pokemon B"
                  value={formState.pokemon_b}
                  onChange={(pokemon_b) => setFormState((state) => ({ ...state, pokemon_b }))}
                  onPokemonResolved={handlePokemonBResolved}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Nickname A
                  </label>
                  <input
                    type="text"
                    value={formState.nickname_a}
                    onChange={(event) =>
                      setFormState((state) => ({ ...state, nickname_a: event.target.value }))
                    }
                    placeholder="e.g. Sparks"
                    className="w-full rounded-xl border border-emerald-500/20 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Nickname B
                  </label>
                  <input
                    type="text"
                    value={formState.nickname_b}
                    onChange={(event) =>
                      setFormState((state) => ({ ...state, nickname_b: event.target.value }))
                    }
                    placeholder="e.g. Nimbus"
                    className="w-full rounded-xl border border-emerald-500/20 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Ability A
                  </label>
                  <select
                    value={formState.ability_a}
                    onChange={(event) =>
                      setFormState((state) => ({ ...state, ability_a: event.target.value }))
                    }
                    className="w-full rounded-xl border border-emerald-500/20 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none"
                  >
                    <option value="">Select Ability A</option>
                    {abilityOptionsA.map((ability) => (
                      <option key={ability} value={ability}>
                        {ability}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Ability B
                  </label>
                  <select
                    value={formState.ability_b}
                    onChange={(event) =>
                      setFormState((state) => ({ ...state, ability_b: event.target.value }))
                    }
                    className="w-full rounded-xl border border-emerald-500/20 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none"
                  >
                    <option value="">Select Ability B</option>
                    {abilityOptionsB.map((ability) => (
                      <option key={ability} value={ability}>
                        {ability}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Status</label>
                <select
                  value={formState.status}
                  onChange={(event) =>
                    setFormState((state) => ({ ...state, status: event.target.value }))
                  }
                  className="w-full rounded-xl border border-emerald-500/20 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none"
                >
                  <option value="alive">alive</option>
                  <option value="dead">dead</option>
                  <option value="boxed">boxed</option>
                </select>
              </div>

              {errorMessage && (
                <p className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                  {errorMessage}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!hasSessions || isSaving}
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Encounter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
