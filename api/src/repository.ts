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
 * Accès à la base. C'est le SEUL endroit du serveur qui écrit du SQL :
 * il traduit les lignes des tables en objets `Tournament` (partagés avec le
 * site) et inversement. Le reste du code ne manipule que des objets.
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
    matches: (t.bracket?.matches ?? []).map((m) => ({
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
    })),
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

// ------------------------------------------------------------ requêtes

export async function listTournaments(db: D1Database): Promise<TournamentSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT t.slug, t.name, t.status, t.is_demo,
              (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id = t.id) AS clan_count
       FROM tournaments t
       ORDER BY t.created_at DESC, t.id DESC`,
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

export async function getTournament(db: D1Database, slug: string): Promise<Tournament | null> {
  const t = await db
    .prepare(
      'SELECT id, slug, name, status, organizer, referees, rules, is_demo FROM tournaments WHERE slug = ?',
    )
    .bind(slug)
    .first<TournamentRow & { id: number }>();
  if (!t) return null;

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
    slug: t.slug,
    name: t.name,
    status: t.status,
    organizer: t.organizer,
    referees: JSON.parse(t.referees) as string[],
    rules: t.rules,
    clans,
    bracket: toBracket(matches.results, clans),
    isDemo: t.is_demo === 1,
  };
}

/**
 * Enregistre un tournoi complet, en remplaçant l'ancienne version s'il existe.
 * Tout part dans un seul `batch` : D1 l'exécute comme une transaction, donc
 * soit tout est écrit, soit rien (jamais un tournoi à moitié enregistré).
 */
export async function saveTournament(db: D1Database, t: Tournament): Promise<void> {
  const rows = toRows(t);
  const tournamentId = '(SELECT id FROM tournaments WHERE slug = ?)';

  const statements: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM matches WHERE tournament_id = ${tournamentId}`).bind(t.slug),
    db.prepare(`DELETE FROM registrations WHERE tournament_id = ${tournamentId}`).bind(t.slug),
    db.prepare('DELETE FROM tournaments WHERE slug = ?').bind(t.slug),
    db
      .prepare(
        `INSERT INTO tournaments (slug, name, status, organizer, referees, rules, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        rows.tournament.slug,
        rows.tournament.name,
        rows.tournament.status,
        rows.tournament.organizer,
        rows.tournament.referees,
        rows.tournament.rules,
        rows.tournament.is_demo,
      ),
    ...rows.registrations.map((r) =>
      db
        .prepare(
          `INSERT INTO registrations (tournament_id, clan_tag, clan_name, badge_url, seed)
           VALUES (${tournamentId}, ?, ?, ?, ?)`,
        )
        .bind(t.slug, r.clan_tag, r.clan_name, r.badge_url, r.seed),
    ),
    ...rows.matches.map((m) =>
      db
        .prepare(
          `INSERT INTO matches (tournament_id, match_id, round, idx, home_tag, away_tag, status, winner,
             home_stars, home_destruction, home_duration, away_stars, away_destruction, away_duration)
           VALUES (${tournamentId}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          t.slug,
          m.match_id,
          m.round,
          m.idx,
          m.home_tag,
          m.away_tag,
          m.status,
          m.winner,
          m.home_stars,
          m.home_destruction,
          m.home_duration,
          m.away_stars,
          m.away_destruction,
          m.away_duration,
        ),
    ),
  ];
  await db.batch(statements);
}
