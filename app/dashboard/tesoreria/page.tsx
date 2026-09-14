"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronDown, Plus, Wallet, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";

type Cuota = {
  id: string | number;
  concepto: string;
  monto: number | string;
  fecha_vencimiento: string;
};

type Jugador = {
  id: string | number;
  nombre: string;
  dorsal: number | string | null;
};

type Pago = {
  cuota_id: string | number;
  usuario_id: string | number;
  estado: "pagado" | "pendiente" | string;
  fecha_pago: string | null;
};

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-[#c8ff00] focus:shadow-[0_0_0_3px_rgba(200,255,0,0.15)]";

function formatMonto(monto: number | string) {
  const value = Number(monto);

  if (Number.isNaN(value)) {
    return String(monto);
  }

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatFecha(fecha: string) {
  const date = new Date(`${fecha}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return new Date(fecha).toLocaleDateString("es-CL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  return date.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function pagoKey(cuotaId: string | number, usuarioId: string | number) {
  return `${cuotaId}:${usuarioId}`;
}

function isPagado(estado: string | undefined) {
  return estado?.toLowerCase() === "pagado";
}

export default function TesoreriaPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [equipoId, setEquipoId] = useState<string | number | null>(null);
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [expandedCuotaId, setExpandedCuotaId] = useState<string | number | null>(null);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");

  const pagosPorClave = useMemo(() => {
    const map = new Map<string, Pago>();

    for (const pago of pagos) {
      map.set(pagoKey(pago.cuota_id, pago.usuario_id), pago);
    }

    return map;
  }, [pagos]);

  const loadTesoreria = useCallback(async () => {
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
      setError("Completa el onboarding para ver la tesorería de tu equipo.");
      setIsLoading(false);
      return;
    }

    setEquipoId(usuario.equipo_id);
    setIsAdmin(String(usuario.rol).toLowerCase() === "admin");

    const [cuotasResult, jugadoresResult] = await Promise.all([
      supabase
        .from("cuotas")
        .select("id, concepto, monto, fecha_vencimiento")
        .eq("equipo_id", usuario.equipo_id)
        .order("fecha_vencimiento", { ascending: true }),
      supabase
        .from("usuarios")
        .select("id, nombre, dorsal")
        .eq("equipo_id", usuario.equipo_id)
        .order("nombre", { ascending: true }),
    ]);

    if (cuotasResult.error) {
      setError(cuotasResult.error.message);
      setIsLoading(false);
      return;
    }

    if (jugadoresResult.error) {
      setError(jugadoresResult.error.message);
      setIsLoading(false);
      return;
    }

    const cuotasData = cuotasResult.data ?? [];
    setCuotas(cuotasData);
    setJugadores(jugadoresResult.data ?? []);

    const cuotaIds = cuotasData.map((cuota) => cuota.id);

    if (cuotaIds.length === 0) {
      setPagos([]);
      setIsLoading(false);
      return;
    }

    const { data: pagosData, error: pagosError } = await supabase
      .from("pagos")
      .select("cuota_id, usuario_id, estado, fecha_pago")
      .in("cuota_id", cuotaIds);

    if (pagosError) {
      setError(pagosError.message);
      setIsLoading(false);
      return;
    }

    setPagos(pagosData ?? []);
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    void loadTesoreria();
  }, [loadTesoreria]);

  async function handleCreateCuota(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!equipoId) {
      setError("No se encontró el equipo asociado.");
      return;
    }

    const montoNumero = Number(monto);

    if (!concepto.trim() || Number.isNaN(montoNumero) || !fechaVencimiento) {
      setError("Completa concepto, monto y fecha de vencimiento.");
      return;
    }

    setIsSaving(true);
    const supabase = createSupabaseBrowserClient();
    const { error: insertError } = await supabase.from("cuotas").insert({
      concepto: concepto.trim(),
      monto: montoNumero,
      fecha_vencimiento: fechaVencimiento,
      equipo_id: equipoId,
    });

    if (insertError) {
      setError(insertError.message);
      setIsSaving(false);
      return;
    }

    setConcepto("");
    setMonto("");
    setFechaVencimiento("");
    setIsModalOpen(false);
    setIsSaving(false);
    await loadTesoreria();
  }

  async function handleTogglePago(cuotaId: string | number, usuarioId: string | number) {
    const key = pagoKey(cuotaId, usuarioId);
    const actual = pagosPorClave.get(key);
    const siguienteEstado = isPagado(actual?.estado) ? "pendiente" : "pagado";
    const siguienteFecha = siguienteEstado === "pagado" ? new Date().toISOString() : null;
    const pagoAnterior = pagos;

    setError("");
    setUpdatingKey(key);
    setPagos((current) => {
      const resto = current.filter(
        (pago) => pagoKey(pago.cuota_id, pago.usuario_id) !== key,
      );

      return [
        ...resto,
        {
          cuota_id: cuotaId,
          usuario_id: usuarioId,
          estado: siguienteEstado,
          fecha_pago: siguienteFecha,
        },
      ];
    });

    const supabase = createSupabaseBrowserClient();
    const { error: upsertError } = await supabase.from("pagos").upsert(
      {
        cuota_id: cuotaId,
        usuario_id: usuarioId,
        estado: siguienteEstado,
        fecha_pago: siguienteFecha,
      },
      { onConflict: "cuota_id,usuario_id" },
    );

    if (upsertError) {
      setPagos(pagoAnterior);
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
              Finanzas
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-tight text-white md:text-4xl">
              <Wallet className="h-8 w-8 text-[#c8ff00]" />
              Tesorería
            </h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Controla las cuotas del equipo, vencimientos y el estado de caja desde un panel limpio.
            </p>
          </div>

          {isAdmin ? (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#c8ff00] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#121212] transition hover:bg-[#d6ff4d] hover:shadow-[0_0_24px_rgba(200,255,0,0.45)]"
            >
              <Plus className="h-4 w-4" />
              Crear Nueva Cuota
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
                className="h-40 animate-pulse rounded-2xl border border-white/10 bg-[#1a1a1a]"
              />
            ))}
          </div>
        ) : cuotas.length === 0 ? (
          <section className="mt-10 rounded-3xl border border-dashed border-white/15 bg-[#1a1a1a]/80 px-6 py-16 text-center">
            <CalendarClock className="mx-auto h-10 w-10 text-[#c8ff00]" />
            <h2 className="mt-4 text-xl font-bold text-white">Aún no hay cuotas</h2>
            <p className="mt-2 text-sm text-zinc-400">
              {isAdmin
                ? "Crea la primera cuota del equipo para empezar a llevar el control."
                : "Cuando el admin cree una cuota, aparecerá aquí."}
            </p>
          </section>
        ) : (
          <section className="mt-10 grid gap-4 md:grid-cols-2">
            {cuotas.map((cuota) => {
              const isExpanded = expandedCuotaId === cuota.id;
              const pagados = jugadores.filter((jugador) =>
                isPagado(pagosPorClave.get(pagoKey(cuota.id, jugador.id))?.estado),
              ).length;

              return (
                <article
                  key={cuota.id}
                  className={`rounded-2xl border bg-[#1a1a1a] p-6 shadow-[0_0_40px_rgba(0,0,0,0.25)] transition ${
                    isExpanded
                      ? "border-[#c8ff00]/30 md:col-span-2"
                      : "border-white/10 hover:border-[#c8ff00]/30"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c8ff00]">
                    Cuota
                  </p>
                  <h2 className="mt-3 text-xl font-bold text-white">{cuota.concepto}</h2>
                  <p className="mt-4 text-3xl font-black text-[#c8ff00]">
                    {formatMonto(cuota.monto)}
                  </p>
                  <p className="mt-3 text-sm text-zinc-400">
                    Vence el {formatFecha(cuota.fecha_vencimiento)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {pagados} de {jugadores.length} jugadores pagaron
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCuotaId((current) => (current === cuota.id ? null : cuota.id))
                    }
                    className="mt-5 inline-flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#121212] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-[#c8ff00]/40 hover:text-[#c8ff00]"
                  >
                    Ver Control de Pagos
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
                          const key = pagoKey(cuota.id, jugador.id);
                          const pagado = isPagado(pagosPorClave.get(key)?.estado);
                          const isUpdating = updatingKey === key;

                          return (
                            <li
                              key={jugador.id}
                              className="flex items-center justify-between gap-4 bg-[#141414] px-4 py-3"
                            >
                              <div>
                                <p className="font-medium text-white">{jugador.nombre}</p>
                                {jugador.dorsal !== null && jugador.dorsal !== undefined ? (
                                  <p className="text-xs text-zinc-500">Dorsal #{jugador.dorsal}</p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => void handleTogglePago(cuota.id, jugador.id)}
                                className={`min-w-28 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-70 ${
                                  pagado
                                    ? "bg-[#c8ff00] text-[#121212] hover:bg-[#d6ff4d]"
                                    : "bg-red-500/15 text-red-300 ring-1 ring-red-500/40 hover:bg-red-500/25"
                                }`}
                              >
                                {isUpdating ? "..." : pagado ? "Pagado" : "Pendiente"}
                              </button>
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
                  Nueva cuota
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">Crear cuota</h2>
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

            <form className="space-y-4" onSubmit={handleCreateCuota}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">
                  Concepto
                </span>
                <input
                  type="text"
                  required
                  value={concepto}
                  onChange={(event) => setConcepto(event.target.value)}
                  placeholder="Mensualidad Marzo, Cancha Sábado"
                  className={inputClassName}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">
                  Monto
                </span>
                <input
                  type="number"
                  required
                  min={0}
                  step="1"
                  value={monto}
                  onChange={(event) => setMonto(event.target.value)}
                  placeholder="25000"
                  className={inputClassName}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">
                  Fecha de Vencimiento
                </span>
                <input
                  type="date"
                  required
                  value={fechaVencimiento}
                  onChange={(event) => setFechaVencimiento(event.target.value)}
                  className={inputClassName}
                />
              </label>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full rounded-xl bg-[#c8ff00] px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#121212] transition hover:bg-[#d6ff4d] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Guardando..." : "Guardar cuota"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
