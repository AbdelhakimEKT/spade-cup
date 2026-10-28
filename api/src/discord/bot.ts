import {
  bracketFromSeeds,
  championOf,
  currentRound,
  isResultEditable,
  recordResult,
  roundLabel,
  shuffle,
  startMatch,
  winnerOf,
} from '../../../src/app/core/tournament/bracket';
import { cocTime, readFriendlyWar } from '../../../src/app/core/tournament/coc-war';
import {
  isAllowedLogo,
  normalizeDate,
  normalizeTime,
  posterQuery,
} from '../../../src/app/core/poster/poster';
import { parseDuration, slugify } from '../../../src/app/core/tournament/format';
import type {
  Bracket,
  BracketMatch,
  ClanRef,
  Side,
  SideScore,
} from '../../../src/app/core/tournament/models';
import { TOURNAMENT_RULES } from '../../../src/app/core/tournament/models';
import { isValidTag, normalizeTag } from '../../../src/app/core/tournament/tags';
import { decideWinner } from '../../../src/app/core/tournament/war-result';
import type { Outcome } from '../announcements';
import { COC_ERROR_TEXT, type CocClient } from '../coc';
import type { Shot } from '../screens';
import {
  addReferee,
  addRegistration,
  createTournament,
  deleteTournament,
  getCurrentTournament,
  getTournament,
  listTournaments,
  registeredBy,
  removeRegistration,
  renameClan,
  saveBracket,
  saveDraw,
  slugExists,
  type StoredTournament,
} from '../repository';
import { fwAutocomplete, fwCommand, isManager, type FwConfig } from './fw';
import type { DiscordApi } from './rest';
import type { Choice, CommandOption, Interaction } from './types';

/**
 * Ce que fait chaque commande du bot. Aucune notion d'HTTP ici : on reçoit
 * une interaction, on renvoie un texte. Le fichier `route.ts` s'occupe du
 * dialogue avec Discord ; ce fichier-ci se teste donc avec une vraie base et
 * un faux client du jeu.
 */

export interface BotContext {
  readonly db: D1Database;
  readonly coc: CocClient;
  /** Adresse du site, pour les liens dans les messages. */
  readonly siteUrl: string;
  /** Hasard du tirage : injectable pour des tests reproductibles. */
  readonly random: () => number;
  /** L'heure actuelle (ms) : injectable pour les tests. */
  readonly now: () => number;
  /** Rôles Discord qui gèrent les soirées FW et l'arbitrage (FW_MANAGER_ROLES). */
  readonly managerRoles: readonly string[];
  /** Le bot qui poste en son nom (jeton DISCORD_BOT_TOKEN), ou `null` s'il n'est pas configuré. */
  readonly discord: DiscordApi | null;
  /** Salons et rôle des soirées FW. */
  readonly fw: FwConfig;
  /** Tâche à finir après la réponse à Discord (mise à jour de la fiche d'inscription). */
  readonly background: (task: Promise<unknown>) => void;
  /** Images des pages du site (PNG) : un vrai navigateur en production. */
  readonly capture: (shots: readonly Shot[]) => Promise<Uint8Array[]>;
  /**
   * Publie un événement dans les salons (#résultats, #classement, arbitres),
   * en arrière-plan : un résultat saisi à la main est annoncé comme un résultat
   * automatique.
   */
  readonly publish: (
    t: { readonly name: string; readonly slug: string },
    bracket: Bracket,
    outcome: Outcome,
  ) => void;
}

export interface Reply {
  readonly content: string;
  /** Visible seulement par la personne qui a tapé la commande (erreurs). */
  readonly ephemeral?: boolean;
  /** Pièces jointes (l'image de l'arbre). */
  readonly files?: readonly { readonly name: string; readonly data: Uint8Array }[];
  /** Boutons et listes sous le message (voir discord/fw.ts). */
  readonly components?: readonly unknown[];
  /** Rôles notifiés par le message (ping de l'annonce d'une FW). */
  readonly mentionRoles?: readonly string[];
}

