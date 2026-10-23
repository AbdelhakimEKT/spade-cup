import { formatNumber } from '@angular/common';
import { Component, LOCALE_ID, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { winnerOf } from '../../../core/tournament/bracket';
import { BracketMatch, ClanRef, Side, SideScore } from '../../../core/tournament/models';
import { ClanAvatar } from '../../../shared/ui/clan-avatar/clan-avatar';

interface Row {
  readonly side: Side;
  readonly clan: ClanRef | null;
  readonly score: SideScore | null;
  readonly isWinner: boolean;
  readonly isLoser: boolean;
}

/** Un match de l'arbre : les deux clans, les étoiles, le vainqueur. */
@Component({
  selector: 'sc-match-card',
  imports: [ClanAvatar, RouterLink],
  template: `
    <article
      class="match"
      [class.match--live]="match().status === 'live'"
      [class.match--final]="final()"
      [attr.aria-label]="linkable() ? null : ariaLabel()"
    >
      @if (linkable()) {
        <!-- Lien « étiré » sur toute la carte : un seul arrêt au clavier, une
             seule phrase pour les lecteurs d'écran. Relatif à la page du
             tournoi : /tournois/:slug/matchs/R1-M3. -->
        <a
          class="match__link"
          [routerLink]="['matchs', match().id]"
          [attr.aria-label]="ariaLabel()"
        ></a>
      }
      @for (row of rows(); track row.side) {
        <div
          class="team"
          [class.team--win]="row.isWinner"
          [class.team--lose]="row.isLoser"
          [class.team--tbd]="!row.clan"
        >
          @if (row.clan) {
            <sc-clan-avatar [clan]="row.clan" />
            <span class="team__name" [title]="row.clan.name + ' · ' + row.clan.tag">{{
              row.clan.name
            }}</span>
            @if (row.score) {
              <span class="team__score" aria-hidden="true">
                {{ row.score.stars }}
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z" />
                </svg>
              </span>
            }
          } @else {
            <span class="team__name">{{ emptyLabel() }}</span>
          }
        </div>
      }
      @if (statusText()) {
        <div class="status" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {{ statusText() }}
        </div>
      } @else if (tieBreak()) {
        <div class="status status--info" aria-hidden="true">{{ tieBreak() }}</div>
      }
    </article>
  `,
  styleUrl: './match-card.scss',
})
export class MatchCard {
  readonly match = input.required<BracketMatch>();
  /** La finale a droit à sa bordure dorée. */
  readonly final = input(false);

  /** Une fois les deux clans connus, la carte mène à la page du match. */
  protected readonly linkable = computed(() => !!(this.match().home && this.match().away));

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

  private readonly locale = inject(LOCALE_ID);

  /**
   * À égalité d'étoiles, on explique ce qui a départagé les clans, dans le
   * bandeau sous la carte (sur la ligne du clan, il prenait la place du nom).
   */
  protected readonly tieBreak = computed(() => {
    const { score, status } = this.match();
    if (status !== 'done' || !score || score.home.stars !== score.away.stars) return '';
    if (score.home.destruction !== score.away.destruction) {
      const pct = (value: number) => formatNumber(value, this.locale, '1.0-1');
      return `au % : ${pct(score.home.destruction)} – ${pct(score.away.destruction)}`;
    }
    return 'départagé au temps';
  });

  /** Place vide : exempt au premier tour, sinon vainqueur pas encore connu. */
  protected readonly emptyLabel = computed(() =>
    this.match().round === 1 ? 'Exempt' : 'À déterminer',
  );

  protected readonly statusText = computed(() => {
    const m = this.match();
    if (m.status === 'live') return 'en cours';
    if (m.status === 'bye') return 'qualifié d’office';
    if (m.status === 'pending' && m.home && m.away) return 'en attente';
    return '';
  });

  /** Phrase lue par les lecteurs d'écran, qui ne « voient » pas la mise en page. */
  protected readonly ariaLabel = computed(() => {
    const m = this.match();
    const name = (clan: ClanRef | null) => clan?.name ?? this.emptyLabel();
    let text = `${name(m.home)} contre ${name(m.away)}`;
    if (m.score) text += `, ${m.score.home.stars} étoiles à ${m.score.away.stars}`;
    const winner = winnerOf(m);
    if (m.status === 'done' && winner) text += `. Vainqueur : ${winner.name}`;
    if (m.status === 'bye' && winner) text += `. ${winner.name} est qualifié d’office`;
    if (m.status === 'live') text += '. Match en cours';
    return text;
  });
}
