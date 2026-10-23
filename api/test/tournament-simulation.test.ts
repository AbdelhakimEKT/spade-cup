import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { championOf } from '../../src/app/core/tournament/bracket';
import type { CocWar } from '../../src/app/core/tournament/coc-war';
import type { ClanRef } from '../../src/app/core/tournament/models';
import type { CocClient } from '../src/coc';
import { runCommand } from '../src/discord/bot';
import { getCurrentTournament, getTournament } from '../src/repository';
import { listPlayers } from '../src/stats-repository';
import { runWatch, type WatchDeps } from '../src/watch';
import { botContext, command, fakeAnnouncer, fakeCoc, fakeWar, referee } from './helpers';

/**
 * TOURNOIS COMPLETS joués par l'arbitre automatique, de l'inscription au
 * champion, comme en vrai : plusieurs guerres en même temps, des fins à des
 * moments différents, un clan qui enchaîne son match suivant tout de suite.
 *
 * Le « jeu » est simulé : chaque clan a sa guerre actuelle, exactement ce que
 * renverrait l'API (la dernière guerre du clan, vue de son côté).
 */

const db = () => env.DB;

/** `count` clans aux tags valides (alphabet du jeu), tous différents. */
function makeClans(count: number): ClanRef[] {
  const letters = 'CGJLPQRUVY';
  return Array.from({ length: count }, (_, i) => ({
    tag: `#2${letters[Math.floor(i / 10)]}${letters[i % 10]}`,
    name: `Clan ${i + 1}`,
  }));
}

/** Le monde du jeu : la dernière guerre de chaque clan. */
class Game {
  private readonly wars = new Map<string, CocWar>();
  calls = 0;

  /** Guerre entre `winner` et `loser` (le premier gagne 12★ à 9★ une fois finie). */
  play(
    winner: ClanRef,
    loser: ClanRef,
    state: CocWar['state'],
    launchedAt: string,
    endTime: string,
  ) {
    const war = { ...fakeWar(winner, loser, { state, launchedAt }), endTime };
    this.wars.set(winner.tag, war);
    this.wars.set(loser.tag, { ...war, clan: war.opponent, opponent: war.clan });
  }

  client(): CocClient {
    const base = fakeCoc();
    return {
      clan: base.clan,
      currentWar: async (tag) => {
        this.calls++;
        const war = this.wars.get(tag);
        return war ? { ok: true, value: war } : { ok: true, value: { state: 'notInWar' } };
      },
    };
  }
}

/** Un passage de l'arbitre automatique, avec le décompte des requêtes sortantes. */
async function pass(game: Game) {
  const { announcer, posted, shots, inChannel } = fakeAnnouncer();
  game.calls = 0;
  const deps: WatchDeps = { db: db(), coc: game.client(), siteUrl: 'https://site.test', announcer };
  const report = await runWatch(deps);
  // Requêtes sortantes : appels au jeu + messages Discord + sessions du navigateur.
  // Le plan gratuit de Cloudflare en autorise 50 par exécution.
  const outgoing = game.calls + posted.length + shots.length;
  return { report, posted, shots, inChannel, outgoing };
}

async function openTournament(clans: ClanRef[]) {
  const ctx = { ...botContext(db(), fakeCoc({}, clans)) };
  await runCommand(referee('creer', { nom: 'Spade Cup' }), ctx);
  for (const clan of clans) await runCommand(command('inscription', { tag: clan.tag }), ctx);
  await runCommand(referee('tirage'), ctx);
  return (await getCurrentTournament(db()))!.tournament.bracket!;
}

const matchOf = async (id: string) =>
  (await getCurrentTournament(db()))!.tournament.bracket!.matches.find((m) => m.id === id)!;

