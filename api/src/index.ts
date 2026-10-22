import { handleDiscord } from './discord/route';
import { CORS_HEADERS, SHORT_CACHE, errorResponse, json } from './http';
import { getTournament, listTournaments } from './repository';
import { getClanProfile, getMatchDetail, getPlayerProfile, listPlayers } from './stats-repository';

/**
 * Point d'entrée du serveur.
 *
 * API publique, en lecture :
 *   GET /health                                le serveur répond-il ?
 *   GET /tournaments                           liste des tournois
 *   GET /tournaments/:slug                     un tournoi complet (clans + arbre)
 *   GET /tournaments/:slug/matches/:id         un match et ses joueurs
 *   GET /players[?tournament=slug]             classement des joueurs
 *   GET /players/:tag                          fiche d'un joueur (tag sans « # »)
 *   GET /clans/:tag                            fiche d'un clan (tag sans « # »)
 *
 * Écritures : uniquement par le bot Discord (POST /discord, requêtes signées).
 */
export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url);

    // Requête « préalable » envoyée par les navigateurs avant certains appels.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (pathname === '/discord') {
        return request.method === 'POST'
          ? await handleDiscord(request, env, ctx)
          : errorResponse(405, 'Réservé à Discord.');
      }
      if (request.method !== 'GET') {
        return errorResponse(405, 'Méthode non autorisée.');
      }
      return await read(pathname, searchParams, env);
    } catch (error) {
      // Le détail part dans les journaux du serveur, jamais dans la réponse.
      console.error('Erreur inattendue', pathname, error);
      return errorResponse(500, 'Erreur interne, réessaie dans un instant.');
    }
  },
} satisfies ExportedHandler<Env>;

const SLUG = '([a-z0-9-]+)';
/** Tag sans « # » dans l'URL. */
const TAG = '([0-9A-Z]{3,15})';

async function read(pathname: string, params: URLSearchParams, env: Env): Promise<Response> {
  const found = (data: unknown, notFound: string) =>
    data ? json(data, 200, SHORT_CACHE) : errorResponse(404, notFound);
  let m: RegExpExecArray | null;

  if (pathname === '/health') {
    return json({ ok: true, service: 'spade-cup-api' }, 200, { 'Cache-Control': 'no-store' });
  }
  if (pathname === '/tournaments') {
    return json(await listTournaments(env.DB), 200, SHORT_CACHE);
  }
  if ((m = new RegExp(`^/tournaments/${SLUG}$`).exec(pathname))) {
    return found(await getTournament(env.DB, m[1]), 'Tournoi introuvable.');
  }
  if ((m = new RegExp(`^/tournaments/${SLUG}/matches/(R\\d{1,2}-M\\d{1,3})$`).exec(pathname))) {
    return found(await getMatchDetail(env.DB, m[1], m[2]), 'Match introuvable.');
  }
  if (pathname === '/players') {
    const tournament = params.get('tournament');
    if (tournament !== null && !/^[a-z0-9-]+$/.test(tournament)) {
      return errorResponse(400, 'Tournoi invalide.');
    }
    return json(
      await listPlayers(env.DB, { tournament: tournament ?? undefined }),
      200,
      SHORT_CACHE,
    );
  }
  if ((m = new RegExp(`^/players/${TAG}$`).exec(pathname))) {
    return found(await getPlayerProfile(env.DB, `#${m[1]}`), 'Joueur introuvable.');
  }
  if ((m = new RegExp(`^/clans/${TAG}$`).exec(pathname))) {
    return found(await getClanProfile(env.DB, `#${m[1]}`), 'Clan introuvable.');
  }
  return errorResponse(404, 'Adresse inconnue.');
}
