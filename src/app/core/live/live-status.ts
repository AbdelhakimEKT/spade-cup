import { httpResource } from '@angular/common/http';
import { DestroyRef, Service, computed, inject } from '@angular/core';
import { SITE_CONFIG } from '../site-config';
import { LiveWar } from '../tournament/live';

/** Toutes les minutes, le menu redemande s'il se passe quelque chose. */
export const STATUS_REFRESH_MS = 60_000;

/**
 * Y a-t-il une guerre EN COURS (préparation ou combat) en ce moment ? Sert au
 * point rouge du lien « Direct » dans le menu : il n'apparaît que si c'est le
 * cas. Une guerre terminée (encore visible 2 h sur la page) ne compte pas.
 *
 * Le serveur ne réinterroge le jeu qu'une fois toutes les 30 secondes, quel
 * que soit le nombre de visiteurs : cette vérification ne coûte presque rien.
 */
@Service()
export class LiveStatus {
  private readonly request = httpResource<readonly LiveWar[]>(() => `${SITE_CONFIG.apiUrl}/live`);

  readonly active = computed(
    () => this.request.hasValue() && this.request.value().some((war) => war.state !== 'warEnded'),
  );

  constructor() {
    const timer = setInterval(() => this.request.reload(), STATUS_REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
