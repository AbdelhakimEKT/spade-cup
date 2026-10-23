/**
 * Petites fonctions d'affichage des clans (pures, donc faciles à tester).
 */

/** Couleurs d'avatar, reprises de la maquette. */
const AVATAR_COLORS = [
  '#d94bd2',
  '#6a5acd',
  '#f08a3c',
  '#e9488e',
  '#5d7cf0',
  '#9b5bb5',
  '#f2a65a',
  '#2bb3c9',
  '#c95bdc',
  '#b0684a',
] as const;

/**
 * Initiales d'un clan : « Les Pikachus » → « P », « Titans FR » → « TF ».
 * Les articles en tête sont ignorés pour garder une lettre parlante.
 */
export function clanInitials(name: string): string {
  const words = name
    .replace(/^(les|le|la|l')\s*/i, '')
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Couleur d'avatar d'un clan, toujours la même pour un même tag : on « hache »
 * le tag en un nombre, puis on choisit dans la palette.
 */
export function clanColor(tag: string): string {
  let hash = 0;
  for (const char of tag) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
