import type { PlayerLine } from '../../src/app/core/tournament/coc-war';
import type { ClanRef, Side } from '../../src/app/core/tournament/models';
import {
  clanRecord,
  clanRun,
  totalsOf,
  type ClanProfile,
  type MatchDetail,
  type PlayerProfile,
  type PlayerTotals,
} from '../../src/app/core/tournament/stats';
import { getTournament, type ResultSource } from './repository';

/**
 * Les statistiques : lectures seules, à partir de la table `match_players`.
 * Les additions simples sont faites en SQL ; ce qui est logique de tournoi
 * (parcours d'un clan…) réutilise les fonctions pures partagées avec le site.
 */

interface PlayerRow {
  side: Side;
  clan_tag: string;
  player_tag: string;
  player_name: string;
  town_hall: number;
  map_position: number;
  attacks: number;
  stars: number;
  destruction_sum: number;
  triples: number;
  duration: number;
}

function toLine(r: PlayerRow): PlayerLine {
  return {
    tag: r.player_tag,
    name: r.player_name,
    side: r.side,
    townHall: r.town_hall,
    mapPosition: r.map_position,
    attacks: r.attacks,
    stars: r.stars,
    destruction: r.attacks ? Math.round((r.destruction_sum / r.attacks) * 10) / 10 : 0,
    triples: r.triples,
    durationSec: r.duration,
  };
}

const clanOf = (tag: string, name: string | null, badge: string | null): ClanRef =>
  badge ? { tag, name: name ?? tag, badgeUrl: badge } : { tag, name: name ?? tag };

/**
 * Classement des joueurs.
 * - sans filtre : tous les VRAIS tournois (la démo n'entre pas dans les stats) ;
 * - `tournament` : un seul tournoi (démo comprise) ;
 * - `clan` : les joueurs sous les couleurs de ce clan.
 */
export async function listPlayers(
  db: D1Database,
  filter: { tournament?: string; clan?: string } = {},
): Promise<PlayerTotals[]> {
  const { results } = await db
    .prepare(
      `WITH lines AS (
         SELECT mp.*, r.clan_name, r.badge_url,
                -- 1 = la ligne la plus récente du joueur : son pseudo et son clan actuels
                ROW_NUMBER() OVER (
                  PARTITION BY mp.player_tag
                  ORDER BY m.updated_at DESC, mp.tournament_id DESC, m.round DESC
                ) AS recency
         FROM match_players mp
         JOIN tournaments t ON t.id = mp.tournament_id
         JOIN matches m ON m.tournament_id = mp.tournament_id AND m.match_id = mp.match_id
         LEFT JOIN registrations r
           ON r.tournament_id = mp.tournament_id AND r.clan_tag = mp.clan_tag
         WHERE CASE
           WHEN ?1 IS NOT NULL THEN t.slug = ?1
           WHEN ?2 IS NOT NULL THEN mp.clan_tag = ?2
           ELSE t.is_demo = 0
         END
       )
       SELECT player_tag,
              MAX(CASE WHEN recency = 1 THEN player_name END) AS name,
              MAX(CASE WHEN recency = 1 THEN clan_tag END)    AS clan_tag,
              MAX(CASE WHEN recency = 1 THEN clan_name END)   AS clan_name,
              MAX(CASE WHEN recency = 1 THEN badge_url END)   AS badge_url,
              COUNT(*)             AS wars,
              SUM(attacks)         AS attacks,
              SUM(stars)           AS stars,
              SUM(triples)         AS triples,
              SUM(destruction_sum) AS destruction_sum
       FROM lines
       GROUP BY player_tag
       ORDER BY stars DESC, wars DESC, name
       LIMIT 500`,
    )
    .bind(filter.tournament ?? null, filter.clan ?? null)
    .all<{
      player_tag: string;
      name: string;
      clan_tag: string;
      clan_name: string | null;
      badge_url: string | null;
      wars: number;
      attacks: number;
      stars: number;
      triples: number;
      destruction_sum: number;
    }>();

  return results.map((r) => ({
    tag: r.player_tag,
    name: r.name,
    clan: clanOf(r.clan_tag, r.clan_name, r.badge_url),
    wars: r.wars,
    attacks: r.attacks,
    stars: r.stars,
    triples: r.triples,
    destruction: r.attacks ? Math.round((r.destruction_sum / r.attacks) * 10) / 10 : 0,
  }));
}

