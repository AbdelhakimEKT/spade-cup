import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApplicationRef, signal } from '@angular/core';
import { SITE_CONFIG } from '../../../core/site-config';
import { DEMO_TOURNAMENT } from './demo-tournament';
import { Tournaments } from './tournaments';

/**
 * `provideHttpClientTesting()` remplace le vrai réseau par un faux serveur
 * piloté par le test : aucune requête ne sort, et c'est le test qui décide de
 * la réponse (`flush`) au moment où il le veut.
 */
describe('Tournaments', () => {
  let http: HttpTestingController;
  let service: Tournaments;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(Tournaments);
  });

  // Échoue si une requête est partie sans que le test l'ait attendue.
  afterEach(() => http.verify());

  /** Une ressource se crée dans un « contexte d'injection », comme dans un composant. */
  const create = <T>(fn: () => T) => TestBed.runInInjectionContext(fn);

  it('liste : GET /tournaments', async () => {
    const list = create(() => service.list());
    TestBed.tick(); // laisse la ressource lancer sa requête

    http.expectOne(`${SITE_CONFIG.apiUrl}/tournaments`).flush([
      {
        slug: 'demo',
        name: 'Tournoi de démonstration',
        status: 'running',
        clanCount: 16,
        isDemo: true,
      },
    ]);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(list.value()?.[0].clanCount).toBe(16);
  });

  it('tournoi : GET /tournaments/:slug, relancé quand le slug change', async () => {
    const slug = signal('demo');
    const tournament = create(() => service.bySlug(slug));
    TestBed.tick();
    http.expectOne(`${SITE_CONFIG.apiUrl}/tournaments/demo`).flush(DEMO_TOURNAMENT);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(tournament.value()?.name).toBe('Tournoi de démonstration');

    slug.set('coupe-d-hiver');
    TestBed.tick();
    http.expectOne(`${SITE_CONFIG.apiUrl}/tournaments/coupe-d-hiver`);
  });

  it('encode le slug : une adresse bizarre ne peut pas viser une autre route', () => {
    create(() => service.bySlug(() => '../health'));
    TestBed.tick();
    http.expectOne(`${SITE_CONFIG.apiUrl}/tournaments/..%2Fhealth`);
  });
});
