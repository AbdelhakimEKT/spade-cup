import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RequestState } from '../../../shared/request-state/request-state';
import { STATUS_LABEL } from '../data/tournament';
import { Tournaments } from '../data/tournaments';

@Component({
  selector: 'sc-tournament-list-page',
  imports: [RequestState, RouterLink],
  templateUrl: './tournament-list-page.html',
  styleUrl: './tournament-list-page.scss',
})
export class TournamentListPage {
  protected readonly tournaments = inject(Tournaments).list();
  protected readonly statusLabel = STATUS_LABEL;
}
