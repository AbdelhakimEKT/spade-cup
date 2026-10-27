import { NavigationError } from '@angular/router';
import { isMissingPageFile, reloadOnNewVersion } from './new-version';

/** Mémoire d'onglet en mémoire vive, comme sessionStorage. */
function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const missing = (url: string) =>
  new NavigationError(
    1,
    url,
    new TypeError('Failed to fetch dynamically imported module: https://x/chunk-OLD.js'),
  );

describe('nouvelle version du site', () => {
  it('reconnaît un fichier de page introuvable, quel que soit le navigateur', () => {
    expect(isMissingPageFile(missing('/direct').error)).toBe(true); // Chrome
    expect(isMissingPageFile(new TypeError('error loading dynamically imported module'))).toBe(
      true,
    ); // Firefox
    expect(isMissingPageFile(new TypeError('Importing a module script failed.'))).toBe(true); // Safari
    expect(isMissingPageFile(new Error('Http failure response'))).toBe(false);
  });

  it('recharge la page demandée une fois, pas en boucle', () => {
    const assign = vi.fn();
    const storage = fakeStorage();
    reloadOnNewVersion(missing('/direct'), { assign }, storage, 1_000);
    expect(assign).toHaveBeenCalledWith('/direct');

    // La page manque encore juste après le rechargement : on n'insiste pas.
    reloadOnNewVersion(missing('/direct'), { assign }, storage, 4_000);
    expect(assign).toHaveBeenCalledTimes(1);

    // Plus tard (une autre mise en ligne), on recharge de nouveau.
    reloadOnNewVersion(missing('/direct'), { assign }, storage, 60_000);
    expect(assign).toHaveBeenCalledTimes(2);
  });

  it('autre erreur de navigation : rien ne se passe', () => {
    const assign = vi.fn();
    reloadOnNewVersion(
      new NavigationError(1, '/direct', new Error('autre chose')),
      { assign },
      fakeStorage(),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('mémoire de l’onglet bloquée : pas de rechargement (pas de risque de boucle)', () => {
    const assign = vi.fn();
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
    };
    reloadOnNewVersion(missing('/direct'), { assign }, blocked);
    expect(assign).not.toHaveBeenCalled();
  });
});
