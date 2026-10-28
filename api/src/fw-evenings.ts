import {
  previousWeek,
  rankPlayers,
  weekLabel,
  weekOf,
  weekRange,
  type FwLine,
  type RankedPlayer,
} from '../../src/app/core/fw/evening';
import type { Announcer } from './announcements';
import type { CocPlayer } from './coc';
import { sqliteTime, toSqliteTime } from './repository';

/**
 * Les soirées FW « chill » : créées par un modo (/fw soiree), inscriptions
 * par bouton sous l'affiche, puis le bilan de la soirée (top 5 des joueurs)
 * dans #résultats. Et, chaque lundi, le top de la semaine passée.
 */

/** Les FW d'une soirée : lancées entre 1 h avant l'heure prévue et 8 h après. */
const EARLY_MS = 60 * 60 * 1000;
const LATE_MS = 8 * 60 * 60 * 1000;
/** Bilan publié 45 minutes après la fin de la dernière FW (si aucune autre n'a commencé). */
const QUIET_MS = 45 * 60 * 1000;
/** Top de la semaine : publié le lundi à partir de 10 h (heure de Paris). */
const WEEKLY_HOUR = 10;
/** Sur une semaine, il faut au moins 4 attaques pour être classé. */
export const WEEK_MIN_ATTACKS = 4;

export interface Evening {
  readonly id: number;
  /** Début prévu (ms). */
  readonly startsAt: number;
  /** « 28/10 », « 20H30 ». */
  readonly date: string;
  readonly time: string;
  readonly note: string | null;
  /** Bilan publié ou soirée annulée : plus d'inscriptions. */
  readonly closed: boolean;
}

export interface Account {
  readonly tag: string;
  readonly name: string;
  readonly townHall: number | null;
}

export interface Signup extends Account {
  readonly discordId: string;
  readonly discordName: string;
}

interface EveningRow {
  id: number;
  starts_at: string;
  date_label: string;
  time_label: string;
  note: string | null;
  recap_posted_at: string | null;
  cancelled: number;
}

const toEvening = (r: EveningRow): Evening => ({
  id: r.id,
  startsAt: sqliteTime(r.starts_at),
  date: r.date_label,
  time: r.time_label,
  note: r.note,
  closed: r.recap_posted_at !== null || r.cancelled === 1,
});

// ------------------------------------------------------------ soirées

export async function createEvening(
  db: D1Database,
  e: { startsAt: number; date: string; time: string; note: string | null; createdBy: string },
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO fw_evenings (starts_at, date_label, time_label, note, created_by)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(toSqliteTime(e.startsAt), e.date, e.time, e.note, e.createdBy)
    .first<{ id: number }>();
  return row!.id;
}

export async function getEvening(db: D1Database, id: number): Promise<Evening | null> {
  const row = await db
    .prepare('SELECT * FROM fw_evenings WHERE id = ?')
    .bind(id)
    .first<EveningRow>();
  return row ? toEvening(row) : null;
}

/** La dernière soirée créée et encore ouverte (pour l'annuler). */
export async function latestOpenEvening(db: D1Database): Promise<Evening | null> {
  const row = await db
    .prepare(
      `SELECT * FROM fw_evenings WHERE recap_posted_at IS NULL AND cancelled = 0
       ORDER BY id DESC LIMIT 1`,
    )
    .first<EveningRow>();
  return row ? toEvening(row) : null;
}

export async function cancelEvening(db: D1Database, id: number): Promise<void> {
  await db.prepare('UPDATE fw_evenings SET cancelled = 1 WHERE id = ?').bind(id).run();
}

// ------------------------------------------------------------ comptes et inscriptions

/** Les comptes du jeu retenus pour cette personne, dans l'ordre où elle les a ajoutés. */
export async function accountsOf(db: D1Database, discordId: string): Promise<Account[]> {
  const { results } = await db
    .prepare(
      `SELECT player_tag, player_name, town_hall FROM discord_accounts
       WHERE discord_id = ? ORDER BY added_at, player_tag`,
    )
    .bind(discordId)
    .all<{ player_tag: string; player_name: string; town_hall: number | null }>();
  return results.map((r) => ({ tag: r.player_tag, name: r.player_name, townHall: r.town_hall }));
}

/** Retient un compte (ou met à jour son nom et son HDV). */
export async function saveAccount(db: D1Database, discordId: string, p: CocPlayer): Promise<void> {
  await db
    .prepare(
      `INSERT INTO discord_accounts (discord_id, player_tag, player_name, town_hall)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (discord_id, player_tag) DO UPDATE
       SET player_name = excluded.player_name, town_hall = excluded.town_hall`,
    )
    .bind(discordId, p.tag, p.name, p.townHall)
    .run();
}

export async function signupsOf(db: D1Database, eveningId: number): Promise<Signup[]> {
  const { results } = await db
    .prepare(
      `SELECT player_tag, player_name, town_hall, discord_id, discord_name FROM fw_signups
       WHERE evening_id = ? ORDER BY signed_at, player_tag`,
    )
    .bind(eveningId)
    .all<{
      player_tag: string;
      player_name: string;
      town_hall: number | null;
      discord_id: string;
      discord_name: string;
    }>();
  return results.map((r) => ({
    tag: r.player_tag,
    name: r.player_name,
    townHall: r.town_hall,
    discordId: r.discord_id,
    discordName: r.discord_name,
  }));
}

