import type { CocWar, CocWarMember } from '../../src/app/core/tournament/coc-war';
import type { ClanRef } from '../../src/app/core/tournament/models';
import type { BotContext } from '../src/discord/bot';
import type { Interaction } from '../src/discord/types';
import type { CocClient, CocResult } from '../src/coc';

/** Clans de test (tags valides : alphabet du jeu). */
export const CLANS: readonly ClanRef[] = [
  { tag: '#2PPP', name: 'Les Pikachus' },
  { tag: '#2QQQ', name: 'Titans FR' },
  { tag: '#2RRR', name: 'Orion' },
  { tag: '#2UUU', name: 'Vega' },
  { tag: '#2VVV', name: 'Lyra' },
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
  } = {},
): CocWar {
  const { homeStars = [3, 3, 2, 2, 2], awayStars = [2, 2, 2, 2, 1], townHall = 18 } = options;
  const side = (clan: ClanRef, stars: number[], prefix: string) => {
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
    clan: side(home, homeStars, 'H'),
    opponent: side(away, awayStars, 'A'),
  };
}

/** Faux client du jeu : connaît quelques clans et quelques guerres. */
export function fakeCoc(
  wars: Record<string, CocResult<CocWar>> = {},
  clans: readonly ClanRef[] = CLANS,
): CocClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async clan(tag) {
      calls.push(`clan ${tag}`);
      const clan = clans.find((c) => c.tag === tag);
      return clan ? { ok: true, value: clan } : { ok: false, error: 'not-found' };
    },
    async currentWar(tag) {
      calls.push(`war ${tag}`);
      return wars[tag] ?? { ok: true, value: { state: 'notInWar' } };
    },
  };
}

/** Fausse image PNG : les 8 octets de signature d'un vrai fichier PNG. */
export const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function botContext(db: D1Database, coc: CocClient = fakeCoc()): BotContext {
  return {
    db,
    coc,
    siteUrl: 'https://site.test',
    random: seededRandom(),
    captureBracket: async () => FAKE_PNG,
  };
}

// ------------------------------------------------------------ interactions Discord

/** Permissions Discord : 0 = membre simple, 32 = « Gérer le serveur ». */
export const MEMBER = { id: 'u-chef', name: 'Chef', permissions: '0' };
export const OTHER_MEMBER = { id: 'u-autre', name: 'Autre', permissions: '0' };
export const ADMIN = { id: 'u-admin', name: 'Zeus', permissions: '32' };

type Who = typeof MEMBER;
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
