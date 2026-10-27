import { handleAdminUnlock } from './admin';
import { createAnnouncer, destinationFor, type Channel } from './announcements';
import { cocHealth, createCocClient } from './coc';
import { handleDiscord } from './discord/route';
import { CORS_HEADERS, SHORT_CACHE, errorResponse, json } from './http';
import { getTournament, listTournaments } from './repository';
import {
  getClanProfile,
  getFriendlyWar,
  getMatchDetail,
  getPlayerProfile,
  listFriendlyWars,
  listFwPlayers,
  listPlayers,
} from './stats-repository';
import { fwClans, trackFriendlyWars } from './fw-tracker';
import { getLiveWars } from './live';
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
 *   GET /fw/players · GET /fw/wars             FW classiques : classement, dernières guerres
 *   GET /fw/wars/:id                           une FW classique et ses joueurs
 *   GET /live                                  guerres en train de se jouer (en direct)
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
      if (pathname === '/admin/unlock') {
        return request.method === 'POST'
          ? await handleAdminUnlock(request, env)
          : errorResponse(405, 'Envoie le code en POST.');
      }
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
   * Toutes les minutes (wrangler.jsonc → triggers.crons) : l'arbitre
   * automatique regarde les guerres des matchs en cours, et les FW classiques
   * sont suivies.
   */
  async scheduled(_event, env, ctx): Promise<void> {
    // FW classiques : seulement des stats, aucune annonce.
    ctx.waitUntil(
      trackFriendlyWars(env.DB, createCocClient(env), fwClans(env.FW_CLANS))
        .then(({ current, recovered }) => {
          if (current === 'recorded') console.log('FW classique enregistrée');
          if (recovered)
            console.log(`FW reconstituée(s) d'après le dernier état vu : ${recovered}`);
        })
        .catch((error) => console.error('Suivi des FW en échec', error)),
    );
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
  return {
    db: env.DB,
    coc: createCocClient(env),
    siteUrl: env.SITE_URL,
    announcer: createAnnouncer(env),
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
      // Les salons des annonces sont-ils branchés ? (jamais les adresses elles-mêmes)
      // Pour chaque salon : posté par le « bot », par un « webhook », ou rien (false).
      const via = (c: Channel) => destinationFor(env, c)?.by ?? false;
      body['announce'] = {
        resultats: via('results'),
        classement: via('bracket'),
        arbitres:
          env.DISCORD_CHANNEL_ARBITRES || env.DISCORD_WEBHOOK_ARBITRES ? via('referees') : false,
      };
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
  // Les guerres en train de se jouer (page « En direct »). Jamais mis en cache
  // par le navigateur : la mémoire de 30 secondes est côté serveur.
  if (pathname === '/live') {
    const wars = await getLiveWars({
      db: env.DB,
      coc: createCocClient(env),
      fwClans: fwClans(env.FW_CLANS),
      now: Date.now(),
    });
    return json(wars, 200, { 'Cache-Control': 'no-store' });
  }
  // FW classiques (hors tournoi) : classement et dernières guerres.
  if (pathname === '/fw/players') {
    return json(await listFwPlayers(env.DB), 200, SHORT_CACHE);
  }
  if (pathname === '/fw/wars') {
    return json(await listFriendlyWars(env.DB), 200, SHORT_CACHE);
  }
  if ((m = /^\/fw\/wars\/(\d{1,9})$/.exec(pathname))) {
    return found(await getFriendlyWar(env.DB, Number(m[1])), 'FW introuvable.');
  }
  if ((m = new RegExp(`^/players/${TAG}$`).exec(pathname))) {
    return found(await getPlayerProfile(env.DB, `#${m[1]}`), 'Joueur introuvable.');
  }
  if ((m = new RegExp(`^/clans/${TAG}$`).exec(pathname))) {
    return found(await getClanProfile(env.DB, `#${m[1]}`), 'Clan introuvable.');
  }
  return errorResponse(404, 'Adresse inconnue.');
}
