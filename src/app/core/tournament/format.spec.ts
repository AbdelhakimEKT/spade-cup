import { formatDuration, parseDuration, slugify } from './format';

describe('slugify', () => {
  it.each([
    ["Coupe d'Hiver 2026 !", 'coupe-d-hiver-2026'],
    ['  Éclair   Électrique  ', 'eclair-electrique'],
    ['Spade Cup #3', 'spade-cup-3'],
    ['ÇA PIQUE', 'ca-pique'],
    ['!!!', ''],
  ])('« %s » → « %s »', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('60 caractères au plus, sans tiret final', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('formatDuration', () => {
  it.each([
    [845, '14 min 05 s'],
    [60, '1 min 00 s'],
    [0, '0 min 00 s'],
  ])('%i s → « %s »', (sec, text) => {
    expect(formatDuration(sec)).toBe(text);
  });
});

describe('parseDuration', () => {
  it.each([
    ['14:05', 845],
    ['14m05', 845],
    ['14 min 05 s', 845],
    ['845', 845],
    [' 2:5 ', 125],
  ])('« %s » → %i s', (text, sec) => {
    expect(parseDuration(text)).toBe(sec);
  });

  it.each(['vite', '14:75', '', '1:2:3'])('« %s » → illisible', (text) => {
    expect(parseDuration(text)).toBeNull();
  });
});
