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
      text: 'Sur le Discord, un chef tape /inscription avec le tag de son clan. C’est tout.',
    },
    {
      title: 'Tirage',
      text: "À la clôture, l'arbre est tiré au sort par l'ordinateur, sans intervention humaine.",
    },
    {
      title: 'Guerres amicales',
      text: 'Chaque match est une guerre amicale en 5 contre 5, HDV 18. Le bot lit le résultat tout seul.',
    },
    {
      title: 'Classement',
      text: "L'arbre avance tour après tour, et chaque joueur entre au classement.",
    },
  ];
}
