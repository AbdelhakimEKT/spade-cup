import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { championOf } from '../../src/app/core/tournament/bracket';
import type { CocWar } from '../../src/app/core/tournament/coc-war';
import type { BracketMatch } from '../../src/app/core/tournament/models';
import type { CocResult } from '../src/coc';
import { runCommand, type Reply } from '../src/discord/bot';
import { getCurrentTournament, getTournament } from '../src/repository';
import { getMatchDetail } from '../src/stats-repository';
import { assessWar, pack, runWatch, type WatchDeps } from '../src/watch';
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

    // D'abord le résultat (texte), PUIS l'image : si l'image échouait, le résultat serait déjà parti.
    expect(announced).toHaveLength(2);
    expect(announced[0].content).toContain(`👑 **${final.home!.name}** remporte **Cup**`);
    expect(announced[0].files).toBeUndefined();
    expect(announced[1]).toEqual({
      content: `🏆 **Cup** · 👑 Victoire de **${final.home!.name}**`,
      files: [{ name: 'arbre.png', data: FAKE_PNG }],
    });
    expect(captures).toEqual(['cup']);
  });

  it('guerre lancée ET finie entre deux passages : directement le résultat', async () => {
    const final = (await drawn(2)).tournament.bracket!.matches[0];
    const { watch } = deps({ [final.away!.tag]: ok(fakeWar(final.away!, final.home!)) });
    expect(await runWatch(watch)).toMatchObject({ started: [], finished: ['R1-M1'] });
  });

  it('deux résultats dans le même passage : un seul message pour les deux, puis une seule image', async () => {
    const semis = (await drawn(4)).tournament.bracket!.matches.filter((m) => m.round === 1);
    const { watch, announced, captures } = deps(
      Object.fromEntries(semis.map((m) => [m.home!.tag, ok(fakeWar(m.home!, m.away!))])),
    );

    expect((await runWatch(watch)).finished).toEqual(['R1-M1', 'R1-M2']);
    expect(announced.map((a) => Boolean(a.files))).toEqual([false, true]);
    expect(announced[0].content.match(/se qualifie pour la finale/g)).toHaveLength(2);
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

describe('pack', () => {
  it('regroupe les annonces sans dépasser 2 000 caractères', () => {
    expect(pack(['a', 'b'])).toEqual(['a\n\nb']);
    const long = 'x'.repeat(1500);
    expect(pack([long, long, 'c'])).toEqual([long, `${long}\n\nc`]);
    expect(pack([])).toEqual([]);
  });
});
