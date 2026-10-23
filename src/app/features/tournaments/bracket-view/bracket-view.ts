import { Component, DOCUMENT, computed, inject, input, signal } from '@angular/core';
import { currentRound, roundLabel, roundShortLabel } from '../../../core/tournament/bracket';
import { Bracket, BracketMatch } from '../../../core/tournament/models';
import { MatchCard } from '../match-card/match-card';
import { RoundView } from '../round-view/round-view';

type ViewMode = 'full' | 'round';
type HalfSide = 'left' | 'right';

/** Un match placé dans l'arbre, avec l'état de ses traits de liaison. */
interface Slot {
  readonly match: BracketMatch;
  /** Trait sortant allumé : le match a un vainqueur. */
  readonly outHot: boolean;
  /** Trait entrant allumé : au moins un clan est déjà qualifié pour ce match. */
  readonly inHot: boolean;
}

interface SideColumn {
  readonly kind: 'side';
  readonly key: string;
  readonly side: HalfSide;
  readonly round: number;
  readonly title: string;
  /** Matchs deux par deux : chaque paire alimente un match du tour suivant. */
  readonly pairs: readonly (readonly Slot[])[];
}

interface CenterColumn {
  readonly kind: 'center';
  readonly key: 'center';
  readonly final: BracketMatch;
}

type Column = SideColumn | CenterColumn;

/**
 * L'arbre d'un tournoi, dans l'esprit de la maquette Spade Cup :
 * la moitié gauche avance vers la droite, la moitié droite vers la gauche,
 * et la finale trône au centre.
 */
@Component({
  selector: 'sc-bracket-view',
  imports: [MatchCard, RoundView],
  templateUrl: './bracket-view.html',
  styleUrl: './bracket-view.scss',
})
export class BracketView {
  readonly bracket = input.required<Bracket>();
  /** Boutons « Arbre complet / Tour par tour » : masqués pour l'image Discord. */
  readonly toolbar = input(true);

  // Un arbre en miroir demande de la largeur : en dessous, on ouvre en « tour par tour ».
  private readonly isNarrowScreen =
    inject(DOCUMENT).defaultView?.matchMedia?.('(max-width: 1023px)').matches ?? false;

  protected readonly mode = signal<ViewMode>(this.isNarrowScreen ? 'round' : 'full');

  /** Colonnes de l'arbre complet, de gauche à droite. */
  protected readonly columns = computed<Column[]>(() => {
    const { matches, roundCount } = this.bracket();
    const final = matches.find((m) => m.round === roundCount)!;

    const half = (round: number, side: HalfSide): SideColumn => {
      const inRound = matches.filter((m) => m.round === round);
      const mid = inRound.length / 2;
      const ofSide = inRound.filter((m) => (side === 'left' ? m.index <= mid : m.index > mid));
      const slots = ofSide.map((match) => ({
        match,
        outHot: match.status === 'done' || match.status === 'bye',
        inHot: round > 1 && (match.home !== null || match.away !== null),
      }));
      const pairs: Slot[][] = [];
      for (let i = 0; i < slots.length; i += 2) pairs.push(slots.slice(i, i + 2));
      return {
        kind: 'side',
        key: `${side}-${round}`,
        side,
        round,
        title: roundShortLabel(round, roundCount),
        pairs,
      };
    };

    const sideRounds = Array.from({ length: roundCount - 1 }, (_, i) => i + 1);
    return [
      ...sideRounds.map((r) => half(r, 'left')),
      { kind: 'center', key: 'center', final },
      ...[...sideRounds].reverse().map((r) => half(r, 'right')),
    ];
  });

  protected readonly sideColumnCount = computed(() => this.bracket().roundCount - 1);

  protected readonly currentRound = computed(() => currentRound(this.bracket()));

  protected readonly currentRoundLabel = computed(() =>
    roundLabel(this.currentRound(), this.bracket().roundCount),
  );
}
