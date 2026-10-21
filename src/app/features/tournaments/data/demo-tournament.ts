import { createBracket, recordResult } from '../../../core/tournament/bracket';
import { Bracket, ClanRef, SideScore } from '../../../core/tournament/models';
import { decideWinner } from '../../../core/tournament/war-result';
import { Tournament } from './tournament';

/**
 * Tournoi de DÉMONSTRATION : de faux clans et de faux scores, pour voir l'arbre
 * en attendant le serveur. Il est construit avec la vraie logique du tournoi
 * (tirage, qualifications, règle du vainqueur) : c'est aussi un test grandeur
 * nature de cette logique.
 */
const DEMO_CLANS: readonly ClanRef[] = [
  'Alpha',
  'Bravo',
  'Charlie',
  'Delta',
  'Echo',
  'Foxtrot',
  'Golf',
  'Hotel',
].map((name, i) => ({ tag: `#DEMO${i + 1}`, name: `Clan ${name}` }));

const s = (stars: number, destruction: number, totalDurationSec: number): SideScore => ({
  stars,
  destruction,
  totalDurationSec,
});

/** Scores inventés des matchs déjà joués. 5 contre 5 : 15 étoiles au maximum. */
const DEMO_SCORES: readonly [string, SideScore, SideScore][] = [
  ['R1-M1', s(14, 97.4, 812), s(11, 88.1, 905)],
  ['R1-M2', s(12, 90.0, 870), s(13, 92.6, 840)],
  ['R1-M3', s(15, 100, 760), s(15, 100, 798)], // départagé au temps
  ['R1-M4', s(10, 84.2, 930), s(12, 89.9, 880)],
  ['R2-M1', s(13, 95.0, 820), s(13, 93.8, 801)], // départagé au pourcentage
];

function buildDemoBracket(): Bracket {
  // Hasard figé : la démo affiche toujours le même tirage.
  let bracket = createBracket(DEMO_CLANS, () => 0.999999);
  for (const [id, home, away] of DEMO_SCORES) {
    const winner = decideWinner(home, away);
    if (winner) bracket = recordResult(bracket, id, winner, { home, away });
  }
  return bracket;
}

export const DEMO_TOURNAMENT: Tournament = {
  slug: 'demo',
  name: 'Tournoi de démonstration',
  status: 'running',
  clans: DEMO_CLANS,
  bracket: buildDemoBracket(),
  isDemo: true,
};
