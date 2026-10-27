import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { championOf } from '../../src/app/core/tournament/bracket';
import type { Tournament } from '../../src/app/core/tournament/tournament';
import type { CocClient } from '../src/coc';
import type { Shot } from '../src/screens';
import {
  autocomplete,
  needsDefer,
  nextRoundName,
  runCommand,
  type BotContext,
} from '../src/discord/bot';
import { getCurrentTournament, getTournament, saveTournament } from '../src/repository';
import { DEMO_TOURNAMENT } from '../../src/app/features/tournaments/data/demo-tournament';
import { getMatchDetail, listPlayers } from '../src/stats-repository';
import {
  ADMIN,
  CLANS,
  FAKE_PNG,
  MEMBER,
  OTHER_MEMBER,
  botContext,
  command,
  fakeCoc,
  fakeWar,
  referee,
  seededRandom,
  typing,
} from './helpers';

const db = () => env.DB;
const active = async (): Promise<Tournament> => (await getCurrentTournament(db()))!.tournament;

/** Crée un tournoi et y inscrit `count` clans de test. */
async function openWith(ctx: BotContext, count: number) {
  await runCommand(referee('creer', { nom: "Coupe d'Hiver" }), ctx);
  for (const clan of CLANS.slice(0, count)) {
    await runCommand(command('inscription', { tag: clan.tag }), ctx);
  }
}

/** Tournoi tiré au sort, avec 2 clans : la finale directement. */
async function finalOnly(ctx: BotContext) {
  await openWith(ctx, 2);
  await runCommand(referee('tirage'), ctx);
  return (await active()).bracket!.matches[0];
}

describe('/arbitre creer', () => {
  it('crée le tournoi, ouvre les inscriptions, note l’arbitre', async () => {
    const reply = await runCommand(
      referee('creer', { nom: "Coupe d'Hiver 2026" }),
      botContext(db()),
    );

    expect(reply.ephemeral).toBeFalsy();
    expect(reply.content).toContain('https://site.test/tournois/coupe-d-hiver-2026');
    const t = await active();
    expect(t).toMatchObject({
      slug: 'coupe-d-hiver-2026',
      status: 'registration',
      referees: ['Zeus'],
      bracket: null,
    });
    expect(t.rules).toContain('HDV18');
  });

  it('règlement personnalisé', async () => {
    await runCommand(
      referee('creer', { nom: 'Cup', reglement: 'Pas de héros.' }),
      botContext(db()),
    );
    expect((await active()).rules).toBe('Pas de héros.');
  });

  it('un seul tournoi à la fois', async () => {
    const ctx = botContext(db());
    await runCommand(referee('creer', { nom: 'Premier' }), ctx);
    const reply = await runCommand(referee('creer', { nom: 'Second' }), ctx);
    expect(reply).toMatchObject({ ephemeral: true });
    expect(reply.content).toContain("« Premier » n'est pas terminé");
  });

  it('nom déjà pris par un ancien tournoi : l’adresse reçoit un suffixe', async () => {
    const ctx = botContext(db());
    await runCommand(referee('creer', { nom: 'Cup' }), ctx);
    await db().prepare("UPDATE tournaments SET status = 'finished'").run();
    await runCommand(referee('creer', { nom: 'Cup' }), ctx);
    expect((await active()).slug).toBe('cup-2');
  });

  it('nom sans lettre ni chiffre : refusé', async () => {
    const reply = await runCommand(referee('creer', { nom: '!!!' }), botContext(db()));
    expect(reply.ephemeral).toBe(true);
  });
});

