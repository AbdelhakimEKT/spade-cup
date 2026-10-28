import { DecimalPipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { parseRecapTop } from '../../../core/fw/evening';
import { SITE_CONFIG } from '../../../core/site-config';

/** Paramètre d'adresse : absent (ou répété) → texte vide. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * /affiche/bilan?n=41&d=mercredi 28/10&w=3&a=27&x=8&top=[…]
 *
 * Le bilan d'une soirée FW en un tableau simple : le top 5 (étoiles par
 * attaque), avec l'HDV de chacun. Le bot le photographie pour #résultats
 * (/fw bilan). Mêmes couleurs que les affiches.
 */
@Component({
  selector: 'sc-recap-page',
  imports: [DecimalPipe],
  templateUrl: './recap-page.html',
  styleUrl: './recap-page.scss',
})
export class RecapPage {
  readonly n = input('', { transform: text });
  readonly d = input('', { transform: text });
  readonly w = input('', { transform: text });
  readonly a = input('', { transform: text });
  readonly x = input('', { transform: text });
  readonly top = input('', { transform: text });

  protected readonly players = computed(() => parseRecapTop(this.top()));
  protected readonly medals = ['🥇', '🥈', '🥉'];
  protected readonly discord = SITE_CONFIG.discordInvite.replace(/^https:\/\//, '');
  protected thImage(th: number | null): string | null {
    return th && th >= 9 && th <= 18 ? `th/th${th}.webp` : null;
  }

  /** Images des HDV chargées (ou en échec) : le bot attend qu'elles le soient. */
  private readonly loaded = signal(0);
  protected readonly ready = computed(
    () => this.loaded() >= this.players().filter((p) => this.thImage(p.th)).length,
  );
  protected imageDone(): void {
    this.loaded.update((n) => n + 1);
  }
}
