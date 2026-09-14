"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Bell, Check, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";

type Notificacion = {
  id: string | number;
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at?: string | null;
};

type NotificationsContextValue = {
  notificaciones: Notificacion[];
  noLeidas: number;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  markAsRead: (id: string | number) => Promise<void>;
  createTestNotification: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export const NOTIFICATIONS_CHANGED_EVENT = "dorsali:notifications-changed";

export function notifyNotificationsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }
}

function timeAgo(dateValue: string | null | undefined) {
  if (!dateValue) return "Reciente";

  const then = new Date(dateValue).getTime();
  if (Number.isNaN(then)) return "Reciente";

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));

  if (seconds < 45) return "hace un momento";
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`;
  if (seconds < 604800) return `hace ${Math.floor(seconds / 86400)} d`;

  return new Date(dateValue).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
  });
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [usuarioId, setUsuarioId] = useState<string | number | null>(null);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [isOpen, setOpen] = useState(false);

  const loadNotificaciones = useCallback(async (currentUserId?: string | number | null) => {
    const supabase = createSupabaseBrowserClient();
    let userId = currentUserId ?? usuarioId;

    if (!userId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) return;

      const { data: usuario } = await supabase
        .from("usuarios")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();

      if (!usuario?.id) return;

      userId = usuario.id;
      setUsuarioId(userId);
    }

    const { data, error } = await supabase
      .from("notificaciones")
      .select("id, titulo, mensaje, leida, created_at")
      .eq("usuario_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      const fallback = await supabase
        .from("notificaciones")
        .select("id, titulo, mensaje, leida")
        .eq("usuario_id", userId);

      if (fallback.error) {
        console.error("Error al cargar notificaciones:", error);
        return;
      }

      setNotificaciones(fallback.data ?? []);
      return;
    }

    setNotificaciones(data ?? []);
  }, [usuarioId]);

  useEffect(() => {
    void loadNotificaciones();
  }, [loadNotificaciones]);

  useEffect(() => {
    function handleNotificationsChanged() {
      void loadNotificaciones();
    }

    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged);
    };
  }, [loadNotificaciones]);

  const noLeidas = useMemo(
    () => notificaciones.filter((item) => !item.leida).length,
    [notificaciones],
  );

  const markAsRead = useCallback(
    async (id: string | number) => {
      const previous = notificaciones;
      setNotificaciones((current) =>
        current.map((item) => (String(item.id) === String(id) ? { ...item, leida: true } : item)),
      );

      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("notificaciones").update({ leida: true }).eq("id", id);

      if (error) {
        console.error("Error al marcar notificación como leída:", error);
        setNotificaciones(previous);
      }
    },
    [notificaciones],
  );

  const createTestNotification = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    let userId = usuarioId;

    if (!userId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        console.error("Error al crear notificación de prueba: no hay usuario.");
        return;
      }

      const { data: usuario } = await supabase
        .from("usuarios")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();

      if (!usuario?.id) {
        console.error("Error al crear notificación de prueba: no hay usuario_id.");
        return;
      }

      userId = usuario.id;
      setUsuarioId(userId);
    }

    const { error } = await supabase.from("notificaciones").insert({
      usuario_id: userId,
      titulo: "Nueva Convocatoria",
      mensaje: "El DT ha publicado la nómina para el sábado",
      leida: false,
    });

    if (error) {
      console.error("Error al crear notificación de prueba:", error);
      return;
    }

    await loadNotificaciones(userId);
    notifyNotificationsChanged();
  }, [loadNotificaciones, usuarioId]);

  const refreshNotifications = useCallback(async () => {
    await loadNotificaciones();
  }, [loadNotificaciones]);

  const value = useMemo(
    () => ({
      notificaciones,
      noLeidas,
      isOpen,
      setOpen,
      markAsRead,
      createTestNotification,
      refreshNotifications,
    }),
    [notificaciones, noLeidas, isOpen, markAsRead, createTestNotification, refreshNotifications],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error("useNotifications debe usarse dentro de NotificationsProvider");
  }

  return context;
}

export function NotificationsBell() {
  const { noLeidas, isOpen, setOpen } = useNotifications();

  return (
    <button
      type="button"
      onClick={() => setOpen(!isOpen)}
      className="relative rounded-xl border border-white/10 bg-[#121212] p-2.5 text-zinc-200 transition hover:border-[#c8ff00]/40 hover:text-[#c8ff00]"
      aria-label="Notificaciones"
    >
      <Bell className="h-5 w-5" />
      {noLeidas > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
          {noLeidas > 9 ? "9+" : noLeidas}
        </span>
      ) : null}
    </button>
  );
}

export function NotificationsPanel() {
  const { notificaciones, isOpen, setOpen, markAsRead, noLeidas } = useNotifications();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Cerrar notificaciones"
        onClick={() => setOpen(false)}
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-white/10 bg-[#161616] shadow-[-20px_0_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#c8ff00]">
              Inbox
            </p>
            <h2 className="mt-1 text-xl font-black text-white">Notificaciones</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {noLeidas > 0 ? `${noLeidas} sin leer` : "Estás al día"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-white/10 p-2 text-zinc-300 transition hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {notificaciones.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
              No tienes notificaciones todavía.
            </p>
          ) : (
            <ul className="space-y-3">
              {notificaciones.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-2xl border p-4 ${
                    item.leida
                      ? "border-white/10 bg-[#121212]"
                      : "border-[#c8ff00]/30 bg-[#c8ff00]/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-white">{item.titulo}</h3>
                    <span className="shrink-0 text-xs text-zinc-500">{timeAgo(item.created_at)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{item.mensaje}</p>
                  {!item.leida ? (
                    <button
                      type="button"
                      onClick={() => void markAsRead(item.id)}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#c8ff00] transition hover:text-[#d6ff4d]"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Marcar como leída
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

export function TestNotificationButton() {
  const { createTestNotification } = useNotifications();

  return (
    <button
      type="button"
      onClick={() => void createTestNotification()}
      className="fixed bottom-4 right-4 z-40 rounded-full border border-white/15 bg-[#1a1a1a]/90 px-3 py-2 text-[11px] font-medium text-zinc-500 shadow-lg backdrop-blur transition hover:border-[#c8ff00]/30 hover:text-[#c8ff00]"
    >
      Test Notificación
    </button>
  );
}
