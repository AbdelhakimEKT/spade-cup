import {
  previousWeek,
  rankPlayers,
  weekLabel,
  weekOf,
  weekRange,
  type FwLine,
  type RankedPlayer,
} from '../../src/app/core/fw/evening';
import {
  DEFAULT_DETAILS,
  TEAMS_BEFORE_MS,
  type SessionDetails,
  type Team,
  type TeamMode,
} from '../../src/app/core/fw/session';
import type { Announcer } from './announcements';
import type { CocPlayer } from './coc';
import { sqliteTime, toSqliteTime } from './repository';
import { getFriendlyWar } from './stats-repository';

/**
 * Les soirées FW (« FW #41 ») : leur fiche, les comptes inscrits et leurs
 * équipes, le bilan de la soirée et le top de la semaine. Ici, seulement les
 * données et les calculs ; ce que le bot poste est dans discord/fw.ts.
 */

/** Les FW d'une soirée : lancées entre 1 h avant l'heure prévue et le bilan. */
const EARLY_MS = 60 * 60 * 1000;
/** Top de la semaine : publié le lundi à partir de 10 h (heure de Paris). */
const WEEKLY_HOUR = 10;
/** Sur une semaine, il faut au moins 4 attaques pour être classé. */
export const WEEK_MIN_ATTACKS = 4;
/** Le top de la semaine : les 10 meilleurs. */
const WEEK_TOP = 10;

export interface Evening {
  readonly id: number;
  /** « FW #41 ». */
  readonly number: number;
  /** Début prévu (ms). */
  readonly startsAt: number;
  /** « 28/10 », « 21H00 ». */
  readonly date: string;
  readonly time: string;
  readonly mode: TeamMode;
  readonly details: SessionDetails;
  /** La fiche d'inscription (#inscription) et l'annonce (#annonce-fw). */
  readonly signup: { readonly channel: string; readonly message: string } | null;
  readonly announce: { readonly channel: string; readonly message: string } | null;
  /** Équipes faites (ms), ou `null`. */
  readonly teamsAt: number | null;
  /** Bilan publié ou soirée annulée : la soirée est finie. */
  readonly closed: boolean;
  /** Bilan publié (ms), ou `null`. */
  readonly recapPostedAt: number | null;
  readonly cancelled: boolean;
  /** Soirée d'essai : tout dans un seul salon, sans ping, sans numéro. */
  readonly test: boolean;
}

export interface Account {
  readonly tag: string;
  readonly name: string;
  readonly townHall: number | null;
}

export interface Signup extends Account {
  readonly discordId: string;
  readonly discordName: string;
  readonly team: Team | null;
}

interface EveningRow {
  id: number;
  number: number | null;
  starts_at: string;
  date_label: string;
  time_label: string;
  mode: string;
  format: string | null;
  preparation: string | null;
  war_length: string | null;
  attacks: string | null;
  rounds: string | null;
  accepted: string | null;
  signup_channel: string | null;
  signup_message: string | null;
  announce_channel: string | null;
  announce_message: string | null;
  teams_at: string | null;
  recap_posted_at: string | null;
  cancelled: number;
  test: number;
}

const message = (channel: string | null, id: string | null) =>
  channel && id ? { channel, message: id } : null;

const toEvening = (r: EveningRow): Evening => ({
  id: r.id,
  number: r.number ?? r.id,
  startsAt: sqliteTime(r.starts_at),
  date: r.date_label,
  time: r.time_label,
  mode: r.mode === 'libre' ? 'libre' : 'random',
  details: {
    format: r.format ?? DEFAULT_DETAILS.format,
    preparation: r.preparation ?? DEFAULT_DETAILS.preparation,
    war: r.war_length ?? DEFAULT_DETAILS.war,
    attacks: r.attacks ?? DEFAULT_DETAILS.attacks,
    rounds: r.rounds ?? DEFAULT_DETAILS.rounds,
    accepted: r.accepted ?? DEFAULT_DETAILS.accepted,
  },
  signup: message(r.signup_channel, r.signup_message),
  announce: message(r.announce_channel, r.announce_message),
  teamsAt: r.teams_at ? sqliteTime(r.teams_at) : null,
  closed: r.recap_posted_at !== null || r.cancelled === 1,
  recapPostedAt: r.recap_posted_at ? sqliteTime(r.recap_posted_at) : null,
  cancelled: r.cancelled === 1,
  test: r.test === 1,
});