const ORGANIZER = 'Friendly Wars';
const DEFAULT_RULES =
  `Guerres amicales en ${TOURNAMENT_RULES.teamSize} contre ${TOURNAMENT_RULES.teamSize}, ` +
  `HDV${TOURNAMENT_RULES.townHallLevel} uniquement. Étoiles, puis pourcentage, puis temps total d'attaque.`;

/** Erreur « normale » (mauvaise saisie, mauvais moment) : affichée telle quelle. */
class UserError extends Error {}

const fail = (message: string): never => {
  throw new UserError(message);
};

// ------------------------------------------------------------ point d'entrée

/** Commandes qui interrogent le jeu : trop lentes pour les 3 s laissées par Discord. */
export function needsDefer(interaction: Interaction): boolean {
  const { command, sub } = parse(interaction);
  return (
    command === 'inscription' ||
    // /fw : le bot poste et modifie des messages, et photographie la fiche.
    command === 'fw' ||
    (command === 'arbitre' && ['resultat', 'tirage', 'arbre', 'affiche'].includes(sub ?? ''))
  );
}

export async function runCommand(interaction: Interaction, ctx: BotContext): Promise<Reply> {
  try {
    if (!interaction.member) fail('Utilise cette commande sur le serveur Discord du tournoi.');
    const { command, sub, options } = parse(interaction);

    switch (command) {
      case 'inscription':
        return await register(interaction, ctx, String(options.get('tag') ?? ''));
      case 'desinscription':
        return await unregister(interaction, ctx, String(options.get('tag') ?? ''));
      case 'tournoi':
        return await status(ctx);
      case 'arbitre':
        return await referee(interaction, ctx, sub ?? '', options);
      case 'fw':
        return await fwCommand(interaction, ctx, sub ?? '', options);
      default:
        return fail('Commande inconnue.');
    }
  } catch (error) {
    if (error instanceof UserError) return { content: `❌ ${error.message}`, ephemeral: true };
    throw error;
  }
}

/** Suggestions pendant la saisie d'une option (le match, le clan vainqueur). */
export async function autocomplete(interaction: Interaction, ctx: BotContext): Promise<Choice[]> {
  const { command, sub, options, focused } = parse(interaction);
  if (!focused) return [];
  if (command === 'fw') {
    if (!interaction.member || !isManager(interaction.member, ctx.managerRoles)) return [];
    return focused.name === 'compte' ? fwAutocomplete(ctx, String(focused.value ?? '')) : [];
  }
  // Les suggestions de /arbitre ne sont proposées qu'aux admins et aux modos.
  if (
    command === 'arbitre' &&
    (!interaction.member || !isManager(interaction.member, ctx.managerRoles))
  ) {
    return [];
  }

  if (focused.name === 'tournoi') {
    const typed = String(focused.value ?? '').toLowerCase();
    return (await listTournaments(ctx.db))
      .map((t) => ({ name: t.isDemo ? `${t.name} (démo)` : t.name, value: t.slug }))
      .filter((c) => c.name.toLowerCase().includes(typed))
      .slice(0, 25)
      .map((c) => ({ ...c, name: c.name.slice(0, 100) }));
  }

  const active = await getCurrentTournament(ctx.db);
  const bracket = active?.tournament.bracket;
  if (!bracket) return [];

  if (focused.name === 'clan') {
    const match = bracket.matches.find((m) => m.id === options.get('match'));
    if (!match?.home || !match.away) return [];
    return [
      { name: match.home.name, value: 'home' },
      { name: match.away.name, value: 'away' },
    ];
  }

  const typed = String(focused.value ?? '').toLowerCase();
  return bracket.matches
    .filter((m) =>
      sub === 'lancer' ? m.status === 'pending' && m.home && m.away : isResultEditable(bracket, m),
    )
    .map((m) => ({
      name: `${roundLabel(m.round, bracket.roundCount)} · ${versus(m)}`,
      value: m.id,
    }))
    .filter((c) => c.name.toLowerCase().includes(typed) || c.value.toLowerCase().includes(typed))
    .slice(0, 25) // limite fixée par Discord
    .map((c) => ({ ...c, name: c.name.slice(0, 100) }));
}

// ------------------------------------------------------------ commandes publiques

