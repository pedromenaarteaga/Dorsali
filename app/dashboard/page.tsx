"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Dumbbell,
  MapPin,
  Scale,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { formatDorsal, hasDorsal } from "@/utils/jugador";

type UsuarioPerfil = {
  id: string | number;
  nombre: string;
  dorsal: number | string | null;
  equipoId: string | number;
  equipoNombre: string;
};

type ProximoPartido = {
  id: string | number;
  rival: string;
  fecha_hora: string;
  ubicacion: string;
};

type Rendimiento = {
  minutosMes: number;
  rpePromedio: number | null;
  ultimos: { nombre: string; minutos: number }[];
};

type CuotaPendiente = {
  id: string | number;
  concepto: string;
  monto: number | string;
};

type LoadState = "loading" | "onboarding" | "ready";

function startOfMonthIso() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function formatFechaHora(fechaHora: string) {
  const date = new Date(fechaHora);

  if (Number.isNaN(date.getTime())) return fechaHora;

  return date.toLocaleString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMonto(monto: number | string) {
  const value = Number(monto);
  if (Number.isNaN(value)) return String(monto);

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function isPagado(estado: string | undefined) {
  return estado?.toLowerCase() === "pagado";
}

function normalizeAsistencia(estado: string | undefined) {
  const value = estado?.toLowerCase().trim();
  if (value === "voy") return "Voy";
  if (value === "no voy" || value === "no_voy") return "No voy";
  return "Pendiente";
}

export default function DashboardPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [perfil, setPerfil] = useState<UsuarioPerfil | null>(null);
  const [email, setEmail] = useState("");
  const [equipoNombre, setEquipoNombre] = useState("");
  const [nombreReal, setNombreReal] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [proximoPartido, setProximoPartido] = useState<ProximoPartido | null>(null);
  const [asistencia, setAsistencia] = useState("Pendiente");
  const [confirmando, setConfirmando] = useState(false);
  const [rendimiento, setRendimiento] = useState<Rendimiento>({
    minutosMes: 0,
    rpePromedio: null,
    ultimos: [],
  });
  const [cuotasPendientes, setCuotasPendientes] = useState<CuotaPendiente[]>([]);

  const loadDashboard = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      router.replace("/");
      return;
    }

    setEmail(user.email);

    const { data: usuario, error: usuarioError } = await supabase
      .from("usuarios")
      .select("id, nombre, dorsal, equipo_id")
      .eq("email", user.email)
      .maybeSingle();

    if (usuarioError) {
      setError(usuarioError.message);
      setLoadState("onboarding");
      return;
    }

    if (!usuario?.equipo_id) {
      setLoadState("onboarding");
      return;
    }

    let teamName = "tu equipo";
    const { data: equipo } = await supabase
      .from("equipos")
      .select("nombre")
      .eq("id", usuario.equipo_id)
      .maybeSingle();

    if (equipo?.nombre) teamName = equipo.nombre;

    const perfilActual: UsuarioPerfil = {
      id: usuario.id,
      nombre: usuario.nombre,
      dorsal: usuario.dorsal,
      equipoId: usuario.equipo_id,
      equipoNombre: teamName,
    };
    setPerfil(perfilActual);

    const [{ data: partido }, registrosResult, { data: cuotas }] = await Promise.all([
      supabase
        .from("partidos")
        .select("id, rival, fecha_hora, ubicacion")
        .eq("equipo_id", usuario.equipo_id)
        .gte("fecha_hora", startOfTodayIso())
        .order("fecha_hora", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("registro_entrenamientos")
        .select("entrenamiento_id, minutos, rpe, created_at")
        .eq("usuario_id", usuario.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("cuotas")
        .select("id, concepto, monto")
        .eq("equipo_id", usuario.equipo_id),
    ]);

    let registros = registrosResult.data ?? [];
    if (registrosResult.error) {
      const fallback = await supabase
        .from("registro_entrenamientos")
        .select("entrenamiento_id, minutos, rpe")
        .eq("usuario_id", usuario.id)
        .order("entrenamiento_id", { ascending: false });
      registros = fallback.data ?? [];
    }

    setProximoPartido(partido ?? null);

    if (partido?.id) {
      const { data: asistenciaRow } = await supabase
        .from("asistencia")
        .select("estado")
        .eq("partido_id", partido.id)
        .eq("usuario_id", usuario.id)
        .maybeSingle();
      setAsistencia(normalizeAsistencia(asistenciaRow?.estado));
    } else {
      setAsistencia("Pendiente");
    }

    const inicioMes = new Date(startOfMonthIso()).getTime();
    const delMes = registros.filter((row) => {
      const created = "created_at" in row ? Date.parse(String(row.created_at ?? "")) : NaN;
      return Number.isNaN(created) ? true : created >= inicioMes;
    });
    const minutosMes = delMes.reduce((total, row) => total + Number(row.minutos ?? 0), 0);
    const rpes = delMes.map((row) => Number(row.rpe)).filter((value) => !Number.isNaN(value));
    const rpePromedio =
      rpes.length > 0 ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null;
    const ultimos = [...registros].slice(0, 5).reverse().map((row, index) => ({
      nombre: `S${index + 1}`,
      minutos: Number(row.minutos ?? 0),
    }));
    setRendimiento({ minutosMes, rpePromedio, ultimos });

    const { data: pagos } = await supabase
      .from("pagos")
      .select("cuota_id, estado")
      .eq("usuario_id", usuario.id);

    const pagosPorCuota = new Map(
      (pagos ?? []).map((pago) => [String(pago.cuota_id), String(pago.estado)]),
    );
    setCuotasPendientes(
      (cuotas ?? []).filter((cuota) => !isPagado(pagosPorCuota.get(String(cuota.id)))),
    );

    setLoadState("ready");
  }, [router]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  async function handleOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    if (!equipoNombre.trim() || !nombreReal.trim()) {
      setError("Completa el nombre del equipo y tu nombre.");
      setIsSaving(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { data: equipo, error: equipoError } = await supabase
      .from("equipos")
      .insert({ nombre: equipoNombre.trim() })
      .select("id")
      .single();

    if (equipoError || !equipo?.id) {
      setError(equipoError?.message ?? "No se pudo crear el equipo.");
      setIsSaving(false);
      return;
    }

    const { error: usuarioError } = await supabase.from("usuarios").insert({
      equipo_id: equipo.id,
      nombre: nombreReal.trim(),
      dorsal: null,
      rol: "admin",
      email,
    });

    if (usuarioError) {
      setError(usuarioError.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    await loadDashboard();
  }

  async function handleConfirmarAsistencia() {
    if (!perfil || !proximoPartido) return;

    setConfirmando(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: upsertError } = await supabase.from("asistencia").upsert(
      {
        partido_id: proximoPartido.id,
        usuario_id: perfil.id,
        estado: "Voy",
      },
      { onConflict: "partido_id,usuario_id" },
    );

    if (upsertError) {
      console.error("Error al confirmar asistencia:", upsertError);
      setError(upsertError.message);
      setConfirmando(false);
      return;
    }

    setAsistencia("Voy");
    setConfirmando(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
      {loadState === "loading" ? <LoadingState /> : null}

      {loadState === "onboarding" ? (
        <OnboardingForm
          equipoNombre={equipoNombre}
          nombreReal={nombreReal}
          error={error}
          isSaving={isSaving}
          onEquipoNombreChange={setEquipoNombre}
          onNombreRealChange={setNombreReal}
          onSubmit={handleOnboarding}
        />
      ) : null}

      {loadState === "ready" && perfil ? (
        <CommandCenter
          perfil={perfil}
          error={error}
          proximoPartido={proximoPartido}
          asistencia={asistencia}
          confirmando={confirmando}
          onConfirmarAsistencia={() => void handleConfirmarAsistencia()}
          rendimiento={rendimiento}
          cuotasPendientes={cuotasPendientes}
        />
      ) : null}
    </div>
  );
}

function LoadingState() {
  return (
    <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#1a1a1a]/90 p-8 text-center shadow-[0_0_80px_rgba(200,255,0,0.08)]">
      <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-[#c8ff00]" />
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#c8ff00]">
        Dorsali
      </p>
      <p className="mt-3 text-sm text-zinc-400">Cargando tu centro de mando...</p>
    </section>
  );
}

function OnboardingForm({
  equipoNombre,
  nombreReal,
  error,
  isSaving,
  onEquipoNombreChange,
  onNombreRealChange,
  onSubmit,
}: {
  equipoNombre: string;
  nombreReal: string;
  error: string;
  isSaving: boolean;
  onEquipoNombreChange: (value: string) => void;
  onNombreRealChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const inputClassName =
    "w-full rounded-xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-[#c8ff00] focus:shadow-[0_0_0_3px_rgba(200,255,0,0.15)]";

  return (
    <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#1a1a1a]/90 p-8 shadow-[0_0_80px_rgba(200,255,0,0.08)] backdrop-blur-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-[#c8ff00]">
        Onboarding
      </p>
      <h1 className="text-3xl font-black tracking-tight text-white">Crea tu equipo</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Completa estos datos para entrar a tu panel. Serás el admin del equipo.
      </p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-300">Nombre del Equipo</span>
          <input
            type="text"
            name="equipo"
            required
            value={equipoNombre}
            onChange={(event) => onEquipoNombreChange(event.target.value)}
            placeholder="FC Dorsali"
            className={inputClassName}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-300">Tu Nombre Real</span>
          <input
            type="text"
            name="nombre"
            required
            value={nombreReal}
            onChange={(event) => onNombreRealChange(event.target.value)}
            placeholder="Pedro Amenábar"
            className={inputClassName}
          />
        </label>

        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSaving}
          className="mt-2 w-full rounded-xl bg-[#c8ff00] px-4 py-3 text-sm font-black uppercase tracking-[0.2em] text-[#121212] transition hover:bg-[#d6ff4d] hover:shadow-[0_0_24px_rgba(200,255,0,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Guardando..." : "Entrar al equipo"}
        </button>
      </form>
    </section>
  );
}

function CommandCenter({
  perfil,
  error,
  proximoPartido,
  asistencia,
  confirmando,
  onConfirmarAsistencia,
  rendimiento,
  cuotasPendientes,
}: {
  perfil: UsuarioPerfil;
  error: string;
  proximoPartido: ProximoPartido | null;
  asistencia: string;
  confirmando: boolean;
  onConfirmarAsistencia: () => void;
  rendimiento: Rendimiento;
  cuotasPendientes: CuotaPendiente[];
}) {
  const yaConfirmo = asistencia === "Voy";

  return (
    <div className="w-full max-w-6xl self-start">
      <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#c8ff00]">
            Centro de mando
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Bienvenido a {perfil.equipoNombre}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">{perfil.nombre}</p>
        </div>
        {hasDorsal(perfil.dorsal) ? (
          <span className="w-fit rounded-full bg-[#c8ff00] px-3 py-1 text-sm font-black tracking-tight text-[#121212] shadow-[0_0_18px_rgba(200,255,0,0.28)]">
            {formatDorsal(perfil.dorsal)}
          </span>
        ) : (
          <span className="w-fit rounded-full border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#c8ff00]">
            En juego
          </span>
        )}
      </header>

      {error ? (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-3xl border border-white/10 bg-[#1a1a1a] p-5 shadow-[0_0_40px_rgba(0,0,0,0.2)] md:col-span-2 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#c8ff00]">
              <Trophy className="h-4 w-4" />
              Próximo partido
            </p>
            <Link href="/dashboard/partidos" className="text-xs text-zinc-500 hover:text-[#c8ff00]">
              Ver todos
            </Link>
          </div>

          {proximoPartido ? (
            <>
              <h2 className="mt-4 text-2xl font-black text-white sm:text-3xl">
                vs {proximoPartido.rival}
              </h2>
              <p className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
                <CalendarClock className="h-4 w-4 text-[#c8ff00]" />
                {formatFechaHora(proximoPartido.fecha_hora)}
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm text-zinc-400">
                <MapPin className="h-4 w-4 text-[#c8ff00]" />
                {proximoPartido.ubicacion}
              </p>
              <button
                type="button"
                disabled={confirmando || yaConfirmo}
                onClick={onConfirmarAsistencia}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#c8ff00] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-[#121212] transition hover:bg-[#d6ff4d] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
              >
                {yaConfirmo ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Asistencia confirmada
                  </>
                ) : confirmando ? (
                  "Confirmando..."
                ) : (
                  "Confirmar Asistencia"
                )}
              </button>
            </>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center">
              <p className="text-sm text-zinc-400">Todavía no hay un partido agendado.</p>
              <Link
                href="/dashboard/partidos"
                className="mt-3 inline-block text-sm font-semibold text-[#c8ff00]"
              >
                Ir a Partidos
              </Link>
            </div>
          )}
        </article>

        <article
          className={`rounded-3xl border p-5 ${
            cuotasPendientes.length > 0
              ? "border-red-500/30 bg-red-500/10"
              : "border-[#c8ff00]/20 bg-[#1a1a1a]"
          }`}
        >
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#c8ff00]">
            {cuotasPendientes.length > 0 ? (
              <AlertTriangle className="h-4 w-4 text-red-300" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Estado de cuenta
          </p>
          {cuotasPendientes.length > 0 ? (
            <>
              <h2 className="mt-4 text-xl font-black text-white">Tienes cuotas pendientes</h2>
              <p className="mt-2 text-sm text-red-200">
                {cuotasPendientes.length} cuota{cuotasPendientes.length === 1 ? "" : "s"} por regularizar.
              </p>
              <ul className="mt-4 space-y-2">
                {cuotasPendientes.slice(0, 3).map((cuota) => (
                  <li key={cuota.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-zinc-200">{cuota.concepto}</span>
                    <span className="shrink-0 font-bold text-white">{formatMonto(cuota.monto)}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/dashboard/tesoreria"
                className="mt-5 inline-flex text-sm font-semibold text-[#c8ff00]"
              >
                Ir a Tesorería
              </Link>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-xl font-black text-white">Al día</h2>
              <p className="mt-2 text-sm text-zinc-400">
                No tienes cuotas pendientes. Buen trabajo con el club.
              </p>
            </>
          )}
        </article>

        <article className="rounded-3xl border border-white/10 bg-[#1a1a1a] p-5 md:col-span-2 xl:col-span-2">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#c8ff00]">
            <Dumbbell className="h-4 w-4" />
            Rendimiento personal
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-[#121212] p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                <Clock3 className="h-3.5 w-3.5" />
                Minutos del mes
              </p>
              <p className="mt-2 text-3xl font-black text-[#c8ff00] sm:text-4xl">
                {rendimiento.minutosMes}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#121212] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Esfuerzo promedio</p>
              <p className="mt-2 text-3xl font-black text-white sm:text-4xl">
                {rendimiento.rpePromedio ?? "—"}
                <span className="ml-1 text-sm font-semibold text-zinc-500">RPE</span>
              </p>
            </div>
          </div>
          <div className="mt-5 h-40">
            {rendimiento.ultimos.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rendimiento.ultimos}>
                  <XAxis dataKey="nombre" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(200,255,0,0.08)" }}
                    contentStyle={{
                      background: "#121212",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 12,
                      color: "#fff",
                    }}
                    formatter={(value) => [`${value} min`, "Minutos"]}
                  />
                  <Bar dataKey="minutos" fill="#c8ff00" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-zinc-500">
                Completa un check-in para ver tu gráfica.
              </p>
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-white/10 bg-[#1a1a1a] p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#c8ff00]">
            <Scale className="h-4 w-4" />
            Reglamento interno y anuncios
          </p>
          <h2 className="mt-4 text-lg font-bold text-white">Normas del club</h2>
          <ul className="mt-3 space-y-3 text-sm leading-6 text-zinc-400">
            <li>Puntualidad: llega 15 minutos antes a partidos y entrenos.</li>
            <li>Convivencia: respeto al cuerpo técnico, compañeros y rival.</li>
            <li>Cuotas: mantén tus pagos al día para no perder convocatoria.</li>
            <li>Cancha: cuida el material y avisa si no puedes asistir.</li>
          </ul>
          <p className="mt-5 text-xs text-zinc-600">El admin podrá editar este espacio más adelante.</p>
        </article>
      </div>
    </div>
  );
}