describe('/inscription et /desinscription', () => {
  let ctx: BotContext;
  beforeEach(async () => {
    ctx = botContext(db());
    await runCommand(referee('creer', { nom: 'Cup' }), ctx);
  });

  it('inscrit le clan avec le nom lu dans le jeu', async () => {
    const reply = await runCommand(command('inscription', { tag: '2ppp' }), ctx);
    expect(reply.content).toContain(
      '**Les Pikachus** (`#2PPP`) est inscrit à **Cup**. 1 clan inscrit.',
    );
    expect((await active()).clans).toEqual([CLANS[0]]);
  });

  it('le « O » tapé à la place du zéro est corrigé', async () => {
    const coc = fakeCoc({}, [{ tag: '#20PP', name: 'Zéro' }]);
    await runCommand(command('inscription', { tag: '#2OPP' }), botContext(db(), coc));
    expect((await active()).clans[0].tag).toBe('#20PP');
  });

  it('tag invalide, clan inconnu, doublon : refusés sans rien écrire', async () => {
    await runCommand(command('inscription', { tag: '#2PPP' }), ctx);
    for (const tag of ['#ABC', '#2CCCCC', '#2PPP']) {
      const reply = await runCommand(command('inscription', { tag }), ctx);
      expect(reply.ephemeral, tag).toBe(true);
    }
    expect((await active()).clans).toHaveLength(1);
  });

  it('jeu injoignable : inscrit avec le tag, le nom est récupéré au tirage', async () => {
    const offline: CocClient = {
      ...fakeCoc(),
      clan: async () => ({ ok: false, error: 'unavailable' }),
    };
    const reply = await runCommand(
      command('inscription', { tag: '#2PPP' }),
      botContext(db(), offline),
    );
    expect(reply.content).toContain('récupéré au tirage');
    expect((await active()).clans[0].name).toBe('#2PPP');

    await runCommand(command('inscription', { tag: '#2QQQ' }), ctx);
    await runCommand(referee('tirage'), ctx);
    expect((await active()).clans.map((c) => c.name).sort()).toEqual(['Les Pikachus', 'Titans FR']);
  });

  it('seul celui qui a inscrit le clan, ou un admin, peut le retirer', async () => {
    await runCommand(command('inscription', { tag: '#2PPP' }, MEMBER), ctx);
    await runCommand(command('inscription', { tag: '#2QQQ' }, MEMBER), ctx);

    const refused = await runCommand(
      command('desinscription', { tag: '#2PPP' }, OTHER_MEMBER),
      ctx,
    );
    expect(refused.ephemeral).toBe(true);

    await runCommand(command('desinscription', { tag: '#2PPP' }, MEMBER), ctx);
    await runCommand(command('desinscription', { tag: '#2QQQ' }, ADMIN), ctx);
    expect((await active()).clans).toEqual([]);
  });

  it('retirer un clan non inscrit : message clair', async () => {
    const reply = await runCommand(command('desinscription', { tag: '#2PPP' }), ctx);
    expect(reply).toMatchObject({
      ephemeral: true,
      content: expect.stringContaining("n'est pas inscrit"),
    });
  });

  it('après le tirage, les inscriptions sont closes', async () => {
    await runCommand(command('inscription', { tag: '#2PPP' }), ctx);
    await runCommand(command('inscription', { tag: '#2QQQ' }), ctx);
    await runCommand(referee('tirage'), ctx);
    const reply = await runCommand(command('inscription', { tag: '#2RRR' }), ctx);
    expect(reply.content).toContain('sont closes');
  });

  it('tournoi terminé, ou aucun tournoi : message clair', async () => {
    await db().prepare("UPDATE tournaments SET status = 'finished'").run();
    expect((await runCommand(command('inscription', { tag: '#2PPP' }), ctx)).content).toContain(
      'sont closes',
    );
    await db().prepare('DELETE FROM tournaments').run();
    expect((await runCommand(command('inscription', { tag: '#2PPP' }), ctx)).content).toContain(
      "Aucun tournoi n'est ouvert",
    );
  });

  it('en message privé (sans serveur) : refusé', async () => {
    const { member: _, ...dm } = command('inscription', { tag: '#2PPP' });
    expect((await runCommand(dm, ctx)).content).toContain('sur le serveur');
  });
});

