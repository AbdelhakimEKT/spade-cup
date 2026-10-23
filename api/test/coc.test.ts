import { beforeEach, describe, expect, it } from 'vitest';
import { cocHealth, createCocClient, forgetCocHealth } from '../src/coc';

/** Faux `fetch` : renvoie la réponse donnée et note l'adresse appelée. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), auth: new Headers(init?.headers).get('Authorization') });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetcher };
}

const env = { COC_API_TOKEN: 'cle', COC_API_BASE: 'https://relais.test/v1' };

describe('client de l’API du jeu', () => {
  it('lit un clan : nom et blason, tag encodé dans l’URL, clé envoyée', async () => {
    const { calls, fetcher } = fakeFetch(200, {
      tag: '#2PPP',
      name: 'Les Pikachus',
      badgeUrls: { medium: 'https://img.test/b.png' },
    });
    const result = await createCocClient(env, fetcher).clan('#2PPP');

    expect(result).toEqual({
      ok: true,
      value: { tag: '#2PPP', name: 'Les Pikachus', badgeUrl: 'https://img.test/b.png' },
    });
    expect(calls).toEqual([{ url: 'https://relais.test/v1/clans/%232PPP', auth: 'Bearer cle' }]);
  });

  it('clan sans blason : pas de champ vide', async () => {
    const { fetcher } = fakeFetch(200, { tag: '#2PPP', name: 'X' });
    expect(await createCocClient(env, fetcher).clan('#2PPP')).toEqual({
      ok: true,
      value: { tag: '#2PPP', name: 'X' },
    });
  });

  it('guerre en cours : /currentwar', async () => {
    const { calls, fetcher } = fakeFetch(200, { state: 'inWar' });
    const result = await createCocClient(env, fetcher).currentWar('#2PPP');
    expect(result).toEqual({ ok: true, value: { state: 'inWar' } });
    expect(calls[0].url).toBe('https://relais.test/v1/clans/%232PPP/currentwar');
  });

  it.each([
    [404, {}, 'not-found'],
    [
      403,
      { reason: 'accessDenied', message: 'Access denied, clan war log is private.' },
      'private',
    ],
    [403, { reason: 'accessDenied', message: 'Invalid authorization' }, 'unavailable'],
    [503, { reason: 'inMaintenance' }, 'unavailable'],
  ])('réponse %i → erreur « %s »', async (status, body, error) => {
    const { fetcher } = fakeFetch(status, body);
    expect(await createCocClient(env, fetcher).currentWar('#2PPP')).toEqual({ ok: false, error });
  });

  it('réseau coupé : « unavailable », sans planter', async () => {
    const fetcher = (async () => {
      throw new TypeError('Network down');
    }) as typeof fetch;
    expect(await createCocClient(env, fetcher).clan('#2PPP')).toEqual({
      ok: false,
      error: 'unavailable',
    });
  });

  it('pas de clé configurée : aucun appel, erreur claire', async () => {
    const { calls, fetcher } = fakeFetch(200, {});
    const client = createCocClient({ COC_API_BASE: env.COC_API_BASE }, fetcher);
    expect(await client.clan('#2PPP')).toEqual({ ok: false, error: 'not-configured' });
    expect(calls).toEqual([]);
  });
});

describe('cocHealth', () => {
  beforeEach(() => forgetCocHealth());

  it('« ok » quand la clé est acceptée, sans jamais renvoyer la clé', async () => {
    const { fetcher } = fakeFetch(200, { tag: '#2CYJPRCG8', name: 'FW-team1' });
    expect(await cocHealth(env, 0, fetcher)).toBe('ok');
  });

  it('un seul vrai appel toutes les 5 minutes', async () => {
    const { calls, fetcher } = fakeFetch(403, { message: 'Invalid authorization' });
    expect(await cocHealth(env, 0, fetcher)).toBe('unavailable');
    expect(await cocHealth(env, 4 * 60_000, fetcher)).toBe('unavailable');
    expect(calls).toHaveLength(1);
    await cocHealth(env, 6 * 60_000, fetcher);
    expect(calls).toHaveLength(2);
  });

  it('sans clé : « not-configured », aucun appel', async () => {
    const { calls, fetcher } = fakeFetch(200, {});
    expect(await cocHealth({ COC_API_BASE: env.COC_API_BASE }, 0, fetcher)).toBe('not-configured');
    expect(calls).toEqual([]);
  });
});
