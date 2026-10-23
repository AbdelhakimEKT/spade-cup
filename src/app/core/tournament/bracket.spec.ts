import {
  bracketFromSeeds,
  bracketSize,
  championOf,
  createBracket,
  currentRound,
  isResultEditable,
  liveMatch,
  recordResult,
  roundLabel,
  roundShortLabel,
  seedOrder,
  shuffle,
  startMatch,
} from './bracket';
import { Bracket, ClanRef } from './models';

const clans = (n: number): ClanRef[] =>
  Array.from({ length: n }, (_, i) => ({ tag: `#CLAN${i + 1}`, name: `Clan ${i + 1}` }));

// Avec ce « hasard » truqué, le mélange ne déplace rien : l'ordre d'inscription
// devient l'ordre des têtes de série. Les tests sont donc reproductibles.
const noShuffle = () => 0.999999;

const match = (bracket: Bracket, id: string) => bracket.matches.find((m) => m.id === id)!;

describe('bracketSize', () => {
  it('arrondit à la puissance de 2 supérieure', () => {
    expect([2, 3, 5, 8, 9, 16, 17].map(bracketSize)).toEqual([2, 4, 8, 8, 16, 16, 32]);
  });
});

describe('seedOrder', () => {
  it('suit l’ordre classique des têtes de série', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('les deux têtes de série d’un même match totalisent toujours taille + 1', () => {
    const order = seedOrder(16);
    for (let i = 0; i < order.length; i += 2) expect(order[i] + order[i + 1]).toBe(17);
  });
});

describe('shuffle', () => {
  it('garde exactement les mêmes éléments et ne touche pas à l’original', () => {
    const original = [1, 2, 3, 4, 5];
    const mixed = shuffle(original);
    expect([...mixed].sort()).toEqual(original);
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('createBracket', () => {
  it('8 clans : 3 tours, 7 matchs, aucun exempt', () => {
    const b = createBracket(clans(8), noShuffle);
    expect(b.size).toBe(8);
    expect(b.roundCount).toBe(3);
    expect(b.matches).toHaveLength(7);
    expect(b.matches.filter((m) => m.status === 'bye')).toHaveLength(0);
    expect(match(b, 'R1-M1')).toMatchObject({ home: { tag: '#CLAN1' }, away: { tag: '#CLAN8' } });
  });

  it('5 clans : 3 exempts qualifiés d’office, jamais deux places vides face à face', () => {
    const b = createBracket(clans(5), noShuffle);
    const firstRound = b.matches.filter((m) => m.round === 1);

    expect(firstRound.filter((m) => m.status === 'bye')).toHaveLength(3);
    expect(firstRound.some((m) => !m.home && !m.away)).toBe(false);
    // Les têtes de série 1, 2 et 3 sont exemptées et déjà placées au 2e tour.
    expect(match(b, 'R2-M1').home?.tag).toBe('#CLAN1');
    expect(match(b, 'R2-M2').home?.tag).toBe('#CLAN2');
    expect(match(b, 'R2-M2').away?.tag).toBe('#CLAN3');
  });

  it('refuse moins de 2 clans, et un clan inscrit deux fois', () => {
    expect(() => createBracket(clans(1))).toThrow('au moins 2 clans');
    expect(() => createBracket([...clans(3), { tag: '#CLAN1', name: 'Doublon' }])).toThrow(
      'deux fois',
    );
  });
});

describe('recordResult', () => {
  it('qualifie le vainqueur à la bonne place du match suivant', () => {
    let b = createBracket(clans(8), noShuffle);
    b = recordResult(b, 'R1-M1', 'away'); // #CLAN8 gagne → place « home » du R2-M1
    b = recordResult(b, 'R1-M2', 'home'); // #CLAN4 gagne → place « away » du R2-M1

    expect(match(b, 'R2-M1')).toMatchObject({ home: { tag: '#CLAN8' }, away: { tag: '#CLAN4' } });
  });

  it('ne modifie jamais l’arbre reçu', () => {
    const before = createBracket(clans(4), noShuffle);
    const after = recordResult(before, 'R1-M1', 'home');

    expect(match(before, 'R1-M1').status).toBe('pending');
    expect(match(after, 'R1-M1').status).toBe('done');
  });

  it('va jusqu’au champion', () => {
    let b = createBracket(clans(4), noShuffle); // R1 : 1-4, 2-3
    b = recordResult(b, 'R1-M1', 'home');
    b = recordResult(b, 'R1-M2', 'away');
    expect(championOf(b)).toBeNull();

    b = recordResult(b, 'R2-M1', 'away');
    expect(championOf(b)?.tag).toBe('#CLAN3');
  });

  it('autorise une correction tant que le match suivant n’est pas joué', () => {
    let b = createBracket(clans(4), noShuffle);
    b = recordResult(b, 'R1-M1', 'home');
    b = recordResult(b, 'R1-M1', 'away'); // l'arbitre corrige

    expect(match(b, 'R2-M1').home?.tag).toBe('#CLAN4');
  });

  it('refuse une correction une fois le match suivant joué', () => {
    let b = createBracket(clans(4), noShuffle);
    b = recordResult(b, 'R1-M1', 'home');
    b = recordResult(b, 'R1-M2', 'home');
    b = recordResult(b, 'R2-M1', 'home');

    expect(() => recordResult(b, 'R1-M1', 'away')).toThrow('déjà joué');
  });

  it('refuse un résultat pour un match qui n’a pas encore ses deux clans', () => {
    const b = createBracket(clans(4), noShuffle);
    expect(() => recordResult(b, 'R2-M1', 'home')).toThrow('pas encore ses deux clans');
  });
});

describe('roundLabel', () => {
  it('nomme les tours depuis la finale', () => {
    expect([1, 2, 3, 4].map((r) => roundLabel(r, 4))).toEqual([
      'Huitièmes de finale',
      'Quarts de finale',
      'Demi-finales',
      'Finale',
    ]);
  });
});

describe('startMatch', () => {
  it('passe un match prêt en « en cours », sans toucher aux autres', () => {
    const b = startMatch(createBracket(clans(4), noShuffle), 'R1-M1');
    expect(match(b, 'R1-M1').status).toBe('live');
    expect(match(b, 'R1-M2').status).toBe('pending');
  });

  it('un match en cours peut recevoir son résultat', () => {
    let b = startMatch(createBracket(clans(4), noShuffle), 'R1-M1');
    b = recordResult(b, 'R1-M1', 'home');
    expect(match(b, 'R1-M1').status).toBe('done');
  });

  it('refuse de démarrer un match incomplet ou déjà commencé', () => {
    const b = createBracket(clans(4), noShuffle);
    expect(() => startMatch(b, 'R2-M1')).toThrow('pas encore ses deux clans');
    expect(() => startMatch(startMatch(b, 'R1-M1'), 'R1-M1')).toThrow('pas en attente');
  });
});

describe('roundShortLabel', () => {
  it('donne les libellés courts des colonnes', () => {
    expect([1, 2, 3, 4].map((r) => roundShortLabel(r, 4))).toEqual([
      'Huitièmes',
      'Quarts',
      'Demis',
      'Finale',
    ]);
  });
});

describe('currentRound et liveMatch', () => {
  it('le tour en cours avance avec les résultats', () => {
    let b = createBracket(clans(4), noShuffle);
    expect(currentRound(b)).toBe(1);
    b = recordResult(b, 'R1-M1', 'home');
    b = recordResult(b, 'R1-M2', 'home');
    expect(currentRound(b)).toBe(2);
    b = recordResult(b, 'R2-M1', 'home');
    expect(currentRound(b)).toBe(2); // tout est joué : on reste sur la finale
  });

  it('trouve le match en cours, ou rien', () => {
    const b = createBracket(clans(4), noShuffle);
    expect(liveMatch(b)).toBeNull();
    expect(liveMatch(startMatch(b, 'R1-M2'))?.id).toBe('R1-M2');
  });
});

describe('bracketFromSeeds', () => {
  it('le 1er clan est la tête de série n° 1 : il affronte la dernière', () => {
    const b = bracketFromSeeds(clans(8));
    expect([b.matches[0].home?.name, b.matches[0].away?.name]).toEqual(['Clan 1', 'Clan 8']);
  });

  it('createBracket = mélange puis bracketFromSeeds (même hasard, même arbre)', () => {
    const fixedRandom = () => {
      const values = [0.9, 0.1, 0.6, 0.3];
      return () => values.shift() ?? 0;
    };
    expect(createBracket(clans(5), fixedRandom())).toEqual(
      bracketFromSeeds(shuffle(clans(5), fixedRandom())),
    );
  });
});

describe('isResultEditable', () => {
  it('match prêt, en cours, ou joué avec le suivant pas encore joué : oui', () => {
    let b = bracketFromSeeds(clans(4));
    expect(isResultEditable(b, b.matches[0])).toBe(true);
    b = startMatch(b, 'R1-M1');
    expect(isResultEditable(b, b.matches[0])).toBe(true);
    b = recordResult(b, 'R1-M1', 'home');
    expect(isResultEditable(b, b.matches[0])).toBe(true);
  });

  it('match incomplet, exempt, ou dont le suivant est joué : non', () => {
    const five = bracketFromSeeds(clans(5));
    expect(
      isResultEditable(
        five,
        five.matches.find((m) => m.status === 'bye')!,
      ),
    ).toBe(false);
    expect(isResultEditable(five, five.matches.at(-1)!)).toBe(false); // finale sans ses clans

    let b = bracketFromSeeds(clans(4));
    b = recordResult(b, 'R1-M1', 'home');
    b = recordResult(b, 'R1-M2', 'home');
    b = recordResult(b, 'R2-M1', 'away');
    expect(isResultEditable(b, b.matches[0])).toBe(false);
    expect(isResultEditable(b, b.matches[2])).toBe(true); // la finale reste corrigeable
  });
});
