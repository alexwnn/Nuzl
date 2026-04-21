import { connection } from "next/server";

import { DashboardContent } from "@/components/dashboard-content";
import { supabase } from "@/lib/supabase";

type SessionDashboardPageProps = {
  params: {
    sessionId: string;
  };
};

async function withTimeout<T>(task: () => PromiseLike<T>, timeoutMs = 5000): Promise<T> {
  return await Promise.race([
    task(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Session resolver timed out.")), timeoutMs)),
  ]);
}

/*
Input: Dynamic route parameter (`sessionId`) from `/session/[sessionId]`.
Transformation: Fetches encounters directly scoped by the URL slug (brute-force room isolation).
Output: Renders the dashboard preloaded with this room's encounters; client re-fetches on sessionId change.
*/
export default async function SessionDashboardPage({ params }: SessionDashboardPageProps) {
  await connection();
  const slug = decodeURIComponent(params.sessionId);

  // Best-effort session row upsert so /sessions gallery lookups keep working.
  // The dashboard itself filters encounters by the URL slug, not by a UUID.
  try {
    const { data: existingSession } = await withTimeout(() =>
      supabase
        .from("sessions")
        .select("id")
        .eq("name", slug)
        .limit(1)
        .maybeSingle(),
    );

    if (!existingSession) {
      await withTimeout(() => supabase.from("sessions").insert({ name: slug }).select("id").single());
    }
  } catch {
    // Non-fatal: if sessions bookkeeping fails the dashboard still works off the URL slug.
  }

  const { data: encountersData } = await withTimeout(() =>
    supabase
      .from("encounters")
      .select(
        "id, session_id, location, pokemon_a, nickname_a, ability_a, pokemon_b, nickname_b, ability_b, status, is_in_party, is_fainted, order_index, created_at",
      )
      .eq("session_id", slug)
      .order("created_at", { ascending: false }),
  );

  return <DashboardContent initialEncounters={encountersData ?? []} />;
}
