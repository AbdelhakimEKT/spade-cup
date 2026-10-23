import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TOURNAMENT_RULES } from '../../../core/tournament/models';
import { SITE_CONFIG } from '../../../core/site-config';

/**
 * « Comment ça marche » : le règlement expliqué simplement, puis les coulisses
 * techniques du site. Contenu statique : aucune donnée à charger.
 */
@Component({
  selector: 'sc-about-page',
  imports: [RouterLink],
  templateUrl: './about-page.html',
  styleUrl: './about-page.scss',
})
export class AboutPage {
  protected readonly rules = TOURNAMENT_RULES;
  protected readonly repoUrl = SITE_CONFIG.repoUrl;
}
