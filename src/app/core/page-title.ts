import { Service, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { SITE_CONFIG } from './site-config';

/**
 * Titre de l'onglet du navigateur. Chaque route déclare un titre court
 * (« Tournois ») ; on y ajoute le nom du site : « Tournois · Spade Cup FR ».
 */
@Service({ autoProvided: false })
export class PageTitle extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.title.setTitle(fullTitle(this.buildTitle(snapshot)));
  }
}

/**
 * Format commun à tous les titres. Exporté pour les pages qui ne connaissent
 * leur vrai titre qu'après un chargement (le nom d'un tournoi, par exemple).
 */
export function fullTitle(pageTitle?: string): string {
  return pageTitle ? `${pageTitle} · ${SITE_CONFIG.name}` : SITE_CONFIG.name;
}
