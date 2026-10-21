import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TournamentPage } from './tournament-page';

async function render(slug: string) {
  TestBed.configureTestingModule({ imports: [TournamentPage], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(TournamentPage);
  fixture.componentRef.setInput('slug', slug);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('TournamentPage', () => {
  it('en-tête : nom, tour en cours, règles et mention « démo »', async () => {
    const el = await render('demo');
    expect(el.querySelector('h1')?.textContent).toBe('Tournoi de démonstration');
    expect(el.querySelector('.badge')?.textContent?.trim()).toBe('Quarts de finale');
    expect(el.querySelector('.meta')?.textContent).toContain('5 contre 5');
    expect(el.querySelector('.meta')?.textContent).toContain('HDV 18');
    expect(el.textContent).toContain('les clans et les scores sont fictifs');
  });

  it('met le match en cours à la une, puis affiche l’arbre', async () => {
    const el = await render('demo');
    expect(el.querySelector('sc-featured-match')?.textContent).toContain('Les Pikachus');
    expect(el.querySelector('sc-bracket-view')).not.toBeNull();
  });

  it('adresse inconnue : message clair et lien vers la liste', async () => {
    const el = await render('nexiste-pas');
    expect(el.querySelector('h1')?.textContent).toBe('Tournoi introuvable');
    expect(el.querySelector('a[href="/tournois"]')).not.toBeNull();
  });
});
