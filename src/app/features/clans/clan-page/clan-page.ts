import { Component, input } from '@angular/core';

@Component({
  selector: 'sc-clan-page',
  imports: [],
  templateUrl: './clan-page.html',
  styleUrl: './clan-page.scss',
})
export class ClanPage {
  /** Tag du clan sans le « # », tel qu'il apparaît dans l'URL. */
  readonly tag = input.required<string>();
}
