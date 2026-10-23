import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RankingTable } from '../../../shared/ui/ranking-table';
import { RequestState } from '../../../shared/request-state/request-state';
import { Tournaments } from '../../tournaments/data/tournaments';
import { Players } from '../data/players';

/**
 * Classement des joueurs : tous les vrais tournois, ou un seul avec
 * /joueurs?tournoi=slug. Le paramètre d'URL arrive directement dans l'input
 * `tournoi`, comme les paramètres de route.
 */
@Component({
  selector: 'sc-ranking-page',
  imports: [RankingTable, RequestState, RouterLink],
  template: `
    <header class="page-head">
      <p class="eyebrow">Statistiques</p>
      <h1 class="page-title">Classement des joueurs</h1>
      <p class="lead">
        Chaque guerre amicale lue dans le jeu ajoute une ligne par joueur. Clique sur une colonne
        pour changer le tri.
      </p>
    </header>

    @if (slug()) {
      <p class="filter">
        <span class="chip">Tournoi : {{ tournamentName() }}</span>
        <a routerLink="/joueurs">Voir tous les tournois</a>
      </p>
    }

    @if (players.hasValue()) {
      @if (players.value().length) {
        <sc-ranking-table [players]="players.value()" />
      } @else if (!slug()) {
        <div class="panel">
          <p>
            Aucune guerre de tournoi n'a encore été jouée : le classement démarrera avec le premier
            tournoi.
          </p>
          <p>
            En attendant, voici à quoi il ressemblera :
            <a routerLink="/joueurs" [queryParams]="{ tournoi: 'demo' }"
              >classement du tournoi de démonstration</a
            >.
          </p>
        </div>
      } @else {
        <p class="panel">Aucune guerre lue dans le jeu pour ce tournoi.</p>
      }
    } @else {
      <sc-request-state [resource]="players" />
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-5);
    }

    .filter {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }

    .panel {
      display: grid;
      gap: var(--space-2);
    }
  `,
})
export class RankingPage {
  /** Paramètre d'URL facultatif « ?tournoi=slug ». */
  readonly tournoi = input<string>();

  protected readonly slug = computed(() => this.tournoi() || null);
  protected readonly players = inject(Players).ranking(this.slug);

  private readonly tournament = inject(Tournaments).bySlug(this.slug);
  protected readonly tournamentName = computed(() =>
    this.tournament.hasValue() ? this.tournament.value().name : this.slug(),
  );
}
