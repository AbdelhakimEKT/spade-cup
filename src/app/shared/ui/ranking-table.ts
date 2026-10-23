import { DecimalPipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { tagToUrl } from '../../core/tournament/tags';
import { PlayerTotals } from '../../core/tournament/stats';
import { starsPerAttack } from './labels';

type SortKey = 'stars' | 'wars' | 'triples' | 'average' | 'destruction';

const COLUMNS: readonly { key: SortKey; label: string; title: string }[] = [
  { key: 'wars', label: 'Guerres', title: 'Guerres jouées' },
  { key: 'stars', label: 'Étoiles', title: 'Étoiles au total' },
  { key: 'average', label: '★ / att.', title: 'Étoiles par attaque' },
  { key: 'triples', label: 'Triples', title: 'Attaques à 3 étoiles' },
  { key: 'destruction', label: 'Destr.', title: 'Destruction moyenne par attaque' },
];

/**
 * Classement des joueurs, triable en cliquant sur les en-têtes.
 * Le tri se fait dans le navigateur : le serveur renvoie déjà toutes les lignes.
 */
@Component({
  selector: 'sc-ranking-table',
  imports: [DecimalPipe, RouterLink],
  template: `
    <div class="table-wrap">
      <table class="data-table">
        <caption class="visually-hidden">
          {{
            caption()
          }}, trié par
          {{
            sortTitle()
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col" class="cell-text pinned">Joueur</th>
            @if (showClan()) {
              <th scope="col" class="cell-text">Clan</th>
            }
            @for (col of columns; track col.key) {
              <th scope="col" [attr.aria-sort]="sort() === col.key ? 'descending' : null">
                <button
                  type="button"
                  class="sort"
                  [class.sort--active]="sort() === col.key"
                  [title]="'Trier par ' + col.title.toLowerCase()"
                  (click)="sort.set(col.key)"
                >
                  {{ col.label }}
                </button>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (p of sorted(); track p.tag; let i = $index) {
            <tr>
              <td class="muted">{{ i + 1 }}</td>
              <td class="cell-text pinned">
                <a [routerLink]="['/joueurs', url(p.tag)]">{{ p.name }}</a>
              </td>
              @if (showClan()) {
                <td class="cell-text">
                  <a class="clan" [routerLink]="['/clans', url(p.clan.tag)]">{{ p.clan.name }}</a>
                </td>
              }
              <td>{{ p.wars }}</td>
              <td><span class="star" aria-hidden="true">★</span> {{ p.stars }}</td>
              <td>{{ average(p) | number: '1.2-2' }}</td>
              <td>{{ p.triples }}</td>
              <td>{{ p.destruction | number: '1.1-1' }} %</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .sort {
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      letter-spacing: inherit;
      text-transform: inherit;
      cursor: pointer;

      &:hover {
        color: var(--color-text);
      }
    }

    .sort--active {
      color: var(--color-text);
      box-shadow: inset 0 -2px 0 var(--color-accent-strong);
    }

    // Le nom du joueur reste visible quand on fait défiler le tableau sur téléphone.
    .pinned {
      position: sticky;
      left: 0;
      background: var(--color-panel);
    }

    tr:hover .pinned {
      background: var(--color-panel-2);
    }

    .data-table a.clan {
      color: var(--color-muted);
      font-weight: 400;
    }
  `,
})
export class RankingTable {
  readonly players = input.required<readonly PlayerTotals[]>();
  /** Masqué sur la page d'un clan : tous les joueurs sont du même clan. */
  readonly showClan = input(true);
  readonly caption = input('Classement des joueurs');

  protected readonly columns = COLUMNS;
  protected readonly sort = signal<SortKey>('stars');
  protected readonly sortTitle = computed(() =>
    COLUMNS.find((c) => c.key === this.sort())!.title.toLowerCase(),
  );

  protected readonly sorted = computed(() => {
    const key = this.sort();
    const value = (p: PlayerTotals) => (key === 'average' ? this.average(p) : p[key]);
    // À égalité : le plus d'étoiles, puis le moins de guerres (plus efficace), puis le nom.
    return [...this.players()].sort(
      (a, b) =>
        value(b) - value(a) ||
        b.stars - a.stars ||
        a.wars - b.wars ||
        a.name.localeCompare(b.name, 'fr'),
    );
  });

  protected average(p: PlayerTotals): number {
    return starsPerAttack(p.stars, p.attacks);
  }

  protected url(tag: string): string {
    return tagToUrl(tag);
  }
}
