import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { friendlyWar } from '../../../../testing/fixtures';
import { FRENCH_LOCALE } from '../../../../testing/french-locale';
import { FriendlyWarSummary } from '../../../core/tournament/stats';
import { FwWarList } from './fw-war-list';

async function render(wars: FriendlyWarSummary[]) {
  TestBed.configureTestingModule({
    imports: [FwWarList],
    providers: [provideRouter([]), FRENCH_LOCALE],
  });
  const fixture = TestBed.createComponent(FwWarList);
  fixture.componentRef.setInput('wars', wars);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

/** friendlyWar() : FW-team2 (enregistrée « domicile ») gagne 13★ à 11★. */
const team1Wins: FriendlyWarSummary = {
  ...friendlyWar(2),
  home: { ...friendlyWar().home, stars: 4 },
  away: { ...friendlyWar().away, stars: 8 },
  winner: 'away',
};

describe('FwWarList', () => {
  it('chaque FW mène à son détail', async () => {
    const el = await render([friendlyWar(7)]);
    expect(el.querySelector('a.war')?.getAttribute('href')).toBe('/fw/7');
  });

  it('team 1 (violet) toujours à gauche, team 2 (vert) à droite', async () => {
    const el = await render([friendlyWar()]);
    const sides = el.querySelectorAll('.side');
    expect(sides[0].textContent).toContain('FW-team1');
    expect(sides[0].classList).toContain('team--violet');
    expect(sides[1].textContent).toContain('FW-team2');
    expect(sides[1].classList).toContain('team--green');
  });

  it('le gagnant a son trophée et sa pastille de couleur, le perdant est estompé', async () => {
    const el = await render([friendlyWar()]);
    const [left, right] = [...el.querySelectorAll('.side')];
    expect(right.textContent).toContain('🏆');
    expect(left.classList).toContain('side--lost');
    expect(right.classList).not.toContain('side--lost');
    const chip = el.querySelector('.war__result .chip')!;
    expect(chip.textContent).toContain('Victoire FW-team2');
    expect(chip.classList).toContain('chip--green');
  });

  it('bilan des victoires en tête : team 1 à gauche, team 2 à droite', async () => {
    const el = await render([friendlyWar(1), team1Wins, { ...team1Wins, id: 3 }]);
    const tally = el.querySelector('.tally')!;
    expect(tally.querySelector('.team--violet')?.textContent?.trim()).toBe('FW-team1 2');
    expect(tally.querySelector('.team--green')?.textContent?.trim()).toBe('1 FW-team2');
  });

  it('égalité parfaite et relevé partiel : signalés', async () => {
    const el = await render([{ ...friendlyWar(), winner: null, partial: true }]);
    const chips = [...el.querySelectorAll('.war__result .chip')].map((c) => c.textContent?.trim());
    expect(chips).toEqual(['Égalité parfaite', 'relevé partiel']);
    expect(el.querySelector('.side--lost')).toBeNull();
    expect(el.querySelector('.tally')?.textContent).toContain('1 égalité');
  });
});
