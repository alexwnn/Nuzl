/*
Input: Rows coming from Supabase tables `sessions` and `encounters`.
Transformation: Defines strict TypeScript types that mirror table columns for reads/inserts/updates.
Output: Shared `Database` type consumed by Supabase client and UI logic for end-to-end type safety.
*/
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      encounters: {
        Row: {
          id: string;
          // Foreign key: points to sessions.id so each encounter belongs to one run session.
          session_id: string;
          location: string;
          pokemon_a: string;
          nickname_a: string;
          ability_a: string;
          pokemon_b: string;
          nickname_b: string;
          ability_b: string;
          status: string;
          is_in_party: boolean;
          order_index: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          location: string;
          pokemon_a: string;
          nickname_a: string;
          ability_a: string;
          pokemon_b: string;
          nickname_b: string;
          ability_b: string;
          status: string;
          is_in_party?: boolean;
          order_index?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          location?: string;
          pokemon_a?: string;
          nickname_a?: string;
          ability_a?: string;
          pokemon_b?: string;
          nickname_b?: string;
          ability_b?: string;
          status?: string;
          is_in_party?: boolean;
          order_index?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "encounters_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type EncounterRow = Database["public"]["Tables"]["encounters"]["Row"];
export type EncounterInsert = Database["public"]["Tables"]["encounters"]["Insert"];
export type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
