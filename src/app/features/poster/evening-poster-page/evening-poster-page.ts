import { Component, computed, input, signal } from '@angular/core';
import {
  DEFAULT_DETAILS,
  parisClock,
  CLOSE_BEFORE_MS,
  TEAMS_BEFORE_MS,
} from '../../../core/fw/session';
import {
  franceDateTime,
  franceOffset,
  normalizeDate,
  normalizeTime,
  weekdayOf,
} from '../../../core/poster/poster';
import { SITE_CONFIG } from '../../../core/site-config';
import { thImageSrc } from '../../../core/th-image';

/** Une image d'HDV, avec son vrai niveau (un HDV 19 montre l'image du 18 en attendant). */
interface ThImage {
  readonly level: number;
  readonly src: string;
}

function thImage(level: string | undefined): ThImage | null {
  const n = Number(level);
  const src = thImageSrc(n);
  return src ? { level: n, src } : null;
}

/** Paramètre d'adresse : absent (ou répété) → texte vide. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * /affiche/soiree?n=41&j=28/10&h=21H00&m=random&f=…&p=…&g=…&a=…&r=…&t=…
 *
 * La fiche d'une soirée FW (« FW #41 ») : date et heure, fin des inscriptions
 * (H − 15), équipes affichées (H − 10), le format et ses règles, le mode des
 * équipes, et le rappel qu'on peut venir en cours de route. Le bot la
 * photographie (/fw lancer, /fw modifier) pour l'annonce. Même charte que
 * l'affiche d'un match (mêmes styles : poster-view.scss).
 */
@Component({
  selector: 'sc-evening-poster-page',
  templateUrl: './evening-poster-page.html',
  styleUrls: ['../poster-view/poster-view.scss', './evening-poster-page.scss'],
})
export class EveningPosterPage {
  /** Numéro de la soirée. */
  readonly n = input('', { transform: text });
  readonly j = input('', { transform: text });
  readonly h = input('', { transform: text });
  /** Équipes : « random » ou « libre ». */
  readonly m = input('', { transform: text });
  /** Les infos de la fiche (vides : valeurs habituelles). */
  readonly f = input('', { transform: text });
  readonly p = input('', { transform: text });
  readonly g = input('', { transform: text });
  readonly a = input('', { transform: text });
  readonly r = input('', { transform: text });
  readonly t = input('', { transform: text });

  protected readonly number = computed(() => this.n().replace(/\D/g, '') || '?');
  protected readonly shownDate = computed(() => normalizeDate(this.j()) ?? (this.j() || '—'));
  protected readonly weekday = computed(() => weekdayOf(this.j()));
  protected readonly shownTime = computed(() => normalizeTime(this.h()) ?? (this.h() || '—'));
  protected readonly offset = computed(() => franceOffset(this.j()));
  /** Fin des inscriptions et équipes, d'après l'heure de début. */
  protected readonly clocks = computed(() => {
    const start = franceDateTime(this.j(), this.h());
    const at = (before: number) =>
      start === null ? '—' : parisClock(start - before).toUpperCase();
    return { close: at(CLOSE_BEFORE_MS), teams: at(TEAMS_BEFORE_MS) };
  });
  protected readonly random = computed(() => this.m() !== 'libre');
  protected readonly format = computed(() => this.f().trim() || DEFAULT_DETAILS.format);
  /** Les règles, en pastilles. */
  protected readonly rules = computed(() =>
    [
      [this.p(), DEFAULT_DETAILS.preparation],
      [this.g(), DEFAULT_DETAILS.war],
      [this.a(), DEFAULT_DETAILS.attacks],
      [this.r(), DEFAULT_DETAILS.rounds],
      [this.t(), DEFAULT_DETAILS.accepted],
    ].map(([typed, fallback]) => typed.trim() || fallback),
  );
  /** Les HDV acceptés (« HDV 17 et HDV 16 acceptés » → 17, 16 ; « FULL HDV18 et HDV19 » → 18, 19). */
  private readonly acceptedLevels = computed(() =>
    [...(this.t().trim() || DEFAULT_DETAILS.accepted).matchAll(/\d+/g)].map((m) => m[0]),
  );
  /**
   * Le grand HDV : celui du format (« HDV 18 mode e-sport » → 18), sinon le
   * plus haut des HDV acceptés (« Mode e-sport », « FULL HDV18 et HDV19 » → 19).
   */
  protected readonly mainTh = computed(() => {
    const fromFormat = thImage(/HDV\s*(\d+)/i.exec(this.format())?.[1]);
    if (fromFormat) return fromFormat;
    const levels = this.acceptedLevels().map(Number).filter(Number.isFinite);
    return levels.length ? thImage(String(Math.max(...levels))) : null;
  });
  /** Les autres HDV acceptés, en petit (sans répéter le grand). */
  protected readonly acceptedTh = computed(() =>
    this.acceptedLevels()
      .map((level) => thImage(level))
      .filter((th): th is ThImage => th !== null && th.level !== this.mainTh()?.level),
  );
  /** Images d'HDV chargées (ou en échec) : le bot attend qu'elles le soient toutes. */
  private readonly loaded = signal(0);
  protected readonly ready = computed(
    () => this.loaded() >= (this.mainTh() ? 1 : 0) + this.acceptedTh().length,
  );
  protected imageDone(): void {
    this.loaded.update((n) => n + 1);
  }
  /** Coins décorés, comme l'affiche d'un match. */
  protected readonly corners = ['tl', 'bl', 'tr', 'br'] as const;
  protected readonly discord = SITE_CONFIG.discordInvite.replace(/^https:\/\//, '');
}
