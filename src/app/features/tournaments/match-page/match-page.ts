import { DecimalPipe } from '@angular/common';
import { Component, booleanAttribute, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { fullTitle } from '../../../core/page-title';
import { SITE_CONFIG } from '../../../core/site-config';
import { roundLabel, winnerOf } from '../../../core/tournament/bracket';
import { formatDuration } from '../../../core/tournament/format';
import { Side } from '../../../core/tournament/models';
import { tagToUrl } from '../../../core/tournament/tags';
import { ClanAvatar } from '../../../shared/ui/clan-avatar/clan-avatar';
import { verdict } from '../../../shared/ui/labels';
import { RequestState } from '../../../shared/request-state/request-state';
import { WarPlayersTable } from '../../../shared/ui/war-players-table/war-players-table';
import { Tournaments } from '../data/tournaments';

/** Détail d'un match : les deux clans, le score, comment il a été décidé, les joueurs. */
@Component({
  selector: 'sc-match-page',
  imports: [ClanAvatar, DecimalPipe, RequestState, RouterLink, WarPlayersTable],
  templateUrl: './match-page.html',
  styleUrl: './match-page.scss',
  host: { '[class.capture]': 'capture()' },
})
export class MatchPage {
  readonly slug = input.required<string>();
  readonly matchId = input.required<string>();

  /**
   * /tournois/:slug/matchs/:id?capture : sans le lien de retour, avec l'adresse
   * du site en signature, pour le récap que le bot poste sur Discord.
   */
  readonly capture = input(false, { transform: booleanAttribute });
  protected readonly siteHost = SITE_CONFIG.siteUrl.replace(/^https:\/\//, '');

  protected readonly request = inject(Tournaments).match(this.slug, this.matchId);
  protected readonly detail = computed(() =>
    this.request.hasValue() ? this.request.value() : null,
  );
  protected readonly notFound = computed(() => this.request.statusCode() === 404);

  protected readonly round = computed(() => {
    const d = this.detail();
    return d ? roundLabel(d.match.round, d.roundCount) : '';
  });
  protected readonly verdict = computed(() => {
    const d = this.detail();
    return d ? verdict(d.match) : '';
  });
  protected readonly winnerTag = computed(() => {
    const d = this.detail();
    return d ? (winnerOf(d.match)?.tag ?? null) : null;
  });

  /** Les deux camps, prêts à afficher dans la même boucle. */
  protected readonly sides = computed(() => {
    const d = this.detail();
    if (!d) return [];
    return (['home', 'away'] as Side[]).map((side) => ({
      side,
      clan: d.match[side],
      score: d.match.score?.[side] ?? null,
      players: d.players[side],
    }));
  });

  protected readonly duration = formatDuration;
  protected readonly url = tagToUrl;

  constructor() {
    const title = inject(Title);
    effect(() => {
      const d = this.detail();
      if (d) {
        title.setTitle(fullTitle(`${d.match.home?.name ?? '?'} – ${d.match.away?.name ?? '?'}`));
      }
    });
  }
}
