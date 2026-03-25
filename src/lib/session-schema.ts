import { z } from "zod";

/*
Input: Raw session form values provided by users from modal/gallery forms.
Transformation: Validates and trims the session name to match the `sessions` table expectations.
Output: Safe typed session payloads used for Supabase inserts.
*/
export const sessionInsertSchema = z.object({
  name: z.string().trim().min(1, "Session name is required.").max(80),
});

export type SessionInsertInput = z.infer<typeof sessionInsertSchema>;
