// Secrets du serveur : posés avec `npx wrangler secret put …`, ils ne sont pas
// dans wrangler.jsonc, donc `wrangler types` ne les connaît pas. On les déclare
// ici, facultatifs : le serveur doit fonctionner (en mode dégradé) sans eux.
interface SpadeCupSecrets {
  /** Clé de l'API du jeu (via le relais à IP fixe). */
  COC_API_TOKEN?: string;
  /** Webhook du salon où le bot annonce débuts et résultats des guerres. */
  DISCORD_ANNOUNCE_WEBHOOK?: string;
}

// Les deux façons d'accéder à l'environnement : le paramètre `env` des
// gestionnaires (Env) et l'import `env` de 'cloudflare:workers' (Cloudflare.Env).
interface Env extends SpadeCupSecrets {}
declare namespace Cloudflare {
  interface Env extends SpadeCupSecrets {}
}
