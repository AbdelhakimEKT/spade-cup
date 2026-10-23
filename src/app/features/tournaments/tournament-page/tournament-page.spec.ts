import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { SITE_CONFIG } from '../../../core/site-config';
import { DEMO_TOURNAMENT } from '../data/demo-tournament';
import { TournamentPage } from './tournament-page';

/** Ouvre la page sur /tournois/:slug ; le faux serveur attend notre réponse. */
async function open(slug: string) {
  TestBed.configureTestingModule({
    imports: [TournamentPage],
    providers: [provideRouter([]), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(TournamentPage);
  fixture.componentRef.setInput('slug', slug);
  // Pas de `whenStable()` ici : il attendrait la fin de la requête HTTP, or
  // c'est le test qui y répondra. `tick()` affiche la page et lance la requête.
  TestBed.tick();

  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const url = `${SITE_CONFIG.apiUrl}/tournaments/${slug}`;

  /**
   * Le serveur répond au tournoi et, en même temps, au classement de ses
   * joueurs (vide par défaut). On attend que la page ait fini de se redessiner.
   */
  const reply = async (body: object, status = 200, statusText = 'OK', players: object = []) => {
    http.expectOne(url).flush(body, { status, statusText });
    http.expectOne(`${SITE_CONFIG.apiUrl}/players?tournament=${slug}`).flush(players);
    await fixture.whenStable();
  };
  return { el, http, url, reply, fixture };
}

describe('TournamentPage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('pendant le chargement : un indicateur, pas encore de contenu', async () => {
    const { el, reply } = await open('demo');
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Chargement');
    expect(el.querySelector('h1')).toBeNull();
    await reply(DEMO_TOURNAMENT);
  });

  it('en-tête : nom, tour en cours, règles, mention « démo » et titre de l’onglet', async () => {
    const { el, reply } = await open('demo');
    await reply(DEMO_TOURNAMENT);

    expect(el.querySelector('h1')?.textContent).toBe('Tournoi de démonstration');
    expect(el.querySelector('.badge')?.textContent?.trim()).toBe('Quarts de finale');
    expect(el.querySelector('.meta')?.textContent).toContain('5 contre 5');
    expect(el.querySelector('.meta')?.textContent).toContain('HDV 18');
    expect(el.textContent).toContain('les clans et les scores sont fictifs');
    expect(TestBed.inject(Title).getTitle()).toBe('Tournoi de démonstration · Spade Cup FR');
  });

  it('met le match en cours à la une, puis affiche l’arbre', async () => {
    const { el, reply } = await open('demo');
    await reply(DEMO_TOURNAMENT);
    expect(el.querySelector('sc-featured-match')?.textContent).toContain('Les Pikachus');
    expect(el.querySelector('sc-bracket-view')).not.toBeNull();
  });

  it('404 du serveur : « introuvable » et lien vers la liste', async () => {
    const { el, reply } = await open('nexiste-pas');
    await reply({ error: 'Tournoi introuvable.' }, 404, 'Not Found');

    expect(el.querySelector('h1')?.textContent).toBe('Tournoi introuvable');
    expect(el.querySelector('a[href="/tournois"]')).not.toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('serveur en panne : message d’erreur, et « Réessayer » relance la requête', async () => {
    const { el, http, url, reply, fixture } = await open('demo');
    await reply({ error: 'Erreur interne.' }, 500, 'Internal Server Error');

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Le serveur ne répond pas');
    expect(el.textContent).not.toContain('introuvable');

    el.querySelector<HTMLButtonElement>('.retry')!.click();
    TestBed.tick();
    http.expectOne(url).flush(DEMO_TOURNAMENT);
    await fixture.whenStable();
    expect(el.querySelector('h1')?.textContent).toBe('Tournoi de démonstration');
  });

  it('meilleurs joueurs du tournoi : les 5 premiers, et un lien vers le classement complet', async () => {
    const { el, reply } = await open('demo');
    const players = Array.from({ length: 8 }, (_, i) => ({
      tag: `#P${i}`,
      name: `Joueur ${i}`,
      clan: { tag: '#DEMO1', name: 'Les Pikachus' },
      wars: 1,
      attacks: 1,
      stars: 3 - (i % 3),
      triples: i % 3 === 0 ? 1 : 0,
      destruction: 90,
    }));
    await reply(DEMO_TOURNAMENT, 200, 'OK', players);

    expect(el.querySelectorAll('sc-ranking-table tbody tr')).toHaveLength(5);
    expect(el.querySelector('a[href="/joueurs?tournoi=demo"]')?.textContent).toContain(
      'Classement complet',
    );
  });

  it('inscriptions en cours : la liste des clans inscrits, pas d’arbre', async () => {
    const { el, reply } = await open('demo');
    await reply({ ...DEMO_TOURNAMENT, status: 'registration', bracket: null });

    expect(el.querySelector('sc-bracket-view')).toBeNull();
    expect(el.querySelectorAll('.registered li')).toHaveLength(16);
    expect(el.querySelector('.registered a')?.getAttribute('href')).toBe('/clans/DEMO1');
    expect(el.querySelector('sc-ranking-table')).toBeNull(); // aucun joueur encore
  });
});
