import { REAL_FRIENDLY_WAR } from '../../../testing/real-friendly-war';
import { decideWinner } from './war-result';
import { CocWar, CocWarClan, readFriendlyWar } from './coc-war';
import { ClanRef } from './models';

const HOME: ClanRef = { tag: '#2PPP', name: 'Les Pikachus' };
const AWAY: ClanRef = { tag: '#2QQQ', name: 'Titans FR' };

/** Un camp de 5 joueurs ; `attacks[i]` = [étoiles, %, secondes] ou null (pas attaqué). */
function side(
  clan: ClanRef,
  attacks: ([number, number, number] | null)[],
  townHalls: number[] = [18, 18, 18, 18, 18],
): CocWarClan {
  return {
    tag: clan.tag,
    name: clan.name,
    stars: attacks.reduce((sum, a) => sum + (a?.[0] ?? 0), 0),
    destructionPercentage: 88.456,
    members: attacks.map((a, i) => ({
      tag: `${clan.tag}-${i + 1}`,
      name: `${clan.name} ${i + 1}`,
      townhallLevel: townHalls[i],
      // Ordre volontairement mélangé : la lecture doit retrier par position.
      mapPosition: 5 - i,
      ...(a
        ? {
            attacks: [
              {
                attackerTag: `${clan.tag}-${i + 1}`,
                defenderTag: '#X',
                stars: a[0],
                destructionPercentage: a[1],
                duration: a[2],
              },
            ],
          }
        : {}),
    })),
  };
}

const ended = (clan: CocWarClan, opponent: CocWarClan, extra: Partial<CocWar> = {}): CocWar => ({
  state: 'warEnded',
  teamSize: 5,
  clan,
  opponent,
  ...extra,
});

const homeSide = side(HOME, [
  [3, 100, 120],
  [3, 100, 150],
  [2, 80, 180],
  [2, 70.5, 170],
  [1, 55, 180],
]);
const awaySide = side(AWAY, [[2, 90, 160], [2, 85, 175], [2, 60, 180], [1, 52, 180], null]);

