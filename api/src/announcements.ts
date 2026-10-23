import { championOf, roundLabel, winnerOf } from '../../src/app/core/tournament/bracket';
import type { Bracket, BracketMatch } from '../../src/app/core/tournament/models';
import { bracketCaption, nextRoundName, versus, type Reply } from './discord/bot';
import { postAsBot, postToWebhook } from './discord/payload';
import { captureScreens, type Shot } from './screens';

/**
 * Les annonces dans les salons du Discord, chacune à sa place :
 *
 *   #résultats   ⚔️ début des guerres, 🏆 victoire (une phrase courte)
 *   #classement  l'image de l'arbre à jour
 *   arbitres     ⚖️ égalité parfaite : à eux de trancher
 *
 * Utilisé par l'arbitre automatique (toutes les 5 minutes) ET par les
 * commandes d'arbitre : un résultat saisi à la main est annoncé pareil.
 */

export type Channel = 'results' | 'bracket' | 'referees';

export interface Announcer {
  /** Poste dans un salon ; ne fait rien si aucun webhook ne le dessert. */
  post(channel: Channel, reply: Reply): Promise<void>;
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
    | 'DISCORD_WEBHOOK_RESULTATS'
    | 'DISCORD_WEBHOOK_CLASSEMENT'
    | 'DISCORD_WEBHOOK_ARBITRES'
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
  };
  const hooks = {
    results: env.DISCORD_WEBHOOK_RESULTATS || env.DISCORD_ANNOUNCE_WEBHOOK,
    bracket: env.DISCORD_WEBHOOK_CLASSEMENT || env.DISCORD_ANNOUNCE_WEBHOOK,
    referees: env.DISCORD_WEBHOOK_ARBITRES,
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
  const { started = [], finished = [], ties = [] } = outcome;

  // 1. #résultats : débuts et résultats, regroupés (Discord limite un webhook
  //    à 5 messages toutes les 2 secondes, et le salon reste lisible).
  const news = [
    ...started.map(
      (m) =>
        `⚔️ **${versus(m)}** a commencé ` +
        `(${roundLabel(m.round, bracket.roundCount).toLowerCase()}). Bonne guerre !`,
    ),
    ...finished.map((f) => victoryText(t, bracket, f.matchId)),
  ];
  for (const content of pack(news)) await announcer.post('results', { content });

  // 2. Arbitres : le seul cas que le bot ne peut pas trancher seul. (Le format
  //    HDV 18 / 5 contre 5 est la responsabilité des clans : pas d'alerte.)
  const alerts = [
    ...ties.map(
      (m) =>
        `⚖️ Égalité parfaite entre **${m.home?.name}** et **${m.away?.name}** ` +
        '(étoiles, pourcentage ET temps) : à vous de trancher avec `/arbitre vainqueur`.',
    ),
  ];
  for (const content of pack(alerts)) await announcer.post('referees', { content });

  // 3. L'arbre à jour en image (#classement).
  if (finished.length === 0) return;
  let image: Uint8Array;
  try {
    [image] = await announcer.capture([{ kind: 'bracket', slug: t.slug }]);
  } catch (error) {
    console.error('Image de l’arbre impossible', error);
    return;
  }
  await announcer.post('bracket', {
    content: bracketCaption(t.name, bracket) + roundsCompleted(bracket, finished),
    files: [{ name: 'arbre.png', data: image }],
  });
}

/**
 * L'annonce d'un résultat dans #résultats, volontairement courte (demande des
 * organisateurs) : « 🏆 Victoire de Vega qui se qualifie pour les quarts de
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
    ? `🏆 Victoire de ${winner.name} qui remporte ${t.name} ! 👑`
    : `🏆 Victoire de ${winner.name} qui se qualifie pour ${nextRoundName(match.round + 1, bracket.roundCount)} ! ⚔️`;
}

/**
 * « ✅ Les quarts de finale sont terminés : place aux demi-finales ! » quand un
 * résultat de ce passage complète son tour (la finale, elle, a sa propre
 * annonce du champion).
 */
export function roundsCompleted(
  bracket: Bracket,
  finished: readonly { readonly matchId: string }[],
): string {
  const rounds = new Set(
    finished.map((f) => bracket.matches.find((m) => m.id === f.matchId)!.round),
  );
  return [...rounds]
    .sort((a, b) => a - b)
    .filter(
      (round) =>
        round < bracket.roundCount &&
        bracket.matches
          .filter((m) => m.round === round)
          .every((m) => m.status === 'done' || m.status === 'bye'),
    )
    .map((round) => {
      const label = roundLabel(round, bracket.roundCount).toLowerCase();
      // « les demi-finales » est féminin ; « les quarts / huitièmes de finale », masculin.
      const done = label.startsWith('demi') ? 'terminées' : 'terminés';
      const next = nextRoundName(round + 1, bracket.roundCount)
        .replace(/^les /, 'aux ')
        .replace(/^la /, 'à la ');
      return `\n✅ Les ${label} sont ${done} : place ${next} !`;
    })
    .join('');
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
