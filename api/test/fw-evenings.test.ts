import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { weekRange } from '../../src/app/core/fw/evening';
import { parseFullRecap } from '../../src/app/core/fw/full-recap';
import type { BotContext, Reply } from '../src/discord/bot';
import { runCommand } from '../src/discord/bot';
import { checkClans, fwComponent, runFwSchedule, sheetBanner, type ComponentResponse } from '../src/discord/fw';
import { textOf as blockText } from '../src/discord/blocks';
import type { DiscordApi } from '../src/discord/rest';
import type { Shot } from '../src/screens';
import type { Interaction } from '../src/discord/types';
import {
  accountsOf,
  currentEvening,
  eveningsCheckingClans,
  eveningsNeedingTeams,
  getEvening,
  postFwRecaps,
  postWeeklyTop,
  signupsOf,
} from '../src/fw-evenings';
import { toSqliteTime } from '../src/repository';
import { listFriendlyWars, listFwPlayers } from '../src/stats-repository';
import {
  FAKE_PNG,
  MEMBER,
  MODO,
  NOW_FW,
  OTHER_MEMBER,
  botContext,
  fakeAnnouncer,
  fakeCoc,
  type Who,
} from './helpers';

const db = () => env.DB;

/** Un faux Discord : garde ce que le bot poste et modifie. */
function fakeDiscord() {
  const sent: { channel: string; id: string; reply: Reply }[] = [];
  const edits: { channel: string; id: string; reply: Reply }[] = [];
  const api: DiscordApi = {
    async send(channel, reply) {
      const id = `m${sent.length + 1}`;
      sent.push({ channel, id, reply });
      return id;
    },
    async edit(channel, id, reply) {
      edits.push({ channel, id, reply });
      return true;
    },
    emojis: async () =>
      new Map([
        ['th18', 'e18'],
        ['th17', 'e17'],
      ]),
  };
  /** Le dernier état d'un message (envoyé puis modifié). */
  const latest = (id: string) =>
    [...edits].reverse().find((e) => e.id === id)?.reply ?? sent.find((s) => s.id === id)?.reply;
  /** Tout le texte de ce message (la fiche est « en blocs »). */
  const sheet = (id: string) => blockText(latest(id)!);
  return { api, sent, edits, latest, sheet };
}

/** Contexte du bot avec un faux Discord ; les tâches de fond sont attendues par `settle`. */
function setup() {
  const discord = fakeDiscord();
  const tasks: Promise<unknown>[] = [];
  let seed = 3;
  const ctx: BotContext = {
    ...botContext(db()),
    discord: discord.api,
    background: (task) => void tasks.push(task),
    random: () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31,
  };
  const settle = async () => {
    while (tasks.length) await tasks.shift();
  };
  return { ctx, discord, settle };
}

/** « /fw <sub> … » tapé par `who`. */
function fw(
  sub: string,
  values: Record<string, string | number> = {},
  who: Who = MODO,
): Interaction {
  return {
    type: 2,
    token: 'jeton',
    application_id: 'app',
    channel_id: 'c-ici',
    member: {
      user: { id: who.id, username: who.name },
      permissions: who.permissions,
      ...(who.roles ? { roles: who.roles } : {}),
    },
    data: {
      name: 'fw',
      options: [
        {
          name: sub,
          type: 1,
          options: Object.entries(values).map(([name, value]) => ({
            name,
            type: typeof value === 'number' ? 4 : 3,
            value,
          })),
        },
      ],
    },
  };
}

/** Un clic (bouton, liste) ou un formulaire envoyé, par `who`. */
function click(
  customId: string,
  who: Who = MEMBER,
  extra: { values?: string[]; tag?: string } = {},
): Interaction {
  return {
    type: extra.tag !== undefined ? 5 : 3,
    token: 'jeton',
    application_id: 'app',
    member: { user: { id: who.id, username: who.name }, permissions: who.permissions },
    data: {
      name: '',
      custom_id: customId,
      ...(extra.values ? { values: extra.values } : {}),
      ...(extra.tag !== undefined
        ? { components: [{ components: [{ custom_id: 'tag', value: extra.tag }] }] }
        : {}),
    },
  };
}

/** Le texte d'une réponse (formulaire : on attend la réponse différée). */
async function textOf(response: ComponentResponse): Promise<string> {
  if (response.kind === 'deferred') return (await response.run()).content;
  if (response.kind === 'modal') return 'FENÊTRE';
  return response.reply.content;
}

const START = Date.UTC(2026, 9, 28, 20); // mercredi 28/10, 21h00 à Paris

async function launched(mode: 'random' | 'libre' = 'random') {
  const s = setup();
  await runCommand(fw('lancer', { date: '28/10', heure: '21h00', equipes: mode }), s.ctx);
  const e = (await currentEvening(db()))!;
  return { ...s, e, signupId: e.signup!.message };
}

/** Inscrit un compte par le formulaire du tag. */
async function signTag(ctx: BotContext, id: number, tag: string, who: Who = MEMBER, team = '') {
  return textOf(await fwComponent(click(`fw:tag:${id}${team}`, who, { tag }), ctx));
}

