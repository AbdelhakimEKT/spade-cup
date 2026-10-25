import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FriendlyWarSummary } from '../../../core/tournament/stats';
import { orderFw } from '../../../shared/ui/fw-teams';

/**
 * Les dernières FW classiques, avec un bilan des victoires en tête.
 * Team 1 (violet) toujours à gauche, team 2 (vert) à droite ; le gagnant a
 * son trophée, le perdant est estompé. Un clic ouvre le détail de la FW.
 */
@Component({
  selector: 'sc-fw-war-list',
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './fw-war-list.html',
  styleUrl: './fw-war-list.scss',
})
export class FwWarList {
  readonly wars = input.required<readonly FriendlyWarSummary[]>();

  protected readonly rows = computed(() => this.wars().map((war) => ({ war, ...orderFw(war) })));

  /** Victoires de chaque équipe sur les FW affichées (team 1, puis team 2). */
  protected readonly tally = computed(() => {
    const rows = this.rows();
    if (!rows.length) return null;
    const { left, right } = rows[0];
    const wins = (tag: string) => rows.filter((r) => r.winner?.tag === tag).length;
    return {
      left: { ...left, wins: wins(left.tag) },
      right: { ...right, wins: wins(right.tag) },
      draws: rows.filter((r) => !r.winner).length,
    };
  });
}
