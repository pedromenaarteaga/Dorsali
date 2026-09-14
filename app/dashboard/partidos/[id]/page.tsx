"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  ClipboardList,
  MapPin,
  MessageSquare,
  Shield,
  Trophy,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { JugadorIdentity } from "@/components/jugador-identity";
import {
  notifyNotificationsChanged,
  useNotifications,
} from "@/components/dashboard/notifications";

type Partido = {
  id: string | number;
  rival: string;
  fecha_hora: string;
  ubicacion: string;
  equipo_id: string | number;
};

type Jugador = {
  id: string | number;
  nombre: string;
  dorsal: number | string | null;
};

type Asistencia = {
  usuario_id: string | number;
  estado: string;
};

type Alineacion = {
  usuario_id: string | number;
  posicion: string | null;
  es_titular: boolean;
};

type Analisis = {
  id: string | number;
  usuario_id: string | number;
  mensaje: string;
  created_at?: string | null;
};

type TabId = "nomina" | "tactica" | "analisis";
type EstadoAsistencia = "Voy" | "No voy" | "Pendiente";

const POSICIONES = ["POR", "LI", "DFC", "LD", "MCD", "MC", "MCO", "EI", "ED", "DC"];

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none transition focus:border-[#c8ff00]";

function canManage(rol: string | null | undefined) {
  const value = String(rol ?? "").toLowerCase();
  return value === "admin" || value === "entrenador" || value === "coach";
}

function normalizeEstado(estado: string | undefined): EstadoAsistencia {
  const value = estado?.toLowerCase().trim();
  if (value === "voy") return "Voy";
  if (value === "no voy" || value === "no_voy") return "No voy";
  return "Pendiente";
}

function formatFechaHora(fechaHora: string) {
  const date = new Date(fechaHora);
  if (Number.isNaN(date.getTime())) return fechaHora;

  return date.toLocaleString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCommentTime(value: string | null | undefined) {
  if (!value) return "Ahora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";

  return date.toLocaleString("es-CL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PartidoDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const partidoId = params.id;
  const { refreshNotifications } = useNotifications();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tab, setTab] = useState<TabId>("nomina");
  const [isStaff, setIsStaff] = useState(false);
  const [usuarioId, setUsuarioId] = useState<string | number | null>(null);
  const [partido, setPartido] = useState<Partido | null>(null);
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [alineaciones, setAlineaciones] = useState<Alineacion[]>([]);
  const [analisis, setAnalisis] = useState<Analisis[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const asistenciaPorJugador = useMemo(() => {
    const map = new Map<string, Asistencia>();
    for (const item of asistencias) map.set(String(item.usuario_id), item);
    return map;
  }, [asistencias]);

  const alineacionPorJugador = useMemo(() => {
    const map = new Map<string, Alineacion>();
    for (const item of alineaciones) map.set(String(item.usuario_id), item);
    return map;
  }, [alineaciones]);

  const convocados = useMemo(
    () => jugadores.filter((jugador) => asistenciaPorJugador.has(String(jugador.id))),
    [jugadores, asistenciaPorJugador],
  );

  const titulares = convocados.filter(
    (jugador) => alineacionPorJugador.get(String(jugador.id))?.es_titular,
  );
  const suplentes = convocados.filter(
    (jugador) => !alineacionPorJugador.get(String(jugador.id))?.es_titular,
  );

  const miAsistencia = usuarioId
    ? normalizeEstado(asistenciaPorJugador.get(String(usuarioId))?.estado)
    : null;
  const estoyConvocado = Boolean(usuarioId && asistenciaPorJugador.has(String(usuarioId)));

  const loadPartido = useCallback(async () => {
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
      .select("id, equipo_id, rol")
      .eq("email", user.email)
      .maybeSingle();

    if (usuarioError || !usuario?.id || !usuario.equipo_id) {
      setError(usuarioError?.message ?? "No se encontró tu perfil de equipo.");
      setIsLoading(false);
      return;
    }

    setUsuarioId(usuario.id);
    setIsStaff(canManage(usuario.rol));

    const { data: partidoData, error: partidoError } = await supabase
      .from("partidos")
      .select("id, rival, fecha_hora, ubicacion, equipo_id")
      .eq("id", partidoId)
      .maybeSingle();

    if (partidoError || !partidoData) {
      setError(partidoError?.message ?? "No se encontró el partido.");
      setIsLoading(false);
      return;
    }

    setPartido(partidoData);

    const [jugadoresResult, asistenciaResult, alineacionResult, analisisResult] = await Promise.all([
      supabase
        .from("usuarios")
        .select("id, nombre, dorsal")
        .eq("equipo_id", partidoData.equipo_id)
        .order("nombre", { ascending: true }),
      supabase.from("asistencia").select("usuario_id, estado").eq("partido_id", partidoId),
      supabase
        .from("alineaciones")
        .select("usuario_id, posicion, es_titular")
        .eq("partido_id", partidoId),
      supabase
        .from("analisis_partidos")
        .select("id, usuario_id, mensaje, created_at")
        .eq("partido_id", partidoId)
        .order("created_at", { ascending: true }),
    ]);

    if (jugadoresResult.error) setError(jugadoresResult.error.message);
    if (asistenciaResult.error) setError(asistenciaResult.error.message);
    if (alineacionResult.error) setError(alineacionResult.error.message);
    if (analisisResult.error) setError(analisisResult.error.message);

    setJugadores(jugadoresResult.data ?? []);
    setAsistencias(asistenciaResult.data ?? []);
    setAlineaciones(alineacionResult.data ?? []);
    setAnalisis(analisisResult.data ?? []);
    setIsLoading(false);
  }, [partidoId, router]);

  useEffect(() => {
    void loadPartido();
  }, [loadPartido]);

  async function handleConvocar(jugador: Jugador, convocar: boolean) {
    if (!partido) return;
    setError("");
    setSuccess("");
    setUpdatingId(String(jugador.id));
    const supabase = createSupabaseBrowserClient();

    if (!convocar) {
      const { error: deleteError } = await supabase
        .from("asistencia")
        .delete()
        .eq("partido_id", partido.id)
        .eq("usuario_id", jugador.id);

      if (deleteError) {
        console.error("Error al quitar convocatoria:", deleteError);
        setError(deleteError.message);
        setUpdatingId(null);
        return;
      }

      await supabase
        .from("alineaciones")
        .delete()
        .eq("partido_id", partido.id)
        .eq("usuario_id", jugador.id);

      setAsistencias((current) => current.filter((item) => String(item.usuario_id) !== String(jugador.id)));
      setAlineaciones((current) => current.filter((item) => String(item.usuario_id) !== String(jugador.id)));
      setUpdatingId(null);
      return;
    }

    const asistenciaPromise = supabase.from("asistencia").upsert(
      {
        partido_id: partido.id,
        usuario_id: jugador.id,
        estado: "Pendiente",
      },
      { onConflict: "partido_id,usuario_id" },
    );

    const notificacionPromise = supabase.from("notificaciones").insert({
      usuario_id: jugador.id,
      titulo: "¡Estás convocado!",
      mensaje: `Has sido convocado para el partido contra ${partido.rival}`,
      leida: false,
    });

    const [asistenciaResult, notificacionResult] = await Promise.all([
      asistenciaPromise,
      notificacionPromise,
    ]);

    if (asistenciaResult.error) {
      console.error("Error al convocar:", asistenciaResult.error);
      setError(asistenciaResult.error.message);
      setUpdatingId(null);
      return;
    }

    if (notificacionResult.error) {
      console.error("Error al notificar convocatoria:", notificacionResult.error, {
        usuario_id: jugador.id,
        rival: partido.rival,
      });
      setError(`Convocado, pero la notificación falló: ${notificacionResult.error.message}`);
    } else {
      setSuccess(`${jugador.nombre} fue convocado y notificado.`);
    }

    setAsistencias((current) => [
      ...current.filter((item) => String(item.usuario_id) !== String(jugador.id)),
      { usuario_id: jugador.id, estado: "Pendiente" },
    ]);

    notifyNotificationsChanged();
    await refreshNotifications();
    router.refresh();
    setUpdatingId(null);
  }

  async function handleMiAsistencia(estado: EstadoAsistencia) {
    if (!partido || !usuarioId) return;
    setUpdatingId(String(usuarioId));
    const supabase = createSupabaseBrowserClient();
    const { error: upsertError } = await supabase.from("asistencia").upsert(
      {
        partido_id: partido.id,
        usuario_id: usuarioId,
        estado,
      },
      { onConflict: "partido_id,usuario_id" },
    );

    if (upsertError) {
      setError(upsertError.message);
      setUpdatingId(null);
      return;
    }

    setAsistencias((current) =>
      current.map((item) =>
        String(item.usuario_id) === String(usuarioId) ? { ...item, estado } : item,
      ),
    );
    setUpdatingId(null);
  }

  async function saveAlineacion(usuarioIdJugador: string | number, patch: Partial<Alineacion>) {
    if (!partido) return;
    const actual = alineacionPorJugador.get(String(usuarioIdJugador));
    const next: Alineacion = {
      usuario_id: usuarioIdJugador,
      posicion: patch.posicion ?? actual?.posicion ?? null,
      es_titular: patch.es_titular ?? actual?.es_titular ?? false,
    };

    if (next.es_titular) {
      const otrosTitulares = alineaciones.filter(
        (item) => item.es_titular && String(item.usuario_id) !== String(usuarioIdJugador),
      );
      if (otrosTitulares.length >= 11) {
        setError("El 11 inicial ya está completo.");
        return;
      }
    }

    setAlineaciones((current) => [
      ...current.filter((item) => String(item.usuario_id) !== String(usuarioIdJugador)),
      next,
    ]);

    const supabase = createSupabaseBrowserClient();
    const { error: upsertError } = await supabase.from("alineaciones").upsert(
      {
        partido_id: partido.id,
        usuario_id: next.usuario_id,
        posicion: next.posicion,
        es_titular: next.es_titular,
      },
      { onConflict: "partido_id,usuario_id" },
    );

    if (upsertError) {
      console.error("Error al guardar alineación:", upsertError);
      setError(upsertError.message);
      await loadPartido();
    }
  }

  async function handleComentario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!partido || !usuarioId || !comentario.trim()) return;

    setSavingComment(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { data, error: insertError } = await supabase
      .from("analisis_partidos")
      .insert({
        partido_id: partido.id,
        usuario_id: usuarioId,
        mensaje: comentario.trim(),
      })
      .select("id, usuario_id, mensaje, created_at")
      .single();

    if (insertError || !data) {
      console.error("Error al publicar análisis:", insertError);
      setError(insertError?.message ?? "No se pudo publicar el análisis.");
      setSavingComment(false);
      return;
    }

    setAnalisis((current) => [...current, data]);
    setComentario("");
    setSavingComment(false);
  }

  if (isLoading) {
    return (
      <main className="min-h-screen px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="h-40 animate-pulse rounded-3xl border border-white/10 bg-[#1a1a1a]" />
        </div>
      </main>
    );
  }

  if (!partido) {
    return (
      <main className="min-h-screen px-6 py-8 lg:px-10">
        <p className="text-sm text-red-300">{error || "Partido no encontrado."}</p>
        <Link href="/dashboard/partidos" className="mt-4 inline-flex text-[#c8ff00]">
          Volver a Partidos
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard/partidos"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-[#c8ff00]"
        >
          <ArrowLeft className="h-4 w-4" />
          Partidos
        </Link>

        <section className="mt-5 rounded-3xl border border-white/10 bg-[#1a1a1a] p-6">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#c8ff00]">
            <Trophy className="h-4 w-4" />
            Ficha del partido
          </p>
          <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">vs {partido.rival}</h1>
          <div className="mt-4 flex flex-col gap-2 text-sm text-zinc-300 sm:flex-row sm:gap-6">
            <p className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-[#c8ff00]" />
              {formatFechaHora(partido.fecha_hora)}
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#c8ff00]" />
              {partido.ubicacion}
            </p>
          </div>
        </section>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-4 rounded-xl border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-4 py-3 text-sm text-[#c8ff00]">
            {success}
          </p>
        ) : null}

        <div className="mt-6 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#161616] p-1">
          {(
            [
              ["nomina", "Nómina", ClipboardList],
              ["tactica", "Táctica", Shield],
              ["analisis", "Análisis", MessageSquare],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex min-w-28 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                tab === id
                  ? "bg-[#c8ff00] text-[#121212]"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === "nomina" ? (
          <section className="mt-6 rounded-3xl border border-white/10 bg-[#1a1a1a] p-5 sm:p-6">
            {isStaff ? (
              <>
                <h2 className="text-xl font-black text-white">Convocatoria</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Activa el switch para convocar. El jugador recibe una notificación automática.
                </p>
                <ul className="mt-5 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
                  {jugadores.map((jugador) => {
                    const convocado = asistenciaPorJugador.has(String(jugador.id));
                    const estado = normalizeEstado(
                      asistenciaPorJugador.get(String(jugador.id))?.estado,
                    );

                    return (
                      <li
                        key={jugador.id}
                        className="flex items-center justify-between gap-4 bg-[#141414] px-4 py-3"
                      >
                        <div className="min-w-0">
                          <JugadorIdentity nombre={jugador.nombre} dorsal={jugador.dorsal} />
                          {convocado ? (
                            <p className="mt-1 pl-[52px] text-xs text-zinc-500">Estado: {estado}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={updatingId === String(jugador.id)}
                          onClick={() => void handleConvocar(jugador, !convocado)}
                          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                            convocado ? "bg-[#c8ff00]" : "bg-zinc-700"
                          }`}
                          aria-label="Convocar"
                        >
                          <span
                            className={`absolute top-1 h-5 w-5 rounded-full bg-[#121212] transition ${
                              convocado ? "left-6" : "left-1"
                            }`}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <div>
                <h2 className="text-xl font-black text-white">Tu convocatoria</h2>
                {estoyConvocado ? (
                  <>
                    <p className="mt-2 text-sm text-zinc-400">
                      Estás convocado para este partido. Confirma o rechaza tu asistencia.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {(["Voy", "No voy", "Pendiente"] as const).map((opcion) => (
                        <button
                          key={opcion}
                          type="button"
                          disabled={updatingId === String(usuarioId)}
                          onClick={() => void handleMiAsistencia(opcion)}
                          className={`rounded-xl px-4 py-3 text-xs font-black uppercase tracking-[0.12em] transition ${
                            miAsistencia === opcion
                              ? opcion === "Voy"
                                ? "bg-[#c8ff00] text-[#121212]"
                                : opcion === "No voy"
                                  ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/40"
                                  : "bg-zinc-600 text-white"
                              : "bg-white/5 text-zinc-400"
                          }`}
                        >
                          {opcion}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-3 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-zinc-500">
                    Aún no has sido convocado para este partido.
                  </p>
                )}
              </div>
            )}
          </section>
        ) : null}

        {tab === "tactica" ? (
          <section className="mt-6 space-y-4">
            {convocados.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-white/10 bg-[#1a1a1a] px-4 py-10 text-center text-sm text-zinc-500">
                Todavía no hay jugadores convocados.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <TacticaColumn
                  title="11 inicial"
                  hint={isStaff ? "Arrastra o marca titulares (máx. 11)" : "Titulares definidos por el DT"}
                  jugadores={titulares}
                  alineacionPorJugador={alineacionPorJugador}
                  isStaff={isStaff}
                  onDrop={() => {
                    if (draggingId) void saveAlineacion(draggingId, { es_titular: true });
                    setDraggingId(null);
                  }}
                  onDragStart={setDraggingId}
                  onChangePosicion={(id, posicion) => void saveAlineacion(id, { posicion })}
                  onToggleTitular={(id, esTitular) => void saveAlineacion(id, { es_titular: esTitular })}
                />
                <TacticaColumn
                  title="Suplentes"
                  hint={isStaff ? "Banca y posibles cambios" : "Suplentes definidos por el DT"}
                  jugadores={suplentes}
                  alineacionPorJugador={alineacionPorJugador}
                  isStaff={isStaff}
                  onDrop={() => {
                    if (draggingId) void saveAlineacion(draggingId, { es_titular: false });
                    setDraggingId(null);
                  }}
                  onDragStart={setDraggingId}
                  onChangePosicion={(id, posicion) => void saveAlineacion(id, { posicion })}
                  onToggleTitular={(id, esTitular) => void saveAlineacion(id, { es_titular: esTitular })}
                />
              </div>
            )}
          </section>
        ) : null}

        {tab === "analisis" ? (
          <section className="mt-6 rounded-3xl border border-white/10 bg-[#1a1a1a] p-5 sm:p-6">
            <h2 className="text-xl font-black text-white">Muro de análisis</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Instrucciones pre-partido, táctica y conclusiones post-partido.
            </p>

            {isStaff ? (
              <form className="mt-5 space-y-3" onSubmit={handleComentario}>
                <textarea
                  rows={4}
                  value={comentario}
                  onChange={(event) => setComentario(event.target.value)}
                  placeholder="Escribe el análisis o una instrucción para el grupo..."
                  className={`${inputClassName} resize-none px-4 py-3`}
                />
                <button
                  type="submit"
                  disabled={savingComment || !comentario.trim()}
                  className="rounded-xl bg-[#c8ff00] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-[#121212] transition hover:bg-[#d6ff4d] disabled:opacity-60"
                >
                  {savingComment ? "Publicando..." : "Publicar análisis"}
                </button>
              </form>
            ) : null}

            <ul className="mt-6 space-y-3">
              {analisis.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
                  Todavía no hay análisis para este partido.
                </li>
              ) : (
                analisis.map((item) => {
                  const autor = jugadores.find((jugador) => String(jugador.id) === String(item.usuario_id));

                  return (
                    <li key={item.id} className="rounded-2xl border border-white/10 bg-[#121212] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">
                          {autor?.nombre ?? "Cuerpo técnico"}
                        </p>
                        <span className="text-xs text-zinc-500">{formatCommentTime(item.created_at)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                        {item.mensaje}
                      </p>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function TacticaColumn({
  title,
  hint,
  jugadores,
  alineacionPorJugador,
  isStaff,
  onDrop,
  onDragStart,
  onChangePosicion,
  onToggleTitular,
}: {
  title: string;
  hint: string;
  jugadores: Jugador[];
  alineacionPorJugador: Map<string, Alineacion>;
  isStaff: boolean;
  onDrop: () => void;
  onDragStart: (id: string) => void;
  onChangePosicion: (id: string | number, posicion: string) => void;
  onToggleTitular: (id: string | number, esTitular: boolean) => void;
}) {
  return (
    <article
      className="rounded-3xl border border-white/10 bg-[#1a1a1a] p-5"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <h2 className="text-lg font-black text-white">{title}</h2>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
      <ul className="mt-4 min-h-40 space-y-3">
        {jugadores.length === 0 ? (
          <li className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-zinc-600">
            Suelta jugadores aquí
          </li>
        ) : (
          jugadores.map((jugador) => {
            const alineacion = alineacionPorJugador.get(String(jugador.id));

            return (
              <li
                key={jugador.id}
                draggable={isStaff}
                onDragStart={() => onDragStart(String(jugador.id))}
                className="rounded-2xl border border-white/10 bg-[#141414] p-3"
              >
                <JugadorIdentity nombre={jugador.nombre} dorsal={jugador.dorsal} />
                {isStaff ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <select
                      value={alineacion?.posicion ?? ""}
                      onChange={(event) => onChangePosicion(jugador.id, event.target.value)}
                      className={inputClassName}
                    >
                      <option value="">Posición</option>
                      {POSICIONES.map((posicion) => (
                        <option key={posicion} value={posicion}>
                          {posicion}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onToggleTitular(jugador.id, !alineacion?.es_titular)}
                      className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] ${
                        alineacion?.es_titular
                          ? "bg-[#c8ff00] text-[#121212]"
                          : "bg-white/5 text-zinc-400"
                      }`}
                    >
                      {alineacion?.es_titular ? "Titular" : "Suplente"}
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500">
                    {alineacion?.posicion || "Sin posición"} · {alineacion?.es_titular ? "Titular" : "Suplente"}
                  </p>
                )}
              </li>
            );
          })
        )}
      </ul>
    </article>
  );
}
