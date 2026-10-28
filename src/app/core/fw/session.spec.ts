import {
  DEFAULT_DETAILS,
  drawTeams,
  parisClock,
  sessionClocks,
  sessionPosterQuery,
  smallerTeam,
} from './session';

describe('soirée FW : horaires, fiche, équipes', () => {
  it('fin des inscriptions H − 15, équipes H − 10, heure de Paris', () => {
    // 21h00 à Paris, l'hiver = 20h00 UTC.
    expect(sessionClocks(Date.UTC(2026, 9, 28, 20))).toEqual({
      close: '20h45',
      teams: '20h50',
      start: '21h00',
    });
    expect(parisClock(Date.UTC(2026, 6, 1, 18, 5))).toBe('20h05'); // été : UTC+2
  });

  it('adresse de la fiche : toutes les infos', () => {
    const q = new URLSearchParams(
      sessionPosterQuery({
        number: 41,
        date: '28/10',
        time: '21H00',
        mode: 'libre',
        details: DEFAULT_DETAILS,
      }),
    );
    expect(q.get('n')).toBe('41');
    expect(q.get('m')).toBe('libre');
    expect(q.get('f')).toBe('HDV 18 mode e-sport');
    expect(q.get('t')).toBe('HDV 17 et HDV 16 acceptés');
  });

  it('tirage : tout le monde a une équipe, écart d’un joueur au plus', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const teams = drawTeams(['a', 'b', 'c', 'd', 'e'], random);
    const count = (t: string) => [...teams.values()].filter((x) => x === t).length;
    expect(teams.size).toBe(5);
    expect(count('violet')).toBe(3);
    expect(count('vert')).toBe(2);
  });

  it('arrivée en cours de route : l’équipe la moins remplie', () => {
    expect(smallerTeam(5, 4, () => 0)).toBe('vert');
    expect(smallerTeam(3, 6, () => 0.9)).toBe('violet');
    expect(smallerTeam(4, 4, () => 0.9)).toBe('vert');
  });
});
