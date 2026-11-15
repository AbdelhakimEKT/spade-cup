import { DecimalPipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import {
  fullRecapWidth,
  outcome,
  parseFullRecap,
  playerTotals,
  type FullPlayer,
  type PlayerTotals,
} from '../../../core/fw/full-recap';
import { SITE_CONFIG } from '../../../core/site-config';
import { thImageSrc } from '../../../core/th-image';

/** Paramètre d'adresse : absent (ou répété) → texte vide. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

interface TeamView {
  readonly index: 1 | 2;
  readonly label: string;
  readonly color: 'violet' | 'green';
  readonly rows: readonly { readonly player: FullPlayer; readonly totals: PlayerTotals }[];
  readonly stars: number;
  readonly triples: number;
}

/**
 * /affiche/bilan-complet?n=44&d=vendredi 06/11&s=3&b={…}
 *
 * Le bilan COMPLET d'une soirée FW : le score de la soirée, chaque FW, puis
 * pour chaque équipe chaque joueur avec chacune de ses attaques et ses
 * totaux. Le bot le photographie (/fw bilan-complet) et le poste dans le
 * salon où la commande a été tapée. FW-Team 1 en violet, FW-Team 2 en vert.
 */
@Component({
  selector: 'sc-full-recap-page',
  imports: [DecimalPipe],
  templateUrl: './full-recap-page.html',
  styleUrl: './full-recap-page.scss',
})
export class FullRecapPage {
  // Les paramètres de l'adresse arrivent dans ces inputs (withComponentInputBinding).
  readonly n = input('', { transform: text });
  readonly d = input('', { transform: text });
  readonly s = input('', { transform: text });
  readonly b = input('', { transform: text });

  protected readonly recap = computed(() => parseFullRecap(this.n(), this.d(), this.s(), this.b()));
  protected readonly result = computed(() => {
    const r = this.recap();
    return r ? outcome(r) : null;
  });
  protected readonly width = computed(() => fullRecapWidth(this.recap()?.wars.length ?? 0));
  /** Colonnes du tableau : joueur, une par FW, puis les totaux. */
  protected readonly columns = computed(
    () =>
      `minmax(0, 1fr) repeat(${this.recap()?.wars.length ?? 0}, 120px) 78px 84px 74px 90px 86px`,
  );

  protected readonly teams = computed<TeamView[]>(() => {
    const r = this.recap();
    if (!r) return [];
    return ([1, 2] as const).map((index) => {
      const rows = r.teams[index - 1].map((player) => ({ player, totals: playerTotals(player) }));
      return {
        index,
        label: `FW-Team ${index}`,
        color: index === 1 ? 'violet' : 'green',
        rows,
        stars: rows.reduce((sum, row) => sum + row.totals.stars, 0),
        triples: rows.reduce((sum, row) => sum + row.totals.triples, 0),
      };
    });
  });

  protected readonly discord = SITE_CONFIG.discordInvite.replace(/^https:\/\//, '');

  protected thImage(th: number | null): string | null {
    return thImageSrc(th);
  }

  /** « ★★ » gagnées et « ★ » manquée, pour une attaque à 2 étoiles. */
  protected stars(n: number): { won: string; missed: string } {
    const won = Math.max(0, Math.min(3, n));
    return { won: '★'.repeat(won), missed: '★'.repeat(3 - won) };
  }

  /** 154 s → « 2:34 ». */
  protected time(seconds: number): string {
    const s = Math.round(seconds);
    return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '–';
  }

  /** Images des HDV chargées (ou en échec) : le bot attend qu'elles le soient. */
  private readonly loaded = signal(0);
  protected readonly ready = computed(() => {
    const images = this.teams().reduce(
      (n, t) => n + t.rows.filter((row) => this.thImage(row.player.th)).length,
      0,
    );
    return this.recap() !== null && this.loaded() >= images;
  });
  protected imageDone(): void {
    this.loaded.update((n) => n + 1);
  }
}
