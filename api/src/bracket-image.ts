import puppeteer from '@cloudflare/puppeteer';

/**
 * Image de l'arbre pour Discord.
 *
 * Dessiner une image demanderait bien plus que les 10 ms de calcul d'un Worker
 * gratuit. On demande donc à un VRAI navigateur, hébergé par Cloudflare
 * (« Browser Rendering », gratuit jusqu'à 10 minutes par jour), d'ouvrir la
 * page du tournoi en mode capture et d'en faire une capture d'écran. L'image
 * est ainsi exactement le design du site, sans rien redessiner.
 */

/** Assez large pour que les noms de clans tiennent dans les cartes de l'arbre. */
const VIEWPORT = { width: 1700, height: 1000, deviceScaleFactor: 1.5 };

/** On retire tout ce qui n'est pas l'arbre : menu, pied de page, éclairs décoratifs. */
const CAPTURE_CSS = `
  sc-site-header, sc-site-footer, sc-brand-bolts, .skip-link { display: none !important; }
  .page { max-width: none !important; padding: 0 !important; }
`;

export async function captureBracket(
  browserBinding: Parameters<typeof puppeteer.launch>[0],
  siteUrl: string,
  slug: string,
): Promise<Uint8Array> {
  const browser = await puppeteer.launch(browserBinding);
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    // Le thème sombre est l'identité de la marque.
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.goto(`${siteUrl}/tournois/${encodeURIComponent(slug)}?capture`, {
      waitUntil: 'networkidle0',
      timeout: 20_000,
    });
    await page.addStyleTag({ content: CAPTURE_CSS });
    await page.waitForSelector('sc-tournament-page sc-bracket-view', { timeout: 10_000 });
    // Code exécuté DANS le navigateur : on attend que les polices soient chargées.
    await page.evaluate('document.fonts.ready');

    const area = await page.$('sc-tournament-page');
    if (!area) throw new Error('Page du tournoi introuvable dans le navigateur.');
    return new Uint8Array(await area.screenshot({ type: 'png' }));
  } finally {
    await browser.close();
  }
}
