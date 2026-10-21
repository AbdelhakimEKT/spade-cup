import { TestBed } from '@angular/core/testing';
import { championOf } from '../../../core/tournament/bracket';
import { Tournaments } from './tournaments';

describe('Tournaments', () => {
  let service: Tournaments;

  beforeEach(() => {
    service = TestBed.inject(Tournaments);
  });

  it('trouve un tournoi par son slug, et renvoie null sinon', () => {
    expect(service.bySlug('demo')?.name).toBe('Tournoi de démonstration');
    expect(service.bySlug('inconnu')).toBeNull();
  });

  it('la démo est un tournoi en cours : premier tour joué, pas encore de champion', () => {
    const bracket = service.bySlug('demo')!.bracket!;

    expect(bracket.matches.filter((m) => m.round === 1).every((m) => m.status === 'done')).toBe(
      true,
    );
    expect(championOf(bracket)).toBeNull();
  });

  it('la démo applique la règle du temps quand étoiles et pourcentage sont à égalité', () => {
    const match = service.bySlug('demo')!.bracket!.matches.find((m) => m.id === 'R1-M3')!;
    expect(match.winner).toBe('home'); // 760 s contre 798 s
  });
});
