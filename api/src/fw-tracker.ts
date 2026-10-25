import {
  cocTime,
  readFriendlyWar,
  readWarSnapshot,
  type CocWar,
} from '../../src/app/core/tournament/coc-war';
import { decideWinner } from '../../src/app/core/tournament/war-result';
import type { CocClient } from './coc';
import { run, toSqliteTime, type Statement } from './repository';

/**
 * Suivi des FW classiques (hors tournoi). Toutes les minutes, avec
 * l'arbitre automatique : si la dernière guerre des clans de FW est terminée
 * et oppose bien ces deux clans, elle est enregistrée avec la ligne de chaque
 * joueur. Aucune annonce : ce sont seulement des stats.
 */

/** « #2JVUP2PGC,#2CYJPRCG8 » (réglage FW_CLANS) → liste de tags. */
export function fwClans(setting: string | undefined): string[] {
  return (setting ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Identifiant d'une guerre : son heure de lancement + les deux tags triés.
 * La même guerre, vue depuis l'un ou l'autre clan, a donc le même.
 */
export function warKey(war: CocWar): string | null {
  if (!war.clan || !war.opponent) return null;
  const launched = war.preparationStartTime ?? war.startTime;
  if (!launched) return null;
  return `${launched}|${[war.clan.tag, war.opponent.tag].sort().join('|')}`;
}

export type TrackResult = 'recorded' | 'known' | 'nothing';

/** Délai après la fin prévue d'une FW avant de la reconstituer d'après son dernier état. */
const RECOVERY_GRACE_MS = 2 * 60 * 1000;

/**
 * Un passage du suivi (toutes les minutes) :
 *  1. la guerre actuelle des clans de FW : en cours → on garde son état ;
 *     terminée → on l'enregistre (une seule fois) ;
 *  2. le filet de sécurité : une FW gardée en mémoire qui a disparu sans
 *     avoir été vue terminée est enregistrée d'après son dernier état.
 */
export async function trackFriendlyWars(
  db: D1Database,
  coc: CocClient,
  clans: readonly string[],
  now: number = Date.now(),
): Promise<{ current: TrackResult; recovered: number }> {
  if (clans.length < 2) return { current: 'nothing', recovered: 0 };
  let current: TrackResult = 'nothing';
  let gameAnswered = false;

  for (const tag of clans) {
    const result = await coc.currentWar(tag);
    if (!result.ok) continue; // journal privé, jeu en maintenance… on essaie l'autre clan
    gameAnswered = true;
    const war = result.value;
    // Une guerre entre deux clans de FW ? Sinon, la dernière guerre de l'autre
    // clan peut être la bonne.
    if (!war.clan || !war.opponent) continue;
    if (!clans.includes(war.clan.tag) || !clans.includes(war.opponent.tag)) continue;
    const key = warKey(war);
    if (!key) continue;

    if (war.state === 'inWar') {
      await saveSnapshot(db, key, war, now);
    } else if (war.state === 'warEnded') {
      current = await recordWar(db, clans, key, war, true);
    }
    break; // les deux clans voient la même guerre : inutile de demander à l'autre
  }

  const recovered = await recoverMissed(db, clans, now, gameAnswered);
  return { current, recovered };
}

/** Garde (ou remplace) le dernier état vu d'une FW en cours. */
async function saveSnapshot(db: D1Database, key: string, war: CocWar, now: number) {
  await db
    .prepare(
      `INSERT INTO fw_snapshots (war_key, war_json, seen_at) VALUES (?, ?, ?)
       ON CONFLICT (war_key) DO UPDATE SET war_json = excluded.war_json, seen_at = excluded.seen_at`,
    )
    .bind(key, JSON.stringify(war), toSqliteTime(now))
    .run();
}

/**
 * Enregistre une FW. Déjà enregistrée : rien, sauf si c'était une
 * reconstitution partielle et qu'on a maintenant la version complète.
 */
async function recordWar(
  db: D1Database,
  clans: readonly string[],
  key: string,
  war: CocWar,
  complete: boolean,
): Promise<TrackResult> {
  const known = await db
    .prepare('SELECT complete FROM friendly_wars WHERE war_key = ?')
    .bind(key)
    .first<{ complete: number }>();
  if (known && (known.complete === 1 || !complete)) return 'known';

  // Toujours dans le même ordre (celui du réglage FW_CLANS).
  const [first, second] = [war.clan!, war.opponent!].sort(
    (a, b) => clans.indexOf(a.tag) - clans.indexOf(b.tag),
  );
  const home = { tag: first.tag, name: first.name };
  const away = { tag: second.tag, name: second.name };
  const reading = complete ? readFriendlyWar(war, home, away) : readWarSnapshot(war, home, away);
  if (!reading.ok) return 'nothing';

  await run(db, [
    // Une version partielle est remplacée par la complète (ses joueurs suivent en cascade).
    { sql: 'DELETE FROM friendly_wars WHERE war_key = ?', params: [key] },
    ...recordStatements(key, war, home, away, reading, complete),
    { sql: 'DELETE FROM fw_snapshots WHERE war_key = ?', params: [key] },
  ]);
  return 'recorded';
}

/**
 * Le filet de sécurité : chaque FW gardée en mémoire dont la fin prévue est
 * passée depuis plus de 2 minutes, et qui n'a pas été enregistrée, l'est
 * d'après son dernier état. Si le jeu n'a pas répondu à ce passage, on attend
 * (il pourrait encore la montrer terminée), sauf après 30 minutes.
 */
async function recoverMissed(
  db: D1Database,
  clans: readonly string[],
  now: number,
  gameAnswered: boolean,
): Promise<number> {
  const { results } = await db
    .prepare('SELECT war_key, war_json FROM fw_snapshots')
    .all<{ war_key: string; war_json: string }>();
  let recovered = 0;
  for (const row of results) {
    const war = JSON.parse(row.war_json) as CocWar;
    const ended = cocTime(war.endTime);
    const waited = Number.isNaN(ended) ? Infinity : now - ended;
    if (waited < RECOVERY_GRACE_MS || (!gameAnswered && waited < 30 * 60 * 1000)) continue;
    if ((await recordWar(db, clans, row.war_key, war, false)) === 'recorded') recovered++;
    await db.prepare('DELETE FROM fw_snapshots WHERE war_key = ?').bind(row.war_key).run();
  }
  return recovered;
}

function recordStatements(
  key: string,
  war: CocWar,
  home: { tag: string; name: string },
  away: { tag: string; name: string },
  reading: Extract<ReturnType<typeof readFriendlyWar>, { ok: true }>,
  complete: boolean,
): Statement[] {
  const time = (value: string | undefined) => {
    const ms = cocTime(value);
    return Number.isNaN(ms) ? null : toSqliteTime(ms);
  };
  const { score } = reading;
  const warId = '(SELECT id FROM friendly_wars WHERE war_key = ?)';
  return [
    {
      sql: `INSERT INTO friendly_wars (war_key, started_at, ended_at, team_size,
              home_tag, home_name, home_stars, home_destruction, home_duration,
              away_tag, away_name, away_stars, away_destruction, away_duration, winner, complete)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        key,
        time(war.startTime),
        time(war.endTime),
        war.teamSize ?? null,
        home.tag,
        home.name,
        score.home.stars,
        score.home.destruction,
        score.home.totalDurationSec,
        away.tag,
        away.name,
        score.away.stars,
        score.away.destruction,
        score.away.totalDurationSec,
        decideWinner(score.home, score.away),
        complete ? 1 : 0,
      ],
    },
    ...reading.players.map((p) => ({
      sql: `INSERT INTO fw_players (war_id, side, clan_tag, player_tag, player_name, town_hall,
              map_position, attacks, stars, destruction_sum, triples, duration)
            VALUES (${warId}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        key,
        p.side,
        p.side === 'home' ? home.tag : away.tag,
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
