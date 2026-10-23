import { NgOptimizedImage } from '@angular/common';
import { Component, DOCUMENT, computed, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { fullTitle } from '../../../core/page-title';
import { currentRound, liveMatch, roundLabel } from '../../../core/tournament/bracket';
import { TOURNAMENT_RULES } from '../../../core/tournament/models';
import { BracketView } from '../bracket-view/bracket-view';
import { STATUS_LABEL } from '../data/tournament';
import { Tournaments } from '../data/tournaments';
import { FeaturedMatch } from '../featured-match/featured-match';
import { RequestState } from '../../../shared/request-state/request-state';
import { ClanAvatar } from '../../../shared/ui/clan-avatar/clan-avatar';
import { RankingTable } from '../../../shared/ui/ranking-table';
import { tagToUrl } from '../../../core/tournament/tags';
import { Players } from '../../players/data/players';

@Component({
  selector: 'sc-tournament-page',
  imports: [
    BracketView,
    ClanAvatar,
    FeaturedMatch,
    NgOptimizedImage,
    RankingTable,
    RequestState,
    RouterLink,
  ],
  templateUrl: './tournament-page.html',
  styleUrl: './tournament-page.scss',
})
export class TournamentPage {
  private readonly tournaments = inject(Tournaments);
  private readonly window = inject(DOCUMENT).defaultView;

  /** Rempli automatiquement depuis l'URL /tournois/:slug. */
  readonly slug = input.required<string>();

  /** La requête au serveur ; relancée toute seule si le slug change. */
  protected readonly request = this.tournaments.bySlug(this.slug);

  /**
   * Le tournoi, ou `null` tant qu'il n'est pas là. Passage obligé : `value()`
   * d'une ressource en erreur LÈVE une exception, on ne la lit donc qu'après
   * avoir vérifié `hasValue()`.
   */
  protected readonly tournament = computed(() =>
    this.request.hasValue() ? this.request.value() : null,
  );

  /** Les 5 meilleurs joueurs du tournoi (vide tant qu'aucune guerre n'a été lue). */
  private readonly ranking = inject(Players).ranking(this.slug);
  protected readonly topPlayers = computed(() =>
    this.ranking.hasValue() ? this.ranking.value().slice(0, 5) : [],
  );

  protected readonly url = tagToUrl;

  /** Le serveur a répondu « ce tournoi n'existe pas » (et non « je suis en panne »). */
  protected readonly notFound = computed(() => this.request.statusCode() === 404);

  /** Pastille à côté du titre : le tour en cours, ou l'état du tournoi. */
  protected readonly badge = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    if (t.status === 'running' && t.bracket) {
      return roundLabel(currentRound(t.bracket), t.bracket.roundCount);
    }
    return STATUS_LABEL[t.status];
  });

  protected readonly featured = computed(() => {
    const bracket = this.tournament()?.bracket;
    if (!bracket) return null;
    const match = liveMatch(bracket);
    return match ? { match, label: roundLabel(match.round, bracket.roundCount) } : null;
  });

  protected readonly rules = TOURNAMENT_RULES;

  /** Retour visuel du bouton « Copier le lien ». */
  protected readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');

  constructor() {
    // Le titre de l'onglet suit le nom du tournoi dès qu'il est chargé.
    const title = inject(Title);
    effect(() => {
      const name = this.tournament()?.name ?? (this.notFound() ? 'Tournoi introuvable' : null);
      if (name) title.setTitle(fullTitle(name));
    });
  }

  async copyLink(): Promise<void> {
    try {
      await this.window?.navigator.clipboard.writeText(this.window.location.href);
      this.copyState.set('copied');
    } catch {
      this.copyState.set('failed');
    }
    setTimeout(() => this.copyState.set('idle'), 2000);
  }
}
