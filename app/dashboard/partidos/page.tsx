"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronDown, MapPin, Plus, Trophy, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";

type Partido = {
  id: string | number;
  rival: string;
  fecha_hora: string;
  ubicacion: string;
};

type Jugador = {
  id: string | number;
  nombre: string;
  dorsal: number | string | null;
};

type Asistencia = {
  partido_id: string | number;
  usuario_id: string | number;
  estado: string;
};

type EstadoAsistencia = "Voy" | "No voy" | "Pendiente";

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-[#c8ff00] focus:shadow-[0_0_0_3px_rgba(200,255,0,0.15)]";

function asistenciaKey(partidoId: string | number, usuarioId: string | number) {
  return `${partidoId}:${usuarioId}`;
}

function normalizeEstado(estado: string | undefined): EstadoAsistencia {
  const value = estado?.toLowerCase().trim();

  if (value === "voy") return "Voy";
  if (value === "no voy" || value === "no_voy") return "No voy";
  return "Pendiente";
}

function canCreatePartido(rol: string | null | undefined) {
  const value = String(rol ?? "").toLowerCase();
  return value === "admin" || value === "entrenador" || value === "coach";
}

function mergePartido(list: Partido[], partido: Partido) {
  return [...list.filter((item) => String(item.id) !== String(partido.id)), partido].sort(
    (a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime(),
  );
}

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function formatFechaHora(fechaHora: string) {
  const date = new Date(fechaHora);

  if (Number.isNaN(date.getTime())) {
    return fechaHora;
  }

  return date.toLocaleString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PartidosPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [equipoId, setEquipoId] = useState<string | number | null>(null);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [expandedPartidoId, setExpandedPartidoId] = useState<string | number | null>(null);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [rival, setRival] = useState("");
  const [fechaHora, setFechaHora] = useState("");
  const [ubicacion, setUbicacion] = useState("");

  const asistenciasPorClave = useMemo(() => {
    const map = new Map<string, Asistencia>();

    for (const asistencia of asistencias) {
      map.set(asistenciaKey(asistencia.partido_id, asistencia.usuario_id), asistencia);
    }

    return map;
  }, [asistencias]);

  const loadPartidos = useCallback(async () => {
    setError("");
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      router.replace("/");
      return;
    }

    const { data: usuario, error: usuarioError } = await supabase
      .from("usuarios")
      .select("equipo_id, rol")
      .eq("email", user.email)
      .maybeSingle();

    if (usuarioError) {
      setError(usuarioError.message);
      setIsLoading(false);
      return;
    }

    if (!usuario?.equipo_id) {
      setError("Completa el onboarding para ver los partidos de tu equipo.");
      setIsLoading(false);
      return;
    }

    setEquipoId(usuario.equipo_id);
    setCanCreate(canCreatePartido(usuario.rol));

    const [partidosResult, jugadoresResult] = await Promise.all([
      supabase
        .from("partidos")
        .select("id, rival, fecha_hora, ubicacion")
        .eq("equipo_id", usuario.equipo_id)
        .gte("fecha_hora", startOfTodayIso())
        .order("fecha_hora", { ascending: true }),
      supabase
        .from("usuarios")
        .select("id, nombre, dorsal")
        .eq("equipo_id", usuario.equipo_id)
        .order("nombre", { ascending: true }),
    ]);

    if (partidosResult.error) {
      setError(partidosResult.error.message);
      setIsLoading(false);
      return;
    }

    if (jugadoresResult.error) {
      setError(jugadoresResult.error.message);
      setIsLoading(false);
      return;
    }

    const partidosData = partidosResult.data ?? [];
    setPartidos(partidosData);
    setJugadores(jugadoresResult.data ?? []);

    const partidoIds = partidosData.map((partido) => partido.id);

    if (partidoIds.length === 0) {
      setAsistencias([]);
      setIsLoading(false);
      return;
    }

    const { data: asistenciaData, error: asistenciaError } = await supabase
      .from("asistencia")
      .select("partido_id, usuario_id, estado")
      .in("partido_id", partidoIds);

    if (asistenciaError) {
      setError(asistenciaError.message);
      setIsLoading(false);
      return;
    }

    setAsistencias(asistenciaData ?? []);
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    void loadPartidos();
  }, [loadPartidos]);

  async function handleCreatePartido(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFormError("");

    if (!rival.trim() || !fechaHora || !ubicacion.trim()) {
      const message = "Completa rival, fecha y hora, y ubicación.";
      setFormError(message);
      setError(message);
      return;
    }

    setIsSaving(true);
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      const message = userError?.message ?? "No se pudo obtener el usuario actual.";
      console.error("Error al crear partido:", userError);
      setFormError(message);
      setError(message);
      setIsSaving(false);
      return;
    }

    const { data: usuario, error: usuarioError } = await supabase
      .from("usuarios")
      .select("equipo_id")
      .eq("email", user.email)
      .maybeSingle();

    const equipoIdActual = usuario?.equipo_id ?? equipoId;

    if (usuarioError || !equipoIdActual) {
      const message =
        usuarioError?.message ?? "No se encontró el equipo_id del usuario para crear el partido.";
      console.error("Error al crear partido:", usuarioError, { email: user.email, equipoId });
      setFormError(message);
      setError(message);
      setIsSaving(false);
      return;
    }

    setEquipoId(equipoIdActual);

    const payload = {
      rival: rival.trim(),
      fecha_hora: new Date(fechaHora).toISOString(),
      ubicacion: ubicacion.trim(),
      equipo_id: equipoIdActual,
    };

    const { data: partidoCreado, error: insertError } = await supabase
      .from("partidos")
      .insert(payload)
      .select("id, rival, fecha_hora, ubicacion")
      .single();

    if (insertError || !partidoCreado) {
      const message =
        insertError?.message ?? "El partido se envió, pero no se recibió confirmación de guardado.";
      console.error("Error al crear partido:", insertError, payload);
      setFormError(message);
      setError(message);
      setIsSaving(false);
      return;
    }

    setPartidos((current) => mergePartido(current, partidoCreado));
    setRival("");
    setFechaHora("");
    setUbicacion("");
    setFormError("");
    setIsModalOpen(false);
    setIsSaving(false);
    router.refresh();
    await loadPartidos();
    setPartidos((current) => mergePartido(current, partidoCreado));
  }

  async function handleSetAsistencia(
    partidoId: string | number,
    usuarioId: string | number,
    estado: EstadoAsistencia,
  ) {
    const key = asistenciaKey(partidoId, usuarioId);
    const anterior = asistencias;

    setError("");
    setUpdatingKey(key);
    setAsistencias((current) => {
      const resto = current.filter(
        (item) => asistenciaKey(item.partido_id, item.usuario_id) !== key,
      );

      return [
        ...resto,
        {
          partido_id: partidoId,
          usuario_id: usuarioId,
          estado,
        },
      ];
    });

    const supabase = createSupabaseBrowserClient();
    const { error: upsertError } = await supabase.from("asistencia").upsert(
      {
        partido_id: partidoId,
        usuario_id: usuarioId,
        estado,
      },
      { onConflict: "partido_id,usuario_id" },
    );

    if (upsertError) {
      setAsistencias(anterior);
      setError(upsertError.message);
    }

    setUpdatingKey(null);
  }

  return (
    <main className="min-h-screen px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#c8ff00]">
              Competencia
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-tight text-white md:text-4xl">
              <Trophy className="h-8 w-8 text-[#c8ff00]" />
              Partidos
            </h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Agenda los próximos encuentros y confirma quién se suma a la convocatoria.
            </p>
          </div>

          {canCreate ? (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#c8ff00] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#121212] transition hover:bg-[#d6ff4d] hover:shadow-[0_0_24px_rgba(200,255,0,0.45)]"
            >
              <Plus className="h-4 w-4" />
              Crear Nuevo Partido
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-44 animate-pulse rounded-2xl border border-white/10 bg-[#1a1a1a]"
              />
            ))}
          </div>
        ) : partidos.length === 0 ? (
          <section className="mt-10 rounded-3xl border border-dashed border-white/15 bg-[#1a1a1a]/80 px-6 py-16 text-center">
            <CalendarClock className="mx-auto h-10 w-10 text-[#c8ff00]" />
            <h2 className="mt-4 text-xl font-bold text-white">No hay próximos partidos</h2>
            <p className="mt-2 text-sm text-zinc-400">
              {canCreate
                ? "Crea el primer partido para armar la convocatoria."
                : "Cuando el staff cree un partido, aparecerá aquí."}
            </p>
          </section>
        ) : (
          <section className="mt-10 grid gap-4 md:grid-cols-2">
            {partidos.map((partido) => {
              const isExpanded = expandedPartidoId === partido.id;
              const resumen = jugadores.reduce(
                (acc, jugador) => {
                  const estado = normalizeEstado(
                    asistenciasPorClave.get(asistenciaKey(partido.id, jugador.id))?.estado,
                  );

                  if (estado === "Voy") acc.voy += 1;
                  else if (estado === "No voy") acc.noVoy += 1;
                  else acc.pendiente += 1;

                  return acc;
                },
                { voy: 0, noVoy: 0, pendiente: 0 },
              );

              return (
                <article
                  key={partido.id}
                  className={`rounded-2xl border bg-[#1a1a1a] p-6 shadow-[0_0_40px_rgba(0,0,0,0.25)] transition ${
                    isExpanded
                      ? "border-[#c8ff00]/30 md:col-span-2"
                      : "border-white/10 hover:border-[#c8ff00]/30"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c8ff00]">
                    Próximo partido
                  </p>
                  <h2 className="mt-3 text-2xl font-black text-white">vs {partido.rival}</h2>
                  <p className="mt-4 text-sm text-zinc-300">{formatFechaHora(partido.fecha_hora)}</p>
                  <p className="mt-2 flex items-center gap-2 text-sm text-zinc-400">
                    <MapPin className="h-4 w-4 text-[#c8ff00]" />
                    {partido.ubicacion}
                  </p>
                  <p className="mt-3 text-xs text-zinc-500">
                    {resumen.voy} van · {resumen.noVoy} no van · {resumen.pendiente} pendientes
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedPartidoId((current) =>
                        current === partido.id ? null : partido.id,
                      )
                    }
                    className="mt-5 inline-flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#121212] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-[#c8ff00]/40 hover:text-[#c8ff00]"
                  >
                    Ver Asistencia
                    <ChevronDown
                      className={`h-4 w-4 transition ${isExpanded ? "rotate-180 text-[#c8ff00]" : ""}`}
                    />
                  </button>

                  {isExpanded ? (
                    <ul className="mt-4 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
                      {jugadores.length === 0 ? (
                        <li className="px-4 py-5 text-sm text-zinc-400">
                          Todavía no hay jugadores en este equipo.
                        </li>
                      ) : (
                        jugadores.map((jugador) => {
                          const key = asistenciaKey(partido.id, jugador.id);
                          const estado = normalizeEstado(asistenciasPorClave.get(key)?.estado);
                          const isUpdating = updatingKey === key;

                          return (
                            <li
                              key={jugador.id}
                              className="flex flex-col gap-3 bg-[#141414] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <p className="font-medium text-white">{jugador.nombre}</p>
                                {jugador.dorsal !== null && jugador.dorsal !== undefined ? (
                                  <p className="text-xs text-zinc-500">Dorsal #{jugador.dorsal}</p>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(
                                  [
                                    ["Voy", "bg-[#c8ff00] text-[#121212] hover:bg-[#d6ff4d]"],
                                    ["No voy", "bg-red-500/15 text-red-300 ring-1 ring-red-500/40 hover:bg-red-500/25"],
                                    ["Pendiente", "bg-zinc-700/80 text-zinc-300 hover:bg-zinc-600"],
                                  ] as const
                                ).map(([opcion, clasesActivas]) => {
                                  const selected = estado === opcion;

                                  return (
                                    <button
                                      key={opcion}
                                      type="button"
                                      disabled={isUpdating}
                                      onClick={() =>
                                        void handleSetAsistencia(partido.id, jugador.id, opcion)
                                      }
                                      className={`rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-70 ${
                                        selected
                                          ? clasesActivas
                                          : "bg-white/5 text-zinc-500 hover:text-zinc-300"
                                      }`}
                                    >
                                      {opcion}
                                    </button>
                                  );
                                })}
                              </div>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </section>
        )}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Cerrar modal"
            onClick={() => setIsModalOpen(false)}
          />
          <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#1a1a1a] p-6 shadow-[0_0_80px_rgba(200,255,0,0.08)]">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#c8ff00]">
                  Nuevo partido
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">Crear partido</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-white/10 p-2 text-zinc-300 transition hover:text-white"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleCreatePartido}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">Rival</span>
                <input
                  type="text"
                  required
                  value={rival}
                  onChange={(event) => setRival(event.target.value)}
                  placeholder="Club Atlético Rival"
                  className={inputClassName}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">
                  Fecha y Hora
                </span>
                <input
                  type="datetime-local"
                  required
                  value={fechaHora}
                  onChange={(event) => setFechaHora(event.target.value)}
                  className={inputClassName}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">
                  Ubicación (cancha)
                </span>
                <input
                  type="text"
                  required
                  value={ubicacion}
                  onChange={(event) => setUbicacion(event.target.value)}
                  placeholder="Cancha municipal, sector norte"
                  className={inputClassName}
                />
              </label>

              {formError ? (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {formError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSaving}
                className="w-full rounded-xl bg-[#c8ff00] px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#121212] transition hover:bg-[#d6ff4d] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Guardando..." : "Guardar partido"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
