import { isValidTag, normalizeTag, tagToUrl } from './tags';

describe('tags', () => {
  it('normalise la saisie : majuscules, « # », espaces, et O → zéro', () => {
    expect(normalizeTag('2ju0grg98')).toBe('#2JU0GRG98');
    expect(normalizeTag(' #2JUOGRG98 ')).toBe('#2JU0GRG98');
    expect(normalizeTag('# 2JU0 GRG98')).toBe('#2JU0GRG98');
  });

  it('reconnaît un tag valide et refuse les caractères hors alphabet', () => {
    expect(isValidTag('#2JU0GRG98')).toBe(true);
    expect(isValidTag('#2JU0GRG9A')).toBe(false); // A n'existe pas dans l'alphabet
    expect(isValidTag('2JU0GRG98')).toBe(false); // il manque le #
  });

  it('retire le « # » pour les URL', () => {
    expect(tagToUrl('#2JU0GRG98')).toBe('2JU0GRG98');
  });
});
