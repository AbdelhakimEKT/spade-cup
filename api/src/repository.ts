import type { PlayerLine } from '../../src/app/core/tournament/coc-war';
import type {
  Bracket,
  BracketMatch,
  ClanRef,
  MatchStatus,
  Side,
} from '../../src/app/core/tournament/models';
import type {
  Tournament,
  TournamentStatus,
  TournamentSummary,
} from '../../src/app/core/tournament/tournament';

/**
 * Accès aux tournois dans la base. Avec `stats-repository.ts`, c'est le SEUL
 * endroit du serveur qui écrit du SQL : il traduit les lignes des tables en
 * objets `Tournament` (partagés avec le site) et inversement. Le reste du
 * code ne manipule que des objets.
 */

// ------------------------------------------------------------ lignes des tables

export interface TournamentRow {
  slug: string;
  name: string;
  status: TournamentStatus;
  organizer: string;
  referees: string;
  rules: string;
  is_demo: number;
}

export interface RegistrationRow {
  clan_tag: string;
  clan_name: string;
  badge_url: string | null;
  seed: number | null;
}

export interface MatchRow {
  match_id: string;
  round: number;
  idx: number;
  home_tag: string | null;
  away_tag: string | null;
  status: MatchStatus;
  winner: Side | null;
  home_stars: number | null;
  home_destruction: number | null;
  home_duration: number | null;
  away_stars: number | null;
  away_destruction: number | null;
  away_duration: number | null;
}

export type ResultSource = 'game' | 'referee';

/** Une requête SQL et ses valeurs, prête à être exécutée (ou écrite dans un fichier). */
export interface Statement {
  readonly sql: string;
  readonly params: readonly (string | number | null)[];
}

/**
 * Désigne un tournoi dans une requête : par son id (le bot le connaît), ou
 * par son slug via une sous-requête (le script de démo ne connaît pas l'id).
 */
interface TournamentKey {
  readonly sql: string;
  readonly value: string | number;
}
const byId = (id: number): TournamentKey => ({ sql: '?', value: id });
const bySlug = (slug: string): TournamentKey => ({
  sql: '(SELECT id FROM tournaments WHERE slug = ?)',
  value: slug,
});

// ------------------------------------------------------------ objets → lignes

/** Découpe un tournoi en lignes de tables. Pur : sert à l'écriture ET au script de démo. */
export function toRows(t: Tournament): {
  tournament: TournamentRow;
  registrations: RegistrationRow[];
  matches: MatchRow[];
} {
  return {
    tournament: {
      slug: t.slug,
      name: t.name,
      status: t.status,
      organizer: t.organizer,
      referees: JSON.stringify(t.referees),
      rules: t.rules,
      is_demo: t.isDemo ? 1 : 0,
    },
    registrations: t.clans.map((clan, i) => ({
      clan_tag: clan.tag,
      clan_name: clan.name,
      badge_url: clan.badgeUrl ?? null,
      // L'ordre des clans EST l'ordre du tirage une fois l'arbre créé.
      seed: t.bracket ? i + 1 : null,
    })),
    matches: (t.bracket?.matches ?? []).map(toMatchRow),
  };
}

function toMatchRow(m: BracketMatch): MatchRow {
  return {
    match_id: m.id,
    round: m.round,
    idx: m.index,
    home_tag: m.home?.tag ?? null,
    away_tag: m.away?.tag ?? null,
    status: m.status,
    winner: m.winner,
    home_stars: m.score?.home.stars ?? null,
    home_destruction: m.score?.home.destruction ?? null,
    home_duration: m.score?.home.totalDurationSec ?? null,
    away_stars: m.score?.away.stars ?? null,
    away_destruction: m.score?.away.destruction ?? null,
    away_duration: m.score?.away.totalDurationSec ?? null,
  };
}

// ------------------------------------------------------------ lignes → objets

export function toClan(row: RegistrationRow): ClanRef {
  return row.badge_url
    ? { tag: row.clan_tag, name: row.clan_name, badgeUrl: row.badge_url }
    : { tag: row.clan_tag, name: row.clan_name };
}

