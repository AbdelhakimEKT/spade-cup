import {
  isMonth,
  monthLabel,
  monthOf,
  monthRange,
  isMonday,
  previousWeek,
  rankPlayers,
  weekLabel,
  weekOf,
  weekRange,
  type FwLine,
} from './evening';

const line = (
  tag: string,
  stars: number,
  attacks = 1,
  destruction = 90,
  duration = 150,
): FwLine => ({
  tag,
  name: `Joueur ${tag}`,
  attacks,
  stars,
  destructionSum: destruction * attacks,
  duration: duration * attacks,
});

describe('classement d’une soirée FW', () => {
  it('au prorata : étoiles par attaque, pas le total', () => {
    const ranked = rankPlayers([
      // A : 4 FW à 2 étoiles (8 étoiles) ; B : 2 FW à 3 étoiles (6 étoiles), venu en cours de route.
      ...[1, 2, 3, 4].map(() => line('#A', 2)),
      line('#B', 3),
      line('#B', 3),
    ]);
    expect(ranked.map((p) => [p.tag, p.starsPerAttack])).toEqual([
      ['#B', 3],
      ['#A', 2],
    ]);
    expect(ranked[1]).toMatchObject({ attacks: 4, stars: 8, destruction: 90 });
  });

  it('égalité : la destruction moyenne, puis le plus rapide', () => {
    const ranked = rankPlayers([
      line('#LENT', 3, 2, 100, 170),
      line('#VITE', 3, 2, 100, 120),
      line('#MOINS', 3, 2, 98, 60),
    ]);
    expect(ranked.map((p) => p.tag)).toEqual(['#VITE', '#LENT', '#MOINS']);
  });

  it('une attaque suffit ; les comptes sans attaque ne sont pas classés', () => {
    expect(
      rankPlayers([line('#UNE', 3), line('#DEUX', 2), line('#DEUX', 2), line('#ZERO', 0, 0)]).map(
        (p) => p.tag,
      ),
    ).toEqual(['#UNE', '#DEUX']);
    // Avec un minimum (le top de la semaine) : seulement ceux qui l'atteignent.
    expect(
      rankPlayers([line('#UNE', 3), line('#DEUX', 2), line('#DEUX', 2)], 2).map((p) => p.tag),
    ).toEqual(['#DEUX']);
  });
});

describe('semaines FW (lundi → lundi, heure de Paris)', () => {
  it('le lundi de la semaine', () => {
    // Mercredi 28/10/2026 à 21 h (Paris) → lundi 26/10.
    expect(weekOf(Date.UTC(2026, 9, 28, 20))).toBe('2026-10-26');
    // Dimanche 01/11 à 23 h 30 (Paris) = 22 h 30 UTC : encore la même semaine.
    expect(weekOf(Date.UTC(2026, 10, 1, 22, 30))).toBe('2026-10-26');
    // Lundi 02/11 à 0 h 30 (Paris) = dimanche 23 h 30 UTC : la semaine suivante.
    expect(weekOf(Date.UTC(2026, 10, 1, 23, 30))).toBe('2026-11-02');
  });

  it('début et fin à minuit, heure de Paris (changement d’heure compris)', () => {
    // Semaine du 19/10 : commence à l'heure d'été (UTC+2), finit à l'heure d'hiver (UTC+1).
    const { start, end } = weekRange('2026-10-19');
    expect(new Date(start).toISOString()).toBe('2026-10-18T22:00:00.000Z');
    expect(new Date(end).toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('semaine précédente, lundi valide, libellé', () => {
    expect(previousWeek('2026-11-02')).toBe('2026-10-26');
    expect(isMonday('2026-10-26')).toBe(true);
    expect(isMonday('2026-10-27')).toBe(false);
    expect(isMonday('2026-13-01')).toBe(false);
    expect(weekLabel('2026-10-26')).toBe('du 26/10 au 01/11');
  });
});

describe('mois FW (heure de Paris)', () => {
  it('le mois, ses limites, son nom', () => {
    // Le 31/10 à 23 h 30 à Paris (22 h 30 UTC) : encore octobre.
    expect(monthOf(Date.UTC(2026, 9, 31, 22, 30))).toBe('2026-10');
    expect(monthOf(Date.UTC(2026, 9, 31, 23, 30))).toBe('2026-11');
    const { start, end } = monthRange('2026-10');
    expect(new Date(start).toISOString()).toBe('2026-09-30T22:00:00.000Z'); // été
    expect(new Date(end).toISOString()).toBe('2026-10-31T23:00:00.000Z'); // hiver
    expect(monthLabel('2026-10')).toBe('octobre 2026');
    expect(isMonth('2026-10')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
  });
});
