import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  FIRST_MONTH,
  FIRST_WEEK,
  FwPeriod,
  isMonday,
  isMonth,
  monthLabel,
  monthOf,
  periodLabel,
  previousMonth,
  previousWeek,
  weekLabel,
  weekOf,
} from '../../../core/fw/evening';
import { RankingTable } from '../../../shared/ui/ranking-table';
import { FwWarList } from '../fw-war-list/fw-war-list';
import { RequestState } from '../../../shared/request-state/request-state';
import { Tournaments } from '../../tournaments/data/tournaments';
import { Players } from '../data/players';

/**
 * Deux classements séparés :
 *  - Spade Cup (/joueurs, ou /joueurs?tournoi=slug pour un seul tournoi) ;
 *  - FW classiques (/joueurs?type=fw), les FW de tous les jours, hors tournoi ;
 *    depuis le début, une semaine (/joueurs?type=fw&semaine=2026-10-26 : du
 *    lundi 0 h au lundi suivant, heure de Paris) ou un mois (&mois=2026-10).
 * Les paramètres d'URL arrivent directement dans les inputs, comme les
 * paramètres de route.
 */
@Component({
  selector: 'sc-ranking-page',
  imports: [FwWarList, RankingTable, RequestState, RouterLink],
  templateUrl: './ranking-page.html',
  styleUrl: './ranking-page.scss',
})
export class RankingPage {
  /** Paramètre d'URL facultatif « ?tournoi=slug ». */
  readonly tournoi = input<string>();
  /** Paramètre d'URL facultatif « ?type=fw ». */
  readonly type = input<string>();
  /** Paramètre d'URL facultatif « &semaine=2026-10-26 » (le lundi de la semaine). */
  readonly semaine = input<string>();
  /** Paramètre d'URL facultatif « &mois=2026-10 ». */
  readonly mois = input<string>();

  protected readonly isFw = computed(() => this.type() === 'fw');
  /** La période choisie (une semaine ou un mois), ou `null` : depuis le début. */
  protected readonly period = computed((): FwPeriod | null => {
    const week = this.semaine() ?? '';
    if (isMonday(week)) return { kind: 'week', value: week };
    const month = this.mois() ?? '';
    return isMonth(month) ? { kind: 'month', value: month } : null;
  });
  /** Valeur du menu : « semaine:2026-10-26 », « mois:2026-10 », ou vide. */
  protected readonly periodValue = computed(() => {
    const p = this.period();
    return p ? `${p.kind === 'week' ? 'semaine' : 'mois'}:${p.value}` : '';
  });
  /** Les semaines du menu, depuis la première avec des FW (19/10). */
  protected readonly weeks = computed(() => {
    const list: { value: string; label: string }[] = [];
    for (
      let monday = weekOf(Date.now()), i = 0;
      monday >= FIRST_WEEK;
      monday = previousWeek(monday), i++
    ) {
      const label = weekLabel(monday);
      list.push({
        value: `semaine:${monday}`,
        label:
          i === 0
            ? `Cette semaine (${label})`
            : i === 1
              ? `Semaine dernière (${label})`
              : `Semaine ${label}`,
      });
    }
    return list;
  });
  /** Les mois du menu, depuis octobre 2026. */
  protected readonly months = computed(() => {
    const list: { value: string; label: string }[] = [];
    for (
      let month = monthOf(Date.now()), i = 0;
      month >= FIRST_MONTH;
      month = previousMonth(month), i++
    ) {
      const name = monthLabel(month);
      list.push({
        value: `mois:${month}`,
        label: i === 0 ? `Ce mois-ci (${name})` : name.charAt(0).toUpperCase() + name.slice(1),
      });
    }
    return list;
  });
  /** « du 26/10 au 01/11 », « en octobre 2026 », ou `null`. */
  protected readonly periodText = computed(() => {
    const p = this.period();
    return p ? periodLabel(p) : null;
  });
  private readonly router = inject(Router);
  protected readonly slug = computed(() => this.tournoi() || null);

  private readonly data = inject(Players);
  protected readonly players = this.data.ranking(() => (this.isFw() ? undefined : this.slug()));
  protected readonly fwPlayers = this.data.fwRanking(this.isFw, this.period);
  protected readonly fwWars = this.data.fwWars(this.isFw, this.period);

  /** Menu « Période » : l'adresse change (lien partageable, retour en arrière). */
  protected choosePeriod(value: string): void {
    const [kind, period] = value.split(':');
    void this.router.navigate(['/joueurs'], {
      queryParams: { type: 'fw', ...(kind && period ? { [kind]: period } : {}) },
    });
  }

  private readonly tournament = inject(Tournaments).bySlug(() =>
    this.isFw() ? null : this.slug(),
  );
  protected readonly tournamentName = computed(() =>
    this.tournament.hasValue() ? this.tournament.value().name : this.slug(),
  );
}
