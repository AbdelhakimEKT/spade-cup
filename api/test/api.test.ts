import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_TOURNAMENT } from '../../src/app/features/tournaments/data/demo-tournament';
import { DEMO_MATCH_PLAYERS } from '../../src/app/features/tournaments/data/demo-players';
import { saveTournament } from '../src/repository';

// Appelle le serveur exactement comme le ferait un navigateur.
const call = (path: string, init?: RequestInit) =>
  exports.default.fetch(`https://spade-cup-api.test${path}`, init);

describe('API HTTP', () => {
  beforeEach(async () => {
    await saveTournament(env.DB, DEMO_TOURNAMENT, DEMO_MATCH_PLAYERS);
  });

  it('GET /health', async () => {
    const res = await call('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: 'spade-cup-api' });
  });

  it('GET /health?coc : dit si la clé du jeu marche (ici, aucune clé en test)', async () => {
    const res = await call('/health?coc');
    expect(await res.json()).toEqual({
      ok: true,
      service: 'spade-cup-api',
      coc: 'not-configured',
      announce: { resultats: false, classement: false, arbitres: false },
    });
  });

  it('GET /tournaments : la liste, en JSON, lisible depuis le site (CORS)', async () => {
    const res = await call('/tournaments');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res.json()).toEqual([
      {
        slug: 'demo',
        name: 'Tournoi de démonstration',
        status: 'running',
        clanCount: 16,
        isDemo: true,
      },
    ]);
  });

  it('GET /tournaments/demo : le tournoi complet, identique à la démo', async () => {
    const res = await call('/tournaments/demo');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=15');
    expect(await res.json()).toEqual(DEMO_TOURNAMENT);
  });

  it('tournoi inconnu : 404 avec un message clair', async () => {
    const res = await call('/tournaments/nexiste-pas');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Tournoi introuvable.' });
  });

  it('GET /tournaments/demo/matches/R1-M1 : le match et ses joueurs', async () => {
    const res = await call('/tournaments/demo/matches/R1-M1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { match: { id: string }; players: { home: unknown[] } };
    expect(body.match.id).toBe('R1-M1');
    expect(body.players.home).toHaveLength(5);
    expect((await call('/tournaments/demo/matches/R9-M9')).status).toBe(404);
    expect((await call('/tournaments/demo/matches/pas-un-match')).status).toBe(404);
  });

  it('GET /players : vide hors démo ; ?tournament=demo : le classement de la démo', async () => {
    expect(await (await call('/players')).json()).toEqual([]);
    const demo = (await (await call('/players?tournament=demo')).json()) as unknown[];
    expect(demo).toHaveLength(80);
    expect((await call('/players?tournament=Pas%20Valide')).status).toBe(400);
  });

  it('GET /players/:tag et /clans/:tag : tag sans « # » dans l’URL', async () => {
    const tag = DEMO_MATCH_PLAYERS.get('R1-M1')![0].tag.slice(1);
    const player = (await (await call(`/players/${tag}`)).json()) as { totals: { tag: string } };
    expect(player.totals.tag).toBe(`#${tag}`);
    expect((await call('/players/ZZZZ')).status).toBe(404);

    const clan = (await (await call('/clans/DEMO1')).json()) as { clan: { name: string } };
    expect(clan.clan.name).toBe('Les Pikachus');
    expect((await call('/clans/2PPP')).status).toBe(404);
    expect((await call('/clans/%23DEMO1')).status).toBe(404); // le « # » n'a rien à faire dans l'URL
  });

  it('GET /discord : 405 (seul Discord y écrit, en POST)', async () => {
    expect((await call('/discord')).status).toBe(405);
  });

  it('adresse inconnue : 404', async () => {
    expect((await call('/nimporte/quoi')).status).toBe(404);
  });

  it('écriture refusée : l’API publique est en lecture seule', async () => {
    const res = await call('/tournaments', { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('requête préalable du navigateur (OPTIONS) : autorisée', async () => {
    const res = await call('/tournaments', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
  });
});
