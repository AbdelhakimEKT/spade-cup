/**
 * Petites aides HTTP : réponses JSON et en-têtes CORS.
 *
 * CORS : par sécurité, un navigateur refuse qu'une page lise la réponse d'un
 * autre domaine… sauf si ce domaine l'autorise explicitement. Le site
 * (spade-cup.popi-coc.workers.dev) et le serveur (spade-cup-api.…workers.dev) sont deux
 * domaines différents. Comme les données sont publiques et en lecture seule,
 * on autorise tout le monde (« * »). Les écritures, elles, passeront par le
 * bot Discord, de serveur à serveur : le CORS ne les concerne pas.
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
} as const;

export function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

export function errorResponse(status: number, message: string): Response {
  return json({ error: message }, status, { 'Cache-Control': 'no-store' });
}

/** Les résultats changent pendant un tournoi : un cache court suffit à soulager la base. */
export const SHORT_CACHE = { 'Cache-Control': 'public, max-age=15' } as const;
