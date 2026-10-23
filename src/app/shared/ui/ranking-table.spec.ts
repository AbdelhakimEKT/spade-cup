import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { player } from '../../../testing/fixtures';
import { PlayerTotals } from '../../core/tournament/stats';
import { FRENCH_LOCALE } from '../../../testing/french-locale';
import { RankingTable } from './ranking-table';

async function render(players: PlayerTotals[], showClan = true) {
  TestBed.configureTestingModule({
    imports: [RankingTable],
    providers: [provideRouter([]), FRENCH_LOCALE],
  });
  const fixture = TestBed.createComponent(RankingTable);
  fixture.componentRef.setInput('players', players);
  fixture.componentRef.setInput('showClan', showClan);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const names = () =>
    [...el.querySelectorAll('tbody tr a[href^="/joueurs/"]')].map((a) => a.textContent?.trim());
  const ranks = () =>
    [...el.querySelectorAll('tbody .rank')].map((r) => r.textContent?.replace(/\s+/g, ''));
  const sortBy = async (label: string) => {
    [...el.querySelectorAll<HTMLButtonElement>('button.sort')]
      .find((b) => b.textContent?.trim() === label)!
      .click();
    await fixture.whenStable();
  };
  return { el, names, ranks, sortBy };
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

  it('cliquer sur une colonne change le tri (et l’annonce aux lecteurs d’écran)', async () => {
    const { names, sortBy, el } = await render(PLAYERS);
    await sortBy('Guerres');
    expect(names()).toEqual(['Volt', 'Zen', 'Nyx']);
    await sortBy('★ / att.');
    // Nyx et Zen sont à 3 étoiles par attaque : Zen passe devant, il en a plus au total.
    expect(names()).toEqual(['Zen', 'Nyx', 'Volt']);
    await sortBy('Destr.');
    expect(names()[0]).toBe('Nyx');
    expect(el.querySelector('caption')?.textContent).toContain('destruction moyenne');
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
