import { connection } from "next/server";

import { SessionsGallery } from "@/components/sessions-gallery";
import { supabase } from "@/lib/supabase";

/*
Input: Request for the `/sessions` route.
Transformation: Fetches current session rows as the initial gallery snapshot.
Output: Passes sessions into a client gallery that can create new runs in-place.
*/
export default async function SessionsPage() {
  await connection();

  const { data } = await supabase
    .from("sessions")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  return <SessionsGallery initialSessions={data ?? []} />;
}
