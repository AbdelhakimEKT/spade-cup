import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withNavigationErrorHandler,
} from '@angular/router';
import { routes } from './app.routes';
import { reloadOnNewVersion } from './core/navigation/new-version';
import { PageTitle } from './core/page-title';

// Formats français pour les nombres et les dates (« 97,4 » et non « 97.4 »).
registerLocaleData(localeFr);

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
      // Site mis à jour pendant que l'onglet était ouvert : la page demandée
      // n'existe plus sous son ancien nom → on la recharge (nouvelle version).
      withNavigationErrorHandler((error) => reloadOnNewVersion(error)),
    ),
    { provide: TitleStrategy, useClass: PageTitle },
    { provide: LOCALE_ID, useValue: 'fr' },
  ],
};