/** Reconstruit l'arbre à partir des lignes de matchs. Pur, donc testable seul. */
export function toBracket(rows: readonly MatchRow[], clans: readonly ClanRef[]): Bracket | null {
  if (rows.length === 0) return null;
  const byTag = new Map(clans.map((c) => [c.tag, c]));
  const clan = (tag: string | null) => (tag ? (byTag.get(tag) ?? null) : null);
  const roundCount = Math.max(...rows.map((r) => r.round));

  const matches: BracketMatch[] = [...rows]
    .sort((a, b) => a.round - b.round || a.idx - b.idx)
    .map((r) => ({
      id: r.match_id,
      round: r.round,
      index: r.idx,
      home: clan(r.home_tag),
      away: clan(r.away_tag),
      status: r.status,
      winner: r.winner,
      score:
        r.home_stars === null || r.away_stars === null
          ? null
          : {
              home: {
                stars: r.home_stars,
                destruction: r.home_destruction ?? 0,
                totalDurationSec: r.home_duration ?? 0,
              },
              away: {
                stars: r.away_stars,
                destruction: r.away_destruction ?? 0,
                totalDurationSec: r.away_duration ?? 0,
              },
            },
    }));

  return { size: 2 ** roundCount, roundCount, matches };
}

// ------------------------------------------------------------ lecture

export async function listTournaments(db: D1Database): Promise<TournamentSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT t.slug, t.name, t.status, t.is_demo,
              (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id = t.id) AS clan_count
       FROM tournaments t
       ORDER BY t.is_demo, t.created_at DESC, t.id DESC`,
    )
    .all<TournamentRow & { clan_count: number }>();
  return results.map((r) => ({
    slug: r.slug,
    name: r.name,
    status: r.status,
    clanCount: r.clan_count,
    isDemo: r.is_demo === 1,
  }));
}

/** Un tournoi et son identifiant interne (utile pour écrire ensuite). */
export interface StoredTournament {
  readonly id: number;
  readonly tournament: Tournament;
}

const TOURNAMENT_COLUMNS = 'id, slug, name, status, organizer, referees, rules, is_demo';

export async function getTournament(db: D1Database, slug: string): Promise<Tournament | null> {
  const row = await db
    .prepare(`SELECT ${TOURNAMENT_COLUMNS} FROM tournaments WHERE slug = ?`)
    .bind(slug)
    .first<TournamentRow & { id: number }>();
  return row ? (await load(db, row)).tournament : null;
}

/**
 * Le tournoi sur lequel agit le bot Discord : le plus récent (hors démo).
 * Même terminé, il reste « courant » jusqu'à la création du suivant : les
 * arbitres peuvent ainsi encore corriger le résultat de la finale.
 */
export async function getCurrentTournament(db: D1Database): Promise<StoredTournament | null> {
  const row = await db
    .prepare(
      `SELECT ${TOURNAMENT_COLUMNS} FROM tournaments
       WHERE is_demo = 0
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .first<TournamentRow & { id: number }>();
  return row ? load(db, row) : null;
}

async function load(db: D1Database, t: TournamentRow & { id: number }): Promise<StoredTournament> {
  // Deux requêtes indépendantes : on les lance en même temps.
  const [registrations, matches] = await Promise.all([
    db
      .prepare(
        `SELECT clan_tag, clan_name, badge_url, seed FROM registrations
         WHERE tournament_id = ? ORDER BY seed IS NULL, seed, registered_at, clan_tag`,
      )
      .bind(t.id)
      .all<RegistrationRow>(),
    db.prepare('SELECT * FROM matches WHERE tournament_id = ?').bind(t.id).all<MatchRow>(),
  ]);

  const clans = registrations.results.map(toClan);
  return {
    id: t.id,
    tournament: {
      slug: t.slug,
      name: t.name,
      status: t.status,
      organizer: t.organizer,
      referees: JSON.parse(t.referees) as string[],
      rules: t.rules,
      clans,
      bracket: toBracket(matches.results, clans),
      isDemo: t.is_demo === 1,
    },
  };
}

/** Qui a inscrit ce clan (identifiant Discord), ou `null` s'il n'est pas inscrit. */
export async function registeredBy(
  db: D1Database,
  tournamentId: number,
  clanTag: string,
): Promise<{ by: string | null } | null> {
  const row = await db
    .prepare('SELECT registered_by FROM registrations WHERE tournament_id = ? AND clan_tag = ?')
    .bind(tournamentId, clanTag)
    .first<{ registered_by: string | null }>();
  return row ? { by: row.registered_by } : null;
}

export async function slugExists(db: D1Database, slug: string): Promise<boolean> {
  return (await db.prepare('SELECT 1 FROM tournaments WHERE slug = ?').bind(slug).first()) !== null;
}

// ------------------------------------------------------------ écriture

export async function run(db: D1Database, statements: readonly Statement[]): Promise<void> {
  // Un seul `batch` : D1 l'exécute comme une transaction, donc soit tout est
  // écrit, soit rien (jamais un tournoi à moitié enregistré).
  await db.batch(statements.map((s) => db.prepare(s.sql).bind(...s.params)));
}

