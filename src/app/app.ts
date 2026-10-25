import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ScrollRestore } from './core/navigation/scroll-restore';
import { BrandBolts } from './layout/brand-bolts/brand-bolts';
import { SiteFooter } from './layout/site-footer/site-footer';
import { SiteHeader } from './layout/site-header/site-header';

/**
 * Composant racine : la « coquille » commune à toutes les pages.
 * `<router-outlet />` est l'emplacement où le routeur affiche la page
 * correspondant à l'URL.
 */
@Component({
  selector: 'sc-root',
  imports: [RouterOutlet, BrandBolts, SiteHeader, SiteFooter],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // Démarré avec le site : un retour en arrière remet la page où on l'avait laissée.
  private readonly scrollRestore = inject(ScrollRestore);
}
