import { TestBed } from '@angular/core/testing';
import { FeaturedMatch } from './featured-match';

describe('FeaturedMatch', () => {
  it('met les deux clans face à face, avec le tour', async () => {
    TestBed.configureTestingModule({ imports: [FeaturedMatch] });
    const fixture = TestBed.createComponent(FeaturedMatch);
    fixture.componentRef.setInput('match', {
      id: 'R2-M1',
      round: 2,
      index: 1,
      home: { tag: '#A', name: 'Les Pikachus' },
      away: { tag: '#B', name: 'Orion' },
      status: 'live',
      winner: null,
      score: null,
    });
    fixture.componentRef.setInput('roundLabel', 'Quarts de finale');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const names = [...el.querySelectorAll('.side__name')].map((n) => n.textContent?.trim());
    expect(names).toEqual(['Les Pikachus', 'Orion']);
    expect(el.querySelector('.pill')?.textContent).toContain('Quarts de finale');
  });
});
