import { PlayerLine } from '../tournament/coc-war';
import { PlayerProfile, PlayerTotals } from '../tournament/stats';
import { friendlyWar, player } from '../../../testing/fixtures';
import { playerCard } from './player-card';

/** Une ligne de FW : `stars` étoiles en une attaque (0 attaque si `stars` < 0). */
const line = (stars: number, townHall = 18): PlayerLine => ({
  tag: '#ME',
  name: 'Moi',
  side: 'home',
  townHall,
  mapPosition: 1,
  attacks: stars < 0 ? 0 : 1,
  stars: Math.max(0, stars),
  destruction: stars === 3 ? 100 : 70,
  triples: stars === 3 ? 1 : 0,
  durationSec: 150,
});

/** Un joueur de FW : ses guerres, de la plus récente à la plus ancienne. */
function fwProfile(stars: number[], won: (boolean | null)[]): PlayerProfile {
  const lines = stars.map((s, i) => line(s, i === 0 ? 18 : 17));
  const attacks = lines.filter((l) => l.attacks).length;
  const total = lines.reduce((s, l) => s + l.stars, 0);
  const totals: PlayerTotals = {
    ...player(1, { tag: '#ME', name: 'Moi' }),
    wars: lines.length,
    attacks,
    stars: total,
    triples: lines.filter((l) => l.triples).length,
    destruction: 85,
  };
  return {
    totals: { ...totals, wars: 0, attacks: 0, stars: 0, triples: 0 },
    history: [],
    fw: {
      totals,
      history: lines.map((l, i) => ({ war: friendlyWar(i + 1), won: won[i] ?? null, line: l })),
    },
  };
}

describe('carte d’un joueur', () => {
  it('perfs en FW : étoiles par attaque, triples, victoires, temps, HDV actuel', () => {
    // Plus récente d'abord : 3, 3, 2, (pas d'attaque), 3, 1.
    const card = playerCard(fwProfile([3, 3, 2, -1, 3, 1], [true, true, false, null, true, false]));
    expect(card).toMatchObject({
      source: 'FW',
      townHall: 18,
      attacks: 5,
      stars: 12,
      starsPerAttack: 12 / 5,
      triples: 3,
      tripleRate: 3 / 5,
      avgDurationSec: 150,
      wins: 3,
      winRate: 3 / 5,
    });
    // Forme : de la plus ancienne à la plus récente, sans la guerre sans attaque.
    expect(card.form).toEqual([1, 3, 2, 3, 3]);
    // Série de triples : les 2 dernières (la guerre sans attaque ne coupe rien).
    expect(card.bestTripleStreak).toBe(2);
  });

  it('place au classement (étoiles par attaque, 3 attaques au moins)', () => {
    const ranking = [
      player(1, { tag: '#A', attacks: 5, stars: 10 }), // 2,0
      player(2, { tag: '#ME', attacks: 5, stars: 12 }), // 2,4
      player(3, { tag: '#B', attacks: 4, stars: 11 }), // 2,75
      player(4, { tag: '#C', attacks: 1, stars: 3 }), // trop peu d'attaques
    ];
    const card = playerCard(fwProfile([3, 3, 2, 3, 1], []), ranking);
    expect(card.rank).toEqual({ position: 2, total: 3 });
  });

  it('seulement la Spade Cup : la carte de ses guerres de tournoi', () => {
    const profile: PlayerProfile = {
      totals: player(1, { attacks: 2, stars: 5, wars: 2 }),
      history: [],
      fw: null,
    };
    expect(playerCard(profile)).toMatchObject({
      source: 'Spade Cup',
      starsPerAttack: 2.5,
      rank: null,
    });
  });
});
