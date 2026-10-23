/**
 * Essai de l'image de l'arbre SANS passer par Discord, sur le vrai navigateur
 * de Cloudflare. Jamais mis en ligne : uniquement en développement.
 *
 *   npx wrangler dev scripts/capture-check.ts --remote --port 8799
 *   puis ouvrir http://localhost:8799/?tournoi=demo
 */
import { captureBracket } from '../src/bracket-image';

export default {
  async fetch(request, env): Promise<Response> {
    const slug = new URL(request.url).searchParams.get('tournoi') ?? 'demo';
    const started = Date.now();
    const png = await captureBracket(env.BROWSER, env.SITE_URL, slug);
    return new Response(png, {
      headers: { 'Content-Type': 'image/png', 'X-Duree-Ms': String(Date.now() - started) },
    });
  },
} satisfies ExportedHandler<Env>;
