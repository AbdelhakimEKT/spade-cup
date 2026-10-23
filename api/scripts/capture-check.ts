/**
 * Essai de l'image de l'arbre SANS passer par Discord, sur le vrai navigateur
 * de Cloudflare. Jamais mis en ligne : uniquement en développement.
 *
 *   npx wrangler dev scripts/capture-check.ts --remote --port 8799
 *   puis ouvrir http://localhost:8799/?tournoi=demo (l'arbre)
 *   ou http://localhost:8799/?tournoi=demo&match=R1-M3 (le récap d'un match)
 */
import { captureScreens } from '../src/screens';

export default {
  async fetch(request, env): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const slug = params.get('tournoi') ?? 'demo';
    const matchId = params.get('match');
    const started = Date.now();
    const [png] = await captureScreens(env.BROWSER, env.SITE_URL, [
      matchId ? { kind: 'match', slug, matchId } : { kind: 'bracket', slug },
    ]);
    return new Response(png, {
      headers: { 'Content-Type': 'image/png', 'X-Duree-Ms': String(Date.now() - started) },
    });
  },
} satisfies ExportedHandler<Env>;
