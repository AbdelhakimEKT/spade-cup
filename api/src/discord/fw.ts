import { rankPlayers, recapQuery, weekOf } from '../../../src/app/core/fw/evening';
import { buildFullRecap, fullRecapQuery } from '../../../src/app/core/fw/full-recap';
import {
  DEFAULT_DETAILS,
  TEAM_LABEL,
  drawTeams,
  sessionClocks,
  sessionPosterQuery,
  smallerTeam,
  type SessionDetails,
  type Team,
  type TeamMode,
} from '../../../src/app/core/fw/session';
import { franceDateTime, normalizeDate, normalizeTime } from '../../../src/app/core/poster/poster';
import { isValidTag, normalizeTag } from '../../../src/app/core/tournament/tags';
import { COC_ERROR_TEXT, type CocClient } from '../coc';
import {
  accountsOf,
  cancelEvening,
  closeEvening,
  createEvening,
  currentEvening,
  dayLabel,
  escapeMarkdown,
  eveningByNumber,
  eveningLines,
  eveningWarDetails,
  lastFinishedEvening,
  eveningRecapText,
  getEvening,
  markTeams,
  nextNumber,
  removeSignups,
  refreshPlayer,
  removeStatement,
  run,
  saveAccount,
  saveClansSeen,
  saveMessages,
  setTeams,
  signupStatement,
  signupsOf,
  setSheetV2,
  updateEvening,
  type Account,
  type ClanSeen,
  type Evening,
  type Signup,
  type Who,
} from '../fw-evenings';
import { container, gallery, row, separator, text as textBlock } from './blocks';
import type { BotContext, Reply } from './bot';
import { ADMINISTRATOR, MANAGE_GUILD } from './commands';
import type { DiscordApi } from './rest';
import { ButtonStyle, ComponentType, type Choice, type Interaction } from './types';

/**
 * Les soirées FW (« FW #41 ») sur Discord.
 *
 * Commandes des admins et des modos :
 *   /fw lancer date heure [équipes] [infos…]  annonce dans #annonce-fw (ping du
 *                        rôle, fiche en image) et fiche d'inscription dans
 *                        #inscription, avec ses boutons ;
 *   /fw modifier [infos…]   corrige la fiche (l'image et le message suivent) ;
 *   /fw equipes [refaire]   fait (ou refait) les équipes tout de suite ;
 *   /fw deplacer compte équipe   rééquilibrage ;
 *   /fw bilan               top 5 de la soirée dans #résultats, la soirée est finie ;
 *   /fw bilan-complet [numero]   chaque joueur des deux équipes, en image, posté
 *                        seulement dans le salon où la commande est tapée ;
 *   /fw annuler.
 *
 * Dans #inscription, la fiche montre les inscrits (avec l'icône de leur HDV),
 * tenue à jour à chaque clic. Fiche « en blocs » (soirées lancées depuis le
 * 13/11) : bannière, pseudo du jeu et @Discord de chacun, et s'il a rejoint
 * le clan de sa team (vérifié dans le jeu chaque minute, voir checkClans). Équipes « random » : tirées au hasard à H − 10
 * (par le bot, toutes les minutes). Équipes « libres » : deux boutons, un par
 * équipe. La 1re fois, le bot demande le tag du compte et le retient ; on peut
 * en ajouter d'autres et les inscrire tous.
 *
 * Tout ce que le bot répond à un clic n'est visible que par la personne.
 */

/** Les salons et le rôle du serveur (réglages de wrangler.jsonc). */
export interface FwConfig {
  readonly signupChannel: string;
  readonly announceChannel: string;
  readonly ticketsChannel: string;
  readonly role: string;
  readonly resultsChannel: string;
  /** Numéro de la toute première soirée suivie par le bot (41). */
  readonly firstNumber: number;
  /** Lien qui ouvre le clan de chaque équipe dans le jeu (pour le rejoindre). */
  readonly clanLinks: Readonly<Record<Team, string>>;
  /** Clan de la FW-Team 1 (violet) : le bilan complet range chaque joueur dans son équipe. */
  readonly team1Tag: string;
  /** Le clan de chaque équipe (qui a rejoint sa team ?). */
  readonly teamTags: Readonly<Record<Team, string>>;
  /** La bannière en haut de la fiche d'inscription (image du site), HDV 18. */
  readonly bannerUrl: string;
  /** Les bannières d'un autre HDV : prise quand le format de la soirée le dit (« HDV 19 … »). */
  readonly bannerByTh?: Readonly<Record<number, string>>;
}

/**
 * La bannière de la fiche : celle de l'HDV du format (« HDV 19 mode e-sport »),
 * sinon du plus haut HDV accepté (« Mode e-sport », « FULL HDV18 et HDV19 » → 19),
 * comme le grand HDV de l'affiche. Pas de bannière pour cet HDV : celle par défaut.
 */
export function sheetBanner(
  cfg: Pick<FwConfig, 'bannerUrl' | 'bannerByTh'>,
  details: { readonly format: string; readonly accepted?: string },
): string {
  const fromFormat = Number(/HDV\s*(\d+)/i.exec(details.format)?.[1]);
  const accepted = [...(details.accepted ?? '').matchAll(/\d+/g)].map((m) => Number(m[0]));
  const th = fromFormat || (accepted.length ? Math.max(...accepted) : 0);
  return cfg.bannerByTh?.[th] ?? cfg.bannerUrl;
}

/** « #2CYJPRCG8 » → le lien qui ouvre ce clan dans le jeu. */
export function clanLink(tag: string | undefined): string {
  return tag
    ? `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${tag.replace('#', '')}`
    : '';
}

/** Les réglages du serveur Discord (wrangler.jsonc), lus une fois par requête. */
export function fwConfig(env: {
  DISCORD_CHANNEL_INSCRIPTION?: string;
  DISCORD_CHANNEL_ANNONCE_FW?: string;
  DISCORD_CHANNEL_TICKETS?: string;
  DISCORD_ROLE_FW?: string;
  DISCORD_CHANNEL_FW_RESULTATS?: string;
  FW_FIRST_NUMBER?: string;
  FW_CLANS?: string;
  SITE_URL?: string;
}): FwConfig {
  // FW_CLANS : FW-Team 1 puis FW-Team 2.
  const [team1, team2] = (env.FW_CLANS ?? '').split(',').map((t) => t.trim());
  return {
    signupChannel: env.DISCORD_CHANNEL_INSCRIPTION ?? '',
    announceChannel: env.DISCORD_CHANNEL_ANNONCE_FW ?? '',
    ticketsChannel: env.DISCORD_CHANNEL_TICKETS ?? '',
    role: env.DISCORD_ROLE_FW ?? '',
    resultsChannel: env.DISCORD_CHANNEL_FW_RESULTATS ?? '',
    firstNumber: Number(env.FW_FIRST_NUMBER) || 1,
    clanLinks: { violet: clanLink(team1), vert: clanLink(team2) },
    team1Tag: team1 ?? '',
    teamTags: { violet: team1 ?? '', vert: team2 ?? '' },
    // ?v= : à changer quand l'image change (Discord garde l'ancienne en mémoire).
    bannerUrl: env.SITE_URL ? `${env.SITE_URL}/brand/discord/fw-inscriptions.jpg?v=1` : '',
    bannerByTh: env.SITE_URL ? { 19: `${env.SITE_URL}/brand/discord/fw-inscriptions-19.jpg?v=1` } : {},
  };
}

