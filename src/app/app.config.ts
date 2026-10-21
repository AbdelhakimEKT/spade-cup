import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { routes } from './app.routes';
import { PageTitle } from './core/page-title';

/**
 * Configuration globale, lue une seule fois au démarrage (voir main.ts).
 * Un « provider » enregistre quelque chose dans le système d'injection de
 * dépendances, pour que n'importe quel composant puisse le demander.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // Les paramètres d'URL (:slug, :tag…) arrivent directement dans les
      // `input()` des pages, sans passer par ActivatedRoute.
      withComponentInputBinding(),
      // Retour en haut de page à chaque navigation, et liens vers une ancre (#section).
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    { provide: TitleStrategy, useClass: PageTitle },
  ],
};
