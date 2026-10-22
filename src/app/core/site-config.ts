/**
 * Réglages du site regroupés au même endroit.
 * `discordInvite` reste vide tant qu'on n'a pas le lien d'invitation officiel :
 * les boutons « Rejoindre le Discord » sont alors masqués.
 * `apiUrl` : le serveur Cloudflare (dossier api/). Pour développer contre un
 * serveur local (`npm run dev` dans api/), remplacer par http://localhost:8787.
 */
export const SITE_CONFIG = {
  name: 'Spade Cup FR',
  discordInvite: '',
  apiUrl: 'https://spade-cup-api.popi-coc.workers.dev',
} as const;
