import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STATUS_LABEL } from '../data/tournament';
import { Tournaments } from '../data/tournaments';

@Component({
  selector: 'sc-tournament-list-page',
  imports: [RouterLink],
  templateUrl: './tournament-list-page.html',
  styleUrl: './tournament-list-page.scss',
})
export class TournamentListPage {
  protected readonly tournaments = inject(Tournaments).all();
  protected readonly statusLabel = STATUS_LABEL;
}