/**
 * Les comptes inscrits par cette personne deviennent exactement `accounts`
 * (cases cochées dans la liste) : ceux décochés sont retirés.
 */
export async function setSignups(
  db: D1Database,
  eveningId: number,
  who: { id: string; name: string },
  accounts: readonly Account[],
): Promise<void> {
  await db.batch([
    db
      .prepare('DELETE FROM fw_signups WHERE evening_id = ? AND discord_id = ?')
      .bind(eveningId, who.id),
    ...accounts.map((a) => signupStatement(db, eveningId, who, a)),
  ]);
}

/** Inscrit un compte de plus (sans toucher aux autres). */
export async function addSignup(
  db: D1Database,
  eveningId: number,
  who: { id: string; name: string },
  account: Account,
): Promise<void> {
  await signupStatement(db, eveningId, who, account).run();
}

function signupStatement(
  db: D1Database,
  eveningId: number,
  who: { id: string; name: string },
  a: Account,
): D1PreparedStatement {
  // Même compte inscrit par quelqu'un d'autre : la dernière inscription l'emporte.
  return db
    .prepare(
      `INSERT INTO fw_signups (evening_id, player_tag, player_name, town_hall, discord_id, discord_name)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (evening_id, player_tag) DO UPDATE
       SET player_name = excluded.player_name, town_hall = excluded.town_hall,
           discord_id = excluded.discord_id, discord_name = excluded.discord_name`,
    )
    .bind(eveningId, a.tag, a.name, a.townHall, who.id, who.name);
}

/** Désinscrit tous les comptes de cette personne ; renvoie leurs noms. */
export async function removeSignups(
  db: D1Database,
  eveningId: number,
  discordId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      'DELETE FROM fw_signups WHERE evening_id = ? AND discord_id = ? RETURNING player_name',
    )
    .bind(eveningId, discordId)
    .all<{ player_name: string }>();
  return results.map((r) => r.player_name);
}

// ------------------------------------------------------------ statistiques d'une période

/** Les lignes des joueurs dans les FW lancées pendant [start, end[ (la plus récente d'abord). */
export async function fwLines(
  db: D1Database,
  start: number,
  end: number,
): Promise<{ wars: number; lastEnd: number | null; lines: FwLine[] }> {
  const { results } = await db
    .prepare(
      `SELECT w.id AS war_id, w.ended_at, p.player_tag, p.player_name, p.attacks, p.stars,
              p.destruction_sum, p.duration
       FROM friendly_wars w JOIN fw_players p ON p.war_id = w.id
       WHERE w.started_at >= ? AND w.started_at < ?
       ORDER BY w.started_at DESC, w.id DESC`,
    )
    .bind(toSqliteTime(start), toSqliteTime(end))
    .all<{
      war_id: number;
      ended_at: string | null;
      player_tag: string;
      player_name: string;
      attacks: number;
      stars: number;
      destruction_sum: number;
      duration: number;
    }>();
  const ends = results.map((r) => (r.ended_at ? sqliteTime(r.ended_at) : NaN));
  const known = ends.filter((t) => !Number.isNaN(t));
  return {
    wars: new Set(results.map((r) => r.war_id)).size,
    lastEnd: known.length ? Math.max(...known) : null,
    lines: results.map((r) => ({
      tag: r.player_tag,
      name: r.player_name,
      attacks: r.attacks,
      stars: r.stars,
      destructionSum: r.destruction_sum,
      duration: r.duration,
    })),
  };
}

// ------------------------------------------------------------ bilan de la soirée

/** « mercredi 28/10 » (heure de Paris). */
export function dayLabel(ms: number): string {
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(new Date(ms));
  return `${f({ weekday: 'long' })} ${f({ day: '2-digit' })}/${f({ month: '2-digit' })}`;
}

/** Les noms de joueurs n'abîment pas la mise en forme de Discord (« **», « _ »…). */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_`~|])/g, '\\$1');
}

const MEDALS = ['🥇', '🥈', '🥉', '4.', '5.'];
const comma = (n: number, digits: number) => n.toFixed(digits).replace('.', ',');

function podium(top: readonly RankedPlayer[]): string[] {
  return top.map(
    (p, i) =>
      `${MEDALS[i]} **${escapeMarkdown(p.name)}** — ${comma(p.starsPerAttack, 2)} ★/attaque · ` +
      `${p.attacks} attaque${p.attacks > 1 ? 's' : ''} · ${comma(p.destruction, 1)} %`,
  );
}

/** Le message du bilan dans #résultats : le top 5 des joueurs de la soirée. */
export function eveningRecapText(
  evening: Evening,
  wars: number,
  ranked: readonly RankedPlayer[],
  siteUrl: string,
): string {
  const header =
    `🌙 **Bilan de la soirée FW du ${dayLabel(evening.startsAt)}** · ` +
    `${wars} FW jouée${wars > 1 ? 's' : ''}`;
  const link = `📊 Toutes les stats : ${siteUrl}/joueurs?type=fw&semaine=${weekOf(evening.startsAt)}`;
  if (ranked.length === 0) {
    return `${header}\nPersonne n'a fait 2 attaques ce soir : pas de classement cette fois.\n${link}`;
  }
  return [
    header,
    '**Top 5 des joueurs** (étoiles par attaque, 2 attaques minimum)',
    ...podium(ranked.slice(0, 5)),
    '',
    'Merci à tous d’être venus ! ⚔️',
    link,
  ].join('\n');
}

