import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { PlayerCard as Card } from '../../../core/fw/player-card';
import { SITE_CONFIG } from '../../../core/site-config';
import { formatDuration } from '../../../core/tournament/format';
import { tagToUrl } from '../../../core/tournament/tags';
import { QrCode } from '../../../shared/ui/qr-code/qr-code';

/**
 * La carte d'un joueur, à partager (1080 × 1350, comme les affiches) : son
 * HDV, ses perfs, sa forme, sa place au classement, et un QR code vers sa
 * fiche sur le site. Mêmes couleurs et décor que les affiches.
 */
@Component({
  selector: 'sc-player-card',
  imports: [DecimalPipe, PercentPipe, QrCode],
  templateUrl: './player-card.html',
  styleUrls: ['../../poster/poster-view/poster-view.scss', './player-card.scss'],
})
export class PlayerCardView {
  readonly card = input.required<Card>();

  /** L'adresse de sa fiche : le QR code y mène. */
  protected readonly profileUrl = computed(
    () => `${SITE_CONFIG.siteUrl}/joueurs/${tagToUrl(this.card().tag)}`,
  );
  protected readonly shownUrl = computed(() => this.profileUrl().replace(/^https:\/\//, ''));
  protected readonly discord = SITE_CONFIG.discordInvite.replace(/^https:\/\//, '');
  /** Image de son HDV (public/th : HDV 9 à 18). */
  protected readonly thImage = computed(() => {
    const th = this.card().townHall;
    return th && th >= 9 && th <= 18 ? `th/th${th}.webp` : null;
  });
  /** Nom long : écrit plus petit pour tenir sur la carte. */
  protected readonly nameSize = computed(() =>
    Math.round(Math.min(96, Math.max(54, 1000 / Math.max(1, [...this.card().name].length)))),
  );
  protected readonly duration = formatDuration;
  protected readonly corners = ['tl', 'bl', 'tr', 'br'] as const;

  /** L'image de l'HDV est chargée (ou absente) : la carte peut être photographiée. */
  private readonly imageDone = signal(false);
  readonly ready = computed(() => this.imageDone() || this.thImage() === null);
  protected thLoaded(): void {
    this.imageDone.set(true);
  }
}
