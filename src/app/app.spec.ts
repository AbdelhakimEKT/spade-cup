import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    });
  });

  it('affiche la coquille commune : lien d’évitement, en-tête, contenu, pied de page', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const skipLink = el.querySelector<HTMLAnchorElement>('a.skip-link');
    expect(skipLink?.getAttribute('href')).toBe('#contenu');
    expect(el.querySelector('sc-site-header')).not.toBeNull();
    expect(el.querySelector('main#contenu')).not.toBeNull();
    expect(el.querySelector('sc-site-footer')).not.toBeNull();
  });
});
