import { TestBed } from '@angular/core/testing';
import { DEMO_TOURNAMENT } from '../data/demo-tournament';
import { BracketView } from './bracket-view';

// La démo : 8 clans, premier tour joué, une demi-finale jouée, finale à venir.
const bracket = DEMO_TOURNAMENT.bracket!;

async function render() {
  TestBed.configureTestingModule({ imports: [BracketView] });
  const fixture = TestBed.createComponent(BracketView);
  fixture.componentRef.setInput('bracket', bracket);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const titles = (el: HTMLElement, selector: string) =>
  [...el.querySelectorAll(selector)].map((n) => n.textContent?.trim());

describe('BracketView', () => {
  it('arbre complet : une colonne par tour, et les 7 matchs', async () => {
    const { el } = await render();
    expect(titles(el, '.round__title')).toEqual(['Quarts de finale', 'Demi-finales', 'Finale']);
    expect(el.querySelectorAll('sc-match-card')).toHaveLength(7);
  });

  it('indique le tour en cours (la 2e demi-finale reste à jouer)', async () => {
    const { el } = await render();
    expect(el.querySelector('.toolbar__current strong')?.textContent).toBe('Demi-finales');
  });

  it('tour par tour : s’ouvre sur le tour en cours, puis change de tour au clic', async () => {
    const { fixture, el } = await render();
    (el.querySelectorAll('.switch__btn')[1] as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(el.querySelectorAll('.round-list sc-match-card')).toHaveLength(2); // les demies

    const buttons = el.querySelectorAll<HTMLButtonElement>('.round-picker__btn');
    buttons[0].click(); // quarts de finale
    await fixture.whenStable();

    expect(el.querySelectorAll('.round-list sc-match-card')).toHaveLength(4);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
  });
});
