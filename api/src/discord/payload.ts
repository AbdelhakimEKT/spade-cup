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

/** Discord demande d'attendre (429) : on patiente une fois, puis on réessaie. */
type Wait = (ms: number) => Promise<void>;
const sleep: Wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function postMessage(
  url: string,
  auth: Record<string, string>,
  reply: Reply,
  wait: Wait,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    // Corps reconstruit à chaque essai : un formulaire ne s'envoie qu'une fois.
    const { body, headers } = editBody(reply);
    const response = await fetch(url, { method: 'POST', body, headers: { ...headers, ...auth } });
    if (response.ok) return;
    if (response.status === 429 && attempt === 1) {
      const json = (await response.json().catch(() => ({}))) as { retry_after?: number };
      await wait(Math.min((json.retry_after ?? 1) * 1000, 10_000));
      continue;
    }
    console.error('Annonce refusée par Discord', response.status, await response.text());
    return;
  }
}

/**
 * Poste un message avec le webhook d'un salon. `?wait=true` : Discord répond
 * seulement une fois le message publié, ce qui permet de détecter une erreur.
 */
export function postToWebhook(webhookUrl: string, reply: Reply, wait: Wait = sleep) {
  return postMessage(`${webhookUrl}?wait=true`, {}, reply, wait);
}

/**
 * Poste un message EN TANT QUE BOT (nom et avatar de l'application « Spade Cup
 * FR »), dans le salon `channelId`. Le bot doit pouvoir voir le salon et y
 * écrire, y compris dans un salon privé.
 */
export function postAsBot(token: string, channelId: string, reply: Reply, wait: Wait = sleep) {
  return postMessage(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    { Authorization: `Bot ${token}` },
    reply,
    wait,
  );
}
