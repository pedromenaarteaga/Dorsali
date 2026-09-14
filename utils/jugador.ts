export type DorsalValue = number | string | null | undefined;

export function hasDorsal(dorsal: DorsalValue): boolean {
  if (dorsal === null || dorsal === undefined) return false;

  const text = String(dorsal).trim();
  if (text === "") return false;

  return !Number.isNaN(Number(text));
}

export function formatDorsal(dorsal: DorsalValue) {
  if (!hasDorsal(dorsal)) return null;
  return `#${Number(dorsal)}`;
}

export function getPlayerInitials(nombre: string) {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
