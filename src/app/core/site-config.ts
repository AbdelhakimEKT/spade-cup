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
