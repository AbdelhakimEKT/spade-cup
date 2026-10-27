/**
 * Réglages du site regroupés au même endroit.
 * `name` : le nom du site, Friendly Wars (le serveur des guerres amicales).
 * « Spade Cup » reste le nom de ses TOURNOIS.
 * `discordInvite` : le lien d'invitation du serveur (boutons « Rejoindre le
 * Discord », affiches). Vide = boutons masqués.
 * `apiUrl` : le serveur Cloudflare (dossier api/). Pour développer contre un
 * serveur local (`npm run dev` dans api/), remplacer par http://localhost:8787.
 */
export const SITE_CONFIG = {
  name: 'Friendly Wars',
  discordInvite: 'https://discord.gg/mvkaK2QwS',
  siteUrl: 'https://spade-cup.popi-coc.workers.dev',
  apiUrl: 'https://spade-cup-api.popi-coc.workers.dev',
  repoUrl: 'https://github.com/AbdelhakimEKT/spade-cup',
  /**
   * Les deux clans des FW classiques, dans l'ordre d'affichage (team 1 à
   * gauche), avec leur couleur : la DA du serveur.
   */
  fwTeams: [
    { tag: '#2CYJPRCG8', color: 'violet' },
    { tag: '#2JVUP2PGC', color: 'green' },
  ],
} as const;