/** Ce dont la gestion des soirées a besoin (le bot, ou la tâche de chaque minute). */
export type FwDeps = Pick<BotContext, 'db' | 'discord' | 'fw' | 'random' | 'now' | 'capture'>;

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
const done = (content: string): Reply => ({ content, ephemeral: true });

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

/** « mercredi 28/10 à 21h00 ». */
const when = (e: Evening) => `${dayLabel(e.startsAt)} à ${sessionClocks(e.startsAt).start}`;

const TEAM_DOT: Record<Team, string> = { violet: '🟣', vert: '🟢' };

const TEST_BANNER = '🧪 **ESSAI** : rien n’est envoyé aux joueurs (pas de ping).';

// ------------------------------------------------------------ messages

/** L'icône de l'HDV (émoji de l'application « th18 »), sinon « HDV18 ». */
function thIcon(townHall: number | null, emojis: ReadonlyMap<string, string>): string {
  if (!townHall) return '`HDV ?`';
  const id = emojis.get(`th${townHall}`);
  return id ? `<:th${townHall}:${id}>` : `\`HDV${townHall}\``;
}

function roster(players: readonly Signup[], emojis: ReadonlyMap<string, string>): string[] {
  if (players.length === 0) return ['_Personne pour l’instant._'];
  return players.map((p) => `${thIcon(p.townHall, emojis)} ${escapeMarkdown(p.name)}`);
}

/** Coupe une liste trop longue pour Discord (2 000 caractères) : « … et 12 autres ». */
function fit(header: string, sections: { title: string; lines: string[] }[]): string {
  const budget = 1950 - header.length;
  const perSection = Math.floor(budget / Math.max(1, sections.length));
  const parts = sections.map(({ title, lines }) => {
    const kept: string[] = [];
    let used = title.length + 1;
    for (const line of lines) {
      if (used + line.length + 1 > perSection - 20) break;
      kept.push(line);
      used += line.length + 1;
    }
    const rest = lines.length - kept.length;
    return [title, ...kept, ...(rest ? [`… et ${rest} autre${rest > 1 ? 's' : ''}`] : [])].join(
      '\n',
    );
  });
  return [header, ...parts].join('\n\n');
}

/** La fiche d'inscription, dans #inscription : les infos, les inscrits, les boutons. */
export function signupMessage(
  e: Evening,
  signups: readonly Signup[],
  emojis: ReadonlyMap<string, string>,
  cfg: FwConfig,
): Reply {
  return e.sheetV2 ? blocksSheet(e, signups, emojis, cfg) : plainSheet(e, signups, emojis);
}

/** Barre de couleur de la fiche : violet Friendly Wars, gris une fois la soirée finie. */
const SHEET_ACCENT = 0x8b3dff;
const SHEET_DONE = 0x3b3540;
/** Place du texte des listes (Discord : 4 000 caractères pour tout le message). */
const LIST_BUDGET = 3200;

/**
 * Où en est ce compte : ✅ dans le clan de sa team, ⚠️ dans celui de l'autre
 * team, ⏳ dans aucun des deux (ou pas encore vérifié).
 */
export function presenceMark(s: Pick<Signup, 'team' | 'inClan'>): string {
  if (!s.team) return '';
  if (s.inClan === s.team) return '✅';
  if (s.inClan === 'violet' || s.inClan === 'vert') return '⚠️';
  return '⏳';
}

/** « > ✅ [HDV18] {FR}♠Syfy · @Syfy » : le pseudo du jeu ET la personne sur Discord. */
function playerLine(s: Signup, emojis: ReadonlyMap<string, string>, presence: boolean): string {
  const mark = presence ? `${presenceMark(s)} ` : '';
  return `> ${mark}${thIcon(s.townHall, emojis)} ${escapeMarkdown(s.name)} · <@${s.discordId}>`;
}

/** Un titre et ses joueurs, coupé avant de dépasser `budget` caractères. */
function playerBlock(
  title: string,
  players: readonly Signup[],
  emojis: ReadonlyMap<string, string>,
  presence: boolean,
  budget: number,
): string {
  const lines: string[] = [];
  let used = title.length;
  let cut = 0;
  for (const p of players) {
    const line = playerLine(p, emojis, presence);
    if (used + line.length + 1 > budget) {
      cut++;
      continue;
    }
    lines.push(line);
    used += line.length + 1;
  }
  if (!players.length) lines.push('-# Personne pour l’instant.');
  if (cut) lines.push(`> … et ${cut} autre${cut > 1 ? 's' : ''}`);
  return [title, ...lines].join('\n');
}

/**
 * La fiche « en blocs » : la bannière, la date, puis chaque équipe avec, pour
 * chaque compte, son pseudo du jeu, la personne sur Discord (mentionnée sans
 * être notifiée) et s'il a rejoint le clan de sa team. Les boutons sont dans le
 * cadre. Le lien pour rejoindre le clan n'est PAS ici : il arrive avec
 * l'annonce des équipes (teamsNotice).
 */
