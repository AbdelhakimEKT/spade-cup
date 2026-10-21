import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Exécuté avant chaque fichier de test : la base de test part du même schéma
// que la production.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
