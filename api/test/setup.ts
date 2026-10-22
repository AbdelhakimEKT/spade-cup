import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach } from 'vitest';

// Exécuté au début de chaque FICHIER de test : la base de test part du même
// schéma que la production.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// L'outil isole la base par fichier, pas par test : on la vide avant chaque
// test pour qu'aucun ne dépende de ce qu'un autre a écrit. Supprimer les
// tournois efface en cascade inscriptions, matchs et joueurs.
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM tournaments').run();
});