async function register(interaction: Interaction, ctx: BotContext, rawTag: string): Promise<Reply> {
  const { id, tournament } = await openTournament(ctx);
  const tag = checkedTag(rawTag);
  if (tournament.clans.some((c) => c.tag === tag)) fail(`Le clan ${tag} est déjà inscrit.`);

  // Le nom et le blason viennent du jeu. S'il ne répond pas, on inscrit quand
  // même avec le tag : le nom sera récupéré au tirage.
  const found = await ctx.coc.clan(tag);
  if (!found.ok && found.error === 'not-found') fail(`${COC_ERROR_TEXT['not-found']} (${tag})`);
  const clan: ClanRef = found.ok ? found.value : { tag, name: tag };

  await addRegistration(ctx.db, id, clan, interaction.member!.user.id);
  const count = tournament.clans.length + 1;
  return {
    content:
      `✅ **${clan.name}** (\`${tag}\`) est inscrit à **${tournament.name}**. ` +
      `${count} clan${count > 1 ? 's' : ''} inscrit${count > 1 ? 's' : ''}.` +
      (found.ok ? '' : `\n_Le jeu ne répond pas : le nom du clan sera récupéré au tirage._`),
  };
}

async function unregister(
  interaction: Interaction,
  ctx: BotContext,
  rawTag: string,
): Promise<Reply> {
  const { id, tournament } = await openTournament(ctx);
  const tag = checkedTag(rawTag);
  const registration = await registeredBy(ctx.db, id, tag);
  if (!registration) fail(`Le clan ${tag} n'est pas inscrit.`);

  const member = interaction.member!;
  if (registration!.by !== member.user.id && !isManager(member, ctx.managerRoles)) {
    fail('Seule la personne qui a inscrit ce clan, ou un admin, peut le retirer.');
  }
  await removeRegistration(ctx.db, id, tag);
  const name = tournament.clans.find((c) => c.tag === tag)?.name ?? tag;
  return { content: `🗑️ **${name}** ne participe plus à **${tournament.name}**.` };
}

async function status(ctx: BotContext): Promise<Reply> {
  const current = await getCurrentTournament(ctx.db);
  if (!current) {
    return { content: `Aucun tournoi en cours. Les tournois passés : ${ctx.siteUrl}/tournois` };
  }
  const t = current.tournament;
  const link = tournamentUrl(ctx, t.slug);
  const champion = t.bracket && championOf(t.bracket);

  if (champion) {
    return {
      content: `👑 **${t.name}** est terminé : victoire de **${champion.name}** !
${link}`,
    };
  }

  if (!t.bracket) {
    const names = t.clans.map((c) => c.name).join(', ') || 'aucun pour l’instant';
    return {
      content:
        `📝 **${t.name}** : inscriptions ouvertes avec \`/inscription\`.\n` +
        `${t.clans.length} clan(s) : ${names}\n${link}`,
    };
  }

  const round = currentRound(t.bracket);
  const lines = t.bracket.matches
    .filter((m) => m.round === round && m.home && m.away)
    .map((m) => `${STATUS_ICON[m.status]} ${versus(m)}`);
  return {
    content:
      `🏆 **${t.name}** · ${roundLabel(round, t.bracket.roundCount)}\n` +
      `${lines.join('\n')}\n${link}`,
  };
}

// ------------------------------------------------------------ commandes d'arbitre

