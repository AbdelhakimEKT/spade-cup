import { CORS_HEADERS, SHORT_CACHE, errorResponse, json } from './http';
import { getTournament, listTournaments } from './repository';

/**
 * Point d'entrée du serveur. Pour l'instant, une API publique en lecture :
 *
 *   GET /health               le serveur répond-il ?
 *   GET /tournaments          liste des tournois
 *   GET /tournaments/:slug    un tournoi complet (clans + arbre)
 *
 * Les écritures (inscriptions, tirage, résultats) viendront avec le bot Discord.
 */
export default {
  async fetch(request, env): Promise<Response> {
    // Requête « préalable » envoyée par les navigateurs avant certains appels.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') {
      return errorResponse(405, 'Méthode non autorisée.');
    }

    const { pathname } = new URL(request.url);

    try {
      if (pathname === '/health') {
        return json({ ok: true, service: 'spade-cup-api' }, 200, { 'Cache-Control': 'no-store' });
      }

      if (pathname === '/tournaments') {
        return json(await listTournaments(env.DB), 200, SHORT_CACHE);
      }

      const match = /^\/tournaments\/([a-z0-9-]+)$/.exec(pathname);
      if (match) {
        const tournament = await getTournament(env.DB, match[1]);
        return tournament
          ? json(tournament, 200, SHORT_CACHE)
          : errorResponse(404, 'Tournoi introuvable.');
      }

      return errorResponse(404, 'Adresse inconnue.');
    } catch (error) {
      // Le détail part dans les journaux du serveur, jamais dans la réponse.
      console.error('Erreur inattendue', pathname, error);
      return errorResponse(500, 'Erreur interne, réessaie dans un instant.');
    }
  },
} satisfies ExportedHandler<Env>;
