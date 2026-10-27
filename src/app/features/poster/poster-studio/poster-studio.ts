import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminAccess } from '../../../core/admin/admin-access';
import {
  POSTER_FORMATS,
  POSTER_STYLES,
  PosterStyle,
  normalizeDate,
  normalizeTime,
} from '../../../core/poster/poster';
import { slugify } from '../../../core/tournament/format';
import { AdminGate } from '../../../shared/ui/admin-gate/admin-gate';
import { PosterView } from '../poster-view/poster-view';

/** Logos acceptés : images courantes, 8 Mo au plus (comme sur Discord). */
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 8 * 1024 * 1024;
/** Taille réelle de l'affiche (l'aperçu est réduit pour tenir à l'écran). */
const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1350;

type Side = 'left' | 'right';

/**
 * /affiche/creer : le générateur d'affiches des admins.
 *
 * Tout se passe dans le navigateur : les logos choisis sur l'appareil ne
 * quittent jamais l'appareil (ils sont lus sur place, `URL.createObjectURL`),
 * l'aperçu se met à jour à chaque frappe, et « Télécharger » transforme
 * l'affiche en image PNG 1080 × 1350 (bibliothèque html-to-image, chargée
 * seulement à ce moment-là). Même affiche que celle de /arbitre affiche.
 */
@Component({
  selector: 'sc-poster-studio',
  imports: [AdminGate, FormsModule, PosterView],
  templateUrl: './poster-studio.html',
  styleUrl: './poster-studio.scss',
})
export class PosterStudio {
  protected readonly access = inject(AdminAccess);
  protected readonly formats = POSTER_FORMATS;
  protected readonly styles = POSTER_STYLES;

  protected readonly leftName = signal('');
  protected readonly rightName = signal('');
  protected readonly leftLogo = signal<string | null>(null);
  protected readonly rightLogo = signal<string | null>(null);
  protected readonly format = signal<string>('5v5');
  protected readonly date = signal('');
  protected readonly time = signal('');
  protected readonly rules = signal('');
  protected readonly style = signal<PosterStyle>('classique');

  /** Date ou heure tapée mais illisible : on le signale sous le champ. */
  protected readonly dateInvalid = computed(
    () => !!this.date().trim() && !normalizeDate(this.date()),
  );
  protected readonly timeInvalid = computed(
    () => !!this.time().trim() && !normalizeTime(this.time()),
  );
  protected readonly logoError = signal<string | null>(null);

  private readonly poster = viewChild(PosterView);
  private readonly posterEl = viewChild(PosterView, { read: ElementRef });
  private readonly previewBox = viewChild<ElementRef<HTMLElement>>('previewBox');
  /** L'affiche réduite pour tenir dans la colonne (1 = taille réelle). */
  protected readonly scale = signal(0.5);
  protected readonly previewHeight = computed(() => Math.round(POSTER_HEIGHT * this.scale()));

  protected readonly downloading = signal(false);
  protected readonly downloadError = signal<string | null>(null);
  protected readonly canDownload = computed(
    () =>
      !this.downloading() && !!this.poster()?.ready() && !this.dateInvalid() && !this.timeInvalid(),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Taille de l'aperçu : suit la largeur de sa colonne (navigateur seulement).
    afterNextRender(() => {
      const box = this.previewBox()?.nativeElement;
      if (!box || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) =>
        this.scale.set(Math.min(1, entry.contentRect.width / POSTER_WIDTH)),
      );
      observer.observe(box);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    // Les images lues sur l'appareil occupent de la mémoire : on les libère en partant.
    destroyRef.onDestroy(() => {
      for (const url of [this.leftLogo(), this.rightLogo()]) if (url) URL.revokeObjectURL(url);
    });
  }

  protected pickLogo(side: Side, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      this.logoError.set(`« ${file.name} » n'est pas une image PNG, JPG ou WebP.`);
      input.value = '';
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      this.logoError.set(`« ${file.name} » est trop lourd (8 Mo au plus).`);
      input.value = '';
      return;
    }
    this.logoError.set(null);
    const target = side === 'left' ? this.leftLogo : this.rightLogo;
    const previous = target();
    if (previous) URL.revokeObjectURL(previous);
    target.set(URL.createObjectURL(file));
  }

  protected async download(): Promise<void> {
    const host = this.posterEl()?.nativeElement as HTMLElement | undefined;
    const node = host?.querySelector<HTMLElement>('.poster');
    if (!node || !this.canDownload()) return;
    this.downloading.set(true);
    this.downloadError.set(null);
    try {
      const { toPng } = await import('html-to-image');
      const options = { width: POSTER_WIDTH, height: POSTER_HEIGHT, pixelRatio: 1 };
      // Deux passes : au 1er rendu, Safari n'a parfois pas encore les images.
      await toPng(node, options);
      const dataUrl = await toPng(node, options);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = this.fileName();
      link.click();
    } catch (error) {
      console.error('Affiche : export impossible', error);
      this.downloadError.set(
        "Impossible de créer l'image. Réessaie, ou utilise /arbitre affiche sur Discord.",
      );
    } finally {
      this.downloading.set(false);
    }
  }

  /** « affiche-fr-esport-vs-ci-e-sports.png » */
  protected fileName(): string {
    const name = (s: string) => slugify(s) || 'equipe';
    return `affiche-${name(this.leftName())}-vs-${name(this.rightName())}.png`;
  }
}
