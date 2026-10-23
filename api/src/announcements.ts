import { roundLabel } from '../../src/app/core/tournament/bracket';
import type { Bracket, BracketMatch } from '../../src/app/core/tournament/models';
import { bracketCaption, nextRoundName, resultMessage, versus, type Reply } from './discord/bot';
import { postToWebhook } from './discord/payload';
import { captureScreens, type Shot } from './screens';

/**
 * Les annonces dans les salons du Discord, chacune à sa place :
 *
 *   #résultats   ⚔️ début des guerres, 🏆 résultats, 📊 récap des joueurs
 *   #classement  l'image de l'arbre à jour
 *   arbitres     ⚠️ alertes : égalité parfaite, guerre hors règlement
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
  readonly finished?: readonly { readonly matchId: string; readonly warnings: readonly string[] }[];
  readonly ties?: readonly BracketMatch[];
}

type Secrets = Pick<
  Env,
  | 'DISCORD_WEBHOOK_RESULTATS'
  | 'DISCORD_WEBHOOK_CLASSEMENT'
  | 'DISCORD_WEBHOOK_ARBITRES'
  | 'DISCORD_ANNOUNCE_WEBHOOK'
>;

/**
 * Le webhook de chaque salon. À défaut, l'ancien webhook unique
 * (DISCORD_ANNOUNCE_WEBHOOK) sert pour tout ; les alertes arbitres, à défaut
 * de leur salon, vont dans #résultats plutôt que d'être perdues.
 */
export function webhookFor(env: Secrets, channel: Channel): string | undefined {
  const results = env.DISCORD_WEBHOOK_RESULTATS || env.DISCORD_ANNOUNCE_WEBHOOK;
  switch (channel) {
    case 'results':
      return results;
    case 'bracket':
      return env.DISCORD_WEBHOOK_CLASSEMENT || env.DISCORD_ANNOUNCE_WEBHOOK;
    case 'referees':
      return env.DISCORD_WEBHOOK_ARBITRES || results;
  }
}

export function createAnnouncer(env: Env): Announcer {
  return {
    async post(channel, reply) {
      const webhook = webhookFor(env, channel);
      if (webhook) await postToWebhook(webhook, reply);
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
  siteUrl: string,
  t: { readonly name: string; readonly slug: string },
  bracket: Bracket,
  outcome: Outcome,
): Promise<void> {
  const { started = [], finished = [], ties = [] } = outcome;
  const matchOf = (id: string) => bracket.matches.find((m) => m.id === id)!;

  // 1. #résultats : débuts et résultats, regroupés (Discord limite un webhook
  //    à 5 messages toutes les 2 secondes, et le salon reste lisible).
  const news = [
    ...started.map(
      (m) =>
        `⚔️ **${versus(m)}** a commencé ` +
        `(${roundLabel(m.round, bracket.roundCount).toLowerCase()}). Bonne guerre !`,
    ),
    ...finished.map((f) => resultMessage(siteUrl, t, bracket, f.matchId)),
  ];
  for (const content of pack(news)) await announcer.post('results', { content });

  // 2. Arbitres : ce qui demande leur attention.
  const alerts = [
    ...finished
      .filter((f) => f.warnings.length)
      .map(
        (f) =>
          `⚠️ **${versus(matchOf(f.matchId))}** a été validé automatiquement, mais :\n` +
          f.warnings.map((w) => `• ${w}`).join('\n') +
          '\nPour revenir dessus : `/arbitre vainqueur` (tant que le match suivant n’est pas joué).',
      ),
    ...ties.map(
      (m) =>
        `⚖️ Égalité parfaite entre **${m.home?.name}** et **${m.away?.name}** ` +
        '(étoiles, pourcentage ET temps) : à vous de trancher avec `/arbitre vainqueur`.',
    ),
  ];
  for (const content of pack(alerts)) await announcer.post('referees', { content });

  // 3. Les images, en une seule session du navigateur : le récap de chaque
  //    match terminé (#résultats), puis l'arbre à jour (#classement).
  if (finished.length === 0) return;
  const shots: Shot[] = [
    ...finished.map((f) => ({ kind: 'match' as const, slug: t.slug, matchId: f.matchId })),
    { kind: 'bracket', slug: t.slug },
  ];
  let images: Uint8Array[];
  try {
    images = await announcer.capture(shots);
  } catch (error) {
    console.error('Images impossibles', error);
    return;
  }
  for (const [i, f] of finished.entries()) {
    await announcer.post('results', {
      content: `📊 **${versus(matchOf(f.matchId))}** · le détail joueur par joueur`,
      files: [{ name: `recap-${f.matchId}.png`, data: images[i] }],
    });
  }
  await announcer.post('bracket', {
    content: bracketCaption(t.name, bracket) + roundsCompleted(bracket, finished),
    files: [{ name: 'arbre.png', data: images.at(-1)! }],
  });
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
