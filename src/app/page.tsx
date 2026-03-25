import { connection } from "next/server";

import { DashboardContent } from "@/components/dashboard-content";
import { supabase } from "@/lib/supabase";

/*
Input: Initial route request for the dashboard page.
Transformation: Fetches server-side snapshots of encounters and sessions to hydrate the client UI.
Output: Returns a client dashboard component that handles rendering and realtime updates.
*/
export default async function Home() {
  await connection();

  const { data: encountersData } = await supabase
    .from("encounters")
    .select(
      "id, session_id, location, pokemon_a, nickname_a, ability_a, pokemon_b, nickname_b, ability_b, status, is_in_party, order_index, created_at",
    )
    .order("created_at", { ascending: false });

  const { data: sessionsData } = await supabase
    .from("sessions")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  return <DashboardContent initialEncounters={encountersData ?? []} sessions={sessionsData ?? []} />;
}
