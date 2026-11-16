/**
 * Images d'HDV du site (public/th : th9.webp à th19.webp). Un HDV plus haut
 * (le 20, le jour de sa sortie) montre la plus haute en attendant la sienne,
 * avec son vrai numéro écrit à côté : déposer th20.webp et passer
 * TH_IMAGE_MAX à 20, c'est tout.
 */
export const TH_IMAGE_MIN = 9;
export const TH_IMAGE_MAX = 19;

export function thImageSrc(th: number | null | undefined): string | null {
  if (!th || !Number.isFinite(th) || th < TH_IMAGE_MIN) return null;
  return `th/th${Math.min(Math.floor(th), TH_IMAGE_MAX)}.webp`;
}
