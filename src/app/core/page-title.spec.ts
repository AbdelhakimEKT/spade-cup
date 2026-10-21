import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { PageTitle } from './page-title';

describe('PageTitle', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: TitleStrategy, useClass: PageTitle }],
    });
  });

  it('ajoute le nom du site au titre de chaque page', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tournois');

    expect(TestBed.inject(Title).getTitle()).toBe('Tournois · Spade Cup FR');
  });

  it('affiche « Page introuvable » pour une adresse inconnue', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/nimporte/quoi');

    expect(TestBed.inject(Title).getTitle()).toBe('Page introuvable · Spade Cup FR');
  });
});