export async function createTournament(
  db: D1Database,
  t: { slug: string; name: string; organizer: string; referees: string[]; rules: string },
): Promise<void> {
  await run(db, [
    {
      sql: `INSERT INTO tournaments (slug, name, status, organizer, referees, rules)
            VALUES (?, ?, 'registration', ?, ?, ?)`,
      params: [t.slug, t.name, t.organizer, JSON.stringify(t.referees), t.rules],
    },
  ]);
}

export async function addRegistration(
  db: D1Database,
  tournamentId: number,
  clan: ClanRef,
  discordUserId: string,
): Promise<void> {
  await run(db, [
    {
      sql: `INSERT INTO registrations (tournament_id, clan_tag, clan_name, badge_url, registered_by)
            VALUES (?, ?, ?, ?, ?)`,
      params: [tournamentId, clan.tag, clan.name, clan.badgeUrl ?? null, discordUserId],
    },
  ]);
}

/** Supprime un tournoi ; ses inscriptions, matchs et joueurs suivent en cascade. */
export async function deleteTournament(db: D1Database, tournamentId: number): Promise<void> {
  await run(db, [{ sql: 'DELETE FROM tournaments WHERE id = ?', params: [tournamentId] }]);
}

export async function removeRegistration(
  db: D1Database,
  tournamentId: number,
  clanTag: string,
): Promise<void> {
  await run(db, [
    {
      sql: 'DELETE FROM registrations WHERE tournament_id = ? AND clan_tag = ?',
      params: [tournamentId, clanTag],
    },
  ]);
}

/** Met à jour le nom et le blason d'un clan inscrit (lus dans le jeu après coup). */
export async function renameClan(
  db: D1Database,
  tournamentId: number,
  clan: ClanRef,
): Promise<void> {
  await run(db, [
    {
      sql: 'UPDATE registrations SET clan_name = ?, badge_url = ? WHERE tournament_id = ? AND clan_tag = ?',
      params: [clan.name, clan.badgeUrl ?? null, tournamentId, clan.tag],
    },
  ]);
}

/** Ajoute un pseudo à la liste des arbitres affichée sur le site (sans doublon). */
export async function addReferee(
  db: D1Database,
  tournamentId: number,
  name: string,
): Promise<void> {
  await run(db, [
    {
      sql: `UPDATE tournaments SET referees = json_insert(referees, '$[#]', ?1)
            WHERE id = ?2 AND NOT EXISTS (SELECT 1 FROM json_each(referees) WHERE value = ?1)`,
      params: [name, tournamentId],
    },
  ]);
}

/**
 * Enregistre le tirage : têtes de série des clans, matchs de l'arbre, et le
 * tournoi passe « en cours ». `clans` est dans l'ordre du tirage.
 */
export async function saveDraw(
  db: D1Database,
  tournamentId: number,
  clans: readonly ClanRef[],
  bracket: Bracket,
): Promise<void> {
  await run(db, [
    ...clans.map((c, i) => ({
      sql: 'UPDATE registrations SET seed = ? WHERE tournament_id = ? AND clan_tag = ?',
      params: [i + 1, tournamentId, c.tag],
    })),
    ...bracket.matches.map((m) => upsertMatch(byId(tournamentId), m)),
    setStatus(tournamentId, 'running'),
  ]);
}

/**
 * Enregistre l'arbre après un événement (match lancé, résultat…), et, si
 * fournies, les lignes des joueurs du match. Le tout en une transaction.
 */
export async function saveBracket(
  db: D1Database,
  tournamentId: number,
  bracket: Bracket,
  options: {
    status?: TournamentStatus;
    result?: { matchId: string; source: ResultSource; players: readonly PlayerLine[] };
  } = {},
): Promise<void> {
  const { result, status } = options;
  const key = byId(tournamentId);
  const match = result && bracket.matches.find((m) => m.id === result.matchId);
  await run(db, [
    ...bracket.matches.map((m) => upsertMatch(key, m)),
    ...(result && match ? resultStatements(key, match, result.source, result.players) : []),
    ...(status ? [setStatus(tournamentId, status)] : []),
  ]);
}

/**
 * Source du score + lignes des joueurs d'un match. Les anciennes lignes sont
 * effacées d'abord : une correction remplace la lecture précédente, et une
 * liste vide (score saisi à la main) n'en laisse aucune.
 */
