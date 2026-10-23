import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SITE_CONFIG } from '../../core/site-config';
import { LiveStatus } from '../../core/live/live-status';
import { Theme } from '../../core/theme/theme';

@Component({
  selector: 'sc-site-header',
  imports: [NgOptimizedImage, RouterLink, RouterLinkActive],
  templateUrl: './site-header.html',
  styleUrl: './site-header.scss',
})
export class SiteHeader {
  protected readonly theme = inject(Theme);
  protected readonly live = inject(LiveStatus);
  protected readonly discordInvite = SITE_CONFIG.discordInvite;

  /** Le bouton annonce l'action qu'il déclenche, pas l'état actuel. */
  protected readonly themeToggleLabel = computed(() =>
    this.theme.current() === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre',
  );
}
