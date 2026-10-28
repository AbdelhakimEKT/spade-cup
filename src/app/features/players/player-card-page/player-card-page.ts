import {
  Component,
  ElementRef,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { playerCard } from '../../../core/fw/player-card';
import { fullTitle } from '../../../core/page-title';
import { slugify } from '../../../core/tournament/format';
import { RequestState } from '../../../shared/request-state/request-state';
import { Players } from '../data/players';
import { PlayerCardView } from '../player-card/player-card';

/** Taille réelle de la carte (l'aperçu est réduit pour tenir à l'écran). */
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

/**
 * /joueurs/:tag/carte : la carte d'un joueur, à télécharger ou à partager
 * (sur téléphone, le menu de partage propose Discord, Instagram…).
 * /joueurs/:tag/carte?capture : la carte seule, que le bot photographie.
 */
@Component({
  selector: 'sc-player-card-page',
  imports: [PlayerCardView, RequestState, RouterLink],
  templateUrl: './player-card-page.html',
  styleUrl: './player-card-page.scss',
  host: { '[class.capture]': 'capture()' },
})
export class PlayerCardPage {
  /** Tag sans « # », depuis l'URL. */
  readonly tag = input.required<string>();
  readonly capture = input(false, { transform: booleanAttribute });

  private readonly players = inject(Players);
  protected readonly request = this.players.profile(this.tag);
  /** Le classement FW, pour sa place sur la carte. */
  private readonly ranking = this.players.fwRanking(() => true);
  protected readonly notFound = computed(() => this.request.statusCode() === 404);
  /** La carte, une fois la fiche ET le classement arrivés (la place en dépend). */
  protected readonly card = computed(() => {
    if (!this.request.hasValue()) return null;
    if (this.ranking.isLoading()) return null;
    return playerCard(this.request.value(), this.ranking.hasValue() ? this.ranking.value() : null);
  });

  private readonly cardEl = viewChild(PlayerCardView, { read: ElementRef });
  private readonly previewBox = viewChild<ElementRef<HTMLElement>>('previewBox');
  protected readonly scale = signal(0.5);
  protected readonly previewHeight = computed(() => Math.round(CARD_HEIGHT * this.scale()));
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);
  /** Partage de fichiers possible (téléphone, surtout). */
  protected readonly canShare = signal(false);

  constructor() {
    const title = inject(Title);
    effect(() => {
      const c = this.card();
      if (c) title.setTitle(fullTitle(`Carte de ${c.name}`));
    });
    afterNextRender(() =>
      this.canShare.set(typeof navigator !== 'undefined' && 'canShare' in navigator),
    );
    // L'aperçu n'existe qu'une fois la carte arrivée : on suit sa largeur dès
    // qu'il apparaît, pour que la carte le remplisse.
    effect((onCleanup) => {
      const box = this.previewBox()?.nativeElement;
      if (!box || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) =>
        this.scale.set(Math.min(1, entry.contentRect.width / CARD_WIDTH)),
      );
      observer.observe(box);
      onCleanup(() => observer.disconnect());
    });
  }

  /** La carte en image PNG (comme l'affiche : bibliothèque chargée à la demande). */
  private async image(): Promise<Blob> {
    const node = (
      this.cardEl()?.nativeElement as HTMLElement | undefined
    )?.querySelector<HTMLElement>('.poster');
    if (!node) throw new Error('Carte absente');
    const { toBlob } = await import('html-to-image');
    const options = { width: CARD_WIDTH, height: CARD_HEIGHT, pixelRatio: 1 };
    // Deux passes : au 1er rendu, Safari n'a parfois pas encore les images.
    await toBlob(node, options);
    const blob = await toBlob(node, options);
    if (!blob) throw new Error('Image vide');
    return blob;
  }

  protected fileName(): string {
    return `carte-${slugify(this.card()?.name ?? '') || 'joueur'}.png`;
  }

  protected async download(): Promise<void> {
    await this.run(async () => {
      const url = URL.createObjectURL(await this.image());
      const link = document.createElement('a');
      link.href = url;
      link.download = this.fileName();
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  /** Le menu de partage du téléphone, avec l'image ; sinon, on la télécharge. */
  protected async share(): Promise<void> {
    await this.run(async () => {
      const file = new File([await this.image()], this.fileName(), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            text: `Ma carte Friendly Wars : ${location.href}`,
          });
        } catch (error) {
          // Partage annulé par la personne : rien à signaler.
          if ((error as Error).name !== 'AbortError') throw error;
        }
      } else {
        await this.download();
      }
    });
  }

  protected async copyLink(): Promise<void> {
    await this.run(async () => {
      await navigator.clipboard.writeText(location.href.replace(/\?.*$/, ''));
      this.message.set('Lien copié !');
    });
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      await task();
    } catch (error) {
      console.error('Carte : action impossible', error);
      this.message.set('Impossible pour le moment. Réessaie dans un instant.');
    } finally {
      this.busy.set(false);
    }
  }
}