describe('/arbitre tirage', () => {
  it('5 clans : arbre de 8 places, 3 exempts, tournoi en cours', async () => {
    const ctx = botContext(db());
    await openWith(ctx, 5);
    const reply = await runCommand(referee('tirage'), ctx);

    const t = await active();
    expect(t.status).toBe('running');
    expect(t.bracket).toMatchObject({ size: 8, roundCount: 3 });
    expect(t.bracket!.matches.filter((m) => m.status === 'bye')).toHaveLength(3);
    expect(reply.content).toContain('quarts de finale');
    expect(reply.content.match(/qualifié d'office/g)).toHaveLength(3);
  });

  it('les têtes de série enregistrées reconstruisent le même arbre', async () => {
    const ctx = botContext(db());
    await openWith(ctx, 5);
    await runCommand(referee('tirage'), ctx);
    const t = await active();
    // Relu depuis la base : identique (l'ordre des clans = l'ordre du tirage).
    expect(await getTournament(db(), t.slug)).toEqual(t);
  });

  it('le hasard décide : deux tirages différents donnent deux arbres différents', async () => {
    const draws = new Set<string>();
    for (const seed of [1, 2, 3, 4]) {
      const ctx = { ...botContext(db()), random: seededRandom(seed) };
      await db().prepare('DELETE FROM tournaments').run();
      await openWith(ctx, 5);
      await runCommand(referee('tirage'), ctx);
      draws.add((await active()).clans.map((c) => c.tag).join());
    }
    expect(draws.size).toBeGreaterThan(1);
  });

  it('moins de 2 clans, ou tirage déjà fait : refusé', async () => {
    const ctx = botContext(db());
    await openWith(ctx, 1);
    expect((await runCommand(referee('tirage'), ctx)).content).toContain('au moins 2 clans');

    await runCommand(command('inscription', { tag: CLANS[1].tag }), ctx);
    await runCommand(referee('tirage'), ctx);
    expect((await runCommand(referee('tirage'), ctx)).content).toContain('déjà eu lieu');
  });

  it('sans tournoi : invite à en créer un', async () => {
    const reply = await runCommand(referee('tirage'), botContext(db()));
    expect(reply.content).toContain('/arbitre creer');
  });
});

describe('tournoi terminé', () => {
  it('la finale reste corrigeable, puis un nouveau tournoi peut être créé', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    await runCommand(referee('vainqueur', { match: final.id, clan: 'home' }), ctx);
    expect((await runCommand(command('tournoi'), ctx)).content).toContain(
      `est terminé : victoire de **${final.home!.name}**`,
    );

    await runCommand(referee('vainqueur', { match: final.id, clan: 'away' }), ctx);
    expect(championOf((await active()).bracket!)?.tag).toBe(final.away!.tag);

    await runCommand(referee('creer', { nom: 'Coupe de Printemps' }), ctx);
    expect(await active()).toMatchObject({ slug: 'coupe-de-printemps', status: 'registration' });
  });
});

describe('/arbitre lancer, resultat, score, vainqueur', () => {
  it('lancer : le match passe « en cours », une seule fois', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);

    const reply = await runCommand(referee('lancer', { match: final.id }), ctx);
    expect(reply.content).toContain('est lancé (finale)');
    expect((await active()).bracket!.matches[0].status).toBe('live');

    expect((await runCommand(referee('lancer', { match: final.id }), ctx)).ephemeral).toBe(true);
  });

  it('resultat : lit la guerre dans le jeu, enregistre score et joueurs, sacre le champion', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    const war = fakeWar(final.home!, final.away!); // 12★ contre 9★
    const reply = await runCommand(
      referee('resultat', { match: final.id }),
      botContext(db(), fakeCoc({ [final.home!.tag]: { ok: true, value: war } })),
    );

    expect(reply.content).toContain(`👑 **${final.home!.name}** remporte **Coupe d'Hiver**`);
    expect(reply.content).toContain('12★');
    const t = await getTournament(db(), 'coupe-d-hiver');
    expect(t!.status).toBe('finished');
    expect(championOf(t!.bracket!)?.tag).toBe(final.home!.tag);

    const detail = await getMatchDetail(db(), 'coupe-d-hiver', final.id);
    expect(detail!.source).toBe('game');
    expect(detail!.players.home).toHaveLength(5);
    expect(detail!.players.away.map((p) => p.stars)).toEqual([2, 2, 2, 2, 1]);
  });

  it('resultat : si le côté « domicile » ne répond pas, essaie l’adversaire', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    const coc = fakeCoc({
      [final.home!.tag]: { ok: false, error: 'private' },
      [final.away!.tag]: { ok: true, value: fakeWar(final.away!, final.home!) },
    });
    const reply = await runCommand(referee('resultat', { match: final.id }), botContext(db(), coc));
    // Le camp « away » a gagné cette guerre (lue de son côté).
    expect(reply.content).toContain(`👑 **${final.away!.name}**`);
    expect(coc.calls).toEqual([`war ${final.home!.tag}`, `war ${final.away!.tag}`]);
  });

  it('resultat : guerre pas finie ou autre adversaire → explique, n’écrit rien', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    const unfinished = fakeCoc({
      [final.home!.tag]: { ok: true, value: fakeWar(final.home!, final.away!, { state: 'inWar' }) },
    });
    const reply = await runCommand(
      referee('resultat', { match: final.id }),
      botContext(db(), unfinished),
    );
    expect(reply.ephemeral).toBe(true);
    expect(reply.content).toContain("La guerre n'est pas finie");
    expect(reply.content).toContain('/arbitre score');
    expect((await active()).bracket!.matches[0].status).toBe('pending');

    const stranger = { tag: '#2YYY', name: 'Inconnus' };
    const wrong = fakeCoc({
      [final.home!.tag]: { ok: true, value: fakeWar(final.home!, stranger) },
    });
    const reply2 = await runCommand(
      referee('resultat', { match: final.id }),
      botContext(db(), wrong),
    );
    expect(reply2.content).toContain('pas');
  });

  it('resultat : HDV17 ou guerre en 6 contre 6 → enregistré tel quel (le format est l’affaire des clans)', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    const war = fakeWar(final.home!, final.away!, { townHall: 17, teamSize: 6 });
    const reply = await runCommand(
      referee('resultat', { match: final.id }),
      botContext(db(), fakeCoc({ [final.home!.tag]: { ok: true, value: war } })),
    );
    expect(reply.content).toContain(`👑 **${final.home!.name}**`);
    expect(reply.content).not.toContain('⚠️');
  });

  it('score à la main : le pourcentage départage, les lignes de joueurs sont effacées', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    await runCommand(
      referee('resultat', { match: final.id }),
      botContext(
        db(),
        fakeCoc({ [final.home!.tag]: { ok: true, value: fakeWar(final.home!, final.away!) } }),
      ),
    );
    // Correction : la finale n'a pas de match suivant, elle reste modifiable.
    const reply = await runCommand(
      referee('score', {
        match: final.id,
        etoiles_1: 12,
        pourcent_1: 88.5,
        temps_1: '14:05',
        etoiles_2: 12,
        pourcent_2: 91.2,
        temps_2: '15:00',
      }),
      ctx,
    );
    expect(reply.content).toContain(`👑 **${final.away!.name}**`);
    const detail = await getMatchDetail(db(), 'coupe-d-hiver', final.id);
    expect(detail).toMatchObject({ source: 'referee', players: { home: [], away: [] } });
    expect(detail!.match.score!.home.totalDurationSec).toBe(845);
  });

  it('score à la main : temps illisible ou égalité parfaite → refusé', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    const base = { match: final.id, etoiles_1: 10, pourcent_1: 80, etoiles_2: 10, pourcent_2: 80 };
    const unreadable = await runCommand(
      referee('score', { ...base, temps_1: 'vite', temps_2: '10:00' }),
      ctx,
    );
    expect(unreadable.content).toContain('Temps illisible pour le clan 1');
    const tie = await runCommand(
      referee('score', { ...base, temps_1: '10:00', temps_2: '600' }),
      ctx,
    );
    expect(tie.content).toContain('Égalité parfaite');
    expect((await active()).bracket!.matches[0].status).toBe('pending');
  });

  it('vainqueur : décision des arbitres, score existant conservé', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    const reply = await runCommand(referee('vainqueur', { match: final.id, clan: 'away' }), ctx);
    expect(reply.content).toContain('🧑‍⚖️ Décision des arbitres');
    const t = await getTournament(db(), 'coupe-d-hiver');
    expect(championOf(t!.bracket!)?.tag).toBe(final.away!.tag);
    expect(t!.bracket!.matches[0].score).toBeNull();
  });

  it('match inconnu ou clan invalide : refusé', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    expect((await runCommand(referee('lancer', { match: 'R9-M9' }), ctx)).content).toContain(
      'introuvable',
    );
    expect(
      (await runCommand(referee('vainqueur', { match: final.id, clan: 'moi' }), ctx)).ephemeral,
    ).toBe(true);
  });

  it('un résultat devient définitif quand le match suivant est joué', async () => {
    const ctx = botContext(db());
    await openWith(ctx, 4);
    await runCommand(referee('tirage'), ctx);
    const semi = (await active()).bracket!.matches.filter((m) => m.round === 1);
    await runCommand(referee('vainqueur', { match: semi[0].id, clan: 'home' }), ctx);
    await runCommand(referee('vainqueur', { match: semi[1].id, clan: 'home' }), ctx);
    // Avant la finale : la demie peut encore être corrigée…
    await runCommand(referee('vainqueur', { match: semi[0].id, clan: 'away' }), ctx);
    expect((await active()).bracket!.matches[2].home?.tag).toBe(semi[0].away!.tag);
    // …mais plus après.
    await runCommand(referee('vainqueur', { match: 'R2-M1', clan: 'home' }), ctx);
    const reply = await runCommand(referee('vainqueur', { match: semi[0].id, clan: 'home' }), ctx);
    expect(reply.content).toContain('figé');
  });

  it('chaque arbitre qui agit apparaît sur le site, une seule fois', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    const hermes = { id: 'u-h', name: 'Hermès', permissions: '32' };
    await runCommand(referee('lancer', { match: final.id }, hermes), ctx);
    await runCommand(referee('vainqueur', { match: final.id, clan: 'home' }, hermes), ctx);
    expect((await getTournament(db(), 'coupe-d-hiver'))!.referees).toEqual(['Zeus', 'Hermès']);
  });
});

