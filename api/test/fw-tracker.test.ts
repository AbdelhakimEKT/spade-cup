import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { CocWar } from '../../src/app/core/tournament/coc-war';
import { REAL_FRIENDLY_WAR } from '../../src/testing/real-friendly-war';
import type { CocClient, CocResult } from '../src/coc';
import { fwClans, trackFriendlyWars, warKey } from '../src/fw-tracker';
import {
  getFriendlyWar,
  getPlayerProfile,
  listFriendlyWars,
  listFwPlayers,
} from '../src/stats-repository';

/**
 * Suivi des FW classiques, sur la VRAIE réponse du jeu du 20/10 (FW-team2
 * contre FW-team1, 10 contre 10 ; pseudos anonymisés).
 */
const db = () => env.DB;
const CLANS = fwClans('#2JVUP2PGC, #2CYJPRCG8');
const swapped: CocWar = {
  ...REAL_FRIENDLY_WAR,
  clan: REAL_FRIENDLY_WAR.opponent,
  opponent: REAL_FRIENDLY_WAR.clan,
};

function coc(wars: Record<string, CocResult<CocWar>>): CocClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    clan: async () => ({ ok: false, error: 'not-found' }),
    currentWar: async (tag) => {
      calls.push(tag);
      return wars[tag] ?? { ok: true, value: { state: 'notInWar' } };
    },
  };
}
const ok = (war: CocWar): CocResult<CocWar> => ({ ok: true, value: war });

describe('fwClans et warKey', () => {
  it('lit le réglage FW_CLANS', () => {
    expect(CLANS).toEqual(['#2JVUP2PGC', '#2CYJPRCG8']);
    expect(fwClans(undefined)).toEqual([]);
  });

  it('la même guerre a la même clé, vue de l’un ou l’autre clan', () => {
    expect(warKey(REAL_FRIENDLY_WAR)).toBe(warKey(swapped));
    expect(warKey({ state: 'notInWar' })).toBeNull();
  });
});

describe('trackFriendlyWars', () => {
  it('enregistre une FW terminée UNE fois, avec ses 20 joueurs', async () => {
    const game = coc({ '#2JVUP2PGC': ok(REAL_FRIENDLY_WAR) });
    expect((await trackFriendlyWars(db(), game, CLANS)).current).toBe('recorded');
    expect((await trackFriendlyWars(db(), game, CLANS)).current).toBe('known'); // 5 minutes plus tard

    const [war] = await listFriendlyWars(db());
    expect(war).toMatchObject({
      teamSize: 10,
      home: { tag: '#2JVUP2PGC', name: 'Clan Bleu', stars: 13, destruction: 53.4 },
      away: { tag: '#2CYJPRCG8', name: 'Clan Rouge', stars: 11, destruction: 46.4 },
      winner: 'home',
    });
    expect(war.endedAt).toBe('2026-10-20T19:32:58Z'); // heure de fin donnée par le jeu
    // 20 joueurs dans la guerre, mais 6 n'ont pas attaqué (comptes de lancement) :
    // 14 au classement.
    expect(await listFwPlayers(db())).toHaveLength(14);
  });

  it('vue depuis l’autre clan : même guerre, même ordre des camps, rien en double', async () => {
    await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(REAL_FRIENDLY_WAR) }), CLANS);
    expect((await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(swapped) }), CLANS)).current).toBe(
      'known',
    );
    expect(await listFriendlyWars(db())).toHaveLength(1);
  });

  it('guerre en cours, ou contre un clan extérieur : rien d’enregistré', async () => {
    const during = Date.UTC(2026, 9, 20, 19, 25); // pendant la FW du 20/10
    const live = { ...REAL_FRIENDLY_WAR, state: 'inWar' as const };
    expect(
      (await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(live) }), CLANS, during)).current,
    ).toBe('nothing');

    const outsider = {
      ...REAL_FRIENDLY_WAR,
      opponent: { ...REAL_FRIENDLY_WAR.opponent!, tag: '#2YYYYY' },
    };
    expect(
      (await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(outsider) }), CLANS, during)).current,
    ).toBe('nothing');
    expect(await listFriendlyWars(db())).toEqual([]);
  });

  it('journal privé chez le premier clan : lu chez le second', async () => {
    const game = coc({
      '#2JVUP2PGC': { ok: false, error: 'private' },
      '#2CYJPRCG8': ok(swapped),
    });
    expect((await trackFriendlyWars(db(), game, CLANS)).current).toBe('recorded');
    expect(game.calls).toEqual(['#2JVUP2PGC', '#2CYJPRCG8']);
  });

  it('pas de clans de FW configurés : ne fait rien', async () => {
    const game = coc({});
    expect((await trackFriendlyWars(db(), game, [])).current).toBe('nothing');
    expect(game.calls).toEqual([]);
  });
});

