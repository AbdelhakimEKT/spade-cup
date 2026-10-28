import { TestBed } from '@angular/core/testing';
import { EveningPosterPage } from './evening-poster-page';

describe('EveningPosterPage (/affiche/soiree, fiche photographiée par le bot)', () => {
  async function render(values: Record<string, unknown>) {
    TestBed.configureTestingModule({ imports: [EveningPosterPage] });
    const fixture = TestBed.createComponent(EveningPosterPage);
    for (const [name, value] of Object.entries(values)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('FW #41 : date, horaires (H − 15, H − 10), mode, format et règles, en cours de route', async () => {
    const el = await render({ n: '41', j: '28/10', h: '21h00', m: 'random', r: '4 rounds' });
    expect(el.querySelector('.poster[data-ready]')).not.toBeNull();
    expect(el.querySelector('.session__title')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'FW #41',
    );
    const facts = [...el.querySelectorAll('.fact dd')].map((d) => d.textContent?.trim());
    expect(facts).toEqual(['20H45', '~ 20H50', 'Random']);
    expect(el.querySelector('.session__format-name')?.textContent).toBe('HDV 18 mode e-sport');
    const rules = [...el.querySelectorAll('.session__rules li')].map((li) => li.textContent);
    expect(rules).toEqual([
      '5 min de préparation',
      '15 min de guerre',
      '1 attaque par joueur',
      '4 rounds',
      'HDV 17 et HDV 16 acceptés',
    ]);
    expect(el.querySelector('.session__late')?.textContent).toContain('en cours de route');
  });

  it('équipes libres ; paramètres absents : pas de plantage', async () => {
    expect((await render({ m: 'libre' })).querySelector('.session__mode')?.textContent).toBe(
      'Libres',
    );
    TestBed.resetTestingModule();
    const el = await render({ n: undefined, j: undefined, h: undefined });
    expect(el.querySelector('.session__number')?.textContent).toBe('#?');
  });
});
