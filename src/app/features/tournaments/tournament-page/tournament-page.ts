import { Component, input } from '@angular/core';

@Component({
  selector: 'sc-tournament-page',
  imports: [],
  templateUrl: './tournament-page.html',
  styleUrl: './tournament-page.scss',
})
export class TournamentPage {
  /** Rempli automatiquement depuis l'URL /tournois/:slug. */
  readonly slug = input.required<string>();
}
