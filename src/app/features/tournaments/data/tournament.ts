import { TournamentStatus } from '../../../core/tournament/tournament';

// Les types vivent dans le cœur partagé avec le serveur ; on les ré-exporte
// pour que le reste du site continue de les importer d'ici.
export type {
  Tournament,
  TournamentStatus,
  TournamentSummary,
} from '../../../core/tournament/tournament';

/** Libellés affichés : c'est de l'interface, donc ça reste côté site. */
export const STATUS_LABEL: Record<TournamentStatus, string> = {
  registration: 'Inscriptions ouvertes',
  running: 'En cours',
  finished: 'Terminé',
};