function blocksSheet(
  e: Evening,
  signups: readonly Signup[],
  emojis: ReadonlyMap<string, string>,
  cfg: FwConfig,
): Reply {
  const c = sessionClocks(e.startsAt);
  const start = Math.floor(e.startsAt / 1000);
  const status = e.cancelled
    ? '❌ **Soirée annulée.**'
    : e.closed
      ? '✅ **Soirée terminée : merci à tous !**'
      : `Inscriptions jusqu’à **${c.close}** · début <t:${start}:R>`;
  const how = e.closed
    ? null
    : e.mode === 'libre'
      ? `-# Clique sur ta team pour t’inscrire. Plusieurs comptes autorisés. ` +
        `Le lien du clan de ta team arrive à **${c.teams}**, avec l’annonce des équipes.`
      : `-# Tirage des équipes à **${c.teams}**. Plusieurs comptes ? « Ajouter un compte ».`;

  const teams = e.mode === 'libre' || e.teamsAt !== null;
  const byTeam = (t: Team) => signups.filter((s) => s.team === t);
  const lists = teams
    ? TEAMS.map((t) =>
        playerBlock(
          `### ${TEAM_DOT[t]} ${TEAM_LABEL[t]} · ${byTeam(t).length}`,
          byTeam(t),
          emojis,
          true,
          LIST_BUDGET / 2,
        ),
      )
    : [playerBlock(`### Inscrits · ${signups.length}`, signups, emojis, false, LIST_BUDGET)];
  // Inscrits sans équipe après le tirage (cas rare) : listés à part.
  const loose = signups.filter((s) => s.team === null);
  if (teams && loose.length) lists.push(playerBlock('### Sans équipe', loose, emojis, false, 400));
  const legend =
    teams && signups.some((s) => s.team)
      ? '-# ✅ dans le clan de sa team · ⏳ pas encore · ⚠️ dans le clan de l’autre team'
      : null;

  const banner = sheetBanner(cfg, e.details);
  return {
    content: '',
    v2: true,
    components: [
      container(e.closed ? SHEET_DONE : SHEET_ACCENT, [
        e.test && textBlock(TEST_BANNER),
        banner && gallery(banner),
        textBlock(`## 📝 FW #${e.number} · ${when(e)}\n${status}`),
        how && textBlock(how),
        separator(),
        ...lists.map((l) => textBlock(l)),
        legend && textBlock(legend),
        !e.closed && separator(),
        !e.closed && row(signupButtons(e)),
      ]),
    ],
  };
}

/** L'ancienne fiche (texte simple), gardée pour les soirées lancées avant la nouvelle. */
function plainSheet(
  e: Evening,
  signups: readonly Signup[],
  emojis: ReadonlyMap<string, string>,
): Reply {
  const c = sessionClocks(e.startsAt);
  const d = e.details;
  const status = e.cancelled
    ? '❌ **Soirée annulée.**'
    : e.closed
      ? '✅ **Soirée terminée : merci à tous !**'
      : null;
  // Court : le titre, puis les équipes (les infos sont sur l'affiche, dans #annonce-fw).
  const header = [
    ...(e.test ? [TEST_BANNER] : []),
    `📝 **FW #${e.number}** · ${when(e)}`,
    ...(status ? [status] : []),
  ].join('\n');

  const byTeam = (t: Team) => signups.filter((s) => s.team === t);
  const teams = e.mode === 'libre' || e.teamsAt !== null;
  const sections = teams
    ? (['violet', 'vert'] as const).map((t) => ({
        title: `${TEAM_DOT[t]} **${TEAM_LABEL[t]} (${byTeam(t).length})**`,
        lines: roster(byTeam(t), emojis),
      }))
    : [{ title: `**Inscrits (${signups.length})**`, lines: roster(signups, emojis) }];
  // Inscrits sans équipe après le tirage (cas rare) : listés à part.
  const loose = signups.filter((s) => s.team === null);
  if (teams && loose.length)
    sections.push({ title: '**Sans équipe**', lines: roster(loose, emojis) });

  return {
    content: fit(header, sections),
    components: e.closed ? [] : [{ type: ComponentType.Row, components: signupButtons(e) }],
  };
}

/** Les boutons de la fiche. Le lien du clan, lui, arrive avec l'annonce des équipes. */
function signupButtons(e: Evening): unknown[] {
  const buttons =
    e.mode === 'random'
      ? [
          button(`fw:join:${e.id}`, "Je m'inscris", ButtonStyle.Success, '✅'),
          button(`fw:add:${e.id}`, 'Ajouter un compte', ButtonStyle.Primary, '➕'),
        ]
      : [
          button(`fw:join:${e.id}:violet`, TEAM_LABEL.violet, ButtonStyle.Primary, '🟣'),
          button(`fw:join:${e.id}:vert`, TEAM_LABEL.vert, ButtonStyle.Success, '🟢'),
        ];
  return [...buttons, button(`fw:leave:${e.id}`, 'Me désinscrire', ButtonStyle.Secondary)];
}

/** Les boutons qui ouvrent le clan de ces équipes dans le jeu, pour le rejoindre. */
function linkButtons(teams: readonly Team[], cfg: FwConfig): unknown[] {
  return teams
    .filter((t) => cfg.clanLinks[t])
    .map((t) => ({
      type: ComponentType.Button,
      style: ButtonStyle.Link,
      label: `Rejoindre la ${TEAM_LABEL[t]}`,
      url: cfg.clanLinks[t],
      emoji: { name: TEAM_DOT[t] },
    }));
}

const TEAMS = ['violet', 'vert'] as const;

function button(customId: string, label: string, style: number, emoji?: string) {
  return {
    type: ComponentType.Button,
    custom_id: customId,
    label,
    style,
    ...(emoji ? { emoji: { name: emoji } } : {}),
  };
}

/**
 * L'annonce dans #annonce-fw : la fiche en image, le ping du rôle et les
 * « INFORMATIONS @FW » (texte des organisateurs). La fiche d'inscription, elle,
 * est dans #inscription.
 */
export function announceMessage(e: Evening, cfg: FwConfig, png: Uint8Array | null): Reply {
  const c = sessionClocks(e.startsAt);
  return {
    content: [
      ...(e.test ? [TEST_BANNER] : []),
      // « INFORMATIONS @FW » : le rôle pingué fait partie du titre.
      `**INFORMATIONS** <@&${cfg.role}>`,
      `・ <#${cfg.signupChannel}> ouvertes jusqu’à **${c.close}**.`,
      e.mode === 'random'
        ? `・ Tirage des équipes à **${c.teams}**`
        : `・ Équipes au choix, affichées à **${c.teams}**`,
      '・ Plusieurs comptes autorisés par joueur',
      `・ En cas de difficulté, ouvrez un <#${cfg.ticketsChannel}>`,
    ].join('\n'),
    // En essai, le rôle est écrit mais personne n'est notifié.
    ...(e.test ? {} : { mentionRoles: [cfg.role] }),
    ...(png ? { files: [{ name: `fw-${e.number}.png`, data: png }] } : {}),
  };
}

/**
 * Passe la fiche d'une soirée lancée avant la nouvelle fiche au nouveau design
 * (/fw modifier). D'abord sur le même message (Discord le permet, sans retour
 * possible) ; s'il refuse, la nouvelle fiche est postée dans le même salon et
 * l'ancienne dit qu'elle est remplacée (rien n'est supprimé).
 */
