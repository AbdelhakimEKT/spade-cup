import { DecimalPipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { tagToUrl } from '../../core/tournament/tags';
import { PlayerTotals } from '../../core/tournament/stats';
import { starsPerAttack } from './labels';

type SortKey = 'stars' | 'wars' | 'triples' | 'average' | 'destruction';
type SortDir = 'asc' | 'desc';

/** Un critère de tri : une colonne et son sens. */
interface Criterion {
  readonly key: SortKey;
  readonly dir: SortDir;
}

const COLUMNS: readonly { key: SortKey; label: string; title: string }[] = [
  { key: 'wars', label: 'Guerres', title: 'Guerres jouées' },
  { key: 'stars', label: 'Étoiles', title: 'Étoiles au total' },
  { key: 'average', label: '★ / att.', title: 'Étoiles par attaque' },
  { key: 'triples', label: 'Triples', title: 'Attaques à 3 étoiles' },
  { key: 'destruction', label: 'Destr.', title: 'Destruction moyenne par attaque' },
];

/** Au-delà, un nouveau critère remplace le dernier. */
const MAX_CRITERIA = 3;

/**
 * Classement des joueurs, triable sur PLUSIEURS colonnes à la fois.
 * - 1er clic sur une colonne : elle trie, du plus grand au plus petit ;
 * - clic sur une autre colonne : elle s'ajoute comme 2e critère (pour
 *   départager les ex aequo du 1er), puis 3e ;
 * - reclic sur une colonne déjà choisie : son sens s'inverse (▼ / ▲) ;
 * - ✕ sur un critère le retire, « Réinitialiser » revient au tri par étoiles.
 * Le tri se fait dans le navigateur : le serveur renvoie déjà toutes les lignes.
 */
@Component({
  selector: 'sc-ranking-table',
  imports: [DecimalPipe, RouterLink],
  templateUrl: './ranking-table.html',
  styleUrl: './ranking-table.scss',
})
export class RankingTable {
  readonly players = input.required<readonly PlayerTotals[]>();
  /** Masqué sur la page d'un clan (tous du même clan) et en FW (les joueurs changent de team). */
  readonly showClan = input(true);
  readonly caption = input('Classement des joueurs');
  /** Nombre de lignes affichées avant « Voir toute la liste » (`null` : toutes). */
  readonly limit = input<number | null>(null);

  protected readonly columns = COLUMNS;
  /** Les critères choisis, dans l'ordre. Vide : tri par défaut (étoiles). */
  protected readonly criteria = signal<readonly Criterion[]>([]);
  protected readonly expanded = signal(false);

  /** Les critères réellement appliqués (le tri par défaut si aucun n'est choisi). */
  private readonly applied = computed<readonly Criterion[]>(() =>
    this.criteria().length ? this.criteria() : [{ key: 'stars', dir: 'desc' }],
  );

  protected readonly sortDescription = computed(() =>
    this.applied()
      .map(
        (c) =>
          `${this.label(c.key, 'title').toLowerCase()} (${c.dir === 'desc' ? 'décroissant' : 'croissant'})`,
      )
      .join(', puis '),
  );

  /**
   * Les joueurs triés, avec leur rang.
   * Le RANG suit les critères choisis, du meilleur au moins bon ; à égalité :
   * le plus d'étoiles, la meilleure destruction, le moins de guerres. Égalité
   * parfaite sur tout ça : même rang (1, 1, 3…). Le SENS (▼ / ▲) ne change que
   * l'ordre d'affichage : chacun garde son rang.
   */
  protected readonly ranked = computed(() => {
    const criteria = this.applied();
    const merit = (a: PlayerTotals, b: PlayerTotals) => {
      for (const c of criteria) {
        const diff = this.value(b, c.key) - this.value(a, c.key);
        if (diff) return diff;
      }
      return b.stars - a.stars || b.destruction - a.destruction || a.wars - b.wars;
    };
    const sorted = [...this.players()].sort(
      (a, b) => merit(a, b) || a.name.localeCompare(b.name, 'fr'),
    );
    let rank = 0;
    const rows = sorted.map((player, i) => {
      if (i === 0 || merit(sorted[i - 1], player) !== 0) rank = i + 1;
      return { player, rank };
    });
    if (criteria.every((c) => c.dir === 'desc')) return rows;
    // Affichage dans les sens choisis ; à égalité, l'ordre du classement.
    return rows.sort((a, b) => {
      for (const c of criteria) {
        const diff = this.value(a.player, c.key) - this.value(b.player, c.key);
        if (diff) return c.dir === 'asc' ? diff : -diff;
      }
      return a.rank - b.rank;
    });
  });

  /** Les lignes affichées : les `limit` premières, ou toutes une fois la liste dépliée. */
  protected readonly shown = computed(() => {
    const limit = this.limit();
    return limit === null || this.expanded() ? this.ranked() : this.ranked().slice(0, limit);
  });
  protected readonly hidden = computed(() => this.ranked().length - this.shown().length);

  /** Colonne déjà choisie : on inverse son sens. Sinon : un critère de plus. */
  protected sortBy(key: SortKey): void {
    this.criteria.update((list) => {
      const i = list.findIndex((c) => c.key === key);
      if (i !== -1) {
        return list.map((c, j) => (j === i ? { key, dir: c.dir === 'desc' ? 'asc' : 'desc' } : c));
      }
      const added: Criterion = { key, dir: 'desc' };
      return list.length < MAX_CRITERIA ? [...list, added] : [...list.slice(0, -1), added];
    });
  }

  protected remove(key: SortKey): void {
    this.criteria.update((list) => list.filter((c) => c.key !== key));
  }

  protected reset(): void {
    this.criteria.set([]);
  }

  /** Le critère d'une colonne et sa place (1, 2, 3), ou `null` si elle ne trie pas. */
  protected criterionOf(key: SortKey): { dir: SortDir; order: number } | null {
    const list = this.applied();
    const i = list.findIndex((c) => c.key === key);
    return i === -1 ? null : { dir: list[i].dir, order: i + 1 };
  }

  protected ariaSort(key: SortKey): string | null {
    const first = this.applied()[0];
    if (first.key !== key) return null;
    return first.dir === 'desc' ? 'descending' : 'ascending';
  }

  protected label(key: SortKey, field: 'label' | 'title' = 'label'): string {
    return COLUMNS.find((c) => c.key === key)![field];
  }

  protected medal(rank: number): string {
    return ['🥇', '🥈', '🥉'][rank - 1] ?? '';
  }

  protected average(p: PlayerTotals): number {
    return starsPerAttack(p.stars, p.attacks);
  }

  protected url(tag: string): string {
    return tagToUrl(tag);
  }

  private value(p: PlayerTotals, key: SortKey): number {
    return key === 'average' ? this.average(p) : p[key];
  }
}
