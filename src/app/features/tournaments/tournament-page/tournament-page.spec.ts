import { TestBed } from '@angular/core/testing';

import { TournamentPage } from './tournament-page';

describe('TournamentPage', () => {
  it('affiche le contenu attendu', async () => {
    TestBed.configureTestingModule({ imports: [TournamentPage] });
    const fixture = TestBed.createComponent(TournamentPage);
    fixture.componentRef.setInput('slug', 'coupe-hiver');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('coupe-hiver');
  });
});
