/**
 * Vocabulaire du domaine : ce qu'est un clan inscrit, un match, un arbre.
 *
 * Ce dossier ne dépend PAS d'Angular : que du TypeScript. La logique des
 * tournois pourra ainsi être testée seule et réutilisée telle quelle par le
 * serveur (Cloudflare Worker).
 */

/** Règles fixées pour Spade Cup : HDV18 uniquement, en 5 contre 5. */
export const TOURNAMENT_RULES = {
  townHallLevel: 18,
  teamSize: 5,
} as const;

/** Un clan tel qu'il apparaît dans l'arbre. */
export interface ClanRef {
  /** Tag Clash of Clans, avec le « # ». */
  readonly tag: string;
  readonly name: string;
}

/** Ce qu'un camp a fait pendant la guerre amicale. */
export interface SideScore {
  readonly stars: number;
  /** Pourcentage de destruction moyen sur les bases adverses (0 à 100). */
  readonly destruction: number;
  /** Durée cumulée de toutes les attaques, en secondes. */
  readonly totalDurationSec: number;
}

export type Side = 'home' | 'away';

export type MatchStatus =
  /** En attente d'adversaire(s) ou de résultat. */
  | 'pending'
  /** Un seul clan : il est qualifié d'office (exempt). */
  | 'bye'
  /** Résultat connu. */
  | 'done';

export interface BracketMatch {
  /** Identifiant stable, par exemple « R1-M3 » : tour 1, 3e match. */
  readonly id: string;
  /** 1 = premier tour. */
  readonly round: number;
  /** Position du match dans son tour, à partir de 1. */
  readonly index: number;
  /** `null` = place encore à déterminer (ou exempté au premier tour). */
  readonly home: ClanRef | null;
  readonly away: ClanRef | null;
  readonly status: MatchStatus;
  readonly winner: Side | null;
  readonly score: { readonly home: SideScore; readonly away: SideScore } | null;
}

export interface Bracket {
  /** Nombre de places au premier tour : puissance de 2 (8, 16, 32…). */
  readonly size: number;
  readonly roundCount: number;
  /** Tous les matchs, triés par tour puis par position. */
  readonly matches: readonly BracketMatch[];
}
