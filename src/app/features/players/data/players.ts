import { HttpResourceRef, httpResource } from '@angular/common/http';
import { Service } from '@angular/core';
import { SITE_CONFIG } from '../../../core/site-config';
import {
  FriendlyWarSummary,
  FwWarDetail,
  PlayerProfile,
  PlayerTotals,
} from '../../../core/tournament/stats';

const weekQuery = (week: string | null) => (week ? `?week=${encodeURIComponent(week)}` : '');

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

  /**
   * Classement des FW classiques (hors tournoi), demandé seulement si `active()` :
   * depuis le début, ou la semaine du lundi `week()` (« 2026-10-26 »).
   */
  fwRanking(
    active: () => boolean,
    week: () => string | null = () => null,
  ): HttpResourceRef<readonly PlayerTotals[] | undefined> {
    return httpResource<readonly PlayerTotals[]>(() =>
      active() ? `${this.api}/fw/players${weekQuery(week())}` : undefined,
    );
  }

  /** Les dernières FW classiques (ou celles de la semaine), demandées seulement si `active()`. */
  fwWars(
    active: () => boolean,
    week: () => string | null = () => null,
  ): HttpResourceRef<readonly FriendlyWarSummary[] | undefined> {
    return httpResource<readonly FriendlyWarSummary[]>(() =>
      active() ? `${this.api}/fw/wars${weekQuery(week())}` : undefined,
    );
  }

  /** Une FW classique et ses joueurs (`id` tel qu'il apparaît dans l'URL du site). */
  fwWar(id: () => string): HttpResourceRef<FwWarDetail | undefined> {
    return httpResource<FwWarDetail>(() => `${this.api}/fw/wars/${encodeURIComponent(id())}`);
  }

  /** `tag` sans le « # », tel qu'il apparaît dans l'URL du site. */
  profile(tag: () => string): HttpResourceRef<PlayerProfile | undefined> {
    return httpResource<PlayerProfile>(() => `${this.api}/players/${encodeURIComponent(tag())}`);
  }
}
