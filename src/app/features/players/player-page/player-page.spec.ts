import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { playerProfile } from '../../../../testing/fixtures';
import { openPage } from '../../../../testing/open-page';
import { PlayerPage } from './player-page';

describe('PlayerPage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('bilan du joueur, son clan, et chacune de ses guerres', async () => {
    const profile = playerProfile();
    const tag = profile.totals.tag.slice(1);
    const { el, reply } = await openPage(PlayerPage, { tag });
    await reply(`/players/${tag}`, profile);

    expect(el.querySelector('h1')?.textContent).toBe(profile.totals.name);
    expect(el.querySelector('a.clan')?.getAttribute('href')).toBe('/clans/DEMO1');
    const tile = (label: string) =>
      [...el.querySelectorAll('.tile')]
        .find((t) => t.querySelector('dt')?.textContent === label)
        ?.querySelector('dd')?.textContent;
    expect(tile('Étoiles')).toBe(String(profile.totals.stars));
    expect(tile('Guerres jouées')).toBe('1');

    const row = el.querySelector('tbody tr')!;
    expect(row.textContent).toContain('Huitièmes de finale');
    expect(row.querySelector('.result--win')?.textContent).toBe('V');
    expect(row.querySelector('a[href="/tournois/demo/matchs/R1-M1"]')?.textContent).toContain(
      'Les Pikachus contre Titans FR',
    );
    expect(TestBed.inject(Title).getTitle()).toBe(`${profile.totals.name} · Spade Cup FR`);
  });

  it('défaite et match sans vainqueur connu', async () => {
    const profile = playerProfile();
    const [h] = profile.history;
    const { el, reply } = await openPage(PlayerPage, { tag: 'X' });
    await reply('/players/X', {
      ...profile,
      history: [
        { ...h, won: false },
        { ...h, matchId: 'R2-M1', won: null },
      ],
    });
    expect(el.querySelector('.result--lose')?.textContent).toBe('D');
    expect(el.querySelectorAll('tbody tr')[1].textContent).toContain('–');
  });

  it('404 : « Joueur introuvable », avec un lien vers le classement', async () => {
    const { el, reply } = await openPage(PlayerPage, { tag: 'ZZZ' });
    await reply('/players/ZZZ', { error: 'Joueur introuvable.' }, 404);
    expect(el.querySelector('h1')?.textContent).toBe('Joueur introuvable');
    expect(el.querySelector('a[href="/joueurs"]')).not.toBeNull();
  });
});
