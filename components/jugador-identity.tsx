import { formatDorsal, getPlayerInitials, hasDorsal, type DorsalValue } from "@/utils/jugador";

export function JugadorIdentity({
  nombre,
  dorsal,
}: {
  nombre: string;
  dorsal?: DorsalValue;
}) {
  const numbered = hasDorsal(dorsal);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={`flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl px-1 text-xs font-black ${
          numbered
            ? "bg-[#c8ff00] text-[#121212] shadow-[0_0_18px_rgba(200,255,0,0.28)]"
            : "border border-white/10 bg-[#1a1a1a] text-zinc-300"
        }`}
        aria-hidden
      >
        {numbered ? formatDorsal(dorsal) : getPlayerInitials(nombre)}
      </span>
      <p className="truncate font-medium text-white">{nombre}</p>
    </div>
  );
}
