import { TestBed } from '@angular/core/testing';
import { EveningPosterPage } from './evening-poster-page';

describe('EveningPosterPage (/affiche/soiree, photographiée par le bot)', () => {
  async function render(values: Record<string, unknown>) {
    TestBed.configureTestingModule({ imports: [EveningPosterPage] });
    const fixture = TestBed.createComponent(EveningPosterPage);
    for (const [name, value] of Object.entries(values)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('inscriptions ouvertes, date avec le jour, heure, programme, venir en cours de route', async () => {
    const el = await render({ j: '28-10', h: '20h30', n: '3 FW · 15v15' });
    expect(el.querySelector('.poster[data-ready]')).not.toBeNull();
    expect(el.querySelector('.call__title')?.textContent).toMatch(/Inscriptions\s+ouvertes/);
    expect(el.querySelector('.call__late')?.textContent).toContain('en cours de route');
    const facts = [...el.querySelectorAll('.fact dd')].map((d) => d.textContent?.trim());
    expect(facts[0]).toMatch(/^\p{Lu}\p{Ll}+ 28\/10$/u);
    expect(facts.slice(1)).toEqual(['20H30', '3 FW · 15v15']);
  });

  it('paramètres absents : pas de plantage, programme par défaut', async () => {
    const el = await render({ j: undefined, n: undefined });
    expect(el.querySelector('.fact__programme')?.textContent?.trim()).toBe('FW à la chaîne');
  });
});
