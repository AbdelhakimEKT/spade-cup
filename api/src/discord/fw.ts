import { franceDateTime, normalizeDate, normalizeTime } from '../../../src/app/core/poster/poster';
import { isValidTag, normalizeTag } from '../../../src/app/core/tournament/tags';
import { COC_ERROR_TEXT } from '../coc';
import {
  accountsOf,
  addSignup,
  cancelEvening,
  createEvening,
  dayLabel,
  escapeMarkdown,
  getEvening,
  latestOpenEvening,
  removeSignups,
  saveAccount,
  setSignups,
  signupsOf,
  type Account,
  type Evening,
} from '../fw-evenings';
import type { BotContext, Reply } from './bot';
import { ADMINISTRATOR, MANAGE_GUILD } from './commands';
import { ButtonStyle, ComponentType, type Interaction } from './types';

/**
 * Les soirées FW « chill » sur Discord.
 *
 *  /fw soiree date heure [programme]   (admins et modos) : publie l'affiche
 *      « Inscriptions ouvertes » avec trois boutons dessous ;
 *  /fw annuler                          (admins et modos) : annule la dernière soirée.
 *
 * Les boutons sous l'affiche :
 *  ✅ Je m'inscris   1re fois : une petite fenêtre demande le tag du compte,
 *                    retenu ensuite. Un seul compte : un clic l'inscrit. Plusieurs
 *                    comptes : une liste à cocher (décocher = désinscrire), et
 *                    « Ajouter un compte » pour en enregistrer un autre ;
 *  👥 Inscrits       la liste, visible seulement par celui qui clique ;
 *  Me désinscrire   retire tous ses comptes de la soirée.
 *
 * Tout ce que le bot répond à un clic n'est visible que par la personne qui a cliqué.
 */

/** Ce qu'il faut répondre à Discord après un clic ou un formulaire (voir route.ts). */
export type ComponentResponse =
  /** Un nouveau message (visible seulement par la personne). */
  | { readonly kind: 'reply'; readonly reply: Reply }
  /** Le message cliqué est remplacé (la liste à cocher, mise à jour). */
  | { readonly kind: 'update'; readonly reply: Reply }
  /** Une petite fenêtre de saisie. */
  | { readonly kind: 'modal'; readonly modal: unknown }
  /** « Je réfléchis » (le jeu peut être lent), puis la réponse. */
  | { readonly kind: 'deferred'; readonly run: () => Promise<Reply> };

/** Erreur « normale » : montrée telle quelle à la personne. */
class FwError extends Error {}
const fail = (message: string): never => {
  throw new FwError(message);
};
const oops = (message: string): Reply => ({ content: `❌ ${message}`, ephemeral: true });

/** Admins, membres qui peuvent « Gérer le serveur », et rôles de FW_MANAGER_ROLES. */
export function isManager(
  member: NonNullable<Interaction['member']>,
  managerRoles: readonly string[],
): boolean {
  const bits = BigInt(member.permissions || '0');
  if ((bits & (ADMINISTRATOR | MANAGE_GUILD)) !== 0n) return true;
  return (member.roles ?? []).some((r) => managerRoles.includes(r));
}

const displayName = (member: NonNullable<Interaction['member']>) =>
  member.nick ?? member.user.global_name ?? member.user.username;

/** « mercredi 28/10 à 20h30 ». */
const when = (e: Evening) => `${dayLabel(e.startsAt)} à ${e.time.replace('H', 'h')}`;

// ------------------------------------------------------------ commande /fw

export async function fwCommand(
  interaction: Interaction,
  ctx: BotContext,
  sub: string,
  options: Map<string, string | number>,
): Promise<Reply> {
  try {
    if (!isManager(interaction.member!, ctx.managerRoles)) {
      fail('Les commandes /fw sont réservées aux admins et aux modos.');
    }
    if (sub === 'soiree') return await createEveningPost(interaction, ctx, options);
    if (sub === 'annuler') return await cancelLatest(ctx);
    return fail('Commande inconnue.');
  } catch (error) {
    if (error instanceof FwError) return oops(error.message);
    throw error;
  }
}

