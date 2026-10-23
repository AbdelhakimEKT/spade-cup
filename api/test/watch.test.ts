import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { championOf } from '../../src/app/core/tournament/bracket';
import type { CocWar } from '../../src/app/core/tournament/coc-war';
import type { BracketMatch } from '../../src/app/core/tournament/models';
import type { CocResult } from '../src/coc';
import { runCommand } from '../src/discord/bot';
import { getCurrentTournament, getTournament } from '../src/repository';
import { getMatchDetail } from '../src/stats-repository';
import { assessWar, runWatch, type WatchDeps } from '../src/watch';
import {
  CLANS,
  FAKE_PNG,
  botContext,
  command,
  fakeAnnouncer,
  fakeCoc,
  fakeWar,
  referee,
} from './helpers';

const db = () => env.DB;

afterEach(() => vi.restoreAllMocks());

/** Tournoi tiré au sort avec `count` clans de test. */
async function drawn(count: number) {
  const ctx = botContext(db());
  await runCommand(referee('creer', { nom: 'Cup' }), ctx);
  for (const clan of CLANS.slice(0, count)) {
    await runCommand(command('inscription', { tag: clan.tag }), ctx);
  }
  await runCommand(referee('tirage'), ctx);
  return (await getCurrentTournament(db()))!;
}

/** Dépendances de l'arbitre automatique, avec de faux salons Discord. */
function deps(
  wars: Record<string, CocResult<CocWar>>,
  options: { webhook?: boolean; failCapture?: boolean } = {},
) {
  const fake = fakeAnnouncer(options);
  const watch: WatchDeps = {
    db: db(),
    coc: fakeCoc(wars),
    siteUrl: 'https://site.test',
    announcer: options.webhook === false ? null : fake.announcer,
  };
  return { watch, ...fake };
}

const ok = (war: CocWar): CocResult<CocWar> => ({ ok: true, value: war });

describe('assessWar (pure)', () => {
  const home = { tag: '#2PPP', name: 'A' };
  const away = { tag: '#2QQQ', name: 'B' };
  const match: BracketMatch = {
    id: 'R1-M1',
    round: 1,
    index: 1,
    home,
    away,
    status: 'pending',
    winner: null,
    score: null,
  };
  const READY = Date.UTC(2030, 0, 1, 10, 0, 0); // le match est jouable depuis 10 h

  it('guerre terminée lancée après 10 h : « ended », avec la lecture complète', () => {
    const result = assessWar(fakeWar(home, away), match, READY);
    expect(result.kind).toBe('ended');
    if (result.kind === 'ended') expect(result.reading.score.home.stars).toBe(12);
  });

  it('préparation ou guerre en cours : « started »', () => {
    for (const state of ['preparation', 'inWar'] as const) {
      expect(assessWar(fakeWar(home, away, { state }), match, READY)).toEqual({
        kind: 'started',
        warKey: '20300101T120000.000Z',
      });
    }
  });

  it('guerre lancée AVANT que le match soit jouable : ignorée (vieille guerre)', () => {
    const old = fakeWar(home, away, { launchedAt: '20300101T095959.000Z' });
    expect(assessWar(old, match, READY)).toEqual({ kind: 'nothing' });
  });

  it('autre adversaire, aucune guerre, heure illisible : ignorée', () => {
    const stranger = { tag: '#2YYY', name: 'Z' };
    expect(assessWar(fakeWar(home, stranger), match, READY).kind).toBe('nothing');
    expect(assessWar({ state: 'notInWar' }, match, READY).kind).toBe('nothing');
    expect(assessWar(fakeWar(home, away, { launchedAt: 'bientôt' }), match, READY).kind).toBe(
      'nothing',
    );
  });

  it('peu importe le camp interrogé', () => {
    expect(assessWar(fakeWar(away, home), match, READY).kind).toBe('ended');
  });
});

