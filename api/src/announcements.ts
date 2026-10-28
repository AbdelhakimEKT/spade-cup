import { championOf, winnerOf } from '../../src/app/core/tournament/bracket';
import type { Bracket, BracketMatch } from '../../src/app/core/tournament/models';
import { nextRoundName, type Reply } from './discord/bot';
import { postAsBot, postToWebhook } from './discord/payload';
import { captureScreens, type Shot } from './screens';

/**
 * Les annonces dans les salons du Discord, chacune à sa place :
 *
 *   #résultats   🏆 victoire (la phrase des organisateurs + le récap en image)
 *   #classement  l'image de l'arbre à jour, sans texte
 *   arbitres     ⚖️ égalité parfaite : à eux de trancher
 *   stats        📅 top FW de la semaine, chaque lundi (src/fw-evenings.ts)
 *
 * Utilisé par l'arbitre automatique (toutes les minutes) ET par les
 * commandes d'arbitre : un résultat saisi à la main est annoncé pareil.
 */

export type Channel = 'results' | 'bracket' | 'referees' | 'stats';

export interface Announcer {
  /** Poste dans un salon ; ne fait rien si aucun webhook ne le dessert. */
  post(channel: Channel, reply: Reply): Promise<void>;
  /** Ce salon est-il configuré ? */
  can(channel: Channel): boolean;
  /** Images des pages du site (récap d'un match, arbre). */
  capture(shots: readonly Shot[]): Promise<Uint8Array[]>;
}

/** Ce qui vient de se passer dans le tournoi, à annoncer. */
export interface Outcome {
  readonly started?: readonly BracketMatch[];
  readonly finished?: readonly { readonly matchId: string }[];
  readonly ties?: readonly BracketMatch[];
}

/** Réglages utiles ; tous facultatifs (le serveur doit marcher même à moitié configuré). */
type Config = Partial<
  Pick<
    Env,
    | 'DISCORD_BOT_TOKEN'
    | 'DISCORD_CHANNEL_RESULTATS'
    | 'DISCORD_CHANNEL_CLASSEMENT'
    | 'DISCORD_CHANNEL_ARBITRES'
    | 'DISCORD_CHANNEL_STATS'
    | 'DISCORD_WEBHOOK_RESULTATS'
    | 'DISCORD_WEBHOOK_CLASSEMENT'
    | 'DISCORD_WEBHOOK_ARBITRES'
    | 'DISCORD_WEBHOOK_STATS'
    | 'DISCORD_ANNOUNCE_WEBHOOK'
  >
>;

/** Où poster : en tant que bot dans un salon, ou par un webhook. */
export type Destination =
  | { readonly by: 'bot'; readonly token: string; readonly channelId: string }
  | { readonly by: 'webhook'; readonly url: string };

/**
 * La destination de chaque annonce. De préférence le BOT (son nom et son
 * avatar) ; à défaut, le webhook du salon, puis l'ancien webhook unique. Les
 * alertes arbitres, à défaut de leur salon, vont dans #résultats plutôt que
 * d'être perdues.
 */
export function destinationFor(env: Config, channel: Channel): Destination | null {
  const ids = {
    results: env.DISCORD_CHANNEL_RESULTATS,
    bracket: env.DISCORD_CHANNEL_CLASSEMENT,
    referees: env.DISCORD_CHANNEL_ARBITRES,
    stats: env.DISCORD_CHANNEL_STATS,
  };
  const hooks = {
    results: env.DISCORD_WEBHOOK_RESULTATS || env.DISCORD_ANNOUNCE_WEBHOOK,
    bracket: env.DISCORD_WEBHOOK_CLASSEMENT || env.DISCORD_ANNOUNCE_WEBHOOK,
    referees: env.DISCORD_WEBHOOK_ARBITRES,
    stats: env.DISCORD_WEBHOOK_STATS,
  };
  const own = (c: Channel): Destination | null => {
    if (env.DISCORD_BOT_TOKEN && ids[c]) {
      return { by: 'bot', token: env.DISCORD_BOT_TOKEN, channelId: ids[c]! };
    }
    return hooks[c] ? { by: 'webhook', url: hooks[c]! } : null;
  };
  return own(channel) ?? (channel === 'referees' ? own('results') : null);
}

