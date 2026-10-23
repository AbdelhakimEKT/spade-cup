import puppeteer from '@cloudflare/puppeteer';

/**
 * Images pour Discord : l'arbre d'un tournoi, et le récap joueur par joueur
 * d'un match.
 *
 * Dessiner une image demanderait bien plus que les 10 ms de calcul d'un Worker
 * gratuit. On demande donc à un VRAI navigateur, hébergé par Cloudflare
 * (« Browser Rendering », gratuit jusqu'à 10 minutes par jour), d'ouvrir les
 * pages du site en mode capture et d'en faire des captures d'écran. Les images
 * ont ainsi exactement le design du site, sans rien redessiner.
 *
 * Toutes les images d'un passage sont faites dans UNE seule session du
 * navigateur : son démarrage est la partie la plus longue, et c'est le temps
 * de navigateur qui est compté dans le quota quotidien.
 */

export type Shot =
  | { readonly kind: 'bracket'; readonly slug: string }
  | { readonly kind: 'match'; readonly slug: string; readonly matchId: string };

/** Ce que chaque image doit montrer, et à quelle largeur. */
function plan(shot: Shot): { path: string; selector: string; width: number; scale: number } {
  const slug = encodeURIComponent(shot.slug);
  return shot.kind === 'bracket'
    ? // Assez large pour que les noms de clans tiennent dans les cartes de l'arbre.
      // Résolution ×2 : sur téléphone, on zoome dans l'image et les noms restent nets.
      { path: `/tournois/${slug}?capture`, selector: 'sc-tournament-page', width: 1700, scale: 2 }
    : {
        path: `/tournois/${slug}/matchs/${encodeURIComponent(shot.matchId)}?capture`,
        selector: 'sc-match-page',
        width: 1300, // les deux équipes côte à côte
        scale: 1.5,
      };
}

/** On retire tout ce qui n'est pas le contenu : menu, pied de page, éclairs décoratifs. */
const CAPTURE_CSS = `
  sc-site-header, sc-site-footer, sc-brand-bolts, .skip-link { display: none !important; }
  .page { max-width: none !important; padding: 0 !important; }
`;

/**
 * Le plan gratuit n'ouvre qu'UN nouveau navigateur toutes les 20 secondes.
 * Si l'arbitre automatique et une commande demandent une image en même temps,
 * le second est refusé (« Rate limit exceeded ») : il patiente et réessaie.
 */
export async function retryOnRateLimit<T>(
  task: () => Promise<T>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      const rateLimited = /429|rate limit/i.test(String(error));
      if (!rateLimited || attempt >= attempts) throw error;
      await wait(21_000);
    }
  }
}

/** Une image PNG par demande, dans le même ordre. */
export async function captureScreens(
  browserBinding: Parameters<typeof puppeteer.launch>[0],
  siteUrl: string,
  shots: readonly Shot[],
): Promise<Uint8Array[]> {
  if (shots.length === 0) return [];
  const browser = await retryOnRateLimit(() => puppeteer.launch(browserBinding));
  try {
    const page = await browser.newPage();
    // Le thème sombre est l'identité de la marque.
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    const images: Uint8Array[] = [];
    for (const shot of shots) {
      const { path, selector, width, scale } = plan(shot);
      await page.setViewport({ width, height: 1000, deviceScaleFactor: scale });
      await page.goto(`${siteUrl}${path}`, { waitUntil: 'networkidle0', timeout: 20_000 });
      await page.addStyleTag({ content: CAPTURE_CSS });
      // Le contenu est là quand le titre de la page est affiché (données chargées).
      await page.waitForSelector(`${selector} h1`, { timeout: 10_000 });
      // Code exécuté DANS le navigateur : on attend que les polices soient chargées.
      await page.evaluate('document.fonts.ready');
      const area = await page.$(selector);
      if (!area) throw new Error(`Rien à capturer sur ${path}.`);
      images.push(new Uint8Array(await area.screenshot({ type: 'png' })));
    }
    return images;
  } finally {
    await browser.close();
  }
}
