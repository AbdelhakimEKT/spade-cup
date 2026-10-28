import { HttpResourceRef, httpResource } from '@angular/common/http';
import { Service } from '@angular/core';
import { FwPeriod } from '../../../core/fw/evening';
import { SITE_CONFIG } from '../../../core/site-config';
import {
  FriendlyWarSummary,
  FwWarDetail,
  PlayerProfile,
  PlayerTotals,
} from '../../../core/tournament/stats';

/** « ?week=2026-10-26 », « ?month=2026-10 », ou rien. */
const periodQuery = (p: FwPeriod | null) =>
  p ? `?${p.kind}=${encodeURIComponent(p.value)}` : '';

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
   * depuis le début, ou sur une période (une semaine, un mois).
   */
  fwRanking(
    active: () => boolean,
    period: () => FwPeriod | null = () => null,
  ): HttpResourceRef<readonly PlayerTotals[] | undefined> {
    return httpResource<readonly PlayerTotals[]>(() =>
      active() ? `${this.api}/fw/players${periodQuery(period())}` : undefined,
    );
  }

  /** Les dernières FW classiques (ou celles de la période), demandées seulement si `active()`. */
  fwWars(
    active: () => boolean,
    period: () => FwPeriod | null = () => null,
  ): HttpResourceRef<readonly FriendlyWarSummary[] | undefined> {
    return httpResource<readonly FriendlyWarSummary[]>(() =>
      active() ? `${this.api}/fw/wars${periodQuery(period())}` : undefined,
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