export async function upgradeSheet(
  deps: FwDeps,
  e: Evening,
): Promise<'converted' | 'reposted' | 'failed'> {
  if (e.sheetV2 || !e.signup || !deps.discord) return 'failed';
  const [signups, emojis] = await Promise.all([signupsOf(deps.db, e.id), deps.discord.emojis()]);
  const sheet = signupMessage({ ...e, sheetV2: true }, signups, emojis, deps.fw);
  if (await deps.discord.edit(e.signup.channel, e.signup.message, sheet)) {
    await setSheetV2(deps.db, e.id, true);
    return 'converted';
  }
  const posted = await deps.discord.send(e.signup.channel, sheet);
  if (!posted) return 'failed';
  await deps.discord.edit(e.signup.channel, e.signup.message, {
    content: `📝 **FW #${e.number}** : cette fiche est remplacée par la nouvelle, juste en dessous.`,
    components: [],
  });
  await saveMessages(deps.db, e.id, {
    signup: { channel: e.signup.channel, message: posted },
    announce: e.announce,
  });
  await setSheetV2(deps.db, e.id, true);
  return 'reposted';
}

/** Met à jour la fiche d'inscription (après chaque inscription, tirage, bilan…). */
export async function refreshSignup(deps: FwDeps, eveningId: number): Promise<void> {
  const e = await getEvening(deps.db, eveningId);
  if (!e?.signup || !deps.discord) return;
  const [signups, emojis] = await Promise.all([signupsOf(deps.db, e.id), deps.discord.emojis()]);
  await deps.discord.edit(
    e.signup.channel,
    e.signup.message,
    signupMessage(e, signups, emojis, deps.fw),
  );
}

/** La fiche en image (le site la dessine, un navigateur la photographie). */
async function posterOf(deps: FwDeps, e: Evening): Promise<Uint8Array | null> {
  try {
    const query = sessionPosterQuery({
      number: e.number,
      date: e.date,
      time: e.time,
      mode: e.mode,
      details: e.details,
    });
    const [png] = await deps.capture([{ kind: 'evening', query }]);
    return png;
  } catch (error) {
    console.error('Capture de la fiche impossible', error);
    return null;
  }
}

// ------------------------------------------------------------ équipes

/**
 * Fait les équipes : en « random », tirage au hasard de tous les inscrits
 * (`redraw` : on recommence même s'il était déjà fait) ; en « libre », chacun
 * a déjà la sienne. La fiche est mise à jour ; la 1re fois, un message
 * prévient dans #inscription que les équipes sont prêtes.
 */
export async function makeTeams(deps: FwDeps, e: Evening, redraw: boolean): Promise<void> {
  const first = e.teamsAt === null;
  if (e.mode === 'random' && (first || redraw)) {
    const signups = await signupsOf(deps.db, e.id);
    const drawn = drawTeams(
      signups.map((s) => s.tag),
      deps.random,
    );
    await setTeams(deps.db, e.id, drawn);
  }
  if (first) await markTeams(deps.db, e.id, deps.now());
  await refreshSignup(deps, e.id);
  if ((first || redraw) && e.signup && deps.discord) {
    await deps.discord.send(
      e.signup.channel,
      teamsNotice(e, await signupsOf(deps.db, e.id), deps.fw, first),
    );
  }
}

/**
 * Le rappel « équipes prêtes » : chaque joueur est mentionné sous son équipe
 * (il est notifié, surtout utile quand les équipes sont tirées au sort), avec
 * les boutons pour rejoindre le clan de chaque équipe. En essai aussi : seuls
 * les inscrits (les testeurs) sont notifiés, jamais le rôle.
 */
export function teamsNotice(
  e: Evening,
  signups: readonly Signup[],
  cfg: FwConfig,
  first: boolean,
): Reply {
  const lines = [
    `⚔️ **Les équipes de la FW #${e.number} sont ${first ? 'prêtes' : 'refaites'} !** ` +
      'Clique sur le bouton de ta team pour rejoindre son clan.',
  ];
  const mentioned = new Set<string>();
  for (const t of TEAMS) {
    const ids = [...new Set(signups.filter((s) => s.team === t).map((s) => s.discordId))];
    ids.forEach((id) => mentioned.add(id));
    lines.push(
      '',
      `${TEAM_DOT[t]} **${TEAM_LABEL[t]}**`,
      ids.length ? ids.map((id) => `<@${id}>`).join(' ') : '_Personne._',
    );
  }
  lines.push('', 'Rééquilibrages possibles par les modos.');
  const links = linkButtons(TEAMS, cfg);
  return {
    content: lines.join('\n'),
    ...(links.length ? { components: [{ type: ComponentType.Row, components: links }] } : {}),
    mentionUsers: [...mentioned].slice(0, 100),
  };
}

// ------------------------------------------------------------ commande /fw

type Options = Map<string, string | number>;

export async function fwCommand(
  interaction: Interaction,
  ctx: BotContext,
  sub: string,
  options: Options,
): Promise<Reply> {
  try {
    if (!isManager(interaction.member!, ctx.managerRoles)) {
      fail('Les commandes /fw sont réservées aux admins et aux modos.');
    }
    if (!ctx.discord) {
      fail(
        "Le bot ne peut pas encore poster en son nom : son jeton n'est pas enregistré sur le " +
          'serveur (secret DISCORD_BOT_TOKEN).',
      );
    }
    switch (sub) {
      case 'lancer':
        return await launch(interaction, ctx, options);
      case 'modifier':
        return await modify(ctx, options);
      case 'equipes':
        return await teamsCommand(ctx, options);
      case 'deplacer':
        return await move(ctx, options);
      case 'bilan':
        return await recap(ctx);
      case 'bilan-complet':
        return await fullRecap(ctx, options);
      case 'annuler':
        return await cancel(ctx);
    }
    return fail('Commande inconnue.');
  } catch (error) {
    if (error instanceof FwError) return oops(error.message);
    throw error;
  }
}

/** Suggestions pour `/fw deplacer compte:` : les comptes inscrits à la soirée en cours. */
export async function fwAutocomplete(ctx: BotContext, typed: string): Promise<Choice[]> {
  const e = await currentEvening(ctx.db);
  if (!e) return [];
  const query = typed.toLowerCase();
  return (await signupsOf(ctx.db, e.id))
    .map((s) => ({
      name: `${s.name} (${s.team ? TEAM_LABEL[s.team] : 'sans équipe'})`.slice(0, 100),
      value: s.tag,
    }))
    .filter((c) => c.name.toLowerCase().includes(query) || c.value.toLowerCase().includes(query))
    .slice(0, 25);
}

const text = (options: Options, name: string) => String(options.get(name) ?? '').trim();

