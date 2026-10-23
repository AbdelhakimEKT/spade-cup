import type { Reply } from './bot';
import { EPHEMERAL, SUPPRESS_EMBEDS } from './types';

/**
 * Ce qu'on envoie à Discord : utilisé pour répondre à une commande ET pour
 * les annonces automatiques (webhook du salon des résultats).
 */

/**
 * Le corps d'un message. `allowed_mentions` vide : un nom de clan comme
 * « @everyone » ne notifiera jamais tout le serveur. Et jamais de grande
 * carte d'aperçu sous les liens du site : elle encombrerait le salon.
 */
export function message(reply: Reply) {
  return {
    content: reply.content.slice(0, 2000), // limite de Discord
    flags: SUPPRESS_EMBEDS | (reply.ephemeral ? EPHEMERAL : 0),
    allowed_mentions: { parse: [] },
  };
}

/**
 * Corps de la requête : du JSON, ou, avec une pièce jointe, un formulaire
 * « multipart » (le JSON dans `payload_json`, chaque fichier dans `files[n]`).
 * Pour un formulaire, `fetch` pose lui-même l'en-tête Content-Type (avec la
 * « frontière » qui sépare les parties) : il ne faut surtout pas l'écrire.
 */
export function editBody(reply: Reply): { body: BodyInit; headers?: Record<string, string> } {
  if (!reply.files?.length) {
    return {
      body: JSON.stringify(message(reply)),
      headers: { 'Content-Type': 'application/json' },
    };
  }
  const form = new FormData();
  form.append(
    'payload_json',
    JSON.stringify({
      ...message(reply),
      attachments: reply.files.map((f, id) => ({ id, filename: f.name })),
    }),
  );
  reply.files.forEach((f, id) =>
    form.append(`files[${id}]`, new Blob([f.data], { type: 'image/png' }), f.name),
  );
  return { body: form };
}

/**
 * Poste un message avec le webhook d'un salon (annonces automatiques).
 * `?wait=true` : Discord répond seulement une fois le message publié, ce qui
 * permet de détecter une erreur.
 */
export async function postToWebhook(
  webhookUrl: string,
  reply: Reply,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    // Corps reconstruit à chaque essai : un formulaire ne s'envoie qu'une fois.
    const response = await fetch(`${webhookUrl}?wait=true`, { method: 'POST', ...editBody(reply) });
    if (response.ok) return;
    // 429 = « trop de messages, réessaie dans X secondes » : on patiente une fois.
    if (response.status === 429 && attempt === 1) {
      const body = (await response.json().catch(() => ({}))) as { retry_after?: number };
      await wait(Math.min((body.retry_after ?? 1) * 1000, 10_000));
      continue;
    }
    console.error('Annonce refusée par Discord', response.status, await response.text());
    return;
  }
}