function resultStatements(
  key: TournamentKey,
  match: BracketMatch,
  source: ResultSource,
  players: readonly PlayerLine[],
): Statement[] {
  const clanTag = (side: Side) => (side === 'home' ? match.home?.tag : match.away?.tag) ?? '';
  return [
    {
      sql: `UPDATE matches SET result_source = ? WHERE tournament_id = ${key.sql} AND match_id = ?`,
      params: [source, key.value, match.id],
    },
    {
      sql: `DELETE FROM match_players WHERE tournament_id = ${key.sql} AND match_id = ?`,
      params: [key.value, match.id],
    },
    ...players.map((p) => ({
      sql: `INSERT INTO match_players (tournament_id, match_id, side, clan_tag, player_tag, player_name,
              town_hall, map_position, attacks, stars, destruction_sum, triples, duration)
            VALUES (${key.sql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        key.value,
        match.id,
        p.side,
        clanTag(p.side),
        p.tag,
        p.name,
        p.townHall,
        p.mapPosition,
        p.attacks,
        p.stars,
        p.destruction * p.attacks,
        p.triples,
        p.durationSec,
      ],
    })),
  ];
}

/**
 * Insère ou met à jour un match. Surtout pas `INSERT OR REPLACE` : en SQLite,
 * « remplacer » veut dire supprimer puis réinsérer, et la suppression
 * effacerait en cascade les lignes des joueurs du match.
 */
function upsertMatch(key: TournamentKey, m: BracketMatch): Statement {
  const r = toMatchRow(m);
  return {
    sql: `INSERT INTO matches (tournament_id, match_id, round, idx, home_tag, away_tag, status, winner,
            home_stars, home_destruction, home_duration, away_stars, away_destruction, away_duration)
          VALUES (${key.sql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (tournament_id, match_id) DO UPDATE SET
            home_tag = excluded.home_tag, away_tag = excluded.away_tag,
            status = excluded.status, winner = excluded.winner,
            home_stars = excluded.home_stars, home_destruction = excluded.home_destruction,
            home_duration = excluded.home_duration, away_stars = excluded.away_stars,
            away_destruction = excluded.away_destruction, away_duration = excluded.away_duration,
            updated_at = CASE WHEN matches.status IS excluded.status
                               AND matches.winner IS excluded.winner
                               AND matches.home_tag IS excluded.home_tag
                               AND matches.away_tag IS excluded.away_tag
                              THEN matches.updated_at ELSE CURRENT_TIMESTAMP END`,
    params: [
      key.value,
      r.match_id,
      r.round,
      r.idx,
      r.home_tag,
      r.away_tag,
      r.status,
      r.winner,
      r.home_stars,
      r.home_destruction,
      r.home_duration,
      r.away_stars,
      r.away_destruction,
      r.away_duration,
    ],
  };
}

function setStatus(tournamentId: number, status: TournamentStatus): Statement {
  return { sql: 'UPDATE tournaments SET status = ? WHERE id = ?', params: [status, tournamentId] };
}

/**
 * Les requêtes qui (ré)installent un tournoi complet, en remplaçant l'ancienne
 * version s'il existe. Renvoyées sous forme de données : le serveur les
 * exécute (`saveTournament`), le script de démo les écrit dans un fichier SQL.
 */
export function tournamentStatements(
  t: Tournament,
  players: ReadonlyMap<string, readonly PlayerLine[]> = new Map(),
): Statement[] {
  const rows = toRows(t);
  const key = bySlug(t.slug);

  return [
    // Supprimer le tournoi supprime en cascade ses inscriptions, matchs et joueurs.
    { sql: 'DELETE FROM tournaments WHERE slug = ?', params: [t.slug] },
    {
      sql: `INSERT INTO tournaments (slug, name, status, organizer, referees, rules, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [
        rows.tournament.slug,
        rows.tournament.name,
        rows.tournament.status,
        rows.tournament.organizer,
        rows.tournament.referees,
        rows.tournament.rules,
        rows.tournament.is_demo,
      ],
    },
    ...rows.registrations.map((r) => ({
      sql: `INSERT INTO registrations (tournament_id, clan_tag, clan_name, badge_url, seed)
            VALUES (${key.sql}, ?, ?, ?, ?)`,
      params: [key.value, r.clan_tag, r.clan_name, r.badge_url, r.seed],
    })),
    ...(t.bracket?.matches ?? []).flatMap((m) => {
      const lines = players.get(m.id);
      return [upsertMatch(key, m), ...(lines ? resultStatements(key, m, 'game', lines) : [])];
    }),
  ];
}

export async function saveTournament(
  db: D1Database,
  t: Tournament,
  players?: ReadonlyMap<string, readonly PlayerLine[]>,
): Promise<void> {
  await run(db, tournamentStatements(t, players));
}
