import { Component, input, isDevMode } from '@angular/core';
import { isAllowedLogo } from '../../../core/poster/poster';
import { PosterView } from '../poster-view/poster-view';

/**
 * /affiche?g=…&gl=…&d=…&dl=…&f=5v5&j=26/10&h=22H00&r=Esport — BO3
 *
 * L'affiche construite par le bot (commande /arbitre affiche), qu'un
 * navigateur de Cloudflare photographie ensuite, comme l'image de l'arbre.
 * Paramètres d'adresse courts : l'adresse contient déjà deux URL d'images.
 */
@Component({
  selector: 'sc-poster-page',
  imports: [PosterView],
  template: `
    <sc-poster-view
      [leftName]="g()"
      [leftLogo]="logo(gl())"
      [rightName]="d()"
      [rightLogo]="logo(dl())"
      [format]="f()"
      [date]="j()"
      [time]="h()"
      [rules]="r()"
    />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class PosterPage {
  readonly g = input('');
  readonly gl = input('');
  readonly d = input('');
  readonly dl = input('');
  readonly f = input('');
  readonly j = input('');
  readonly h = input('');
  readonly r = input('');

  /**
   * Seuls les logos hébergés par Discord sont affichés : personne ne peut
   * fabriquer une adresse d'affiche montrant n'importe quelle image. En
   * développement (ng serve), des logos posés dans public/ aussi, pour
   * prévisualiser sans Discord.
   */
  protected logo(url: string): string | null {
    return isAllowedLogo(url) || (isDevMode() && url.startsWith('/')) ? url : null;
  }
}
