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
  it('affiche le tournoi, ses règles, la mention « démo » et l’arbre', async () => {
    const el = await render('demo');
    expect(el.querySelector('h1')?.textContent).toBe('Tournoi de démonstration');
    expect(el.textContent).toContain('HDV18 uniquement · 5 contre 5');
    expect(el.textContent).toContain('les clans et les scores sont fictifs');
    expect(el.querySelector('sc-bracket-view')).not.toBeNull();
  });

  it('adresse inconnue : message clair et lien vers la liste', async () => {
    const el = await render('nexiste-pas');
    expect(el.querySelector('h1')?.textContent).toBe('Tournoi introuvable');
    expect(el.querySelector('a[href="/tournois"]')).not.toBeNull();
  });
});