describe('runWatch', () => {
  it('aucun tournoi, ou inscriptions encore ouvertes : ne regarde rien', async () => {
    expect((await runWatch(deps({}).watch)).checked).toBe(0);
    await runCommand(referee('creer', { nom: 'Cup' }), botContext(db()));
    expect((await runWatch(deps({}).watch)).checked).toBe(0);
  });

  it('guerre lancée : le match passe « en cours », annoncé une seule fois dans #résultats', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch, posted } = deps({
      [final.home!.tag]: ok(fakeWar(final.home!, final.away!, { state: 'inWar' })),
    });

    expect((await runWatch(watch)).started).toEqual(['R1-M1']);
    expect((await getCurrentTournament(db()))!.tournament.bracket!.matches[0].status).toBe('live');
    await runWatch(watch); // 5 minutes plus tard : rien de nouveau
    expect(posted).toEqual([
      {
        channel: 'results',
        reply: {
          content: `⚔️ **${final.home!.name} contre ${final.away!.name}** a commencé (finale). Bonne guerre !`,
        },
      },
    ]);
  });

  it('guerre terminée : résultat, récap des joueurs (#résultats), arbre (#classement)', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch, posted, shots } = deps({
      [final.home!.tag]: ok(fakeWar(final.home!, final.away!)),
    });

    expect((await runWatch(watch)).finished).toEqual(['R1-M1']);
    const t = (await getTournament(db(), 'cup'))!;
    expect(t.status).toBe('finished');
    expect(championOf(t.bracket!)?.tag).toBe(final.home!.tag);
    expect((await getMatchDetail(db(), 'cup', 'R1-M1'))!.players.home).toHaveLength(5);

    // Dans l'ordre : le résultat (texte), PUIS les images. Si les images
    // échouaient, le résultat serait déjà parti.
    expect(posted.map((p) => p.channel)).toEqual(['results', 'results', 'bracket']);
    expect(posted[0].reply.content).toContain(`👑 **${final.home!.name}** remporte **Cup**`);
    expect(posted[0].reply.files).toBeUndefined();
    expect(posted[1].reply).toEqual({
      content: `📊 **${final.home!.name} contre ${final.away!.name}** · le détail joueur par joueur`,
      files: [{ name: 'recap-R1-M1.png', data: FAKE_PNG }],
    });
    expect(posted[2].reply).toEqual({
      content: `🏆 **Cup** · 👑 Victoire de **${final.home!.name}**`,
      files: [{ name: 'arbre.png', data: FAKE_PNG }],
    });
    // Toutes les images dans UNE session du navigateur.
    expect(shots).toEqual([
      [
        { kind: 'match', slug: 'cup', matchId: 'R1-M1' },
        { kind: 'bracket', slug: 'cup' },
      ],
    ]);
  });

  it('guerre lancée ET finie entre deux passages : directement le résultat', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch } = deps({ [final.away!.tag]: ok(fakeWar(final.away!, final.home!)) });
    expect(await runWatch(watch)).toMatchObject({ started: [], finished: ['R1-M1'] });
  });

  it('deux résultats dans le même passage : un message, deux récaps, un seul arbre', async () => {
    const semis = (await drawn(4)).tournament.bracket!.matches.filter((m) => m.round === 1);
    const { watch, inChannel, shots } = deps(
      Object.fromEntries(semis.map((m) => [m.home!.tag, ok(fakeWar(m.home!, m.away!))])),
    );

    expect((await runWatch(watch)).finished).toEqual(['R1-M1', 'R1-M2']);
    const results = inChannel('results');
    expect(results[0].content.match(/se qualifie pour la finale/g)).toHaveLength(2);
    expect(results.slice(1).map((r) => r.files?.[0].name)).toEqual([
      'recap-R1-M1.png',
      'recap-R1-M2.png',
    ]);
    expect(inChannel('bracket')).toHaveLength(1);
    expect(shots).toHaveLength(1);
    // La finale a maintenant ses deux clans : elle sera surveillée au passage suivant.
    const final = (await getCurrentTournament(db()))!.tournament.bracket!.matches[2];
    expect([final.home?.tag, final.away?.tag]).toEqual([semis[0].home!.tag, semis[1].home!.tag]);
  });

  it('vieille guerre entre les deux mêmes clans (avant le tirage) : ignorée', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch, posted } = deps({
      [final.home!.tag]: ok(
        fakeWar(final.home!, final.away!, { launchedAt: '20201020T191758.000Z' }),
      ),
    });
    expect(await runWatch(watch)).toMatchObject({ checked: 1, started: [], finished: [] });
    expect(posted).toEqual([]);
  });

  it('égalité parfaite : rien d’enregistré, alerte dans le salon des arbitres, une seule fois', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const tie = fakeWar(final.home!, final.away!, {
      homeStars: [3, 3, 2, 2, 2],
      awayStars: [3, 3, 2, 2, 2],
    });
    const { watch, posted } = deps({ [final.home!.tag]: ok(tie) });

    expect((await runWatch(watch)).ties).toEqual(['R1-M1']);
    expect((await runWatch(watch)).ties).toEqual([]);
    expect(posted).toHaveLength(1);
    expect(posted[0].channel).toBe('referees');
    expect(posted[0].reply.content).toContain('⚖️ Égalité parfaite');
    expect((await getCurrentTournament(db()))!.tournament.bracket!.matches[0].status).toBe(
      'pending',
    );
  });

  it('hors format (HDV 17) : validé tel quel, sans alerte (le format est l’affaire des clans)', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch, inChannel } = deps({
      [final.home!.tag]: ok(fakeWar(final.home!, final.away!, { townHall: 17 })),
    });
    expect((await runWatch(watch)).finished).toEqual(['R1-M1']);
    expect(inChannel('results')[0].content).not.toContain('⚠️');
    expect(inChannel('referees')).toEqual([]);
  });

  it('journal privé chez l’un : lu chez l’autre', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch } = deps({
      [final.home!.tag]: { ok: false, error: 'private' },
      [final.away!.tag]: ok(fakeWar(final.away!, final.home!)),
    });
    expect((await runWatch(watch)).finished).toEqual(['R1-M1']);
  });

  it('sans salons d’annonces : les résultats sont quand même enregistrés, sans image', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch, shots } = deps(
      { [final.home!.tag]: ok(fakeWar(final.home!, final.away!)) },
      { webhook: false },
    );
    expect((await runWatch(watch)).finished).toEqual(['R1-M1']);
    expect(shots).toEqual([]);
  });

  it('les images échouent : le résultat est quand même annoncé', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { watch, posted } = deps(
      { [final.home!.tag]: ok(fakeWar(final.home!, final.away!)) },
      { failCapture: true },
    );
    await runWatch(watch);
    expect(posted).toHaveLength(1);
    expect(posted[0].reply.files).toBeUndefined();
  });
});

