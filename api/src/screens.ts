import puppeteer from '@cloudflare/puppeteer';

/**
 * Images pour Discord : l'arbre d'un tournoi, le récap joueur par joueur
 * d'un match, et l'affiche d'un match.
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
  | { readonly kind: 'match'; readonly slug: string; readonly matchId: string }
  /** Affiche d'un match : `query` = paramètres de /affiche (voir posterQuery). */
  | { readonly kind: 'poster'; readonly query: string }
  /** Affiche d'une soirée FW : `query` = paramètres de /affiche/soiree (j, h, n). */
  | { readonly kind: 'evening'; readonly query: string }
  /** Le récap joueur par joueur d'une FW classique (page /fw/:id). */
  | { readonly kind: 'fw'; readonly id: number }
  /** La carte d'un joueur (page /joueurs/:tag/carte). */
  | { readonly kind: 'card'; readonly tag: string }
  /** Le bilan d'une soirée FW (page /affiche/bilan, voir recapQuery). */
  | { readonly kind: 'recap'; readonly query: string };

/**
 * Ce que chaque image doit montrer : l'élément photographié, celui dont on
 * attend l'apparition (données chargées), la largeur et la résolution.
 */
function plan(shot: Shot): {
  path: string;
  selector: string;
  ready: string;
  width: number;
  scale: number;
} {
  if (shot.kind === 'recap') {
    return {
      path: `/affiche/bilan?${shot.query}`,
      selector: 'sc-recap-page .recap',
      ready: 'sc-recap-page .recap[data-ready]',
      width: 1080,
      scale: 1.5, // net sur téléphone, où on zoome sur le tableau
    };
  }
  if (shot.kind === 'card') {
    return {
      path: `/joueurs/${encodeURIComponent(shot.tag.replace('#', ''))}/carte?capture`,
      selector: 'sc-player-card .poster',
      // data-ready : la fiche, le classement et l'image de l'HDV sont arrivés.
      ready: 'sc-player-card .poster[data-ready]',
      width: 1080, // la carte fait 1080 × 1350 : sa taille finale, telle quelle
      scale: 1,
    };
  }
  if (shot.kind === 'fw') {
    return {
      path: `/fw/${shot.id}?capture`,
      selector: 'sc-fw-war-page',
      ready: 'sc-fw-war-page sc-war-players-table table',
      width: 1300, // les colonnes du tableau tiennent sur une ligne
      scale: 1.5,
    };
  }
  if (shot.kind === 'evening') {
    return {
      path: `/affiche/soiree?${shot.query}`,
      selector: 'sc-evening-poster-page .poster',
      ready: 'sc-evening-poster-page .poster[data-ready]',
      width: 1080,
      scale: 1,
    };
  }
  if (shot.kind === 'poster') {
    return {
      path: `/affiche?${shot.query}`,
      selector: 'sc-poster-page .poster',
      // data-ready : les deux logos sont chargés (ou remplacés par les initiales).
      ready: 'sc-poster-page .poster[data-ready]',
      width: 1080, // l'affiche fait 1080 × 1350 : sa taille finale, telle quelle
      scale: 1,
    };
  }
  const slug = encodeURIComponent(shot.slug);
  return shot.kind === 'bracket'
    ? {
        path: `/tournois/${slug}?capture`,
        // L'en-tête du tournoi (logo, nom, tour en cours) et l'arbre.
        selector: 'sc-tournament-page',
        ready: 'sc-tournament-page sc-bracket-view .panel',
        // Assez large pour que les noms de clans tiennent dans les cartes ;
        // résolution ×2 : sur téléphone, on zoome et les noms restent nets.
        width: 1700,
        scale: 2,
      }
    : {
        path: `/tournois/${slug}/matchs/${encodeURIComponent(shot.matchId)}?capture`,
        selector: 'sc-match-page',
        ready: 'sc-match-page h1',
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
      const { path, selector, ready, width, scale } = plan(shot);
      await page.setViewport({ width, height: 1000, deviceScaleFactor: scale });
      // On n'attend pas « plus aucune activité réseau » : le site vérifie le
      // direct en arrière-plan, et cette attente pouvait ne jamais finir. On
      // attend la page chargée, puis l'élément qui prouve que les données sont là.
      await page.goto(`${siteUrl}${path}`, { waitUntil: 'load', timeout: 30_000 });
      await page.addStyleTag({ content: CAPTURE_CSS });
      // Le contenu est là quand l'élément attendu est affiché (données chargées).
      await page.waitForSelector(ready, { timeout: 20_000 });
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
