import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SITE_CONFIG } from '../../core/site-config';
import { LiveWar } from '../../core/tournament/live';
import { liveWar } from '../../../testing/fixtures';
import { SiteHeader } from './site-header';

/** Affiche le menu ; le serveur répond `wars` à la question « quoi en direct ? ». */
async function render(wars: LiveWar[] = []) {
  const fixture = TestBed.createComponent(SiteHeader);
  TestBed.tick();
  TestBed.inject(HttpTestingController).expectOne(`${SITE_CONFIG.apiUrl}/live`).flush(wars);
  await fixture.whenStable();
  return fixture;
}

describe('SiteHeader', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [SiteHeader],
      providers: [provideRouter([]), provideHttpClientTesting()],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('propose les liens vers le direct, les tournois, les joueurs, les règles et le Discord', async () => {
    const fixture = await render();
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav')!;
    const links = [...nav.querySelectorAll('a')].map((a) => [
      a.getAttribute('href'),
      a.textContent?.trim(),
    ]);

    expect(links).toEqual([
      ['/direct', 'Direct'],
      ['/tournois', 'Tournois'],
      ['/joueurs', 'Joueurs'],
      ['/a-propos', 'Règles'],
      ['https://discord.gg/mvkaK2QwS', 'Discord'],
    ]);
  });

  it('le bouton de thème annonce l’action, et change après un clic', async () => {
    const fixture = await render();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button.theme-toggle')!;

    expect(button.getAttribute('aria-label')).toBe('Passer en thème clair');

    (button as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(button.getAttribute('aria-label')).toBe('Passer en thème sombre');
  });

  it('le lien Discord ouvre l’invitation du serveur dans un nouvel onglet', async () => {
    const fixture = await render();
    const link = (fixture.nativeElement as HTMLElement).querySelector(
      'a[href^="https://discord.gg/"]',
    )!;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('le nom du site : Friendly Wars', async () => {
    const fixture = await render();
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.brand')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe('Friendly Wars');
  });

  describe('point rouge du lien « Direct »', () => {
    const dot = (fixture: Awaited<ReturnType<typeof render>>) =>
      (fixture.nativeElement as HTMLElement).querySelector('.live-dot');

    it('rien en cours : pas de point', async () => {
      expect(dot(await render([]))).toBeNull();
    });

    it('une guerre en cours : le point apparaît, annoncé aux lecteurs d’écran', async () => {
      const fixture = await render([liveWar()]);
      expect(dot(fixture)).not.toBeNull();
      expect(
        (fixture.nativeElement as HTMLElement)
          .querySelector('a[href="/direct"]')
          ?.getAttribute('aria-label'),
      ).toBe('Direct : une guerre est en cours');
    });

    it('seulement une guerre terminée (encore visible sur la page) : pas de point', async () => {
      expect(dot(await render([liveWar(Date.now(), { state: 'warEnded' })]))).toBeNull();
    });
  });
});
