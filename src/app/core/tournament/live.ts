import { PlayerLine } from './coc-war';

/**
 * Une guerre suivie EN DIRECT (page « En direct » du site) : un match de
 * Spade Cup en cours, ou une FW classique. Partagé entre le serveur et le site.
 */

export interface LiveSide {
  readonly tag: string;
  readonly name: string;
  readonly badgeUrl?: string;
  readonly stars: number;
  /** Destruction moyenne actuelle (0 à 100). */
  readonly destruction: number;
  /** Attaques déjà faites, sur le nombre possible. */
  readonly attacksUsed: number;
  readonly attacksTotal: number;
}

export interface LiveWar {
  /** Identifiant stable (pour le suivi d'une liste à l'autre). */
  readonly id: string;
  readonly kind: 'spade-cup' | 'fw';
  /** Pour un match de Spade Cup : de quel tournoi, quel match, quel tour. */
  readonly match?: {
    readonly slug: string;
    readonly tournament: string;
    readonly matchId: string;
    readonly round: string;
  };
  /** Préparation, guerre en cours, ou terminée depuis peu. */
  readonly state: 'preparation' | 'inWar' | 'warEnded';
  /** Début et fin de la phase de combat (ISO), si connus. */
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly teamSize: number | null;
  readonly home: LiveSide;
  readonly away: LiveSide;
  readonly players: { readonly home: readonly PlayerLine[]; readonly away: readonly PlayerLine[] };
  /** Quand le serveur a interrogé le jeu (ISO). */
  readonly fetchedAt: string;
}