// ------------------------------------------------------------ soirées

/** Le numéro de la prochaine soirée : le dernier + 1 (ou `first` pour la toute première). */
export async function nextNumber(db: D1Database, first: number): Promise<number> {
  const row = await db
    .prepare('SELECT MAX(number) AS last FROM fw_evenings WHERE cancelled = 0 AND test = 0')
    .first<{ last: number | null }>();
  return row?.last ? row.last + 1 : first;
}

export interface EveningInput {
  readonly number: number;
  readonly startsAt: number;
  readonly date: string;
  readonly time: string;
  readonly mode: TeamMode;
  readonly details: SessionDetails;
  readonly createdBy: string;
  readonly test?: boolean;
}

export async function createEvening(db: D1Database, e: EveningInput): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO fw_evenings (number, starts_at, date_label, time_label, mode, format,
         preparation, war_length, attacks, rounds, accepted, created_by, test)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      e.number,
      toSqliteTime(e.startsAt),
      e.date,
      e.time,
      e.mode,
      e.details.format,
      e.details.preparation,
      e.details.war,
      e.details.attacks,
      e.details.rounds,
      e.details.accepted,
      e.createdBy,
      e.test ? 1 : 0,
    )
    .first<{ id: number }>();
  return row!.id;
}

/** Modifie la fiche (/fw modifier). */
export async function updateEvening(
  db: D1Database,
  id: number,
  e: Omit<EveningInput, 'createdBy' | 'test'>,
): Promise<void> {
  await db
    .prepare(
      `UPDATE fw_evenings SET number = ?, starts_at = ?, date_label = ?, time_label = ?, mode = ?,
         format = ?, preparation = ?, war_length = ?, attacks = ?, rounds = ?, accepted = ?
       WHERE id = ?`,
    )
    .bind(
      e.number,
      toSqliteTime(e.startsAt),
      e.date,
      e.time,
      e.mode,
      e.details.format,
      e.details.preparation,
      e.details.war,
      e.details.attacks,
      e.details.rounds,
      e.details.accepted,
      id,
    )
    .run();
}

