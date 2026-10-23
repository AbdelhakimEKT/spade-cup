import { TOURNAMENT_RULES } from '../../../core/tournament/models';
import { DEMO_MATCH_PLAYERS } from './demo-players';
import { DEMO_TOURNAMENT } from './demo-tournament';

/**
 * Les joueurs de la démo sont fabriqués : ces tests vérifient qu'ils restent
 * crédibles et cohérents avec les scores affichés dans l'arbre.
 */
describe('joueurs de la démo', () => {
  const played = DEMO_TOURNAMENT.bracket!.matches.filter((m) => m.status === 'done');

  it('chaque match joué a 5 joueurs par camp, tous HDV 18', () => {
    expect([...DEMO_MATCH_PLAYERS.keys()]).toEqual(played.map((m) => m.id));
    for (const lines of DEMO_MATCH_PLAYERS.values()) {
      expect(lines.filter((l) => l.side === 'home')).toHaveLength(TOURNAMENT_RULES.teamSize);
      expect(lines.filter((l) => l.side === 'away')).toHaveLength(TOURNAMENT_RULES.teamSize);
      expect(lines.every((l) => l.townHall === 18)).toBe(true);
    }
  });

  it('étoiles, destruction et temps des joueurs = ceux du clan', () => {
    for (const m of played) {
      const lines = DEMO_MATCH_PLAYERS.get(m.id)!;
      for (const side of ['home', 'away'] as const) {
        const mine = lines.filter((l) => l.side === side);
        const score = m.score![side];
        expect(
          mine.reduce((s, l) => s + l.stars, 0),
          m.id,
        ).toBe(score.stars);
        expect(mine.reduce((s, l) => s + l.destruction, 0) / mine.length, m.id).toBeCloseTo(
          score.destruction,
          5,
        );
        expect(
          mine.reduce((s, l) => s + l.durationSec, 0),
          m.id,
        ).toBe(score.totalDurationSec);
      }
    }
  });

  it('chaque attaque est possible dans le jeu', () => {
    for (const line of [...DEMO_MATCH_PLAYERS.values()].flat()) {
      expect(line.stars).toBeGreaterThanOrEqual(0);
      expect(line.stars).toBeLessThanOrEqual(3);
      // 3 étoiles = 100 % ; 1 ou 2 étoiles = au moins 50 % (sans l'hôtel de ville) et moins de 100 %.
      if (line.stars === 3) expect(line.destruction).toBe(100);
      else {
        expect(line.destruction).toBeGreaterThanOrEqual(50);
        expect(line.destruction).toBeLessThan(100);
      }
      expect(line.durationSec).toBeGreaterThan(0);
      expect(line.durationSec).toBeLessThanOrEqual(180); // 3 minutes par attaque
    }
  });

  it('un clan garde les mêmes joueurs d’un match à l’autre, et tous les pseudos sont uniques', () => {
    // Zéphyr joue le huitième R1-M5 puis le quart R2-M3, à domicile les deux fois.
    const tags = (id: string) =>
      DEMO_MATCH_PLAYERS.get(id)!
        .filter((l) => l.side === 'home')
        .map((l) => l.tag);
    expect(tags('R2-M3')).toEqual(tags('R1-M5'));

    const all = new Map([...DEMO_MATCH_PLAYERS.values()].flat().map((l) => [l.tag, l.name]));
    expect(all.size).toBe(80);
    expect(new Set(all.values()).size).toBe(80);
  });
});
