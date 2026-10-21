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
    const pageTitle = this.buildTitle(snapshot);
    this.title.setTitle(pageTitle ? `${pageTitle} · ${SITE_CONFIG.name}` : SITE_CONFIG.name);
  }
}
