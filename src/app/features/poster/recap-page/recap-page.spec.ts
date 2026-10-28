import { TestBed } from '@angular/core/testing';
import { recapQuery } from '../../../core/fw/evening';
import { FRENCH_LOCALE } from '../../../../testing/french-locale';
import { RecapPage } from './recap-page';

describe('RecapPage (/affiche/bilan, photographiée par le bot)', () => {
  async function render(values: Record<string, unknown>, load = true) {
    TestBed.configureTestingModule({ imports: [RecapPage], providers: [FRENCH_LOCALE] });
    const fixture = TestBed.createComponent(RecapPage);
    for (const [name, value] of Object.entries(values)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    if (load) {
      el.querySelectorAll('td img').forEach((img) => img.dispatchEvent(new Event('load')));
      await fixture.whenStable();
    }
    return el;
  }

  const params = () =>
    Object.fromEntries(
      new URLSearchParams(
        recapQuery({
          number: 41,
          day: 'mercredi 28/10',
          wars: 3,
          attacks: 27,
          triples: 4,
          top: [
            { name: 'ACZ GINRO', th: 18, spa: 7 / 3, attacks: 3, destruction: 79.3, triples: 1 },
            { name: 'YaYa', th: 16, spa: 2, attacks: 3, destruction: 69.7, triples: 0 },
          ],
        }),
      ),
    );

  it('le tableau du top : rang, joueur, HDV, étoiles par attaque…', async () => {
    const el = await render(params());
    expect(el.querySelector('h1')?.textContent).toBe('Bilan · FW #41');
    const rows = [...el.querySelectorAll('tbody tr')].map((r) =>
      [...r.querySelectorAll('td')].map((td) => td.textContent?.trim()),
    );
    expect(rows[0]).toEqual(['🥇', 'ACZ GINRO', '18', '2,33', '3', '1', '79,3 %']);
    expect(rows[1][0]).toBe('🥈');
    expect(el.querySelector('td.th img')?.getAttribute('src')).toBe('th/th18.webp');
    expect(el.querySelector('.recap')?.hasAttribute('data-ready')).toBe(true);
  });

  it('attend les images des HDV ; top illisible : pas de plantage', async () => {
    expect(
      (await render(params(), false)).querySelector('.recap')?.hasAttribute('data-ready'),
    ).toBe(false);
    TestBed.resetTestingModule();
    expect((await render({ top: 'n’importe quoi' })).querySelectorAll('tbody tr')).toHaveLength(0);
  });
});
