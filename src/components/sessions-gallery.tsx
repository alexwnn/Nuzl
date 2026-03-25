"use client";

import { useState } from "react";
import { Plus, Swords } from "lucide-react";

import { CollapsibleSidebar } from "@/components/collapsible-sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionRow } from "@/lib/database.types";
import { sessionInsertSchema } from "@/lib/session-schema";
import { supabase } from "@/lib/supabase";

/*
Input: Initial session rows fetched on the server for `/sessions`.
Transformation: Maintains local gallery state and creates new session rows from a name-only form.
Output: Renders all sessions plus a `+` creation card; new sessions appear immediately in the gallery.
*/
type SessionsGalleryProps = {
  initialSessions: SessionRow[];
};

/*
Input: Existing sessions and a newly created session row.
Transformation: Prepends the new session while removing duplicate IDs.
Output: Updated session list for immediate card rendering.
*/
function upsertSession(current: SessionRow[], nextSession: SessionRow) {
  return [nextSession, ...current.filter((session) => session.id !== nextSession.id)];
}

export function SessionsGallery({ initialSessions }: SessionsGalleryProps) {
  const [sessions, setSessions] = useState<SessionRow[]>(initialSessions);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /*
  Input: Raw session name from the plus-card form.
  Transformation: Validates with Zod and inserts into `sessions`.
  Output: Adds the returned row into gallery state and closes/reset the form.
  */
  async function handleCreateSession() {
    try {
      setIsSaving(true);
      setErrorMessage(null);

      const parsed = sessionInsertSchema.parse({ name });
      const { data, error } = await supabase
        .from("sessions")
        .insert(parsed)
        .select("id, name, created_at")
        .single();

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data) {
        setSessions((current) => upsertSession(current, data));
      }

      setName("");
      setIsCreateOpen(false);
    } catch {
      setErrorMessage("Session name is required.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-[1700px]">
        <CollapsibleSidebar />

        <main className="w-full flex-1 p-4 md:p-6 xl:p-8">
          <section className="mb-6 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/20 via-emerald-500/5 to-transparent p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300/90">Nuzl Sessions</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Run Gallery</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Create and manage run containers before logging encounters.
            </p>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card
              className="cursor-pointer border-dashed border-emerald-500/35 hover:bg-emerald-500/10"
              onClick={() => setIsCreateOpen(true)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl text-emerald-200">
                  <Plus className="h-5 w-5" />
                  New Session
                </CardTitle>
                <CardDescription>Start a new Soul Link / Nuzlocke run.</CardDescription>
              </CardHeader>
            </Card>

            {sessions.map((session) => (
              <Card key={session.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Swords className="h-5 w-5 text-emerald-300" />
                    {session.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-400">
                    Created: {new Date(session.created_at).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
        </main>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-slate-100">Create Session</h2>
            <p className="mt-1 text-sm text-slate-400">Only a run name is required.</p>
            <div className="mt-4 space-y-3">
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. FireRed Soul Link"
                className="w-full rounded-xl border border-emerald-500/20 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              {errorMessage && <p className="text-sm text-red-300">{errorMessage}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateSession()}
                  disabled={isSaving}
                  className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