describe('stats des FW classiques', () => {
  it('classement : les joueurs, leur clan de FW, leurs étoiles ; pas les comptes à 0 étoile', async () => {
    await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(REAL_FRIENDLY_WAR) }), CLANS);
    const players = await listFwPlayers(db());
    // 25, et non 13 + 11 = 24 : les étoiles d'un CLAN ne comptent que la meilleure
    // attaque sur chaque base. Ici, deux joueurs ont attaqué la même base : le
    // second a gagné une étoile qui compte pour LUI, mais pas pour son clan.
    expect(players.reduce((sum, p) => sum + p.stars, 0)).toBe(25);
    // Les comptes de lancement (0 étoile, aucune attaque) ne sont pas au classement.
    expect(players.filter((p) => p.stars === 0)).toEqual([]);
    expect(new Set(players.map((p) => p.clan.name))).toEqual(new Set(['Clan Bleu', 'Clan Rouge']));
  });

  it('fiche d’un joueur qui n’a fait QUE des FW : pas de Spade Cup, mais ses FW', async () => {
    await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(REAL_FRIENDLY_WAR) }), CLANS);
    const [best] = await listFwPlayers(db());
    const profile = (await getPlayerProfile(db(), best.tag))!;
    expect(profile.history).toEqual([]);
    expect(profile.totals.wars).toBe(0);
    expect(profile.fw!.totals).toMatchObject({ wars: 1, stars: best.stars });
    expect(profile.fw!.history[0].war.home.name).toBe('Clan Bleu');
    expect(profile.fw!.history[0].won).toBe(best.clan.name === 'Clan Bleu');
  });

  it('détail d’une FW : score, temps de chaque camp, et chaque joueur (étoiles, %, temps)', async () => {
    await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(REAL_FRIENDLY_WAR) }), CLANS);
    const [{ id }] = await listFriendlyWars(db());
    const detail = (await getFriendlyWar(db(), id))!;

    expect(detail.war).toMatchObject({ id, home: { stars: 13 }, away: { stars: 11 } });
    const sum = (side: string) =>
      detail.players.filter((p) => p.side === side).reduce((t, p) => t + p.durationSec, 0);
    expect(detail.duration).toEqual({ home: sum('home'), away: sum('away') });
    expect(detail.players).toHaveLength(20);
    // Camp « home » d'abord, chacun dans l'ordre de la carte.
    expect(detail.players.slice(0, 10).map((p) => p.mapPosition)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    const attacker = detail.players.find((p) => p.attacks > 0)!;
    expect(attacker.durationSec).toBeGreaterThan(0);
    expect(attacker.destruction).toBeGreaterThan(0);
    // La cible est enregistrée (place sur la carte adverse et pseudo).
    const b1 = detail.players.find((p) => p.tag === '#B1')!;
    expect(b1.targets).toEqual([
      { position: 1, name: 'Joueur R4', stars: 2, destruction: 52, durationSec: 125 },
    ]);
    // Qui n'a pas attaqué n'a pas de cible.
    expect(detail.players.find((p) => p.attacks === 0)!.targets).toBeUndefined();
  });

  it('FW inconnue : null', async () => {
    expect(await getFriendlyWar(db(), 999)).toBeNull();
  });

  it('joueur inconnu partout : null', async () => {
    expect(await getPlayerProfile(db(), '#INCONNU')).toBeNull();
  });
});

