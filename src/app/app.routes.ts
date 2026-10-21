import { Routes } from '@angular/router';

/**
 * Plan du site.
 *
 * Chaque page est chargée « à la demande » (`loadComponent`) : son code n'est
 * téléchargé que lorsqu'on y va. La page d'accueil reste donc légère, même
 * quand le site grossira.
 *
 * Les tags Clash of Clans commencent par « # », un caractère réservé dans une
 * URL : on les écrit sans, par exemple /clans/2JU0GRG98.
 */
export const routes: Routes = [
  {
    path: '',
    title: 'Accueil',
    loadComponent: () => import('./features/home/home-page/home-page').then((m) => m.HomePage),
  },
  {
    path: 'tournois',
    children: [
      {
        path: '',
        title: 'Tournois',
        loadComponent: () =>
          import('./features/tournaments/tournament-list-page/tournament-list-page').then(
            (m) => m.TournamentListPage,
          ),
      },
      {
        path: ':slug',
        title: 'Tournoi',
        loadComponent: () =>
          import('./features/tournaments/tournament-page/tournament-page').then(
            (m) => m.TournamentPage,
          ),
      },
      {
        path: ':slug/matchs/:matchId',
        title: 'Match',
        loadComponent: () =>
          import('./features/tournaments/match-page/match-page').then((m) => m.MatchPage),
      },
    ],
  },
  {
    path: 'clans/:tag',
    title: 'Clan',
    loadComponent: () => import('./features/clans/clan-page/clan-page').then((m) => m.ClanPage),
  },
  {
    path: 'joueurs/:tag',
    title: 'Joueur',
    loadComponent: () =>
      import('./features/players/player-page/player-page').then((m) => m.PlayerPage),
  },
  {
    // Toute autre adresse : page introuvable.
    path: '**',
    title: 'Page introuvable',
    loadComponent: () =>
      import('./features/not-found/not-found-page/not-found-page').then((m) => m.NotFoundPage),
  },
];
