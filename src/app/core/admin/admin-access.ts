import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SITE_CONFIG } from '../site-config';

/** Réponse du serveur au code tapé. */
export type UnlockResult = 'ok' | 'wrong' | 'blocked' | 'unconfigured' | 'network';

const STORAGE_KEY = 'fw.admin.unlocked';

/**
 * Accès admin du site (page « Créer une affiche »…).
 *
 * Le code est vérifié par le SERVEUR (POST /admin/unlock) : il n'apparaît
 * nulle part dans le site, dont le code source est public. Une fois accepté,
 * l'appareil s'en souvient (localStorage) pour ne pas le redemander.
 *
 * À savoir : ce verrou cache des OUTILS (le générateur d'affiches travaille
 * dans le navigateur et ne touche à aucune donnée du serveur). Il ne protège
 * pas des données ; s'il le fallait un jour, c'est le serveur qui devrait
 * vérifier chaque demande.
 */
@Service()
export class AdminAccess {
  private readonly http = inject(HttpClient);
  readonly unlocked = signal(readStored());

  async unlock(code: string): Promise<UnlockResult> {
    try {
      await firstValueFrom(
        this.http.post(`${SITE_CONFIG.apiUrl}/admin/unlock`, { code: code.trim() }),
      );
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      if (status === 401) return 'wrong';
      if (status === 429) return 'blocked';
      if (status === 503) return 'unconfigured';
      return 'network';
    }
    try {
      localStorage.setItem(STORAGE_KEY, 'yes');
    } catch {
      /* navigation privée : déverrouillé le temps de la visite seulement */
    }
    this.unlocked.set(true);
    return 'ok';
  }

  /** « Verrouiller cet appareil » : il faudra retaper le code. */
  lock(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* rien à effacer */
    }
    this.unlocked.set(false);
  }
}

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'yes';
  } catch {
    return false;
  }
}
