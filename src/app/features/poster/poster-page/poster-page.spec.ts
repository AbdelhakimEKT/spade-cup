import { TestBed } from '@angular/core/testing';
import { PosterPage } from './poster-page';

async function render(params: Record<string, string>) {
  TestBed.configureTestingModule({ imports: [PosterPage] });
  const fixture = TestBed.createComponent(PosterPage);
  for (const [k, v] of Object.entries(params)) fixture.componentRef.setInput(k, v);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const LOGO = 'https://cdn.discordapp.com/attachments/1/2/logo.png';

describe('PosterPage', () => {
  it('les deux équipes (gauche violet, droite vert), le format, la date, l’heure et les règles', async () => {
    const { el } = await render({
      g: 'Clash Invaders',
      gl: LOGO,
      d: 'Spartiates',
      dl: LOGO,
      f: '5v5',
      j: '26-10',
      h: '22h',
      r: 'Esport — BO3',
    });
    expect(el.querySelector('.team--left .team__name')?.textContent).toBe('Clash Invaders');
    expect(el.querySelector('.team--right .team__name')?.textContent).toBe('Spartiates');
    const facts = [...el.querySelectorAll('.fact dd')].map((d) => d.textContent?.trim());
    expect(facts).toEqual(['5V5', '26/10', '22H00', 'Esport — BO3']);
    expect(el.querySelector('.fact__note')?.textContent).toMatch(/Heure de France\s*\(UTC\+[12]\)/);
  });

  it('pas « prête » tant que les logos chargent ; prête une fois chargés', async () => {
    const { el, fixture } = await render({ g: 'A', gl: LOGO, d: 'B', dl: LOGO });
    const poster = el.querySelector('.poster')!;
    expect(poster.hasAttribute('data-ready')).toBe(false);
    el.querySelectorAll('img.team__logo').forEach((img) => img.dispatchEvent(new Event('load')));
    await fixture.whenStable();
    expect(poster.hasAttribute('data-ready')).toBe(true);
  });

  it('logo illisible ou d’une autre adresse que Discord : les initiales, et l’affiche reste prête', async () => {
    const { el, fixture } = await render({
      g: 'Clash Invaders',
      gl: LOGO,
      d: 'Spartiates',
      dl: 'https://evil.example/x.png',
    });
    expect(el.querySelector('.team--right .team__initials')?.textContent).toBe('SP');
    el.querySelector('.team--left img')!.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(el.querySelector('.team--left .team__initials')?.textContent).toBe('CI');
    expect(el.querySelector('.poster')!.hasAttribute('data-ready')).toBe(true);
  });
});
