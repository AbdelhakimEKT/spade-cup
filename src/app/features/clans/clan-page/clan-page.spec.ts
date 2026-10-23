import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { clanProfile } from '../../../../testing/fixtures';
import { openPage } from '../../../../testing/open-page';
import { ClanPage } from './clan-page';

describe('ClanPage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('nom, bilan, tournois et joueurs du clan', async () => {
    const { el, reply } = await openPage(ClanPage, { tag: 'DEMO1' });
    await reply('/clans/DEMO1', clanProfile());

    expect(el.querySelector('h1')?.textContent).toBe('Les Pikachus');
    expect(el.querySelector('.eyebrow')?.textContent).toContain('#DEMO1');
    expect(el.querySelector('.run')?.textContent).toContain('En lice : quarts de finale');
    expect(el.querySelector('.run')?.getAttribute('href')).toBe('/tournois/demo');
    // Tableau des joueurs, sans colonne « Clan » (ils sont tous de ce clan).
    expect(el.querySelectorAll('sc-ranking-table tbody tr')).toHaveLength(2);
    expect(el.querySelector('sc-ranking-table thead')?.textContent).not.toContain('Clan');
  });

  it('un champion est mis en valeur', async () => {
    const profile = clanProfile();
    const { el, reply } = await openPage(ClanPage, { tag: 'DEMO1' });
    await reply('/clans/DEMO1', {
      ...profile,
      runs: [{ ...profile.runs[0], outcome: 'champion', round: 4 }],
    });
    expect(el.querySelector('.chip--gold')?.textContent?.trim()).toBe('Champion');
  });

  it('404 : « Clan introuvable »', async () => {
    const { el, reply } = await openPage(ClanPage, { tag: '2PPP' });
    await reply('/clans/2PPP', { error: 'Clan introuvable.' }, 404);
    expect(el.querySelector('h1')?.textContent).toBe('Clan introuvable');
  });
});
