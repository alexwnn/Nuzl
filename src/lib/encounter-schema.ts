import { z } from "zod";

/*
Input: Raw form values captured from the Add Encounter modal.
Transformation: Validates and normalizes inputs against the `encounters` table shape.
Output: A safe `EncounterInsertInput` object used for typed Supabase inserts.
*/
export const encounterInsertSchema = z.object({
  session_id: z.string().trim().min(1, "Please select a valid session."),
  location: z.string().trim().min(1).max(80),
  pokemon_a: z.string().trim().min(1).max(40).transform((value) => value.toLowerCase()),
  nickname_a: z.string().trim().min(1).max(40),
  ability_a: z.string().trim().min(1).max(40),
  pokemon_b: z.string().trim().min(1).max(40).transform((value) => value.toLowerCase()),
  nickname_b: z.string().trim().min(1).max(40),
  ability_b: z.string().trim().min(1).max(40),
  status: z.literal("alive").default("alive"),
  is_in_party: z.boolean().default(false),
  is_fainted: z.boolean().default(false),
  order_index: z.number().int().nonnegative().nullable().default(null),
});

export type EncounterInsertInput = z.infer<typeof encounterInsertSchema>;