describe('tournoi complet à 8 clans, sans aucune commande d’arbitre', () => {
  it('des quarts au champion, avec annonces, images et statistiques', async () => {
    const bracket = await openTournament(makeClans(8));
    const game = new Game();
    const qf = bracket.matches.filter((m) => m.round === 1);
    // Le clan « domicile » gagne toujours : le champion est donc connu d'avance.
    const t = (h: number, m = 0) =>
      `20300101T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00.000Z`;

    // 19h00 : les 4 quarts sont lancés en même temps.
    for (const m of qf) game.play(m.home!, m.away!, 'inWar', t(19), t(20));
    let p = await pass(game);
    expect(p.report.started).toEqual(['R1-M1', 'R1-M2', 'R1-M3', 'R1-M4']);
    expect(p.posted).toEqual([]); // les débuts ne sont pas annoncés sur Discord

    // 20h00 : trois quarts sont finis, le quatrième a pris du retard.
    for (const m of qf.slice(0, 3)) game.play(m.home!, m.away!, 'warEnded', t(19), t(20));
    p = await pass(game);
    expect(p.report.finished).toEqual(['R1-M1', 'R1-M2', 'R1-M3']);
    // #résultats : les 3 victoires en un message ; #classement : 1 arbre.
    // #résultats : une victoire par message, chacune avec son récap en image.
    expect(
      p
        .inChannel('results')
        .map((r) => [r.content.startsWith('🏆 Victoire de'), r.files?.[0].name]),
    ).toEqual([
      [true, 'recap-R1-M1.png'],
      [true, 'recap-R1-M2.png'],
      [true, 'recap-R1-M3.png'],
    ]);
    expect(p.inChannel('bracket')).toHaveLength(1);
    expect(p.shots).toHaveLength(1); // une seule session du navigateur

    // La demie 1 (vainqueurs des quarts 1 et 2) est lancée à 20h03.
    const sf1 = await matchOf('R2-M1');
    expect([sf1.home?.tag, sf1.away?.tag]).toEqual([qf[0].home!.tag, qf[1].home!.tag]);
    game.play(sf1.home!, sf1.away!, 'inWar', t(20, 3), t(21, 3));
    // 20h20 : le dernier quart finit enfin.
    game.play(qf[3].home!, qf[3].away!, 'warEnded', t(19), t(20, 20));
    p = await pass(game);
    expect(p.report).toMatchObject({ started: ['R2-M1'], finished: ['R1-M4'] });

    // 20h22 : demie 2 lancée ; 21h03 : demie 1 finie.
    const sf2 = await matchOf('R2-M2');
    game.play(sf2.home!, sf2.away!, 'inWar', t(20, 22), t(21, 22));
    game.play(sf1.home!, sf1.away!, 'warEnded', t(20, 3), t(21, 3));
    p = await pass(game);
    expect(p.report).toMatchObject({ started: ['R2-M2'], finished: ['R2-M1'] });

    // 21h22 : demie 2 finie ; le vainqueur ENCHAÎNE la finale à 21h24, avant le
    // passage du bot (21h25) : la finale doit quand même être reconnue.
    game.play(sf2.home!, sf2.away!, 'warEnded', t(20, 22), t(21, 22));
    p = await pass(game);
    expect(p.report.finished).toEqual(['R2-M2']);
    const final = await matchOf('R3-M1');
    game.play(final.home!, final.away!, 'inWar', t(21, 24), t(22, 24));
    p = await pass(game);
    expect(p.report.started).toEqual(['R3-M1']);

    // 22h24 : finale terminée.
    game.play(final.home!, final.away!, 'warEnded', t(21, 24), t(22, 24));
    p = await pass(game);
    expect(p.report.finished).toEqual(['R3-M1']);
    expect(p.inChannel('results')[0].content).toBe(
      `🏆 Victoire de ${final.home!.name} qui remporte Spade Cup ! 👑`,
    );
    expect(p.inChannel('bracket')[0].content).toBe(
      `🏆 **Spade Cup** · 👑 Victoire de **${final.home!.name}**`,
    );

    // Le tournoi est terminé, les stats sont complètes, le bot se tait.
    const done = (await getTournament(db(), 'spade-cup'))!;
    expect(done.status).toBe('finished');
    expect(championOf(done.bracket!)?.tag).toBe(qf[0].home!.tag);
    const players = await listPlayers(db());
    expect(players).toHaveLength(8 * 5);
    expect(players.reduce((sum, pl) => sum + pl.wars, 0)).toBe(7 * 10); // 7 matchs × 10 joueurs
    p = await pass(game);
    expect(p.report.checked).toBe(0);
    expect(p.posted).toEqual([]);
  });
});

describe('tournoi à 6 clans : exempts', () => {
  it('les clans exempts attendent leur adversaire, puis jouent normalement', async () => {
    const bracket = await openTournament(makeClans(6));
    const game = new Game();
    const t = (h: number) => `20300101T${String(h).padStart(2, '0')}0000.000Z`;
    const played = bracket.matches.filter((m) => m.round === 1 && m.status === 'pending');
    expect(played).toHaveLength(2); // 8 places, 6 clans : 2 exempts

    for (const m of played) game.play(m.home!, m.away!, 'warEnded', t(19), t(20));
    const p = await pass(game);
    expect(p.report.finished).toEqual(played.map((m) => m.id));

    // Les demies ont maintenant leurs deux clans, et sont jouables dès 20h.
    const ready = (await getCurrentTournament(db()))!.readyAt;
    expect(ready.get('R2-M1')).toBe(Date.UTC(2030, 0, 1, 20));
    expect(ready.get('R2-M2')).toBe(Date.UTC(2030, 0, 1, 20));
  });
});

describe('gros tournoi : 32 clans, 16 guerres qui finissent en même temps', () => {
  it('reste sous la limite de 50 requêtes : 12 matchs par passage, les 4 autres 5 minutes après', async () => {
    const bracket = await openTournament(makeClans(32));
    const game = new Game();
    const r1 = bracket.matches.filter((m) => m.round === 1);
    expect(r1).toHaveLength(16);
    for (const m of r1) {
      game.play(m.home!, m.away!, 'warEnded', '20300101T190000.000Z', '20300101T200000.000Z');
    }

    const first = await pass(game);
    expect(first.report.finished).toHaveLength(12);
    expect(first.outgoing).toBeLessThanOrEqual(50);
    // 12 victoires (avec récap) + 1 arbre : sous la limite.
    expect(first.inChannel('bracket')).toHaveLength(1);

    const second = await pass(game);
    expect(second.report.finished).toHaveLength(4);
    expect(second.outgoing).toBeLessThanOrEqual(50);
  });
});
