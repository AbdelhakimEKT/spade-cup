import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/discord/bot';
import type { Shot } from '../src/screens';
import { FAKE_PNG, MEMBER, botContext, command } from './helpers';

const db = () => env.DB;

/** Une FW où le joueur #PQ2 (« Rags ») a fait 3 étoiles. */
async function ragsPlayedOnce(): Promise<void> {
  await db()
    .prepare(
      `INSERT INTO friendly_wars (war_key, started_at, ended_at, team_size, home_tag, home_name,
         home_stars, home_destruction, home_duration, away_tag, away_name, away_stars,
         away_destruction, away_duration, winner)
       VALUES ('k', '2026-10-28 20:00:00', '2026-10-28 20:15:00', 5, '#A', 'FW-team1', 10, 80,
         600, '#B', 'FW-team2', 9, 70, 600, 'home')`,
    )
    .run();
  await db()
    .prepare(
      `INSERT INTO fw_players (war_id, side, clan_tag, player_tag, player_name, town_hall,
         map_position, attacks, stars, destruction_sum, triples, duration)
       VALUES ((SELECT id FROM friendly_wars WHERE war_key = 'k'), 'home', '#A', '#PQ2', 'Rags',
         18, 1, 1, 3, 100, 1, 150)`,
    )
    .run();
}

describe('/carte', () => {
  it('sans tag : la carte du compte enregistré pour les FW, postée dans le salon', async () => {
    await ragsPlayedOnce();
    await db()
      .prepare(
        "INSERT INTO discord_accounts (discord_id, player_tag, player_name, town_hall) VALUES (?, '#PQ2', 'Rags', 18)",
      )
      .bind(MEMBER.id)
      .run();
    const shots: Shot[] = [];
    const ctx = {
      ...botContext(db()),
      capture: async (s: readonly Shot[]) => (shots.push(...s), [FAKE_PNG]),
    };
    const reply = await runCommand(command('carte'), ctx);
    expect(shots).toEqual([{ kind: 'card', tag: '#PQ2' }]);
    expect(reply.ephemeral).toBeFalsy();
    expect(reply.content).toBe('🎴 Carte de **Rags** · https://site.test/joueurs/PQ2');
    expect(reply.files?.[0].name).toBe('carte-PQ2.png');
    expect(reply.publicFollowUp).toBe(true); // postée pour tout le salon
  });

  it('un autre joueur, par son tag', async () => {
    await ragsPlayedOnce();
    const reply = await runCommand(command('carte', { joueur: 'pq2' }), botContext(db()));
    expect(reply.content).toContain('**Rags**');
  });

  it('aucun compte enregistré, tag invalide ou sans guerre : message clair, rien de posté', async () => {
    const ctx = botContext(db());
    expect((await runCommand(command('carte'), ctx)).content).toMatch(/Donne le tag du joueur/);
    expect((await runCommand(command('carte', { joueur: 'abc!' }), ctx)).content).toMatch(
      /n'est pas un tag de joueur valide/,
    );
    const none = await runCommand(command('carte', { joueur: '#PQ9' }), ctx);
    expect(none).toEqual({
      content: '❌ Aucune guerre enregistrée pour #PQ9 : pas encore de carte.',
      ephemeral: true,
    });
  });
});
