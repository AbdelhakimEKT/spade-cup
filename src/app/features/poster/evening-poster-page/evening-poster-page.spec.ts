import { TestBed } from '@angular/core/testing';
import { EveningPosterPage } from './evening-poster-page';

describe('EveningPosterPage (/affiche/soiree, fiche photographiée par le bot)', () => {
  /** La fiche ; `load` : les images des HDV finissent de charger. */
  async function render(values: Record<string, unknown>, load = true) {
    TestBed.configureTestingModule({ imports: [EveningPosterPage] });
    const fixture = TestBed.createComponent(EveningPosterPage);
    for (const [name, value] of Object.entries(values)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    if (load) {
      el.querySelectorAll('img[width]').forEach((img) => img.dispatchEvent(new Event('load')));
      await fixture.whenStable();
    }
    return el;
  }
  const clean = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();
  const base = { n: '41', j: '28/10', h: '21h00', m: 'random', r: '4 rounds' };

  it('FW #41, les trois temps, le format avec les HDV', async () => {
    const el = await render(base);
    expect(el.querySelector('.poster.tl[data-ready]')).not.toBeNull();
    expect(clean(el.querySelector('.tl__title'))).toBe('FW #41');
    expect([...el.querySelectorAll('.tl__steps b')].map(clean)).toEqual([
      '20H45',
      '~ 20H50',
      '21H00',
    ]);
    expect(clean(el.querySelector('.tl__mode'))).toBe('Équipes random');
    expect(el.querySelector('.tl__th-main')?.getAttribute('src')).toBe('th/th18.webp');
    expect([...el.querySelectorAll('.tl__th-more img')].map((i) => i.getAttribute('src'))).toEqual(
      ['th/th17.webp', 'th/th16.webp'],
    );
    expect([...el.querySelectorAll('.tl__rules li')].map(clean)).toContain('4 rounds');
    expect(clean(el.querySelector('.tl__late'))).toContain('en cours de route');
  });

  it('le bot attend les images des HDV avant de photographier', async () => {
    const el = await render(base, false);
    expect(el.querySelector('.poster')?.hasAttribute('data-ready')).toBe(false);
  });

  it('équipes libres ; paramètres absents : pas de plantage', async () => {
    expect(clean((await render({ m: 'libre' })).querySelector('.tl__mode'))).toBe(
      'Équipes libres',
    );
    TestBed.resetTestingModule();
    const el = await render({ n: undefined, j: undefined, h: undefined });
    expect(clean(el.querySelector('.tl__title'))).toBe('FW #?');
  });
});
