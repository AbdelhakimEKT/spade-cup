import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { winnerOf } from '../../../core/tournament/bracket';
import { BracketMatch, ClanRef, Side, SideScore } from '../../../core/tournament/models';

interface Row {
  readonly side: Side;
  readonly clan: ClanRef | null;
  readonly score: SideScore | null;
  readonly isWinner: boolean;
  readonly isLoser: boolean;
}

/** Un match de l'arbre : les deux clans, le score, le vainqueur. */
@Component({
  selector: 'sc-match-card',
  imports: [DecimalPipe],
  // Petit composant : le HTML est écrit ici plutôt que dans un fichier à part.
  template: `
    <article
      class="card"
      [class.card--done]="match().status === 'done'"
      [attr.aria-label]="ariaLabel()"
    >
      @for (row of rows(); track row.side) {
        <div class="row" [class.row--winner]="row.isWinner" [class.row--loser]="row.isLoser">
          @if (row.clan) {
            <span class="row__name">{{ row.clan.name }}</span>
          } @else {
            <span class="row__name row__name--empty">{{ emptyLabel() }}</span>
          }
          @if (row.score) {
            <span class="row__score" aria-hidden="true">
              <span class="row__stars">{{ row.score.stars }}★</span>
              <span class="row__pct">{{ row.score.destruction | number: '1.0-1' }} %</span>
            </span>
          }
        </div>
      }
      @if (statusText()) {
        <p class="card__status" aria-hidden="true">{{ statusText() }}</p>
      }
    </article>
  `,
  styleUrl: './match-card.scss',
})
export class MatchCard {
  readonly match = input.required<BracketMatch>();

  protected readonly rows = computed<Row[]>(() => {
    const m = this.match();
    const row = (side: Side): Row => ({
      side,
      clan: m[side],
      score: m.score?.[side] ?? null,
      isWinner: m.status === 'done' && m.winner === side,
      isLoser: m.status === 'done' && m.winner !== side,
    });
    return [row('home'), row('away')];
  });

  /** Place vide : exempt au premier tour, sinon vainqueur pas encore connu. */
  protected readonly emptyLabel = computed(() =>
    this.match().round === 1 ? 'Exempt' : 'À déterminer',
  );

  protected readonly statusText = computed(() => {
    const m = this.match();
    if (m.status === 'bye') return 'Qualifié d’office';
    if (m.status === 'pending' && m.home && m.away) return 'À jouer';
    return '';
  });

  /** Phrase lue par les lecteurs d'écran, qui ne « voient » pas la mise en page. */
  protected readonly ariaLabel = computed(() => {
    const m = this.match();
    const name = (clan: ClanRef | null) => clan?.name ?? this.emptyLabel();
    let text = `${name(m.home)} contre ${name(m.away)}`;
    if (m.score) {
      text += `, ${m.score.home.stars} étoiles à ${m.score.away.stars}`;
    }
    const winner = winnerOf(m);
    if (m.status === 'done' && winner) text += `. Vainqueur : ${winner.name}`;
    if (m.status === 'bye' && winner) text += `. ${winner.name} est qualifié d’office`;
    return text;
  });
}
