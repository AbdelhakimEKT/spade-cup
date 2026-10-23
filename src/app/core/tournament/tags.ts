/**
 * Les tags Clash of Clans n'utilisent qu'un alphabet réduit (0289CGJLPQRUVY).
 * Il n'y a pas de lettre O : quand quelqu'un tape « O », il voulait dire zéro.
 */
const TAG_ALPHABET = /^#[0289CGJLPQRUVY]{3,12}$/;

/** « 2ju0grg98 », « #2JUOGRG98 », « # 2JU0GRG98 » → « #2JU0GRG98 ». */
export function normalizeTag(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '').replace(/^#/, '').replace(/O/g, '0');
  return `#${cleaned}`;
}

export function isValidTag(tag: string): boolean {
  return TAG_ALPHABET.test(tag);
}

/**
 * Tag utilisable dans une URL : sans le « # » (/clans/2JU0GRG98).
 * Pas de normalisation ici : les tags enregistrés le sont déjà, à l'inscription.
 */
export function tagToUrl(tag: string): string {
  return tag.replace(/^#/, '');
}
