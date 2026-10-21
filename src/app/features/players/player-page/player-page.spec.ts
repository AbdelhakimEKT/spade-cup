import { TestBed } from '@angular/core/testing';

import { PlayerPage } from './player-page';

describe('PlayerPage', () => {
  it('affiche le contenu attendu', async () => {
    TestBed.configureTestingModule({ imports: [PlayerPage] });
    const fixture = TestBed.createComponent(PlayerPage);
    fixture.componentRef.setInput('tag', '28YJ29GU9');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('#28YJ29GU9');
  });
});