async function referee(
  interaction: Interaction,
  ctx: BotContext,
  sub: string,
  options: Map<string, string | number>,
): Promise<Reply> {
  const member = interaction.member!;
  // Double sécurité : Discord cache /arbitre aux autres membres, mais le bot
  // vérifie aussi, au cas où un réglage du serveur serait changé par erreur.
  if (!isManager(member, ctx.managerRoles)) {
    fail('Les commandes /arbitre sont réservées aux admins et aux modos.');
  }
  const refereeName = member.nick ?? member.user.global_name ?? member.user.username;

  if (sub === 'creer') {
    return create(ctx, refereeName, String(options.get('nom')), options.get('reglement'));
  }
  if (sub === 'arbre') return bracketImage(ctx, options.get('tournoi'));
  if (sub === 'affiche') return matchPoster(ctx, interaction, options);

  const active = await getCurrentTournament(ctx.db);
  if (!active) return fail('Aucun tournoi pour le moment. Crée-en un avec `/arbitre creer`.');
  if (sub === 'annuler') return cancel(ctx, active, String(options.get('nom') ?? ''));
  await addReferee(ctx.db, active.id, refereeName);

  if (sub === 'tirage') return draw(ctx, active);

  const bracket = active.tournament.bracket ?? fail("Le tirage n'a pas encore eu lieu.");
  const match =
    bracket.matches.find((m) => m.id === options.get('match')) ??
    fail('Match introuvable : choisis-le dans la liste proposée.');

  switch (sub) {
    case 'lancer':
      return launch(ctx, active, bracket, match);
    case 'resultat':
      return readResult(ctx, active, bracket, match);
    case 'score':
      return manualScore(ctx, active, bracket, match, options);
    case 'vainqueur':
      return forceWinner(ctx, active, bracket, match, String(options.get('clan')));
    default:
      return fail('Sous-commande inconnue.');
  }
}

async function create(
  ctx: BotContext,
  refereeName: string,
  name: string,
  rules: string | number | undefined,
): Promise<Reply> {
  const current = await getCurrentTournament(ctx.db);
  if (current && current.tournament.status !== 'finished') {
    fail(`« ${current.tournament.name} » n'est pas terminé : un seul tournoi à la fois.`);
  }

  const base = slugify(name) || fail('Ce nom ne contient ni lettre ni chiffre.');
  let slug = base;
  for (let n = 2; await slugExists(ctx.db, slug); n++) slug = `${base}-${n}`;

  await createTournament(ctx.db, {
    slug,
    name: name.trim(),
    organizer: ORGANIZER,
    referees: [refereeName],
    rules: typeof rules === 'string' && rules.trim() ? rules.trim() : DEFAULT_RULES,
  });
  return {
    content:
      `🏆 Tournoi **${name.trim()}** créé, les inscriptions sont ouvertes !\n` +
      `Chefs de clan : \`/inscription tag:#VOTRETAG\`.\n${tournamentUrl(ctx, slug)}`,
  };
}

async function draw(ctx: BotContext, active: StoredTournament): Promise<Reply> {
  const t = active.tournament;
  if (t.status !== 'registration') fail('Le tirage a déjà eu lieu.');
  if (t.clans.length < 2) fail('Il faut au moins 2 clans inscrits pour faire le tirage.');

  // Clans inscrits pendant une panne du jeu : on récupère enfin leur nom.
  const clans = await Promise.all(
    t.clans.map(async (clan) => {
      if (clan.name !== clan.tag) return clan;
      const found = await ctx.coc.clan(clan.tag);
      if (!found.ok) return clan;
      await renameClan(ctx.db, active.id, found.value);
      return found.value;
    }),
  );

  const seeded = shuffle(clans, ctx.random);
  const bracket = bracketFromSeeds(seeded);
  await saveDraw(ctx.db, active.id, seeded, bracket);

  const firstRound = bracket.matches
    .filter((m) => m.round === 1)
    .map((m) =>
      m.status === 'bye' ? `⏭️ ${winnerOf(m)!.name} : qualifié d'office` : `⚔️ ${versus(m)}`,
    );
  return {
    content:
      `🎲 **Tirage de ${t.name}** : ${clans.length} clans, ` +
      `on commence par les ${roundLabel(1, bracket.roundCount).toLowerCase()}.\n` +
      `${firstRound.join('\n')}\n${tournamentUrl(ctx, t.slug)}`,
  };
}

/**
 * Publie l'image de l'arbre dans le salon. Par défaut le tournoi courant ;
 * l'option `tournoi` permet d'en choisir un autre (la démo, par exemple).
 */