describe('/tournoi', () => {
  it('aucun, puis inscriptions, puis tour en cours', async () => {
    const ctx = botContext(db());
    expect((await runCommand(command('tournoi'), ctx)).content).toContain('Aucun tournoi en cours');

    await openWith(ctx, 2);
    const open = await runCommand(command('tournoi'), ctx);
    expect(open.content).toContain('inscriptions ouvertes');
    expect(open.content).toContain('Les Pikachus, Titans FR');

    await runCommand(referee('tirage'), ctx);
    const running = await runCommand(command('tournoi'), ctx);
    expect(running.content).toContain('Finale');
    expect(running.content).toContain('⏳');
  });
});

describe('autocomplétion', () => {
  it('propose les matchs avec leurs affiches, filtrés par la saisie', async () => {
    const ctx = botContext(db());
    await openWith(ctx, 4);
    await runCommand(referee('tirage'), ctx);

    const all = await autocomplete(typing('resultat', { match: '' }, 'match'), ctx);
    expect(all).toHaveLength(2); // la finale n'a pas encore ses deux clans
    expect(all[0].name).toMatch(/^Demi-finales · .+ contre .+$/);

    const name = (await active()).bracket!.matches[0].home!.name;
    const filtered = await autocomplete(
      typing('resultat', { match: name.slice(0, 4) }, 'match'),
      ctx,
    );
    expect(filtered.map((c) => c.value)).toContain('R1-M1');
  });

  it('lancer : seulement les matchs en attente', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    await runCommand(referee('lancer', { match: final.id }), ctx);
    expect(await autocomplete(typing('lancer', { match: '' }, 'match'), ctx)).toEqual([]);
    expect(await autocomplete(typing('resultat', { match: '' }, 'match'), ctx)).toHaveLength(1);
  });

  it('vainqueur : propose les deux clans du match choisi', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    const choices = await autocomplete(
      typing('vainqueur', { match: final.id, clan: '' }, 'clan'),
      ctx,
    );
    expect(choices).toEqual([
      { name: final.home!.name, value: 'home' },
      { name: final.away!.name, value: 'away' },
    ]);
  });

  it('sans arbre : aucune suggestion', async () => {
    expect(await autocomplete(typing('lancer', { match: '' }, 'match'), botContext(db()))).toEqual(
      [],
    );
  });
});

