import { PlayerLine } from '../../../core/tournament/coc-war';

export type LineSortKey =
  'position' | 'name' | 'team' | 'townHall' | 'target' | 'stars' | 'destruction' | 'duration';
export type SortDir = 'asc' | 'desc';

/**
 * Le sens du premier clic sur une colonne : les meilleurs d'abord pour les
 * étoiles, le % et l'HDV ; le haut de la carte (place, cible), l'ordre
 * alphabétique et les attaques les plus rapides d'abord pour les autres.
 */
export function firstDir(key: LineSortKey): SortDir {
  return key === 'stars' || key === 'destruction' || key === 'townHall' ? 'desc' : 'asc';
}

/** Colonnes qui n'ont de sens que pour un joueur qui a attaqué. */
const ATTACK_KEYS: readonly LineSortKey[] = ['target', 'stars', 'destruction', 'duration'];

/**
 * Trie les joueurs d'une guerre sur une colonne, dans un sens.
 * - Sur une colonne d'attaque, ceux qui n'ont pas attaqué restent en bas dans
 *   les deux sens (0 s ne veut pas dire « l'attaque la plus rapide »).
 * - À égalité : le plus d'étoiles, puis le meilleur %, puis le plus rapide,
 *   puis la place sur la carte.
 * `teamName` : le nom du camp de chaque joueur, pour la colonne « Équipe ».
 */
export function sortLines(
  lines: readonly PlayerLine[],
  key: LineSortKey,
  dir: SortDir,
  teamName: (line: PlayerLine) => string = (l) => l.side,
): PlayerLine[] {
  const compare = (a: PlayerLine, b: PlayerLine): number => {
    switch (key) {
      case 'position':
        return a.mapPosition - b.mapPosition;
      case 'name':
        return a.name.localeCompare(b.name, 'fr');
      case 'team':
        return teamName(a).localeCompare(teamName(b), 'fr');
      case 'townHall':
        return a.townHall - b.townHall;
      case 'target':
        return (a.targets?.[0]?.position ?? 0) - (b.targets?.[0]?.position ?? 0);
      case 'stars':
        return a.stars - b.stars;
      case 'destruction':
        return a.destruction - b.destruction;
      case 'duration':
        return a.durationSec - b.durationSec;
    }
  };
  const sign = dir === 'asc' ? 1 : -1;
  const idle = (l: PlayerLine) => (ATTACK_KEYS.includes(key) && l.attacks === 0 ? 1 : 0);
  return [...lines].sort(
    (a, b) =>
      idle(a) - idle(b) ||
      sign * compare(a, b) ||
      b.stars - a.stars ||
      b.destruction - a.destruction ||
      a.durationSec - b.durationSec ||
      a.mapPosition - b.mapPosition ||
      a.side.localeCompare(b.side),
  );
}
