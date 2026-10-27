import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, linkedSignal } from '@angular/core';
import {
  franceOffset,
  initialsOf,
  normalizeDate,
  normalizeTime,
  PosterStyle,
  weekdayOf,
} from '../../../core/poster/poster';
import { SITE_CONFIG } from '../../../core/site-config';

/**
 * L'affiche d'un match, telle qu'on la voit et telle qu'on l'exporte
 * (1080 × 1350). Composant d'affichage seul : il ne sait pas d'où viennent
 * les données. Deux pages s'en servent :
 *  - /affiche (paramètres d'adresse), que le bot photographie ;
 *  - /affiche/creer, le formulaire des admins (logos choisis sur l'appareil).
 *
 * Aux couleurs de Friendly Wars, équipe de gauche en violet, de droite en
 * vert. Deux styles, même contenu : « classique » (sobre, fond quasi noir,
 * typographie forte) et « arène » (affiche de match d'esport : cadrans
 * lumineux autour des logos, faille de lumière, panneau d'infos).
 */
@Component({
  selector: 'sc-poster-view',
  imports: [NgTemplateOutlet],
  templateUrl: './poster-view.html',
  styleUrls: [
    './poster-view.scss',
    './poster-arena.scss',
    './poster-edito.scss',
    './poster-billet.scss',
  ],
})
export class PosterView {
  readonly leftName = input('');
  /** Adresse d'image déjà vérifiée par la page ; vide → initiales. */
  readonly leftLogo = input<string | null>(null);
  readonly rightName = input('');
  readonly rightLogo = input<string | null>(null);
  readonly format = input('');
  /** Tel que tapé : « 26-10 », « 26/10 »… */
  readonly date = input('');
  /** Tel que tapé : « 22h », « 22:00 »… */
  readonly time = input('');
  readonly rules = input('');
  /** « classique » (sobre) ou « arene » (affiche de match d'esport). */
  readonly design = input<PosterStyle>('classique');

  protected readonly left = computed(() => this.side(this.leftName(), this.leftLogo()));
  protected readonly right = computed(() => this.side(this.rightName(), this.rightLogo()));
  protected readonly shownFormat = computed(() => this.format().toUpperCase() || '—');
  protected readonly shownDate = computed(() => normalizeDate(this.date()) ?? (this.date() || '—'));
  /** « Mercredi » : le jour de la semaine, au-dessus de la date. */
  protected readonly weekday = computed(() => weekdayOf(this.date()));
  protected readonly shownTime = computed(() => normalizeTime(this.time()) ?? (this.time() || '—'));
  protected readonly offset = computed(() => franceOffset(this.date()));
  protected readonly shownRules = computed(() => this.rules() || '—');
  /** « discord.gg/… » : l'invitation du serveur, en bas de l'affiche (casse respectée). */
  /** Coins décorés : haut et bas, à gauche (violet) et à droite (vert). */
  protected readonly corners = ['tl', 'bl', 'tr', 'br'] as const;
  /** Style « Arène » : en bas, le panneau des infos prend toute la place. */
  protected readonly topCorners = ['tl', 'tr'] as const;
  protected readonly discord = SITE_CONFIG.discordInvite.replace(/^https:\/\//, '');

  /**
   * Logos chargés (ou en échec : on affiche alors les initiales). Le bot
   * attend `data-ready` avant de photographier, et le formulaire avant
   * d'autoriser le téléchargement. Repartent de zéro quand le logo change.
   */
  protected readonly leftDone = linkedSignal({ source: this.leftLogo, computation: () => false });
  protected readonly rightDone = linkedSignal({ source: this.rightLogo, computation: () => false });
  protected readonly leftFailed = linkedSignal({ source: this.leftLogo, computation: () => false });
  protected readonly rightFailed = linkedSignal({
    source: this.rightLogo,
    computation: () => false,
  });
  readonly ready = computed(
    () => (this.leftDone() || !this.left().logo) && (this.rightDone() || !this.right().logo),
  );

  protected logoLoaded(side: 'left' | 'right'): void {
    (side === 'left' ? this.leftDone : this.rightDone).set(true);
  }

  /** Logo illisible (lien expiré, format inconnu) : les initiales prennent sa place. */
  protected logoFailed(side: 'left' | 'right'): void {
    (side === 'left' ? this.leftFailed : this.rightFailed).set(true);
    this.logoLoaded(side);
  }

  private side(name: string, logo: string | null) {
    const clean = name.trim() || 'À définir';
    // Nom long (« Les Spartiates du Nord ») : écrit plus petit, sur deux lignes au plus.
    return {
      name: clean,
      logo: logo || null,
      initials: initialsOf(clean),
      long: clean.length > 14,
      // Style « Éditorial » : le nom remplit sa ligne (court → très grand).
      fit: Math.round(Math.min(128, Math.max(52, 1240 / clean.length))),
    };
  }
}
