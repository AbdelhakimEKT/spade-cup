import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { fullTitle } from '../../../core/page-title';
import { roundLabel } from '../../../core/tournament/bracket';
import { PlayerTotals } from '../../../core/tournament/stats';
import { tagToUrl } from '../../../core/tournament/tags';
import { ClanAvatar } from '../../../shared/ui/clan-avatar/clan-avatar';
import { fwTeamColor, orderFw } from '../../../shared/ui/fw-teams';
import { starsPerAttack } from '../../../shared/ui/labels';
import { RequestState } from '../../../shared/request-state/request-state';
import { Players } from '../data/players';

/** Fiche d'un joueur : son bilan, puis chacune de ses guerres. */
@Component({
  selector: 'sc-player-page',
  imports: [ClanAvatar, DatePipe, DecimalPipe, NgTemplateOutlet, RequestState, RouterLink],
  templateUrl: './player-page.html',
  styleUrl: './player-page.scss',
})
export class PlayerPage {
  /** Tag sans « # », depuis l'URL /joueurs/:tag. */
  readonly tag = input.required<string>();

  protected readonly request = inject(Players).profile(this.tag);
  protected readonly profile = computed(() =>
    this.request.hasValue() ? this.request.value() : null,
  );
  protected readonly notFound = computed(() => this.request.statusCode() === 404);

  /** Étoiles par attaque d'un bilan (Spade Cup ou FW). */
  protected perAttack(t: PlayerTotals): number {
    return starsPerAttack(t.stars, t.attacks);
  }

  protected readonly roundLabel = roundLabel;
  protected readonly url = tagToUrl;
  /** FW classiques : team 1 (violet) à gauche, team 2 (vert) à droite. */
  protected readonly order = orderFw;
  protected readonly teamColor = fwTeamColor;

  constructor() {
    const title = inject(Title);
    effect(() => {
      const name = this.profile()?.totals.name ?? (this.notFound() ? 'Joueur introuvable' : null);
      if (name) title.setTitle(fullTitle(name));
    });
  }
}
