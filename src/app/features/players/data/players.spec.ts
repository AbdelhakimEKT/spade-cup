import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SITE_CONFIG } from '../../../core/site-config';
import { Clans } from '../../clans/data/clans';
import { Tournaments } from '../../tournaments/data/tournaments';
import { Players } from './players';

/** Les adresses appelées par chaque service : le contrat avec le serveur. */
describe('services de statistiques', () => {
  let http: HttpTestingController;
  const api = SITE_CONFIG.apiUrl;
  const create = <T>(fn: () => T) => TestBed.runInInjectionContext(fn);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('classement : tous les tournois, puis un seul quand le filtre change', () => {
    const tournament = signal<string | null>(null);
    create(() => TestBed.inject(Players).ranking(tournament));
    TestBed.tick();
    http.expectOne(`${api}/players`);

    tournament.set('coupe-d-hiver');
    TestBed.tick();
    http.expectOne(`${api}/players?tournament=coupe-d-hiver`);
  });

  it('fiche joueur et fiche clan : le tag de l’URL, encodé', () => {
    create(() => TestBed.inject(Players).profile(() => 'D1P1'));
    create(() => TestBed.inject(Clans).profile(() => 'DEMO1'));
    TestBed.tick();
    http.expectOne(`${api}/players/D1P1`);
    http.expectOne(`${api}/clans/DEMO1`);
  });

  it('détail d’un match', () => {
    create(() =>
      TestBed.inject(Tournaments).match(
        () => 'demo',
        () => 'R1-M3',
      ),
    );
    TestBed.tick();
    http.expectOne(`${api}/tournaments/demo/matches/R1-M3`);
  });

  it('tournoi sans slug : la ressource reste au repos, aucune requête', () => {
    const resource = create(() => TestBed.inject(Tournaments).bySlug(() => null));
    TestBed.tick();
    http.expectNone(() => true);
    expect(resource.status()).toBe('idle');
  });
});
