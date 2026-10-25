import { DecimalPipe } from '@angular/common';
import { Component, computed, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlayerLine } from '../../../core/tournament/coc-war';
import { formatDuration } from '../../../core/tournament/format';
import { Side } from '../../../core/tournament/models';
import { tagToUrl } from '../../../core/tournament/tags';
import { LineSortKey, SortDir, firstDir, sortLines } from './sort-lines';

/** Le camp d'un joueur, tel que la colonne « Équipe » l'affiche. */
export interface TableTeam {
  readonly name: string;
  /** Couleur d'équipe (violet, green), ou `null` : texte normal. */
  readonly color: string | null;
}

interface Column {
  readonly key: LineSortKey;
  readonly label: string;
  readonly title: string;
  readonly text?: boolean;
}

const COLUMNS: readonly Column[] = [
  { key: 'position', label: 'Pos.', title: 'place sur la carte' },
  { key: 'name', label: 'Joueur', title: 'pseudo', text: true },
  { key: 'team', label: 'Équipe', title: 'équipe', text: true },
  { key: 'townHall', label: 'HDV', title: 'hôtel de ville' },
  { key: 'target', label: 'Cible', title: 'base attaquée', text: true },
  { key: 'stars', label: 'Étoiles', title: 'étoiles' },
  { key: 'destruction', label: 'Destr.', title: 'pourcentage de destruction' },
  { key: 'duration', label: 'Temps', title: "temps d'attaque" },
];

/**
 * Les joueurs d'une guerre, triables : un clic sur un en-tête trie la colonne,
 * un second clic inverse le sens (▲ croissant, ▼ décroissant).
 * Sert à la page d'un match de tournoi (un tableau par clan) et à celle d'une
 * FW classique (les deux équipes ensemble, avec la colonne « Équipe »).
 */
@Component({
  selector: 'sc-war-players-table',
  imports: [DecimalPipe, RouterLink],
  templateUrl: './war-players-table.html',
  styleUrl: './war-players-table.scss',
})
export class WarPlayersTable {
  readonly players = input.required<readonly PlayerLine[]>();
  readonly caption = input('Joueurs de la guerre');
  /** Le nom (et la couleur) de chaque camp : ajoute la colonne « Équipe ». */
  readonly teams = input<Readonly<Record<Side, TableTeam>> | null>(null);
  /** HDV exigé par le règlement : un joueur en dessous est signalé en rouge. */
  readonly townHallRule = input<number | null>(null);
  /** La colonne triée à l'ouverture. */
  readonly initialSort = input<LineSortKey>('position');

  /** Le tri choisi ; revient au tri de départ si celui-ci change. */
  protected readonly sort = linkedSignal<{ key: LineSortKey; dir: SortDir }>(() => ({
    key: this.initialSort(),
    dir: firstDir(this.initialSort()),
  }));

  /** « Cible » seulement si la guerre la connaît (FW enregistrées depuis le 25/10). */
  protected readonly hasTargets = computed(() => this.players().some((p) => p.targets));

  protected readonly columns = computed(() =>
    COLUMNS.filter(
      (c) => (c.key !== 'team' || this.teams()) && (c.key !== 'target' || this.hasTargets()),
    ),
  );

  protected readonly sorted = computed(() => {
    const { key, dir } = this.sort();
    const teams = this.teams();
    return sortLines(this.players(), key, dir, (l) => teams?.[l.side].name ?? l.side);
  });

  protected readonly sortLabel = computed(() => {
    const { key, dir } = this.sort();
    const title = COLUMNS.find((c) => c.key === key)!.title;
    return `${title}, ordre ${dir === 'asc' ? 'croissant' : 'décroissant'}`;
  });

  /** Même colonne : on inverse le sens. Autre colonne : son sens naturel. */
  protected sortBy(key: LineSortKey): void {
    this.sort.update((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir(key) },
    );
  }

  protected ariaSort(key: LineSortKey): string | null {
    const s = this.sort();
    if (s.key !== key) return null;
    return s.dir === 'asc' ? 'ascending' : 'descending';
  }

  protected readonly duration = formatDuration;
  protected readonly url = tagToUrl;
}
