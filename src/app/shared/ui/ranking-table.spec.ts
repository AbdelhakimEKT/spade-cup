import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { player } from '../../../testing/fixtures';
import { PlayerTotals } from '../../core/tournament/stats';
import { FRENCH_LOCALE } from '../../../testing/french-locale';
import { RankingTable } from './ranking-table';

async function render(players: PlayerTotals[], showClan = true, limit: number | null = null) {
  TestBed.configureTestingModule({
    imports: [RankingTable],
    providers: [provideRouter([]), FRENCH_LOCALE],
  });
  const fixture = TestBed.createComponent(RankingTable);
  fixture.componentRef.setInput('players', players);
  fixture.componentRef.setInput('showClan', showClan);
  fixture.componentRef.setInput('limit', limit);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const names = () =>
    [...el.querySelectorAll('tbody tr a[href^="/joueurs/"]')].map((a) => a.textContent?.trim());
  const ranks = () =>
    [...el.querySelectorAll('tbody .rank')].map((r) => r.textContent?.replace(/\s+/g, ''));
  const sortBy = async (label: string) => {
    [...el.querySelectorAll<HTMLButtonElement>('button.sort')]
      .find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === label)!
      .click();
    await fixture.whenStable();
  };
  return { el, names, ranks, sortBy, fixture };
}

const PLAYERS = [
  player(1, { name: 'Volt', wars: 3, attacks: 3, stars: 6, triples: 0, destruction: 70 }),
  player(2, { name: 'Nyx', wars: 1, attacks: 1, stars: 3, triples: 1, destruction: 100 }),
  player(3, { name: 'Zen', wars: 2, attacks: 2, stars: 6, triples: 2, destruction: 95 }),
];

