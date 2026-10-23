import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { liveWar } from '../../../../testing/fixtures';
import { openPage } from '../../../../testing/open-page';
import { LivePage, REFRESH_MS } from './live-page';

describe('LivePage (en direct)', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.useRealTimers();
  });

  it('une FW en cours : score, qui mène, compte à rebours, attaques de chaque joueur', async () => {
    const { el, reply } = await openPage(LivePage);
    await reply('/live', [liveWar()]);

    expect(el.querySelector('.chip')?.textContent).toContain('FW classique');
    expect(el.querySelector('.status--live')?.textContent).toMatch(
      /En cours · fin dans (9|10) min/,
    );
    expect(el.querySelector('.side--lead .side__name')?.textContent).toBe('FW-team2');
    expect(el.querySelector('.side--lead')?.textContent).toContain('3/5 attaques');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(el.querySelectorAll('tr.waiting')).toHaveLength(2);
    expect(el.querySelector('tr.waiting')?.textContent).toContain('pas encore attaqué');
  });

  it('un match de Spade Cup : lien vers la page du match, avec le tour', async () => {
    const { el, reply } = await openPage(LivePage);
    await reply('/live', [
      liveWar(Date.now(), {
        kind: 'spade-cup',
        match: {
          slug: 'cup',
          tournament: 'Spade Cup',
          matchId: 'R2-M1',
          round: 'Quarts de finale',
        },
      }),
    ]);
    const link = el.querySelector<HTMLAnchorElement>('a.chip');
    expect(link?.textContent).toContain('Spade Cup · Quarts de finale');
    expect(link?.getAttribute('href')).toBe('/tournois/cup/matchs/R2-M1');
  });

  it('guerre terminée : « Terminée », sans compte à rebours', async () => {
    const { el, reply } = await openPage(LivePage);
    await reply('/live', [liveWar(Date.now(), { state: 'warEnded' })]);
    expect(el.querySelector('.status')?.textContent?.trim()).toBe('Terminée');
    expect(el.querySelector('.war--ended')).not.toBeNull();
  });

  it('aucune guerre : le dit, et invite à laisser la page ouverte', async () => {
    const { el, reply } = await openPage(LivePage);
    await reply('/live', []);
    expect(el.textContent).toContain('Aucune guerre en cours');
  });

  it('se met à jour toute seule toutes les 30 secondes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { reply } = await openPage(LivePage);
    await reply('/live', []);
    vi.advanceTimersByTime(REFRESH_MS);
    TestBed.tick();
    await reply('/live', [liveWar()]); // la deuxième requête est bien partie
  });
});
