import { LOGO_HOST } from '../../src/app/core/poster/poster';
import { errorResponse } from './http';

/**
 * Les logos des matchs « Clan vs Clan ». Les liens d'images de Discord
 * expirent au bout d'environ 24 heures, alors qu'un match de ligue peut être
 * annoncé des semaines avant : à l'affiche, le serveur copie chaque logo dans
 * KV (stockage gratuit de Cloudflare), jusqu'à l'heure du match + 12 heures,
 * puis KV l'efface tout seul. Le site le lit par GET /logos/:clé.
 */

const LOGO_MAX_BYTES = 8 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
/** Gardé jusqu'à l'heure du match + 12 h. */
export const KEEP_AFTER_MATCH_MS = 12 * 60 * 60 * 1000;

/**
 * Copie le logo `url` (Discord) sous la clé `key`, jusqu'à `until` (ms).
 * Renvoie son adresse chez nous, ou `null` si la copie échoue (on garde
 * alors le lien de Discord).
 */
export async function storeLogo(
  kv: KVNamespace,
  key: string,
  url: string,
  until: number,
  now = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetcher(url);
    const type = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (!response.ok || !LOGO_TYPES.includes(type)) return null;
    const data = await response.arrayBuffer();
    if (data.byteLength > LOGO_MAX_BYTES) return null;
    // KV demande une fin au moins 60 secondes dans le futur.
    const expiration = Math.floor(Math.max(until, now + 2 * 60 * 1000) / 1000);
    await kv.put(key, data, { expiration, metadata: { type } });
    return `https://${LOGO_HOST}/logos/${encodeURIComponent(key)}`;
  } catch (error) {
    console.error('Copie du logo impossible', error);
    return null;
  }
}

/** GET /logos/:clé : le logo gardé (mis en cache par le navigateur un jour). */
export async function serveLogo(kv: KVNamespace, key: string): Promise<Response> {
  const { value, metadata } = await kv.getWithMetadata<{ type: string }>(key, 'arrayBuffer');
  if (!value) return errorResponse(404, 'Logo introuvable (ou expiré).');
  return new Response(value, {
    headers: {
      'Content-Type': metadata?.type ?? 'image/png',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
