"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

/*
Input: Visitor arriving at the root route (`/`).
Transformation: Generates a short shareable session slug and redirects into the dynamic session dashboard route.
Output: Sends users to `/session/[sessionId]` where live run state is loaded.
*/
function generateSessionId() {
  const colors = ["blue", "emerald", "violet", "scarlet", "gold", "silver"];
  const pokemon = ["mew", "eevee", "riolu", "torchic", "gible", "zorua"];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const randomPokemon = pokemon[Math.floor(Math.random() * pokemon.length)];
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${randomColor}-${randomPokemon}-${suffix}`;
}

export default function Home() {
  const router = useRouter();

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-screen-md place-items-center px-6 py-12">
      <div className="w-full rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Nuzl Session Hub</p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">Start a Shared Run</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a unique session link and invite friends to track the same Soul Link run.
        </p>
        <button
          type="button"
          onClick={() => router.push(`/session/${generateSessionId()}`)}
          className="mt-6 inline-flex items-center gap-2 rounded-xl border border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:bg-emerald-500/25"
        >
          <Plus className="h-4 w-4" />
          Start New Session
        </button>
      </div>
    </main>
  );
}
