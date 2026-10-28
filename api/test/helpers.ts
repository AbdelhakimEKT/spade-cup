import type { CocWar, CocWarMember } from '../../src/app/core/tournament/coc-war';
import type { ClanRef } from '../../src/app/core/tournament/models';
import type { Announcer, Channel, Outcome } from '../src/announcements';
import type { BotContext, Reply } from '../src/discord/bot';
import type { Shot } from '../src/screens';
import type { Interaction } from '../src/discord/types';
import type { CocClient, CocPlayer, CocResult } from '../src/coc';

/** Clans de test (tags valides : alphabet du jeu). */
export const CLANS: readonly ClanRef[] = [
  { tag: '#2PPP', name: 'Les Pikachus' },
  { tag: '#2QQQ', name: 'Titans FR' },
  { tag: '#2RRR', name: 'Orion' },
  { tag: '#2UUU', name: 'Vega' },
  { tag: '#2VVV', name: 'Lyra' },
];

/** « Maintenant » pour les soirées FW : mardi 27/10/2026, 18 h (heure de Paris). */
export const NOW_FW = Date.UTC(2026, 9, 27, 17);

/** Comptes du jeu de test (inscriptions aux soirées FW). */
export const PLAYERS: readonly CocPlayer[] = [
  { tag: '#PQ2', name: 'Rags', townHall: 18 },
  { tag: '#PQ8', name: 'Rags 2', townHall: 17 },
  { tag: '#PQ9', name: 'Fight', townHall: 18 },
];

/** Hasard reproductible (générateur congruentiel) : même tirage à chaque test. */
export function seededRandom(seed = 42): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

/**
 * Une guerre amicale terminée, au format de l'API du jeu.
 * `stars[i]` = étoiles de l'attaque du joueur i (5 joueurs par camp).
 */
export function fakeWar(
  home: ClanRef,
  away: ClanRef,
  options: {
    homeStars?: number[];
    awayStars?: number[];
    state?: CocWar['state'];
    teamSize?: number;
    townHall?: number;
    /** Lancement de la guerre (format du jeu). Par défaut : dans le futur, donc après le tirage. */
    launchedAt?: string;
  } = {},
): CocWar {
  const { homeStars = [3, 3, 2, 2, 2], awayStars = [2, 2, 2, 2, 1], townHall = 18 } = options;
  // Les joueurs d'un clan sont toujours les mêmes, d'une guerre à l'autre.
  const side = (clan: ClanRef, stars: number[]) => {
    const prefix = `${clan.tag.slice(1)}P`;
    const members: CocWarMember[] = stars.map((s, i) => ({
      tag: `#${prefix}${i + 1}`,
      name: `${clan.name} ${i + 1}`,
      townhallLevel: i === 4 ? townHall : 18,
      mapPosition: i + 1,
      attacks: [
        {
          attackerTag: `#${prefix}${i + 1}`,
          defenderTag: '#X',
          stars: s,
          destructionPercentage: s === 3 ? 100 : 60 + s * 10,
          duration: 150,
        },
      ],
    }));
    const destruction =
      members.reduce((sum, m) => sum + m.attacks![0].destructionPercentage, 0) / stars.length;
    return {
      tag: clan.tag,
      name: clan.name,
      stars: stars.reduce((a, b) => a + b, 0),
      destructionPercentage: destruction,
      members,
    };
  };
  return {
    state: options.state ?? 'warEnded',
    teamSize: options.teamSize ?? 5,
    preparationStartTime: options.launchedAt ?? '20300101T120000.000Z',
    clan: side(home, homeStars),
    opponent: side(away, awayStars),
  };
}

/** Faux client du jeu : connaît quelques clans et quelques guerres. */
export function fakeCoc(
  wars: Record<string, CocResult<CocWar>> = {},
  clans: readonly ClanRef[] = CLANS,
  players: readonly CocPlayer[] = PLAYERS,
): CocClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async clan(tag) {
      calls.push(`clan ${tag}`);
      const clan = clans.find((c) => c.tag === tag);
      return clan ? { ok: true, value: clan } : { ok: false, error: 'not-found' };
    },
    async player(tag) {
      calls.push(`player ${tag}`);
      const player = players.find((x) => x.tag === tag);
      return player ? { ok: true, value: player } : { ok: false, error: 'not-found' };
    },
    async currentWar(tag) {
      calls.push(`war ${tag}`);
      return wars[tag] ?? { ok: true, value: { state: 'notInWar' } };
    },
  };
}

