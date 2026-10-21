import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TOURNAMENT_RULES } from '../../../core/tournament/models';
import { BracketView } from '../bracket-view/bracket-view';
import { STATUS_LABEL } from '../data/tournament';
import { Tournaments } from '../data/tournaments';

@Component({
  selector: 'sc-tournament-page',
  imports: [BracketView, RouterLink],
  templateUrl: './tournament-page.html',
  styleUrl: './tournament-page.scss',
})
export class TournamentPage {
  private readonly tournaments = inject(Tournaments);

  /** Rempli automatiquement depuis l'URL /tournois/:slug. */
  readonly slug = input.required<string>();

  /** Se recalcule tout seul si on passe d'un tournoi à un autre. */
  protected readonly tournament = computed(() => this.tournaments.bySlug(this.slug()));

  protected readonly rules = TOURNAMENT_RULES;
  protected readonly statusLabel = STATUS_LABEL;
}
