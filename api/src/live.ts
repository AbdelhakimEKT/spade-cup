import { roundLabel } from '../../src/app/core/tournament/bracket';
import { readWarSnapshot, type CocWar } from '../../src/app/core/tournament/coc-war';
import type { LiveSide, LiveWar } from '../../src/app/core/tournament/live';
import type { ClanRef } from '../../src/app/core/tournament/models';
import type { CocClient } from './coc';
import { getCurrentTournament, sqliteTime, toSqliteTime } from './repository';
import { cocTime } from '../../src/app/core/tournament/coc-war';

/**
 * La page « En direct » : les guerres en train de se jouer, telles que le jeu
 * les voit à l'instant (score, attaques déjà faites, joueur par joueur).
 *
 *  - FW classique : la guerre en cours entre les clans de FW (FW_CLANS) ;
 *  - Spade Cup : chaque match « en cours » du tournoi.
 *
 * Une guerre terminée reste affichée 2 heures, pour qu'on voie le score final.
 */

/** Au plus une question au jeu toutes les 30 secondes par clan. */
export const FRESH_MS = 30_000;
const ENDED_VISIBLE_MS = 2 * 60 * 60 * 1000;
/** Plafond de matchs de tournoi regardés à la fois (limite de requêtes du Worker). */
const MAX_MATCHES = 8;

export interface LiveDeps {
  readonly db: D1Database;
  readonly coc: CocClient;
  readonly fwClans: readonly string[];
  readonly now: number;
}

/** Une réponse du jeu, et quand il l'a donnée (ms). */
export interface CachedWar {
  readonly war: CocWar;
  readonly fetchedAt: number;
}

/**
 * La guerre actuelle d'un clan, avec 30 secondes de mémoire. Si le jeu ne
 * répond pas, on se contente de la dernière réponse connue (même ancienne),
 * avec son heure : la page dit alors honnêtement quand elle a été vue.
 */
export async function cachedWar(deps: LiveDeps, tag: string): Promise<CachedWar | null> {
  const row = await deps.db
    .prepare('SELECT fetched_at, war_json FROM live_cache WHERE clan_tag = ?')
    .bind(tag)
    .first<{ fetched_at: string; war_json: string }>();
  const stored = row
    ? { war: JSON.parse(row.war_json) as CocWar, fetchedAt: sqliteTime(row.fetched_at) }
    : null;
  if (stored && deps.now - stored.fetchedAt < FRESH_MS) return stored;
  const result = await deps.coc.currentWar(tag);
  if (!result.ok) return stored;
  await deps.db
    .prepare(
      `INSERT INTO live_cache (clan_tag, fetched_at, war_json) VALUES (?, ?, ?)
       ON CONFLICT (clan_tag) DO UPDATE SET fetched_at = excluded.fetched_at, war_json = excluded.war_json`,
    )
    .bind(tag, toSqliteTime(deps.now), JSON.stringify(result.value))
    .run();
  return { war: result.value, fetchedAt: deps.now };
}

/** Guerre à montrer : en préparation, en cours, ou finie il y a moins de 2 heures. */
export function isVisible(war: CocWar, now: number): boolean {
  if (war.state === 'preparation' || war.state === 'inWar') return true;
  if (war.state !== 'warEnded') return false;
  const ended = cocTime(war.endTime);
  return !Number.isNaN(ended) && now - ended < ENDED_VISIBLE_MS;
}

/** Oppose-t-elle exactement ces deux clans ? */
function opposes(war: CocWar, a: string, b: string): boolean {
  if (!war.clan || !war.opponent) return false;
  return [war.clan.tag, war.opponent.tag].sort().join() === [a, b].sort().join();
}

/** Transforme la réponse du jeu (lue à `fetchedAt`) en guerre « en direct ». Pure. */
export function toLiveWar(
  war: CocWar,
  home: ClanRef,
  away: ClanRef,
  extra: Pick<LiveWar, 'id' | 'kind' | 'match'>,
  fetchedAt: number,
): LiveWar | null {
  const snapshot = readWarSnapshot(war, home, away);
  if (!snapshot.ok || war.state === 'notInWar') return null;
  const perPlayer = war.attacksPerMember ?? 1;
  const side = (ref: ClanRef, which: 'home' | 'away'): LiveSide => {
    const clan = war.clan!.tag === ref.tag ? war.clan! : war.opponent!;
    const players = snapshot.players.filter((p) => p.side === which);
    const badgeUrl = clan.badgeUrls?.medium;
    return {
      tag: ref.tag,
      name: clan.name,
      ...(badgeUrl ? { badgeUrl } : {}),
      stars: snapshot.score[which].stars,
      destruction: snapshot.score[which].destruction,
      attacksUsed: players.reduce((sum, p) => sum + p.attacks, 0),
      attacksTotal: (war.teamSize ?? players.length) * perPlayer,
    };
  };
  const iso = (value: string | undefined) => {
    const ms = cocTime(value);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  };
  return {
    ...extra,
    state: war.state,
    startTime: iso(war.startTime),
    endTime: iso(war.endTime),
    teamSize: war.teamSize ?? null,
    home: side(home, 'home'),
    away: side(away, 'away'),
    players: {
      home: snapshot.players.filter((p) => p.side === 'home'),
      away: snapshot.players.filter((p) => p.side === 'away'),
    },
    fetchedAt: new Date(fetchedAt).toISOString(),
  };
}

/** Toutes les guerres à montrer en direct, Spade Cup d'abord. */
export async function getLiveWars(deps: LiveDeps): Promise<LiveWar[]> {
  const live: LiveWar[] = [];

  // 1. Les matchs « en cours » du tournoi.
  const current = await getCurrentTournament(deps.db);
  const bracket = current?.tournament.status === 'running' ? current.tournament.bracket : null;
  for (const m of (bracket?.matches ?? [])
    .filter((x) => x.status === 'live')
    .slice(0, MAX_MATCHES)) {
    for (const clan of [m.home!, m.away!]) {
      const cached = await cachedWar(deps, clan.tag);
      const war = cached?.war;
      if (!war || !opposes(war, m.home!.tag, m.away!.tag) || !isVisible(war, deps.now)) continue;
      const entry = toLiveWar(
        war,
        m.home!,
        m.away!,
        {
          id: `${current!.tournament.slug}/${m.id}`,
          kind: 'spade-cup',
          match: {
            slug: current!.tournament.slug,
            tournament: current!.tournament.name,
            matchId: m.id,
            round: roundLabel(m.round, bracket!.roundCount),
          },
        },
        cached.fetchedAt,
      );
      if (entry) live.push(entry);
      break;
    }
  }

  // 2. La FW classique, s'il y en a une.
  const [a, b] = deps.fwClans;
  if (a && b) {
    for (const tag of [a, b]) {
      const cached = await cachedWar(deps, tag);
      const war = cached?.war;
      if (!war || !opposes(war, a, b) || !isVisible(war, deps.now)) continue;
      const names = new Map([war.clan!, war.opponent!].map((c) => [c.tag, c.name]));
      const entry = toLiveWar(
        war,
        { tag: a, name: names.get(a)! },
        { tag: b, name: names.get(b)! },
        { id: `fw/${war.preparationStartTime ?? war.startTime ?? ''}`, kind: 'fw' },
        cached.fetchedAt,
      );
      if (entry) live.push(entry);
      break;
    }
  }
  return live;
}
