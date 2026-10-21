import { TestBed } from '@angular/core/testing';

import { MatchPage } from './match-page';

describe('MatchPage', () => {
  it('affiche le contenu attendu', async () => {
    TestBed.configureTestingModule({ imports: [MatchPage] });
    const fixture = TestBed.createComponent(MatchPage);
    fixture.componentRef.setInput('slug', 'coupe-hiver');
    fixture.componentRef.setInput('matchId', '12');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Détail du match 12 du tournoi coupe-hiver',
    );
  });
});
