import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { CocWar } from '../../src/app/core/tournament/coc-war';
import { REAL_FRIENDLY_WAR } from '../../src/testing/real-friendly-war';
import type { CocClient, CocResult } from '../src/coc';
import { fwClans, trackFriendlyWars, warKey } from '../src/fw-tracker';
import { getPlayerProfile, listFriendlyWars, listFwPlayers } from '../src/stats-repository';

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
    expect(await trackFriendlyWars(db(), game, CLANS)).toBe('recorded');
    expect(await trackFriendlyWars(db(), game, CLANS)).toBe('known'); // 5 minutes plus tard

    const [war] = await listFriendlyWars(db());
    expect(war).toMatchObject({
      teamSize: 10,
      home: { tag: '#2JVUP2PGC', name: 'Clan Bleu', stars: 13, destruction: 53.4 },
      away: { tag: '#2CYJPRCG8', name: 'Clan Rouge', stars: 11, destruction: 46.4 },
      winner: 'home',
    });
    expect(war.endedAt).toBe('2026-10-20T19:32:58Z'); // heure de fin donnée par le jeu
    expect(await listFwPlayers(db())).toHaveLength(20);
  });

  it('vue depuis l’autre clan : même guerre, même ordre des camps, rien en double', async () => {
    await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(REAL_FRIENDLY_WAR) }), CLANS);
    expect(await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(swapped) }), CLANS)).toBe('known');
    expect(await listFriendlyWars(db())).toHaveLength(1);
  });

  it('guerre en cours, ou contre un clan extérieur : rien', async () => {
    const live = { ...REAL_FRIENDLY_WAR, state: 'inWar' as const };
    expect(await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(live) }), CLANS)).toBe('nothing');

    const outsider = {
      ...REAL_FRIENDLY_WAR,
      opponent: { ...REAL_FRIENDLY_WAR.opponent!, tag: '#2YYYYY' },
    };
    expect(await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(outsider) }), CLANS)).toBe(
      'nothing',
    );
    expect(await listFriendlyWars(db())).toEqual([]);
  });

  it('journal privé chez le premier clan : lu chez le second', async () => {
    const game = coc({
      '#2JVUP2PGC': { ok: false, error: 'private' },
      '#2CYJPRCG8': ok(swapped),
    });
    expect(await trackFriendlyWars(db(), game, CLANS)).toBe('recorded');
    expect(game.calls).toEqual(['#2JVUP2PGC', '#2CYJPRCG8']);
  });

  it('pas de clans de FW configurés : ne fait rien', async () => {
    const game = coc({});
    expect(await trackFriendlyWars(db(), game, [])).toBe('nothing');
    expect(game.calls).toEqual([]);
  });
});

describe('stats des FW classiques', () => {
  it('classement : les joueurs, leur clan de FW, leurs étoiles', async () => {
    await trackFriendlyWars(db(), coc({ '#2JVUP2PGC': ok(REAL_FRIENDLY_WAR) }), CLANS);
    const players = await listFwPlayers(db());
    // 25, et non 13 + 11 = 24 : les étoiles d'un CLAN ne comptent que la meilleure
    // attaque sur chaque base. Ici, deux joueurs ont attaqué la même base : le
    // second a gagné une étoile qui compte pour LUI, mais pas pour son clan.
    expect(players.reduce((sum, p) => sum + p.stars, 0)).toBe(25);
    expect(players.filter((p) => p.attacks === 0)).toHaveLength(6);
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

  it('joueur inconnu partout : null', async () => {
    expect(await getPlayerProfile(db(), '#INCONNU')).toBeNull();
  });
});
