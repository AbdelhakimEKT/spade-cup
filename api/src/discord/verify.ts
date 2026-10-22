/**
 * Vérifie qu'une requête vient VRAIMENT de Discord.
 *
 * L'adresse /discord est publique : n'importe qui pourrait y envoyer une
 * fausse commande « /arbitre resultat ». Discord signe donc chaque requête
 * avec sa clé privée (algorithme Ed25519) ; on vérifie la signature avec la
 * clé PUBLIQUE de l'application, affichée sur le portail développeur. Sans
 * la clé privée, impossible de fabriquer une signature valide.
 *
 * Discord teste d'ailleurs ce contrôle : il refuse d'enregistrer l'adresse
 * du bot si elle accepte une requête mal signée.
 */
export async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  const publicKey = hexToBytes(publicKeyHex);
  const signature = hexToBytes(signatureHex);
  if (!publicKey || !signature || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, [
      'verify',
    ]);
    // Ce qui est signé : l'horodatage suivi du corps brut de la requête.
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      signature,
      new TextEncoder().encode(timestamp + body),
    );
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
