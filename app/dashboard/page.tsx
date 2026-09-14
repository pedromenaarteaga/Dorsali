"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";

type UsuarioPerfil = {
  nombre: string;
  dorsal: number | string;
  equipoNombre: string;
};

type LoadState = "loading" | "onboarding" | "ready";

export default function DashboardPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [perfil, setPerfil] = useState<UsuarioPerfil | null>(null);
  const [email, setEmail] = useState("");
  const [equipoNombre, setEquipoNombre] = useState("");
  const [nombreReal, setNombreReal] = useState("");
  const [dorsal, setDorsal] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userError || !user?.email) {
        router.replace("/");
        return;
      }

      setEmail(user.email);

      const { data: usuario, error: usuarioError } = await supabase
        .from("usuarios")
        .select("nombre, dorsal, equipo_id")
        .eq("email", user.email)
        .maybeSingle();

      if (cancelled) return;

      if (usuarioError) {
        setError(usuarioError.message);
        setLoadState("onboarding");
        return;
      }

      if (!usuario) {
        setLoadState("onboarding");
        return;
      }

      let teamName = "tu equipo";

      if (usuario.equipo_id) {
        const { data: equipo } = await supabase
          .from("equipos")
          .select("nombre")
          .eq("id", usuario.equipo_id)
          .maybeSingle();

        if (equipo?.nombre) {
          teamName = equipo.nombre;
        }
      }

      if (cancelled) return;

      setPerfil({
        nombre: usuario.nombre,
        dorsal: usuario.dorsal,
        equipoNombre: teamName,
      });
      setLoadState("ready");
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    const dorsalNumero = Number(dorsal);

    if (!equipoNombre.trim() || !nombreReal.trim() || Number.isNaN(dorsalNumero)) {
      setError("Completa el nombre del equipo, tu nombre y un dorsal válido.");
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
      dorsal: dorsalNumero,
      rol: "admin",
      email,
    });

    if (usuarioError) {
      setError(usuarioError.message);
      setIsSaving(false);
      return;
    }

    setPerfil({
      nombre: nombreReal.trim(),
      dorsal: dorsalNumero,
      equipoNombre: equipoNombre.trim(),
    });
    setLoadState("ready");
    setIsSaving(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      {loadState === "loading" ? <LoadingState /> : null}

      {loadState === "onboarding" ? (
        <OnboardingForm
          equipoNombre={equipoNombre}
          nombreReal={nombreReal}
          dorsal={dorsal}
          error={error}
          isSaving={isSaving}
          onEquipoNombreChange={setEquipoNombre}
          onNombreRealChange={setNombreReal}
          onDorsalChange={setDorsal}
          onSubmit={handleOnboarding}
        />
      ) : null}

      {loadState === "ready" && perfil ? <ControlPanel perfil={perfil} /> : null}
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
      <p className="mt-3 text-sm text-zinc-400">Cargando tu zona de rendimiento...</p>
    </section>
  );
}

function OnboardingForm({
  equipoNombre,
  nombreReal,
  dorsal,
  error,
  isSaving,
  onEquipoNombreChange,
  onNombreRealChange,
  onDorsalChange,
  onSubmit,
}: {
  equipoNombre: string;
  nombreReal: string;
  dorsal: string;
  error: string;
  isSaving: boolean;
  onEquipoNombreChange: (value: string) => void;
  onNombreRealChange: (value: string) => void;
  onDorsalChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const inputClassName =
    "w-full rounded-xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-[#c8ff00] focus:shadow-[0_0_0_3px_rgba(200,255,0,0.15)]";

  return (
    <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#1a1a1a]/90 p-8 shadow-[0_0_80px_rgba(200,255,0,0.08)] backdrop-blur-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-[#c8ff00]">
        Onboarding
      </p>
      <h1 className="text-3xl font-black tracking-tight text-white">
        Crea tu equipo
      </h1>
      <p className="mt-2 text-sm text-zinc-400">
        Completa estos datos para entrar a tu panel. Serás el admin del equipo.
      </p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-300">
            Nombre del Equipo
          </span>
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
          <span className="mb-2 block text-sm font-medium text-zinc-300">
            Tu Nombre Real
          </span>
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

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-300">
            Tu Dorsal (número)
          </span>
          <input
            type="number"
            name="dorsal"
            required
            min={0}
            max={99}
            value={dorsal}
            onChange={(event) => onDorsalChange(event.target.value)}
            placeholder="10"
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

function ControlPanel({ perfil }: { perfil: UsuarioPerfil }) {
  return (
    <section className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#1a1a1a]/90 p-8 shadow-[0_0_80px_rgba(200,255,0,0.08)] backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#c8ff00]">
        Panel de control
      </p>
      <h1 className="mt-3 text-4xl font-black tracking-tight text-white">
        Bienvenido a {perfil.equipoNombre}
      </h1>
      <p className="mt-3 text-zinc-400">Tu zona de rendimiento ya está lista.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-[#121212] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Nombre</p>
          <p className="mt-2 text-xl font-bold text-white">{perfil.nombre}</p>
        </article>
        <article className="rounded-2xl border border-[#c8ff00]/20 bg-[#121212] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Dorsal</p>
          <p className="mt-2 text-xl font-black text-[#c8ff00]">#{perfil.dorsal}</p>
        </article>
      </div>
    </section>
  );
}