/** Les infos de la fiche : celles tapées dans la commande, sinon `base`. */
function detailsFrom(options: Options, base: SessionDetails): SessionDetails {
  const pick = (name: string, fallback: string) => text(options, name) || fallback;
  return {
    format: pick('format', base.format),
    preparation: pick('preparation', base.preparation),
    war: pick('guerre', base.war),
    attacks: pick('attaques', base.attacks),
    rounds: pick('rounds', base.rounds),
    accepted: pick('hdv', base.accepted),
  };
}

function schedule(ctx: BotContext, rawDate: string, rawTime: string) {
  const date = normalizeDate(rawDate) ?? fail('Date illisible : écris-la comme ceci, 28/10.');
  const time = normalizeTime(rawTime) ?? fail('Heure illisible : écris-la comme ceci, 21h00.');
  const startsAt = franceDateTime(date, time, new Date(ctx.now()))!;
  if (startsAt < ctx.now() - 60 * 60 * 1000) fail(`Le ${date} à ${time} est déjà passé.`);
  return { date, time, startsAt };
}

async function launch(interaction: Interaction, ctx: BotContext, options: Options): Promise<Reply> {
  const discord = ctx.discord!;
  const test = text(options, 'test') === 'oui';
  // En essai, tout va dans le salon où la commande est tapée.
  const here = interaction.channel_id ?? fail('Salon inconnu : tape la commande dans un salon.');
  const signupChannel = test ? here : ctx.fw.signupChannel;
  const announceChannel = test ? here : ctx.fw.announceChannel;
  const { date, time, startsAt } = schedule(ctx, text(options, 'date'), text(options, 'heure'));
  const mode: TeamMode = text(options, 'equipes') === 'libre' ? 'libre' : 'random';
  const typedNumber = Number(options.get('numero') ?? 0);
  const number = typedNumber > 0 ? typedNumber : await nextNumber(ctx.db, ctx.fw.firstNumber);

  const id = await createEvening(ctx.db, {
    number,
    startsAt,
    date,
    time,
    mode,
    details: detailsFrom(options, DEFAULT_DETAILS),
    createdBy: displayName(interaction.member!),
    test,
  });
  const e = (await getEvening(ctx.db, id))!;

  const emojis = await discord.emojis();
  const png = await posterOf(ctx, e);
  const postSignup = async () => {
    const posted = await discord.send(signupChannel, signupMessage(e, [], emojis, ctx.fw));
    if (posted || !e.sheetV2) return posted;
    // Fiche « en blocs » refusée par Discord : l'ancienne fiche plutôt que pas de soirée.
    await setSheetV2(ctx.db, e.id, false);
    return discord.send(signupChannel, signupMessage({ ...e, sheetV2: false }, [], emojis, ctx.fw));
  };
  const postAnnounce = () => discord.send(announceChannel, announceMessage(e, ctx.fw, png));
  // Pour de vrai : la fiche d'inscription d'abord, et l'annonce (avec le ping)
  // seulement si la fiche est bien là. En essai (un seul salon) : l'annonce
  // d'abord, pour que la fiche, tenue à jour, reste en dessous.
  let signupId: string | null;
  let announceId: string | null = null;
  if (test) {
    announceId = await postAnnounce();
    signupId = await postSignup();
  } else {
    signupId = await postSignup();
    if (signupId) announceId = await postAnnounce();
  }
  if (!signupId) {
    await cancelEvening(ctx.db, id);
    fail(
      `Impossible de poster dans <#${signupChannel}> : vérifie que le bot voit ce salon ` +
        'et peut y écrire (« Voir le salon », « Envoyer des messages », « Joindre des ' +
        'fichiers »). Rien n’a été annoncé.',
    );
  }
  await saveMessages(ctx.db, id, {
    signup: { channel: signupChannel, message: signupId! },
    announce: announceId ? { channel: announceChannel, message: announceId } : null,
  });

  return done(
    (test ? '🧪 Essai : ' : '') +
      `✅ **FW #${number}** lancée pour le ${when(e)} : fiche d'inscription dans ` +
      `<#${signupChannel}>` +
      (announceId
        ? `, annonce dans <#${announceChannel}>.`
        : `. ⚠️ L'annonce n'a pas pu être postée dans <#${announceChannel}> (droits du bot ?).`) +
      (test ? '\nQuand tu as fini : `/fw annuler` (ou `/fw bilan`, posté ici aussi).' : '') +
      (png ? '' : '\n_La fiche en image n’a pas pu être générée : réessaie avec /fw modifier._') +
      '\nUne info à corriger ? `/fw modifier`.',
  );
}

async function current(ctx: BotContext): Promise<Evening> {
  return (
    (await currentEvening(ctx.db)) ??
    fail("Aucune FW n'est en cours : lance-en une avec /fw lancer.")
  );
}

async function modify(ctx: BotContext, options: Options): Promise<Reply> {
  const e = await current(ctx);
  const { date, time, startsAt } =
    text(options, 'date') || text(options, 'heure')
      ? schedule(ctx, text(options, 'date') || e.date, text(options, 'heure') || e.time)
      : { date: e.date, time: e.time, startsAt: e.startsAt };
  const typedMode = text(options, 'equipes');
  const mode: TeamMode = typedMode === 'libre' || typedMode === 'random' ? typedMode : e.mode;
  const typedNumber = Number(options.get('numero') ?? 0);
  await updateEvening(ctx.db, e.id, {
    number: typedNumber > 0 ? typedNumber : e.number,
    startsAt,
    date,
    time,
    mode,
    details: detailsFrom(options, e.details),
  });
  const updated = (await getEvening(ctx.db, e.id))!;

  // Fiche d'inscription manquante (le bot n'avait pas pu poster dans
  // #inscription) : on la poste maintenant, sans refaire l'annonce ni le ping.
  if (!updated.signup) {
    const posted = await ctx.discord!.send(
      ctx.fw.signupChannel,
      signupMessage(updated, await signupsOf(ctx.db, e.id), await ctx.discord!.emojis(), ctx.fw),
    );
    if (!posted) {
      fail(
        `Impossible de poster dans <#${ctx.fw.signupChannel}> : vérifie que le bot voit ce ` +
          'salon et peut y écrire.',
      );
    }
    await saveMessages(ctx.db, e.id, {
      signup: { channel: ctx.fw.signupChannel, message: posted! },
      announce: updated.announce,
    });
    return done(
      `✅ Fiche d'inscription de la **FW #${updated.number}** postée dans ` +
        `<#${ctx.fw.signupChannel}> (sans nouveau ping).`,
    );
  }

  // Soirée lancée avec l'ancienne fiche : elle passe au nouveau design.
  const upgraded = !updated.sheetV2 ? await upgradeSheet(ctx, updated) : null;
  await refreshSignup(ctx, e.id);
  // Rien de changé (juste /fw modifier pour passer au nouveau design) : on ne
  // retouche pas l'annonce, elle serait marquée « (modifié) » pour rien.
  if (updated.announce && options.size > 0) {
    const png = await posterOf(ctx, updated);
    // Modifier l'annonce ne notifie pas le rôle une seconde fois.
    await ctx.discord!.edit(
      updated.announce.channel,
      updated.announce.message,
      announceMessage(updated, ctx.fw, png),
    );
  }
  const n = updated.number;
  if (upgraded === 'converted')
    return done(`✅ Fiche de la **FW #${n}** passée au nouveau design.`);
  if (upgraded === 'reposted') {
    return done(
      `✅ Nouvelle fiche de la **FW #${n}** postée dans <#${updated.signup.channel}> ` +
        '(l’ancienne indique qu’elle est remplacée).',
    );
  }
  if (upgraded === 'failed') {
    return done(
      `⚠️ La fiche de la **FW #${n}** n’a pas pu passer au nouveau design : Discord a refusé. ` +
        'Elle reste comme avant et fonctionne normalement.',
    );
  }
  return done(`✅ Fiche de la **FW #${n}** mise à jour (${when(updated)}).`);
}

