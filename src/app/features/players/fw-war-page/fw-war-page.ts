import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { fullTitle } from '../../../core/page-title';
import { formatDuration } from '../../../core/tournament/format';
import { Side } from '../../../core/tournament/models';
import { RequestState } from '../../../shared/request-state/request-state';
import { orderFw } from '../../../shared/ui/fw-teams';
import { TableTeam, WarPlayersTable } from '../../../shared/ui/war-players-table/war-players-table';
import { Players } from '../data/players';

/**
 * Détail d'une FW classique : le score des deux équipes (team 1 violet à
 * gauche, team 2 vert à droite), puis chaque joueur dans un tableau triable.
 */
@Component({
  selector: 'sc-fw-war-page',
  imports: [DatePipe, DecimalPipe, RequestState, RouterLink, WarPlayersTable],
  templateUrl: './fw-war-page.html',
  styleUrl: './fw-war-page.scss',
})
export class FwWarPage {
  /** L'identifiant de la FW, lu dans l'adresse (/fw/12). */
  readonly id = input.required<string>();

  protected readonly request = inject(Players).fwWar(this.id);
  protected readonly detail = computed(() =>
    this.request.hasValue() ? this.request.value() : null,
  );
  protected readonly notFound = computed(() => this.request.statusCode() === 404);

  /** Les deux équipes dans l'ordre d'affichage, chacune avec son camp et son temps total. */
  protected readonly view = computed(() => {
    const d = this.detail();
    if (!d) return null;
    const { left, right, winner } = orderFw(d.war);
    const sideOf = (tag: string): Side => (d.war.home.tag === tag ? 'home' : 'away');
    const withSide = (s: typeof left) => ({
      ...s,
      side: sideOf(s.tag),
      durationSec: d.duration[sideOf(s.tag)],
    });
    return { left: withSide(left), right: withSide(right), winner };
  });

  /** Nom et couleur de chaque camp, pour la colonne « Équipe » du tableau. */
  protected readonly teams = computed((): Record<Side, TableTeam> | null => {
    const v = this.view();
    if (!v) return null;
    const team = (s: typeof v.left): TableTeam => ({ name: s.name, color: s.color });
    return {
      [v.left.side]: team(v.left),
      [v.right.side]: team(v.right),
    } as Record<Side, TableTeam>;
  });

  /** Filtre du tableau : tous les joueurs, ou ceux d'une seule équipe. */
  protected readonly only = signal<Side | null>(null);
  protected readonly shown = computed(() => {
    const players = this.detail()?.players ?? [];
    const side = this.only();
    return side ? players.filter((p) => p.side === side) : players;
  });

  protected readonly duration = formatDuration;

  constructor() {
    const title = inject(Title);
    effect(() => {
      const v = this.view();
      if (v) title.setTitle(fullTitle(`${v.left.name} – ${v.right.name}`));
    });
  }
}
