import { HttpResourceRef, httpResource } from '@angular/common/http';
import { Service } from '@angular/core';
import { SITE_CONFIG } from '../../../core/site-config';
import { PlayerProfile, PlayerTotals } from '../../../core/tournament/stats';

/** Statistiques des joueurs, lues sur le serveur. Même principe que `Tournaments`. */
@Service()
export class Players {
  private readonly api = SITE_CONFIG.apiUrl;

  /** Classement : tous les vrais tournois, ou un seul si `tournament()` renvoie son slug. */
  ranking(tournament: () => string | null): HttpResourceRef<readonly PlayerTotals[] | undefined> {
    return httpResource<readonly PlayerTotals[]>(() => {
      const slug = tournament();
      return slug
        ? `${this.api}/players?tournament=${encodeURIComponent(slug)}`
        : `${this.api}/players`;
    });
  }

  /** `tag` sans le « # », tel qu'il apparaît dans l'URL du site. */
  profile(tag: () => string): HttpResourceRef<PlayerProfile | undefined> {
    return httpResource<PlayerProfile>(() => `${this.api}/players/${encodeURIComponent(tag())}`);
  }
}
