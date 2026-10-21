import { SideScore } from './models';
import { decideWinner } from './war-result';

const score = (stars: number, destruction: number, totalDurationSec: number): SideScore => ({
  stars,
  destruction,
  totalDurationSec,
});

describe('decideWinner', () => {
  it('le plus d’étoiles l’emporte, même avec moins de destruction', () => {
    expect(decideWinner(score(13, 80, 900), score(12, 99, 600))).toBe('home');
  });

  it('à égalité d’étoiles, le meilleur pourcentage l’emporte', () => {
    expect(decideWinner(score(12, 91.5, 900), score(12, 93.2, 950))).toBe('away');
  });

  it('à égalité d’étoiles et de pourcentage, le plus rapide l’emporte', () => {
    expect(decideWinner(score(15, 100, 812), score(15, 100, 845))).toBe('home');
  });

  it('égalité parfaite : pas de vainqueur, les arbitres tranchent', () => {
    expect(decideWinner(score(15, 100, 800), score(15, 100, 800))).toBeNull();
  });
});