describe('needsDefer', () => {
  it('seules les commandes qui interrogent le jeu sont différées', () => {
    expect(needsDefer(command('inscription', { tag: '#2PPP' }))).toBe(true);
    expect(needsDefer(referee('resultat', { match: 'R1-M1' }))).toBe(true);
    expect(needsDefer(referee('tirage'))).toBe(true);
    expect(needsDefer(command('tournoi'))).toBe(false);
    expect(needsDefer(referee('lancer', { match: 'R1-M1' }))).toBe(false);
  });
});

describe('statistiques après un tournoi joué', () => {
  it('les joueurs apparaissent au classement, la démo non', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    await runCommand(
      referee('resultat', { match: final.id }),
      botContext(
        db(),
        fakeCoc({ [final.home!.tag]: { ok: true, value: fakeWar(final.home!, final.away!) } }),
      ),
    );
    const players = await listPlayers(db());
    expect(players).toHaveLength(10);
    expect(players[0]).toMatchObject({
      wars: 1,
      attacks: 1,
      stars: 3,
      triples: 1,
      destruction: 100,
    });
    expect(players[0].clan.tag).toBe(final.home!.tag);
  });
});

describe('/arbitre annuler', () => {
  it('nom mal retapé : rien n’est supprimé', async () => {
    const ctx = botContext(db());
    await openWith(ctx, 2);
    const reply = await runCommand(referee('annuler', { nom: 'Coupe' }), ctx);
    expect(reply).toMatchObject({ ephemeral: true });
    expect(reply.content).toContain("Rien n'a été supprimé");
    expect((await active()).clans).toHaveLength(2);
  });

  it('nom exact (sans tenir compte des majuscules) : tournoi, matchs et stats supprimés', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    await runCommand(
      referee('resultat', { match: final.id }),
      botContext(
        db(),
        fakeCoc({ [final.home!.tag]: { ok: true, value: fakeWar(final.home!, final.away!) } }),
      ),
    );
    expect(await listPlayers(db())).toHaveLength(10);

    const reply = await runCommand(referee('annuler', { nom: "  coupe d'hiver " }), ctx);
    expect(reply.content).toContain("« Coupe d'Hiver » est supprimé");
    expect(await getTournament(db(), 'coupe-d-hiver')).toBeNull();
    expect(await listPlayers(db())).toEqual([]);

    // La voie est libre pour le vrai tournoi.
    await runCommand(referee('creer', { nom: 'Le vrai' }), ctx);
    expect((await active()).name).toBe('Le vrai');
  });

  it('sans tournoi : message clair', async () => {
    const reply = await runCommand(referee('annuler', { nom: 'X' }), botContext(db()));
    expect(reply.content).toContain('Aucun tournoi');
  });
});

