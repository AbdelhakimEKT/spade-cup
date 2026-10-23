import {
  ClanProfile,
  FriendlyWarSummary,
  MatchDetail,
  PlayerProfile,
  PlayerTotals,
} from '../app/core/tournament/stats';
import { DEMO_MATCH_PLAYERS } from '../app/features/tournaments/data/demo-players';
import { DEMO_TOURNAMENT } from '../app/features/tournaments/data/demo-tournament';

/**
 * Réponses du serveur fabriquées à partir de la démo, pour les tests des pages.
 * Construites avec les vrais types partagés : si le serveur change de forme,
 * ces fichiers ne compilent plus, et on le sait tout de suite.
 */

const bracket = DEMO_TOURNAMENT.bracket!;
export const match = (id: string) => bracket.matches.find((m) => m.id === id)!;

export function matchDetail(id: string): MatchDetail {
  const lines = DEMO_MATCH_PLAYERS.get(id) ?? [];
  return {
    tournament: {
      slug: 'demo',
      name: DEMO_TOURNAMENT.name,
      status: 'running',
      clanCount: 16,
      isDemo: true,
    },
    roundCount: bracket.roundCount,
    match: match(id),
    players: {
      home: lines.filter((l) => l.side === 'home'),
      away: lines.filter((l) => l.side === 'away'),
    },
    source: lines.length ? 'game' : null,
  };
}

export const PIKACHUS = DEMO_TOURNAMENT.clans.find((c) => c.tag === '#DEMO1')!;

export function player(i: number, overrides: Partial<PlayerTotals> = {}): PlayerTotals {
  return {
    tag: `#P${i}`,
    name: `Joueur ${i}`,
    clan: PIKACHUS,
    wars: 1,
    attacks: 1,
    stars: 2,
    triples: 0,
    destruction: 80,
    ...overrides,
  };
}

export function playerProfile(): PlayerProfile {
  const line = DEMO_MATCH_PLAYERS.get('R1-M1')![0];
  const m = match('R1-M1');
  return {
    totals: {
      tag: line.tag,
      name: line.name,
      clan: PIKACHUS,
      wars: 1,
      attacks: 1,
      stars: line.stars,
      triples: line.triples,
      destruction: line.destruction,
    },
    history: [
      {
        tournament: { slug: 'demo', name: DEMO_TOURNAMENT.name, isDemo: true },
        matchId: 'R1-M1',
        round: 1,
        roundCount: bracket.roundCount,
        clan: m.home!,
        opponent: m.away,
        won: true,
        line,
      },
    ],
    fw: null,
  };
}

/** Une FW classique terminée : FW-team2 gagne 13★ à 11★. */
export function friendlyWar(id = 1): FriendlyWarSummary {
  return {
    id,
    endedAt: '2026-10-20T19:32:58Z',
    teamSize: 10,
    home: { tag: '#2JVUP2PGC', name: 'FW-team2', stars: 13, destruction: 53.4 },
    away: { tag: '#2CYJPRCG8', name: 'FW-team1', stars: 11, destruction: 46.4 },
    winner: 'home',
  };
}

/** Un joueur qui n'a fait QUE des FW classiques (aucune Spade Cup). */
export function fwOnlyProfile(): PlayerProfile {
  const line = DEMO_MATCH_PLAYERS.get('R1-M1')![0];
  const clan = { tag: '#2JVUP2PGC', name: 'FW-team2' };
  const totals = {
    tag: line.tag,
    name: line.name,
    clan,
    wars: 1,
    attacks: 1,
    stars: 3,
    triples: 1,
    destruction: 100,
  };
  return {
    totals: { ...totals, wars: 0, attacks: 0, stars: 0, triples: 0, destruction: 0 },
    history: [],
    fw: { totals, history: [{ war: friendlyWar(), won: true, line }] },
  };
}

export function clanProfile(): ClanProfile {
  return {
    clan: PIKACHUS,
    runs: [
      {
        tournament: { slug: 'demo', name: DEMO_TOURNAMENT.name, status: 'running', isDemo: true },
        outcome: 'alive',
        round: 2,
        roundCount: 4,
      },
    ],
    record: { played: 1, won: 1, lost: 0 },
    players: [player(1, { stars: 3, triples: 1 }), player(2)],
  };
}
