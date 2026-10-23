import { cocTime, readFriendlyWar, type CocWar } from '../../src/app/core/tournament/coc-war';
import { decideWinner } from '../../src/app/core/tournament/war-result';
import type { CocClient } from './coc';
import { run, toSqliteTime, type Statement } from './repository';

/**
 * Suivi des FW classiques (hors tournoi). Toutes les 5 minutes, avec
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

export async function trackFriendlyWars(
  db: D1Database,
  coc: CocClient,
  clans: readonly string[],
): Promise<TrackResult> {
  if (clans.length < 2) return 'nothing';
  for (const tag of clans) {
    const result = await coc.currentWar(tag);
    if (!result.ok) continue; // journal privé, jeu en maintenance… on essaie l'autre clan
    const war = result.value;
    // Seulement une guerre TERMINÉE entre deux clans de FW. Sinon, on regarde
    // l'autre clan : sa dernière guerre peut être la bonne.
    if (war.state !== 'warEnded' || !war.clan || !war.opponent) continue;
    if (!clans.includes(war.clan.tag) || !clans.includes(war.opponent.tag)) continue;

    const key = warKey(war);
    if (!key) continue;
    const known = await db
      .prepare('SELECT 1 FROM friendly_wars WHERE war_key = ?')
      .bind(key)
      .first();
    if (known) return 'known';

    // Toujours dans le même ordre (celui du réglage) : FW-team2 « domicile ».
    const [first, second] = [war.clan, war.opponent].sort(
      (a, b) => clans.indexOf(a.tag) - clans.indexOf(b.tag),
    );
    const home = { tag: first.tag, name: first.name };
    const away = { tag: second.tag, name: second.name };
    const reading = readFriendlyWar(war, home, away);
    if (!reading.ok) continue;

    await run(db, recordStatements(key, war, home, away, reading));
    return 'recorded';
  }
  return 'nothing';
}

function recordStatements(
  key: string,
  war: CocWar,
  home: { tag: string; name: string },
  away: { tag: string; name: string },
  reading: Extract<ReturnType<typeof readFriendlyWar>, { ok: true }>,
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
              away_tag, away_name, away_stars, away_destruction, away_duration, winner)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
