import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/discord/bot';
import { fwComponent, type ComponentResponse } from '../src/discord/fw';
import type { Interaction } from '../src/discord/types';
import {
  dueRecaps,
  getEvening,
  postDueRecaps,
  postWeeklyTop,
  signupsOf,
} from '../src/fw-evenings';
import { toSqliteTime } from '../src/repository';
import { listFriendlyWars, listFwPlayers } from '../src/stats-repository';
import { weekRange } from '../../src/app/core/fw/evening';
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

/** « /fw <sub> … » tapé par `who`. */
function fw(sub: string, values: Record<string, string> = {}, who: Who = MODO): Interaction {
  return {
    type: 2,
    token: 'jeton',
    application_id: 'app',
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
          options: Object.entries(values).map(([name, value]) => ({ name, type: 3, value })),
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

async function newEvening(ctx = botContext(db())): Promise<number> {
  const reply = await runCommand(fw('soiree', { date: '28/10', heure: '20h30' }), ctx);
  const row = await db()
    .prepare('SELECT id FROM fw_evenings ORDER BY id DESC LIMIT 1')
    .first<{ id: number }>();
  expect(reply.components).toBeDefined();
  return row!.id;
}

describe('/fw soiree : l’affiche et les inscriptions', () => {
  it('un modo publie l’affiche avec les boutons ; un membre simple ne peut pas', async () => {
    const ctx = botContext(db());
    const refused = await runCommand(fw('soiree', { date: '28/10', heure: '20h30' }, MEMBER), ctx);
    expect(refused).toEqual({
      content: '❌ Les commandes /fw sont réservées aux admins et aux modos.',
      ephemeral: true,
    });

    const reply = await runCommand(
      fw('soiree', { date: '28/10', heure: '20h30', programme: '3 FW · 15v15' }),
      ctx,
    );
    expect(reply.content).toContain('Inscriptions ouvertes');
    expect(reply.content).toContain('mercredi 28/10 à 20h30');
    expect(reply.content).toContain('en cours de route');
    expect(reply.files?.[0].name).toBe('soiree-fw.png');
    const ids = JSON.stringify(reply.components);
    expect(ids).toMatch(/fw:join:\d+/);
    expect(ids).toMatch(/fw:list:\d+/);
    expect(ids).toMatch(/fw:leave:\d+/);

    const evening = await db().prepare('SELECT * FROM fw_evenings').first<{
      starts_at: string;
      note: string;
      created_by: string;
    }>();
    // 20h30 à Paris, l'hiver = 19h30 UTC.
    expect(evening).toMatchObject({
      starts_at: '2026-10-28 19:30:00',
      note: '3 FW · 15v15',
      created_by: 'Athena',
    });
  });

  it('date passée ou illisible : refusée', async () => {
    const ctx = botContext(db());
    expect((await runCommand(fw('soiree', { date: '26/10', heure: '20h' }), ctx)).content).toMatch(
      /déjà passé/,
    );
    expect((await runCommand(fw('soiree', { date: '28/10', heure: 'tôt' }), ctx)).content).toMatch(
      /Heure illisible/,
    );
  });

  it('affiche impossible (navigateur en panne) : l’annonce part quand même', async () => {
    const ctx = {
      ...botContext(db()),
      capture: async () => {
        throw new Error('quota');
      },
    };
    const reply = await runCommand(fw('soiree', { date: '28/10', heure: '20h30' }), ctx);
    expect(reply.files).toBeUndefined();
    expect(reply.components).toBeDefined();
  });
});

describe('inscriptions par bouton, plusieurs comptes', () => {
  it('1re fois : le tag est demandé, vérifié dans le jeu, retenu, et le compte inscrit', async () => {
    const ctx = botContext(db());
    const id = await newEvening(ctx);

    expect((await fwComponent(click(`fw:join:${id}`), ctx)).kind).toBe('modal');
    const text = await textOf(await fwComponent(click(`fw:tag:${id}`, MEMBER, { tag: 'pq2' }), ctx));
    expect(text).toContain('**Rags** (`#PQ2`, HDV 18) est inscrit');

    // Un 2e compte, puis les deux sont inscrits.
    expect((await fwComponent(click(`fw:add:${id}`), ctx)).kind).toBe('modal');
    await textOf(await fwComponent(click(`fw:tag:${id}`, MEMBER, { tag: '#PQ8' }), ctx));
    expect((await signupsOf(db(), id)).map((s) => s.name)).toEqual(['Rags', 'Rags 2']);
  });

  it('comptes retenus : un seul → un clic l’inscrit ; plusieurs → liste à cocher', async () => {
    const ctx = botContext(db());
    const first = await newEvening(ctx);
    await fwComponent(click(`fw:tag:${first}`, MEMBER, { tag: '#PQ2' }), ctx).then(textOf);

    // Soirée suivante : un clic suffit.
    const second = await newEvening(ctx);
    const oneClick = await fwComponent(click(`fw:join:${second}`), ctx);
    expect(await textOf(oneClick)).toContain('**Rags** est inscrit');
    expect((await signupsOf(db(), second)).map((s) => s.tag)).toEqual(['#PQ2']);

    // Un 2e compte retenu : la liste, avec les comptes déjà inscrits cochés.
    await fwComponent(click(`fw:tag:${second}`, MEMBER, { tag: '#PQ8' }), ctx).then(textOf);
    const third = await newEvening(ctx);
    const list = await fwComponent(click(`fw:join:${third}`), ctx);
    expect(list.kind).toBe('reply');
    expect(await textOf(list)).toContain('Quels comptes inscris-tu');

    // On coche le 2e seulement, puis on change d'avis : les deux.
    const picked = await fwComponent(click(`fw:pick:${third}`, MEMBER, { values: ['#PQ8'] }), ctx);
    expect(picked.kind).toBe('update');
    expect((await signupsOf(db(), third)).map((s) => s.tag)).toEqual(['#PQ8']);
    await fwComponent(click(`fw:pick:${third}`, MEMBER, { values: ['#PQ2', '#PQ8'] }), ctx);
    expect((await signupsOf(db(), third)).map((s) => s.tag).sort()).toEqual(['#PQ2', '#PQ8']);
    // Tout décoché : plus aucun compte inscrit.
    await fwComponent(click(`fw:pick:${third}`, MEMBER, { values: [] }), ctx);
    expect(await signupsOf(db(), third)).toEqual([]);
  });

  it('tag invalide ou inconnu : message clair, rien d’enregistré', async () => {
    const ctx = botContext(db());
    const id = await newEvening(ctx);
    expect(await textOf(await fwComponent(click(`fw:tag:${id}`, MEMBER, { tag: 'abc!' }), ctx))).toMatch(
      /n'est pas un tag valide/,
    );
    expect(await textOf(await fwComponent(click(`fw:tag:${id}`, MEMBER, { tag: '#PQ22' }), ctx))).toMatch(
      /Aucun joueur ne porte le tag #PQ22/,
    );
    expect(await signupsOf(db(), id)).toEqual([]);
  });

  it('liste des inscrits regroupée par personne, et désinscription', async () => {
    const ctx = botContext(db());
    const id = await newEvening(ctx);
    for (const tag of ['#PQ2', '#PQ8']) {
      await fwComponent(click(`fw:tag:${id}`, MEMBER, { tag }), ctx).then(textOf);
    }
    await fwComponent(click(`fw:tag:${id}`, OTHER_MEMBER, { tag: '#PQ9' }), ctx).then(textOf);

    const list = await textOf(await fwComponent(click(`fw:list:${id}`, OTHER_MEMBER), ctx));
    expect(list).toContain('3 comptes inscrits');
    expect(list).toContain('• **Chef** : Rags (HDV 18), Rags 2 (HDV 17)');
    expect(list).toContain('• **Autre** : Fight (HDV 18)');

    const left = await textOf(await fwComponent(click(`fw:leave:${id}`), ctx));
    expect(left).toContain('**Rags**, **Rags 2**');
    expect((await signupsOf(db(), id)).map((s) => s.name)).toEqual(['Fight']);
    expect(await textOf(await fwComponent(click(`fw:leave:${id}`), ctx))).toMatch(/n'étais pas inscrit/);
  });

  it('soirée annulée : plus d’inscriptions', async () => {
    const ctx = botContext(db());
    const id = await newEvening(ctx);
    const cancelled = await runCommand(fw('annuler'), ctx);
    expect(cancelled.content).toMatch(/est annulée/);
    expect((await getEvening(db(), id))?.closed).toBe(true);
    expect(await textOf(await fwComponent(click(`fw:join:${id}`), ctx))).toMatch(/est terminée/);
  });
});

// ------------------------------------------------------------ bilan de la soirée

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

const EVENING_START = Date.UTC(2026, 9, 28, 19, 30); // mercredi 28/10, 20h30 à Paris

async function eveningWithWars(): Promise<number> {
  const id = await newEvening();
  const players = (stars: number[]) =>
    stars.map((s, i) => ({ tag: `#P${i}`, name: `Joueur ${i}`, attacks: 1, stars: s, destruction: 60 + s * 13 }));
  // Trois FW ; Joueur 5 ne fait qu'une attaque (pas classé), Joueur 6 aucune (compte de remplissage).
  await addWar(EVENING_START, [...players([3, 2, 2, 1, 3, 3]), { tag: '#P6', name: 'Remplissage', attacks: 0, stars: 0, destruction: 0 }]);
  await addWar(EVENING_START + 20 * 60_000, players([3, 3, 2, 2, 2]));
  await addWar(EVENING_START + 40 * 60_000, players([3, 2, 3, 2, 1]));
  return id;
}

describe('bilan de la soirée : top 5 des joueurs', () => {
  it('45 minutes après la dernière FW : le top 5 au prorata dans #résultats, une seule fois', async () => {
    await eveningWithWars();
    const lastEnd = EVENING_START + 55 * 60_000;
    const { announcer, inChannel } = fakeAnnouncer();

    // Trop tôt : la soirée continue peut-être.
    expect(await postDueRecaps(db(), announcer, 'https://site.test', lastEnd + 10 * 60_000)).toBe(0);

    expect(await postDueRecaps(db(), announcer, 'https://site.test', lastEnd + 46 * 60_000)).toBe(1);
    const [recap] = inChannel('results');
    const lines = recap.content.split('\n');
    expect(lines[0]).toBe('🌙 **Bilan de la soirée FW du mercredi 28/10** · 3 FW jouées');
    // Joueur 0 : 9 étoiles en 3 attaques ; Joueur 4 : 6 en 2 (venu en cours de route).
    expect(lines[2]).toMatch(/^🥇 \*\*Joueur 0\*\* — 3,00 ★\/attaque · 3 attaques · 99,0 %$/);
    expect(lines[3]).toMatch(/^🥈 \*\*Joueur 1\*\* — 2,33 ★\/attaque/);
    expect(recap.content).not.toContain('Remplissage');
    expect(recap.content).toContain('https://site.test/joueurs?type=fw&semaine=2026-10-26');

    // Déjà publié : plus rien.
    expect(await postDueRecaps(db(), announcer, 'https://site.test', lastEnd + 90 * 60_000)).toBe(0);
    expect(inChannel('results')).toHaveLength(1);
  });

  it('une FW encore en cours : on attend', async () => {
    await eveningWithWars();
    await db()
      .prepare("INSERT INTO fw_snapshots (war_key, war_json, seen_at) VALUES ('x', '{}', '2026-10-28 21:00:00')")
      .run();
    expect(await dueRecaps(db(), 'https://site.test', EVENING_START + 2 * 3_600_000)).toEqual([]);
  });

  it('aucune FW jouée : la soirée se clôt sans message, 8 heures après', async () => {
    const id = await newEvening();
    const { announcer, posted } = fakeAnnouncer();
    expect(await postDueRecaps(db(), announcer, 'https://site.test', EVENING_START + 3_600_000)).toBe(0);
    expect((await getEvening(db(), id))?.closed).toBe(false);
    await postDueRecaps(db(), announcer, 'https://site.test', EVENING_START + 9 * 3_600_000);
    expect(posted).toEqual([]);
    expect((await getEvening(db(), id))?.closed).toBe(true);
  });
});

describe('top de la semaine, le lundi', () => {
  const MONDAY_10H = Date.UTC(2026, 10, 2, 9, 5); // lundi 02/11, 10h05 à Paris

  it('lundi 10 h : le top de la semaine passée, une seule fois', async () => {
    await eveningWithWars();
    const { announcer, inChannel } = fakeAnnouncer();
    expect(await postWeeklyTop(db(), announcer, 'https://site.test', MONDAY_10H - 3_600_000)).toBe(false);
    expect(await postWeeklyTop(db(), announcer, 'https://site.test', MONDAY_10H)).toBe(true);
    const [top] = inChannel('stats');
    expect(top.content).toMatch(/^📅 \*\*Top FW de la semaine\*\* \(du 26\/10 au 01\/11\) · 3 FW jouées/);
    // 4 attaques minimum sur la semaine : personne n'en a assez ici.
    expect(top.content).toContain("Pas assez d'attaques");
    expect(await postWeeklyTop(db(), announcer, 'https://site.test', MONDAY_10H + 60_000)).toBe(false);
  });

  it('salon des stats non configuré : rien', async () => {
    await eveningWithWars();
    const { announcer, posted } = fakeAnnouncer();
    const off = { ...announcer, can: () => false };
    expect(await postWeeklyTop(db(), off, 'https://site.test', MONDAY_10H)).toBe(false);
    expect(posted).toEqual([]);
  });
});

describe('classement de la semaine (site)', () => {
  it('seulement les FW lancées entre lundi 0 h et le lundi suivant', async () => {
    await eveningWithWars(); // semaine du 26/10
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
