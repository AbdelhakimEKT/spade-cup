import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fwWarDetail } from '../../../../testing/fixtures';
import { FRENCH_LOCALE } from '../../../../testing/french-locale';
import { PlayerLine } from '../../../core/tournament/coc-war';
import { WarPlayersTable } from './war-players-table';

async function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({
    imports: [WarPlayersTable],
    providers: [provideRouter([]), FRENCH_LOCALE],
  });
  const fixture = TestBed.createComponent(WarPlayersTable);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const header = (label: string) =>
    [...el.querySelectorAll('th')].find((th) => th.textContent?.includes(label))!;
  const click = async (label: string) => {
    header(label).querySelector('button')!.click();
    await fixture.whenStable();
  };
  const column = (i: number) =>
    [...el.querySelectorAll('tbody tr')].map((tr) => tr.children[i].textContent?.trim());
  return { el, header, click, column };
}

const players = fwWarDetail().players;
const byPosition = (side: string) =>
  players.filter((p) => p.side === side).sort((a, b) => a.mapPosition - b.mapPosition);

describe('WarPlayersTable', () => {
  it('ouvre trié sur la colonne demandée, avec ▼ et aria-sort', async () => {
    const { header, column } = await render({ players, initialSort: 'stars' });
    expect(header('Étoiles').getAttribute('aria-sort')).toBe('descending');
    expect(header('Étoiles').textContent).toContain('▼');
    const stars = column(4).map((t) => (t?.includes('Pas attaqué') ? -1 : Number(t?.slice(-1))));
    expect(stars).toEqual([...stars].sort((a, b) => b - a));
  });

  it('un clic trie une colonne, un second inverse l’ordre (ASC ▲ / DESC ▼)', async () => {
    const lines: PlayerLine[] = byPosition('home');
    const { click, header, column } = await render({ players: lines });
    expect(header('Pos.').getAttribute('aria-sort')).toBe('ascending');
    expect(column(0)).toEqual(['1', '2', '3', '4', '5']);

    await click('Pos.');
    expect(header('Pos.').getAttribute('aria-sort')).toBe('descending');
    expect(column(0)).toEqual(['5', '4', '3', '2', '1']);

    await click('Temps'); // autre colonne : le plus rapide d'abord
    expect(header('Temps').textContent).toContain('▲');
    expect(header('Pos.').getAttribute('aria-sort')).toBeNull();
    const fastest = [...lines].sort((a, b) => a.durationSec - b.durationSec)[0];
    expect(column(1)[0]).toBe(fastest.name);

    await click('Temps');
    expect(header('Temps').textContent).toContain('▼');
    const slowest = [...lines].sort((a, b) => b.durationSec - a.durationSec)[0];
    expect(column(1)[0]).toBe(slowest.name);
  });

  it('temps d’attaque lisible, et « Pas attaqué » pour qui n’a pas joué', async () => {
    const { el } = await render({ players });
    expect(el.textContent).toMatch(/\d+ min \d{2} s/);
    expect(el.textContent).toContain('Pas attaqué');
  });

  it('colonne « Équipe » aux couleurs des teams, seulement si on donne les équipes', async () => {
    const teams = {
      home: { name: 'FW-team2', color: 'green' },
      away: { name: 'FW-team1', color: 'violet' },
    };
    const withTeams = await render({ players, teams });
    expect(withTeams.header('Équipe')).toBeDefined();
    expect(withTeams.el.querySelectorAll('tbody .team--violet')).toHaveLength(5);
    expect(withTeams.el.querySelectorAll('tbody .team--green')).toHaveLength(5);
    TestBed.resetTestingModule();
    const without = await render({ players });
    expect(without.el.querySelector('thead')?.textContent).not.toContain('Équipe');
  });

  it('colonne « Cible » (n° sur la carte + pseudo) seulement si la guerre la connaît', async () => {
    const [first, second, ...rest] = byPosition('home');
    const target = { position: 3, name: 'Zozio', stars: 2, destruction: 80, durationSec: 120 };
    const withTargets = await render({
      players: [{ ...first, targets: [target] }, { ...second, targets: [] }, ...rest],
    });
    expect(withTargets.header('Cible')).toBeDefined();
    expect(withTargets.el.querySelector('.target')?.textContent?.replace(/\s+/g, ' ')).toBe(
      'n°3 Zozio', // \s couvre aussi l'espace insécable
    );
    TestBed.resetTestingModule();
    const old = await render({ players: byPosition('home') });
    expect(old.el.querySelector('thead')?.textContent).not.toContain('Cible');
  });

  it('HDV sous la règle du tournoi : signalé en rouge', async () => {
    const [first, ...rest] = byPosition('home');
    const { el } = await render({
      players: [{ ...first, townHall: 17 }, ...rest],
      townHallRule: 18,
    });
    expect(el.querySelector('.off-rules')?.textContent?.trim()).toBe('17');
  });
});