/** Où sont la fiche d'inscription et l'annonce (pour les tenir à jour). */
export async function saveMessages(
  db: D1Database,
  id: number,
  m: {
    signup: { channel: string; message: string } | null;
    announce: { channel: string; message: string } | null;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE fw_evenings SET signup_channel = ?, signup_message = ?,
         announce_channel = ?, announce_message = ? WHERE id = ?`,
    )
    .bind(
      m.signup?.channel ?? null,
      m.signup?.message ?? null,
      m.announce?.channel ?? null,
      m.announce?.message ?? null,
      id,
    )
    .run();
}

export async function getEvening(db: D1Database, id: number): Promise<Evening | null> {
  const row = await db
    .prepare('SELECT * FROM fw_evenings WHERE id = ?')
    .bind(id)
    .first<EveningRow>();
  return row ? toEvening(row) : null;
}

/** La dernière soirée lancée et pas encore finie (celle que les commandes gèrent). */
export async function currentEvening(db: D1Database): Promise<Evening | null> {
  const row = await db
    .prepare(
      `SELECT * FROM fw_evenings WHERE recap_posted_at IS NULL AND cancelled = 0
       ORDER BY id DESC LIMIT 1`,
    )
    .first<EveningRow>();
  return row ? toEvening(row) : null;
}

/** La dernière soirée dont le bilan est publié (pour le republier). */
export async function lastFinishedEvening(db: D1Database): Promise<Evening | null> {
  const row = await db
    .prepare(
      `SELECT * FROM fw_evenings WHERE recap_posted_at IS NOT NULL AND cancelled = 0
       ORDER BY id DESC LIMIT 1`,
    )
    .first<EveningRow>();
  return row ? toEvening(row) : null;
}

export async function cancelEvening(db: D1Database, id: number): Promise<void> {
  await db.prepare('UPDATE fw_evenings SET cancelled = 1 WHERE id = ?').bind(id).run();
}

/** Le bilan est publié : la soirée est finie. */
export async function closeEvening(db: D1Database, id: number, now: number): Promise<void> {
  await db
    .prepare('UPDATE fw_evenings SET recap_posted_at = ? WHERE id = ?')
    .bind(toSqliteTime(now), id)
    .run();
}

export async function markTeams(db: D1Database, id: number, now: number): Promise<void> {
  await db
    .prepare('UPDATE fw_evenings SET teams_at = ? WHERE id = ?')
    .bind(toSqliteTime(now), id)
    .run();
}

/**
 * Les soirées dont les équipes sont à faire maintenant (H − 10), pas plus de
 * 3 heures en retard (le bot n'était pas configuré, par exemple).
 */
export async function eveningsNeedingTeams(db: D1Database, now: number): Promise<Evening[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM fw_evenings
       WHERE teams_at IS NULL AND recap_posted_at IS NULL AND cancelled = 0
         AND starts_at <= ? AND starts_at > ?`,
    )
    .bind(toSqliteTime(now + TEAMS_BEFORE_MS), toSqliteTime(now - 3 * 60 * 60 * 1000))
    .all<EveningRow>();
  return results.map(toEvening);
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
      `SELECT player_tag, player_name, town_hall, discord_id, discord_name, team FROM fw_signups
       WHERE evening_id = ? ORDER BY signed_at, player_tag`,
    )
    .bind(eveningId)
    .all<{
      player_tag: string;
      player_name: string;
      town_hall: number | null;
      discord_id: string;
      discord_name: string;
      team: Team | null;
    }>();
  return results.map((r) => ({
    tag: r.player_tag,
    name: r.player_name,
    townHall: r.town_hall,
    discordId: r.discord_id,
    discordName: r.discord_name,
    team: r.team,
  }));
}

export interface Who {
  readonly id: string;
  readonly name: string;
}

/** Inscrit (ou réinscrit) un compte, dans une équipe ou pas encore. */
export function signupStatement(
  db: D1Database,
  eveningId: number,
  who: Who,
  a: Account,
  team: Team | null,
): D1PreparedStatement {
  // Même compte inscrit par quelqu'un d'autre : la dernière inscription l'emporte.
  return db
    .prepare(
      `INSERT INTO fw_signups (evening_id, player_tag, player_name, town_hall, discord_id,
         discord_name, team)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (evening_id, player_tag) DO UPDATE
       SET player_name = excluded.player_name, town_hall = excluded.town_hall,
           discord_id = excluded.discord_id, discord_name = excluded.discord_name,
           team = excluded.team`,
    )
    .bind(eveningId, a.tag, a.name, a.townHall, who.id, who.name, team);
}

export async function run(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  if (statements.length) await db.batch(statements);
}

export function removeStatement(
  db: D1Database,
  eveningId: number,
  tag: string,
): D1PreparedStatement {
  return db
    .prepare('DELETE FROM fw_signups WHERE evening_id = ? AND player_tag = ?')
    .bind(eveningId, tag);
}

/** Désinscrit tous les comptes de cette personne ; renvoie leurs noms. */
export async function removeSignups(
  db: D1Database,
  eveningId: number,
  discordId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare('DELETE FROM fw_signups WHERE evening_id = ? AND discord_id = ? RETURNING player_name')
    .bind(eveningId, discordId)
    .all<{ player_name: string }>();
  return results.map((r) => r.player_name);
}

