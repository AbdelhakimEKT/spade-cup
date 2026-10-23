import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DEMO_TOURNAMENT } from '../../tournaments/data/demo-tournament';
import { player } from '../../../../testing/fixtures';
import { openPage } from '../../../../testing/open-page';
import { RankingPage } from './ranking-page';

describe('RankingPage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('tous les tournois : le classement reçu du serveur', async () => {
    const { el, reply } = await openPage(RankingPage);
    await reply('/players', [player(1), player(2, { stars: 5 })]);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el.querySelector('.filter')).toBeNull();
  });

  it('aucune guerre encore jouée : explique, et propose le classement de la démo', async () => {
    const { el, reply } = await openPage(RankingPage);
    await reply('/players', []);
    expect(el.textContent).toContain("Aucune guerre de tournoi n'a encore été jouée");
    expect(el.querySelector('a[href="/joueurs?tournoi=demo"]')).not.toBeNull();
  });

  it('?tournoi=demo : filtre affiché avec le nom du tournoi, et lien pour l’enlever', async () => {
    const { el, answer, reply } = await openPage(RankingPage, { tournoi: 'demo' });
    // Deux requêtes partent en même temps : le classement et le nom du tournoi.
    answer('/players?tournament=demo', [player(1)]);
    await reply('/tournaments/demo', DEMO_TOURNAMENT);
    expect(el.querySelector('.filter .chip')?.textContent).toBe(
      'Tournoi : Tournoi de démonstration',
    );
    expect(el.querySelector('.filter a')?.getAttribute('href')).toBe('/joueurs');
  });
});
