import { Component, computed, input } from '@angular/core';
import {
  franceOffset,
  normalizeDate,
  normalizeTime,
  weekdayOf,
} from '../../../core/poster/poster';
import { SITE_CONFIG } from '../../../core/site-config';

/** Paramètre d'adresse : absent (ou répété) → texte vide. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * /affiche/soiree?j=28/10&h=20H30[&n=3 FW · 15v15]
 *
 * L'affiche d'une soirée FW « chill » : « Inscriptions ouvertes », la date,
 * l'heure, et le rappel qu'on peut venir en cours de route. Le bot la
 * photographie (/fw soiree) et la publie avec le bouton « Je m'inscris ».
 * Même charte que l'affiche d'un match (mêmes styles : poster-view.scss).
 */
@Component({
  selector: 'sc-evening-poster-page',
  templateUrl: './evening-poster-page.html',
  styleUrls: ['../poster-view/poster-view.scss', './evening-poster-page.scss'],
})
export class EveningPosterPage {
  readonly j = input('', { transform: text });
  readonly h = input('', { transform: text });
  /** Le programme, facultatif : « 3 FW · 15v15 ». */
  readonly n = input('', { transform: text });

  protected readonly shownDate = computed(() => normalizeDate(this.j()) ?? (this.j() || '—'));
  protected readonly weekday = computed(() => weekdayOf(this.j()));
  protected readonly shownTime = computed(() => normalizeTime(this.h()) ?? (this.h() || '—'));
  protected readonly offset = computed(() => franceOffset(this.j()));
  protected readonly programme = computed(() => this.n().trim() || 'FW à la chaîne');
  /** Coins décorés, comme l'affiche d'un match. */
  protected readonly corners = ['tl', 'bl', 'tr', 'br'] as const;
  protected readonly discord = SITE_CONFIG.discordInvite.replace(/^https:\/\//, '');
}