/** Change l'équipe de comptes inscrits (tirage, rééquilibrage). */
export async function setTeams(
  db: D1Database,
  eveningId: number,
  teams: ReadonlyMap<string, Team | null>,
): Promise<void> {
  await run(
    db,
    [...teams].map(([tag, team]) =>
      db
        .prepare('UPDATE fw_signups SET team = ? WHERE evening_id = ? AND player_tag = ?')
        .bind(team, eveningId, tag),
    ),
  );
}

// ------------------------------------------------------------ statistiques d'une période

/** Les lignes des joueurs dans les FW lancées pendant [start, end[ (la plus récente d'abord). */
export async function fwLines(
  db: D1Database,
  start: number,
  end: number,
): Promise<{ wars: number; lines: FwLine[] }> {
  const { results } = await db
    .prepare(
      `SELECT w.id AS war_id, p.player_tag, p.player_name, p.attacks, p.stars,
              p.destruction_sum, p.duration, p.triples, p.town_hall
       FROM friendly_wars w JOIN fw_players p ON p.war_id = w.id
       WHERE w.started_at >= ? AND w.started_at < ?
       ORDER BY w.started_at DESC, w.id DESC`,
    )
    .bind(toSqliteTime(start), toSqliteTime(end))
    .all<{
      war_id: number;
      player_tag: string;
      player_name: string;
      attacks: number;
      stars: number;
      destruction_sum: number;
      duration: number;
      triples: number;
      town_hall: number;
    }>();
  return {
    wars: new Set(results.map((r) => r.war_id)).size,
    lines: results.map((r) => ({
      tag: r.player_tag,
      name: r.player_name,
      attacks: r.attacks,
      stars: r.stars,
      destructionSum: r.destruction_sum,
      duration: r.duration,
      triples: r.triples,
      townHall: r.town_hall,
    })),
  };
}

/**
 * Les FW de la soirée : lancées depuis 1 h avant son début, jusqu'à maintenant
 * (ou jusqu'au bilan, si elle est déjà finie : les FW du lendemain n'en font pas partie).
 */
export function eveningLines(db: D1Database, evening: Evening, now: number) {
  return fwLines(db, evening.startsAt - EARLY_MS, (evening.recapPostedAt ?? now) + 1);
}

// ------------------------------------------------------------ textes

/** « mercredi 28/10 » (heure de Paris). */
export function dayLabel(ms: number): string {
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(new Date(ms));
  return `${f({ weekday: 'long' })} ${f({ day: '2-digit' })}/${f({ month: '2-digit' })}`;
}

/** Les noms de joueurs n'abîment pas la mise en forme de Discord (« ** », « _ »…). */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_`~|])/g, '\\$1');
}

const MEDALS = ['🥇', '🥈', '🥉'];
const comma = (n: number, digits: number) => n.toFixed(digits).replace('.', ',');

function podium(top: readonly RankedPlayer[]): string[] {
  return top.map(
    (p, i) =>
      `${MEDALS[i] ?? `${i + 1}.`} **${escapeMarkdown(p.name)}** — ` +
      `${comma(p.starsPerAttack, 2)} ★/attaque · ` +
      `${p.attacks} attaque${p.attacks > 1 ? 's' : ''} · ${comma(p.destruction, 1)} %`,
  );
}

/** Le bilan de la soirée dans #résultats : le top 5 des joueurs. */
export function eveningRecapText(
  evening: Evening,
  wars: number,
  ranked: readonly RankedPlayer[],
  siteUrl: string,
): string {
  const header =
    `🌙 **Bilan de la FW #${evening.number}** du ${dayLabel(evening.startsAt)} · ` +
    `${wars} FW jouée${wars > 1 ? 's' : ''}`;
  const link = `📊 Toutes les stats : ${siteUrl}/joueurs?type=fw&semaine=${weekOf(evening.startsAt)}`;
  if (ranked.length === 0) {
    return `${header}\nAucune attaque enregistrée : pas de classement cette fois.\n${link}`;
  }
  return [
    header,
    '**Top 5 des joueurs** (moyenne d’étoiles par attaque)',
    ...podium(ranked.slice(0, 5)),
    '',
    'Merci à tous d’être venus ! ⚔️',
    link,
  ].join('\n');
}

