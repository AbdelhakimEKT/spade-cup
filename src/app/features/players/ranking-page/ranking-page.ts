import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { isMonday, previousWeek, weekLabel, weekOf } from '../../../core/fw/evening';
import { RankingTable } from '../../../shared/ui/ranking-table';
import { FwWarList } from '../fw-war-list/fw-war-list';
import { RequestState } from '../../../shared/request-state/request-state';
import { Tournaments } from '../../tournaments/data/tournaments';
import { Players } from '../data/players';

/**
 * Deux classements séparés :
 *  - Spade Cup (/joueurs, ou /joueurs?tournoi=slug pour un seul tournoi) ;
 *  - FW classiques (/joueurs?type=fw), les FW de tous les jours, hors tournoi ;
 *    depuis le début, ou une semaine (/joueurs?type=fw&semaine=2026-10-26 :
 *    du lundi 0 h au lundi suivant, heure de Paris).
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

  protected readonly isFw = computed(() => this.type() === 'fw');
  /** La semaine choisie (un lundi), ou `null` : depuis le début. */
  protected readonly week = computed(() => {
    const value = this.semaine() ?? '';
    return isMonday(value) ? value : null;
  });
  /** Les choix du menu : cette semaine et les 7 précédentes. */
  protected readonly weeks = computed(() => {
    const list: { value: string; label: string }[] = [];
    let monday = weekOf(Date.now());
    for (let i = 0; i < 8; i++) {
      const name = i === 0 ? 'Cette semaine' : i === 1 ? 'Semaine dernière' : 'Semaine';
      list.push({ value: monday, label: `${name} (${weekLabel(monday)})` });
      monday = previousWeek(monday);
    }
    // Une semaine plus ancienne, arrivée par un lien : ajoutée au menu.
    const chosen = this.week();
    if (chosen && !list.some((w) => w.value === chosen)) {
      list.push({ value: chosen, label: `Semaine (${weekLabel(chosen)})` });
    }
    return list;
  });
  protected readonly weekText = computed(() => {
    const week = this.week();
    return week ? weekLabel(week) : null;
  });
  private readonly router = inject(Router);
  protected readonly slug = computed(() => this.tournoi() || null);

  private readonly data = inject(Players);
  protected readonly players = this.data.ranking(() => (this.isFw() ? undefined : this.slug()));
  protected readonly fwPlayers = this.data.fwRanking(this.isFw, this.week);
  protected readonly fwWars = this.data.fwWars(this.isFw, this.week);

  /** Menu « Période » : l'adresse change (lien partageable, retour en arrière). */
  protected chooseWeek(value: string): void {
    void this.router.navigate(['/joueurs'], {
      queryParams: { type: 'fw', ...(value ? { semaine: value } : {}) },
    });
  }

  private readonly tournament = inject(Tournaments).bySlug(() =>
    this.isFw() ? null : this.slug(),
  );
  protected readonly tournamentName = computed(() =>
    this.tournament.hasValue() ? this.tournament.value().name : this.slug(),
  );
}
