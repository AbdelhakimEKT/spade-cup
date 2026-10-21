import { Bracket, ClanRef } from '../../../core/tournament/models';

export type TournamentStatus = 'registration' | 'running' | 'finished';

/** Un tournoi tel que le site l'affiche. */
export interface Tournament {
  /** Identifiant lisible utilisé dans l'URL : /tournois/:slug. */
  readonly slug: string;
  readonly name: string;
  readonly status: TournamentStatus;
  readonly organizer: string;
  readonly referees: readonly string[];
  /** Règlement affiché sous le titre. */
  readonly rules: string;
  readonly clans: readonly ClanRef[];
  /** `null` tant que les inscriptions ne sont pas closes (pas encore de tirage). */
  readonly bracket: Bracket | null;
  /** Vrai pour le tournoi d'exemple : le site l'affiche clairement. */
  readonly isDemo: boolean;
}

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  registration: 'Inscriptions ouvertes',
  running: 'En cours',
  finished: 'Terminé',
};
