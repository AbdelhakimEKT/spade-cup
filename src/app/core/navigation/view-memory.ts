import { Service } from '@angular/core';

/**
 * Petite mémoire des réglages d'affichage (tri choisi, liste dépliée…) par
 * page, le temps de la visite. Un retour en arrière retrouve la page telle
 * qu'on l'a laissée ; recharger le site repart des réglages par défaut.
 */
@Service()
export class ViewMemory {
  private readonly saved = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.saved.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.saved.set(key, value);
  }
}
