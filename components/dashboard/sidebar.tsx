"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Dumbbell,
  Home,
  Menu,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { NotificationsBell } from "@/components/dashboard/notifications";

const navItems = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/dashboard/mi-equipo", label: "Mi Equipo", icon: Users },
  { href: "/dashboard/tesoreria", label: "Tesorería", icon: Wallet },
  { href: "/dashboard/partidos", label: "Partidos", icon: Trophy },
  {
    href: "/dashboard/entrenamiento",
    label: "Centro de Entrenamiento",
    icon: Dumbbell,
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#161616]/95 px-4 py-3 backdrop-blur lg:hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#c8ff00]">
          Dorsali
        </p>
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="rounded-lg border border-white/10 p-2 text-zinc-200 transition hover:border-[#c8ff00]/40 hover:text-[#c8ff00]"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {isOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          aria-label="Cerrar menú"
          onClick={() => setIsOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/10 bg-[#161616] px-5 py-8 transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-10 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#c8ff00]">
              Dorsali
            </p>
            <p className="mt-2 text-lg font-black text-white">Panel</p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-lg border border-white/10 p-2 text-zinc-300 lg:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                  active
                    ? "bg-[#c8ff00]/15 text-[#c8ff00] shadow-[inset_0_0_0_1px_rgba(200,255,0,0.25)]"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