describe('readFriendlyWar', () => {
  it('score de chaque camp : étoiles et % du jeu, temps = somme des attaques', () => {
    const reading = readFriendlyWar(ended(homeSide, awaySide), HOME, AWAY);
    if (!reading.ok) throw new Error(reading.reason);

    expect(reading.score.home).toEqual({ stars: 11, destruction: 88.5, totalDurationSec: 800 });
    expect(reading.score.away).toEqual({ stars: 7, destruction: 88.5, totalDurationSec: 695 });
    expect(reading.warnings).toEqual([]);
  });

  it('peu importe le côté interrogé : chaque camp est retrouvé par son tag', () => {
    const fromHome = readFriendlyWar(ended(homeSide, awaySide), HOME, AWAY);
    const fromAway = readFriendlyWar(ended(awaySide, homeSide), HOME, AWAY);
    // Même score, et joueurs toujours rangés « domicile » puis « extérieur ».
    expect(fromAway).toEqual(fromHome);
  });

  it('une ligne par joueur, triée par position, avec 0 attaque s’il n’a pas joué', () => {
    const reading = readFriendlyWar(ended(homeSide, awaySide), HOME, AWAY);
    if (!reading.ok) throw new Error(reading.reason);

    const home = reading.players.filter((p) => p.side === 'home');
    expect(home.map((p) => p.mapPosition)).toEqual([1, 2, 3, 4, 5]);
    expect(home[4]).toMatchObject({
      name: 'Les Pikachus 1',
      stars: 3,
      triples: 1,
      destruction: 100,
    });

    const lazy = reading.players.find((p) => p.side === 'away' && p.attacks === 0)!;
    expect(lazy).toMatchObject({ stars: 0, destruction: 0, triples: 0, durationSec: 0 });
  });

  it('deux attaques par joueur : étoiles additionnées, destruction moyenne', () => {
    const twoAttacks: CocWarClan = {
      ...homeSide,
      members: [
        {
          tag: '#P1',
          name: 'Double',
          townhallLevel: 18,
          mapPosition: 1,
          attacks: [
            {
              attackerTag: '#P1',
              defenderTag: '#A',
              stars: 3,
              destructionPercentage: 100,
              duration: 100,
            },
            {
              attackerTag: '#P1',
              defenderTag: '#B',
              stars: 2,
              destructionPercentage: 75,
              duration: 150,
            },
          ],
        },
      ],
    };
    const reading = readFriendlyWar(ended(twoAttacks, awaySide), HOME, AWAY);
    if (!reading.ok) throw new Error(reading.reason);
    expect(reading.players[0]).toMatchObject({
      attacks: 2,
      stars: 5,
      destruction: 87.5,
      triples: 1,
      durationSec: 250,
    });
  });

  it('HDV autre que 18, ou guerre qui n’est pas en 5 contre 5 : signalé, mais lu', () => {
    const th17 = side(HOME, [[3, 100, 100], null, null, null, null], [17, 18, 18, 18, 18]);
    const reading = readFriendlyWar(ended(th17, awaySide, { teamSize: 6 }), HOME, AWAY);
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    expect(reading.warnings).toEqual([
      'Guerre en 6 contre 6 (le règlement impose 5 contre 5).',
      'Les Pikachus 1 (Les Pikachus) est HDV 17.',
    ]);
  });

  it.each([
    ['preparation', 'jour de préparation'],
    ['inWar', 'guerre en cours'],
  ] as const)('guerre pas finie (%s) : refusée', (state, label) => {
    const reading = readFriendlyWar(ended(homeSide, awaySide, { state }), HOME, AWAY);
    expect(reading).toEqual({
      ok: false,
      reason: `La guerre n'est pas finie (${label}). Relance la commande à la fin.`,
    });
  });

  it('aucune guerre : refusée', () => {
    expect(readFriendlyWar({ state: 'notInWar' }, HOME, AWAY)).toEqual({
      ok: false,
      reason: "Le jeu n'indique aucune guerre récente pour Les Pikachus.",
    });
  });

  it('guerre contre un autre clan : refusée, avec les noms pour comprendre', () => {
    const stranger = side({ tag: '#2YYY', name: 'Inconnus' }, [null, null, null, null, null]);
    const reading = readFriendlyWar(ended(homeSide, stranger), HOME, AWAY);
    expect(reading).toEqual({
      ok: false,
      reason:
        'La dernière guerre trouvée oppose Les Pikachus à Inconnus, pas Les Pikachus à Titans FR.',
    });
  });
});

describe('readFriendlyWar sur une VRAIE réponse du jeu', () => {
  const blue = { tag: '#2JVUP2PGC', name: 'Clan Bleu' };
  const red = { tag: '#2CYJPRCG8', name: 'Clan Rouge' };

  it('score, vainqueur et 20 joueurs, comme le jeu les affiche', () => {
    const reading = readFriendlyWar(REAL_FRIENDLY_WAR, blue, red);
    if (!reading.ok) throw new Error(reading.reason);

    expect(reading.score.home).toEqual({ stars: 13, destruction: 53.4, totalDurationSec: 1053 });
    expect(reading.score.away).toEqual({ stars: 11, destruction: 46.4, totalDurationSec: 1099 });
    expect(decideWinner(reading.score.home, reading.score.away)).toBe('home');
    expect(reading.players).toHaveLength(20);
    // Joueurs qui n'ont pas attaqué : présents, avec 0 partout.
    expect(reading.players.filter((p) => p.attacks === 0)).toHaveLength(6);
  });

  it('cette guerre de test n’était pas au règlement : tout est signalé', () => {
    const reading = readFriendlyWar(REAL_FRIENDLY_WAR, blue, red);
    if (!reading.ok) throw new Error(reading.reason);
    expect(reading.warnings[0]).toBe('Guerre en 10 contre 10 (le règlement impose 5 contre 5).');
    expect(reading.warnings.filter((w) => w.includes(' est HDV '))).toHaveLength(8);
  });

  it('même résultat quand on interroge le clan adverse', () => {
    const swapped = {
      ...REAL_FRIENDLY_WAR,
      clan: REAL_FRIENDLY_WAR.opponent,
      opponent: REAL_FRIENDLY_WAR.clan,
    };
    expect(readFriendlyWar(swapped, blue, red)).toEqual(
      readFriendlyWar(REAL_FRIENDLY_WAR, blue, red),
    );
  });
});
