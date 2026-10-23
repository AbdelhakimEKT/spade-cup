import { Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { fullTitle } from '../../../core/page-title';
import { ClanAvatar } from '../../../shared/ui/clan-avatar/clan-avatar';
import { outcomeLabel } from '../../../shared/ui/labels';
import { RankingTable } from '../../../shared/ui/ranking-table';
import { RequestState } from '../../../shared/request-state/request-state';
import { Clans } from '../data/clans';

/** Fiche d'un clan : son bilan, ses tournois et ses joueurs. */
@Component({
  selector: 'sc-clan-page',
  imports: [ClanAvatar, RankingTable, RequestState, RouterLink],
  templateUrl: './clan-page.html',
  styleUrl: './clan-page.scss',
})
export class ClanPage {
  /** Tag sans « # », depuis l'URL /clans/:tag. */
  readonly tag = input.required<string>();

  protected readonly request = inject(Clans).profile(this.tag);
  protected readonly profile = computed(() =>
    this.request.hasValue() ? this.request.value() : null,
  );
  protected readonly notFound = computed(() => this.request.statusCode() === 404);

  protected readonly outcome = outcomeLabel;

  constructor() {
    const title = inject(Title);
    effect(() => {
      const name = this.profile()?.clan.name ?? (this.notFound() ? 'Clan introuvable' : null);
      if (name) title.setTitle(fullTitle(name));
    });
  }
}
