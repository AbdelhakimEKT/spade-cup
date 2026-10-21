import { Service } from '@angular/core';
import { DEMO_TOURNAMENT } from './demo-tournament';
import { Tournament } from './tournament';

/**
 * Accès aux tournois. Les pages ne savent PAS d'où viennent les données :
 * aujourd'hui une démo en mémoire, demain le serveur Cloudflare. Seul ce
 * service changera ce jour-là.
 */
@Service()
export class Tournaments {
  private readonly items: readonly Tournament[] = [DEMO_TOURNAMENT];

  all(): readonly Tournament[] {
    return this.items;
  }

  bySlug(slug: string): Tournament | null {
    return this.items.find((t) => t.slug === slug) ?? null;
  }
}
