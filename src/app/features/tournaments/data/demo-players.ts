import { PlayerLine } from '../../../core/tournament/coc-war';
import { ClanRef, Side, SideScore, TOURNAMENT_RULES } from '../../../core/tournament/models';
import { DEMO_TOURNAMENT } from './demo-tournament';

/**
 * Joueurs FICTIFS des matchs déjà joués de la démo, pour que les pages de
 * match et de statistiques aient quelque chose à montrer.
 *
 * Ils sont fabriqués à partir des scores de la démo et les respectent : la
 * somme des étoiles des 5 joueurs donne les étoiles du clan, et leur
 * destruction moyenne donne son pourcentage. Une attaque par joueur.
 */

const ROOTS = ['Loup', 'Draco', 'Kaiser', 'Nyx', 'Titan', 'Raven', 'Volt', 'Sora', 'Blaze', 'Zen'];
const ENDS = ['Noir', 'FR', 'Rush', 'Max', 'Prime', 'Storm', 'Ace', 'Lord'];

/** Les 5 joueurs d'un clan de la démo : toujours les mêmes d'un match à l'autre. */
function rosterOf(clan: ClanRef): { tag: string; name: string }[] {
  const n = Number(clan.tag.replace('#DEMO', '')) - 1; // 0 à 15
  return Array.from({ length: TOURNAMENT_RULES.teamSize }, (_, i) => {
    const k = n * TOURNAMENT_RULES.teamSize + i; // 0 à 79, tous différents
    return { tag: `#D${n + 1}P${i + 1}`, name: ROOTS[k % 10] + ENDS[Math.floor(k / 10)] };
  });
}

/** Étoiles par joueur : 2 chacun, puis des 3 (ou des 1) jusqu'au total du clan. */
function starsSplit(total: number): number[] {
  const stars = Array<number>(TOURNAMENT_RULES.teamSize).fill(2);
  let diff = total - 2 * stars.length;
  for (let i = 0; diff !== 0; i = (i + 1) % stars.length) {
    const step = Math.sign(diff);
    if (stars[i] + step >= 0 && stars[i] + step <= 3) {
      stars[i] += step;
      diff -= step;
    }
  }
  return stars;
}

/** Répartit `total` en `n` parts proches, avec un peu de variété, somme exacte. */
function spread(total: number, n: number, swing: number, decimals: number): number[] {
  const factor = 10 ** decimals;
  const base = total / n;
  const parts = Array.from({ length: n }, (_, i) =>
    i === n - 1 ? 0 : Math.round((base + (i % 2 ? -swing : swing) * (1 - i / n)) * factor) / factor,
  );
  parts[n - 1] = Math.round((total - parts.reduce((a, b) => a + b, 0)) * factor) / factor;
  return parts;
}

function linesFor(clan: ClanRef, side: Side, score: SideScore): PlayerLine[] {
  const stars = starsSplit(score.stars);
  const nonTriples = stars.filter((s) => s < 3).length;
  // La destruction moyenne du clan = moyenne des 5 attaques ; une triple vaut 100 %.
  const rest = score.destruction * stars.length - 100 * (stars.length - nonTriples);
  const destructions = nonTriples ? spread(rest, nonTriples, 4, 1) : [];
  const durations = spread(score.totalDurationSec, stars.length, 12, 0);

  return rosterOf(clan).map((p, i) => ({
    ...p,
    side,
    townHall: TOURNAMENT_RULES.townHallLevel,
    mapPosition: i + 1,
    attacks: 1,
    stars: stars[i],
    destruction: stars[i] === 3 ? 100 : destructions.shift()!,
    triples: stars[i] === 3 ? 1 : 0,
    durationSec: durations[i],
  }));
}

/** Lignes des joueurs par identifiant de match (« R1-M3 »). */
export const DEMO_MATCH_PLAYERS: ReadonlyMap<string, readonly PlayerLine[]> = new Map(
  DEMO_TOURNAMENT.bracket!.matches.filter((m) => m.status === 'done' && m.score).map((m) => [
    m.id,
    [...linesFor(m.home!, 'home', m.score!.home), ...linesFor(m.away!, 'away', m.score!.away)],
  ]),
);
