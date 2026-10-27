import { errorResponse, json } from './http';

/**
 * POST /admin/unlock : vérifie le code des admins du site (page « Créer une
 * affiche »…).
 *
 * Le code n'est écrit nulle part dans le code source (le dépôt est public) :
 * c'est un secret du serveur, `ADMIN_CODE`, posé par l'organisateur avec
 * `npx wrangler secret put ADMIN_CODE`. Le site envoie ce qu'on a tapé, le
 * serveur répond oui ou non.
 *
 * Contre les essais à la chaîne : 5 codes faux par quart d'heure et par
 * connexion, ensuite tout est refusé jusqu'à la fin du quart d'heure.
 */
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;

export async function handleAdminUnlock(
  request: Request,
  env: { DB: D1Database; ADMIN_CODE?: string },
  now = Date.now(),
): Promise<Response> {
  if (!env.ADMIN_CODE) {
    return errorResponse(503, 'Le code admin n’est pas encore configuré sur le serveur.');
  }
  const ip = request.headers.get('CF-Connecting-IP') ?? 'inconnue';
  const since = now - FAILURE_WINDOW_MS;
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM admin_attempts WHERE ip = ? AND at > ?',
  )
    .bind(ip, since)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_FAILURES) {
    return errorResponse(429, 'Trop d’essais. Réessaie dans un quart d’heure.');
  }

  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const typed = typeof body.code === 'string' ? body.code : '';

  if (await sameSecret(typed, env.ADMIN_CODE)) {
    await env.DB.prepare('DELETE FROM admin_attempts WHERE ip = ?').bind(ip).run();
    return json({ ok: true }, 200, { 'Cache-Control': 'no-store' });
  }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO admin_attempts (ip, at) VALUES (?, ?)').bind(ip, now),
    // Ménage au passage : rien ne sert de garder plus d'un jour.
    env.DB.prepare('DELETE FROM admin_attempts WHERE at < ?').bind(now - 86_400_000),
  ]);
  return errorResponse(401, 'Code incorrect.');
}

/**
 * Comparaison « à temps constant » : comparer caractère par caractère et
 * s'arrêter au premier écart laisserait deviner le code en mesurant le temps
 * de réponse. On compare donc les empreintes SHA-256 des deux textes (même
 * longueur) avec la fonction prévue pour, qui prend toujours le même temps.
 */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const digest = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  return crypto.subtle.timingSafeEqual(x, y);
}