async function teamsCommand(ctx: BotContext, options: Options): Promise<Reply> {
  const e = await current(ctx);
  const redraw = text(options, 'refaire') === 'oui';
  await makeTeams(ctx, e, redraw);
  return done(
    e.mode === 'random'
      ? `✅ Équipes de la FW #${e.number} ${redraw || e.teamsAt === null ? 'tirées au hasard' : 'republiées'}.`
      : `✅ Équipes de la FW #${e.number} affichées (chacun a choisi la sienne).`,
  );
}

async function move(ctx: BotContext, options: Options): Promise<Reply> {
  const e = await current(ctx);
  if (e.mode === 'random' && e.teamsAt === null) {
    fail('Les équipes ne sont pas encore faites : `/fw equipes` pour les tirer maintenant.');
  }
  const tag = text(options, 'compte');
  const team: Team = text(options, 'equipe') === 'vert' ? 'vert' : 'violet';
  const signup =
    (await signupsOf(ctx.db, e.id)).find((s) => s.tag === tag) ??
    fail('Ce compte n’est pas inscrit à la FW en cours (choisis-le dans la liste).');
  await setTeams(ctx.db, e.id, new Map([[signup.tag, team]]));
  await refreshSignup(ctx, e.id);
  return done(`✅ **${escapeMarkdown(signup.name)}** passe dans la ${TEAM_LABEL[team]}.`);
}

/**
 * Le bilan : top 5 de la soirée dans #résultats ; la soirée est finie.
 * Sans soirée en cours, republie celui de la dernière (image ratée, bilan à refaire).
 */
async function recap(ctx: BotContext): Promise<Reply> {
  const e =
    (await currentEvening(ctx.db)) ??
    (await lastFinishedEvening(ctx.db)) ??
    fail("Aucune FW n'est en cours : lance-en une avec /fw lancer.");
  const now = ctx.now();
  const { wars, lines } = await eveningLines(ctx.db, e, now);
  if (wars === 0) fail('Aucune FW de cette soirée n’a encore été enregistrée : rien à publier.');
  const ranked = rankPlayers(lines);
  // Le tableau du top 5 en image (le site le dessine, un navigateur le
  // photographie) ; à défaut, le bilan en texte.
  let png: Uint8Array | null = null;
  try {
    const query = recapQuery({
      number: e.number,
      day: dayLabel(e.startsAt),
      wars,
      attacks: lines.reduce((sum, l) => sum + l.attacks, 0),
      triples: lines.reduce((sum, l) => sum + (l.triples ?? 0), 0),
      top: ranked.slice(0, 5).map((p) => ({
        name: p.name,
        th: p.townHall,
        spa: p.starsPerAttack,
        attacks: p.attacks,
        destruction: p.destruction,
        triples: p.triples,
      })),
    });
    [png] = await ctx.capture([{ kind: 'recap', query }]);
  } catch (error) {
    console.error('Image du bilan impossible', error);
  }
  const link = `${ctx.siteUrl}/joueurs?type=fw&semaine=${weekOf(e.startsAt)}`;
  const content = png
    ? `🌙 **Bilan de la FW #${e.number}** · 📊 Toutes les stats : ${link}`
    : eveningRecapText(e, wars, ranked, ctx.siteUrl);
  // En essai, le bilan reste dans le salon de l'essai.
  const channel = e.test && e.signup ? e.signup.channel : ctx.fw.resultsChannel;
  const posted = await ctx.discord!.send(channel, {
    content: e.test ? `${TEST_BANNER}\n${content}` : content,
    ...(png ? { files: [{ name: `bilan-fw-${e.number}.png`, data: png }] } : {}),
  });
  if (!posted) fail(`Impossible de poster dans <#${channel}> (droits du bot ?).`);
  if (e.closed) return done(`✅ Bilan de la FW #${e.number} republié dans <#${channel}>.`);
  await closeEvening(ctx.db, e.id, now);
  await refreshSignup(ctx, e.id);
  return done(`✅ Bilan de la FW #${e.number} publié dans <#${channel}>.`);
}

/**
 * Le bilan COMPLET d'une soirée, en image : chaque FW, puis chaque joueur des
 * deux équipes avec chacune de ses attaques et ses totaux. Posté dans le salon
 * où la commande est tapée, et nulle part ailleurs ; la soirée n'est pas
 * fermée (c'est le rôle de /fw bilan). Sans numéro : la soirée en cours,
 * sinon la dernière finie.
 */
async function fullRecap(ctx: BotContext, options: Options): Promise<Reply> {
  const n = Number(options.get('numero')) || 0;
  const e = n
    ? ((await eveningByNumber(ctx.db, n)) ?? fail(`Pas de FW #${n} (ou elle a été annulée).`))
    : ((await currentEvening(ctx.db)) ??
      (await lastFinishedEvening(ctx.db)) ??
      fail("Aucune FW pour l'instant : lance-en une avec /fw lancer."));
  if (!ctx.fw.team1Tag) fail('Clan de la FW-Team 1 inconnu (réglage FW_CLANS).');
  const name = e.test ? "de l'essai" : `de la FW #${e.number}`;
  const { wars, players } = await eveningWarDetails(ctx.db, e, ctx.now());
  if (wars.length === 0) fail(`Aucune FW ${name} n'a été enregistrée : rien à montrer.`);
  const full = buildFullRecap(
    { number: e.number, day: dayLabel(e.startsAt) },
    wars,
    players,
    ctx.fw.team1Tag,
  );
  let png: Uint8Array | null = null;
  try {
    [png] = await ctx.capture([
      { kind: 'fullRecap', query: fullRecapQuery(full), wars: full.wars.length },
    ]);
  } catch (error) {
    console.error('Image du bilan complet impossible', error);
  }
  if (!png) fail("Impossible de créer l'image pour le moment. Réessaie dans une minute.");
  return {
    content: `📋 **Bilan complet ${name}** · ${dayLabel(e.startsAt)}`,
    files: [{ name: `bilan-complet-fw-${e.number}.png`, data: png! }],
    publicFollowUp: true,
  };
}

