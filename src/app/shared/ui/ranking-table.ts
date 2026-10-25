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
          @for (row of ranked(); track row.player.tag) {
            @let p = row.player;
            <tr>
              <!-- Le rang juste à gauche du nom : il reste visible quand on fait
                   défiler le tableau sur téléphone (cellule épinglée). -->
              <td class="cell-text pinned">
                <span class="rank" [class.rank--podium]="row.rank <= 3">
                  {{ medal(row.rank)
                  }}<span [class.visually-hidden]="row.rank <= 3">{{ row.rank }}</span>
                </span>
                <a [routerLink]="['/joueurs', url(p.tag)]">{{ p.name }}</a>
              </td>
              @if (showClan()) {
                <td class="cell-text">
                  @if (clanColors(); as colors) {
                    <!-- Clans de FW : pas de fiche de clan, mais leur couleur d'équipe. -->
                    <span [class]="'team--' + colors[p.clan.tag]">{{ p.clan.name }}</span>
                  } @else {
                    <a class="clan" [routerLink]="['/clans', url(p.clan.tag)]">{{ p.clan.name }}</a>
                  }
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

    .rank {
      display: inline-block;
      min-width: 2.2em;
      color: var(--color-text);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .rank--podium {
      font-size: 1.15em;
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
  /** Clans de FW : couleur d'équipe par tag, à la place du lien vers la fiche du clan. */
  readonly clanColors = input<Readonly<Record<string, string>> | null>(null);

  protected readonly columns = COLUMNS;
  protected readonly sort = signal<SortKey>('stars');
  protected readonly sortTitle = computed(() =>
    COLUMNS.find((c) => c.key === this.sort())!.title.toLowerCase(),
  );

  /**
   * Les joueurs triés, avec leur rang. À égalité sur la colonne choisie : le
   * plus d'étoiles, puis la meilleure destruction, puis le moins de guerres
   * (plus efficace). Égalité parfaite sur tout ça : même rang (1, 1, 3…), et
   * l'ordre alphabétique ne sert qu'à l'affichage, jamais au classement.
   */
  protected readonly ranked = computed(() => {
    const key = this.sort();
    const value = (p: PlayerTotals) => (key === 'average' ? this.average(p) : p[key]);
    const merit = (a: PlayerTotals, b: PlayerTotals) =>
      value(b) - value(a) || b.stars - a.stars || b.destruction - a.destruction || a.wars - b.wars;
    const sorted = [...this.players()].sort(
      (a, b) => merit(a, b) || a.name.localeCompare(b.name, 'fr'),
    );
    let rank = 0;
    return sorted.map((player, i) => {
      if (i === 0 || merit(sorted[i - 1], player) !== 0) rank = i + 1;
      return { player, rank };
    });
  });

  protected medal(rank: number): string {
    return ['🥇', '🥈', '🥉'][rank - 1] ?? '';
  }

  protected average(p: PlayerTotals): number {
    return starsPerAttack(p.stars, p.attacks);
  }

  protected url(tag: string): string {
    return tagToUrl(tag);
  }
}
