import { Component, input } from '@angular/core';
import { BracketMatch } from '../../../core/tournament/models';
import { ClanAvatar } from '../../../shared/ui/clan-avatar/clan-avatar';

/**
 * Le match qui se joue en ce moment, mis à la une en haut de la page du tournoi.
 */
@Component({
  selector: 'sc-featured-match',
  imports: [ClanAvatar],
  template: `
    <section class="featured" aria-labelledby="featured-title">
      <h2 id="featured-title" class="visually-hidden">Match en cours</h2>
      <div class="versus">
        <div class="side">
          <sc-clan-avatar [clan]="match().home" size="lg" />
          <div>
            <p class="side__name">{{ match().home?.name }}</p>
            <p class="side__tag">{{ match().home?.tag }}</p>
          </div>
        </div>
        <p class="vs" aria-hidden="true">VS</p>
        <div class="side side--right">
          <div>
            <p class="side__name">{{ match().away?.name }}</p>
            <p class="side__tag">{{ match().away?.tag }}</p>
          </div>
          <sc-clan-avatar [clan]="match().away" size="lg" />
        </div>
      </div>
      <div class="footer">
        <span class="pill">Match en cours · {{ roundLabel() }}</span>
        <span class="live"
          ><span class="live__dot" aria-hidden="true"></span>Guerre amicale en train de se
          jouer</span
        >
      </div>
    </section>
  `,
  styleUrl: './featured-match.scss',
})
export class FeaturedMatch {
  readonly match = input.required<BracketMatch>();
  readonly roundLabel = input.required<string>();
}
