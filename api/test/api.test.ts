import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_TOURNAMENT } from '../../src/app/features/tournaments/data/demo-tournament';
import { saveTournament } from '../src/repository';

// Appelle le serveur exactement comme le ferait un navigateur.
const call = (path: string, init?: RequestInit) =>
  exports.default.fetch(`https://spade-cup-api.test${path}`, init);

describe('API HTTP', () => {
  beforeEach(async () => {
    await saveTournament(env.DB, DEMO_TOURNAMENT);
  });

  it('GET /health', async () => {
    const res = await call('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: 'spade-cup-api' });
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
