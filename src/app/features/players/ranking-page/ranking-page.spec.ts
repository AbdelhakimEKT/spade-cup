import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DEMO_TOURNAMENT } from '../../tournaments/data/demo-tournament';
import { friendlyWar, player } from '../../../../testing/fixtures';
import { openPage } from '../../../../testing/open-page';
import { RankingPage } from './ranking-page';

describe('RankingPage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('tous les tournois : le classement reçu du serveur', async () => {
    const { el, reply } = await openPage(RankingPage);
    await reply('/players', [player(1), player(2, { stars: 5 })]);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el.querySelector('.filter')).toBeNull();
  });

  it('aucune guerre encore jouée : explique, et propose le classement de la démo', async () => {
    const { el, reply } = await openPage(RankingPage);
    await reply('/players', []);
    expect(el.textContent).toContain("Aucune guerre de tournoi n'a encore été jouée");
    expect(el.querySelector('a[href="/joueurs?tournoi=demo"]')).not.toBeNull();
  });

  it('?tournoi=demo : filtre affiché avec le nom du tournoi, et lien pour l’enlever', async () => {
    const { el, answer, reply } = await openPage(RankingPage, { tournoi: 'demo' });
    // Deux requêtes partent en même temps : le classement et le nom du tournoi.
    answer('/players?tournament=demo', [player(1)]);
    await reply('/tournaments/demo', DEMO_TOURNAMENT);
    expect(el.querySelector('.filter .chip')?.textContent).toBe(
      'Tournoi : Tournoi de démonstration',
    );
    expect(el.querySelector('.filter a')?.getAttribute('href')).toBe('/joueurs');
  });

  it('onglets : Spade Cup par défaut, lien vers les FW classiques', async () => {
    const { el, reply } = await openPage(RankingPage);
    await reply('/players', [player(1)]);
    expect(el.querySelector('.tab--active')?.textContent?.trim()).toBe('Spade Cup');
    expect(el.querySelector('a.tab[href="/joueurs?type=fw"]')?.textContent?.trim()).toBe(
      'FW classiques',
    );
  });

  it('?type=fw : classement des FW (sans colonne clan) et dernières FW ; rien de la Spade Cup', async () => {
    const { el, answer, reply, http } = await openPage(RankingPage, { type: 'fw' });
    answer('/fw/players', [
      player(1, { clan: { tag: '#2CYJPRCG8', name: 'FW-team1' } }),
      player(2, { stars: 5, clan: { tag: '#2JVUP2PGC', name: 'FW-team2' } }),
    ]);
    await reply('/fw/wars', [friendlyWar()]);
    http.expectNone((r) => r.url.endsWith('/players')); // le classement Spade Cup n'est pas demandé

    expect(el.querySelector('.tab--active')?.textContent?.trim()).toBe('FW classiques');
    expect(el.querySelectorAll('sc-ranking-table tbody tr')).toHaveLength(2);
    // Pas de colonne « Clan » : un joueur change de team d'une FW à l'autre.
    expect(el.querySelector('sc-ranking-table thead')?.textContent).not.toContain('Clan');
    expect(el.querySelector('sc-ranking-table a[href^="/clans/"]')).toBeNull();
    expect(el.querySelector('sc-fw-war-list .war')).not.toBeNull();
  });

  it('?type=fw&semaine=… : le classement et les FW de cette semaine seulement', async () => {
    const { el, answer, reply } = await openPage(RankingPage, {
      type: 'fw',
      semaine: '2026-10-26',
    });
    answer('/fw/players?week=2026-10-26', [player(1)]);
    await reply('/fw/wars?week=2026-10-26', [friendlyWar()]);
    expect(el.querySelector<HTMLSelectElement>('.period select')?.value).toBe('semaine:2026-10-26');
    expect(el.querySelector('caption')?.textContent).toContain('du 26/10 au 01/11');
    expect(el.querySelector('.section-title')?.textContent?.trim()).toBe('Les FW de la semaine');
  });

  it('?type=fw&mois=2026-10 : le classement du mois ; menu à partir du 19/10 et d’octobre', async () => {
    const { el, answer, reply } = await openPage(RankingPage, { type: 'fw', mois: '2026-10' });
    answer('/fw/players?month=2026-10', [player(1)]);
    await reply('/fw/wars?month=2026-10', [friendlyWar()]);
    expect(el.querySelector<HTMLSelectElement>('.period select')?.value).toBe('mois:2026-10');
    expect(el.querySelector('.section-title')?.textContent?.trim()).toBe('Les FW du mois');
    const options = [...el.querySelectorAll('.period option')].map((o) => o.getAttribute('value'));
    expect(options.at(-1)).toBe('mois:2026-10');
    expect(options.filter((v) => v?.startsWith('semaine:')).at(-1)).toBe('semaine:2026-10-19');
  });

  it('?type=fw&semaine=… sans FW cette semaine : le dit', async () => {
    const { el, answer, reply } = await openPage(RankingPage, {
      type: 'fw',
      semaine: '2026-10-19',
    });
    answer('/fw/players?week=2026-10-19', []);
    await reply('/fw/wars?week=2026-10-19', []);
    expect(el.textContent).toContain('Aucune FW classique jouée du 19/10 au 25/10');
  });

  it('?type=fw sans aucune FW : message d’attente', async () => {
    const { el, answer, reply } = await openPage(RankingPage, { type: 'fw' });
    answer('/fw/players', []);
    await reply('/fw/wars', []);
    expect(el.textContent).toContain('Aucune FW classique enregistrée');
  });
});
