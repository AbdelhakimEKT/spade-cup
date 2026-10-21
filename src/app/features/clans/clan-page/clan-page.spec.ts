import { TestBed } from '@angular/core/testing';

import { ClanPage } from './clan-page';

describe('ClanPage', () => {
  it('affiche le contenu attendu', async () => {
    TestBed.configureTestingModule({ imports: [ClanPage] });
    const fixture = TestBed.createComponent(ClanPage);
    fixture.componentRef.setInput('tag', '2JU0GRG98');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('#2JU0GRG98');
  });
});
