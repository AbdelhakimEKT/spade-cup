import { HttpResourceRef, httpResource } from '@angular/common/http';
import { Service } from '@angular/core';
import { SITE_CONFIG } from '../../../core/site-config';
import { FriendlyWarSummary, PlayerProfile, PlayerTotals } from '../../../core/tournament/stats';

/** Statistiques des joueurs, lues sur le serveur. Même principe que `Tournaments`. */
@Service()
export class Players {
  private readonly api = SITE_CONFIG.apiUrl;

  /**
   * Classement Spade Cup : tous les vrais tournois, ou un seul si `tournament()`
   * renvoie son slug. `undefined` : rien n'est demandé (la ressource reste au repos).
   */
  ranking(
    tournament: () => string | null | undefined,
  ): HttpResourceRef<readonly PlayerTotals[] | undefined> {
    return httpResource<readonly PlayerTotals[]>(() => {
      const slug = tournament();
      if (slug === undefined) return undefined;
      return slug
        ? `${this.api}/players?tournament=${encodeURIComponent(slug)}`
        : `${this.api}/players`;
    });
  }

  /** Classement des FW classiques (hors tournoi), demandé seulement si `active()`. */
  fwRanking(active: () => boolean): HttpResourceRef<readonly PlayerTotals[] | undefined> {
    return httpResource<readonly PlayerTotals[]>(() =>
      active() ? `${this.api}/fw/players` : undefined,
    );
  }

  /** Les dernières FW classiques, demandées seulement si `active()`. */
  fwWars(active: () => boolean): HttpResourceRef<readonly FriendlyWarSummary[] | undefined> {
    return httpResource<readonly FriendlyWarSummary[]>(() =>
      active() ? `${this.api}/fw/wars` : undefined,
    );
  }

  /** `tag` sans le « # », tel qu'il apparaît dans l'URL du site. */
  profile(tag: () => string): HttpResourceRef<PlayerProfile | undefined> {
    return httpResource<PlayerProfile>(() => `${this.api}/players/${encodeURIComponent(tag())}`);
  }
}
