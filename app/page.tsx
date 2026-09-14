"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";

function getAuthMessage(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "Email o contraseña incorrectos.";
  }

  if (message.includes("user already registered")) {
    return "Ese email ya está registrado. Prueba iniciar sesión.";
  }

  if (message.includes("password") && message.includes("at least")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }

  if (message.includes("email not confirmed")) {
    return "Debes confirmar tu email antes de iniciar sesión.";
  }

  return errorMessage;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);

  const isBusy = isSigningIn || isSigningUp;

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSigningIn(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(getAuthMessage(signInError.message));
      setIsSigningIn(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleSignUp() {
    setError("");
    setSuccess("");

    if (!email || !password) {
      setError("Completa email y contraseña para registrarte.");
      return;
    }

    setIsSigningUp(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(getAuthMessage(signUpError.message));
      setIsSigningUp(false);
      return;
    }

    setSuccess("Cuenta creada correctamente. Ya puedes iniciar sesión.");
    setIsSigningUp(false);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#121212] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(200,255,0,0.12),_transparent_42%)]" />
      <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#c8ff00]/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-[#c8ff00]/5 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-12">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#1a1a1a]/90 p-8 shadow-[0_0_80px_rgba(200,255,0,0.08)] backdrop-blur-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-[#c8ff00]">
            Dorsali
          </p>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Iniciar sesión
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Entra a tu zona de rendimiento. Energía, disciplina y foco.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSignIn}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-300">
                Email
              </span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@email.com"
                className="w-full rounded-xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-[#c8ff00] focus:shadow-[0_0_0_3px_rgba(200,255,0,0.15)]"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-300">
                Contraseña
              </span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-[#c8ff00] focus:shadow-[0_0_0_3px_rgba(200,255,0,0.15)]"
              />
            </label>

            {error ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </p>
            ) : null}

            {success ? (
              <p className="rounded-xl border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-4 py-3 text-sm text-[#c8ff00]">
                {success}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isBusy}
              className="mt-2 w-full rounded-xl bg-[#c8ff00] px-4 py-3 text-sm font-black uppercase tracking-[0.2em] text-[#121212] transition hover:bg-[#d6ff4d] hover:shadow-[0_0_24px_rgba(200,255,0,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningIn ? "Entrando..." : "Iniciar Sesión"}
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={handleSignUp}
              className="w-full rounded-xl border border-[#c8ff00] px-4 py-3 text-sm font-black uppercase tracking-[0.2em] text-[#c8ff00] transition hover:bg-[#c8ff00]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningUp ? "Creando cuenta..." : "Registrarse"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
