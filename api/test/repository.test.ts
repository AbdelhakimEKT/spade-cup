import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBracket } from '../../src/app/core/tournament/bracket';
import type { Tournament } from '../../src/app/core/tournament/tournament';
import { DEMO_TOURNAMENT } from '../../src/app/features/tournaments/data/demo-tournament';
import { recordResult } from '../../src/app/core/tournament/bracket';
import { DEMO_MATCH_PLAYERS } from '../../src/app/features/tournaments/data/demo-players';
import {
  addReferee,
  getCurrentTournament,
  getTournament,
  listTournaments,
  saveBracket,
  saveTournament,
  tournamentStatements,
  toBracket,
  toRows,
} from '../src/repository';
import { getMatchDetail } from '../src/stats-repository';

describe('repository', () => {
  beforeEach(async () => {
    await saveTournament(env.DB, DEMO_TOURNAMENT);
  });

  it('un tournoi relu depuis la base est identique à celui enregistré', async () => {
    // Le test le plus important : arbre, scores, exempts, match en cours…
    // tout survit à l'aller-retour objet → lignes SQL → objet.
    expect(await getTournament(env.DB, 'demo')).toEqual(DEMO_TOURNAMENT);
  });

  it('enregistrer deux fois remplace au lieu de dupliquer', async () => {
    await saveTournament(env.DB, { ...DEMO_TOURNAMENT, name: 'Nouveau nom' });

    const list = await listTournaments(env.DB);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      slug: 'demo',
      name: 'Nouveau nom',
      status: 'running',
      clanCount: 16,
      isDemo: true,
    });
  });

  it('tournoi encore en inscriptions : clans sans tête de série, pas d’arbre', async () => {
    const open: Tournament = {
      ...DEMO_TOURNAMENT,
      slug: 'coupe-hiver',
      status: 'registration',
      bracket: null,
      isDemo: false,
    };
    await saveTournament(env.DB, open);

    const read = await getTournament(env.DB, 'coupe-hiver');
    expect(read?.bracket).toBeNull();
    expect(read?.clans).toHaveLength(16);
  });

  it('adresse inconnue : null', async () => {
    expect(await getTournament(env.DB, 'nexiste-pas')).toBeNull();
  });

  it('un blason connu est conservé, un blason absent ne crée pas de champ vide', async () => {
    const clans = [
      { tag: '#A', name: 'Avec blason', badgeUrl: 'https://exemple.test/a.png' },
      { tag: '#B', name: 'Sans blason' },
    ];
    await saveTournament(env.DB, {
      ...DEMO_TOURNAMENT,
      slug: 'blasons',
      clans,
      bracket: createBracket(clans, () => 0.999999),
    });

    expect((await getTournament(env.DB, 'blasons'))?.clans).toEqual(clans);
  });
});

describe('écritures du bot', () => {
  const count = async (table: string) =>
    (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
  const demoId = async () =>
    (await env.DB.prepare("SELECT id FROM tournaments WHERE slug = 'demo'").first<{
      id: number;
    }>())!.id;

  it('réinstaller un tournoi efface en cascade ses anciens matchs et joueurs', async () => {
    await saveTournament(env.DB, DEMO_TOURNAMENT, DEMO_MATCH_PLAYERS);
    expect(await count('match_players')).toBe(90);
    await saveTournament(env.DB, DEMO_TOURNAMENT);
    expect(await count('match_players')).toBe(0);
    expect(await count('matches')).toBe(15);
  });

  it('enregistrer l’arbre met les matchs à jour SANS effacer les joueurs déjà lus', async () => {
    await saveTournament(env.DB, DEMO_TOURNAMENT, DEMO_MATCH_PLAYERS);
    const id = await demoId();
    const tournament = (await getTournament(env.DB, 'demo'))!;

    const after = recordResult(tournament.bracket!, 'R2-M1', 'home');
    await saveBracket(env.DB, id, after);

    expect(await count('match_players')).toBe(90);
    expect((await getTournament(env.DB, 'demo'))!.bracket).toEqual(after);
  });

  it('un résultat lu dans le jeu remplace les lignes précédentes du match', async () => {
    await saveTournament(env.DB, DEMO_TOURNAMENT, DEMO_MATCH_PLAYERS);
    const id = await demoId();
    const t = (await getTournament(env.DB, 'demo'))!;
    const lines = DEMO_MATCH_PLAYERS.get('R2-M3')!.slice(0, 2);

    await saveBracket(env.DB, id, t.bracket!, {
      result: { matchId: 'R2-M3', source: 'referee', players: lines },
    });
    const detail = (await getMatchDetail(env.DB, 'demo', 'R2-M3'))!;
    expect(detail.source).toBe('referee');
    expect([...detail.players.home, ...detail.players.away]).toEqual(lines);
  });

  it('les arbitres sont ajoutés sans doublon', async () => {
    await saveTournament(env.DB, DEMO_TOURNAMENT);
    const id = await demoId();
    await addReferee(env.DB, id, 'Athéna');
    await addReferee(env.DB, id, 'Zeus');
    await addReferee(env.DB, id, "L'arbitre");
    expect((await getTournament(env.DB, 'demo'))!.referees).toEqual([
      'Zeus',
      'Hermès',
      'Athéna',
      "L'arbitre",
    ]);
  });

  it('la démo n’est jamais le tournoi « actif » du bot', async () => {
    await saveTournament(env.DB, DEMO_TOURNAMENT);
    expect(await getCurrentTournament(env.DB)).toBeNull();
  });

  it('les requêtes de réinstallation désignent le tournoi par son slug', () => {
    const statements = tournamentStatements(DEMO_TOURNAMENT, DEMO_MATCH_PLAYERS);
    expect(statements[0]).toEqual({
      sql: 'DELETE FROM tournaments WHERE slug = ?',
      params: ['demo'],
    });
    // Chaque requête a autant de « ? » que de valeurs : aucune valeur décalée.
    for (const s of statements) {
      expect(s.sql.split('?').length - 1, s.sql).toBe(s.params.length);
    }
  });
});

describe('toRows / toBracket', () => {
  it('sont l’inverse l’un de l’autre, sans passer par la base', () => {
    const rows = toRows(DEMO_TOURNAMENT);
    expect(toBracket(rows.matches, DEMO_TOURNAMENT.clans)).toEqual(DEMO_TOURNAMENT.bracket);
  });

  it('pas de matchs : pas d’arbre', () => {
    expect(toBracket([], [])).toBeNull();
  });
});
