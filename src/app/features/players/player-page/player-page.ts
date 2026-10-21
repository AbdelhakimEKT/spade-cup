import { Component, input } from '@angular/core';

@Component({
  selector: 'sc-player-page',
  imports: [],
  templateUrl: './player-page.html',
  styleUrl: './player-page.scss',
})
export class PlayerPage {
  readonly tag = input.required<string>();
}
