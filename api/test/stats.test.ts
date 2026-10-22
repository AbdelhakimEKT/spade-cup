import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_MATCH_PLAYERS } from '../../src/app/features/tournaments/data/demo-players';
import { DEMO_TOURNAMENT } from '../../src/app/features/tournaments/data/demo-tournament';
import { saveTournament } from '../src/repository';
import {
  getClanProfile,
  getMatchDetail,
  getPlayerProfile,
  listPlayers,
} from '../src/stats-repository';

const db = () => env.DB;

describe('statistiques', () => {
  beforeEach(async () => {
    await saveTournament(db(), DEMO_TOURNAMENT, DEMO_MATCH_PLAYERS);
  });

  describe('listPlayers', () => {
    it('sans filtre : la démo ne compte pas dans les vraies stats', async () => {
      expect(await listPlayers(db())).toEqual([]);
    });

    it('pour un tournoi : chaque joueur, ses guerres et ses étoiles', async () => {
      const players = await listPlayers(db(), { tournament: 'demo' });
      // 8 huitièmes + 1 quart joués = 9 matchs × 10 joueurs, mais les 4
      // clans du quart avaient déjà joué : 16 clans × 5 joueurs = 80 joueurs.
      expect(players).toHaveLength(80);
      expect(players.reduce((sum, p) => sum + p.wars, 0)).toBe(90);

      // Triés par étoiles : le meilleur a forcément joué deux guerres ou fait des triples.
      expect(players[0].stars).toBeGreaterThanOrEqual(players[1].stars);
      const twoWars = players.filter((p) => p.wars === 2);
      expect(twoWars).toHaveLength(10); // Zéphyr et Athéna, 5 joueurs chacun
    });

    it('la somme des étoiles des joueurs = la somme des étoiles des clans', async () => {
      const players = await listPlayers(db(), { tournament: 'demo' });
      const clanStars = DEMO_TOURNAMENT.bracket!.matches.filter((m) => m.score).reduce(
        (sum, m) => sum + m.score!.home.stars + m.score!.away.stars,
        0,
      );
      expect(players.reduce((sum, p) => sum + p.stars, 0)).toBe(clanStars);
    });

    it('par clan : seulement ses joueurs', async () => {
      const players = await listPlayers(db(), { clan: '#DEMO1' });
      expect(players).toHaveLength(5);
      expect(new Set(players.map((p) => p.clan.name))).toEqual(new Set(['Les Pikachus']));
    });

    it('tournoi inconnu : liste vide', async () => {
      expect(await listPlayers(db(), { tournament: 'nexiste-pas' })).toEqual([]);
    });
  });

  describe('getPlayerProfile', () => {
    it('historique du plus récent au plus ancien, bilan cohérent', async () => {
      // Un joueur de Zéphyr : huitième (R1-M5) puis quart (R2-M3).
      const tag = DEMO_MATCH_PLAYERS.get('R2-M3')![0].tag;
      const profile = (await getPlayerProfile(db(), tag))!;

      expect(profile.history.map((h) => h.matchId)).toEqual(['R2-M3', 'R1-M5']);
      expect(profile.history.every((h) => h.won)).toBe(true);
      expect(profile.history[0]).toMatchObject({
        tournament: { slug: 'demo', isDemo: true },
        round: 2,
        roundCount: 4,
        clan: { name: 'Zéphyr' },
        opponent: { name: 'Athéna' },
      });
      expect(profile.totals).toMatchObject({ wars: 2, attacks: 2, clan: { name: 'Zéphyr' } });
      expect(profile.totals.stars).toBe(profile.history.reduce((s, h) => s + h.line.stars, 0));
    });

    it('joueur inconnu : null', async () => {
      expect(await getPlayerProfile(db(), '#INCONNU')).toBeNull();
    });
  });

  describe('getClanProfile', () => {
    it('parcours, bilan et joueurs d’un clan éliminé', async () => {
      const profile = (await getClanProfile(db(), '#DEMO2'))!; // Titans FR, battus en huitièmes
      expect(profile.clan.name).toBe('Titans FR');
      expect(profile.runs).toEqual([
        {
          tournament: {
            slug: 'demo',
            name: 'Tournoi de démonstration',
            status: 'running',
            isDemo: true,
          },
          outcome: 'eliminated',
          round: 1,
          roundCount: 4,
        },
      ]);
      expect(profile.record).toEqual({ played: 1, won: 0, lost: 1 });
      expect(profile.players).toHaveLength(5);
    });

    it('clan encore en lice', async () => {
      const profile = (await getClanProfile(db(), '#DEMO1'))!; // Les Pikachus, quart en cours
      expect(profile.runs[0]).toMatchObject({ outcome: 'alive', round: 2 });
      expect(profile.record).toEqual({ played: 1, won: 1, lost: 0 });
    });

    it('clan jamais inscrit : null', async () => {
      expect(await getClanProfile(db(), '#2PPP')).toBeNull();
    });
  });

  describe('getMatchDetail', () => {
    it('match joué : score, joueurs par camp triés par position, source « jeu »', async () => {
      const detail = (await getMatchDetail(db(), 'demo', 'R1-M3'))!;
      expect(detail.tournament).toMatchObject({ slug: 'demo', clanCount: 16 });
      expect(detail.roundCount).toBe(4);
      expect(detail.source).toBe('game');
      expect(detail.match.winner).toBe('home');
      expect(detail.players.home.map((p) => p.mapPosition)).toEqual([1, 2, 3, 4, 5]);
      expect(detail.players.away.every((p) => p.side === 'away')).toBe(true);
      expect(detail.players).toEqual({
        home: DEMO_MATCH_PLAYERS.get('R1-M3')!.filter((p) => p.side === 'home'),
        away: DEMO_MATCH_PLAYERS.get('R1-M3')!.filter((p) => p.side === 'away'),
      });
    });

    it('match en cours : pas encore de joueurs, pas de source', async () => {
      const detail = (await getMatchDetail(db(), 'demo', 'R2-M1'))!;
      expect(detail.match.status).toBe('live');
      expect(detail).toMatchObject({ source: null, players: { home: [], away: [] } });
    });

    it('match ou tournoi inconnu : null', async () => {
      expect(await getMatchDetail(db(), 'demo', 'R9-M1')).toBeNull();
      expect(await getMatchDetail(db(), 'nexiste-pas', 'R1-M1')).toBeNull();
    });
  });
});
