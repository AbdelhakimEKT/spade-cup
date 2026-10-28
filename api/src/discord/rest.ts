import type { Reply } from './bot';
import { editBody } from './payload';

/**
 * Ce que le bot fait EN SON NOM sur Discord, avec son jeton (secret
 * DISCORD_BOT_TOKEN) : poster dans un salon, modifier ses propres messages
 * (la fiche d'inscription tenue à jour), lire ses émojis (les HDV).
 *
 * Le bot doit être membre du serveur et pouvoir écrire dans ces salons.
 */
export interface DiscordApi {
  /** Poste un message ; renvoie son identifiant, ou `null` si Discord refuse. */
  send(channelId: string, reply: Reply): Promise<string | null>;
  /** Remplace un message du bot (texte, boutons ; image si `files`). */
  edit(channelId: string, messageId: string, reply: Reply): Promise<boolean>;
  /** Les émojis de l'application : nom (« th18 ») → identifiant. */
  emojis(): Promise<ReadonlyMap<string, string>>;
}

const API = 'https://discord.com/api/v10';
/** Les émojis changent rarement : relus au plus toutes les 10 minutes. */
const EMOJI_TTL_MS = 10 * 60 * 1000;
let emojiCache: { at: number; map: ReadonlyMap<string, string> } | null = null;

export function createDiscordApi(
  env: { DISCORD_BOT_TOKEN?: string; DISCORD_APPLICATION_ID?: string },
  fetcher: typeof fetch = fetch,
): DiscordApi | null {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  const auth = { Authorization: `Bot ${token}` };

  async function call(method: string, path: string, reply: Reply): Promise<Response> {
    const { body, headers } = editBody(reply);
    return fetcher(`${API}${path}`, { method, body, headers: { ...headers, ...auth } });
  }

  return {
    async send(channelId, reply) {
      const response = await call('POST', `/channels/${channelId}/messages`, reply);
      if (!response.ok) {
        console.error('Message refusé par Discord', response.status, await response.text());
        return null;
      }
      return ((await response.json()) as { id: string }).id;
    },
    async edit(channelId, messageId, reply) {
      const response = await call('PATCH', `/channels/${channelId}/messages/${messageId}`, reply);
      if (!response.ok) {
        console.error('Modification refusée par Discord', response.status, await response.text());
      }
      return response.ok;
    },
    async emojis() {
      if (emojiCache && Date.now() - emojiCache.at < EMOJI_TTL_MS) return emojiCache.map;
      const app = env.DISCORD_APPLICATION_ID;
      if (!app) return new Map();
      try {
        const response = await fetcher(`${API}/applications/${app}/emojis`, { headers: auth });
        if (!response.ok) return emojiCache?.map ?? new Map();
        const { items } = (await response.json()) as { items: { id: string; name: string }[] };
        emojiCache = { at: Date.now(), map: new Map(items.map((e) => [e.name, e.id])) };
        return emojiCache.map;
      } catch {
        return emojiCache?.map ?? new Map();
      }
    },
  };
}

/** Pour les tests : oublie les émojis gardés en mémoire. */
export function forgetEmojis(): void {
  emojiCache = null;
}
