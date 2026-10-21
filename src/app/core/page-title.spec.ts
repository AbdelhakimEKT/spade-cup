import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { PageTitle } from './page-title';

describe('PageTitle', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      // Même configuration que l'application : les paramètres d'URL vont dans les input().
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        { provide: TitleStrategy, useClass: PageTitle },
      ],
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

  it('le titre d’un tournoi est son vrai nom', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tournois/demo');

    expect(TestBed.inject(Title).getTitle()).toBe('Tournoi de démonstration · Spade Cup FR');
  });
});
