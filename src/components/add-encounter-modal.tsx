"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { useParams } from "next/navigation";

import { encounterInsertSchema } from "@/lib/encounter-schema";
import { formatAbilityName } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { EncounterRow } from "@/lib/database.types";
import { PokemonSearch } from "@/components/pokemon-search";

/*
Input: Session id and an optional callback from the dashboard state layer.
Transformation: Captures form values, validates them with the encounter schema, and inserts typed rows into Supabase.
Output: Emits the inserted encounter to the parent and closes/reset the modal.
*/
type AddEncounterModalProps = {
  sessionId?: string;
  onEncounterAdded?: (encounter: EncounterRow) => void;
  onEncounterUpdated?: (encounter: EncounterRow) => void;
  mode?: "add" | "edit";
  encounter?: EncounterRow;
  trigger?: ReactNode;
};

type AbilityComboboxProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder: string;
};

function createEmptyFormState(sessionId: string) {
  return {
    session_id: sessionId,
    location: "",
    pokemon_a: "",
    nickname_a: "",
    ability_a: "",
    pokemon_b: "",
    nickname_b: "",
    ability_b: "",
    is_in_party: false,
    is_fainted: false,
    order_index: null as number | null,
  };
}

function createEditFormState(encounter: EncounterRow) {
  return {
    session_id: encounter.session_id,
    location: encounter.location ?? "",
    pokemon_a: encounter.pokemon_a ?? "",
    nickname_a: encounter.nickname_a ?? "",
    ability_a: encounter.ability_a ?? "",
    pokemon_b: encounter.pokemon_b ?? "",
    nickname_b: encounter.nickname_b ?? "",
    ability_b: encounter.ability_b ?? "",
    is_in_party: encounter.is_in_party,
    is_fainted: encounter.is_fainted,
    order_index: encounter.order_index,
  };
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

/*
Input: Current ability value, API-suggested ability list, and parent onChange setter.
Transformation: Filters options as user types and appends a "Create ..." option when input is non-empty
and not an exact match of known abilities.
Output: Sets either a suggested ability or a custom typed ability back into the encounter form state.
*/
function AbilityCombobox({ label, value, options, onChange, placeholder }: AbilityComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const normalizedQuery = value.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options.slice(0, 12);
    return options.filter((ability) => ability.toLowerCase().includes(normalizedQuery)).slice(0, 12);
  }, [normalizedQuery, options]);

  const hasExactMatch = useMemo(
    () => options.some((ability) => ability.toLowerCase() === normalizedQuery),
    [normalizedQuery, options],
  );

  const showCreateOption = normalizedQuery.length > 0 && !hasExactMatch;

  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</label>
      <div className="relative">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2">
          <input
            type="text"
            value={value}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 140)}
            onChange={(event) => {
              onChange(event.target.value);
              setIsOpen(true);
            }}
            placeholder={placeholder}
            className="w-full bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </div>

        {isOpen && (showCreateOption || filteredOptions.length > 0) && (
          <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl">
            {showCreateOption && (
              <button
                type="button"
                onClick={() => {
                  onChange(value.trim());
                  setIsOpen(false);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-100"
              >
                Create &quot;{value.trim()}&quot;
              </button>
            )}
            {filteredOptions.map((ability) => (
              <button
                key={`${label}-${ability}`}
                type="button"
                onClick={() => {
                  onChange(ability);
                  setIsOpen(false);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-100"
              >
                {formatAbilityName(ability)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AddEncounterModal({
  sessionId,
  onEncounterAdded,
  onEncounterUpdated,
  mode = "add",
  encounter,
  trigger,
}: AddEncounterModalProps) {
  const isEditMode = mode === "edit";
  const params = useParams<{ sessionId?: string }>();
  const routeSessionId = typeof params?.sessionId === "string" ? decodeURIComponent(params.sessionId) : "";
  const activeSessionId = (sessionId ?? routeSessionId).trim();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState(
    isEditMode && encounter ? createEditFormState(encounter) : createEmptyFormState(activeSessionId),
  );
  const [abilityOptionsA, setAbilityOptionsA] = useState<string[]>([]);
  const [abilityOptionsB, setAbilityOptionsB] = useState<string[]>([]);
  const hasSession = activeSessionId.length > 0;

  useEffect(() => {
    if (isEditMode) return;
    setFormState((state) => ({ ...state, session_id: activeSessionId }));
  }, [activeSessionId, isEditMode]);

  useEffect(() => {
    if (!isOpen || !isEditMode || !encounter) return;
    setFormState(createEditFormState(encounter));
    setErrorMessage(null);
  }, [encounter, isEditMode, isOpen]);

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
      ability_a: (payload.name || state.pokemon_a) !== state.pokemon_a ? "" : state.ability_a,
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
      ability_b: (payload.name || state.pokemon_b) !== state.pokemon_b ? "" : state.ability_b,
    }));
  }, []);

  /*
  Input: Submit event from modal form.
  Transformation: Validates with Zod, performs Supabase insert, and handles success/error control flow.
  Output: Sends new encounter to parent callback and updates UI state.
  */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasSession) return;
    if (isEditMode && !encounter) return;

    try {
      setIsSaving(true);
      setErrorMessage(null);

      const selectedSession = activeSessionId;
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

      let nextInParty = formState.is_in_party;
      let nextOrderIndex = formState.order_index;

      if (!isEditMode) {
        /*
        Input: Current encounter draft before insert.
        Transformation: Counts current party/box rows, then computes insertion target and tail index.
        Output: New row lands at the end of party when size < 6, otherwise at the end of the PC box list.
        */
        const [{ count: partyCount, error: partyCountError }, { count: boxCount, error: boxCountError }] =
          await Promise.all([
            supabase
              .from("encounters")
              .select("*", { count: "exact", head: true })
              .eq("session_id", selectedSession)
              .eq("is_in_party", true),
            supabase
              .from("encounters")
              .select("*", { count: "exact", head: true })
              .eq("session_id", selectedSession)
              .eq("is_in_party", false)
              .eq("is_fainted", false),
          ]);

        if (partyCountError || boxCountError) {
          setErrorMessage(partyCountError?.message ?? boxCountError?.message ?? "Unable to resolve party count.");
          return;
        }

        nextInParty = (partyCount ?? 0) < 6;
        nextOrderIndex = nextInParty ? (partyCount ?? 0) : (boxCount ?? 0);
      }

      const parsed = encounterInsertSchema.safeParse({
        session_id: selectedSession,
        location,
        pokemon_a: pokemonA,
        nickname_a: nicknameA,
        ability_a: abilityA,
        pokemon_b: pokemonB,
        nickname_b: nicknameB,
        ability_b: abilityB,
        status: "alive",
        is_fainted: false,
        is_in_party: nextInParty,
        order_index: nextOrderIndex,
      });
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
      const query = isEditMode && encounter
        ? supabase
            .from("encounters")
            .update({
              session_id: validatedEncounter.session_id,
              location: validatedEncounter.location,
              pokemon_a: validatedEncounter.pokemon_a,
              nickname_a: validatedEncounter.nickname_a,
              ability_a: validatedEncounter.ability_a,
              pokemon_b: validatedEncounter.pokemon_b,
              nickname_b: validatedEncounter.nickname_b,
              ability_b: validatedEncounter.ability_b,
            })
            .eq("id", encounter.id)
            .eq("session_id", selectedSession)
        : supabase.from("encounters").insert(validatedEncounter);

      const { data, error } = await query
        .select(
          "id, session_id, location, pokemon_a, nickname_a, ability_a, pokemon_b, nickname_b, ability_b, status, is_in_party, is_fainted, order_index, created_at",
        )
        .single();

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data) {
        if (isEditMode) {
          onEncounterUpdated?.(data);
        } else {
          onEncounterAdded?.(data);
        }
      }

      if (!isEditMode) {
        setFormState(createEmptyFormState(activeSessionId));
        setAbilityOptionsA([]);
        setAbilityOptionsB([]);
      }
      setIsOpen(false);
    } catch {
      setErrorMessage(
        isEditMode
          ? "Unable to update encounter right now. Please try again."
          : "Unable to save encounter right now. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {trigger ? (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setIsOpen(true);
          }}
          className="inline-flex"
        >
          {trigger}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" />
          Add Encounter
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 dark:bg-slate-900/50">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-background p-5 text-foreground shadow-sm">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                  Capture Engine
                </p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">
                  {isEditMode ? "Edit Pair" : "Add New Encounter"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted/60"
                aria-label={isEditMode ? "Close edit pair modal" : "Close add encounter modal"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Session</label>
                <div className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                  {activeSessionId || "No active session"}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Location</label>
                <input
                  type="text"
                  value={formState.location}
                  onChange={(event) =>
                    setFormState((state) => ({ ...state, location: event.target.value }))
                  }
                  placeholder="e.g. Route 34"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
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
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
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
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <AbilityCombobox
                  label="Ability A"
                  value={formState.ability_a}
                  options={abilityOptionsA}
                  onChange={(ability_a) => setFormState((state) => ({ ...state, ability_a }))}
                  placeholder="Select or type ability..."
                />
                <AbilityCombobox
                  label="Ability B"
                  value={formState.ability_b}
                  options={abilityOptionsB}
                  onChange={(ability_b) => setFormState((state) => ({ ...state, ability_b }))}
                  placeholder="Select or type ability..."
                />
              </div>

              {errorMessage && (
                <p className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                  {errorMessage}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!hasSession || isSaving || !formState.ability_a.trim() || !formState.ability_b.trim()}
                  className="rounded-xl border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : isEditMode ? "Save Changes" : "Save Encounter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
