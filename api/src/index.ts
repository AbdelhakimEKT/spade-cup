import { captureBracket } from './bracket-image';
import { cocHealth, createCocClient } from './coc';
import { postToWebhook } from './discord/payload';
import { handleDiscord } from './discord/route';
import { CORS_HEADERS, SHORT_CACHE, errorResponse, json } from './http';
import { getTournament, listTournaments } from './repository';
import { getClanProfile, getMatchDetail, getPlayerProfile, listPlayers } from './stats-repository';
import { runWatch, type WatchDeps } from './watch';

/**
 * Point d'entrée du serveur.
 *
 * API publique, en lecture :
 *   GET /health[?coc]                          le serveur (et la clé du jeu) répond-il ?
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

  /**
   * Toutes les 5 minutes (wrangler.jsonc → triggers.crons) : l'arbitre
   * automatique regarde les guerres des matchs en cours.
   */
  async scheduled(_event, env, ctx): Promise<void> {
    ctx.waitUntil(
      runWatch(watchDeps(env))
        .then((report) => {
          if (report.started.length || report.finished.length || report.ties.length) {
            console.log('Arbitrage automatique', JSON.stringify(report));
          }
        })
        .catch((error) => console.error('Arbitrage automatique en échec', error)),
    );
  },
} satisfies ExportedHandler<Env>;

export function watchDeps(env: Env): WatchDeps {
  const webhook = env.DISCORD_ANNOUNCE_WEBHOOK;
  return {
    db: env.DB,
    coc: createCocClient(env),
    siteUrl: env.SITE_URL,
    captureBracket: (slug) => captureBracket(env.BROWSER, env.SITE_URL, slug),
    announce: webhook ? (reply) => postToWebhook(webhook, reply) : null,
  };
}

const SLUG = '([a-z0-9-]+)';
/** Tag sans « # » dans l'URL. */
const TAG = '([0-9A-Z]{3,15})';

async function read(pathname: string, params: URLSearchParams, env: Env): Promise<Response> {
  const found = (data: unknown, notFound: string) =>
    data ? json(data, 200, SHORT_CACHE) : errorResponse(404, notFound);
  let m: RegExpExecArray | null;

  if (pathname === '/health') {
    const body: Record<string, unknown> = { ok: true, service: 'spade-cup-api' };
    // /health?coc : vérifie aussi que la clé de l'API du jeu fonctionne.
    if (params.has('coc')) {
      body['coc'] = await cocHealth(env);
      // Le salon des annonces automatiques est-il branché ? (jamais l'adresse elle-même)
      body['announce'] = Boolean(env.DISCORD_ANNOUNCE_WEBHOOK);
    }
    return json(body, 200, { 'Cache-Control': 'no-store' });
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