/** Les boutons sous l'affiche d'une soirée. */
export function eveningButtons(eveningId: number): unknown[] {
  return [
    {
      type: ComponentType.Row,
      components: [
        button(`fw:join:${eveningId}`, "Je m'inscris", ButtonStyle.Success, '✅'),
        button(`fw:list:${eveningId}`, 'Inscrits', ButtonStyle.Secondary, '👥'),
        button(`fw:leave:${eveningId}`, 'Me désinscrire', ButtonStyle.Secondary),
      ],
    },
  ];
}

function button(customId: string, label: string, style: number, emoji?: string) {
  return {
    type: ComponentType.Button,
    custom_id: customId,
    label,
    style,
    ...(emoji ? { emoji: { name: emoji } } : {}),
  };
}

async function createEveningPost(
  interaction: Interaction,
  ctx: BotContext,
  options: Map<string, string | number>,
): Promise<Reply> {
  const text = (name: string) => String(options.get(name) ?? '').trim();
  const date = normalizeDate(text('date')) ?? fail('Date illisible : écris-la comme ceci, 28/10.');
  const time =
    normalizeTime(text('heure')) ?? fail('Heure illisible : écris-la comme ceci, 20h30.');
  const startsAt = franceDateTime(date, time, new Date(ctx.now()))!;
  if (startsAt < ctx.now() - 60 * 60 * 1000) fail(`Le ${date} à ${time} est déjà passé.`);
  const note = text('programme') || null;

  const id = await createEvening(ctx.db, {
    startsAt,
    date,
    time,
    note,
    createdBy: displayName(interaction.member!),
  });
  const evening = (await getEvening(ctx.db, id))!;

  // L'affiche, dessinée par le site et photographiée. Si le navigateur est
  // indisponible, l'annonce part quand même, sans image.
  let files: Reply['files'];
  try {
    const query = new URLSearchParams({ j: date, h: time, ...(note ? { n: note } : {}) });
    const [png] = await ctx.capture([{ kind: 'evening', query: query.toString() }]);
    files = [{ name: 'soiree-fw.png', data: png }];
  } catch (error) {
    console.error('Capture de l’affiche de soirée impossible', error);
  }

  return {
    content:
      `📣 **Inscriptions ouvertes** pour la soirée FW chill du **${when(evening)}** !` +
      (note ? `\n🗓️ ${escapeMarkdown(note)}` : '') +
      "\nClique sur **Je m'inscris** : un clic suffit, et tu peux inscrire plusieurs comptes." +
      '\nTu peux aussi nous rejoindre en cours de route, aucun souci. ⚔️',
    ...(files ? { files } : {}),
    components: eveningButtons(id),
  };
}

async function cancelLatest(ctx: BotContext): Promise<Reply> {
  const evening =
    (await latestOpenEvening(ctx.db)) ?? fail("Aucune soirée FW n'est ouverte en ce moment.");
  await cancelEvening(ctx.db, evening.id);
  return {
    content: `🗑️ La soirée FW du ${when(evening)} est annulée : plus d'inscriptions ni de bilan.`,
    ephemeral: true,
  };
}

// ------------------------------------------------------------ boutons et formulaire

