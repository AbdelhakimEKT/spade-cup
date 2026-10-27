import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { matchDetail } from '../../../../testing/fixtures';
import { openPage } from '../../../../testing/open-page';
import { MatchPage } from './match-page';

const open = (id: string) => openPage(MatchPage, { slug: 'demo', matchId: id });

describe('MatchPage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('match joué : score des deux clans, vainqueur, comment il a gagné', async () => {
    const { el, reply } = await open('R1-M1');
    await reply('/tournaments/demo/matches/R1-M1', matchDetail('R1-M1'));

    expect(el.querySelector('.eyebrow')?.textContent).toBe('Huitièmes de finale');
    expect(el.querySelector('h1')?.textContent).toContain('Les Pikachus contre Titans FR');
    expect(el.querySelector('.team--win')?.textContent).toContain('Les Pikachus');
    expect(el.querySelector('.team--win')?.textContent).toContain('Qualifié');
    expect(el.querySelector('.team--win')?.textContent).toContain('91,2 %'); // format français
    expect(el.querySelector('.verdict')?.textContent).toContain('Victoire aux étoiles');
    expect(el.querySelector('.verdict')?.textContent).toContain('lu directement dans le jeu');
    expect(TestBed.inject(Title).getTitle()).toBe('Les Pikachus – Titans FR · Friendly Wars');
  });

  it('les joueurs de chaque camp, avec un lien vers leur fiche', async () => {
    const { el, reply } = await open('R1-M1');
    const detail = matchDetail('R1-M1');
    await reply('/tournaments/demo/matches/R1-M1', detail);

    const tables = el.querySelectorAll('.lineups table');
    expect(tables).toHaveLength(2);
    expect(tables[0].querySelectorAll('tbody tr')).toHaveLength(5);
    const first = detail.players.home[0];
    expect(tables[0].querySelector('a')?.getAttribute('href')).toBe(
      `/joueurs/${first.tag.slice(1)}`,
    );
    expect(tables[0].querySelector('a')?.textContent).toBe(first.name);
  });

  it('égalité d’étoiles : explique que le pourcentage a départagé', async () => {
    const { el, reply } = await open('R1-M3');
    await reply('/tournaments/demo/matches/R1-M3', matchDetail('R1-M3'));
    expect(el.querySelector('.verdict')?.textContent).toContain('départagé au pourcentage');
  });

  it('un joueur pas HDV 18 est mis en évidence', async () => {
    const { el, reply } = await open('R1-M1');
    const detail = matchDetail('R1-M1');
    const [first, ...rest] = detail.players.home;
    await reply('/tournaments/demo/matches/R1-M1', {
      ...detail,
      players: { ...detail.players, home: [{ ...first, townHall: 17 }, ...rest] },
    });
    expect(el.querySelector('.off-rules')?.textContent?.trim()).toBe('17');
  });

  it('match en cours : pas de score, pas de joueurs, statut clair', async () => {
    const { el, reply } = await open('R2-M1');
    await reply('/tournaments/demo/matches/R2-M1', matchDetail('R2-M1'));
    expect(el.querySelector('.verdict--live')?.textContent).toContain('Guerre amicale en cours');
    expect(el.querySelector('a[href="/direct"]')?.textContent).toContain('Suivre en direct');
    expect(el.querySelector('.team__score')).toBeNull();
    expect(el.querySelector('.lineups')).toBeNull();
  });

  it('score saisi par un arbitre : le dit, et explique l’absence de détail', async () => {
    const { el, reply } = await open('R1-M1');
    await reply('/tournaments/demo/matches/R1-M1', {
      ...matchDetail('R1-M1'),
      source: 'referee',
      players: { home: [], away: [] },
    });
    expect(el.textContent).toContain('Score saisi par un arbitre');
    expect(el.textContent).toContain("n'existe que pour les résultats lus dans le jeu");
  });

  it('lien de retour vers le tournoi', async () => {
    const { el, reply } = await open('R1-M1');
    await reply('/tournaments/demo/matches/R1-M1', matchDetail('R1-M1'));
    expect(el.querySelector('a.crumb')?.getAttribute('href')).toBe('/tournois/demo');
  });

  it('404 : « Match introuvable »', async () => {
    const { el, reply } = await open('R9-M9');
    await reply('/tournaments/demo/matches/R9-M9', { error: 'Match introuvable.' }, 404);
    expect(el.querySelector('h1')?.textContent).toBe('Match introuvable');
  });

  it('mode capture (récap Discord) : pas de lien de retour, signature du site', async () => {
    const { el, reply } = await openPage(MatchPage, {
      slug: 'demo',
      matchId: 'R1-M1',
      capture: true,
    });
    await reply('/tournaments/demo/matches/R1-M1', matchDetail('R1-M1'));
    expect(el.querySelector('a.crumb')).toBeNull();
    expect(el.querySelector('.capture-url')?.textContent).toContain('/tournois/demo/matchs/R1-M1');
    expect(el.querySelectorAll('.lineups table')).toHaveLength(2);
  });
});
