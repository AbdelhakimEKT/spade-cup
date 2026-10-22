import { PlayerLine } from './coc-war';
import { BracketMatch, ClanRef } from './models';
import { Tournament, TournamentStatus, TournamentSummary } from './tournament';

/**
 * Ce que le serveur renvoie pour les statistiques. Partagé avec le site,
 * comme `Tournament` : le compilateur garde les deux côtés d'accord.
 */

/** Bilan cumulé d'un joueur (sur tous les tournois, ou un seul). */
export interface PlayerTotals {
  readonly tag: string;
  readonly name: string;
  /** Le dernier clan avec lequel il a joué. */
  readonly clan: ClanRef;
  /** Nombre de guerres (matchs) jouées. */
  readonly wars: number;
  readonly attacks: number;
  readonly stars: number;
  readonly triples: number;
  /** Destruction moyenne par attaque. */
  readonly destruction: number;
}

/** Une guerre dans l'historique d'un joueur. */
export interface PlayerWar {
  readonly tournament: { readonly slug: string; readonly name: string; readonly isDemo: boolean };
  readonly matchId: string;
  readonly round: number;
  readonly roundCount: number;
  readonly clan: ClanRef;
  readonly opponent: ClanRef | null;
  /** `null` tant que le vainqueur n'est pas désigné. */
  readonly won: boolean | null;
  readonly line: PlayerLine;
}

export interface PlayerProfile {
  readonly totals: PlayerTotals;
  /** Du plus récent au plus ancien. */
  readonly history: readonly PlayerWar[];
}

/** Le parcours d'un clan dans un tournoi. */
export interface ClanRun {
  readonly tournament: {
    readonly slug: string;
    readonly name: string;
    readonly status: TournamentStatus;
    readonly isDemo: boolean;
  };
  /**
   * champion · eliminated (au tour `round`) · alive (encore en lice) ·
   * registered (inscrit, tirage pas encore fait).
   */
  readonly outcome: 'champion' | 'eliminated' | 'alive' | 'registered';
  /** Dernier tour atteint (0 si l'arbre n'existe pas encore). */
  readonly round: number;
  readonly roundCount: number;
}

export interface ClanProfile {
  readonly clan: ClanRef;
  readonly runs: readonly ClanRun[];
  readonly record: { readonly played: number; readonly won: number; readonly lost: number };
  /** Ses joueurs, avec leurs bilans sous les couleurs de ce clan. */
  readonly players: readonly PlayerTotals[];
}

/** Tout ce qu'affiche la page d'un match. */
export interface MatchDetail {
  readonly tournament: TournamentSummary;
  readonly roundCount: number;
  readonly match: BracketMatch;
  /** Lignes des joueurs, si le résultat a été lu dans le jeu (vide sinon). */
  readonly players: { readonly home: readonly PlayerLine[]; readonly away: readonly PlayerLine[] };
  /** D'où vient le score : lu dans le jeu, ou saisi par un arbitre. */
  readonly source: 'game' | 'referee' | null;
}

// ------------------------------------------------- calculs (purs)

/** Additionne les lignes d'un joueur. La destruction est pondérée par le nombre d'attaques. */
export function totalsOf(
  player: { readonly tag: string; readonly name: string; readonly clan: ClanRef },
  lines: readonly PlayerLine[],
): PlayerTotals {
  const attacks = lines.reduce((sum, l) => sum + l.attacks, 0);
  const destructionSum = lines.reduce((sum, l) => sum + l.destruction * l.attacks, 0);
  return {
    ...player,
    wars: lines.length,
    attacks,
    stars: lines.reduce((sum, l) => sum + l.stars, 0),
    triples: lines.reduce((sum, l) => sum + l.triples, 0),
    destruction: attacks ? Math.round((destructionSum / attacks) * 10) / 10 : 0,
  };
}

/** Le parcours d'un clan dans un tournoi, déduit de l'arbre. */
export function clanRun(t: Tournament, clanTag: string): ClanRun {
  const tournament = { slug: t.slug, name: t.name, status: t.status, isDemo: t.isDemo };
  const bracket = t.bracket;
  if (!bracket) return { tournament, outcome: 'registered', round: 0, roundCount: 0 };

  const played = bracket.matches.filter((m) => m.home?.tag === clanTag || m.away?.tag === clanTag);
  const last = played.at(-1); // les matchs sont triés par tour
  const { roundCount } = bracket;
  if (!last) return { tournament, outcome: 'registered', round: 0, roundCount };

  const winner = last.winner === 'home' ? last.home : last.winner === 'away' ? last.away : null;
  const outcome =
    winner === null
      ? 'alive'
      : winner.tag !== clanTag
        ? 'eliminated'
        : last.round === roundCount
          ? 'champion'
          : 'alive';
  return { tournament, outcome, round: last.round, roundCount };
}

/** Matchs joués (hors exempts), gagnés et perdus par un clan dans un tournoi. */
export function clanRecord(t: Tournament, clanTag: string): ClanProfile['record'] {
  const done = (t.bracket?.matches ?? []).filter(
    (m) => m.status === 'done' && (m.home?.tag === clanTag || m.away?.tag === clanTag),
  );
  const won = done.filter((m) => (m.winner === 'home' ? m.home : m.away)?.tag === clanTag).length;
  return { played: done.length, won, lost: done.length - won };
}
