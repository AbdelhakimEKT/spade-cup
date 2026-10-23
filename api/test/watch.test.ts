import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { championOf } from '../../src/app/core/tournament/bracket';
import type { CocWar } from '../../src/app/core/tournament/coc-war';
import type { BracketMatch } from '../../src/app/core/tournament/models';
import type { CocResult } from '../src/coc';
import { runCommand, type Reply } from '../src/discord/bot';
import { getCurrentTournament, getTournament } from '../src/repository';
import { getMatchDetail } from '../src/stats-repository';
import { assessWar, runWatch, type WatchDeps } from '../src/watch';
import { CLANS, FAKE_PNG, botContext, command, fakeCoc, fakeWar, referee } from './helpers';

const db = () => env.DB;

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

/** Dépendances de l'arbitre automatique, avec un salon d'annonces factice. */
function deps(wars: Record<string, CocResult<CocWar>>, options: { webhook?: boolean } = {}) {
  const announced: Reply[] = [];
  const captures: string[] = [];
  const watch: WatchDeps = {
    db: db(),
    coc: fakeCoc(wars),
    siteUrl: 'https://site.test',
    captureBracket: async (slug) => (captures.push(slug), FAKE_PNG),
    announce: options.webhook === false ? null : async (reply) => void announced.push(reply),
  };
  return { watch, announced, captures };
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

  it('guerre lancée : le match passe « en cours », annoncé une seule fois', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch, announced } = deps({
      [final.home!.tag]: ok(fakeWar(final.home!, final.away!, { state: 'inWar' })),
    });

    expect((await runWatch(watch)).started).toEqual(['R1-M1']);
    expect((await getCurrentTournament(db()))!.tournament.bracket!.matches[0].status).toBe('live');
    await runWatch(watch); // 5 minutes plus tard : rien de nouveau
    expect(announced.map((a) => a.content)).toEqual([
      `⚔️ **${final.home!.name} contre ${final.away!.name}** a commencé (finale). Bonne guerre !`,
    ]);
  });

  it('guerre terminée : résultat, joueurs, champion, annonce avec l’image de l’arbre', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch, announced, captures } = deps({
      [final.home!.tag]: ok(fakeWar(final.home!, final.away!)),
    });

    expect((await runWatch(watch)).finished).toEqual(['R1-M1']);
    const t = (await getTournament(db(), 'cup'))!;
    expect(t.status).toBe('finished');
    expect(championOf(t.bracket!)?.tag).toBe(final.home!.tag);
    expect((await getMatchDetail(db(), 'cup', 'R1-M1'))!.players.home).toHaveLength(5);

    expect(announced).toHaveLength(1);
    expect(announced[0].content).toContain(`👑 **${final.home!.name}** remporte **Cup**`);
    expect(announced[0].files).toEqual([{ name: 'arbre.png', data: FAKE_PNG }]);
    expect(captures).toEqual(['cup']);
  });

  it('guerre lancée ET finie entre deux passages : directement le résultat', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch } = deps({ [final.away!.tag]: ok(fakeWar(final.away!, final.home!)) });
    expect(await runWatch(watch)).toMatchObject({ started: [], finished: ['R1-M1'] });
  });

  it('deux résultats dans le même passage : deux annonces, une seule image (sur la dernière)', async () => {
    const semis = (await drawn(4)).tournament.bracket!.matches.filter((m) => m.round === 1);
    const { watch, announced, captures } = deps(
      Object.fromEntries(semis.map((m) => [m.home!.tag, ok(fakeWar(m.home!, m.away!))])),
    );

    expect((await runWatch(watch)).finished).toEqual(['R1-M1', 'R1-M2']);
    expect(announced.map((a) => Boolean(a.files))).toEqual([false, true]);
    expect(captures).toHaveLength(1);
    // La finale a maintenant ses deux clans : elle sera surveillée au passage suivant.
    const final = (await getCurrentTournament(db()))!.tournament.bracket!.matches[2];
    expect([final.home?.tag, final.away?.tag]).toEqual([semis[0].home!.tag, semis[1].home!.tag]);
  });

  it('vieille guerre entre les deux mêmes clans (avant le tirage) : ignorée', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch, announced } = deps({
      [final.home!.tag]: ok(
        fakeWar(final.home!, final.away!, { launchedAt: '20201020T191758.000Z' }),
      ),
    });
    expect(await runWatch(watch)).toMatchObject({ checked: 1, started: [], finished: [] });
    expect(announced).toEqual([]);
  });

  it('égalité parfaite : rien d’enregistré, alerte aux arbitres une seule fois', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const tie = fakeWar(final.home!, final.away!, {
      homeStars: [3, 3, 2, 2, 2],
      awayStars: [3, 3, 2, 2, 2],
    });
    const { watch, announced } = deps({ [final.home!.tag]: ok(tie) });

    expect((await runWatch(watch)).ties).toEqual(['R1-M1']);
    expect((await runWatch(watch)).ties).toEqual([]);
    expect(announced).toHaveLength(1);
    expect(announced[0].content).toContain('⚖️ Égalité parfaite');
    expect((await getCurrentTournament(db()))!.tournament.bracket!.matches[0].status).toBe(
      'pending',
    );
  });

  it('hors règlement (HDV 17) : validé quand même, avec l’alerte dans l’annonce', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch, announced } = deps({
      [final.home!.tag]: ok(fakeWar(final.home!, final.away!, { townHall: 17 })),
    });
    expect((await runWatch(watch)).finished).toEqual(['R1-M1']);
    expect(announced[0].content).toContain('⚠️ À vérifier par les arbitres');
    expect(announced[0].content).toContain('est HDV 17');
  });

  it('journal privé chez l’un : lu chez l’autre', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch } = deps({
      [final.home!.tag]: { ok: false, error: 'private' },
      [final.away!.tag]: ok(fakeWar(final.away!, final.home!)),
    });
    expect((await runWatch(watch)).finished).toEqual(['R1-M1']);
  });

  it('sans salon d’annonces : les résultats sont quand même enregistrés, sans image', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch, captures } = deps(
      { [final.home!.tag]: ok(fakeWar(final.home!, final.away!)) },
      { webhook: false },
    );
    expect((await runWatch(watch)).finished).toEqual(['R1-M1']);
    expect(captures).toEqual([]);
  });

  it('l’image échoue : les annonces partent quand même, sans pièce jointe', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch, announced } = deps({ [final.home!.tag]: ok(fakeWar(final.home!, final.away!)) });
    await runWatch({ ...watch, captureBracket: () => Promise.reject(new Error('quota')) });
    expect(announced).toHaveLength(1);
    expect(announced[0].files).toBeUndefined();
  });
});