async function bracketImage(ctx: BotContext, chosen: string | number | undefined): Promise<Reply> {
  const slug =
    typeof chosen === 'string' && chosen
      ? chosen
      : ((await getCurrentTournament(ctx.db))?.tournament.slug ??
        fail('Aucun tournoi pour le moment. Choisis-en un dans la liste (la démo, par exemple).'));
  const t =
    (await getTournament(ctx.db, slug)) ?? fail('Tournoi introuvable : choisis-le dans la liste.');
  const bracket =
    t.bracket ?? fail(`Le tirage de « ${t.name} » n'a pas encore eu lieu : pas d'arbre à montrer.`);

  let png: Uint8Array;
  try {
    [png] = await ctx.capture([{ kind: 'bracket', slug }]);
  } catch (error) {
    console.error('Capture de l’arbre impossible', slug, error);
    return fail(
      "Impossible de générer l'image pour le moment. Le lien, lui, marche toujours : " +
        tournamentUrl(ctx, slug),
    );
  }

  return {
    // Pas de lien : l'image se suffit à elle-même.
    content: bracketCaption(t.name, bracket),
    files: [{ name: 'arbre.png', data: png }],
  };
}

/** Logos acceptés : images courantes, 8 Mo au plus (la limite d'un envoi Discord gratuit). */
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Affiche d'un match entre deux équipes, avec leurs logos joints à la
 * commande. Le site la dessine (/affiche), un navigateur la photographie, et
 * l'image est publiée dans le salon. N'importe quelles deux équipes : pas
 * besoin d'un tournoi en cours.
 */
async function matchPoster(
  ctx: BotContext,
  interaction: Interaction,
  options: Map<string, string | number>,
): Promise<Reply> {
  const logo = (n: 1 | 2): string => {
    const id = String(options.get(`logo_${n}`) ?? '');
    const file =
      interaction.data?.resolved?.attachments?.[id] ??
      fail(`Ajoute le logo de l'équipe ${n === 1 ? 'de gauche' : 'de droite'}.`);
    const type = file.content_type?.split(';')[0] ?? '';
    if (!LOGO_TYPES.includes(type)) {
      fail(`« ${file.filename} » n'est pas une image PNG, JPG ou WebP.`);
    }
    if (file.size > LOGO_MAX_BYTES) fail(`« ${file.filename} » est trop lourd (8 Mo au plus).`);
    if (!isAllowedLogo(file.url))
      fail(`Logo « ${file.filename} » refusé : il doit venir de Discord.`);
    return file.url;
  };
  const text = (name: string) => String(options.get(name) ?? '').trim();

  const date = normalizeDate(text('date')) ?? fail('Date illisible : écris-la comme ceci, 26/10.');
  const time =
    normalizeTime(text('heure')) ?? fail('Heure illisible : écris-la comme ceci, 22h00.');
  const query = posterQuery({
    leftName: text('equipe_1'),
    leftLogo: logo(1),
    rightName: text('equipe_2'),
    rightLogo: logo(2),
    format: text('format'),
    date,
    time,
    rules: text('regles'),
  });

  let png: Uint8Array;
  try {
    [png] = await ctx.capture([{ kind: 'poster', query }]);
  } catch (error) {
    console.error('Capture de l’affiche impossible', error);
    return fail("Impossible de générer l'affiche pour le moment. Réessaie dans une minute.");
  }
  return { content: '', files: [{ name: 'affiche.png', data: png }] };
}

/**
 * Supprime le tournoi courant (test, erreur de création…). Irréversible :
 * il faut retaper son nom exact pour confirmer.
 */
async function cancel(ctx: BotContext, active: StoredTournament, typed: string): Promise<Reply> {
  const { name } = active.tournament;
  const same = (a: string) => a.trim().toLocaleLowerCase('fr');
  if (same(typed) !== same(name)) {
    fail(`Pour confirmer, retape le nom exact du tournoi : « ${name} ». Rien n'a été supprimé.`);
  }
  await deleteTournament(ctx.db, active.id);
  return {
    content: `🗑️ Le tournoi « ${name} » est supprimé, avec ses matchs et ses statistiques.`,
  };
}

async function launch(
  ctx: BotContext,
  active: StoredTournament,
  bracket: Bracket,
  match: BracketMatch,
): Promise<Reply> {
  const updated = attempt(() => startMatch(bracket, match.id));
  await saveBracket(ctx.db, active.id, updated);
  ctx.publish(active.tournament, updated, { started: [match] });
  return {
    content:
      `⚔️ **${versus(match)}** est lancé ` +
      `(${roundLabel(match.round, bracket.roundCount).toLowerCase()}). Bonne guerre !`,
  };
}