async function cancel(ctx: BotContext): Promise<Reply> {
  const e = await current(ctx);
  await cancelEvening(ctx.db, e.id);
  await refreshSignup(ctx, e.id);
  return done(`🗑️ La FW #${e.number} du ${when(e)} est annulée.`);
}

// ------------------------------------------------------------ boutons et formulaire

/** Un clic sous la fiche, un choix dans la liste, ou le formulaire du tag. */
export async function fwComponent(
  interaction: Interaction,
  ctx: BotContext,
): Promise<ComponentResponse> {
  const [scope, action, rawId, rawTeam] = (interaction.data?.custom_id ?? '').split(':');
  try {
    if (scope !== 'fw' || !interaction.member) fail('Bouton inconnu.');
    const e = (await getEvening(ctx.db, Number(rawId))) ?? fail('Soirée introuvable.');
    const member = interaction.member!;
    const who = { id: member.user.id, name: displayName(member) };
    const team: Team | null = rawTeam === 'violet' || rawTeam === 'vert' ? rawTeam : null;

    if (action === 'leave') return { kind: 'reply', reply: await leave(ctx, e, who.id) };
    if (e.closed) fail(`La FW #${e.number} est terminée.`);
    if (e.mode === 'libre' && !team && action !== 'tag') {
      // Ancien bouton, ou mode changé entre-temps : on demande de choisir l'équipe.
      fail('Choisis ton équipe avec les boutons violet ou vert sous la fiche.');
    }
    switch (action) {
      case 'join':
        return await join(ctx, e, who, team);
      case 'add':
        return { kind: 'modal', modal: tagModal(e, team) };
      case 'pick':
        return {
          kind: 'update',
          reply: await pick(ctx, e, who, team, interaction.data?.values ?? []),
        };
      case 'tag':
        return tagSubmitted(ctx, e, who, team, interaction);
    }
    return fail('Bouton inconnu.');
  } catch (error) {
    if (error instanceof FwError) return { kind: 'reply', reply: oops(error.message) };
    throw error;
  }
}

/**
 * L'équipe d'un compte qui s'inscrit : celle du bouton (libre) ; en random,
 * aucune avant le tirage, la moins remplie après (arrivée en cours de route).
 */
async function teamFor(ctx: BotContext, e: Evening, team: Team | null): Promise<Team | null> {
  if (e.mode === 'libre') return team;
  if (e.teamsAt === null) return null;
  const signups = await signupsOf(ctx.db, e.id);
  const count = (t: Team) => signups.filter((s) => s.team === t).length;
  return smallerTeam(count('violet'), count('vert'), ctx.random);
}

/** Après chaque changement, la fiche d'inscription suit (en arrière-plan). */
function refreshLater(ctx: BotContext, e: Evening): void {
  ctx.background(refreshSignup(ctx, e.id));
}

/**
 * Comptes déjà connus qu'on vient d'inscrire : leur HDV est relu dans le jeu,
 * sinon un compte garderait l'HDV de son premier ajout (HDV 18 alors qu'il est
 * passé 19). En arrière-plan, puis la fiche suit : le clic répond tout de suite.
 * Jeu injoignable : on garde ce qu'on a.
 */
function refreshAfterSignup(ctx: BotContext, e: Evening, added: readonly Account[]): void {
  if (!added.length) return refreshLater(ctx, e);
  ctx.background(
    (async () => {
      const found = await Promise.all(added.map((a) => ctx.coc.player(a.tag)));
      for (const [i, f] of found.entries()) {
        const a = added[i];
        if (f.ok && (f.value.townHall !== a.townHall || f.value.name !== a.name)) {
          await refreshPlayer(ctx.db, e.id, { ...f.value, tag: a.tag });
        }
      }
      await refreshSignup(ctx, e.id);
    })(),
  );
}

const mine = async (ctx: BotContext, e: Evening, who: Who) =>
  (await signupsOf(ctx.db, e.id)).filter((s) => s.discordId === who.id);

/** « Je m'inscris » (ou « FW-Team 1 / FW-Team 2 »). */
async function join(
  ctx: BotContext,
  e: Evening,
  who: Who,
  team: Team | null,
): Promise<ComponentResponse> {
  const accounts = await accountsOf(ctx.db, who.id);
  // Première fois : on demande le tag.
  if (accounts.length === 0) return { kind: 'modal', modal: tagModal(e, team) };

  const signed = await mine(ctx, e, who);
  const inHere = (a: Account) =>
    signed.some((s) => s.tag === a.tag && (e.mode === 'random' || s.team === team));
  // Un seul compte, pas encore ici : un clic suffit.
  if (accounts.length === 1 && !inHere(accounts[0])) {
    await run(ctx.db, [
      signupStatement(ctx.db, e.id, who, accounts[0], await teamFor(ctx, e, team)),
    ]);
    refreshAfterSignup(ctx, e, [accounts[0]]);
    const now = await mine(ctx, e, who);
    return {
      kind: 'reply',
      reply: picker(
        e,
        accounts,
        now,
        team,
        `✅ **${escapeMarkdown(accounts[0].name)}** est inscrit à la FW #${e.number}` +
          (team ? ` (${TEAM_LABEL[team]}).` : '.'),
        ctx.fw,
      ),
    };
  }
  return {
    kind: 'reply',
    reply: picker(
      e,
      accounts,
      signed,
      team,
      `Quels comptes inscris-tu à la FW #${e.number}` +
        (team ? ` dans la ${TEAM_LABEL[team]}` : '') +
        ' ? Coche-les dans la liste (décocher un compte le retire).',
      ctx.fw,
    ),
  };
}

/**
 * La liste à cocher de ses comptes, le bouton pour en ajouter un, et, une fois
 * les équipes annoncées (H − 10), le bouton pour rejoindre le clan de sa team.
 */
