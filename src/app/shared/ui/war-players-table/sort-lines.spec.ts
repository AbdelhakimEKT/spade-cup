import { PlayerLine } from '../../../core/tournament/coc-war';
import { firstDir, sortLines } from './sort-lines';

const line = (name: string, o: Partial<PlayerLine> = {}): PlayerLine => ({
  tag: `#${name}`,
  name,
  side: 'home',
  townHall: 18,
  mapPosition: 1,
  attacks: 1,
  stars: 2,
  destruction: 80,
  triples: 0,
  durationSec: 120,
  ...o,
});

const LINES = [
  line('Volt', { mapPosition: 1, stars: 3, destruction: 100, durationSec: 150 }),
  line('Nyx', { mapPosition: 2, stars: 2, destruction: 75, durationSec: 90 }),
  line('Zen', { mapPosition: 3, attacks: 0, stars: 0, destruction: 0, durationSec: 0 }),
  line('Ace', { mapPosition: 4, stars: 2, destruction: 88, durationSec: 175 }),
];
const names = (lines: PlayerLine[]) => lines.map((l) => l.name);

describe('sortLines', () => {
  it('par place sur la carte, dans les deux sens', () => {
    expect(names(sortLines(LINES, 'position', 'asc'))).toEqual(['Volt', 'Nyx', 'Zen', 'Ace']);
    expect(names(sortLines(LINES, 'position', 'desc'))).toEqual(['Ace', 'Zen', 'Nyx', 'Volt']);
  });

  it('par temps : le plus rapide d’abord (ou le plus lent) ; qui n’a pas attaqué reste en bas', () => {
    expect(names(sortLines(LINES, 'duration', 'asc'))).toEqual(['Nyx', 'Volt', 'Ace', 'Zen']);
    expect(names(sortLines(LINES, 'duration', 'desc'))).toEqual(['Ace', 'Volt', 'Nyx', 'Zen']);
  });

  it('par destruction, et par étoiles avec le % pour départager', () => {
    expect(names(sortLines(LINES, 'destruction', 'desc'))).toEqual(['Volt', 'Ace', 'Nyx', 'Zen']);
    expect(names(sortLines(LINES, 'destruction', 'asc'))).toEqual(['Nyx', 'Ace', 'Volt', 'Zen']);
    expect(names(sortLines(LINES, 'stars', 'desc'))).toEqual(['Volt', 'Ace', 'Nyx', 'Zen']);
  });

  it('par pseudo et par équipe (ordre alphabétique français)', () => {
    expect(names(sortLines(LINES, 'name', 'asc'))).toEqual(['Ace', 'Nyx', 'Volt', 'Zen']);
    const teams = [line('A', { side: 'away' }), line('B', { side: 'home' })];
    const team = (l: PlayerLine) => (l.side === 'home' ? 'FW-team2' : 'FW-team1');
    expect(names(sortLines(teams, 'team', 'asc', team))).toEqual(['A', 'B']);
    expect(names(sortLines(teams, 'team', 'desc', team))).toEqual(['B', 'A']);
  });

  it('ne modifie pas la liste reçue', () => {
    const copy = [...LINES];
    sortLines(LINES, 'name', 'asc');
    expect(LINES).toEqual(copy);
  });

  it('premier clic : les meilleurs d’abord pour étoiles, % et HDV ; sinon croissant', () => {
    expect(firstDir('stars')).toBe('desc');
    expect(firstDir('destruction')).toBe('desc');
    expect(firstDir('townHall')).toBe('desc');
    expect(firstDir('duration')).toBe('asc');
    expect(firstDir('position')).toBe('asc');
  });
});
