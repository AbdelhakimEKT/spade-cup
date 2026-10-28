import { qrPath } from './qr-code';

describe('QR code', () => {
  it('une adresse donne un carré de cases, avec sa marge', () => {
    const { size, path } = qrPath('https://spade-cup.popi-coc.workers.dev/joueurs/G2JUG2YVR');
    // Version 3 ou 4 (29 ou 33 cases) + 2 × 2 cases de marge.
    expect([33, 37]).toContain(size);
    expect(path.startsWith('M2 2h1v1h-1z')).toBe(true); // coin du motif de repérage
  });
});
