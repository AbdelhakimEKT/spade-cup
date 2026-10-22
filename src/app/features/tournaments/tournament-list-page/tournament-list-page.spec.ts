import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SITE_CONFIG } from '../../../core/site-config';
import { TournamentListPage } from './tournament-list-page';

async function open() {
  TestBed.configureTestingModule({
    imports: [TournamentListPage],
    providers: [provideRouter([]), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(TournamentListPage);
  // Pas de `whenStable()` ici : il attendrait la fin de la requête HTTP, or
  // c'est le test qui y répondra. `tick()` affiche la page et lance la requête.
  TestBed.tick();
  const reply = async (body: object) => {
    TestBed.inject(HttpTestingController)
      .expectOne(`${SITE_CONFIG.apiUrl}/tournaments`)
      .flush(body);
    await fixture.whenStable();
  };
  return { el: fixture.nativeElement as HTMLElement, reply };
}

describe('TournamentListPage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('liste les tournois reçus du serveur, avec un lien vers chacun', async () => {
    const { el, reply } = await open();
    await reply([
      {
        slug: 'demo',
        name: 'Tournoi de démonstration',
        status: 'running',
        clanCount: 16,
        isDemo: true,
      },
    ]);

    const link = el.querySelector<HTMLAnchorElement>('a[href="/tournois/demo"]');
    expect(link?.textContent).toContain('Tournoi de démonstration');
    expect(link?.textContent).toContain('16 clans');
    expect(link?.textContent).toContain('Démo');
    expect(link?.textContent).toContain('En cours');
  });

  it('aucun tournoi : un message plutôt qu’une liste vide', async () => {
    const { el, reply } = await open();
    await reply([]);
    expect(el.textContent).toContain('Aucun tournoi pour le moment.');
  });
});
