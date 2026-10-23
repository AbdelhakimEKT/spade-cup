import { bracketFromSeeds, recordResult } from './bracket';
import { PlayerLine } from './coc-war';
import { ClanRef } from './models';
import { clanRecord, clanRun, totalsOf } from './stats';
import { Tournament } from './tournament';

const clans: ClanRef[] = ['A', 'B', 'C', 'D'].map((x) => ({ tag: `#${x}`, name: `Clan ${x}` }));

const tournament = (bracket: Tournament['bracket']): Tournament => ({
  slug: 'cup',
  name: 'Cup',
  status: 'running',
  organizer: 'Spade Cup FR',
  referees: [],
  rules: '',
  clans,
  bracket,
  isDemo: false,
});

const line = (stars: number, destruction: number, attacks = 1): PlayerLine => ({
  tag: '#P',
  name: 'P',
  side: 'home',
  townHall: 18,
  mapPosition: 1,
  attacks,
  stars,
  destruction,
  triples: stars === 3 ? 1 : 0,
  durationSec: 100,
});

describe('totalsOf', () => {
  it('additionne guerres, attaques, étoiles et triples', () => {
    const totals = totalsOf({ tag: '#P', name: 'P', clan: clans[0] }, [line(3, 100), line(2, 80)]);
    expect(totals).toMatchObject({ wars: 2, attacks: 2, stars: 5, triples: 1, destruction: 90 });
  });

  it('la destruction moyenne est pondérée par le nombre d’attaques', () => {
    // 1 attaque à 100 % + 2 attaques à 70 % de moyenne = 240 / 3 = 80 %.
    const totals = totalsOf({ tag: '#P', name: 'P', clan: clans[0] }, [
      line(3, 100),
      line(3, 70, 2),
    ]);
    expect(totals.destruction).toBe(80);
  });

  it('aucune attaque : 0 %, sans division par zéro', () => {
    const totals = totalsOf({ tag: '#P', name: 'P', clan: clans[0] }, [line(0, 0, 0)]);
    expect(totals).toMatchObject({ wars: 1, attacks: 0, destruction: 0 });
  });
});

describe('clanRun et clanRecord', () => {
  // A contre D et B contre C en demies (têtes de série 1-4, 2-3).
  const drawn = bracketFromSeeds(clans);
  const semis = recordResult(recordResult(drawn, 'R1-M1', 'home'), 'R1-M2', 'away');
  const final = recordResult(semis, 'R2-M1', 'home');

  it('avant le tirage : inscrit', () => {
    expect(clanRun(tournament(null), '#A')).toMatchObject({ outcome: 'registered', round: 0 });
  });

  it('qualifié pour un match pas encore joué : encore en lice', () => {
    expect(clanRun(tournament(semis), '#A')).toMatchObject({ outcome: 'alive', round: 2 });
  });

  it('battu : éliminé au tour de sa défaite', () => {
    expect(clanRun(tournament(semis), '#D')).toMatchObject({ outcome: 'eliminated', round: 1 });
    expect(clanRun(tournament(final), '#C')).toMatchObject({ outcome: 'eliminated', round: 2 });
  });

  it('vainqueur de la finale : champion', () => {
    expect(clanRun(tournament(final), '#A')).toMatchObject({
      outcome: 'champion',
      round: 2,
      roundCount: 2,
    });
  });

  it('bilan : les exempts ne comptent pas comme des matchs joués', () => {
    expect(clanRecord(tournament(final), '#A')).toEqual({ played: 2, won: 2, lost: 0 });
    expect(clanRecord(tournament(final), '#C')).toEqual({ played: 2, won: 1, lost: 1 });

    const withBye = bracketFromSeeds(clans.slice(0, 3)); // A est exempt
    expect(clanRecord(tournament(withBye), '#A')).toEqual({ played: 0, won: 0, lost: 0 });
  });
});
