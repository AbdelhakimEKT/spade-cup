import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TournamentListPage } from './tournament-list-page';

describe('TournamentListPage', () => {
  it('liste les tournois avec un lien vers chacun', async () => {
    TestBed.configureTestingModule({
      imports: [TournamentListPage],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(TournamentListPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const link = el.querySelector<HTMLAnchorElement>('a[href="/tournois/demo"]');
    expect(link?.textContent).toContain('Tournoi de démonstration');
    expect(link?.textContent).toContain('En cours');
  });
});
