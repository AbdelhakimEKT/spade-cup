import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach } from 'vitest';

// Exécuté au début de chaque FICHIER de test : la base de test part du même
// schéma que la production.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// L'outil isole la base par fichier, pas par test : on la vide avant chaque
// test pour qu'aucun ne dépende de ce qu'un autre a écrit. Supprimer les
// tournois (et les FW classiques) efface en cascade tout ce qui en dépend.
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM tournaments'),
    env.DB.prepare('DELETE FROM friendly_wars'),
    env.DB.prepare('DELETE FROM live_cache'),
    env.DB.prepare('DELETE FROM fw_snapshots'),
    env.DB.prepare('DELETE FROM admin_attempts'),
    env.DB.prepare('DELETE FROM fw_evenings'),
    env.DB.prepare('DELETE FROM discord_accounts'),
    env.DB.prepare('DELETE FROM fw_weekly_posts'),
    env.DB.prepare('DELETE FROM cvc_matches'),
    env.DB.prepare("DELETE FROM sqlite_sequence WHERE name = 'cvc_matches'"),
  ]);
});
