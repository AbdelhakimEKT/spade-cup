import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from './home-page';

describe('HomePage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideRouter([])],
    });
  });

  it('présente les 4 étapes d’un tournoi, dans l’ordre', async () => {
    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();
    const titles = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.step__title')].map(
      (h) => h.textContent?.trim(),
    );

    expect(titles).toEqual(['Inscription', 'Tirage', 'Guerres amicales', 'Classement']);
  });

  it('mène vers la liste des tournois', async () => {
    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('a[href="/tournois"]'),
    ).not.toBeNull();
  });
});