describe('/arbitre affiche', () => {
  const file = (id: string, name: string, type = 'image/png', size = 50_000) => ({
    id,
    filename: name,
    url: `https://cdn.discordapp.com/attachments/1/${id}/${name}?ex=1`,
    content_type: type,
    size,
  });
  /** La commande, avec ses deux logos joints (les options « fichier » valent leur identifiant). */
  function posterCommand(
    values: Record<string, string> = {},
    files = [file('a1', 'invaders.png'), file('a2', 'spartiates.webp', 'image/webp')],
  ) {
    const interaction = referee('affiche', {
      equipe_1: 'Clash Invaders',
      logo_1: 'a1',
      equipe_2: 'Spartiates',
      logo_2: 'a2',
      format: '5v5',
      date: '26-10',
      heure: '22h',
      regles: 'Esport — BO3',
      ...values,
    });
    return {
      ...interaction,
      data: {
        ...interaction.data!,
        resolved: { attachments: Object.fromEntries(files.map((f) => [f.id, f])) },
      },
    };
  }

  it('dessine l’affiche (logos, format, date et heure remises en forme) et la publie', async () => {
    const shots: Shot[] = [];
    const ctx = {
      ...botContext(db()),
      capture: async (s: readonly Shot[]) => (shots.push(...s), [FAKE_PNG]),
    };
    const reply = await runCommand(posterCommand(), ctx);

    expect(reply.files).toEqual([{ name: 'affiche.png', data: FAKE_PNG }]);
    expect(reply.ephemeral).toBeFalsy();
    const shot = shots[0];
    if (shot.kind !== 'poster') throw new Error('pas une affiche');
    const q = new URLSearchParams(shot.query);
    expect(q.get('g')).toBe('Clash Invaders');
    expect(q.get('gl')).toBe('https://cdn.discordapp.com/attachments/1/a1/invaders.png?ex=1');
    expect(q.get('dl')).toContain('spartiates.webp');
    expect([q.get('f'), q.get('j'), q.get('h'), q.get('r')]).toEqual([
      '5v5',
      '26/10',
      '22H00',
      'Esport — BO3',
    ]);
    expect(q.has('s')).toBe(false); // style classique, par défaut
  });

  it('style « Arène » : transmis à la page de l’affiche', async () => {
    const shots: Shot[] = [];
    const ctx = {
      ...botContext(db()),
      capture: async (s: readonly Shot[]) => (shots.push(...s), [FAKE_PNG]),
    };
    await runCommand(posterCommand({ style: 'arene' }), ctx);
    const shot = shots[0];
    if (shot.kind !== 'poster') throw new Error('pas une affiche');
    expect(new URLSearchParams(shot.query).get('s')).toBe('arene');
  });

  it('pas besoin d’un tournoi en cours, et la commande attend la capture (réponse différée)', async () => {
    expect(await getCurrentTournament(db())).toBeNull();
    expect(needsDefer(posterCommand())).toBe(true);
  });

  it('date ou heure illisible : message clair, pas d’affiche', async () => {
    const ctx = botContext(db());
    expect((await runCommand(posterCommand({ date: 'demain' }), ctx)).content).toContain(
      'Date illisible',
    );
    expect((await runCommand(posterCommand({ heure: '25h' }), ctx)).content).toContain(
      'Heure illisible',
    );
  });

  it('logo qui n’est pas une image, ou trop lourd : refusé', async () => {
    const ctx = botContext(db());
    const pdf = await runCommand(
      posterCommand({}, [file('a1', 'logo.pdf', 'application/pdf'), file('a2', 'b.png')]),
      ctx,
    );
    expect(pdf.content).toContain("n'est pas une image");
    const big = await runCommand(
      posterCommand({}, [file('a1', 'a.png'), file('a2', 'b.png', 'image/png', 9e6)]),
      ctx,
    );
    expect(big.content).toContain('trop lourd');
  });

  it('réservée aux admins, comme tout /arbitre', async () => {
    const interaction = posterCommand();
    const reply = await runCommand(
      { ...interaction, member: { ...interaction.member!, permissions: '0' } },
      botContext(db()),
    );
    expect(reply.content).toContain('réservées aux admins');
  });

  it('capture impossible : le dit, sans planter', async () => {
    const ctx = { ...botContext(db()), capture: () => Promise.reject(new Error('quota')) };
    expect((await runCommand(posterCommand(), ctx)).content).toContain(
      "Impossible de générer l'affiche",
    );
  });
});