/** Fausse image PNG : les 8 octets de signature d'un vrai fichier PNG. */
export const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Contexte du bot pour les tests. `published` garde ce que le bot a demandé de
 * publier dans les salons (débuts, résultats saisis à la main).
 */
export function botContext(
  db: D1Database,
  coc: CocClient = fakeCoc(),
): BotContext & { published: Outcome[] } {
  const published: Outcome[] = [];
  return {
    db,
    coc,
    siteUrl: 'https://site.test',
    random: seededRandom(),
    now: () => NOW_FW,
    managerRoles: ['r-admin', 'r-modo'],
    capture: async (shots) => shots.map(() => FAKE_PNG),
    publish: (_t, _bracket, outcome) => void published.push(outcome),
    published,
  };
}

/** Un message posté dans un salon. */
export interface Posted {
  readonly channel: Channel;
  readonly reply: Reply;
}

/** Faux salons Discord et faux navigateur : on note ce qui est posté et photographié. */
export function fakeAnnouncer(options: { failCapture?: boolean } = {}) {
  const posted: Posted[] = [];
  const shots: Shot[][] = [];
  const announcer: Announcer = {
    post: async (channel, reply) => void posted.push({ channel, reply }),
    can: () => true,
    capture: async (list) => {
      shots.push([...list]);
      if (options.failCapture) throw new Error('quota du navigateur épuisé');
      return list.map(() => FAKE_PNG);
    },
  };
  const inChannel = (channel: Channel) =>
    posted.filter((p) => p.channel === channel).map((p) => p.reply);
  return { announcer, posted, shots, inChannel };
}

// ------------------------------------------------------------ interactions Discord

/** Permissions Discord : 0 = membre simple, 32 = « Gérer le serveur ». */
export const MEMBER = { id: 'u-chef', name: 'Chef', permissions: '0' };
export const OTHER_MEMBER = { id: 'u-autre', name: 'Autre', permissions: '0' };
export const ADMIN = { id: 'u-admin', name: 'Zeus', permissions: '32' };
/** Un modo : aucune permission particulière, mais le rôle Modo (FW_MANAGER_ROLES). */
export const MODO = { id: 'u-modo', name: 'Athena', permissions: '0', roles: ['r-modo'] };

export interface Who {
  readonly id: string;
  readonly name: string;
  readonly permissions: string;
  readonly roles?: readonly string[];
}
type Values = Record<string, string | number>;

const toOptions = (values: Values, focused?: string) =>
  Object.entries(values).map(([name, value]) => ({
    name,
    type: typeof value === 'number' ? 4 : 3,
    value,
    ...(name === focused ? { focused: true } : {}),
  }));

const memberOf = (who: Who) => ({
  user: { id: who.id, username: who.name },
  permissions: who.permissions,
  ...(who.roles ? { roles: who.roles } : {}),
});

/** « /inscription tag:… » tapé par `who`. */
export function command(name: string, values: Values = {}, who: Who = MEMBER): Interaction {
  return {
    type: 2,
    token: 'jeton',
    application_id: 'app',
    member: memberOf(who),
    data: { name, options: toOptions(values) },
  };
}

/** « /arbitre <sub> … » tapé par `who` (un admin par défaut). */
export function referee(sub: string, values: Values = {}, who: Who = ADMIN): Interaction {
  return {
    type: 2,
    token: 'jeton',
    application_id: 'app',
    member: memberOf(who),
    data: { name: 'arbitre', options: [{ name: sub, type: 1, options: toOptions(values) }] },
  };
}

/** Autocomplétion pendant la saisie de l'option `focused` de « /arbitre <sub> ». */
export function typing(sub: string, values: Values, focused: string): Interaction {
  return {
    type: 4,
    token: 'jeton',
    application_id: 'app',
    member: memberOf(ADMIN),
    data: {
      name: 'arbitre',
      options: [{ name: sub, type: 1, options: toOptions(values, focused) }],
    },
  };
}