/** Un clic sous l'affiche, un choix dans la liste, ou le formulaire du tag. */
export async function fwComponent(
  interaction: Interaction,
  ctx: BotContext,
): Promise<ComponentResponse> {
  const [scope, action, rawId] = (interaction.data?.custom_id ?? '').split(':');
  try {
    if (scope !== 'fw' || !interaction.member) fail('Bouton inconnu.');
    const evening = (await getEvening(ctx.db, Number(rawId))) ?? fail('Soirée introuvable.');
    const member = interaction.member!;
    const who = { id: member.user.id, name: displayName(member) };

    switch (action) {
      case 'list':
        return { kind: 'reply', reply: await listReply(ctx, evening) };
      case 'leave':
        return { kind: 'reply', reply: await leaveReply(ctx, evening, who.id) };
    }
    if (evening.closed) fail(`La soirée du ${when(evening)} est terminée.`);
    switch (action) {
      case 'join':
        return await join(ctx, evening, who);
      case 'add':
        return { kind: 'modal', modal: tagModal(evening) };
      case 'pick':
        return { kind: 'update', reply: await pick(ctx, evening, who, interaction) };
      case 'tag':
        return await tagSubmitted(ctx, evening, who, interaction);
    }
    return fail('Bouton inconnu.');
  } catch (error) {
    if (error instanceof FwError) return { kind: 'reply', reply: oops(error.message) };
    throw error;
  }
}

/** « Je m'inscris ». */
async function join(
  ctx: BotContext,
  evening: Evening,
  who: { id: string; name: string },
): Promise<ComponentResponse> {
  const accounts = await accountsOf(ctx.db, who.id);
  // Première fois : on demande le tag.
  if (accounts.length === 0) return { kind: 'modal', modal: tagModal(evening) };

  const signed = new Set(
    (await signupsOf(ctx.db, evening.id)).filter((s) => s.discordId === who.id).map((s) => s.tag),
  );
  // Un seul compte, pas encore inscrit : un clic suffit.
  if (accounts.length === 1 && !signed.has(accounts[0].tag)) {
    await addSignup(ctx.db, evening.id, who, accounts[0]);
    return {
      kind: 'reply',
      reply: picker(
        evening,
        accounts,
        new Set([accounts[0].tag]),
        `✅ **${escapeMarkdown(accounts[0].name)}** est inscrit à la soirée du ${when(evening)}.`,
      ),
    };
  }
  return {
    kind: 'reply',
    reply: picker(
      evening,
      accounts,
      signed,
      `Quels comptes inscris-tu à la soirée du ${when(evening)} ? Coche-les dans la liste ` +
        '(décocher un compte le désinscrit).',
    ),
  };
}

/** La liste à cocher de ses comptes, et le bouton pour en ajouter un. */
function picker(
  evening: Evening,
  accounts: readonly Account[],
  signed: ReadonlySet<string>,
  header: string,
): Reply {
  const shown = accounts.slice(0, 25); // limite de Discord
  return {
    content:
      header +
      '\n_Un autre compte ? « Ajouter un compte » : il sera retenu pour les prochaines soirées._',
    ephemeral: true,
    components: [
      {
        type: ComponentType.Row,
        components: [
          {
            type: ComponentType.StringSelect,
            custom_id: `fw:pick:${evening.id}`,
            placeholder: 'Choisis tes comptes',
            min_values: 0,
            max_values: shown.length,
            options: shown.map((a) => ({
              label: a.name.slice(0, 100),
              value: a.tag,
              description: a.townHall ? `${a.tag} · HDV ${a.townHall}` : a.tag,
              default: signed.has(a.tag),
            })),
          },
        ],
      },
      {
        type: ComponentType.Row,
        components: [
          button(`fw:add:${evening.id}`, 'Ajouter un compte', ButtonStyle.Primary, '➕'),
        ],
      },
    ],
  };
}

/** Cases cochées dans la liste : ses inscriptions deviennent exactement celles-là. */
async function pick(
  ctx: BotContext,
  evening: Evening,
  who: { id: string; name: string },
  interaction: Interaction,
): Promise<Reply> {
  const accounts = await accountsOf(ctx.db, who.id);
  const chosen = new Set(interaction.data?.values ?? []);
  const selected = accounts.filter((a) => chosen.has(a.tag));
  await setSignups(ctx.db, evening.id, who, selected);
  const names = selected.map((a) => `**${escapeMarkdown(a.name)}**`).join(', ');
  return picker(
    evening,
    accounts,
    new Set(selected.map((a) => a.tag)),
    selected.length
      ? `✅ Inscrit${selected.length > 1 ? 's' : ''} à la soirée du ${when(evening)} : ${names}.`
      : `Aucun de tes comptes n'est inscrit à la soirée du ${when(evening)}.`,
  );
}

