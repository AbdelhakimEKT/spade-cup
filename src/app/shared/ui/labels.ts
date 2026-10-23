import { roundLabel } from '../../core/tournament/bracket';
import { BracketMatch } from '../../core/tournament/models';
import { ClanRun } from '../../core/tournament/stats';
import { decideWinner } from '../../core/tournament/war-result';

/** « Champion », « Éliminé en quarts de finale », « En lice : demi-finales »… */
export function outcomeLabel(run: ClanRun): string {
  const round = run.round ? roundLabel(run.round, run.roundCount).toLowerCase() : '';
  switch (run.outcome) {
    case 'champion':
      return 'Champion';
    case 'eliminated':
      return run.round === run.roundCount ? 'Finaliste' : `Éliminé en ${round}`;
    case 'alive':
      return `En lice : ${round}`;
    case 'registered':
      return 'Inscrit, tirage à venir';
  }
}

/** Étoiles par attaque, à une décimale (0 si aucune attaque). */
export function starsPerAttack(stars: number, attacks: number): number {
  return attacks ? Math.round((stars / attacks) * 100) / 100 : 0;
}

/** Comment le match a été (ou sera) décidé, en une phrase. */
export function verdict(match: BracketMatch): string {
  switch (match.status) {
    case 'bye':
      return "Qualifié d'office : pas d'adversaire au premier tour.";
    case 'pending':
      return match.home && match.away ? 'Pas encore joué.' : 'En attente des deux clans.';
    case 'live':
      return 'Guerre amicale en cours.';
  }
  const score = match.score;
  if (!score || decideWinner(score.home, score.away) !== match.winner) {
    return 'Vainqueur désigné par les arbitres.';
  }
  if (score.home.stars !== score.away.stars) return 'Victoire aux étoiles.';
  if (score.home.destruction !== score.away.destruction) {
    return "Égalité d'étoiles : départagé au pourcentage de destruction.";
  }
  return "Égalité d'étoiles et de pourcentage : départagé au temps d'attaque.";
}