describe('/fw lancer : la fiche dans #inscription, l’annonce avec ping dans #annonce-fw', () => {
  it('un modo lance la FW #41 ; un membre simple ne peut pas', async () => {
    const { ctx, discord } = setup();
    const refused = await runCommand(fw('lancer', { date: '28/10', heure: '21h' }, MEMBER), ctx);
    expect(refused.content).toBe('❌ Les commandes /fw sont réservées aux admins et aux modos.');

    const reply = await runCommand(fw('lancer', { date: '28/10', heure: '21h' }), ctx);
    expect(reply.ephemeral).toBe(true);
    expect(reply.content).toContain('**FW #41** lancée pour le mercredi 28/10 à 21h00');

    // La fiche d'inscription d'abord, puis l'annonce (le ping seulement si la fiche est là).
    const [signup, announce] = discord.sent;
    expect(signup.channel).toBe('c-inscription');
    // En blocs : la bannière, le titre, la liste, les boutons dans le cadre.
    expect(signup.reply.v2).toBe(true);
    const sheet = blockText(signup.reply);
    expect(sheet).toContain('## 📝 FW #41 · mercredi 28/10 à 21h00');
    expect(sheet).toContain('Inscriptions jusqu’à **20h45** · début <t:');
    expect(sheet).toContain('### Inscrits · 0\n-# Personne pour l’instant.');
    const blocks = JSON.stringify(signup.reply.components);
    expect(blocks).toContain('"url":"https://site.test/brand/discord/fw-inscriptions.jpg?v=1"');
    expect(blocks).toMatch(/fw:join:\d+".*fw:add:\d+".*fw:leave/);
    // Pas de lien du clan sur la fiche : il arrive avec l'annonce des équipes.
    expect(blocks).not.toContain('Rejoindre');

    expect(announce.channel).toBe('c-annonce');
    expect(announce.reply.content).toBe(
      [
        '**INFORMATIONS** <@&r-fw>',
        '・ <#c-inscription> ouvertes jusqu’à **20h45**.',
        '・ Tirage des équipes à **20h50**',
        '・ Plusieurs comptes autorisés par joueur',
        '・ En cas de difficulté, ouvrez un <#c-tickets>',
      ].join('\n'),
    );
    expect(announce.reply.mentionRoles).toEqual(['r-fw']);
    expect(announce.reply.files?.[0].name).toBe('fw-41.png');
  });

  it('numéro suivant ; une FW annulée ne compte pas', async () => {
    const { ctx } = setup();
    await runCommand(fw('lancer', { date: '28/10', heure: '21h' }), ctx);
    await runCommand(fw('annuler'), ctx);
    await runCommand(fw('lancer', { date: '29/10', heure: '21h' }), ctx);
    expect((await currentEvening(db()))?.number).toBe(41);
    await db().prepare('UPDATE fw_evenings SET recap_posted_at = CURRENT_TIMESTAMP').run();
    await runCommand(fw('lancer', { date: '30/10', heure: '21h' }), ctx);
    expect((await currentEvening(db()))?.number).toBe(42);
  });

  it('infos et numéro modifiables à la création', async () => {
    const { ctx, discord } = setup();
    await runCommand(
      fw('lancer', {
        date: '28/10',
        heure: '20h30',
        numero: 50,
        rounds: '4 rounds',
        hdv: 'HDV 17 accepté',
      }),
      ctx,
    );
    const fiche = blockText(discord.sent.find((m) => m.channel === 'c-inscription')!.reply);
    expect(fiche).toContain('FW #50');
    const e = (await currentEvening(db()))!;
    expect(e.details).toMatchObject({ rounds: '4 rounds', accepted: 'HDV 17 accepté' });
    const announce = discord.sent.find((m) => m.channel === 'c-annonce')!.reply.content;
    expect(announce).toContain('jusqu’à **20h15**');
  });

  it('date passée ou heure illisible : refusée', async () => {
    const { ctx } = setup();
    expect((await runCommand(fw('lancer', { date: '26/10', heure: '20h' }), ctx)).content).toMatch(
      /déjà passé/,
    );
    expect((await runCommand(fw('lancer', { date: '28/10', heure: 'tôt' }), ctx)).content).toMatch(
      /Heure illisible/,
    );
  });

  it('essai : tout dans le salon de la commande, sans ping, sans prendre de numéro', async () => {
    const { ctx, discord } = setup();
    const reply = await runCommand(fw('lancer', { date: '28/10', heure: '21h', test: 'oui' }), ctx);
    expect(reply.content).toMatch(/^🧪 Essai : ✅ \*\*FW #41\*\*/);
    expect(discord.sent.map((m) => m.channel)).toEqual(['c-ici', 'c-ici']);
    const [announce, signup] = discord.sent;
    expect(announce.reply.content).toMatch(/^🧪 \*\*ESSAI\*\*/);
    expect(announce.reply.mentionRoles).toBeUndefined(); // personne n'est notifié
    expect(blockText(signup.reply)).toMatch(/^🧪 \*\*ESSAI\*\*/);

    // Le bilan de l'essai reste dans ce salon.
    await threeWars();
    await runCommand(fw('bilan'), { ...ctx, now: () => START + 2 * 3_600_000 });
    expect(discord.sent.some((m) => m.channel === 'c-resultats')).toBe(false);
    expect(discord.sent.at(-1)?.channel).toBe('c-ici');

    // La vraie suivante reste la #41.
    await runCommand(fw('lancer', { date: '29/10', heure: '21h' }), ctx);
    expect((await currentEvening(db()))?.number).toBe(41);
  });

  it('sans jeton du bot : refusé, avec l’explication', async () => {
    const reply = await runCommand(fw('lancer', { date: '28/10', heure: '21h' }), botContext(db()));
    expect(reply.content).toMatch(/DISCORD_BOT_TOKEN/);
  });

  it('fiche en blocs refusée par Discord : l’ancienne fiche, la soirée a lieu', async () => {
    const { ctx, discord } = setup();
    const send = discord.api.send;
    const picky = {
      ...discord.api,
      send: async (c: string, r: Reply) => (r.v2 ? null : send(c, r)),
    };
    const reply = await runCommand(fw('lancer', { date: '28/10', heure: '21h' }), {
      ...ctx,
      discord: picky,
    });
    expect(reply.content).toContain('**FW #41** lancée');
    const signup = discord.sent.find((m) => m.channel === 'c-inscription')!.reply;
    expect(signup.v2).toBeUndefined();
    expect(signup.content).toContain('📝 **FW #41**');
    expect((await currentEvening(db()))?.sheetV2).toBe(false);
  });

  it('#inscription inaccessible : pas d’annonce (pas de ping sans fiche)', async () => {
    const { ctx, discord } = setup();
    const blocked = {
      ...ctx,
      discord: {
        ...ctx.discord!,
        send: async (channel: string, reply: Reply) =>
          channel === 'c-inscription' ? null : ctx.discord!.send(channel, reply),
      },
    };
    const reply = await runCommand(fw('lancer', { date: '28/10', heure: '21h' }), blocked);
    expect(reply.content).toMatch(
      /Impossible de poster dans <#c-inscription>.*Rien n’a été annoncé/,
    );
    expect(discord.sent).toEqual([]);
    expect(await currentEvening(db())).toBeNull();
  });

  it('fiche manquante : /fw modifier la poste, sans refaire l’annonce', async () => {
    const { ctx, discord } = setup();
    const id = await db()
      .prepare(
        `INSERT INTO fw_evenings (number, starts_at, date_label, time_label, mode, created_by)
         VALUES (41, '2026-10-28 20:00:00', '28/10', '21H00', 'libre', 'Athena') RETURNING id`,
      )
      .first<{ id: number }>();
    const reply = await runCommand(fw('modifier'), ctx);
    expect(reply.content).toContain('postée dans <#c-inscription> (sans nouveau ping)');
    expect(discord.sent.map((m) => m.channel)).toEqual(['c-inscription']);
    expect((await getEvening(db(), id!.id))?.signup?.channel).toBe('c-inscription');
  });
});

describe('inscriptions (équipes random), plusieurs comptes', () => {
  it('1re fois : le tag ; la fiche montre les inscrits avec l’icône de leur HDV', async () => {
    const { ctx, discord, settle, e, signupId } = await launched();
    expect((await fwComponent(click(`fw:join:${e.id}`), ctx)).kind).toBe('modal');
    expect(await signTag(ctx, e.id, 'pq2')).toContain(
      '**Rags** (`#PQ2`, HDV 18) est inscrit à la FW #41',
    );
    // Un 2e compte, par « Ajouter un compte ».
    expect((await fwComponent(click(`fw:add:${e.id}`), ctx)).kind).toBe('modal');
    await signTag(ctx, e.id, '#PQ8');
    await settle();

    // Le pseudo du jeu ET la personne sur Discord (mentionnée, jamais notifiée).
    const fiche = discord.sheet(signupId);
    expect(fiche).toContain('### Inscrits · 2');
    expect(fiche).toContain('> <:th18:e18> Rags · <@u-chef>');
    expect(fiche).toContain('> <:th17:e17> Rags 2 · <@u-chef>');
  });

  it('comptes retenus : un seul → un clic ; plusieurs → liste à cocher ; désinscription', async () => {
    const { ctx, settle, e } = await launched();
    await signTag(ctx, e.id, '#PQ2');
    expect(await textOf(await fwComponent(click(`fw:leave:${e.id}`), ctx))).toContain('**Rags**');
    expect(await signupsOf(db(), e.id)).toEqual([]);

    // Un seul compte retenu : un clic l'inscrit.
    expect(await textOf(await fwComponent(click(`fw:join:${e.id}`), ctx))).toContain(
      '**Rags** est inscrit',
    );
    await signTag(ctx, e.id, '#PQ8');

    // Deux comptes : la liste à cocher.
    const list = await fwComponent(click(`fw:join:${e.id}`), ctx);
    expect(await textOf(list)).toContain('Quels comptes inscris-tu');
    await fwComponent(click(`fw:pick:${e.id}`, MEMBER, { values: ['#PQ8'] }), ctx);
    expect((await signupsOf(db(), e.id)).map((s) => s.tag)).toEqual(['#PQ8']);
    await fwComponent(click(`fw:pick:${e.id}`, MEMBER, { values: ['#PQ2', '#PQ8'] }), ctx);
    expect((await signupsOf(db(), e.id)).map((s) => s.tag).sort()).toEqual(['#PQ2', '#PQ8']);
    await settle();
  });

  it('compte retenu passé HDV 19 : l’HDV est relu dans le jeu à l’inscription', async () => {
    const { ctx, settle, e } = await launched();
    await signTag(ctx, e.id, '#PQ2');
    await fwComponent(click(`fw:leave:${e.id}`), ctx);
    await settle();
    // Le compte monte HDV 19 dans le jeu ; le bot l'avait retenu en HDV 18.
    const after = {
      ...ctx,
      coc: fakeCoc({}, undefined, [{ tag: '#PQ2', name: 'Rags', townHall: 19 }]),
    };
    await fwComponent(click(`fw:join:${e.id}`), after);
    await settle();
    expect((await signupsOf(db(), e.id)).map((s) => [s.tag, s.townHall])).toEqual([['#PQ2', 19]]);
    expect((await accountsOf(db(), MEMBER.id))[0].townHall).toBe(19);
    // Jeu injoignable : on garde ce qu'on a, l'inscription passe quand même.
    await fwComponent(click(`fw:leave:${e.id}`), ctx);
    const down = { ...ctx, coc: fakeCoc({}, undefined, []) };
    await fwComponent(click(`fw:join:${e.id}`), down);
    await settle();
    expect((await signupsOf(db(), e.id)).map((s) => s.townHall)).toEqual([19]);
  });

  it('tag invalide ou inconnu : message clair, rien d’enregistré', async () => {
    const { ctx, e } = await launched();
    expect(await signTag(ctx, e.id, 'abc!')).toMatch(/n'est pas un tag valide/);
    expect(await signTag(ctx, e.id, '#PQ22')).toMatch(/Aucun joueur ne porte le tag #PQ22/);
    expect(await signupsOf(db(), e.id)).toEqual([]);
  });

  it('H − 10 : équipes tirées au hasard, fiche mise à jour, « équipes prêtes »', async () => {
    const { ctx, discord, settle, e, signupId } = await launched();
    await signTag(ctx, e.id, '#PQ2');
    await signTag(ctx, e.id, '#PQ8');
    await signTag(ctx, e.id, '#PQ9', OTHER_MEMBER);

    const due = (now: number) => eveningsNeedingTeams(db(), now);
    expect(await runFwSchedule({ ...ctx, now: () => START - 11 * 60_000 }, due)).toBe(0);
    expect(await runFwSchedule({ ...ctx, now: () => START - 10 * 60_000 }, due)).toBe(1);
    expect(await runFwSchedule({ ...ctx, now: () => START - 9 * 60_000 }, due)).toBe(0);

    const teams = (await signupsOf(db(), e.id)).map((s) => s.team);
    expect(teams.filter((t) => t === 'violet')).toHaveLength(2);
    expect(teams.filter((t) => t === 'vert')).toHaveLength(1);
    const fiche = discord.sheet(signupId);
    expect(fiche).toContain('### 🟣 FW-Team 1 · 2');
    expect(fiche).toContain('### 🟢 FW-Team 2 · 1');
    // Personne n'est encore vu dans le clan de sa team.
    expect(fiche).toMatch(/> ⏳ <:th1\d:e1\d> /);
    // Le rappel : chaque joueur mentionné (notifié) sous son équipe, et les boutons des clans.
    const notice = discord.sent.at(-1)!.reply;
    expect(notice.content).toContain('Les équipes de la FW #41 sont prêtes');
    expect(notice.content).toMatch(/🟣 \*\*FW-Team 1\*\*\n<@u-/);
    expect([...(notice.mentionUsers ?? [])].sort()).toEqual(['u-autre', 'u-chef']);
    expect(JSON.stringify(notice.components)).toContain('"url":"https://clan.test/2"');
    // Le lien des clans est dans l'annonce des équipes, pas sur la fiche.
    expect(JSON.stringify(discord.latest(signupId)!.components)).not.toContain('Rejoindre');

    // Arrivé en cours de route : dans l'équipe la moins remplie.
    const late = { id: 'u-retard', name: 'Retard', permissions: '0' };
    await db()
      .prepare(
        "INSERT INTO discord_accounts (discord_id, player_tag, player_name, town_hall) VALUES ('u-retard', '#LATE', 'Retard', 16)",
      )
      .run();
    const lateReply = await fwComponent(click(`fw:join:${e.id}`, late), ctx);
    expect((await signupsOf(db(), e.id)).find((s) => s.tag === '#LATE')?.team).toBe('vert');
    // Il reçoit le bouton pour rejoindre le clan de sa team.
    const lateButtons = JSON.stringify(lateReply.kind === 'reply' && lateReply.reply.components);
    expect(lateButtons).toContain('"label":"Rejoindre la FW-Team 2","url":"https://clan.test/2"');
    expect(lateButtons).not.toContain('FW-Team 1');

    // Rééquilibrage par un modo.
    const moved = await runCommand(fw('deplacer', { compte: '#PQ9', equipe: 'violet' }), ctx);
    expect(moved.content).toContain('passe dans la FW-Team 1');
    await settle();
  });

  it('déplacer avant le tirage : refusé', async () => {
    const { ctx, e } = await launched();
    await signTag(ctx, e.id, '#PQ2');
    const reply = await runCommand(fw('deplacer', { compte: '#PQ2', equipe: 'vert' }), ctx);
    expect(reply.content).toMatch(/pas encore faites/);
  });
});

describe('équipes libres : chacun choisit la sienne', () => {
  it('deux boutons ; un compte dans chaque équipe ; passer de l’une à l’autre', async () => {
    const { ctx, discord, settle, e, signupId } = await launched('libre');
    const fiche = discord.sent.find((m) => m.channel === 'c-inscription')!.reply;
    expect(JSON.stringify(fiche.components)).toMatch(/fw:join:\d+:violet.*fw:join:\d+:vert/);
    expect(blockText(fiche)).toContain('### 🟣 FW-Team 1 · 0');

    // Équipes au choix : le lien du clan n'arrive qu'avec l'annonce des équipes (H − 10).
    const tagged = await fwComponent(click(`fw:tag:${e.id}:violet`, MEMBER, { tag: '#PQ2' }), ctx);
    const reply = tagged.kind === 'deferred' ? await tagged.run() : null;
    expect(JSON.stringify(reply?.components)).not.toContain('Rejoindre');
    await signTag(ctx, e.id, '#PQ8', MEMBER, ':vert');
    const team = async (tag: string) =>
      (await signupsOf(db(), e.id)).find((s) => s.tag === tag)?.team;
    expect(await team('#PQ2')).toBe('violet');
    expect(await team('#PQ8')).toBe('vert');

    // Dans la liste de l'équipe verte, on coche les deux : Rags passe en vert.
    await fwComponent(click(`fw:pick:${e.id}:vert`, MEMBER, { values: ['#PQ2', '#PQ8'] }), ctx);
    expect(await team('#PQ2')).toBe('vert');
    // On décoche Rags 2 dans la verte : il n'est plus inscrit.
    await fwComponent(click(`fw:pick:${e.id}:vert`, MEMBER, { values: ['#PQ2'] }), ctx);
    expect(await team('#PQ8')).toBeUndefined();

    await settle();
    expect(discord.sheet(signupId)).toContain('### 🟢 FW-Team 2 · 1');
    expect(JSON.stringify(discord.latest(signupId)!.components)).not.toContain('Rejoindre');
  });
});

describe('fiche : qui a rejoint le clan de sa team ?', () => {
  /** Les membres des clans des deux teams (#A : FW-Team 1, #B : FW-Team 2), modifiables. */
  function game() {
    const members: Record<string, string[]> = { '#A': [], '#B': [] };
    const coc = fakeCoc({}, undefined, undefined, members);
    return { members, coc };
  }
  const due = (now: number) => eveningsCheckingClans(db(), now);

  it('✅ dans le bon clan, ⚠️ dans celui de l’autre team, ⏳ pas encore ; la fiche suit', async () => {
    const { ctx, discord, settle, e, signupId } = await launched('libre');
    await signTag(ctx, e.id, '#PQ2', MEMBER, ':violet');
    await signTag(ctx, e.id, '#PQ8', MEMBER, ':violet');
    await signTag(ctx, e.id, '#PQ9', OTHER_MEMBER, ':vert');
    await settle();

    const { members, coc } = game();
    members['#A'] = ['#PQ2'];
    members['#B'] = ['#PQ8']; // Rags 2 est allé dans le clan de l'autre team
    expect(await checkClans(ctx, coc, due)).toBe(3);
    const fiche = discord.sheet(signupId);
    expect(fiche).toContain('> ✅ <:th18:e18> Rags · <@u-chef>');
    expect(fiche).toContain('> ⚠️ <:th17:e17> Rags 2 · <@u-chef>');
    expect(fiche).toContain('> ⏳ <:th18:e18> Fight · <@u-autre>');
    expect(fiche).toContain('-# ✅ dans le clan de sa team · ⏳ pas encore');

    // Rien n'a bougé : la fiche n'est pas modifiée (2 appels au jeu, c'est tout).
    const edits = discord.edits.length;
    coc.calls.length = 0;
    expect(await checkClans(ctx, coc, due)).toBe(0);
    expect(discord.edits.length).toBe(edits);
    expect(coc.calls).toEqual(['members #A', 'members #B']);

    // Fight rejoint sa team.
    members['#B'] = ['#PQ8', '#PQ9'];
    expect(await checkClans(ctx, coc, due)).toBe(1);
    expect(discord.sheet(signupId)).toContain('> ✅ <:th18:e18> Fight · <@u-autre>');
  });

  it('jeu injoignable : l’état connu reste ; plus vérifié 1 h après le début', async () => {
    const { ctx, settle, e } = await launched('libre');
    await signTag(ctx, e.id, '#PQ2', MEMBER, ':violet');
    await settle();
    const { members, coc } = game();
    members['#A'] = ['#PQ2'];
    await checkClans(ctx, coc, due);

    const offline = {
      clanMembers: async () => ({ ok: false as const, error: 'unavailable' as const }),
    };
    expect(await checkClans(ctx, offline, due)).toBe(0);
    expect((await signupsOf(db(), e.id))[0].inClan).toBe('violet');

    members['#A'] = [];
    expect(await checkClans({ ...ctx, now: () => START + 61 * 60_000 }, coc, due)).toBe(0);
    expect((await signupsOf(db(), e.id))[0].inClan).toBe('violet');
  });

  it('équipes tirées au sort : pseudo et @Discord dès l’inscription, ✅ ⏳ ⚠️ dès le tirage', async () => {
    const { ctx, discord, settle, e, signupId } = await launched('random');
    await signTag(ctx, e.id, '#PQ2');
    await signTag(ctx, e.id, '#PQ9', OTHER_MEMBER);
    await settle();
    // Avant le tirage : la liste des inscrits (personne n'a encore d'équipe, donc pas d'état).
    expect(await due(NOW_FW)).toEqual([]);
    const before = discord.sheet(signupId);
    expect(before).toContain('### Inscrits · 2');
    expect(before).toContain('> <:th18:e18> Rags · <@u-chef>');
    expect(before).not.toMatch(/[✅⏳⚠️]/u);

    // H − 10 : le tirage ; la vérification dans le jeu commence.
    const draw = { ...ctx, now: () => START - 10 * 60_000 };
    await runFwSchedule(draw, (now) => eveningsNeedingTeams(db(), now));
    expect((await due(START - 10 * 60_000)).map((x) => x.id)).toEqual([e.id]);
    const teams = new Map((await signupsOf(db(), e.id)).map((s) => [s.tag, s.team]));
    const { members, coc } = game();
    // Rags rejoint le clan de SA team ; Fight va dans le clan de l'autre team.
    const clanOf = (t: string | null | undefined) => (t === 'violet' ? '#A' : '#B');
    const other = (t: string | null | undefined) => (t === 'violet' ? '#B' : '#A');
    members[clanOf(teams.get('#PQ2'))].push('#PQ2');
    members[other(teams.get('#PQ9'))].push('#PQ9');
    expect(await checkClans(draw, coc, due)).toBe(2);
    const after = discord.sheet(signupId);
    expect(after).toContain('> ✅ <:th18:e18> Rags · <@u-chef>');
    expect(after).toContain('> ⚠️ <:th18:e18> Fight · <@u-autre>');
  });

  it('soirée lancée avant la nouvelle fiche : l’ancienne fiche, pas de vérification', async () => {
    const { ctx, discord, settle, e, signupId } = await launched('libre');
    await db().prepare('UPDATE fw_evenings SET sheet_v2 = 0 WHERE id = ?').bind(e.id).run();
    await signTag(ctx, e.id, '#PQ2', MEMBER, ':violet');
    await settle();
    const fiche = discord.latest(signupId)!;
    expect(fiche.v2).toBeUndefined();
    expect(fiche.content).toContain('🟣 **FW-Team 1 (1)**');
    expect(JSON.stringify(fiche.components)).not.toContain('Rejoindre');
    expect(await due(NOW_FW)).toEqual([]);
  });
});

describe('/fw modifier, /fw bilan, /fw annuler', () => {
  it('modifier : la fiche et l’annonce suivent', async () => {
    const { ctx, discord, e, signupId } = await launched();
    const reply = await runCommand(fw('modifier', { heure: '21h30', rounds: '3 rounds' }), ctx);
    expect(reply.content).toContain('mercredi 28/10 à 21h30');
    expect(discord.sheet(signupId)).toContain('mercredi 28/10 à 21h30');
    expect((await currentEvening(db()))?.details.rounds).toBe('3 rounds');
    const announce = discord.latest(e.announce!.message)!;
    expect(announce.content).toContain('jusqu’à **21h15**');
    expect(announce.files?.[0].name).toBe('fw-41.png');
  });

  it('modifier une soirée lancée avec l’ancienne fiche : elle passe au nouveau design', async () => {
    const { ctx, discord, e, signupId } = await launched('random');
    await db().prepare('UPDATE fw_evenings SET sheet_v2 = 0 WHERE id = ?').bind(e.id).run();
    await signTag(ctx, e.id, '#PQ2');
    const announceEdits = () => discord.edits.filter((x) => x.id === e.announce!.message).length;
    const before = announceEdits();

    // Sans rien changer : juste le nouveau design, sur le même message.
    const reply = await runCommand(fw('modifier'), ctx);
    expect(reply.content).toBe('✅ Fiche de la **FW #41** passée au nouveau design.');
    expect(discord.latest(signupId)!.v2).toBe(true);
    expect(discord.sheet(signupId)).toContain('> <:th18:e18> Rags · <@u-chef>');
    expect((await getEvening(db(), e.id))?.sheetV2).toBe(true);
    // L'annonce n'est pas retouchée pour rien.
    expect(announceEdits()).toBe(before);
  });

  it('Discord refuse de transformer l’ancienne fiche : la nouvelle juste en dessous', async () => {
    const { ctx, discord, e, signupId } = await launched('random');
    await db().prepare('UPDATE fw_evenings SET sheet_v2 = 0 WHERE id = ?').bind(e.id).run();
    const edit = discord.api.edit;
    const picky = {
      ...discord.api,
      edit: async (c: string, id: string, r: Reply) =>
        id === signupId && r.v2 ? false : edit(c, id, r),
    };
    const reply = await runCommand(fw('modifier'), { ...ctx, discord: picky });
    expect(reply.content).toContain('Nouvelle fiche de la **FW #41** postée dans <#c-inscription>');
    expect(discord.latest(signupId)!.content).toContain('cette fiche est remplacée');
    expect(discord.latest(signupId)!.components).toEqual([]);
    const now = (await getEvening(db(), e.id))!;
    expect(now.signup?.message).not.toBe(signupId);
    expect(discord.latest(now.signup!.message)!.v2).toBe(true);
  });

  it('bilan : top 5 de la soirée dans #résultats ; la fiche se ferme', async () => {
    const { ctx, discord, e, signupId } = await launched();
    expect((await runCommand(fw('bilan'), ctx)).content).toMatch(/rien à publier/);

    await threeWars();
    const shots: Shot[] = [];
    const later = {
      ...ctx,
      now: () => START + 2 * 3_600_000,
      capture: async (list: readonly Shot[]) => (shots.push(...list), [FAKE_PNG]),
    };
    const reply = await runCommand(fw('bilan'), later);
    expect(reply.content).toContain('publié dans <#c-resultats>');

    // Le tableau du top 5, en image, avec un mot et le lien des stats.
    const recap = discord.sent.find((s) => s.channel === 'c-resultats')!.reply;
    expect(recap.content).toBe(
      '🌙 **Bilan de la FW #41** · 📊 Toutes les stats : ' +
        'https://site.test/joueurs?type=fw&semaine=2026-10-26',
    );
    expect(recap.files?.[0].name).toBe('bilan-fw-41.png');
    const shot = shots.find((x) => x.kind === 'recap');
    const q = new URLSearchParams(shot?.kind === 'recap' ? shot.query : '');
    expect(q.get('n')).toBe('41');
    expect(q.get('w')).toBe('3');
    const top = JSON.parse(q.get('top')!) as unknown[][];
    expect(top).toHaveLength(5);
    expect(top[0]).toEqual(['Joueur 0', 18, 3, 3, 99, 0]);
    expect(JSON.stringify(top)).not.toContain('Remplissage');

    expect((await getEvening(db(), e.id))?.closed).toBe(true);
    expect(discord.sheet(signupId)).toContain('Soirée terminée');
    expect(JSON.stringify(discord.latest(signupId)!.components)).not.toContain('custom_id');
    expect(await textOf(await fwComponent(click(`fw:join:${e.id}`), ctx))).toMatch(/est terminée/);
  });

  it('bilan à refaire : sans soirée en cours, republie celui de la dernière', async () => {
    const { ctx, discord } = await launched();
    await threeWars();
    const later = { ...ctx, now: () => START + 2 * 3_600_000 };
    await runCommand(fw('bilan'), later);
    // Une FW le lendemain : elle ne compte pas dans le bilan de la soirée.
    await addWar(START + 24 * 3_600_000, [
      { tag: '#LENDEMAIN', name: 'Lendemain', attacks: 1, stars: 3, destruction: 100 },
    ]);
    const shots: Shot[] = [];
    const nextDay = {
      ...ctx,
      now: () => START + 26 * 3_600_000,
      capture: async (list: readonly Shot[]) => (shots.push(...list), [FAKE_PNG]),
    };
    const reply = await runCommand(fw('bilan'), nextDay);
    expect(reply.content).toContain('Bilan de la FW #41 republié dans <#c-resultats>');
    expect(discord.sent.filter((s) => s.channel === 'c-resultats')).toHaveLength(2);
    const shot = shots.find((x) => x.kind === 'recap');
    const q = new URLSearchParams(shot?.kind === 'recap' ? shot.query : '');
    expect(q.get('w')).toBe('3');
    expect(q.get('top')).not.toContain('Lendemain');
  });

  it('bilan sans image (navigateur en panne) : le top 5 en texte', async () => {
    const { ctx, discord } = await launched();
    await threeWars();
    const broken = {
      ...ctx,
      now: () => START + 2 * 3_600_000,
      capture: async () => {
        throw new Error('quota');
      },
    };
    await runCommand(fw('bilan'), broken);
    const recap = discord.sent.find((s) => s.channel === 'c-resultats')!.reply;
    expect(recap.files).toBeUndefined();
    expect(recap.content.split('\n')[2]).toMatch(/^🥇 \*\*Joueur 0\*\* — 3,00 ★\/attaque/);
  });

  it('bilan complet : chaque joueur des deux équipes, en image, posté ici seulement', async () => {
    const { ctx, discord, e } = await launched();
    expect((await runCommand(fw('bilan-complet'), ctx)).content).toMatch(/rien à montrer/);

    await threeWars();
    // Un joueur de la FW-Team 2 (camp adverse), avec le détail de son attaque.
    await db()
      .prepare(
        `INSERT INTO fw_players (war_id, side, clan_tag, player_tag, player_name, town_hall,
           map_position, attacks, stars, destruction_sum, triples, duration, targets)
         VALUES ((SELECT MIN(id) FROM friendly_wars), 'away', '#B', '#V1', 'Vert 1', 17, 1, 1, 2, 88, 0, 140, ?)`,
      )
      .bind(JSON.stringify([{ position: 2, stars: 2, destruction: 88, durationSec: 140 }]))
      .run();
    const shots: Shot[] = [];
    const later = {
      ...ctx,
      now: () => START + 2 * 3_600_000,
      capture: async (list: readonly Shot[]) => (shots.push(...list), [FAKE_PNG]),
    };
    const before = discord.sent.length;
    const reply = await runCommand(fw('bilan-complet'), later);
    expect(reply.content).toBe('📋 **Bilan complet de la FW #41** · mercredi 28/10');
    expect(reply.publicFollowUp).toBe(true);
    expect(reply.files?.[0].name).toBe('bilan-complet-fw-41.png');
    // Rien posté ailleurs, et la soirée n'est pas fermée.
    expect(discord.sent).toHaveLength(before);
    expect((await getEvening(db(), e.id))?.closed).toBe(false);

    const shot = shots.find((x) => x.kind === 'fullRecap');
    expect(shot?.kind === 'fullRecap' && shot.wars).toBe(3);
    const q = new URLSearchParams(shot?.kind === 'fullRecap' ? shot.query : '');
    const full = parseFullRecap(q.get('n')!, q.get('d')!, q.get('s')!, q.get('b')!)!;
    expect(full.number).toBe(41);
    expect(full.wars.map((w) => w.winner)).toEqual([1, 1, 1]);
    expect(full.teams[0].map((p) => p.name)).toContain('Joueur 0');
    expect(full.teams[1]).toEqual([
      {
        name: 'Vert 1',
        th: 17,
        wars: [[{ stars: 2, destruction: 88, target: 2, seconds: 140 }], null, null],
      },
    ]);
  });

  it('bilan complet : par numéro ; numéro inconnu ou image impossible, réponse privée', async () => {
    const { ctx } = await launched();
    await threeWars();
    const later = { ...ctx, now: () => START + 2 * 3_600_000 };
    const unknown = await runCommand(fw('bilan-complet', { numero: 7 }), later);
    expect(unknown.content).toMatch(/Pas de FW #7/);
    expect(unknown.publicFollowUp).toBeUndefined();
    const ok = await runCommand(fw('bilan-complet', { numero: 41 }), later);
    expect(ok.publicFollowUp).toBe(true);
    const broken = await runCommand(fw('bilan-complet'), {
      ...later,
      capture: async () => {
        throw new Error('quota');
      },
    });
    expect(broken.content).toMatch(/Impossible de créer l'image/);
    expect(broken.publicFollowUp).toBeUndefined();
  });

  it('annuler : la fiche le dit', async () => {
    const { ctx, discord, signupId } = await launched();
    expect((await runCommand(fw('annuler'), ctx)).content).toContain('FW #41');
    expect(discord.sheet(signupId)).toContain('Soirée annulée');
  });
});

// ------------------------------------------------------------ statistiques

/** Une FW terminée, lancée à `start` (ms), avec les lignes des joueurs. */
async function addWar(
  start: number,
  players: { tag: string; name: string; attacks: number; stars: number; destruction: number }[],
): Promise<void> {
  const key = `${start}|#A|#B`;
  await db()
    .prepare(
      `INSERT INTO friendly_wars (war_key, started_at, ended_at, team_size, home_tag, home_name,
         home_stars, home_destruction, home_duration, away_tag, away_name, away_stars,
         away_destruction, away_duration, winner)
       VALUES (?, ?, ?, 5, '#A', 'FW-team1', 10, 80, 600, '#B', 'FW-team2', 9, 70, 600, 'home')`,
    )
    .bind(key, toSqliteTime(start), toSqliteTime(start + 15 * 60_000))
    .run();
  for (const p of players) {
    await db()
      .prepare(
        `INSERT INTO fw_players (war_id, side, clan_tag, player_tag, player_name, town_hall,
           map_position, attacks, stars, destruction_sum, triples, duration)
         VALUES ((SELECT id FROM friendly_wars WHERE war_key = ?), 'home', '#A', ?, ?, 18, 1, ?, ?, ?, 0, ?)`,
      )
      .bind(key, p.tag, p.name, p.attacks, p.stars, p.destruction * p.attacks, 150 * p.attacks)
      .run();
  }
}

async function threeWars(): Promise<void> {
  const players = (stars: number[]) =>
    stars.map((s, i) => ({
      tag: `#P${i}`,
      name: `Joueur ${i}`,
      attacks: 1,
      stars: s,
      destruction: 60 + s * 13,
    }));
  // Joueur 5 ne fait qu'une attaque (classé quand même, au prorata) ; « Remplissage » aucune.
  await addWar(START, [
    ...players([3, 2, 2, 1, 3, 3]),
    { tag: '#P6', name: 'Remplissage', attacks: 0, stars: 0, destruction: 0 },
  ]);
  await addWar(START + 20 * 60_000, players([3, 3, 2, 2, 2]));
  await addWar(START + 40 * 60_000, players([3, 2, 3, 2, 1]));
}

describe('récap de chaque FW dans #statistiques-joueurs', () => {
  it('le tableau en image, sans ping ; pas pour une vieille FW ; rien sans salon', async () => {
    await threeWars();
    const ids = (
      await db().prepare('SELECT id FROM friendly_wars ORDER BY id').all<{ id: number }>()
    ).results.map((r) => r.id);
    const { announcer, inChannel, shots } = fakeAnnouncer();
    const soon = START + 60 * 60_000;
    expect(await postFwRecaps(db(), announcer, ids, 'https://site.test', soon)).toBe(3);
    expect(shots[0]).toEqual(ids.map((id) => ({ kind: 'fw', id })));
    const [first] = inChannel('stats');
    expect(first.content).toBe(
      '⚔️ FW terminée · **FW-team1** 10 ★ – 9 ★ **FW-team2** · victoire de **FW-team1**',
    );
    expect(first.files?.[0].name).toBe(`fw-${ids[0]}.png`);
    expect(first.mentionRoles).toBeUndefined();
    expect(first.mentionUsers).toBeUndefined();

    // Une FW finie il y a plus de 3 heures (rattrapage) : rien.
    expect(
      await postFwRecaps(db(), announcer, ids, 'https://site.test', START + 6 * 3_600_000),
    ).toBe(0);
    const off = { ...announcer, can: () => false };
    expect(await postFwRecaps(db(), off, ids, 'https://site.test', soon)).toBe(0);
  });

  it('image impossible : le texte et le lien', async () => {
    await threeWars();
    const [{ id }] = (
      await db().prepare('SELECT id FROM friendly_wars LIMIT 1').all<{ id: number }>()
    ).results;
    const { announcer, inChannel } = fakeAnnouncer({ failCapture: true });
    await postFwRecaps(db(), announcer, [id], 'https://site.test', START + 60 * 60_000);
    expect(inChannel('stats')[0].content).toContain(`https://site.test/fw/${id}`);
  });
});

describe('top 10 de la semaine, le lundi', () => {
  const MONDAY_10H = Date.UTC(2026, 10, 2, 9, 5); // lundi 02/11, 10h05 à Paris

  it('lundi 10 h : le top de la semaine passée, une seule fois', async () => {
    await threeWars();
    const { announcer, inChannel } = fakeAnnouncer();
    expect(await postWeeklyTop(db(), announcer, 'https://site.test', MONDAY_10H - 3_600_000)).toBe(
      false,
    );
    expect(await postWeeklyTop(db(), announcer, 'https://site.test', MONDAY_10H)).toBe(true);
    const [top] = inChannel('stats');
    expect(top.content).toMatch(
      /^📅 \*\*Top FW de la semaine\*\* \(du 26\/10 au 01\/11\) · 3 FW jouées/,
    );
    // 4 attaques minimum sur la semaine : personne n'en a assez ici.
    expect(top.content).toContain("Pas assez d'attaques");
    expect(await postWeeklyTop(db(), announcer, 'https://site.test', MONDAY_10H + 60_000)).toBe(
      false,
    );
  });

  it('salon des stats non configuré : rien', async () => {
    await threeWars();
    const { announcer, posted } = fakeAnnouncer();
    const off = { ...announcer, can: () => false };
    expect(await postWeeklyTop(db(), off, 'https://site.test', MONDAY_10H)).toBe(false);
    expect(posted).toEqual([]);
  });
});

describe('classement de la semaine (site)', () => {
  it('seulement les FW lancées entre lundi 0 h et le lundi suivant', async () => {
    await threeWars(); // semaine du 26/10
    await addWar(Date.UTC(2026, 9, 25, 18), [
      { tag: '#P0', name: 'Joueur 0', attacks: 1, stars: 1, destruction: 50 },
      { tag: '#OLD', name: 'Ancien', attacks: 1, stars: 3, destruction: 100 },
    ]); // dimanche 25/10 : semaine précédente

    const week = await listFwPlayers(db(), weekRange('2026-10-26'));
    expect(week.find((p) => p.tag === '#P0')).toMatchObject({ wars: 3, stars: 9 });
    expect(week.some((p) => p.tag === '#OLD')).toBe(false);
    expect((await listFwPlayers(db())).find((p) => p.tag === '#P0')).toMatchObject({ wars: 4 });
    expect(await listFriendlyWars(db(), 30, weekRange('2026-10-26'))).toHaveLength(3);
  });
});

it('l’heure de test est bien un mardi soir', () => {
  expect(new Date(NOW_FW).getUTCDay()).toBe(2);
});

describe('bannière de la fiche selon l’HDV du format', () => {
  const cfg = {
    bannerUrl: 'https://site.test/brand/discord/fw-inscriptions.jpg?v=1',
    bannerByTh: { 19: 'https://site.test/brand/discord/fw-inscriptions-19.jpg?v=1' },
  };
  const d = (format: string, accepted = 'HDV 17 et HDV 16 acceptés') => ({ format, accepted });
  it('l’HDV du format, sinon le plus haut accepté ; HDV 18 : celle par défaut', () => {
    expect(sheetBanner(cfg, d('HDV 19 mode e-sport'))).toBe(cfg.bannerByTh[19]);
    expect(sheetBanner(cfg, d('hdv19'))).toBe(cfg.bannerByTh[19]);
    expect(sheetBanner(cfg, d('HDV 18 mode e-sport'))).toBe(cfg.bannerUrl);
    // La FW #46 : « Mode e-sport », « FULL HDV18 et HDV19 ».
    expect(sheetBanner(cfg, d('Mode e-sport', 'FULL HDV18 et HDV19'))).toBe(cfg.bannerByTh[19]);
    expect(sheetBanner(cfg, d('Mode e-sport'))).toBe(cfg.bannerUrl);
    expect(sheetBanner({ bannerUrl: '' }, d('HDV 19'))).toBe('');
  });
});
