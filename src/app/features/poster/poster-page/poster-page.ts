import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import {
  franceOffset,
  initialsOf,
  isAllowedLogo,
  normalizeDate,
  normalizeTime,
} from '../../../core/poster/poster';
import { SITE_CONFIG } from '../../../core/site-config';

/** Un camp de l'affiche, prêt à dessiner. */
interface PosterSide {
  readonly name: string;
  /** `null` : pas de logo valable → initiales à la place. */
  readonly logo: string | null;
  readonly initials: string;
}

/**
 * Affiche d'un match, aux couleurs de Friendly Wars : sobre, façon affiche
 * d'esport (fond quasi noir, typographie forte), équipe de gauche soulignée
 * en violet, de droite en vert. Tout vient de l'adresse :
 *   /affiche?g=…&gl=…&d=…&dl=…&f=5v5&j=26/10&h=22H00&r=Esport — BO3
 * C'est le bot qui la construit (commande /arbitre affiche) puis la fait
 * photographier par un navigateur, comme l'image de l'arbre.
 */
@Component({
  selector: 'sc-poster-page',
  imports: [NgTemplateOutlet],
  templateUrl: './poster-page.html',
  styleUrl: './poster-page.scss',
})
export class PosterPage {
  // Paramètres d'adresse courts : l'adresse contient déjà deux URL d'images.
  readonly g = input('');
  readonly gl = input('');
  readonly d = input('');
  readonly dl = input('');
  readonly f = input('');
  readonly j = input('');
  readonly h = input('');
  readonly r = input('');

  protected readonly left = computed(() => this.side(this.g(), this.gl()));
  protected readonly right = computed(() => this.side(this.d(), this.dl()));
  protected readonly format = computed(() => this.f().toUpperCase() || '—');
  protected readonly date = computed(() => normalizeDate(this.j()) ?? (this.j() || '—'));
  protected readonly time = computed(() => normalizeTime(this.h()) ?? (this.h() || '—'));
  protected readonly offset = computed(() => franceOffset(this.j()));
  protected readonly rules = computed(() => this.r() || '—');
  /** « discord.gg/… » : l'invitation du serveur, en bas de l'affiche (casse respectée). */
  protected readonly discord = SITE_CONFIG.discordInvite.replace(/^https:\/\//, '');

  /**
   * Logos chargés (ou en échec : on affiche alors les initiales). Le bot
   * attend `data-ready` avant de photographier, sinon l'image partirait avec
   * un cadre vide.
   */
  protected readonly leftDone = signal(false);
  protected readonly rightDone = signal(false);
  protected readonly leftFailed = signal(false);
  protected readonly rightFailed = signal(false);
  protected readonly ready = computed(
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

  private side(name: string, logo: string): PosterSide {
    const clean = name.trim() || 'À définir';
    return { name: clean, logo: isAllowedLogo(logo) ? logo : null, initials: initialsOf(clean) };
  }
}
