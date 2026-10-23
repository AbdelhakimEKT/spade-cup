import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AboutPage } from './about-page';

describe('AboutPage', () => {
  async function render() {
    TestBed.configureTestingModule({ imports: [AboutPage], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(AboutPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('explique le format et l’ordre de départage, à partir des vraies règles', async () => {
    const el = await render();
    expect(el.textContent).toContain('5 contre 5');
    expect(el.textContent).toContain('HDV 18');
    const steps = [...el.querySelectorAll('.steps li')].map((li) => li.textContent);
    expect(steps).toHaveLength(4);
    expect(steps[0]).toContain('étoiles');
    expect(steps[1]).toContain('pourcentage');
    expect(steps[2]).toContain('le moins longtemps');
  });

  it('trois parties titrées, et le code source accessible', async () => {
    const el = await render();
    expect([...el.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Les règles, en clair',
      'Sous le capot',
      "Trois problèmes que j'ai dû résoudre",
    ]);
    const github = el.querySelector<HTMLAnchorElement>(
      'a[href="https://github.com/AbdelhakimEKT/spade-cup"]',
    );
    expect(github?.rel).toBe('noopener');
    expect(el.querySelector('a[href="/joueurs"]')).not.toBeNull();
  });
});
