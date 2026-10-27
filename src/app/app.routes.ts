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
        // Titre provisoire : la page le remplace par le nom du tournoi une fois
        // celui-ci chargé (un « resolver » bloquerait la navigation pendant
        // l'appel au serveur : le clic semblerait sans effet).
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
    path: 'joueurs',
    children: [
      {
        path: '',
        title: 'Classement des joueurs',
        loadComponent: () =>
          import('./features/players/ranking-page/ranking-page').then((m) => m.RankingPage),
      },
      {
        path: ':tag',
        title: 'Joueur',
        loadComponent: () =>
          import('./features/players/player-page/player-page').then((m) => m.PlayerPage),
      },
    ],
  },
  {
    path: 'fw/:id',
    title: 'FW classique',
    loadComponent: () =>
      import('./features/players/fw-war-page/fw-war-page').then((m) => m.FwWarPage),
  },
  {
    path: 'direct',
    title: 'En direct',
    loadComponent: () => import('./features/live/live-page/live-page').then((m) => m.LivePage),
  },
  {
    path: 'affiche',
    children: [
      {
        // Affiche d'un match, photographiée par le bot (/arbitre affiche).
        path: '',
        title: 'Affiche',
        loadComponent: () =>
          import('./features/poster/poster-page/poster-page').then((m) => m.PosterPage),
      },
      {
        // Le générateur des admins (code d'accès vérifié par le serveur).
        path: 'creer',
        title: 'Créer une affiche',
        loadComponent: () =>
          import('./features/poster/poster-studio/poster-studio').then((m) => m.PosterStudio),
      },
    ],
  },
  {
    path: 'a-propos',
    title: 'Comment ça marche',
    loadComponent: () => import('./features/about/about-page/about-page').then((m) => m.AboutPage),
  },
  {
    // Toute autre adresse : page introuvable.
    path: '**',
    title: 'Page introuvable',
    loadComponent: () =>
      import('./features/not-found/not-found-page/not-found-page').then((m) => m.NotFoundPage),
  },
];