describe('/arbitre arbre', () => {
  it('publie l’image de l’arbre du tournoi courant, avec le tour et le lien', async () => {
    const ctx = botContext(db());
    await openWith(ctx, 4);
    await runCommand(referee('tirage'), ctx);
    const reply = await runCommand(referee('arbre'), ctx);

    // L'image seule, sans lien.
    expect(reply.content).toBe("🏆 **Coupe d'Hiver** · Demi-finales");
    expect(reply.files).toEqual([{ name: 'arbre.png', data: FAKE_PNG }]);
  });

  it('un autre tournoi au choix (la démo), même sans tournoi en cours', async () => {
    await saveTournament(db(), DEMO_TOURNAMENT);
    const captured: string[] = [];
    const ctx = {
      ...botContext(db()),
      capture: async (shots: readonly Shot[]) => {
        if (shots[0].kind === 'bracket') captured.push(shots[0].slug);
        return [FAKE_PNG];
      },
    };
    const reply = await runCommand(referee('arbre', { tournoi: 'demo' }), ctx);
    expect(reply.content).toContain('**Tournoi de démonstration** · Quarts de finale');
    expect(captured).toEqual(['demo']);
  });

  it('tournoi terminé : annonce le champion', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    await runCommand(referee('vainqueur', { match: final.id, clan: 'home' }), ctx);
    const reply = await runCommand(referee('arbre'), ctx);
    expect(reply.content).toContain(`👑 Victoire de **${final.home!.name}**`);
  });

  it('pas encore de tirage, tournoi inconnu, aucun tournoi : message clair, pas d’image', async () => {
    const ctx = botContext(db());
    expect((await runCommand(referee('arbre'), ctx)).content).toContain('Aucun tournoi');
    expect((await runCommand(referee('arbre', { tournoi: 'nexiste-pas' }), ctx)).content).toContain(
      'introuvable',
    );
    await openWith(ctx, 2);
    const reply = await runCommand(referee('arbre'), ctx);
    expect(reply).toMatchObject({ ephemeral: true });
    expect(reply.content).toContain("n'a pas encore eu lieu");
    expect(reply.files).toBeUndefined();
  });

  it('le navigateur échoue : message d’erreur avec le lien du site', async () => {
    const ctx = { ...botContext(db()), capture: () => Promise.reject(new Error('quota')) };
    await finalOnly(ctx);
    const reply = await runCommand(referee('arbre'), ctx);
    expect(reply.ephemeral).toBe(true);
    expect(reply.content).toContain("Impossible de générer l'image");
    expect(reply.content).toContain('https://site.test/tournois/coupe-d-hiver');
  });

  it('autocomplétion : les tournois, démo signalée', async () => {
    await saveTournament(db(), DEMO_TOURNAMENT);
    const ctx = botContext(db());
    await runCommand(referee('creer', { nom: 'Coupe' }), ctx);
    const choices = await autocomplete(typing('arbre', { tournoi: '' }, 'tournoi'), ctx);
    expect(choices).toEqual([
      { name: 'Coupe', value: 'coupe' },
      { name: 'Tournoi de démonstration (démo)', value: 'demo' },
    ]);
    expect(await autocomplete(typing('arbre', { tournoi: 'démo' }, 'tournoi'), ctx)).toHaveLength(
      1,
    );
  });

  it('commande différée : le navigateur prend plusieurs secondes', () => {
    expect(needsDefer(referee('arbre'))).toBe(true);
  });
});