async function readResult(
  ctx: BotContext,
  active: StoredTournament,
  bracket: Bracket,
  match: BracketMatch,
): Promise<Reply> {
  if (!isResultEditable(bracket, match)) fail('Ce résultat ne peut plus être modifié.');
  const home = match.home!;
  const away = match.away!;

  // On interroge le jeu côté « domicile », puis côté « extérieur » si besoin
  // (journal de guerre privé chez l'un, guerre plus récente chez l'autre…).
  let reason = '';
  for (const clan of [home, away]) {
    const war = await ctx.coc.currentWar(clan.tag);
    if (!war.ok) {
      reason ||= COC_ERROR_TEXT[war.error];
      continue;
    }
    const reading = readFriendlyWar(war.value, home, away);
    if (!reading.ok) {
      reason ||= reading.reason;
      continue;
    }

    const winner =
      decideWinner(reading.score.home, reading.score.away) ??
      fail(
        'Égalité parfaite (étoiles, pourcentage ET temps) : aux arbitres de trancher avec `/arbitre vainqueur`.',
      );
    const updated = attempt(() => recordResult(bracket, match.id, winner, reading.score));
    await saveBracket(ctx.db, active.id, updated, {
      status: championOf(updated) ? 'finished' : undefined,
      result: { matchId: match.id, source: 'game', players: reading.players },
      finished: { matchId: match.id, at: cocTime(war.value.endTime) },
    });
    ctx.publish(active.tournament, updated, { finished: [{ matchId: match.id }] });
    return { content: resultMessage(ctx.siteUrl, active.tournament, updated, match.id) };
  }

  return fail(
    `Lecture impossible : ${reason}\nEn dernier recours : \`/arbitre score\` pour saisir le score à la main.`,
  );
}

async function manualScore(
  ctx: BotContext,
  active: StoredTournament,
  bracket: Bracket,
  match: BracketMatch,
  options: Map<string, string | number>,
): Promise<Reply> {
  const side = (n: 1 | 2): SideScore => ({
    stars: Number(options.get(`etoiles_${n}`)),
    destruction: Number(options.get(`pourcent_${n}`)),
    totalDurationSec:
      parseDuration(String(options.get(`temps_${n}`) ?? '')) ??
      fail(`Temps illisible pour le clan ${n} : écris par exemple 14:05.`),
  });
  const score = { home: side(1), away: side(2) };
  const winner =
    decideWinner(score.home, score.away) ??
    fail('Égalité parfaite : désigne le vainqueur avec `/arbitre vainqueur`.');

  const updated = attempt(() => recordResult(bracket, match.id, winner, score));
  await saveBracket(ctx.db, active.id, updated, {
    status: championOf(updated) ? 'finished' : undefined,
    // Score saisi à la main : pas de lignes de joueurs (les anciennes sont effacées).
    result: { matchId: match.id, source: 'referee', players: [] },
    finished: { matchId: match.id },
  });
  ctx.publish(active.tournament, updated, { finished: [{ matchId: match.id }] });
  return { content: resultMessage(ctx.siteUrl, active.tournament, updated, match.id) };
}

async function forceWinner(
  ctx: BotContext,
  active: StoredTournament,
  bracket: Bracket,
  match: BracketMatch,
  side: string,
): Promise<Reply> {
  if (side !== 'home' && side !== 'away') fail('Choisis le clan dans la liste proposée.');
  // Le score déjà connu (s'il y en a un) est conservé : seul le vainqueur change.
  const updated = attempt(() => recordResult(bracket, match.id, side as Side, match.score));
  await saveBracket(ctx.db, active.id, updated, {
    status: championOf(updated) ? 'finished' : undefined,
    finished: { matchId: match.id },
  });
  ctx.publish(active.tournament, updated, { finished: [{ matchId: match.id }] });
  return {
    content: `🧑‍⚖️ Décision des arbitres. ${resultMessage(ctx.siteUrl, active.tournament, updated, match.id)}`,
  };
}

