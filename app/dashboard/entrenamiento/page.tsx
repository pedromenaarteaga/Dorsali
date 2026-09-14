"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Dumbbell, ExternalLink, Plus, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";

type Entrenamiento = {
  id: string | number;
  titulo: string;
  descripcion: string | null;
  video_url: string | null;
};

type Registro = {
  entrenamiento_id: string | number;
  usuario_id: string | number;
  minutos: number | string;
  rpe: number | string;
  completado?: boolean;
};

type CheckinDraft = {
  minutos: string;
  rpe: string;
};

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-[#c8ff00] focus:shadow-[0_0_0_3px_rgba(200,255,0,0.15)]";

function canAssignTraining(rol: string | null | undefined) {
  const value = String(rol ?? "").toLowerCase();
  return value === "admin" || value === "entrenador" || value === "coach";
}

function getYoutubeEmbedUrl(url: string | null | undefined) {
  if (!url) return null;

  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace("www.", "");

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname.startsWith("/embed/")) {
        const id = parsed.pathname.split("/")[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }

      if (parsed.pathname.startsWith("/shorts/")) {
        const id = parsed.pathname.split("/")[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }

      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }

  return null;
}

function mergeEntrenamiento(list: Entrenamiento[], item: Entrenamiento) {
  return [item, ...list.filter((entrenamiento) => String(entrenamiento.id) !== String(item.id))];
}

export default function EntrenamientoPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [canAssign, setCanAssign] = useState(false);
  const [equipoId, setEquipoId] = useState<string | number | null>(null);
  const [usuarioId, setUsuarioId] = useState<string | number | null>(null);
  const [entrenamientos, setEntrenamientos] = useState<Entrenamiento[]>([]);
  const [registros, setRegistros] = useState<Record<string, Registro>>({});
  const [drafts, setDrafts] = useState<Record<string, CheckinDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formError, setFormError] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  const loadEntrenamientos = useCallback(async () => {
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

    if (usuarioError) {
      setError(usuarioError.message);
      setIsLoading(false);
      return;
    }

    if (!usuario?.id || !usuario.equipo_id) {
      setError("Completa el onboarding para ver los entrenamientos de tu equipo.");
      setIsLoading(false);
      return;
    }

    setUsuarioId(usuario.id);
    setEquipoId(usuario.equipo_id);
    setCanAssign(canAssignTraining(usuario.rol));

    const { data: entrenamientosData, error: entrenamientosError } = await supabase
      .from("entrenamientos")
      .select("id, titulo, descripcion, video_url")
      .eq("equipo_id", usuario.equipo_id)
      .order("id", { ascending: false });

    if (entrenamientosError) {
      setError(entrenamientosError.message);
      setIsLoading(false);
      return;
    }

    const lista = entrenamientosData ?? [];
    setEntrenamientos(lista);

    const entrenamientoIds = lista.map((item) => item.id);

    if (entrenamientoIds.length === 0) {
      setRegistros({});
      setIsLoading(false);
      return;
    }

    const { data: registrosData, error: registrosError } = await supabase
      .from("registro_entrenamientos")
      .select("entrenamiento_id, usuario_id, minutos, rpe, completado")
      .eq("usuario_id", usuario.id)
      .in("entrenamiento_id", entrenamientoIds);

    if (registrosError) {
      setError(registrosError.message);
      setIsLoading(false);
      return;
    }

    const nextRegistros: Record<string, Registro> = {};
    const nextDrafts: Record<string, CheckinDraft> = {};

    for (const registro of registrosData ?? []) {
      nextRegistros[String(registro.entrenamiento_id)] = registro;
      nextDrafts[String(registro.entrenamiento_id)] = {
        minutos: String(registro.minutos ?? ""),
        rpe: String(registro.rpe ?? "5"),
      };
    }

    setRegistros(nextRegistros);
    setDrafts((current) => ({ ...current, ...nextDrafts }));
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    void loadEntrenamientos();
  }, [loadEntrenamientos]);

  function getDraft(entrenamientoId: string | number): CheckinDraft {
    return drafts[String(entrenamientoId)] ?? { minutos: "", rpe: "5" };
  }

  function updateDraft(entrenamientoId: string | number, patch: Partial<CheckinDraft>) {
    const key = String(entrenamientoId);
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? { minutos: "", rpe: "5" }),
        ...patch,
      },
    }));
  }

  async function handleAssignTraining(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setError("");
    setSuccess("");

    if (!titulo.trim()) {
      const message = "El título es obligatorio.";
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
      console.error("Error al asignar entrenamiento:", userError);
      setFormError(message);
      setError(message);
      setIsSaving(false);
      return;
    }

    const { data: usuario, error: usuarioError } = await supabase
      .from("usuarios")
      .select("id, equipo_id")
      .eq("email", user.email)
      .maybeSingle();

    const equipoIdActual = usuario?.equipo_id ?? equipoId;

    if (usuarioError || !equipoIdActual) {
      const message =
        usuarioError?.message ?? "No se encontró el equipo_id para asignar el entrenamiento.";
      console.error("Error al asignar entrenamiento:", usuarioError, { email: user.email, equipoId });
      setFormError(message);
      setError(message);
      setIsSaving(false);
      return;
    }

    setEquipoId(equipoIdActual);
    if (usuario?.id) setUsuarioId(usuario.id);

    const payload = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      video_url: videoUrl.trim() || null,
      equipo_id: equipoIdActual,
    };

    const { data: creado, error: insertError } = await supabase
      .from("entrenamientos")
      .insert(payload)
      .select("id, titulo, descripcion, video_url")
      .single();

    if (insertError || !creado) {
      const message =
        insertError?.message ?? "El entrenamiento se envió, pero no se recibió confirmación.";
      console.error("Error al asignar entrenamiento:", insertError, payload);
      setFormError(message);
      setError(message);
      setIsSaving(false);
      return;
    }

    setEntrenamientos((current) => mergeEntrenamiento(current, creado));
    setTitulo("");
    setDescripcion("");
    setVideoUrl("");
    setFormError("");
    setIsModalOpen(false);
    setIsSaving(false);
    setSuccess("Entrenamiento asignado.");
    router.refresh();
    await loadEntrenamientos();
    setEntrenamientos((current) => mergeEntrenamiento(current, creado));
  }

  async function handleCheckin(entrenamientoId: string | number) {
    setError("");
    setSuccess("");

    if (!usuarioId) {
      const message = "No se encontró el usuario_id actual.";
      setError(message);
      console.error("Error en check-in:", message);
      return;
    }

    const draft = getDraft(entrenamientoId);
    const minutos = Number(draft.minutos);
    const rpe = Number(draft.rpe);

    if (Number.isNaN(minutos) || minutos < 0) {
      setError("Ingresa los minutos entrenados.");
      return;
    }

    if (Number.isNaN(rpe) || rpe < 1 || rpe > 10) {
      setError("El esfuerzo percibido (RPE) debe estar entre 1 y 10.");
      return;
    }

    const key = String(entrenamientoId);
    setSavingId(key);

    const payload = {
      entrenamiento_id: entrenamientoId,
      usuario_id: usuarioId,
      minutos,
      rpe,
      completado: true,
    };

    const supabase = createSupabaseBrowserClient();
    const { error: upsertError } = await supabase
      .from("registro_entrenamientos")
      .upsert(payload, { onConflict: "entrenamiento_id,usuario_id" });

    if (upsertError) {
      console.error("Error en check-in:", upsertError, payload);
      setError(upsertError.message);
      setSavingId(null);
      return;
    }

    setRegistros((current) => ({
      ...current,
      [key]: payload,
    }));
    setSuccess("Entrenamiento marcado como completado.");
    setSavingId(null);
    router.refresh();
  }

  return (
    <main className="min-h-screen px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#c8ff00]">
              Preparación
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-tight text-white md:text-4xl">
              <Dumbbell className="h-8 w-8 text-[#c8ff00]" />
              Centro de Entrenamiento
            </h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Revisa las sesiones asignadas, mira el video y registra tu check-in de carga.
            </p>
          </div>

          {canAssign ? (
            <button
              type="button"
              onClick={() => {
                setFormError("");
                setIsModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#c8ff00] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#121212] transition hover:bg-[#d6ff4d] hover:shadow-[0_0_24px_rgba(200,255,0,0.45)]"
            >
              <Plus className="h-4 w-4" />
              Asignar Entrenamiento
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        {success ? (
          <p className="mt-6 rounded-xl border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-4 py-3 text-sm text-[#c8ff00]">
            {success}
          </p>
        ) : null}

        {isLoading ? (
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-72 animate-pulse rounded-2xl border border-white/10 bg-[#1a1a1a]"
              />
            ))}
          </div>
        ) : entrenamientos.length === 0 ? (
          <section className="mt-10 rounded-3xl border border-dashed border-white/15 bg-[#1a1a1a]/80 px-6 py-16 text-center">
            <Dumbbell className="mx-auto h-10 w-10 text-[#c8ff00]" />
            <h2 className="mt-4 text-xl font-bold text-white">Aún no hay entrenamientos</h2>
            <p className="mt-2 text-sm text-zinc-400">
              {canAssign
                ? "Asigna la primera sesión del equipo para que los jugadores puedan hacer check-in."
                : "Cuando el staff asigne un entrenamiento, aparecerá aquí."}
            </p>
          </section>
        ) : (
          <section className="mt-10 grid gap-5 md:grid-cols-2">
            {entrenamientos.map((entrenamiento) => {
              const embedUrl = getYoutubeEmbedUrl(entrenamiento.video_url);
              const registro = registros[String(entrenamiento.id)];
              const draft = getDraft(entrenamiento.id);
              const isCompleted = Boolean(registro);
              const isSavingCheckin = savingId === String(entrenamiento.id);

              return (
                <article
                  key={entrenamiento.id}
                  className="rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-[0_0_40px_rgba(0,0,0,0.25)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c8ff00]">
                        Sesión
                      </p>
                      <h2 className="mt-2 text-xl font-black text-white">{entrenamiento.titulo}</h2>
                    </div>
                    {isCompleted ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#c8ff00]/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#c8ff00]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Completado
                      </span>
                    ) : null}
                  </div>

                  {entrenamiento.descripcion ? (
                    <p className="mt-3 text-sm leading-6 text-zinc-400">{entrenamiento.descripcion}</p>
                  ) : null}

                  {embedUrl ? (
                    <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                      <iframe
                        title={entrenamiento.titulo}
                        src={embedUrl}
                        className="aspect-video w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : entrenamiento.video_url ? (
                    <a
                      href={entrenamiento.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#c8ff00]/30 px-4 py-3 text-sm font-semibold text-[#c8ff00] transition hover:bg-[#c8ff00]/10"
                    >
                      Abrir video
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}

                  <div className="mt-6 rounded-xl border border-white/10 bg-[#121212] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      Check-in
                    </p>
                    <label className="mt-4 block">
                      <span className="mb-2 block text-sm font-medium text-zinc-300">
                        Minutos entrenados
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={draft.minutos}
                        onChange={(event) =>
                          updateDraft(entrenamiento.id, { minutos: event.target.value })
                        }
                        placeholder="45"
                        className={inputClassName}
                      />
                    </label>

                    <label className="mt-4 block">
                      <span className="mb-2 flex items-center justify-between text-sm font-medium text-zinc-300">
                        Esfuerzo Percibido (RPE)
                        <span className="text-[#c8ff00]">{draft.rpe}/10</span>
                      </span>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={draft.rpe}
                        onChange={(event) => updateDraft(entrenamiento.id, { rpe: event.target.value })}
                        className="w-full accent-[#c8ff00]"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={isSavingCheckin}
                      onClick={() => void handleCheckin(entrenamiento.id)}
                      className="mt-5 w-full rounded-xl bg-[#c8ff00] px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#121212] transition hover:bg-[#d6ff4d] hover:shadow-[0_0_24px_rgba(200,255,0,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingCheckin ? "Guardando..." : "Marcar como Completado"}
                    </button>
                  </div>
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
                  Nueva sesión
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">Asignar entrenamiento</h2>
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

            <form className="space-y-4" onSubmit={handleAssignTraining}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">Título</span>
                <input
                  type="text"
                  required
                  value={titulo}
                  onChange={(event) => setTitulo(event.target.value)}
                  placeholder="Fuerza de tren inferior"
                  className={inputClassName}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">Descripción</span>
                <textarea
                  rows={4}
                  value={descripcion}
                  onChange={(event) => setDescripcion(event.target.value)}
                  placeholder="Circuito de 4 estaciones, 3 series."
                  className={`${inputClassName} resize-none`}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">
                  URL de Video (YouTube)
                </span>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
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
                {isSaving ? "Guardando..." : "Guardar entrenamiento"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