/** Le top de la semaine (salon des stats). */
export function weeklyTopText(
  monday: string,
  wars: number,
  ranked: readonly RankedPlayer[],
  siteUrl: string,
): string {
  const header =
    `📅 **Top FW de la semaine** (${weekLabel(monday)}) · ` +
    `${wars} FW jouée${wars > 1 ? 's' : ''}`;
  const link = `📊 Le classement complet : ${siteUrl}/joueurs?type=fw&semaine=${monday}`;
  if (ranked.length === 0) {
    return `${header}\nPas assez d'attaques cette semaine pour un classement.\n${link}`;
  }
  return [
    header,
    `**Les ${WEEK_TOP} meilleurs** (étoiles par attaque, ${WEEK_MIN_ATTACKS} attaques minimum)`,
    ...podium(ranked.slice(0, WEEK_TOP)),
    '',
    link,
  ].join('\n');
}

// ------------------------------------------------------------ top de la semaine

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
 * Le lundi à partir de 10 h : le top 10 de la semaine passée, une seule fois,
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

// ------------------------------------------------------------ récap de chaque FW

/** Une FW finie il y a plus longtemps n'est pas postée (rattrapage d'un vieux relevé). */
const RECAP_MAX_AGE_MS = 3 * 60 * 60 * 1000;

/** « ⚔️ FW terminée · FW-team1 12 ★ – 10 ★ FW-team2 · victoire de FW-team1 ». */
export function fwRecapText(war: {
  home: { name: string; stars: number };
  away: { name: string; stars: number };
  winner: 'home' | 'away' | null;
  partial: boolean;
}): string {
  const { home, away } = war;
  const result = war.winner
    ? `victoire de **${escapeMarkdown(war[war.winner].name)}**`
    : 'égalité parfaite';
  return (
    `⚔️ FW terminée · **${escapeMarkdown(home.name)}** ${home.stars} ★ – ${away.stars} ★ ` +
    `**${escapeMarkdown(away.name)}** · ${result}` +
    (war.partial ? '\n_Relevé partiel : les toutes dernières attaques peuvent manquer._' : '')
  );
}

/**
 * À la fin de chaque FW : son tableau joueur par joueur (la page du site,
 * photographiée) dans #statistiques-joueurs. Sans aucun ping. Rien si le
 * salon n'est pas configuré ; le texte seul si l'image échoue.
 */
export async function postFwRecaps(
  db: D1Database,
  announcer: Announcer,
  ids: readonly number[],
  siteUrl: string,
  now = Date.now(),
): Promise<number> {
  if (ids.length === 0 || !announcer.can('stats')) return 0;
  const wars = [];
  for (const id of ids) {
    const detail = await getFriendlyWar(db, id);
    const ended = detail?.war.endedAt ? Date.parse(detail.war.endedAt) : now;
    if (detail && now - ended < RECAP_MAX_AGE_MS) wars.push(detail.war);
  }
  if (wars.length === 0) return 0;
  let images: Uint8Array[] | null = null;
  try {
    images = await announcer.capture(wars.map((w) => ({ kind: 'fw' as const, id: w.id })));
  } catch (error) {
    console.error('Images des FW impossibles', error);
  }
  for (const [i, war] of wars.entries()) {
    await announcer.post('stats', {
      content: fwRecapText(war) + (images ? '' : `\n${siteUrl}/fw/${war.id}`),
      ...(images ? { files: [{ name: `fw-${war.id}.png`, data: images[i] }] } : {}),
    });
  }
  return wars.length;
}
