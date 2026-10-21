import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { TestBed } from '@angular/core/testing';
import { BracketMatch } from '../../../core/tournament/models';
import { MatchCard } from './match-card';

registerLocaleData(localeFr);

const base: BracketMatch = {
  id: 'R1-M1',
  round: 1,
  index: 1,
  home: { tag: '#A', name: 'Clan A' },
  away: { tag: '#B', name: 'Clan B' },
  status: 'pending',
  winner: null,
  score: null,
};

async function render(match: BracketMatch) {
  TestBed.configureTestingModule({
    imports: [MatchCard],
    providers: [{ provide: LOCALE_ID, useValue: 'fr' }],
  });
  const fixture = TestBed.createComponent(MatchCard);
  fixture.componentRef.setInput('match', match);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('MatchCard', () => {
  it('match à jouer : les deux clans et la mention « À jouer »', async () => {
    const el = await render(base);
    expect(el.textContent).toContain('Clan A');
    expect(el.textContent).toContain('Clan B');
    expect(el.querySelector('.card__status')?.textContent?.trim()).toBe('À jouer');
  });

  it('match joué : vainqueur mis en avant, score au format français', async () => {
    const el = await render({
      ...base,
      status: 'done',
      winner: 'away',
      score: {
        home: { stars: 12, destruction: 90, totalDurationSec: 900 },
        away: { stars: 13, destruction: 92.6, totalDurationSec: 850 },
      },
    });
    const winner = el.querySelector('.row--winner');
    expect(winner?.textContent).toContain('Clan B');
    expect(winner?.textContent).toContain('92,6 %');
    expect(el.querySelector('article')?.getAttribute('aria-label')).toBe(
      'Clan A contre Clan B, 12 étoiles à 13. Vainqueur : Clan B',
    );
  });

  it('exempt au premier tour : place vide marquée « Exempt », clan qualifié d’office', async () => {
    const el = await render({ ...base, away: null, status: 'bye', winner: 'home' });
    expect(el.querySelector('.row__name--empty')?.textContent?.trim()).toBe('Exempt');
    expect(el.textContent).toContain('Qualifié d’office');
  });

  it('tour suivant pas encore connu : « À déterminer »', async () => {
    const el = await render({ ...base, id: 'R2-M1', round: 2, home: null, away: null });
    expect(el.querySelectorAll('.row__name--empty')[0]?.textContent?.trim()).toBe('À déterminer');
  });
});