describe('« jouable depuis »', () => {
  const readyOf = async (id: string) => (await getCurrentTournament(db()))!.readyAt.get(id);
  const setFinished = (id: string, at: string) =>
    db().prepare('UPDATE matches SET finished_at = ? WHERE match_id = ?').bind(at, id).run();

  it('premier tour : l’heure du tirage ; match qui attend un vainqueur : pas encore jouable', async () => {
    await drawn(4);
    expect(await readyOf('R1-M1')).toBeTypeOf('number');
    expect(await readyOf('R2-M1')).toBeUndefined();
  });

  it('tour suivant : la plus TARDIVE des fins de ses deux matchs d’origine', async () => {
    const t = await drawn(4);
    const ctx = botContext(db());
    for (const m of t.tournament.bracket!.matches.filter((x) => x.round === 1)) {
      await runCommand(referee('vainqueur', { match: m.id, clan: 'home' }), ctx);
    }
    await setFinished('R1-M1', '2030-01-01 20:00:00');
    await setFinished('R1-M2', '2030-01-01 20:40:00');
    expect(await readyOf('R2-M1')).toBe(Date.UTC(2030, 0, 1, 20, 40));
  });

  it('un clan qui enchaîne avant que le bot ait vu sa victoire : sa nouvelle guerre compte', async () => {
    // Demies A–D et B–C. B a gagné il y a longtemps ; A finit sa demie à 20h00,
    // lance la finale contre B à 20h02, et le bot ne passe qu'à 20h05.
    const t = await drawn(4);
    const [semi1, semi2] = t.tournament.bracket!.matches;
    await runCommand(referee('vainqueur', { match: semi2.id, clan: 'home' }), botContext(db()));
    const a = semi1.home!;
    const b = semi2.home!;

    const semiWar = fakeWar(a, semi1.away!, { launchedAt: '20300101T190000.000Z' });
    const finalWar = fakeWar(a, b, { state: 'inWar', launchedAt: '20300101T200200.000Z' });
    // Le clan A montre déjà la finale ; son adversaire de demie montre encore la demie.
    const { watch } = deps({
      [a.tag]: ok(finalWar),
      [semi1.away!.tag]: ok({ ...semiWar, endTime: '20300101T200000.000Z' }),
    });

    expect((await runWatch(watch)).finished).toEqual(['R1-M1']); // demie lue chez l'adversaire
    expect(await readyOf('R2-M1')).toBe(Date.UTC(2030, 0, 1, 20, 0)); // fin de la demie, pas 20h05
    expect((await runWatch(watch)).started).toEqual(['R2-M1']); // la finale de 20h02 est bien prise
  });
});
