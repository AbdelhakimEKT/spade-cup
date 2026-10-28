/**
 * Essai de l'image de l'arbre SANS passer par Discord, sur le vrai navigateur
 * de Cloudflare. Jamais mis en ligne : uniquement en développement.
 *
 *   npx wrangler dev scripts/capture-check.ts --remote --port 8799
 *   puis ouvrir http://localhost:8799/?tournoi=demo (l'arbre)
 *   ou http://localhost:8799/?tournoi=demo&match=R1-M3 (le récap d'un match)
 *   ou http://localhost:8799/?affiche=<paramètres de /affiche> (une affiche)
 *   ou http://localhost:8799/?bilan=<paramètres de /affiche/bilan> (le bilan d'une soirée)
 */
import { captureScreens } from '../src/screens';

export default {
  async fetch(request, env): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const slug = params.get('tournoi') ?? 'demo';
    const matchId = params.get('match');
    const poster = params.get('affiche');
    const recap = params.get('bilan');
    const started = Date.now();
    const [png] = await captureScreens(env.BROWSER, env.SITE_URL, [
      recap !== null
        ? { kind: 'recap', query: recap }
        : poster !== null
        ? { kind: 'poster', query: poster }
        : matchId
          ? { kind: 'match', slug, matchId }
          : { kind: 'bracket', slug },
    ]);
    return new Response(png, {
      headers: { 'Content-Type': 'image/png', 'X-Duree-Ms': String(Date.now() - started) },
    });
  },
} satisfies ExportedHandler<Env>;
