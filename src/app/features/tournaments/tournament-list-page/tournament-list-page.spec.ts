import { TestBed } from '@angular/core/testing';

import { TournamentListPage } from './tournament-list-page';

describe('TournamentListPage', () => {
  it('affiche le contenu attendu', async () => {
    TestBed.configureTestingModule({ imports: [TournamentListPage] });
    const fixture = TestBed.createComponent(TournamentListPage);

    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Tournois');
  });
});
