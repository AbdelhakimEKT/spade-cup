// Secrets du serveur : posés avec `npx wrangler secret put …`, ils ne sont pas
// dans wrangler.jsonc, donc `wrangler types` ne les connaît pas. On les déclare
// ici, facultatifs : le serveur doit fonctionner (en mode dégradé) sans eux.
interface SpadeCupSecrets {
  /** Clé de l'API du jeu (via le relais à IP fixe). */
  COC_API_TOKEN?: string;
  /** Webhooks des salons d'annonces (voir src/announcements.ts). */
  DISCORD_WEBHOOK_RESULTATS?: string;
  DISCORD_WEBHOOK_CLASSEMENT?: string;
  DISCORD_WEBHOOK_ARBITRES?: string;
  /** Ancien webhook unique : sert de secours si un salon n'a pas le sien. */
  DISCORD_ANNOUNCE_WEBHOOK?: string;
}

// Les deux façons d'accéder à l'environnement : le paramètre `env` des
// gestionnaires (Env) et l'import `env` de 'cloudflare:workers' (Cloudflare.Env).
interface Env extends SpadeCupSecrets {}
declare namespace Cloudflare {
  interface Env extends SpadeCupSecrets {}
}
