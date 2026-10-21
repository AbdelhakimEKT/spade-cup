import { TestBed } from '@angular/core/testing';
import { DEMO_TOURNAMENT } from '../data/demo-tournament';
import { BracketView } from './bracket-view';

// La démo : 16 clans, huitièmes joués, un quart en cours, un quart joué.
const bracket = DEMO_TOURNAMENT.bracket!;

async function render() {
  TestBed.configureTestingModule({ imports: [BracketView] });
  const fixture = TestBed.createComponent(BracketView);
  fixture.componentRef.setInput('bracket', bracket);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const texts = (el: HTMLElement, selector: string) =>
  [...el.querySelectorAll(selector)].map((n) => n.textContent?.trim());

describe('BracketView', () => {
  it('arbre en miroir : huitièmes → demis à gauche, finale au centre, puis l’inverse à droite', async () => {
    const { el } = await render();
    expect(texts(el, '.col--left .col__title')).toEqual(['Huitièmes', 'Quarts', 'Demis']);
    expect(texts(el, '.col--right .col__title')).toEqual(['Demis', 'Quarts', 'Huitièmes']);
    expect(el.querySelectorAll('sc-match-card')).toHaveLength(15);
  });

  it('chaque moitié contient la moitié des matchs de chaque tour', async () => {
    const { el } = await render();
    const firstLeft = el.querySelector('.col--left.col--first');
    const firstRight = el.querySelector('.col--right.col--first');
    expect(firstLeft?.querySelectorAll('sc-match-card')).toHaveLength(4);
    expect(firstRight?.textContent).toContain('Zéphyr');
    expect(firstLeft?.textContent).not.toContain('Zéphyr');
  });

  it('allume les traits des matchs joués et éteint les autres', async () => {
    const { el } = await render();
    // Les 8 huitièmes sont joués : leurs traits sortants sont allumés.
    expect(el.querySelectorAll('.col--first .slot--out-hot')).toHaveLength(8);
    // Seul le quart Zéphyr – Athéna est joué.
    expect(el.querySelectorAll('.col:not(.col--first) .slot--out-hot')).toHaveLength(1);
  });

  it('indique le tour en cours', async () => {
    const { el } = await render();
    expect(el.querySelector('.toolbar__current strong')?.textContent).toBe('Quarts de finale');
  });

  it('bascule vers la vue tour par tour', async () => {
    const { fixture, el } = await render();
    el.querySelectorAll<HTMLButtonElement>('.tab')[1].click();
    await fixture.whenStable();

    expect(el.querySelector('sc-round-view')).not.toBeNull();
    expect(el.querySelector('.bracket')).toBeNull();
  });
});