/** Fiche d'un joueur : son historique match par match, et son bilan. */
export async function getPlayerProfile(db: D1Database, tag: string): Promise<PlayerProfile | null> {
  const { results } = await db
    .prepare(
      `SELECT mp.*, t.slug, t.name AS tournament_name, t.is_demo,
              m.round, m.winner, m.home_tag, m.away_tag,
              (SELECT MAX(round) FROM matches WHERE tournament_id = mp.tournament_id) AS round_count,
              rh.clan_name AS home_name, rh.badge_url AS home_badge,
              ra.clan_name AS away_name, ra.badge_url AS away_badge
       FROM match_players mp
       JOIN tournaments t ON t.id = mp.tournament_id
       JOIN matches m ON m.tournament_id = mp.tournament_id AND m.match_id = mp.match_id
       LEFT JOIN registrations rh ON rh.tournament_id = m.tournament_id AND rh.clan_tag = m.home_tag
       LEFT JOIN registrations ra ON ra.tournament_id = m.tournament_id AND ra.clan_tag = m.away_tag
       WHERE mp.player_tag = ?
       ORDER BY m.updated_at DESC, mp.tournament_id DESC, m.round DESC`,
    )
    .bind(tag)
    .all<
      PlayerRow & {
        match_id: string;
        slug: string;
        tournament_name: string;
        is_demo: number;
        round: number;
        round_count: number;
        winner: Side | null;
        home_tag: string;
        away_tag: string | null;
        home_name: string | null;
        home_badge: string | null;
        away_name: string | null;
        away_badge: string | null;
      }
    >();
  if (results.length === 0) return null;

  const history = results.map((r) => {
    const home = clanOf(r.home_tag, r.home_name, r.home_badge);
    const away = r.away_tag ? clanOf(r.away_tag, r.away_name, r.away_badge) : null;
    return {
      tournament: { slug: r.slug, name: r.tournament_name, isDemo: r.is_demo === 1 },
      matchId: r.match_id,
      round: r.round,
      roundCount: r.round_count,
      clan: r.side === 'home' ? home : away!,
      opponent: r.side === 'home' ? away : home,
      won: r.winner ? r.winner === r.side : null,
      line: toLine(r),
    };
  });

  const latest = history[0];
  return {
    totals: totalsOf(
      { tag, name: latest.line.name, clan: latest.clan },
      history.map((h) => h.line),
    ),
    history,
  };
}

/** Fiche d'un clan : ses tournois, son bilan et ses joueurs. */
export async function getClanProfile(db: D1Database, tag: string): Promise<ClanProfile | null> {
  const { results } = await db
    .prepare(
      `SELECT t.slug FROM registrations r JOIN tournaments t ON t.id = r.tournament_id
       WHERE r.clan_tag = ? ORDER BY t.created_at DESC, t.id DESC`,
    )
    .bind(tag)
    .all<{ slug: string }>();
  if (results.length === 0) return null;

  const [tournaments, players] = await Promise.all([
    Promise.all(results.map((r) => getTournament(db, r.slug))),
    listPlayers(db, { clan: tag }),
  ]);
  const found = tournaments.filter((t) => t !== null);
  const records = found.map((t) => clanRecord(t, tag));

  return {
    // Nom et blason de l'inscription la plus récente.
    clan: found[0].clans.find((c) => c.tag === tag)!,
    runs: found.map((t) => clanRun(t, tag)),
    record: {
      played: records.reduce((sum, r) => sum + r.played, 0),
      won: records.reduce((sum, r) => sum + r.won, 0),
      lost: records.reduce((sum, r) => sum + r.lost, 0),
    },
    players,
  };
}

/** Tout ce qu'affiche la page d'un match. */
export async function getMatchDetail(
  db: D1Database,
  slug: string,
  matchId: string,
): Promise<MatchDetail | null> {
  const tournament = await getTournament(db, slug);
  const match = tournament?.bracket?.matches.find((m) => m.id === matchId);
  if (!tournament?.bracket || !match) return null;

  const key = '(SELECT id FROM tournaments WHERE slug = ?1)';
  const [lines, source] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM match_players WHERE tournament_id = ${key} AND match_id = ?2
         ORDER BY side DESC, map_position`,
      )
      .bind(slug, matchId)
      .all<PlayerRow>(),
    db
      .prepare(`SELECT result_source FROM matches WHERE tournament_id = ${key} AND match_id = ?2`)
      .bind(slug, matchId)
      .first<{ result_source: ResultSource | null }>(),
  ]);

  const players = lines.results.map(toLine);
  return {
    tournament: {
      slug: tournament.slug,
      name: tournament.name,
      status: tournament.status,
      clanCount: tournament.clans.length,
      isDemo: tournament.isDemo,
    },
    roundCount: tournament.bracket.roundCount,
    match,
    players: {
      home: players.filter((p) => p.side === 'home'),
      away: players.filter((p) => p.side === 'away'),
    },
    source: source?.result_source ?? null,
  };
}
