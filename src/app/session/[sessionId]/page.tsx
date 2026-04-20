import { connection } from "next/server";

import { DashboardContent } from "@/components/dashboard-content";
import { supabase } from "@/lib/supabase";
import type { SessionRow } from "@/lib/database.types";

type SessionDashboardPageProps = {
  params: {
    sessionId: string;
  };
};

/*
Input: Dynamic route parameter (`sessionId`) from `/session/[sessionId]`.
Transformation: Resolves or creates a session row mapped to that slug, then fetches encounters for the session.
Output: Returns dashboard content scoped to one shareable session link.
*/
export default async function SessionDashboardPage({ params }: SessionDashboardPageProps) {
  await connection();
  const slug = decodeURIComponent(params.sessionId);

  let sessionRow: SessionRow | null = null;

  const { data: existingSession, error: existingSessionError } = await supabase
    .from("sessions")
    .select("id, name, created_at")
    .eq("name", slug)
    .limit(1)
    .maybeSingle();

  if (existingSessionError) {
    throw new Error(existingSessionError.message);
  }

  if (existingSession) {
    sessionRow = existingSession;
  } else {
    const { data: createdSession, error: createSessionError } = await supabase
      .from("sessions")
      .insert({ name: slug })
      .select("id, name, created_at")
      .single();

    if (createSessionError) {
      throw new Error(createSessionError.message);
    }

    sessionRow = createdSession;
  }

  const { data: encountersData } = await supabase
    .from("encounters")
    .select(
      "id, session_id, location, pokemon_a, nickname_a, ability_a, pokemon_b, nickname_b, ability_b, status, is_in_party, is_fainted, order_index, created_at",
    )
    .eq("session_id", sessionRow.id)
    .order("created_at", { ascending: false });

  return <DashboardContent initialEncounters={encountersData ?? []} sessions={[sessionRow]} />;
}
