import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { PageTitle, fullTitle } from './page-title';

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

  // Pages choisies parce qu'elles n'appellent pas le serveur. Le titre d'un
  // tournoi, qui dépend de la réponse du serveur, est testé avec sa page.
  it('ajoute le nom du site au titre de chaque page', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');

    expect(TestBed.inject(Title).getTitle()).toBe('Accueil · Spade Cup FR');
  });

  it('affiche « Page introuvable » pour une adresse inconnue', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/nimporte/quoi');

    expect(TestBed.inject(Title).getTitle()).toBe('Page introuvable · Spade Cup FR');
  });

  it('sans titre de page, juste le nom du site', () => {
    expect(fullTitle()).toBe('Spade Cup FR');
  });
});
