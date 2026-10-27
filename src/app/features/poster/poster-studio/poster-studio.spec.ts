import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PosterStudio } from './poster-studio';

async function render() {
  localStorage.setItem('fw.admin.unlocked', 'yes');
  TestBed.configureTestingModule({
    imports: [PosterStudio],
    providers: [provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(PosterStudio);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const fill = async (name: string, value: string) => {
    const input = el.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
    await fixture.whenStable();
  };
  const pick = async (index: number, file: File) => {
    const input = el.querySelectorAll<HTMLInputElement>('input[type=file]')[index];
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  };
  return { el, fixture, fill, pick };
}

describe('PosterStudio (/affiche/creer)', () => {
  afterEach(() => localStorage.removeItem('fw.admin.unlocked'));

  it('l’aperçu suit le formulaire, à chaque frappe', async () => {
    const { el, fill } = await render();
    await fill('left-name', 'FR ESPORT');
    await fill('right-name', 'Ci E-SPORTS');
    await fill('date', '26-10');
    await fill('time', '22h');
    await fill('rules', 'Esport — BO3');
    expect(el.querySelector('.team--left .team__name')?.textContent).toBe('FR ESPORT');
    expect(el.querySelector('.team--right .team__name')?.textContent).toBe('Ci E-SPORTS');
    const facts = [...el.querySelectorAll('.fact dd')].map((d) => d.textContent?.trim());
    // « Lundi 26/10 » : le jour dépend de l'année en cours.
    expect(facts[1]).toMatch(/^\p{Lu}\p{Ll}+ 26\/10$/u);
    expect(facts.filter((_, i) => i !== 1)).toEqual(['5V5', '22H00', 'Esport — BO3']);
  });

  it('logo choisi sur l’appareil : affiché dans l’aperçu (sans rien envoyer)', async () => {
    const created = vi.fn(() => 'blob:http://localhost/logo-fr');
    URL.createObjectURL = created;
    URL.revokeObjectURL = vi.fn();
    const { el, pick } = await render();
    await pick(0, new File(['png'], 'fr.png', { type: 'image/png' }));
    expect(created).toHaveBeenCalledOnce();
    expect(el.querySelector('.team--left img')?.getAttribute('src')).toBe(
      'blob:http://localhost/logo-fr',
    );
  });

  it('fichier qui n’est pas une image : refusé avec un message', async () => {
    const { el, pick } = await render();
    await pick(1, new File(['%PDF'], 'logo.pdf', { type: 'application/pdf' }));
    expect(el.querySelector('[role=alert]')?.textContent).toContain("n'est pas une image");
    expect(el.querySelector('.team--right img')).toBeNull();
  });

  it('date ou heure illisible : signalée, et pas de téléchargement possible', async () => {
    const { el, fill } = await render();
    await fill('date', 'demain');
    expect(el.textContent).toContain('Date illisible');
    expect(el.querySelector<HTMLButtonElement>('.download')!.disabled).toBe(true);
    await fill('date', '26/10');
    expect(el.querySelector<HTMLButtonElement>('.download')!.disabled).toBe(false);
  });

  it('format au choix : 5v5, 10v10, 15v15', async () => {
    const { el, fill } = await render();
    expect(
      [...el.querySelectorAll('select[name=format] option')].map((o) => o.textContent),
    ).toEqual(['5v5', '10v10', '15v15']);
    await fill('format', '15v15');
    expect(el.querySelector('.fact dd')?.textContent?.trim()).toBe('15V15');
  });
});
