/**
 * Affiche d'un match (deux clans, format, date, heure, règles) : les règles
 * de mise en forme, partagées par le site (qui la dessine) et par le bot (qui
 * vérifie ce que l'arbitre a tapé avant de la faire capturer).
 *
 * TypeScript pur, sans Angular : le Worker l'importe aussi.
 */

/** Formats proposés (le jeu ne va pas au-delà de 15 contre 15 en amical… en pratique). */
export const POSTER_FORMATS = ['5v5', '10v10', '15v15'] as const;
export type PosterFormat = (typeof POSTER_FORMATS)[number];

/** Ce qu'il faut pour dessiner une affiche. */
export interface PosterInput {
  readonly leftName: string;
  readonly leftLogo: string;
  readonly rightName: string;
  readonly rightLogo: string;
  readonly format: string;
  /** « 26/10 » */
  readonly date: string;
  /** « 22H00 » */
  readonly time: string;
  readonly rules: string;
  /** Affiche de résultat : l'équipe qui a gagné, et le score (« 2-1 »). */
  readonly winner?: 'left' | 'right';
  readonly score?: string;
}

/** « 26-10 », « 26.10 », « 6/1 » → « 26/10 », « 06/01 ». `null` si ce n'est pas une date. */
export function normalizeDate(raw: string): string | null {
  const m = /^\s*(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*$/.exec(raw);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

/** « 22h », « 22:00 », « 21h30 », « 9H » → « 22H00 », « 21H30 », « 09H00 ». `null` sinon. */
export function normalizeTime(raw: string): string | null {
  const m = /^\s*(\d{1,2})\s*(?:[hH:]\s*(\d{2})?)?\s*$/.exec(raw);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2] ?? 0);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}H${String(minutes).padStart(2, '0')}`;
}

/**
 * Le jour du match, à midi : jamais au milieu d'un changement d'heure (ils se
 * font toujours entre 1 h et 3 h du matin). L'année est celle de la prochaine
 * occurrence de la date : en décembre, « 05/01 » est en janvier prochain.
 */
function matchDay(date: string, now: Date): Date | null {
  const normalized = normalizeDate(date);
  if (!normalized) return null;
  const [day, month] = normalized.split('/').map(Number);
  let year = now.getUTCFullYear();
  // Plus d'un mois dans le passé : c'est l'an prochain.
  if (Date.UTC(year, month - 1, day) < now.getTime() - 31 * 86_400_000) year++;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/**
 * Décalage de l'heure française ce jour-là : « UTC+1 » l'hiver, « UTC+2 »
 * l'été (le passage se fait fin mars et fin octobre).
 */
export function franceOffset(date: string, now = new Date()): string {
  const noon = matchDay(date, now);
  if (!noon) return 'UTC+1';
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    timeZoneName: 'shortOffset',
  })
    .formatToParts(noon)
    .find((p) => p.type === 'timeZoneName')?.value;
  return label?.replace('GMT', 'UTC') ?? 'UTC+1';
}

/**
 * « 28/10 » + « 20H30 » (heure de France) → l'instant exact, en millisecondes.
 * `null` si la date ou l'heure est illisible.
 */
export function franceDateTime(date: string, time: string, now = new Date()): number | null {
  const noon = matchDay(date, now);
  const clock = normalizeTime(time);
  if (!noon || !clock) return null;
  const [hours, minutes] = clock.split('H').map(Number);
  const offset = Number(/UTC([+-]\d+)/.exec(franceOffset(date, now))?.[1] ?? 1);
  return Date.UTC(
    noon.getUTCFullYear(),
    noon.getUTCMonth(),
    noon.getUTCDate(),
    hours - offset,
    minutes,
  );
}

/** Le jour de la semaine du match : « Samedi ». `null` si la date est illisible. */
export function weekdayOf(date: string, now = new Date()): string | null {
  const noon = matchDay(date, now);
  if (!noon) return null;
  const day = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    timeZone: 'Europe/Paris',
  }).format(noon);
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/**
 * Logos acceptés : ceux que Discord héberge (pièces jointes de la commande).
 * L'affiche ne charge jamais une image venue d'ailleurs : quelqu'un ne peut
 * pas fabriquer une adresse d'affiche qui afficherait n'importe quoi.
 */
export function isAllowedLogo(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    // Les logos copiés par le serveur (gardés jusqu'au match), ou ceux de Discord.
    if (u.hostname === LOGO_HOST) return u.pathname.startsWith('/logos/');
    return ['cdn.discordapp.com', 'media.discordapp.net'].includes(u.hostname);
  } catch {
    return false;
  }
}

/** Le serveur qui garde les logos des matchs « Clan vs Clan » (GET /logos/…). */
export const LOGO_HOST = 'spade-cup-api.popi-coc.workers.dev';

/** Paramètres de l'adresse /affiche (courts : l'adresse contient deux URL d'images). */
export function posterQuery(input: PosterInput): string {
  return new URLSearchParams({
    g: input.leftName,
    gl: input.leftLogo,
    d: input.rightName,
    dl: input.rightLogo,
    f: input.format,
    j: input.date,
    h: input.time,
    r: input.rules,
    // Affiche de résultat : v = 1 (gauche) ou 2 (droite), sc = le score.
    ...(input.winner ? { v: input.winner === 'left' ? '1' : '2' } : {}),
    ...(input.score ? { sc: input.score } : {}),
  }).toString();
}

/** Initiales d'un nom d'équipe, quand le logo ne charge pas : « Clash Invaders » → « CI ». */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [...(words[0] ?? '?')].slice(0, 2);
  return letters.join('').toUpperCase();
}
