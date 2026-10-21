import { Component, DOCUMENT, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { roundLabel } from '../../../core/tournament/bracket';
import { Bracket, BracketMatch } from '../../../core/tournament/models';
import { MatchCard } from '../match-card/match-card';

type ViewMode = 'full' | 'round';

interface RoundView {
  readonly number: number;
  readonly label: string;
  readonly matches: readonly BracketMatch[];
  /** Matchs groupés deux par deux : chaque paire alimente un match du tour suivant. */
  readonly pairs: readonly (readonly BracketMatch[])[];
}

/**
 * Affiche un arbre, en entier ou un tour à la fois.
 * Sur petit écran, on démarre en « tour par tour » : un arbre complet y serait illisible.
 */
@Component({
  selector: 'sc-bracket-view',
  imports: [MatchCard],
  templateUrl: './bracket-view.html',
  styleUrl: './bracket-view.scss',
})
export class BracketView {
  readonly bracket = input.required<Bracket>();

  private readonly isNarrowScreen =
    inject(DOCUMENT).defaultView?.matchMedia?.('(max-width: 640px)').matches ?? false;

  protected readonly mode = signal<ViewMode>(this.isNarrowScreen ? 'round' : 'full');

  protected readonly rounds = computed<RoundView[]>(() => {
    const { matches, roundCount } = this.bracket();
    return Array.from({ length: roundCount }, (_, i) => {
      const number = i + 1;
      const inRound = matches.filter((m) => m.round === number);
      const pairs: BracketMatch[][] = [];
      for (let j = 0; j < inRound.length; j += 2) pairs.push(inRound.slice(j, j + 2));
      return { number, label: roundLabel(number, roundCount), matches: inRound, pairs };
    });
  });

  /** Le tour en cours : le premier qui a un match prêt à être joué, sinon le dernier. */
  protected readonly currentRound = computed(() => {
    const ready = this.bracket().matches.find((m) => m.status === 'pending' && m.home && m.away);
    return ready?.round ?? this.bracket().roundCount;
  });

  /**
   * Tour affiché en mode « tour par tour ». C'est un `linkedSignal` :
   * - il démarre sur le tour en cours, et s'y recale si l'arbre change
   *   (un nouveau résultat fait avancer le tournoi) ;
   * - mais on peut aussi le modifier à la main, en cliquant sur un autre tour.
   */
  protected readonly selectedRound = linkedSignal(() => this.currentRound());

  protected readonly selected = computed(
    () => this.rounds().find((r) => r.number === this.selectedRound()) ?? this.rounds()[0],
  );
}
