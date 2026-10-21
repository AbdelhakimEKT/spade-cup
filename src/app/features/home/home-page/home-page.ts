import { NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE_CONFIG } from '../../../core/site-config';

interface Step {
  title: string;
  text: string;
}

@Component({
  selector: 'sc-home-page',
  imports: [NgOptimizedImage, RouterLink],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  protected readonly discordInvite = SITE_CONFIG.discordInvite;

  /** Déroulement d'un tournoi : l'ordre compte, d'où une liste numérotée. */
  protected readonly steps: readonly Step[] = [
    {
      title: 'Inscription',
      text: 'Les chefs inscrivent leur clan sur le Discord, simplement avec son tag.',
    },
    {
      title: 'Tirage',
      text: "À la clôture des inscriptions, l'arbre des matchs se génère tout seul.",
    },
    {
      title: 'Guerres amicales',
      text: 'Chaque match est une guerre amicale. Les résultats remontent automatiquement.',
    },
    {
      title: 'Classement',
      text: "L'arbre avance tour après tour, avec les statistiques de chaque joueur.",
    },
  ];
}