describe('nextRoundName', () => {
  it('accorde correctement le tour suivant', () => {
    expect(nextRoundName(4, 4)).toBe('la finale');
    expect(nextRoundName(3, 4)).toBe('les demi-finales');
    expect(nextRoundName(2, 4)).toBe('les quarts de finale');
  });
});

describe('résultats saisis à la main : annoncés dans les salons comme les automatiques', () => {
  it('lancer, resultat, score, vainqueur publient chacun leur événement', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    await runCommand(referee('lancer', { match: final.id }), ctx);
    expect(ctx.published).toEqual([{ started: [expect.objectContaining({ id: final.id })] }]);

    const withWar = {
      ...botContext(
        db(),
        fakeCoc({
          [final.home!.tag]: {
            ok: true,
            value: fakeWar(final.home!, final.away!, { townHall: 17 }),
          },
        }),
      ),
    };
    await runCommand(referee('resultat', { match: final.id }), withWar);
    expect(withWar.published).toEqual([{ finished: [{ matchId: final.id }] }]);

    const score = {
      match: final.id,
      etoiles_1: 9,
      pourcent_1: 70,
      temps_1: '10:00',
      etoiles_2: 12,
      pourcent_2: 90,
      temps_2: '11:00',
    };
    const ctx2 = botContext(db());
    await runCommand(referee('score', score), ctx2);
    await runCommand(referee('vainqueur', { match: final.id, clan: 'home' }), ctx2);
    expect(ctx2.published).toEqual([
      { finished: [{ matchId: final.id }] },
      { finished: [{ matchId: final.id }] },
    ]);
  });

  it('une commande refusée ne publie rien', async () => {
    const ctx = botContext(db());
    await finalOnly(ctx);
    await runCommand(referee('vainqueur', { match: 'R9-M9', clan: 'home' }), ctx);
    expect(ctx.published).toEqual([]);
  });
});

describe('autorisations : /arbitre réservé aux admins', () => {
  it('un membre simple ne peut ni créer, ni tirer, ni annuler un tournoi', async () => {
    const ctx = botContext(db());
    for (const sub of ['creer', 'tirage', 'annuler']) {
      const reply = await runCommand(referee(sub, { nom: 'Pirate' }, MEMBER), ctx);
      expect(reply, sub).toEqual({
        content: '❌ Les commandes /arbitre sont réservées aux admins du serveur.',
        ephemeral: true,
      });
    }
    expect(await getCurrentTournament(db())).toBeNull();
  });

  it('un membre simple ne peut pas saisir un résultat', async () => {
    const ctx = botContext(db());
    const final = await finalOnly(ctx);
    const reply = await runCommand(
      referee('vainqueur', { match: final.id, clan: 'home' }, MEMBER),
      ctx,
    );
    expect(reply.ephemeral).toBe(true);
    expect((await active()).bracket!.matches[0].status).toBe('pending');
  });

  it('« Administrateur » ou « Gérer le serveur » : autorisé', async () => {
    const administrator = { id: 'u-a', name: 'Boss', permissions: '8' };
    const reply = await runCommand(
      referee('creer', { nom: 'Cup' }, administrator),
      botContext(db()),
    );
    expect(reply.ephemeral).toBeFalsy();
  });

  it('pas de suggestions /arbitre pour un membre simple', async () => {
    const ctx = botContext(db());
    await finalOnly(ctx);
    const asMember = {
      ...typing('lancer', { match: '' }, 'match'),
      member: { user: { id: 'x', username: 'x' }, permissions: '0' },
    };
    expect(await autocomplete(asMember, ctx)).toEqual([]);
    expect(await autocomplete(typing('lancer', { match: '' }, 'match'), ctx)).toHaveLength(1);
  });

  it('l’inscription reste ouverte à tous', async () => {
    const ctx = botContext(db());
    await runCommand(referee('creer', { nom: 'Cup' }), ctx);
    const reply = await runCommand(command('inscription', { tag: CLANS[0].tag }, MEMBER), ctx);
    expect(reply.content).toContain('est inscrit');
  });
});
