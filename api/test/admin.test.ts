import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { FAILURE_WINDOW_MS, MAX_FAILURES, handleAdminUnlock } from '../src/admin';

/** POST /admin/unlock, avec le code tapé et l'adresse de connexion donnée. */
const attempt = (code: string, ip = '1.2.3.4') =>
  new Request('https://api.test/admin/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ code }),
  });
const withCode = { DB: env.DB, ADMIN_CODE: 'trefle-2026' };

describe('POST /admin/unlock', () => {
  it('bon code : ok', async () => {
    const res = await handleAdminUnlock(attempt('trefle-2026'), withCode);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('mauvais code : refusé, et l’essai est compté', async () => {
    const res = await handleAdminUnlock(attempt('trefle'), withCode);
    expect(res.status).toBe(401);
    const { n } = (await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_attempts').first<{
      n: number;
    }>())!;
    expect(n).toBe(1);
  });

  it('5 essais ratés : bloqué un quart d’heure, même avec le bon code ; les autres connexions non', async () => {
    const now = Date.now();
    for (let i = 0; i < MAX_FAILURES; i++)
      await handleAdminUnlock(attempt(`faux-${i}`), withCode, now);
    expect((await handleAdminUnlock(attempt('trefle-2026'), withCode, now)).status).toBe(429);
    expect((await handleAdminUnlock(attempt('trefle-2026', '9.9.9.9'), withCode, now)).status).toBe(
      200,
    );
    // Un quart d'heure plus tard : de nouveau possible.
    const later = now + FAILURE_WINDOW_MS + 1;
    expect((await handleAdminUnlock(attempt('trefle-2026'), withCode, later)).status).toBe(200);
  });

  it('bon code : efface les essais ratés de cette connexion', async () => {
    await handleAdminUnlock(attempt('faux'), withCode);
    await handleAdminUnlock(attempt('trefle-2026'), withCode);
    const { n } = (await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_attempts').first<{
      n: number;
    }>())!;
    expect(n).toBe(0);
  });

  it('code pas encore posé sur le serveur : le dit (503), sans rien accepter', async () => {
    const res = await handleAdminUnlock(attempt(''), { DB: env.DB });
    expect(res.status).toBe(503);
  });

  it('corps illisible ou code vide : simplement refusé', async () => {
    const bad = new Request('https://api.test/admin/unlock', {
      method: 'POST',
      body: 'pas du json',
    });
    expect((await handleAdminUnlock(bad, withCode)).status).toBe(401);
    expect((await handleAdminUnlock(attempt(''), withCode)).status).toBe(401);
  });
});
