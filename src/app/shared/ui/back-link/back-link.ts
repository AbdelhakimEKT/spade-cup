import { Location } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

/**
 * Le nom de la page à laquelle « ← » ramène, d'après son adresse :
 * « /joueurs?type=fw » → « Classement des FW classiques ».
 */
export function backLabel(url: string): string {
  const [path, query = ''] = url.split('?');
  if (path === '/joueurs') {
    return new URLSearchParams(query).get('type') === 'fw'
      ? 'Classement des FW classiques'
      : 'Classement des joueurs';
  }
  if (path.startsWith('/joueurs/')) return 'Joueur';
  if (path.startsWith('/fw/')) return 'Détail de la FW';
  if (/^\/tournois\/[^/]+\/matchs\//.test(path)) return 'Match';
  if (path.startsWith('/tournois/')) return 'Tournoi';
  if (path === '/tournois') return 'Tournois';
  if (path.startsWith('/clans/')) return 'Clan';
  if (path === '/direct') return 'En direct';
  if (path === '/' || path === '') return 'Accueil';
  return 'Retour';
}

/**
 * Lien « ← » en haut d'une page : ramène à la page d'où l'on vient, telle
 * qu'on l'a laissée (même onglet, même filtre, même adresse), comme le bouton
 * « retour » du navigateur. Ouverte directement (lien partagé) : mène à
 * `fallback`.
 */
@Component({
  selector: 'sc-back-link',
  imports: [RouterLink],
  template: `
    @if (previous) {
      <a class="crumb" [href]="previous" (click)="back($event)">← {{ label }}</a>
    } @else {
      <a class="crumb" [routerLink]="fallbackUrl()">← {{ fallbackLabel() }}</a>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class BackLink {
  /** Adresse si l'on n'a pas de page précédente sur le site, par ex. « /joueurs?type=fw ». */
  readonly fallback = input.required<string>();
  readonly fallbackLabel = input.required<string>();

  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /**
   * La page précédente sur le site, lue une fois à l'ouverture : la navigation
   * en cours (celle qui affiche cette page) garde la trace de la précédente.
   */
  protected readonly previous: string | null = (() => {
    const nav = this.router.currentNavigation() ?? this.router.lastSuccessfulNavigation();
    const url = nav?.previousNavigation?.finalUrl;
    return url ? this.router.serializeUrl(url) : null;
  })();
  protected readonly label = this.previous ? backLabel(this.previous) : '';
  protected readonly fallbackUrl = computed(() => this.router.parseUrl(this.fallback()));

  /** Comme le bouton « retour » : la page revient telle qu'on l'a laissée. */
  protected back(event: MouseEvent): void {
    // Ctrl/⌘-clic : ouvrir dans un nouvel onglet, comme un lien normal.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    this.location.back();
  }
}
