/**
 * Soirées FW et semaines de FW : les règles partagées par le serveur (bilan
 * de soirée, top de la semaine) et par le site (classement de la semaine).
 *
 * TypeScript pur, sans Angular : le Worker l'importe aussi.
 */

/** Une ligne d'un joueur dans une FW (ce qu'il a fait dans cette guerre). */
export interface FwLine {
  readonly tag: string;
  readonly name: string;
  readonly attacks: number;
  readonly stars: number;
  /** Somme des destructions de ses attaques (100 + 87 = 187). */
  readonly destructionSum: number;
  /** Temps total de ses attaques, en secondes. */
  readonly duration: number;
  /** Attaques à 3 étoiles. */
  readonly triples?: number;
  /** Son HDV dans cette guerre. */
  readonly townHall?: number;
}

/** Un joueur classé sur une soirée ou une semaine. */
export interface RankedPlayer {
  readonly tag: string;
  readonly name: string;
  readonly attacks: number;
  readonly stars: number;
  readonly triples: number;
  /** Son HDV (à sa guerre la plus récente). */
  readonly townHall: number | null;
  /** Étoiles par attaque : le critère du classement (au prorata des attaques). */
  readonly starsPerAttack: number;
  /** Destruction moyenne par attaque (départage n° 1). */
  readonly destruction: number;
  /** Temps moyen par attaque, en secondes (départage n° 2 : le plus rapide). */
  readonly durationPerAttack: number;
}

/**
 * Une attaque sur la soirée suffit pour être classé (au prorata) : seuls les
 * comptes qui n'ont pas attaqué (ceux qui complètent les équipes) sont exclus.
 */
export const EVENING_MIN_ATTACKS = 1;

/**
 * Le classement : étoiles par attaque, puis destruction moyenne, puis le plus
 * rapide. Au prorata : un joueur venu en cours de route n'est pas pénalisé.
 * Les lignes d'un même joueur (plusieurs FW) sont additionnées ; son nom est
 * celui de la première ligne (la plus récente, si elles sont triées ainsi).
 */
export function rankPlayers(
  lines: readonly FwLine[],
  minAttacks = EVENING_MIN_ATTACKS,
): RankedPlayer[] {
  const byTag = new Map<
    string,
    { name: string; th: number | null; a: number; s: number; d: number; t: number; x: number }
  >();
  for (const l of lines) {
    const p = byTag.get(l.tag) ?? {
      name: l.name,
      th: l.townHall ?? null,
      a: 0,
      s: 0,
      d: 0,
      t: 0,
      x: 0,
    };
    p.a += l.attacks;
    p.s += l.stars;
    p.d += l.destructionSum;
    p.t += l.duration;
    p.x += l.triples ?? 0;
    byTag.set(l.tag, p);
  }
  return [...byTag]
    .filter(([, p]) => p.a >= minAttacks)
    .map(([tag, p]) => ({
      tag,
      name: p.name,
      townHall: p.th,
      attacks: p.a,
      stars: p.s,
      triples: p.x,
      starsPerAttack: p.s / p.a,
      destruction: Math.round((p.d / p.a) * 10) / 10,
      durationPerAttack: Math.round(p.t / p.a),
    }))
    .sort(
      (x, y) =>
        y.starsPerAttack - x.starsPerAttack ||
        y.destruction - x.destruction ||
        x.durationPerAttack - y.durationPerAttack ||
        x.name.localeCompare(y.name, 'fr'),
    );
}

// ------------------------------------------------------------ semaines (lundi → lundi)

const PARIS = 'Europe/Paris';

/** Décalage de l'heure de Paris (en heures) à cet instant : 1 l'hiver, 2 l'été. */
function parisOffsetHours(ms: number): number {
  const label =
    new Intl.DateTimeFormat('en-US', { timeZone: PARIS, timeZoneName: 'shortOffset' })
      .formatToParts(new Date(ms))
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const m = /GMT([+-]\d+)?/.exec(label);
  return m?.[1] ? Number(m[1]) : 0;
}

/** Minuit (heure de Paris) du jour « 2026-10-26 », en millisecondes. */
function parisMidnight(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  // L'heure change toujours la nuit, entre 1 h et 3 h : à midi, le décalage est celui du jour.
  return Date.UTC(y, m - 1, d) - parisOffsetHours(Date.UTC(y, m - 1, d, 12)) * 3_600_000;
}