/** Une soirée dont le bilan est à faire maintenant (ou à abandonner : aucune FW). */
export interface DueRecap {
  readonly evening: Evening;
  /** `null` : aucune FW jouée, la soirée est simplement close. */
  readonly text: string | null;
}

/**
 * Les soirées terminées dont le bilan n'est pas encore publié. Une soirée est
 * terminée 45 minutes après la fin de sa dernière FW, si aucune FW n'est en
 * cours, ou au plus tard 8 heures après son début.
 */
export async function dueRecaps(
  db: D1Database,
  siteUrl: string,
  now: number,
): Promise<DueRecap[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM fw_evenings
       WHERE recap_posted_at IS NULL AND cancelled = 0 AND starts_at <= ?`,
    )
    .bind(toSqliteTime(now))
    .all<EveningRow>();
  if (results.length === 0) return [];

  const inProgress = await db.prepare('SELECT 1 FROM fw_snapshots LIMIT 1').first();
  const due: DueRecap[] = [];
  for (const evening of results.map(toEvening)) {
    const windowEnd = evening.startsAt + LATE_MS;
    const { wars, lastEnd, lines } = await fwLines(
      db,
      evening.startsAt - EARLY_MS,
      Math.min(windowEnd, now),
    );
    const over = now >= windowEnd;
    if (wars === 0) {
      if (over) due.push({ evening, text: null });
      continue;
    }
    const quiet = !inProgress && lastEnd !== null && now - lastEnd >= QUIET_MS;
    if (quiet || over) {
      due.push({ evening, text: eveningRecapText(evening, wars, rankPlayers(lines), siteUrl) });
    }
  }
  return due;
}

/** Publie les bilans dus dans #résultats (appelé chaque minute). */
export async function postDueRecaps(
  db: D1Database,
  announcer: Announcer,
  siteUrl: string,
  now = Date.now(),
): Promise<number> {
  let posted = 0;
  for (const { evening, text } of await dueRecaps(db, siteUrl, now)) {
    if (text) {
      await announcer.post('results', { content: text });
      posted++;
    }
    await db
      .prepare('UPDATE fw_evenings SET recap_posted_at = ? WHERE id = ?')
      .bind(toSqliteTime(now), evening.id)
      .run();
  }
  return posted;
}

// ------------------------------------------------------------ top de la semaine

/** Le message du top de la semaine (salon des stats). */
export function weeklyTopText(
  monday: string,
  wars: number,
  ranked: readonly RankedPlayer[],
  siteUrl: string,
): string {
  const header = `📅 **Top FW de la semaine** (${weekLabel(monday)}) · ${wars} FW jouée${wars > 1 ? 's' : ''}`;
  const link = `📊 Le classement complet : ${siteUrl}/joueurs?type=fw&semaine=${monday}`;
  if (ranked.length === 0) return `${header}\nPas assez d'attaques cette semaine pour un classement.\n${link}`;
  return [
    header,
    `**Les 5 meilleurs** (étoiles par attaque, ${WEEK_MIN_ATTACKS} attaques minimum)`,
    ...podium(ranked.slice(0, 5)),
    '',
    link,
  ].join('\n');
}

/** Lundi, 10 h passées, heure de Paris ? */
function isMondayMorning(now: number): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return weekday === 'Mon' && hour >= WEEKLY_HOUR;
}

/**
 * Le lundi à partir de 10 h : le top de la semaine passée, une seule fois,
 * dans le salon des stats. Rien tant que ce salon n'est pas configuré, et
 * rien s'il n'y a eu aucune FW.
 */
export async function postWeeklyTop(
  db: D1Database,
  announcer: Announcer,
  siteUrl: string,
  now = Date.now(),
): Promise<boolean> {
  if (!isMondayMorning(now) || !announcer.can('stats')) return false;
  const monday = previousWeek(weekOf(now));
  const done = await db
    .prepare('SELECT 1 FROM fw_weekly_posts WHERE week = ?')
    .bind(monday)
    .first();
  if (done) return false;

  const { start, end } = weekRange(monday);
  const { wars, lines } = await fwLines(db, start, end);
  // Noté AVANT de poster : jamais deux fois, même si deux passages se croisent.
  await db.prepare('INSERT OR IGNORE INTO fw_weekly_posts (week) VALUES (?)').bind(monday).run();
  if (wars === 0) return false;
  await announcer.post('stats', {
    content: weeklyTopText(monday, wars, rankPlayers(lines, WEEK_MIN_ATTACKS), siteUrl),
  });
  return true;
}
