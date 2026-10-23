import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SiteHeader } from './site-header';

describe('SiteHeader', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [SiteHeader],
      providers: [provideRouter([])],
    });
  });

  it('propose les liens vers le direct, les tournois, les joueurs et les règles', async () => {
    const fixture = TestBed.createComponent(SiteHeader);
    await fixture.whenStable();
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
    ]);
  });

  it('le bouton de thème annonce l’action, et change après un clic', async () => {
    const fixture = TestBed.createComponent(SiteHeader);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button.theme-toggle')!;

    expect(button.getAttribute('aria-label')).toBe('Passer en thème clair');

    (button as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(button.getAttribute('aria-label')).toBe('Passer en thème sombre');
  });

  it('masque le lien Discord tant que l’invitation n’est pas configurée', async () => {
    const fixture = TestBed.createComponent(SiteHeader);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Discord');
  });
});
