import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBracket } from '../../src/app/core/tournament/bracket';
import type { Tournament } from '../../src/app/core/tournament/tournament';
import { DEMO_TOURNAMENT } from '../../src/app/features/tournaments/data/demo-tournament';
import {
  getTournament,
  listTournaments,
  saveTournament,
  toBracket,
  toRows,
} from '../src/repository';

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

describe('toRows / toBracket', () => {
  it('sont l’inverse l’un de l’autre, sans passer par la base', () => {
    const rows = toRows(DEMO_TOURNAMENT);
    expect(toBracket(rows.matches, DEMO_TOURNAMENT.clans)).toEqual(DEMO_TOURNAMENT.bracket);
  });

  it('pas de matchs : pas d’arbre', () => {
    expect(toBracket([], [])).toBeNull();
  });
});
