import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { weekRange } from '../../src/app/core/fw/evening';
import type { BotContext, Reply } from '../src/discord/bot';
import { runCommand } from '../src/discord/bot';
import { fwComponent, runFwSchedule, type ComponentResponse } from '../src/discord/fw';
import type { DiscordApi } from '../src/discord/rest';
import type { Interaction } from '../src/discord/types';
import {
  currentEvening,
  eveningsNeedingTeams,
  getEvening,
  postWeeklyTop,
  signupsOf,
} from '../src/fw-evenings';
import { toSqliteTime } from '../src/repository';
import { listFriendlyWars, listFwPlayers } from '../src/stats-repository';
import {
  MEMBER,
  MODO,
  NOW_FW,
  OTHER_MEMBER,
  botContext,
  fakeAnnouncer,
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
  return { api, sent, edits, latest };
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
function fw(sub: string, values: Record<string, string | number> = {}, who: Who = MODO): Interaction {
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

    // L'annonce d'abord, puis la fiche d'inscription.
    const [announce, signup] = discord.sent;
    expect(signup.channel).toBe('c-inscription');
    expect(signup.reply.content).toContain('📝 **FW #41** · mercredi 28/10 à 21h00');
    expect(signup.reply.content).toContain('Fin des inscriptions : **20h45**');
    expect(signup.reply.content).toContain(
      'Équipes affichées vers **20h50** (rééquilibrages possibles)',
    );
    expect(signup.reply.content).toContain(
      'HDV 18 mode e-sport · 5 min de préparation · 15 min de guerre · 1 attaque par joueur · ' +
        'Plusieurs rounds · HDV 17 et HDV 16 acceptés',
    );
    expect(signup.reply.content).toContain('<#c-tickets>');
    expect(JSON.stringify(signup.reply.components)).toMatch(/fw:join:\d+".*fw:add:\d+".*fw:leave/);

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
    const fiche = discord.sent.find((m) => m.channel === 'c-inscription')!.reply.content;
    expect(fiche).toContain('**FW #50**');
    expect(fiche).toContain('4 rounds · HDV 17 accepté');
    expect(fiche).toContain('Fin des inscriptions : **20h15**');
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

  it('sans jeton du bot : refusé, avec l’explication', async () => {
    const reply = await runCommand(fw('lancer', { date: '28/10', heure: '21h' }), botContext(db()));
    expect(reply.content).toMatch(/DISCORD_BOT_TOKEN/);
  });

  it('#inscription inaccessible : rien n’est publié', async () => {
    const { ctx } = setup();
    const blocked = { ...ctx, discord: { ...ctx.discord!, send: async () => null } };
    const reply = await runCommand(fw('lancer', { date: '28/10', heure: '21h' }), blocked);
    expect(reply.content).toMatch(/Impossible de poster dans <#c-inscription>/);
    expect(await currentEvening(db())).toBeNull();
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

    const fiche = discord.latest(signupId)!.content;
    expect(fiche).toContain('**Inscrits (2)**');
    expect(fiche).toContain('<:th18:e18> Rags');
    expect(fiche).toContain('<:th17:e17> Rags 2');
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
    const fiche = discord.latest(signupId)!.content;
    expect(fiche).toContain('🟣 **FW-Team 1 (2)**');
    expect(fiche).toContain('🟢 **FW-Team 2 (1)**');
    expect(discord.sent.at(-1)?.reply.content).toContain('Les équipes de la FW #41 sont prêtes');
    // Équipes faites : un bouton par équipe ouvre son clan dans le jeu.
    const links = JSON.stringify(discord.latest(signupId)!.components);
    expect(links).toContain('"label":"Rejoindre la FW-Team 1","url":"https://clan.test/1"');
    expect(links).toContain('"label":"Rejoindre la FW-Team 2","url":"https://clan.test/2"');

    // Arrivé en cours de route : dans l'équipe la moins remplie.
    const late = { id: 'u-retard', name: 'Retard', permissions: '0' };
    await db()
      .prepare(
        "INSERT INTO discord_accounts (discord_id, player_tag, player_name, town_hall) VALUES ('u-retard', '#LATE', 'Retard', 16)",
      )
      .run();
    const lateReply = await textOf(await fwComponent(click(`fw:join:${e.id}`, late), ctx));
    expect((await signupsOf(db(), e.id)).find((s) => s.tag === '#LATE')?.team).toBe('vert');
    // Il reçoit le lien du clan de sa team.
    expect(lateReply).toContain('👉 Rejoins le clan de ta team : [FW-Team 2](https://clan.test/2)');

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
    expect(fiche.content).toContain('Équipes au choix');

    await signTag(ctx, e.id, '#PQ2', MEMBER, ':violet');
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
    expect(discord.latest(signupId)!.content).toContain('🟢 **FW-Team 2 (1)**');
  });
});

describe('/fw modifier, /fw bilan, /fw annuler', () => {
  it('modifier : la fiche et l’annonce suivent', async () => {
    const { ctx, discord, e, signupId } = await launched();
    const reply = await runCommand(fw('modifier', { heure: '21h30', rounds: '3 rounds' }), ctx);
    expect(reply.content).toContain('mercredi 28/10 à 21h30');
    expect(discord.latest(signupId)!.content).toContain('Fin des inscriptions : **21h15**');
    expect(discord.latest(signupId)!.content).toContain('3 rounds');
    const announce = discord.latest(e.announce!.message)!;
    expect(announce.content).toContain('jusqu’à **21h15**');
    expect(announce.files?.[0].name).toBe('fw-41.png');
  });

  it('bilan : top 5 de la soirée dans #résultats ; la fiche se ferme', async () => {
    const { ctx, discord, e, signupId } = await launched();
    expect((await runCommand(fw('bilan'), ctx)).content).toMatch(/rien à publier/);

    await threeWars();
    const later = { ...ctx, now: () => START + 2 * 3_600_000 };
    const reply = await runCommand(fw('bilan'), later);
    expect(reply.content).toContain('publié dans <#c-resultats>');

    const recap = discord.sent.find((s) => s.channel === 'c-resultats')!.reply.content;
    const lines = recap.split('\n');
    expect(lines[0]).toBe('🌙 **Bilan de la FW #41** du mercredi 28/10 · 3 FW jouées');
    expect(lines[2]).toMatch(/^🥇 \*\*Joueur 0\*\* — 3,00 ★\/attaque · 3 attaques · 99,0 %$/);
    expect(recap).not.toContain('Remplissage');
    expect(recap).toContain('https://site.test/joueurs?type=fw&semaine=2026-10-26');

    expect((await getEvening(db(), e.id))?.closed).toBe(true);
    const fiche = discord.latest(signupId)!;
    expect(fiche.content).toContain('Soirée terminée');
    expect(fiche.components).toEqual([]);
    expect(await textOf(await fwComponent(click(`fw:join:${e.id}`), ctx))).toMatch(/est terminée/);
  });

  it('annuler : la fiche le dit', async () => {
    const { ctx, discord, signupId } = await launched();
    expect((await runCommand(fw('annuler'), ctx)).content).toContain('FW #41');
    expect(discord.latest(signupId)!.content).toContain('Soirée annulée');
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
  // Joueur 5 ne fait qu'une attaque (pas classé) ; « Remplissage » aucune.
  await addWar(START, [
    ...players([3, 2, 2, 1, 3, 3]),
    { tag: '#P6', name: 'Remplissage', attacks: 0, stars: 0, destruction: 0 },
  ]);
  await addWar(START + 20 * 60_000, players([3, 3, 2, 2, 2]));
  await addWar(START + 40 * 60_000, players([3, 2, 3, 2, 1]));
}

describe('top 10 de la semaine, le lundi', () => {
  const MONDAY_10H = Date.UTC(2026, 10, 2, 9, 5); // lundi 02/11, 10h05 à Paris

  it('lundi 10 h : le top de la semaine passée, une seule fois', async () => {
    await threeWars();
    const { announcer, inChannel } = fakeAnnouncer();
    expect(
      await postWeeklyTop(db(), announcer, 'https://site.test', MONDAY_10H - 3_600_000),
    ).toBe(false);
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
