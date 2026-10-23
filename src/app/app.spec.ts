import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { SITE_CONFIG } from './core/site-config';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      // Faux serveur : le menu demande « quoi en direct ? », jamais le vrai réseau en test.
      providers: [provideRouter([]), provideHttpClientTesting()],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('affiche la coquille commune : lien d’évitement, en-tête, contenu, pied de page', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.tick();
    TestBed.inject(HttpTestingController).expectOne(`${SITE_CONFIG.apiUrl}/live`).flush([]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const skipLink = el.querySelector<HTMLAnchorElement>('a.skip-link');
    expect(skipLink?.getAttribute('href')).toBe('#contenu');
    expect(el.querySelector('sc-site-header')).not.toBeNull();
    expect(el.querySelector('main#contenu')).not.toBeNull();
    expect(el.querySelector('sc-site-footer')).not.toBeNull();
  });
});
