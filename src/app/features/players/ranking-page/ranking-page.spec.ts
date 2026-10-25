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

  it('?type=fw : classement des FW (équipe en couleur) et dernières FW ; rien de la Spade Cup', async () => {
    const { el, answer, reply, http } = await openPage(RankingPage, { type: 'fw' });
    answer('/fw/players', [
      player(1, { clan: { tag: '#2CYJPRCG8', name: 'FW-team1' } }),
      player(2, { stars: 5, clan: { tag: '#2JVUP2PGC', name: 'FW-team2' } }),
    ]);
    await reply('/fw/wars', [friendlyWar()]);
    http.expectNone((r) => r.url.endsWith('/players')); // le classement Spade Cup n'est pas demandé

    expect(el.querySelector('.tab--active')?.textContent?.trim()).toBe('FW classiques');
    expect(el.querySelectorAll('sc-ranking-table tbody tr')).toHaveLength(2);
    // Colonne « Clan » : l'équipe en couleur, sans lien (pas de fiche pour les clans de FW).
    const table = el.querySelector('sc-ranking-table')!;
    expect(table.querySelector('.team--green')?.textContent).toBe('FW-team2');
    expect(table.querySelector('.team--violet')?.textContent).toBe('FW-team1');
    expect(table.querySelector('a[href^="/clans/"]')).toBeNull();
    expect(el.querySelector('sc-fw-war-list .war')).not.toBeNull();
  });

  it('?type=fw sans aucune FW : message d’attente', async () => {
    const { el, answer, reply } = await openPage(RankingPage, { type: 'fw' });
    answer('/fw/players', []);
    await reply('/fw/wars', []);
    expect(el.textContent).toContain('Aucune FW classique enregistrée');
  });
});
