import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { CocWar } from '../../src/app/core/tournament/coc-war';
import { REAL_FRIENDLY_WAR } from '../../src/testing/real-friendly-war';
import type { CocClient, CocResult } from '../src/coc';
import { runCommand } from '../src/discord/bot';
import { FRESH_MS, cachedWar, getLiveWars, isVisible, toLiveWar, type LiveDeps } from '../src/live';
import { CLANS, botContext, command, fakeWar, referee } from './helpers';

const db = () => env.DB;
const FW = ['#2JVUP2PGC', '#2CYJPRCG8'];
const NOW = Date.UTC(2026, 9, 20, 19, 25); // pendant la vraie FW du 20/10 (19h17 → 19h32)

/** Le jeu simulé : la guerre actuelle de chaque clan, et le nombre de questions posées. */
function game(wars: Record<string, CocResult<CocWar>>): CocClient & { calls: number } {
  const client = {
    calls: 0,
    clan: async () => ({ ok: false as const, error: 'not-found' as const }),
    player: async () => ({ ok: false as const, error: 'not-found' as const }),
    currentWar: async (tag: string): Promise<CocResult<CocWar>> => {
      client.calls++;
      return wars[tag] ?? { ok: true, value: { state: 'notInWar' } };
    },
  };
  return client;
}

const deps = (coc: CocClient, now = NOW): LiveDeps => ({ db: db(), coc, fwClans: FW, now });
const inWar: CocWar = { ...REAL_FRIENDLY_WAR, state: 'inWar' };

describe('toLiveWar (pur)', () => {
  it('score, attaques faites sur attaques possibles, joueurs de chaque camp', () => {
    const live = toLiveWar(
      inWar,
      { tag: FW[0], name: '?' },
      { tag: FW[1], name: '?' },
      { id: 'fw/x', kind: 'fw' },
      NOW,
    )!;
    expect(live.state).toBe('inWar');
    expect(live.home).toMatchObject({
      name: 'Clan Bleu',
      stars: 13,
      destruction: 53.4,
      attacksUsed: 7,
      attacksTotal: 10,
    });
    expect(live.away).toMatchObject({
      name: 'Clan Rouge',
      stars: 11,
      attacksUsed: 7,
      attacksTotal: 10,
    });
    expect(live.players.home).toHaveLength(10);
    expect(live.endTime).toBe('2026-10-20T19:32:58.000Z');
    expect(live.fetchedAt).toBe(new Date(NOW).toISOString());
  });

  it('guerre d’autres clans : rien', () => {
    expect(toLiveWar(inWar, CLANS[0], CLANS[1], { id: 'x', kind: 'fw' }, NOW)).toBeNull();
  });
});

describe('isVisible', () => {
  it('préparation et guerre en cours : oui ; terminée depuis moins de 2 h : oui ; plus : non', () => {
    expect(isVisible({ ...inWar, state: 'preparation' }, NOW)).toBe(true);
    expect(isVisible(inWar, NOW)).toBe(true);
    const ended = REAL_FRIENDLY_WAR; // finie à 19h32
    expect(isVisible(ended, Date.UTC(2026, 9, 20, 21, 0))).toBe(true);
    expect(isVisible(ended, Date.UTC(2026, 9, 20, 22, 0))).toBe(false);
    expect(isVisible({ state: 'notInWar' }, NOW)).toBe(false);
  });
});

describe('cachedWar : 30 secondes de mémoire', () => {
  it('une seule question au jeu toutes les 30 s, même si beaucoup de gens regardent', async () => {
    const coc = game({ [FW[0]]: { ok: true, value: inWar } });
    for (let i = 0; i < 5; i++) await cachedWar(deps(coc, NOW + i * 1000), FW[0]);
    expect(coc.calls).toBe(1);
    await cachedWar(deps(coc, NOW + FRESH_MS + 1000), FW[0]);
    expect(coc.calls).toBe(2);
  });

  it('le jeu ne répond plus : la dernière réponse connue sert encore, avec son heure', async () => {
    await cachedWar(deps(game({ [FW[0]]: { ok: true, value: inWar } })), FW[0]);
    const down = game({ [FW[0]]: { ok: false, error: 'unavailable' } });
    const cached = await cachedWar(deps(down, NOW + 10 * 60_000), FW[0]);
    expect(cached?.war.state).toBe('inWar');
    // « Vu dans le jeu à » : l'heure de la dernière vraie réponse, pas l'heure actuelle.
    expect(cached?.fetchedAt).toBe(NOW);
  });

  it('page « En direct » : l’heure affichée est celle de la dernière lecture réussie', async () => {
    await getLiveWars(deps(game({ [FW[0]]: { ok: true, value: inWar } })));
    const down = game({ [FW[0]]: { ok: false, error: 'unavailable' } });
    const [war] = await getLiveWars(deps(down, NOW + 5 * 60_000));
    expect(war.fetchedAt).toBe(new Date(NOW).toISOString());
  });
});

describe('getLiveWars', () => {
  it('FW classique en cours : affichée', async () => {
    const wars = await getLiveWars(deps(game({ [FW[0]]: { ok: true, value: inWar } })));
    expect(wars.map((w) => [w.kind, w.home.name, w.away.name])).toEqual([
      ['fw', 'Clan Bleu', 'Clan Rouge'],
    ]);
  });

  it('FW finie depuis longtemps, ou aucune guerre : rien', async () => {
    const later = Date.UTC(2026, 9, 23, 20, 0);
    expect(
      await getLiveWars(deps(game({ [FW[0]]: { ok: true, value: REAL_FRIENDLY_WAR } }), later)),
    ).toEqual([]);
    expect(await getLiveWars(deps(game({}), later + FRESH_MS + 1))).toEqual([]);
  });

  it('match de Spade Cup « en cours » : affiché avec son tournoi et son tour, avant la FW', async () => {
    const ctx = botContext(db());
    await runCommand(referee('creer', { nom: 'Cup' }), ctx);
    for (const clan of CLANS.slice(0, 2)) {
      await runCommand(command('inscription', { tag: clan.tag }), ctx);
    }
    await runCommand(referee('tirage'), ctx);
    await runCommand(referee('lancer', { match: 'R1-M1' }), ctx);
    const [home, away] = [CLANS[0], CLANS[1]];

    const wars = await getLiveWars(
      deps(
        game({
          [home.tag]: { ok: true, value: fakeWar(home, away, { state: 'inWar' }) },
          [away.tag]: { ok: true, value: fakeWar(away, home, { state: 'inWar' }) },
          [FW[0]]: { ok: true, value: inWar },
        }),
      ),
    );
    expect(wars.map((w) => w.kind)).toEqual(['spade-cup', 'fw']);
    expect(wars[0].match).toEqual({
      slug: 'cup',
      tournament: 'Cup',
      matchId: 'R1-M1',
      round: 'Finale',
    });
  });
});

describe('GET /live', () => {
  it('répond une liste (vide sans clé du jeu en test), jamais mise en cache par le navigateur', async () => {
    const res = await exports.default.fetch('https://api.test/live');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual([]);
  });
});
