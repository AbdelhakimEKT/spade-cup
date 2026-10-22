import { Component, Resource, input } from '@angular/core';

/** Ce dont le composant a besoin : une ressource qu'on peut relancer. */
type ReloadableResource = Resource<unknown> & { reload(): boolean };

/**
 * Ce qu'on affiche à la place des données tant qu'elles ne sont pas là :
 * « Chargement… », ou un message d'erreur avec un bouton « Réessayer ».
 *
 * Le texte de chargement n'apparaît qu'au bout de 300 ms (voir le SCSS) :
 * sur une connexion rapide, il ne clignote pas pour rien.
 */
@Component({
  selector: 'sc-request-state',
  template: `
    @if (resource().error()) {
      <div class="state state--error" role="alert">
        <p>{{ errorMessage() }}</p>
        <button type="button" class="retry" (click)="resource().reload()">Réessayer</button>
      </div>
    } @else if (resource().isLoading()) {
      <p class="state state--loading" role="status">
        <span class="spinner" aria-hidden="true"></span>
        Chargement…
      </p>
    }
  `,
  styleUrl: './request-state.scss',
})
export class RequestState {
  readonly resource = input.required<ReloadableResource>();
  readonly errorMessage = input('Le serveur ne répond pas. Vérifie ta connexion, puis réessaie.');
}
