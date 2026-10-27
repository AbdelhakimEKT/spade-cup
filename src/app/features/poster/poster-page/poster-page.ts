import { Component, input, isDevMode } from '@angular/core';
import { isAllowedLogo, posterStyleOf } from '../../../core/poster/poster';
import { PosterView } from '../poster-view/poster-view';

/**
 * /affiche?g=…&gl=…&d=…&dl=…&f=5v5&j=26/10&h=22H00&r=Esport — BO3[&s=arene]
 *
 * L'affiche construite par le bot (commande /arbitre affiche), qu'un
 * navigateur de Cloudflare photographie ensuite, comme l'image de l'arbre.
 * Paramètres d'adresse courts : l'adresse contient déjà deux URL d'images.
 */
/** Paramètre d'adresse : absent (ou répété) → texte vide. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

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
      [design]="style(s())"
    />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class PosterPage {
  // Un paramètre absent de l'adresse arrive `undefined` : on le lit comme vide.
  readonly g = input('', { transform: text });
  readonly gl = input('', { transform: text });
  readonly d = input('', { transform: text });
  readonly dl = input('', { transform: text });
  readonly f = input('', { transform: text });
  readonly j = input('', { transform: text });
  readonly h = input('', { transform: text });
  readonly r = input('', { transform: text });
  /** Style : « arene », sinon classique. */
  readonly s = input('', { transform: text });

  protected readonly style = posterStyleOf;

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
