import { describe, expect, it } from 'vitest';
import { bracketFromSeeds, recordResult } from '../../src/app/core/tournament/bracket';
import { announce, destinationFor, pack, roundsCompleted } from '../src/announcements';
import { CLANS, FAKE_PNG, fakeAnnouncer } from './helpers';

describe('destinationFor : chaque annonce dans son salon', () => {
  const hooks = {
    DISCORD_WEBHOOK_RESULTATS: 'w-r',
    DISCORD_WEBHOOK_CLASSEMENT: 'w-c',
    DISCORD_WEBHOOK_ARBITRES: 'w-a',
  };
  const bot = {
    DISCORD_BOT_TOKEN: 'jeton',
    DISCORD_CHANNEL_RESULTATS: '111',
    DISCORD_CHANNEL_CLASSEMENT: '222',
    DISCORD_CHANNEL_ARBITRES: '333',
  };

  it('le bot en priorité : son nom et son avatar, dans le salon indiqué', () => {
    expect(destinationFor({ ...hooks, ...bot }, 'results')).toEqual({
      by: 'bot',
      token: 'jeton',
      channelId: '111',
    });
    expect(destinationFor({ ...hooks, ...bot }, 'referees')).toMatchObject({ channelId: '333' });
  });

  it('sans jeton du bot, ou sans identifiant de salon : le webhook du salon', () => {
    expect(destinationFor({ ...hooks, DISCORD_CHANNEL_RESULTATS: '111' }, 'results')).toEqual({
      by: 'webhook',
      url: 'w-r',
    });
    expect(destinationFor({ ...hooks, ...bot, DISCORD_CHANNEL_CLASSEMENT: '' }, 'bracket')).toEqual(
      {
        by: 'webhook',
        url: 'w-c',
      },
    );
  });

  it('à défaut, l’ancien webhook unique ; les alertes arbitres retombent dans #résultats', () => {
    const old = { DISCORD_ANNOUNCE_WEBHOOK: 'ancien' };
    expect(destinationFor(old, 'bracket')).toEqual({ by: 'webhook', url: 'ancien' });
    expect(destinationFor(old, 'referees')).toEqual({ by: 'webhook', url: 'ancien' });
    expect(destinationFor({ ...bot, DISCORD_CHANNEL_ARBITRES: '' }, 'referees')).toMatchObject({
      channelId: '111',
    });
  });

  it('rien de configuré : aucune annonce', () => {
    expect(destinationFor({}, 'results')).toBeNull();
  });
});

describe('announce', () => {
  const t = { name: 'Cup', slug: 'cup' };
  const four = bracketFromSeeds(CLANS.slice(0, 4));

  it('un simple début : un message dans #résultats, aucune image', async () => {
    const { announcer, posted, shots } = fakeAnnouncer();
    await announce(announcer, 'https://site.test', t, four, { started: [four.matches[0]] });
    expect(posted.map((p) => p.channel)).toEqual(['results']);
    expect(shots).toEqual([]);
  });

  it('un résultat : texte, récap, arbre, dans cet ordre et chacun dans son salon', async () => {
    const after = recordResult(four, 'R1-M1', 'home');
    const { announcer, posted } = fakeAnnouncer();
    await announce(announcer, 'https://site.test', t, after, {
      finished: [{ matchId: 'R1-M1' }],
    });
    expect(posted.map((p) => [p.channel, p.reply.files?.[0].name ?? 'texte'])).toEqual([
      ['results', 'texte'],
      ['results', 'recap-R1-M1.png'],
      ['bracket', 'arbre.png'],
    ]);
    expect(posted[0].reply.content).toContain('se qualifie pour la finale');
    expect(posted[0].reply.content).not.toContain('https://'); // pas de lien : les images suffisent
    expect(posted[2].reply.files?.[0].data).toEqual(FAKE_PNG);
  });
});

describe('roundsCompleted : fin d’un tour', () => {
  const eight = bracketFromSeeds([
    ...CLANS,
    ...CLANS.slice(0, 3).map((c) => ({ ...c, tag: `${c.tag}2` })),
  ]);
  const allQuarters = ['R1-M1', 'R1-M2', 'R1-M3', 'R1-M4'];
  const played = (ids: string[]) => ids.reduce((b, id) => recordResult(b, id, 'home'), eight);

  it('tant qu’un match du tour reste à jouer : rien', () => {
    expect(roundsCompleted(played(allQuarters.slice(0, 3)), [{ matchId: 'R1-M3' }])).toBe('');
  });

  it('le dernier quart vient de finir : place aux demi-finales', () => {
    expect(roundsCompleted(played(allQuarters), [{ matchId: 'R1-M4' }])).toBe(
      '\n✅ Les quarts de finale sont terminés : place aux demi-finales !',
    );
  });

  it('les demies finies : place à la finale ; la finale elle-même : rien (le champion est annoncé)', () => {
    const semis = recordResult(recordResult(played(allQuarters), 'R2-M1', 'home'), 'R2-M2', 'home');
    expect(roundsCompleted(semis, [{ matchId: 'R2-M2' }])).toBe(
      '\n✅ Les demi-finales sont terminées : place à la finale !',
    );
    expect(roundsCompleted(recordResult(semis, 'R3-M1', 'home'), [{ matchId: 'R3-M1' }])).toBe('');
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