export function createAnnouncer(env: Env): Announcer {
  return {
    async post(channel, reply) {
      const to = destinationFor(env, channel);
      if (to?.by === 'bot') await postAsBot(to.token, to.channelId, reply);
      else if (to?.by === 'webhook') await postToWebhook(to.url, reply);
    },
    can: (channel) => destinationFor(env, channel) !== null,
    capture: (shots) => captureScreens(env.BROWSER, env.SITE_URL, shots),
  };
}

/**
 * Publie un événement du tournoi. Le TEXTE part d'abord : si les images
 * échouent (quota du navigateur, coupure), les résultats sont déjà annoncés.
 */
export async function announce(
  announcer: Announcer,
  t: { readonly name: string; readonly slug: string },
  bracket: Bracket,
  outcome: Outcome,
): Promise<void> {
  // `outcome.started` n'est pas annoncé : les débuts de guerre restent sur le
  // site (« en cours »), pas sur Discord (demande des organisateurs).
  const { finished = [], ties = [] } = outcome;

  // 1. Arbitres : le seul cas que le bot ne peut pas trancher seul. (Le format
  //    HDV 18 / 5 contre 5 est la responsabilité des clans : pas d'alerte.)
  const alerts = ties.map(
    (m) =>
      `⚖️ Égalité parfaite entre **${m.home?.name}** et **${m.away?.name}** ` +
      '(étoiles, pourcentage ET temps) : à vous de trancher avec `/arbitre vainqueur`.',
  );
  for (const content of pack(alerts)) await announcer.post('referees', { content });

  // 2. Les victoires. Les images d'abord, en une seule session du navigateur :
  //    le récap joueur par joueur de chaque match, puis l'arbre.
  if (finished.length === 0) return;
  const shots: Shot[] = [
    ...finished.map((f) => ({ kind: 'match' as const, slug: t.slug, matchId: f.matchId })),
    { kind: 'bracket', slug: t.slug },
  ];
  let images: Uint8Array[] | null = null;
  try {
    images = await announcer.capture(shots);
  } catch (error) {
    console.error('Images impossibles', error);
  }

  // #résultats : UN message par victoire, la phrase des organisateurs avec le
  // récap en pièce jointe. Sans image (navigateur en panne), la phrase seule.
  for (const [i, f] of finished.entries()) {
    await announcer.post('results', {
      content: victoryText(t, bracket, f.matchId),
      ...(images ? { files: [{ name: `recap-${f.matchId}.png`, data: images[i] }] } : {}),
    });
  }

  // #classement : l'arbre à jour.
  if (images) {
    await announcer.post('bracket', {
      content: '', // juste l'arbre (demande des organisateurs)
      files: [{ name: 'arbre.png', data: images.at(-1)! }],
    });
  }
}

/**
 * L'annonce d'un résultat dans #résultats, volontairement courte (demande des
 * organisateurs) : « 🏆 Victoire de **Vega** qui se qualifie pour les quarts de
 * finale ! ⚔️ ». Le détail du score reste sur le site.
 */
export function victoryText(
  t: { readonly name: string },
  bracket: Bracket,
  matchId: string,
): string {
  const match = bracket.matches.find((m) => m.id === matchId)!;
  const winner = winnerOf(match)!;
  return championOf(bracket)
    ? `🏆 Victoire de **${winner.name}** qui remporte ${t.name} ! 👑`
    : `🏆 Victoire de **${winner.name}** qui se qualifie pour ${nextRoundName(match.round + 1, bracket.roundCount)} ! ⚔️`;
}

/** Regroupe des annonces en messages de 2 000 caractères au plus (limite de Discord). */
export function pack(contents: readonly string[], limit = 2000): string[] {
  const packed: string[] = [];
  for (const content of contents) {
    const last = packed.at(-1);
    if (last !== undefined && last.length + 2 + content.length <= limit) {
      packed[packed.length - 1] = `${last}\n\n${content}`;
    } else {
      packed.push(content.slice(0, limit));
    }
  }
  return packed;
}
