import { Side, SideScore } from './models';

/**
 * Désigne le vainqueur d'une guerre amicale :
 *   1. le plus d'étoiles ;
 *   2. à égalité, le meilleur pourcentage de destruction ;
 *   3. encore à égalité, le moins de temps passé à attaquer au total.
 * Égalité parfaite → `null` : c'est aux arbitres de trancher.
 *
 * Les deux premiers critères sont ceux du jeu lui-même ; le troisième
 * reprend la règle « étoiles, puis pourcentage, puis temps » des maquettes.
 */
export function decideWinner(home: SideScore, away: SideScore): Side | null {
  if (home.stars !== away.stars) return home.stars > away.stars ? 'home' : 'away';
  if (home.destruction !== away.destruction) {
    return home.destruction > away.destruction ? 'home' : 'away';
  }
  if (home.totalDurationSec !== away.totalDurationSec) {
    return home.totalDurationSec < away.totalDurationSec ? 'home' : 'away';
  }
  return null;
}
