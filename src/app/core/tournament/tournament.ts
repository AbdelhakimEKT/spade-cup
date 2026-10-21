import { Bracket, ClanRef } from './models';

/**
 * Un tournoi tel que le serveur le renvoie et que le site l'affiche.
 * Partagé par les deux : le compilateur vérifie qu'ils parlent la même langue.
 */
export type TournamentStatus = 'registration' | 'running' | 'finished';

export interface Tournament {
  /** Identifiant lisible utilisé dans l'URL : /tournois/:slug. */
  readonly slug: string;
  readonly name: string;
  readonly status: TournamentStatus;
  readonly organizer: string;
  readonly referees: readonly string[];
  /** Règlement affiché sous le titre. */
  readonly rules: string;
  /** Clans inscrits, dans l'ordre du tirage une fois celui-ci fait. */
  readonly clans: readonly ClanRef[];
  /** `null` tant que les inscriptions ne sont pas closes (pas encore de tirage). */
  readonly bracket: Bracket | null;
  /** Vrai pour le tournoi d'exemple : le site l'affiche clairement. */
  readonly isDemo: boolean;
}

/** Ligne de la liste des tournois : juste de quoi afficher et ouvrir la fiche. */
export interface TournamentSummary {
  readonly slug: string;
  readonly name: string;
  readonly status: TournamentStatus;
  readonly clanCount: number;
  readonly isDemo: boolean;
}
