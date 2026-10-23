import { clanColor, clanInitials } from './clan-visuals';

describe('clanInitials', () => {
  it('prend la première lettre de chaque mot, deux au maximum', () => {
    expect(clanInitials('Titans FR')).toBe('TF');
    expect(clanInitials('Orion')).toBe('O');
    expect(clanInitials('Spade Cup France')).toBe('SC');
  });

  it('ignore l’article en tête', () => {
    expect(clanInitials('Les Pikachus')).toBe('P');
    expect(clanInitials("L'Ordre")).toBe('O');
  });
});

describe('clanColor', () => {
  it('donne toujours la même couleur pour un même tag', () => {
    expect(clanColor('#2JU0GRG98')).toBe(clanColor('#2JU0GRG98'));
  });

  it('renvoie une couleur hexadécimale', () => {
    expect(clanColor('#Q8P9L2R')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
