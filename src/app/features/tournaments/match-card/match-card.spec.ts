import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
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

async function render(match: BracketMatch, final = false) {
  TestBed.configureTestingModule({
    imports: [MatchCard],
    providers: [{ provide: LOCALE_ID, useValue: 'fr' }],
  });
  const fixture = TestBed.createComponent(MatchCard);
  fixture.componentRef.setInput('match', match);
  fixture.componentRef.setInput('final', final);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const status = (el: HTMLElement) => el.querySelector('.status')?.textContent?.trim();

describe('MatchCard', () => {
  it('match prêt : les deux clans et « en attente »', async () => {
    const el = await render(base);
    expect(el.textContent).toContain('Clan A');
    expect(status(el)).toBe('en attente');
  });

  it('match en cours : lueur cyan et « en cours »', async () => {
    const el = await render({ ...base, status: 'live' });
    expect(el.querySelector('.match--live')).not.toBeNull();
    expect(status(el)).toBe('en cours');
  });

  it('match joué : vainqueur mis en avant, pas de pourcentage si les étoiles diffèrent', async () => {
    const el = await render({
      ...base,
      status: 'done',
      winner: 'away',
      score: {
        home: { stars: 12, destruction: 90, totalDurationSec: 900 },
        away: { stars: 13, destruction: 92.6, totalDurationSec: 850 },
      },
    });
    expect(el.querySelector('.team--win')?.textContent).toContain('Clan B');
    expect(el.querySelector('.team--lose')?.textContent).toContain('Clan A');
    expect(el.textContent).not.toContain('%');
    expect(el.querySelector('article')?.getAttribute('aria-label')).toBe(
      'Clan A contre Clan B, 12 étoiles à 13. Vainqueur : Clan B',
    );
  });

  it('égalité d’étoiles : le départage s’affiche sous la carte, au format français', async () => {
    const el = await render({
      ...base,
      status: 'done',
      winner: 'home',
      score: {
        home: { stars: 12, destruction: 89.6, totalDurationSec: 840 },
        away: { stars: 12, destruction: 87.1, totalDurationSec: 812 },
      },
    });
    expect(el.querySelector('.status--info')?.textContent?.trim()).toBe('au % : 89,6 – 87,1');
    // Le nom du clan reste sur sa ligne.
    expect(el.querySelector('.team--win .team__name')?.textContent?.trim()).toBe('Clan A');
  });

  it('exempt au premier tour, et « À déterminer » aux tours suivants', async () => {
    const bye = await render({ ...base, away: null, status: 'bye', winner: 'home' });
    expect(bye.querySelector('.team--tbd')?.textContent?.trim()).toBe('Exempt');
    expect(status(bye)).toBe('qualifié d’office');
  });

  it('la finale a sa bordure dorée', async () => {
    const el = await render({ ...base, id: 'R4-M1', round: 4, home: null, away: null }, true);
    expect(el.querySelector('.match--final')).not.toBeNull();
    expect(el.querySelector('.team--tbd')?.textContent?.trim()).toBe('À déterminer');
  });
});
