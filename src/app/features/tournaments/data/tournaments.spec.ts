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

  describe('le tournoi de démonstration', () => {
    const bracket = () => service.bySlug('demo')!.bracket!;
    const match = (id: string) => bracket().matches.find((m) => m.id === id)!;

    it('16 clans, donc il commence en huitièmes, avec les affiches de la maquette', () => {
      expect(bracket().roundCount).toBe(4);
      expect([match('R1-M1').home?.name, match('R1-M1').away?.name]).toEqual([
        'Les Pikachus',
        'Titans FR',
      ]);
      expect(match('R1-M8').away?.name).toBe('Nova');
    });

    it('huitièmes joués, un quart en cours, pas encore de champion', () => {
      expect(
        bracket()
          .matches.filter((m) => m.round === 1)
          .every((m) => m.status === 'done'),
      ).toBe(true);
      expect(match('R2-M1').status).toBe('live');
      expect(championOf(bracket())).toBeNull();
    });

    it('applique la règle du pourcentage quand les étoiles sont à égalité', () => {
      expect(match('R1-M3').winner).toBe('home'); // Vega, 89,6 % contre 87,1 %
    });

    it('le vainqueur du quart déjà joué est qualifié en demi-finale', () => {
      expect(match('R3-M2').home?.name).toBe('Zéphyr');
    });
  });
});