describe('filet de sécurité : une FW relancée aussitôt la précédente finie', () => {
  // La vraie FW du 20/10 : combat de 19h17:58 à 19h32:58.
  const END = Date.UTC(2026, 9, 20, 19, 32, 58);
  const inWar: CocWar = { ...REAL_FRIENDLY_WAR, state: 'inWar' };
  // La FW suivante, lancée 1 minute après la fin de la précédente.
  const next: CocWar = {
    ...REAL_FRIENDLY_WAR,
    state: 'preparation',
    preparationStartTime: '20261020T193358.000Z',
    startTime: '20261020T193858.000Z',
    endTime: '20261020T195358.000Z',
  };
  const snapshots = async () =>
    (await db().prepare('SELECT COUNT(*) AS n FROM fw_snapshots').first<{ n: number }>())!.n;

  it('pendant la guerre, le bot garde son dernier état ; à la fin, il l’efface', async () => {
    await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(inWar) }), CLANS, END - 60_000);
    expect(await snapshots()).toBe(1);
    await trackFriendlyWars(
      db(),
      coc({ '#2JVUP2PGC': ok(REAL_FRIENDLY_WAR) }),
      CLANS,
      END + 30_000,
    );
    expect(await snapshots()).toBe(0);
    const [war] = await listFriendlyWars(db());
    expect(war.partial).toBe(false);
  });

  it('la FW a disparu sans être vue finie : reconstituée d’après son dernier état, marquée partielle', async () => {
    await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(inWar) }), CLANS, END - 60_000);
    // 3 minutes après la fin, le jeu montre déjà la FW suivante.
    const later = await trackFriendlyWars(
      db(),
      coc({ '#2JVUP2PGC': ok(next) }),
      CLANS,
      END + 3 * 60_000,
    );
    expect(later).toEqual({ current: 'nothing', recovered: 1 });

    const [war] = await listFriendlyWars(db());
    expect(war).toMatchObject({ partial: true, home: { stars: 13 }, away: { stars: 11 } });
    expect(await listFwPlayers(db())).toHaveLength(14);
    expect(await snapshots()).toBe(0);
  });

  it('pas avant 2 minutes après la fin prévue (le jeu peut encore la montrer finie)', async () => {
    await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(inWar) }), CLANS, END - 60_000);
    const soon = await trackFriendlyWars(
      db(),
      coc({ '#2JVUP2PGC': ok(next) }),
      CLANS,
      END + 60_000,
    );
    expect(soon.recovered).toBe(0);
    expect(await listFriendlyWars(db())).toEqual([]);
  });

  it('jeu injoignable : on patiente (jusqu’à 30 min) au lieu de reconstituer trop tôt', async () => {
    await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(inWar) }), CLANS, END - 60_000);
    const down = coc({
      '#2JVUP2PGC': { ok: false, error: 'unavailable' },
      '#2CYJPRCG8': { ok: false, error: 'unavailable' },
    });
    expect((await trackFriendlyWars(db(), down, CLANS, END + 10 * 60_000)).recovered).toBe(0);
    expect((await trackFriendlyWars(db(), down, CLANS, END + 31 * 60_000)).recovered).toBe(1);
  });

  it('reconstituée puis vue finie : la version complète remplace la partielle', async () => {
    await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(inWar) }), CLANS, END - 60_000);
    await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(next) }), CLANS, END + 3 * 60_000);
    expect((await listFriendlyWars(db()))[0].partial).toBe(true);

    const final = await trackFriendlyWars(
      db(),
      coc({ '#2CYJPRCG8': ok(REAL_FRIENDLY_WAR) }),
      CLANS,
      END + 4 * 60_000,
    );
    expect(final.current).toBe('recorded');
    const wars = await listFriendlyWars(db());
    expect(wars).toHaveLength(1);
    expect(wars[0].partial).toBe(false);
  });
});
