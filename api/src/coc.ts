import type { CocWar } from '../../src/app/core/tournament/coc-war';
import type { ClanRef } from '../../src/app/core/tournament/models';

/**
 * Client de l'API officielle de Clash of Clans.
 *
 * LE PROBLÈME DE L'IP : une clé de l'API du jeu n'accepte que les adresses IP
 * déclarées à sa création. Or un Worker Cloudflare sort sur Internet par des
 * IP qui changent tout le temps. On passe donc par le relais communautaire de
 * RoyaleAPI (cocproxy.royaleapi.dev) : il transmet nos requêtes à Supercell
 * depuis UNE IP fixe, celle qu'on déclare sur la clé. Son adresse est dans
 * `COC_API_BASE` (wrangler.jsonc) : on peut en changer sans toucher au code.
 */

export type CocError =
  | 'not-configured' // pas de clé enregistrée sur le serveur
  | 'not-found' // aucun clan avec ce tag
  | 'private' // journal de guerre privé : le jeu refuse de montrer la guerre
  | 'unavailable'; // clé refusée, jeu en maintenance, réseau…

export type CocResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: CocError };

export interface CocClient {
  clan(tag: string): Promise<CocResult<ClanRef>>;
  currentWar(tag: string): Promise<CocResult<CocWar>>;
}

/** Messages prêts à afficher dans Discord. */
export const COC_ERROR_TEXT: Record<CocError, string> = {
  'not-configured': "La lecture du jeu n'est pas encore branchée (clé de l'API manquante).",
  'not-found': 'Aucun clan ne porte ce tag dans le jeu.',
  private: 'Le journal de guerre de ce clan est privé : passe-le en public dans le jeu.',
  unavailable: "L'API du jeu ne répond pas pour le moment. Réessaie dans quelques minutes.",
};

export function createCocClient(
  env: { COC_API_TOKEN?: string; COC_API_BASE: string },
  fetcher: typeof fetch = fetch,
): CocClient {
  async function get<T>(path: string): Promise<CocResult<T>> {
    if (!env.COC_API_TOKEN) return { ok: false, error: 'not-configured' };
    let response: Response;
    try {
      response = await fetcher(`${env.COC_API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${env.COC_API_TOKEN}`, Accept: 'application/json' },
      });
    } catch {
      return { ok: false, error: 'unavailable' };
    }
    if (response.ok) return { ok: true, value: (await response.json()) as T };
    if (response.status === 404) return { ok: false, error: 'not-found' };
    if (response.status === 403) {
      // 403 = clé refusée… ou journal de guerre privé. Seul le message les distingue.
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      return {
        ok: false,
        error: /private/i.test(body.message ?? '') ? 'private' : 'unavailable',
      };
    }
    return { ok: false, error: 'unavailable' };
  }

  const encode = (tag: string) => encodeURIComponent(tag);

  return {
    async clan(tag) {
      const result = await get<{ tag: string; name: string; badgeUrls?: { medium?: string } }>(
        `/clans/${encode(tag)}`,
      );
      if (!result.ok) return result;
      const { name, badgeUrls } = result.value;
      return {
        ok: true,
        value: badgeUrls?.medium ? { tag, name, badgeUrl: badgeUrls.medium } : { tag, name },
      };
    },
    currentWar: (tag) => get<CocWar>(`/clans/${encode(tag)}/currentwar`),
  };
}
