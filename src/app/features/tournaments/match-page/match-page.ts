import { Component, input } from '@angular/core';

@Component({
  selector: 'sc-match-page',
  imports: [],
  templateUrl: './match-page.html',
  styleUrl: './match-page.scss',
})
export class MatchPage {
  readonly slug = input.required<string>();
  readonly matchId = input.required<string>();
}
