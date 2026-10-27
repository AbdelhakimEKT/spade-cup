import { TestBed } from '@angular/core/testing';
import { PosterView } from './poster-view';

async function render(inputs: Record<string, string | null>) {
  TestBed.configureTestingModule({ imports: [PosterView] });
  const fixture = TestBed.createComponent(PosterView);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const LOGO = 'blob:http://localhost/logo';

describe('PosterView', () => {
  it('les deux équipes (noms tels quels), le format, la date, l’heure et les règles', async () => {
    const { el } = await render({
      leftName: 'FR ESPORT',
      rightName: 'Ci E-SPORTS',
      format: '5v5',
      date: '26-10',
      time: '22h',
      rules: 'Esport — BO3',
    });
    expect(el.querySelector('.team--left .team__name')?.textContent).toBe('FR ESPORT');
    expect(el.querySelector('.team--right .team__name')?.textContent).toBe('Ci E-SPORTS');
    const facts = [...el.querySelectorAll('.fact dd')].map((d) => d.textContent?.trim());
    // Le jour dépend de l'année en cours : on vérifie seulement qu'il y en a un.
    expect(facts[1]).toMatch(/^(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche) 26\/10$/);
    expect(facts.filter((_, i) => i !== 1)).toEqual(['5V5', '22H00', 'Esport — BO3']);
    expect(el.querySelector('.fact__note')?.textContent).toMatch(/Heure de France\s*\(UTC\+[12]\)/);
    expect(el.querySelector('.poster__discord')?.textContent).toContain('discord.gg/');
  });

  it('pas « prête » tant que les logos chargent ; prête une fois chargés', async () => {
    const { el, fixture } = await render({
      leftName: 'A',
      leftLogo: LOGO,
      rightName: 'B',
      rightLogo: LOGO,
    });
    const poster = el.querySelector('.poster')!;
    expect(poster.hasAttribute('data-ready')).toBe(false);
    el.querySelectorAll('img.team__logo').forEach((img) => img.dispatchEvent(new Event('load')));
    await fixture.whenStable();
    expect(poster.hasAttribute('data-ready')).toBe(true);
  });

  it('logo illisible ou absent : les initiales, et l’affiche reste prête', async () => {
    const { el, fixture } = await render({
      leftName: 'Clash Invaders',
      leftLogo: LOGO,
      rightName: 'Spartiates',
    });
    expect(el.querySelector('.team--right .team__initials')?.textContent).toBe('SP');
    el.querySelector('.team--left img')!.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(el.querySelector('.team--left .team__initials')?.textContent).toBe('CI');
    expect(el.querySelector('.poster')!.hasAttribute('data-ready')).toBe(true);
  });

  it('nouveau logo : on attend à nouveau qu’il charge', async () => {
    const { el, fixture } = await render({ leftName: 'A', leftLogo: LOGO });
    el.querySelector('img.team__logo')!.dispatchEvent(new Event('load'));
    await fixture.whenStable();
    expect(el.querySelector('.poster')!.hasAttribute('data-ready')).toBe(true);
    fixture.componentRef.setInput('leftLogo', 'blob:http://localhost/autre');
    await fixture.whenStable();
    expect(el.querySelector('.poster')!.hasAttribute('data-ready')).toBe(false);
  });
});