// ------------------------------------------------------------ messages

const STATUS_ICON = { pending: '⏳', live: '🔴', bye: '⏭️', done: '✅' } as const;

const number = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** « A 13★ 91,2 % — 11★ 84,0 % B », qui se qualifie (ou le champion), et le lien du match. */
export function resultMessage(
  siteUrl: string,
  t: { readonly name: string; readonly slug: string },
  bracket: Bracket,
  matchId: string,
): string {
  const m = bracket.matches.find((x) => x.id === matchId)!;
  const winner = winnerOf(m)!;
  const loser = winner === m.home ? m.away! : m.home!;
  const champion = championOf(bracket);
  const lines = [
    champion
      ? `👑 **${champion.name}** remporte **${t.name}** ! Bravo !`
      : `🏆 **${winner.name}** bat **${loser.name}** · ${roundLabel(m.round, bracket.roundCount).toLowerCase()}`,
  ];

  if (m.score) {
    const { home, away } = m.score;
    // À égalité d'étoiles, on dit ce qui a départagé les clans.
    const tieBreak =
      home.stars !== away.stars
        ? ''
        : home.destruction !== away.destruction
          ? ' · départagé au pourcentage'
          : ' · départagé au temps';
    lines.push(
      `${m.home!.name} ${home.stars}★ ${number.format(home.destruction)} % — ` +
        `${away.stars}★ ${number.format(away.destruction)} % ${m.away!.name}${tieBreak}`,
    );
  }
  if (!champion) {
    lines.push(
      `➡️ **${winner.name}** se qualifie pour ${nextRoundName(m.round + 1, bracket.roundCount)}.`,
    );
  }
  // Pas de lien vers le site : le récap en image suit le message.
  return lines.join('\n');
}

/** « la finale », « les demi-finales », « les quarts de finale »… */
export function nextRoundName(round: number, roundCount: number): string {
  return round === roundCount ? 'la finale' : `les ${roundLabel(round, roundCount).toLowerCase()}`;
}

/** Légende de l'image de l'arbre : « 🏆 Coupe · Demi-finales » ou le champion. */
export function bracketCaption(name: string, bracket: Bracket): string {
  const champion = championOf(bracket);
  const stage = champion
    ? `👑 Victoire de **${champion.name}**`
    : roundLabel(currentRound(bracket), bracket.roundCount);
  return `🏆 **${name}** · ${stage}`;
}

export const versus = (m: BracketMatch) => `${m.home?.name ?? '?'} contre ${m.away?.name ?? '?'}`;

const tournamentUrl = (ctx: BotContext, slug: string) => `${ctx.siteUrl}/tournois/${slug}`;

// ------------------------------------------------------------ outils

async function openTournament(ctx: BotContext): Promise<StoredTournament> {
  const active =
    (await getCurrentTournament(ctx.db)) ??
    fail("Aucun tournoi n'est ouvert aux inscriptions pour le moment.");
  if (active.tournament.status !== 'registration') {
    fail(`Les inscriptions de « ${active.tournament.name} » sont closes.`);
  }
  return active;
}

function checkedTag(raw: string): string {
  const tag = normalizeTag(raw);
  if (!isValidTag(tag)) {
    fail(
      `« ${raw} » n'est pas un tag de clan valide. Il se trouve sous le nom du clan, dans le jeu.`,
    );
  }
  return tag;
}

/** Les fonctions de l'arbre lèvent des erreurs en français : on les montre telles quelles. */
function attempt<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

/** Aplatit les options : « /arbitre score match:… » → commande, sous-commande, valeurs. */
function parse(interaction: Interaction): {
  command: string;
  sub: string | null;
  options: Map<string, string | number>;
  focused: CommandOption | null;
} {
  const first = interaction.data?.options?.[0];
  const isSub = first?.type === 1;
  const list = (isSub ? first.options : interaction.data?.options) ?? [];
  return {
    command: interaction.data?.name ?? '',
    sub: isSub ? first.name : null,
    options: new Map(list.filter((o) => o.value !== undefined).map((o) => [o.name, o.value!])),
    focused: list.find((o) => o.focused) ?? null,
  };
}
