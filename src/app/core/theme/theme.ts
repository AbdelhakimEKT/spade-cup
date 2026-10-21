import { DOCUMENT, Service, computed, effect, inject, signal } from '@angular/core';

export type ThemeName = 'dark' | 'light';

const STORAGE_KEY = 'spadecup.theme';

/**
 * Thème de l'interface (sombre ou clair).
 *
 * - Sans choix de l'utilisateur, on suit le réglage du système.
 * - Un clic sur le bouton enregistre un choix explicite, retenu d'une visite
 *   à l'autre.
 *
 * `@Service()` (Angular 22) crée un service unique pour toute l'application,
 * comme l'ancien `@Injectable({ providedIn: 'root' })`.
 */
@Service()
export class Theme {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;

  /** Choix explicite de l'utilisateur, ou `null` pour suivre le système. */
  private readonly choice = signal<ThemeName | null>(this.readStoredChoice());

  /** Le système est-il réglé en clair ? Mis à jour s'il change en direct. */
  private readonly systemPrefersLight = signal(this.matchLight()?.matches ?? false);

  /** Thème réellement affiché : dérivé des deux signaux ci-dessus. */
  readonly current = computed<ThemeName>(
    () => this.choice() ?? (this.systemPrefersLight() ? 'light' : 'dark'),
  );

  constructor() {
    // Si l'utilisateur change le thème de son système pendant la visite.
    this.matchLight()?.addEventListener('change', (event) =>
      this.systemPrefersLight.set(event.matches),
    );

    // Un `effect` se relance tout seul chaque fois que `choice` change :
    // il répercute le choix sur la page et le sauvegarde.
    effect(() => {
      const choice = this.choice();
      const root = this.document.documentElement;
      if (choice) {
        root.dataset['theme'] = choice;
      } else {
        delete root.dataset['theme'];
      }
      this.storeChoice(choice);
    });
  }

  toggle(): void {
    this.choice.set(this.current() === 'dark' ? 'light' : 'dark');
  }

  private matchLight(): MediaQueryList | null {
    return this.window?.matchMedia?.('(prefers-color-scheme: light)') ?? null;
  }

  // Le stockage du navigateur peut être indisponible (navigation privée
  // stricte, cookies bloqués) : on ne doit jamais planter pour autant.
  private readStoredChoice(): ThemeName | null {
    try {
      const value = this.window?.localStorage.getItem(STORAGE_KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch {
      return null;
    }
  }

  private storeChoice(choice: ThemeName | null): void {
    try {
      if (choice) {
        this.window?.localStorage.setItem(STORAGE_KEY, choice);
      } else {
        this.window?.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Préférence non retenue, mais le site reste utilisable.
    }
  }
}