describe('RankingTable', () => {
  it('trié par étoiles par défaut ; à égalité, le moins de guerres d’abord', async () => {
    const { names, el } = await render(PLAYERS);
    expect(names()).toEqual(['Zen', 'Volt', 'Nyx']);
    expect(el.querySelector('th[aria-sort="descending"]')?.textContent).toContain('Étoiles');
  });

  it('un clic trie une colonne (du plus grand au plus petit), un second inverse l’ordre', async () => {
    const { names, sortBy, el, ranks } = await render(PLAYERS);
    await sortBy('Guerres');
    expect(names()).toEqual(['Volt', 'Zen', 'Nyx']);
    expect(el.querySelector('th[aria-sort="descending"]')?.textContent).toContain('Guerres ▼');

    await sortBy('Guerres ▼');
    expect(names()).toEqual(['Nyx', 'Zen', 'Volt']);
    expect(el.querySelector('th[aria-sort="ascending"]')?.textContent).toContain('Guerres ▲');
    // Chacun garde son rang : seul l'ordre d'affichage s'inverse.
    expect(ranks()).toEqual(['🥉3', '🥈2', '🥇1']);
    expect(el.querySelector('caption')?.textContent).toContain('guerres jouées (croissant)');
  });

  it('deux critères : le 2e départage les ex aequo du 1er', async () => {
    const four = [
      player(1, { name: 'A', wars: 2, attacks: 2, stars: 4 }), // 2 ★/att.
      player(2, { name: 'B', wars: 2, attacks: 2, stars: 6 }), // 3 ★/att.
      player(3, { name: 'C', wars: 3, attacks: 3, stars: 3 }), // 1 ★/att.
      player(4, { name: 'D', wars: 1, attacks: 1, stars: 3 }),
    ];
    const { names, sortBy, el } = await render(four);
    await sortBy('Guerres');
    await sortBy('★ / att.');
    expect(names()).toEqual(['C', 'B', 'A', 'D']);
    // Numéro du critère sur chaque colonne, et rappel au-dessus du tableau.
    expect(el.querySelectorAll('th sup')).toHaveLength(2);
    expect(el.querySelector('.criteria')?.textContent?.replace(/\s+/g, ' ')).toContain(
      '1 Guerres ▼',
    );
    expect(el.querySelector('.criteria')?.textContent?.replace(/\s+/g, ' ')).toContain(
      '2 ★ / att. ▼',
    );
  });

  it('✕ retire un critère ; « Réinitialiser » revient au tri par étoiles', async () => {
    const { names, sortBy, el, fixture } = await render(PLAYERS);
    await sortBy('Guerres');
    await sortBy('Destr.');
    el.querySelector<HTMLButtonElement>('.criterion__remove')!.click(); // retire « Guerres »
    await fixture.whenStable();
    expect(names()[0]).toBe('Nyx'); // trié par destruction seule
    expect(el.querySelectorAll('.criterion')).toHaveLength(1);

    el.querySelector<HTMLButtonElement>('.reset')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.criteria')?.textContent).toContain('Étoiles ▼');
    expect(el.querySelector('.reset')).toBeNull();
    expect(names()).toEqual(['Zen', 'Volt', 'Nyx']);
  });

  it('limité à N joueurs, avec « Voir toute la liste » et retour', async () => {
    const many = Array.from({ length: 20 }, (_, i) => player(i + 1, { stars: 20 - i }));
    const { el, fixture } = await render(many, true, 15);
    const rows = () => el.querySelectorAll('tbody tr').length;
    const more = () => el.querySelector<HTMLButtonElement>('.more')!;
    expect(rows()).toBe(15);
    expect(more().textContent).toContain('Voir toute la liste (20 joueurs)');
    more().click();
    await fixture.whenStable();
    expect(rows()).toBe(20);
    expect(more().textContent).toContain('Voir seulement les 15 premiers');
  });

  it('pas de bouton quand tout tient dans la limite', async () => {
    const { el } = await render(PLAYERS, true, 15);
    expect(el.querySelector('.more')).toBeNull();
  });

  it('chiffres au format français, liens vers joueur et clan', async () => {
    const { el } = await render([PLAYERS[0]]);
    const cells = [...el.querySelectorAll('tbody td')].map((c) => c.textContent?.trim());
    expect(cells).toContain('2,00'); // étoiles par attaque
    expect(cells).toContain('70,0 %');
    expect(el.querySelector('a[href="/joueurs/P1"]')).not.toBeNull();
    expect(el.querySelector('a[href="/clans/DEMO1"]')).not.toBeNull();
  });

  it('colonne « Clan » masquable', async () => {
    const { el } = await render(PLAYERS, false);
    expect(el.querySelector('thead')?.textContent).not.toContain('Clan');
  });

  it('le rang à gauche du nom : médailles pour le podium, puis 4, 5…', async () => {
    const five = [
      ...PLAYERS,
      player(4, { name: 'Ace', stars: 1, destruction: 50 }),
      player(5, { name: 'Bolt', stars: 0, destruction: 0 }),
    ];
    const { ranks, names } = await render(five);
    expect(names()).toEqual(['Zen', 'Volt', 'Nyx', 'Ace', 'Bolt']);
    expect(ranks()).toEqual(['🥇1', '🥈2', '🥉3', '4', '5']);
  });

  it('à égalité d’étoiles, la destruction départage ; jamais l’ordre alphabétique', async () => {
    const tied = [
      player(1, { name: 'Maxou', stars: 2, destruction: 73 }),
      player(2, { name: 'Syfy', stars: 2, destruction: 77 }),
    ];
    const { names } = await render(tied);
    expect(names()).toEqual(['Syfy', 'Maxou']);
  });

  it('égalité parfaite : même rang (1, 1, 3)', async () => {
    const same = { stars: 2, destruction: 80, wars: 1, attacks: 1 };
    const { ranks } = await render([
      player(1, { name: 'B', ...same }),
      player(2, { name: 'A', ...same }),
      player(3, { name: 'C', stars: 1 }),
    ]);
    expect(ranks()).toEqual(['🥇1', '🥇1', '🥉3']);
  });
});
