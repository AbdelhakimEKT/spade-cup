import {
  createBracket,
  recordResult,
  seedOrder,
  startMatch,
} from '../../../core/tournament/bracket';
import { Bracket, ClanRef, SideScore } from '../../../core/tournament/models';
import { decideWinner } from '../../../core/tournament/war-result';
import { Tournament } from './tournament';

/**
 * Tournoi de DÉMONSTRATION : de faux clans et de faux scores (les noms
 * reprennent la maquette), pour voir l'arbre en attendant le serveur.
 * Il est construit avec la vraie logique du tournoi : c'est aussi un test
 * grandeur nature de cette logique.
 */

/** Les affiches du premier tour, dans l'ordre de l'arbre (haut → bas). */
const FIRST_ROUND: readonly (readonly [string, string])[] = [
  ['Les Pikachus', 'Titans FR'],
  ['Orion', 'Iris'],
  ['Vega', 'Draco'],
  ['Lyra', 'Falco'],
  ['Zéphyr', 'Mistral'],
  ['Atlas', 'Athéna'],
  ['Kirra', 'Ombre'],
  ['Sirius', 'Nova'],
];

const clan = (name: string, i: number): ClanRef => ({ tag: `#DEMO${i + 1}`, name });

/**
 * Le tirage place les clans selon l'ordre des têtes de série (1 contre 16,
 * 8 contre 9…). Pour obtenir exactement les affiches ci-dessus, on attribue à
 * chaque clan la tête de série qui le mettra à la bonne place.
 */
function clansInSeedOrder(): ClanRef[] {
  const layout = FIRST_ROUND.flat();
  const order = seedOrder(layout.length);
  const bySeed: ClanRef[] = [];
  order.forEach((seed, position) => (bySeed[seed - 1] = clan(layout[position], position)));
  return bySeed;
}

const s = (stars: number, destruction: number, totalDurationSec: number): SideScore => ({
  stars,
  destruction,
  totalDurationSec,
});

/** Scores inventés. 5 contre 5 : 15 étoiles au maximum. */
const DEMO_SCORES: readonly (readonly [string, SideScore, SideScore])[] = [
  ['R1-M1', s(13, 91.2, 860), s(11, 84.0, 905)],
  ['R1-M2', s(14, 96.8, 790), s(9, 71.4, 980)],
  ['R1-M3', s(12, 89.6, 840), s(12, 87.1, 812)], // départagé au pourcentage
  ['R1-M4', s(11, 85.3, 870), s(8, 66.2, 940)],
  ['R1-M5', s(14, 97.0, 800), s(10, 79.5, 930)],
  ['R1-M6', s(10, 80.2, 900), s(13, 92.4, 845)],
  ['R1-M7', s(13, 90.1, 850), s(10, 81.7, 890)],
  ['R1-M8', s(9, 72.8, 960), s(12, 88.3, 870)],
  ['R2-M3', s(13, 93.5, 820), s(11, 86.0, 875)],
];

function buildDemoBracket(): Bracket {
  // Le hasard est figé (rien n'est mélangé) : l'ordre ci-dessus fait foi.
  let bracket = createBracket(clansInSeedOrder(), () => 0.999999);
  for (const [id, home, away] of DEMO_SCORES) {
    const winner = decideWinner(home, away);
    if (winner) bracket = recordResult(bracket, id, winner, { home, away });
  }
  return startMatch(bracket, 'R2-M1'); // Les Pikachus contre Orion se joue en ce moment
}

export const DEMO_TOURNAMENT: Tournament = {
  slug: 'demo',
  name: 'Tournoi de démonstration',
  status: 'running',
  organizer: 'Spade Cup FR',
  referees: ['Zeus', 'Hermès'],
  rules:
    'Guerres amicales en 5 contre 5, HDV18 uniquement. Étoiles, puis pourcentage, puis temps. ' +
    'Gardez vos captures d’écran : elles servent en cas de litige.',
  clans: clansInSeedOrder(),
  bracket: buildDemoBracket(),
  isDemo: true,
};
