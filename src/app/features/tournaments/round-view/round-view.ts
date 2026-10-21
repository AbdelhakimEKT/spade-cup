import { Component, computed, input, linkedSignal } from '@angular/core';
import { currentRound, roundLabel } from '../../../core/tournament/bracket';
import { Bracket } from '../../../core/tournament/models';
import { MatchCard } from '../match-card/match-card';

/** L'arbre affiché un tour à la fois : la vue par défaut sur téléphone. */
@Component({
  selector: 'sc-round-view',
  imports: [MatchCard],
  template: `
    <div class="round-picker" role="group" aria-label="Choisir un tour">
      @for (round of rounds(); track round.number) {
        <button
          type="button"
          class="round-picker__btn"
          [class.round-picker__btn--now]="round.number === current()"
          [attr.aria-pressed]="round.number === selectedRound()"
          (click)="selectedRound.set(round.number)"
        >
          {{ round.label }}
        </button>
      }
    </div>

    <ol class="round-list" [attr.aria-label]="selected().label">
      @for (match of selected().matches; track match.id) {
        <li>
          <sc-match-card [match]="match" [final]="selected().number === bracket().roundCount" />
        </li>
      }
    </ol>
  `,
  styleUrl: './round-view.scss',
})
export class RoundView {
  readonly bracket = input.required<Bracket>();

  protected readonly current = computed(() => currentRound(this.bracket()));

  protected readonly rounds = computed(() => {
    const { matches, roundCount } = this.bracket();
    return Array.from({ length: roundCount }, (_, i) => ({
      number: i + 1,
      label: roundLabel(i + 1, roundCount),
      matches: matches.filter((m) => m.round === i + 1),
    }));
  });

  /**
   * Tour affiché. C'est un `linkedSignal` : il suit le tour en cours quand le
   * tournoi avance, mais reste modifiable au clic.
   */
  protected readonly selectedRound = linkedSignal(() => this.current());

  protected readonly selected = computed(
    () => this.rounds().find((r) => r.number === this.selectedRound()) ?? this.rounds()[0],
  );
}