/** « 2026-10-26 » + n jours. */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Le lundi de la semaine de cet instant (heure de Paris) : « 2026-10-26 ».
 * Une semaine va du lundi 0 h au lundi suivant 0 h.
 */
export function weekOf(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  const fromMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  return addDays(day, -Math.max(0, fromMonday));
}

/** La semaine qui commence ce lundi : [début, fin[ en millisecondes. */
export function weekRange(monday: string): { readonly start: number; readonly end: number } {
  return { start: parisMidnight(monday), end: parisMidnight(addDays(monday, 7)) };
}

/** La semaine précédente : « 2026-10-26 » → « 2026-10-19 ». */
export function previousWeek(monday: string): string {
  return addDays(monday, -7);
}

/** Un lundi bien écrit ? (paramètre d'adresse) */
export function isMonday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
}

/** « du 26/10 au 01/11 » : la semaine en clair (du lundi au dimanche). */
export function weekLabel(monday: string): string {
  const short = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  return `du ${short(monday)} au ${short(addDays(monday, 6))}`;
}

// ------------------------------------------------------------ mois, périodes

/** Les FW enregistrées commencent en octobre 2026 : rien à montrer avant. */
export const FIRST_WEEK = '2026-10-19';
export const FIRST_MONTH = '2026-10';

/** Une période du classement FW : une semaine (son lundi) ou un mois (« 2026-10 »). */
export type FwPeriod =
  | { readonly kind: 'week'; readonly value: string }
  | { readonly kind: 'month'; readonly value: string };

/** Le mois de cet instant (heure de Paris) : « 2026-10 ». */
export function monthOf(ms: number): string {
  return weekDay(ms).slice(0, 7);
}

/** « 2026-10-28 » : le jour de cet instant, heure de Paris. */
function weekDay(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

/** Un mois bien écrit ? (paramètre d'adresse) */
export function isMonth(value: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

/** Le mois précédent : « 2026-01 » → « 2025-12 ». */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Le mois qui commence le 1er : [début, fin[ en millisecondes (minuit, heure de Paris). */
export function monthRange(month: string): { readonly start: number; readonly end: number } {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start: parisMidnight(`${month}-01`), end: parisMidnight(`${next}-01`) };
}

/** « octobre 2026 ». */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 15)));
}

export function periodRange(p: FwPeriod): { readonly start: number; readonly end: number } {
  return p.kind === 'week' ? weekRange(p.value) : monthRange(p.value);
}

/** « du 26/10 au 01/11 » ou « en octobre 2026 ». */
export function periodLabel(p: FwPeriod): string {
  return p.kind === 'week' ? weekLabel(p.value) : `en ${monthLabel(p.value)}`;
}

// ------------------------------------------------------------ image du bilan

/** Un joueur sur l'image du bilan. */
export interface RecapPlayer {
  readonly name: string;
  readonly th: number | null;
  /** Étoiles par attaque. */
  readonly spa: number;
  readonly attacks: number;
  readonly destruction: number;
  readonly triples: number;
}

/** L'image du bilan d'une soirée (page /affiche/bilan, photographiée par le bot). */
export interface EveningRecap {
  readonly number: number;
  /** « mercredi 28/10 ». */
  readonly day: string;
  readonly wars: number;
  readonly attacks: number;
  readonly triples: number;
  readonly top: readonly RecapPlayer[];
}

export function recapQuery(r: EveningRecap): string {
  return new URLSearchParams({
    n: String(r.number),
    d: r.day,
    w: String(r.wars),
    a: String(r.attacks),
    x: String(r.triples),
    top: JSON.stringify(
      r.top.map((p) => [
        p.name,
        p.th,
        Math.round(p.spa * 100) / 100,
        p.attacks,
        p.destruction,
        p.triples,
      ]),
    ),
  }).toString();
}

/** Le top lu dans l'adresse ; illisible → vide (la page s'affiche quand même). */
export function parseRecapTop(raw: string): RecapPlayer[] {
  try {
    const rows = JSON.parse(raw) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 5).map((row) => {
      const [name, th, spa, attacks, destruction, triples] = row as unknown[];
      return {
        name: String(name ?? '?'),
        th: typeof th === 'number' ? th : null,
        spa: Number(spa) || 0,
        attacks: Number(attacks) || 0,
        destruction: Number(destruction) || 0,
        triples: Number(triples) || 0,
      };
    });
  } catch {
    return [];
  }
}
