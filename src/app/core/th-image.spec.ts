import { thImageSrc } from './th-image';

describe('image d’un HDV', () => {
  it('HDV 9 à 19 : la sienne ; HDV 20 (pas encore d’image) : celle du 19 ; trop bas : aucune', () => {
    expect(thImageSrc(19)).toBe('th/th19.webp');
    expect(thImageSrc(18)).toBe('th/th18.webp');
    expect(thImageSrc(9)).toBe('th/th9.webp');
    expect(thImageSrc(20)).toBe('th/th19.webp');
    expect(thImageSrc(8)).toBeNull();
    expect(thImageSrc(null)).toBeNull();
    expect(thImageSrc(Number.NaN)).toBeNull();
  });
});
