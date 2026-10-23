import { HttpResourceRef, httpResource } from '@angular/common/http';
import { Service } from '@angular/core';
import { SITE_CONFIG } from '../../../core/site-config';
import { MatchDetail } from '../../../core/tournament/stats';
import { Tournament, TournamentSummary } from './tournament';

/**
 * Accès aux tournois, lus sur le serveur Cloudflare (dossier api/).
 * Les pages ne connaissent ni l'adresse du serveur ni la forme des URL :
 * seul ce service les connaît.
 *
 * Chaque méthode renvoie une « ressource » : un objet à base de signals qui
 * lance la requête et expose son état (`isLoading()`, `error()`,
 * `hasValue()`, `value()`). Une ressource vit avec le composant qui la crée,
 * donc ces méthodes s'appellent pendant sa construction (initialisation d'un
 * champ), et la requête est annulée si on quitte la page avant la réponse.
 */
@Service()
export class Tournaments {
  private readonly api = SITE_CONFIG.apiUrl;

  list(): HttpResourceRef<readonly TournamentSummary[] | undefined> {
    return httpResource<readonly TournamentSummary[]>(() => `${this.api}/tournaments`);
  }

  /**
   * `slug` est une fonction (un signal, typiquement) : si elle change, la
   * ressource relance la requête toute seule. Passer d'un tournoi à un autre
   * sans quitter la page fonctionne donc sans code supplémentaire. Si elle
   * renvoie `null`, rien n'est demandé.
   */
  bySlug(slug: () => string | null): HttpResourceRef<Tournament | undefined> {
    return httpResource<Tournament>(() => {
      const value = slug();
      // Pas de slug : la ressource reste au repos, aucune requête ne part.
      return value === null ? undefined : `${this.api}/tournaments/${encodeURIComponent(value)}`;
    });
  }

  /** Un match de l'arbre, avec les lignes de ses joueurs. */
  match(slug: () => string, matchId: () => string): HttpResourceRef<MatchDetail | undefined> {
    return httpResource<MatchDetail>(
      () =>
        `${this.api}/tournaments/${encodeURIComponent(slug())}/matches/${encodeURIComponent(matchId())}`,
    );
  }
}
