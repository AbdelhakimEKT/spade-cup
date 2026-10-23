import { ClanRun } from '../../core/tournament/stats';
import { match } from '../../../testing/fixtures';
import { BracketMatch } from '../../core/tournament/models';
import { outcomeLabel, starsPerAttack, verdict } from './labels';

const run = (outcome: ClanRun['outcome'], round: number): ClanRun => ({
  tournament: { slug: 'cup', name: 'Cup', status: 'running', isDemo: false },
  outcome,
  round,
  roundCount: 4,
});

describe('outcomeLabel', () => {
  it.each([
    [run('champion', 4), 'Champion'],
    [run('eliminated', 4), 'Finaliste'],
    [run('eliminated', 2), 'Éliminé en quarts de finale'],
    [run('alive', 3), 'En lice : demi-finales'],
    [run('registered', 0), 'Inscrit, tirage à venir'],
  ])('%o → « %s »', (r, label) => {
    expect(outcomeLabel(r)).toBe(label);
  });
});

describe('starsPerAttack', () => {
  it('arrondit à deux décimales, et 0 sans attaque', () => {
    expect(starsPerAttack(7, 3)).toBe(2.33);
    expect(starsPerAttack(0, 0)).toBe(0);
  });
});

describe('verdict', () => {
  const done = (
    home: [number, number, number],
    away: [number, number, number],
    winner: 'home' | 'away',
  ): BracketMatch => ({
    ...match('R1-M1'),
    status: 'done',
    winner,
    score: {
      home: { stars: home[0], destruction: home[1], totalDurationSec: home[2] },
      away: { stars: away[0], destruction: away[1], totalDurationSec: away[2] },
    },
  });

  it('dit comment le match a été gagné', () => {
    expect(verdict(done([13, 90, 600], [11, 95, 500], 'home'))).toBe('Victoire aux étoiles.');
    expect(verdict(done([12, 90, 600], [12, 88, 500], 'home'))).toContain('au pourcentage');
    expect(verdict(done([12, 90, 500], [12, 90, 600], 'home'))).toContain('au temps');
  });

  it('vainqueur contraire au score, ou sans score : décision des arbitres', () => {
    expect(verdict(done([13, 90, 600], [11, 95, 500], 'away'))).toBe(
      'Vainqueur désigné par les arbitres.',
    );
    expect(verdict({ ...match('R1-M1'), score: null })).toBe('Vainqueur désigné par les arbitres.');
  });

  it('matchs pas encore joués', () => {
    expect(verdict(match('R2-M1'))).toBe('Guerre amicale en cours.');
    expect(verdict(match('R2-M2'))).toBe('Pas encore joué.');
    expect(verdict(match('R3-M1'))).toBe('En attente des deux clans.');
    expect(verdict({ ...match('R1-M1'), status: 'bye' })).toContain("Qualifié d'office");
  });
});
