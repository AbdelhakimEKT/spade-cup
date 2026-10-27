import { NavigationError } from '@angular/router';

/** Mémoire de l'onglet : dernière page rechargée pour cause de nouvelle version. */
const RELOADED_KEY = 'fw.reloaded-for';
/** Un second échec sur la même page dans ce délai : on n'insiste pas. */
const RETRY_AFTER_MS = 10_000;

/**
 * Chaque page du site est un fichier à part (`chunk-XXXX.js`), téléchargé
 * seulement quand on l'ouvre, et dont le nom change à chaque mise en ligne.
 * Un onglet ouvert AVANT une mise en ligne demande donc l'ancien nom, qui
 * n'existe plus : le clic ne fait rien. Le message dépend du navigateur.
 */
export function isMissingPageFile(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed/i.test(message);
}

/**
 * Le site a été mis à jour pendant que l'onglet était ouvert : on recharge
 * vraiment la page demandée, ce qui récupère la nouvelle version du site.
 * Une seule fois par page en 10 secondes, pour ne jamais boucler si le
 * fichier manque pour une autre raison.
 */
export function reloadOnNewVersion(
  event: NavigationError,
  location: Pick<Location, 'assign'> = window.location,
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage,
  now = Date.now(),
): void {
  if (!isMissingPageFile(event.error)) return;
  try {
    const [url, at] = (storage.getItem(RELOADED_KEY) ?? '').split('|');
    if (url === event.url && now - Number(at) < RETRY_AFTER_MS) return;
    storage.setItem(RELOADED_KEY, `${event.url}|${now}`);
  } catch {
    // Mémoire de l'onglet indisponible : sans garde-fou, pas de rechargement.
    return;
  }
  location.assign(event.url);
}