function tagModal(evening: Evening) {
  return {
    custom_id: `fw:tag:${evening.id}`,
    title: 'Inscrire un compte',
    components: [
      {
        type: ComponentType.Row,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: 'tag',
            label: 'Tag du compte (profil du joueur, dans le jeu)',
            style: 1,
            min_length: 4,
            max_length: 15,
            placeholder: '#2PQ8LVYC',
            required: true,
          },
        ],
      },
    ],
  };
}

/** Le formulaire du tag : on vérifie le compte dans le jeu, on le retient, on l'inscrit. */
async function tagSubmitted(
  ctx: BotContext,
  evening: Evening,
  who: { id: string; name: string },
  interaction: Interaction,
): Promise<ComponentResponse> {
  const raw =
    interaction.data?.components?.[0]?.components.find((c) => c.custom_id === 'tag')?.value ?? '';
  const tag = normalizeTag(raw);
  if (!isValidTag(tag)) {
    fail(`« ${raw} » n'est pas un tag valide. Il est sous le pseudo, dans le profil du joueur.`);
  }
  return {
    kind: 'deferred',
    run: async () => {
      const found = await ctx.coc.player(tag);
      if (!found.ok) {
        return oops(
          found.error === 'not-found'
            ? `Aucun joueur ne porte le tag ${tag} dans le jeu.`
            : COC_ERROR_TEXT[found.error],
        );
      }
      await saveAccount(ctx.db, who.id, found.value);
      await addSignup(ctx.db, evening.id, who, found.value);
      const accounts = await accountsOf(ctx.db, who.id);
      const signed = new Set(
        (await signupsOf(ctx.db, evening.id))
          .filter((s) => s.discordId === who.id)
          .map((s) => s.tag),
      );
      return picker(
        evening,
        accounts,
        signed,
        `✅ **${escapeMarkdown(found.value.name)}** (\`${tag}\`, HDV ${found.value.townHall}) ` +
          `est inscrit à la soirée du ${when(evening)}.`,
      );
    },
  };
}

async function leaveReply(ctx: BotContext, evening: Evening, discordId: string): Promise<Reply> {
  const removed = await removeSignups(ctx.db, evening.id, discordId);
  return {
    content: removed.length
      ? `🗑️ Désinscrit de la soirée du ${when(evening)} : ` +
        removed.map((n) => `**${escapeMarkdown(n)}**`).join(', ') +
        '.'
      : `Tu n'étais pas inscrit à la soirée du ${when(evening)}.`,
    ephemeral: true,
  };
}

/** Les inscrits, regroupés par personne (« Rags : Rags, Rags 2 »). */
async function listReply(ctx: BotContext, evening: Evening): Promise<Reply> {
  const signups = await signupsOf(ctx.db, evening.id);
  if (signups.length === 0) {
    return { content: `Personne n'est encore inscrit à la soirée du ${when(evening)}.`, ephemeral: true };
  }
  const byPerson = new Map<string, { name: string; accounts: string[] }>();
  for (const s of signups) {
    const person = byPerson.get(s.discordId) ?? { name: s.discordName, accounts: [] };
    person.accounts.push(
      `${escapeMarkdown(s.name)}${s.townHall ? ` (HDV ${s.townHall})` : ''}`,
    );
    byPerson.set(s.discordId, person);
  }
  const lines = [...byPerson.values()].map(
    (p) => `• **${escapeMarkdown(p.name)}** : ${p.accounts.join(', ')}`,
  );
  const n = signups.length;
  return {
    content: [
      `👥 **${n} compte${n > 1 ? 's' : ''} inscrit${n > 1 ? 's' : ''}** à la soirée du ${when(evening)} :`,
      ...lines,
    ]
      .join('\n')
      .slice(0, 2000),
    ephemeral: true,
  };
}
