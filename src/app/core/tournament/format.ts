/**
 * Transforme un nom de tournoi en identifiant lisible pour l'URL :
 * « Coupe d'Hiver 2026 ! » → « coupe-d-hiver-2026 ».
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD') // « é » devient « e » + accent séparé…
    .replace(/[̀-ͯ]/g, '') // …qu'on retire
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/** Durée lisible : 845 → « 14 min 05 s ». */
export function formatDuration(totalSec: number): string {
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min} min ${String(sec).padStart(2, '0')} s`;
}

/** « 14:05 », « 14m05 », « 845 » → 845 secondes. `null` si illisible. */
export function parseDuration(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (/^\d+$/.test(text)) return Number(text);
  const parts = /^(\d+)\s*(?::|m|min)\s*(\d{1,2})\s*s?$/.exec(text);
  if (!parts) return null;
  const sec = Number(parts[2]);
  return sec < 60 ? Number(parts[1]) * 60 + sec : null;
}
