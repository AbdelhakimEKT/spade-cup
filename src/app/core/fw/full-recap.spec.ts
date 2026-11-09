import {
  buildFullRecap,
  fullRecapQuery,
  outcome,
  parseFullRecap,
  playerTotals,
  type PlayerRow,
  type WarRow,
} from './full-recap';

const T1 = '#2CYJPRCG8';
const T2 = '#2JVUP2PGC';

const war = (id: number, homeStars: number, awayStars: number, winner: 'home' | 'away' | null): WarRow => ({
  id,
  homeTag: T1,
  homeStars,
  homeDestruction: 80,
  awayStars,
  awayDestruction: 70,
  winner,
  teamSize: 3,
});

const row = (warId: number, clanTag: string, tag: string, name: string, stars: number, target = 1): PlayerRow => ({
  warId,
  clanTag,
  tag,
  name,
  townHall: 18,
  attacks: 1,
  stars,
  destructionSum: stars * 30,
  duration: 120,
  targets: [{ position: target, stars, destruction: stars * 30, durationSec: 120 }],
});

describe('bilan complet d’une soirée FW', () => {
  const recap = buildFullRecap(
    { number: 44, day: 'vendredi 06/11' },
    [war(14, 7, 6, 'home'), war(15, 5, 6, 'away'), war(16, 3, 6, 'away')],
    [
      row(14, T1, '#A', 'Tr3no', 3, 3),
      row(15, T1, '#A', 'Tr3no', 2),
      row(16, T1, '#A', 'Treno', 2),
      row(14, T2, '#B', 'RAGS', 2, 2),
      row(16, T2, '#B', 'RAGS', 2),
      { ...row(16, T1, '#C', 'Warrior', 0), attacks: 0, targets: [] },
    ],
    T1,
  );

  it('chaque FW vue de la FW-Team 1 puis de la FW-Team 2', () => {
    expect(recap.wars.map((w) => [w.stars, w.winner])).toEqual([
      [[7, 6], 1],
      [[5, 6], 2],
      [[3, 6], 2],
    ]);
    expect(outcome(recap)).toEqual({ wins: [1, 2], stars: [15, 18], winner: 2 });
  });

  it('chaque joueur dans son équipe, avec ses attaques FW par FW', () => {
    const [t1, t2] = recap.teams;
    // Le nom de sa dernière FW ; celui qui n'a pas attaqué passe en dernier.
    expect(t1.map((p) => p.name)).toEqual(['Treno', 'Warrior']);
    expect(t1[0].wars.map((w) => w?.map((a) => a.stars))).toEqual([[3], [2], [2]]);
    expect(t1[1].wars).toEqual([null, null, []]);
    // Pas dans la FW 2 : case vide.
    expect(t2[0].wars[1]).toBeNull();
    expect(playerTotals(t1[0])).toMatchObject({ attacks: 3, stars: 7, triples: 1 });
    expect(playerTotals(t1[0]).starsPerAttack).toBeCloseTo(7 / 3);
  });

  it('passe par l’adresse de la page sans rien perdre', () => {
    const q = new URLSearchParams(fullRecapQuery(recap));
    const back = parseFullRecap(q.get('n')!, q.get('d')!, q.get('s')!, q.get('b')!);
    expect(back).toEqual(recap);
  });

  it('adresse illisible : null', () => {
    expect(parseFullRecap('44', '', '3', 'pas du json')).toBeNull();
  });
});