describe('« jouable depuis » (ready_at)', () => {
  const readyOf = async (id: string) => (await getCurrentTournament(db()))!.readyAt.get(id);

  it('posé au tirage pour les matchs complets, pas pour ceux qui attendent un vainqueur', async () => {
    await drawn(4);
    expect(await readyOf('R1-M1')).toBeTypeOf('number');
    expect(await readyOf('R2-M1')).toBeUndefined();
  });

  it('remis à zéro quand un clan du match change (correction du tour précédent)', async () => {
    const t = await drawn(4);
    const [semi1, semi2] = t.tournament.bracket!.matches;
    const ctx = botContext(db());
    await runCommand(referee('vainqueur', { match: semi1.id, clan: 'home' }), ctx);
    await runCommand(referee('vainqueur', { match: semi2.id, clan: 'home' }), ctx);
    // On vieillit artificiellement la date de la finale…
    await db()
      .prepare("UPDATE matches SET ready_at = '2020-01-01 00:00:00' WHERE match_id = 'R2-M1'")
      .run();
    expect(await readyOf('R2-M1')).toBe(Date.UTC(2020, 0, 1));

    // …puis on corrige une demie : l'affiche de la finale change, la date repart de maintenant.
    await runCommand(referee('vainqueur', { match: semi1.id, clan: 'away' }), ctx);
    expect(await readyOf('R2-M1')).toBeGreaterThan(Date.UTC(2025, 0, 1));
  });
});
