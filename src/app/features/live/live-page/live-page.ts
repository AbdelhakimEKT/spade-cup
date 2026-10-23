import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LiveWar } from '../../../core/tournament/live';
import { tagToUrl } from '../../../core/tournament/tags';
import { ClanAvatar } from '../../../shared/ui/clan-avatar/clan-avatar';
import { RequestState } from '../../../shared/request-state/request-state';
import { Live } from '../data/live';

/** Toutes les 30 secondes, la page redemande les guerres au serveur. */
export const REFRESH_MS = 30_000;

/**
 * « En direct » : les guerres en train de se jouer (matchs de Spade Cup et FW
 * classiques), avec le score qui avance et les attaques de chaque joueur.
 * La page se met à jour toute seule ; un compte à rebours tourne chaque seconde.
 */
@Component({
  selector: 'sc-live-page',
  imports: [ClanAvatar, DatePipe, DecimalPipe, RequestState, RouterLink],
  templateUrl: './live-page.html',
  styleUrl: './live-page.scss',
})
export class LivePage {
  protected readonly request = inject(Live).wars();
  protected readonly wars = computed(() => (this.request.hasValue() ? this.request.value() : null));

  /** L'heure actuelle, rafraîchie chaque seconde pour les comptes à rebours. */
  protected readonly now = signal(Date.now());

  protected readonly url = tagToUrl;

  constructor() {
    const refresh = setInterval(() => this.request.reload(), REFRESH_MS);
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    // Quand on quitte la page, on arrête tout : plus aucune requête en arrière-plan.
    inject(DestroyRef).onDestroy(() => {
      clearInterval(refresh);
      clearInterval(tick);
    });
  }

  /** « En cours · fin dans 8 min 05 s », « Préparation · début dans 2 min », « Terminée ». */
  protected status(war: LiveWar): string {
    if (war.state === 'warEnded') return 'Terminée';
    const target = war.state === 'preparation' ? war.startTime : war.endTime;
    const label = war.state === 'preparation' ? 'Préparation · début dans' : 'En cours · fin dans';
    if (!target) return war.state === 'preparation' ? 'Préparation' : 'En cours';
    const left = Math.max(0, Math.round((Date.parse(target) - this.now()) / 1000));
    const min = Math.floor(left / 60);
    return `${label} ${min} min ${String(left % 60).padStart(2, '0')} s`;
  }

  /** Le camp en tête (étoiles, puis destruction), pour le mettre en valeur. */
  protected leader(war: LiveWar): 'home' | 'away' | null {
    const { home, away } = war;
    if (home.stars !== away.stars) return home.stars > away.stars ? 'home' : 'away';
    if (home.destruction !== away.destruction)
      return home.destruction > away.destruction ? 'home' : 'away';
    return null;
  }
}
