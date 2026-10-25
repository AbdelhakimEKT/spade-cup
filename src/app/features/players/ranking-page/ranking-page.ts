import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RankingTable } from '../../../shared/ui/ranking-table';
import { FwWarList } from '../fw-war-list/fw-war-list';
import { RequestState } from '../../../shared/request-state/request-state';
import { Tournaments } from '../../tournaments/data/tournaments';
import { Players } from '../data/players';

/**
 * Deux classements séparés :
 *  - Spade Cup (/joueurs, ou /joueurs?tournoi=slug pour un seul tournoi) ;
 *  - FW classiques (/joueurs?type=fw), les FW de tous les jours, hors tournoi.
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

  protected readonly isFw = computed(() => this.type() === 'fw');
  protected readonly slug = computed(() => this.tournoi() || null);

  private readonly data = inject(Players);
  protected readonly players = this.data.ranking(() => (this.isFw() ? undefined : this.slug()));
  protected readonly fwPlayers = this.data.fwRanking(this.isFw);
  protected readonly fwWars = this.data.fwWars(this.isFw);

  private readonly tournament = inject(Tournaments).bySlug(() =>
    this.isFw() ? null : this.slug(),
  );
  protected readonly tournamentName = computed(() =>
    this.tournament.hasValue() ? this.tournament.value().name : this.slug(),
  );
}
