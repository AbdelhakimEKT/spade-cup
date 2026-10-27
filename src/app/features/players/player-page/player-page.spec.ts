import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { fwOnlyProfile, playerProfile } from '../../../../testing/fixtures';
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
    expect(TestBed.inject(Title).getTitle()).toBe(`${profile.totals.name} · Friendly Wars`);
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

  it('joueur de FW classiques seulement : sa section FW, pas de Spade Cup, pas de lien de clan', async () => {
    const profile = fwOnlyProfile();
    const tag = profile.totals.tag.slice(1);
    const { el, reply } = await openPage(PlayerPage, { tag });
    await reply(`/players/${tag}`, profile);

    const titles = [...el.querySelectorAll('h2')].map((h) => h.textContent);
    expect(titles).toEqual(['En FW classiques']);
    // Ouverte directement : « ← » mène au classement des FW, pas au menu principal.
    expect(el.querySelector('.crumb')?.getAttribute('href')).toBe('/joueurs?type=fw');
    expect(el.querySelector('a.clan')).toBeNull(); // FW-team2 n'a pas de fiche de clan
    expect(el.querySelector('span.clan')?.textContent).toContain('FW-team2');
    expect(el.querySelector('span.clan')?.classList).toContain('team--green');
    const row = el.querySelector('tbody tr')!;
    // Team 1 (violet) toujours à gauche, team 2 (vert) à droite.
    expect(row.textContent?.replace(/\s+/g, ' ')).toContain('FW-team1 11★ – 13★ FW-team2');
    expect(row.querySelector('.team--violet')?.textContent).toContain('FW-team1');
    expect(row.querySelector('.team--green')?.textContent).toContain('FW-team2');
    expect(row.textContent).toContain('20 oct. 2026');
    expect(row.querySelector('.result--win')).not.toBeNull();
    expect(row.querySelector('a.fw-link')?.getAttribute('href')).toBe('/fw/1');
  });

  it('joueur des deux : une section par type de guerre', async () => {
    const profile = { ...playerProfile(), fw: fwOnlyProfile().fw };
    const tag = profile.totals.tag.slice(1);
    const { el, reply } = await openPage(PlayerPage, { tag });
    await reply(`/players/${tag}`, profile);
    expect([...el.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'En Spade Cup',
      'En FW classiques',
    ]);
    expect(el.querySelectorAll('.tiles')).toHaveLength(2);
  });
});
