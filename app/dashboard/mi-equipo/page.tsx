"use client";

import { Users } from "lucide-react";

export default function MiEquipoPage() {
  return (
    <main className="min-h-screen px-6 py-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#c8ff00]">
        Plantel
      </p>
      <h1 className="mt-2 flex items-center gap-3 text-3xl font-black text-white">
        <Users className="h-8 w-8 text-[#c8ff00]" />
        Mi Equipo
      </h1>
      <p className="mt-3 max-w-xl text-sm text-zinc-400">
        Este módulo estará disponible en el siguiente sprint.
      </p>
    </main>
  );
}