function picker(
  e: Evening,
  accounts: readonly Account[],
  signed: readonly Signup[],
  team: Team | null,
  header: string,
  cfg: FwConfig,
): Reply {
  const shown = accounts.slice(0, 25); // limite de Discord
  const suffix = team ? `:${team}` : '';
  const signupOf = (a: Account) => signed.find((s) => s.tag === a.tag);
  return {
    content:
      header +
      '\n_Un autre compte ? « Ajouter un compte » : il sera retenu pour les prochaines FW._',
    ephemeral: true,
    components: [
      {
        type: ComponentType.Row,
        components: [
          {
            type: ComponentType.StringSelect,
            custom_id: `fw:pick:${e.id}${suffix}`,
            placeholder: 'Choisis tes comptes',
            min_values: 0,
            max_values: shown.length,
            options: shown.map((a) => {
              const s = signupOf(a);
              const elsewhere =
                team && s?.team && s.team !== team ? ` · ${TEAM_LABEL[s.team]}` : '';
              return {
                label: a.name.slice(0, 100),
                value: a.tag,
                description: `${a.tag}${a.townHall ? ` · HDV ${a.townHall}` : ''}${elsewhere}`,
                default: team ? s?.team === team : Boolean(s),
              };
            }),
          },
        ],
      },
      {
        type: ComponentType.Row,
        components: [
          button(`fw:add:${e.id}${suffix}`, 'Ajouter un compte', ButtonStyle.Primary, '➕'),
          ...(e.teamsAt !== null
            ? linkButtons(
                TEAMS.filter((t) => signed.some((s) => s.team === t)),
                cfg,
              )
            : []),
        ],
      },
    ],
  };
}

/** Cases cochées : ses comptes inscrits (dans cette équipe) deviennent exactement ceux-là. */
async function pick(
  ctx: BotContext,
  e: Evening,
  who: Who,
  team: Team | null,
  values: readonly string[],
): Promise<Reply> {
  const accounts = await accountsOf(ctx.db, who.id);
  const chosen = new Set(values);
  const signed = await mine(ctx, e, who);
  const statements: D1PreparedStatement[] = [];
  const added: Account[] = [];
  for (const a of accounts) {
    const s = signed.find((x) => x.tag === a.tag);
    const here = s && (e.mode === 'random' || s.team === team);
    if (chosen.has(a.tag) && !here) {
      // Nouveau ici (ou venu de l'autre équipe, en libre).
      statements.push(signupStatement(ctx.db, e.id, who, a, await teamFor(ctx, e, team)));
      added.push(a);
    } else if (!chosen.has(a.tag) && here) {
      statements.push(removeStatement(ctx.db, e.id, a.tag));
    }
  }
  await run(ctx.db, statements);
  refreshAfterSignup(ctx, e, added);

  const now = await mine(ctx, e, who);
  const inHere = now.filter((s) => e.mode === 'random' || s.team === team);
  const names = inHere.map((s) => `**${escapeMarkdown(s.name)}**`).join(', ');
  const where = team ? ` dans la ${TEAM_LABEL[team]}` : '';
  return picker(
    e,
    accounts,
    now,
    team,
    inHere.length
      ? `✅ Inscrit${inHere.length > 1 ? 's' : ''} à la FW #${e.number}${where} : ${names}.`
      : `Aucun de tes comptes n'est inscrit à la FW #${e.number}${where}.`,
    ctx.fw,
  );
}

function tagModal(e: Evening, team: Team | null) {
  return {
    custom_id: `fw:tag:${e.id}${team ? `:${team}` : ''}`,
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
function tagSubmitted(
  ctx: BotContext,
  e: Evening,
  who: Who,
  team: Team | null,
  interaction: Interaction,
): ComponentResponse {
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
      await run(ctx.db, [
        signupStatement(ctx.db, e.id, who, found.value, await teamFor(ctx, e, team)),
      ]);
      await refreshSignup(ctx, e.id);
      const now = await mine(ctx, e, who);
      return picker(
        e,
        await accountsOf(ctx.db, who.id),
        now,
        team,
        `✅ **${escapeMarkdown(found.value.name)}** (\`${tag}\`, HDV ${found.value.townHall}) ` +
          `est inscrit à la FW #${e.number}` +
          (team ? ` (${TEAM_LABEL[team]}).` : '.'),
        ctx.fw,
      );
    },
  };
}

async function leave(ctx: BotContext, e: Evening, discordId: string): Promise<Reply> {
  const removed = await removeSignups(ctx.db, e.id, discordId);
  if (removed.length) refreshLater(ctx, e);
  return done(
    removed.length
      ? `🗑️ Désinscrit de la FW #${e.number} : ` +
          removed.map((n) => `**${escapeMarkdown(n)}**`).join(', ') +
          '.'
      : `Tu n'étais pas inscrit à la FW #${e.number}.`,
  );
}

/** Pour la tâche de chaque minute (index.ts) : les équipes à H − 10. */
export async function runFwSchedule(
  deps: FwDeps,
  due: (now: number) => Promise<Evening[]>,
): Promise<number> {
  const evenings = await due(deps.now());
  for (const e of evenings) await makeTeams(deps, e, false);
  return evenings.length;
}

// ------------------------------------------------------------ qui a rejoint sa team ?

/**
 * Qui a rejoint le clan de sa team ? Appelé chaque minute (index.ts) pour les
 * soirées dont la fiche le montre (voir eveningsCheckingClans) : 2 appels au jeu
 * (les membres des deux clans), puis la fiche est modifiée SEULEMENT si un
 * compte a bougé. Jeu injoignable : on garde le dernier état connu.
 * Renvoie le nombre de comptes qui ont changé.
 */
export async function checkClans(
  deps: FwDeps,
  coc: Pick<CocClient, 'clanMembers'>,
  evenings: (now: number) => Promise<Evening[]>,
): Promise<number> {
  const tags = deps.fw.teamTags;
  if (!tags.violet || !tags.vert) return 0;
  let members: ReadonlyMap<string, ClanSeen> | null = null;
  let changed = 0;
  for (const e of await evenings(deps.now())) {
    const signups = await signupsOf(deps.db, e.id);
    if (!signups.length) continue;
    if (!members) {
      const [violet, vert] = await Promise.all([
        coc.clanMembers(tags.violet),
        coc.clanMembers(tags.vert),
      ]);
      if (!violet.ok || !vert.ok) return changed;
      members = new Map<string, ClanSeen>([
        ...violet.value.map((t) => [normalizeTag(t), 'violet'] as const),
        ...vert.value.map((t) => [normalizeTag(t), 'vert'] as const),
      ]);
    }
    const seen = new Map<string, ClanSeen>();
    for (const s of signups) {
      const clan = members.get(normalizeTag(s.tag)) ?? 'none';
      if (clan !== s.inClan) seen.set(s.tag, clan);
    }
    if (!seen.size) continue;
    await saveClansSeen(deps.db, e.id, seen);
    await refreshSignup(deps, e.id);
    changed += seen.size;
  }
  return changed;
}

export type { DiscordApi };
