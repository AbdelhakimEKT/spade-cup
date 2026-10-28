import { isValidTag, normalizeTag, tagToUrl } from '../../../src/app/core/tournament/tags';
import { accountsOf, escapeMarkdown } from '../fw-evenings';
import { getPlayerProfile } from '../stats-repository';
import type { BotContext, Reply } from './bot';
import type { Choice, Interaction } from './types';

/**
 * /carte [joueur] : la carte d'un joueur (la page /joueurs/:tag/carte du
 * site, photographiée), postée dans le salon. Sans joueur : le compte que la
 * personne a enregistré pour les FW (le premier, si elle en a plusieurs).
 */
export async function cardCommand(
  interaction: Interaction,
  ctx: BotContext,
  typed: string,
): Promise<Reply> {
  const raw = typed.trim();
  let tag: string;
  if (raw) {
    tag = normalizeTag(raw);
    if (!isValidTag(tag)) return oops(`« ${raw} » n'est pas un tag de joueur valide.`);
  } else {
    const [first] = await accountsOf(ctx.db, interaction.member!.user.id);
    if (!first) {
      return oops(
        'Donne le tag du joueur : `/carte joueur:#TAG`. (Inscris-toi à une FW avec le bot : ' +
          'ton compte sera retenu et `/carte` seul suffira.)',
      );
    }
    tag = first.tag;
  }

  const profile = await getPlayerProfile(ctx.db, tag);
  if (!profile) return oops(`Aucune guerre enregistrée pour ${tag} : pas encore de carte.`);

  let png: Uint8Array;
  try {
    [png] = await ctx.capture([{ kind: 'card', tag }]);
  } catch (error) {
    console.error('Capture de la carte impossible', error);
    return oops('Impossible de créer la carte pour le moment. Réessaie dans une minute.');
  }
  const name = profile.fw?.totals.name ?? profile.totals.name;
  return {
    content: `🎴 Carte de **${escapeMarkdown(name)}** · ${ctx.siteUrl}/joueurs/${tagToUrl(tag)}`,
    files: [{ name: `carte-${tagToUrl(tag)}.png`, data: png }],
    publicFollowUp: true,
  };
}

/** Suggestions pour `/carte joueur:` : les comptes enregistrés par la personne. */
export async function cardAutocomplete(
  interaction: Interaction,
  ctx: BotContext,
  typed: string,
): Promise<Choice[]> {
  if (!interaction.member) return [];
  const query = typed.toLowerCase();
  return (await accountsOf(ctx.db, interaction.member.user.id))
    .map((a) => ({ name: `${a.name} (${a.tag})`.slice(0, 100), value: a.tag }))
    .filter((c) => c.name.toLowerCase().includes(query))
    .slice(0, 25);
}

const oops = (message: string): Reply => ({ content: `❌ ${message}`, ephemeral: true });
