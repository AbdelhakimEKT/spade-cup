import { describe, expect, it, vi } from 'vitest';
import { bracketFromSeeds, recordResult } from '../../src/app/core/tournament/bracket';
import { announce, destinationFor, pack, roundsCompleted, victoryText } from '../src/announcements';
import { CLANS, FAKE_PNG, fakeAnnouncer } from './helpers';

/** Un tournoi de 4 clans : deux demies, puis la finale. */
const t = { name: 'Cup', slug: 'cup' };
const four = bracketFromSeeds(CLANS.slice(0, 4));

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
  it('un simple début de guerre : rien sur Discord (seulement « en cours » sur le site)', async () => {
    const { announcer, posted, shots } = fakeAnnouncer();
    await announce(announcer, t, four, { started: [four.matches[0]] });
    expect(posted).toEqual([]);
    expect(shots).toEqual([]);
  });

  it('un résultat : la phrase des organisateurs AVEC le récap en image, puis l’arbre', async () => {
    const after = recordResult(four, 'R1-M1', 'home');
    const { announcer, posted } = fakeAnnouncer();
    await announce(announcer, t, after, { finished: [{ matchId: 'R1-M1' }] });
    expect(posted.map((p) => [p.channel, p.reply.content, p.reply.files?.[0].name])).toEqual([
      [
        'results',
        `🏆 Victoire de ${CLANS[0].name} qui se qualifie pour la finale ! ⚔️`,
        'recap-R1-M1.png',
      ],
      // L'autre demie reste à jouer : pas encore de « fin de tour ».
      ['bracket', '🏆 **Cup** · Demi-finales', 'arbre.png'],
    ]);
  });

  it('navigateur en panne : la phrase part quand même, seule ; pas d’arbre', async () => {
    const after = recordResult(four, 'R1-M1', 'home');
    const { announcer, posted } = fakeAnnouncer({ failCapture: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await announce(announcer, t, after, { finished: [{ matchId: 'R1-M1' }] });
    expect(posted).toEqual([
      {
        channel: 'results',
        reply: { content: `🏆 Victoire de ${CLANS[0].name} qui se qualifie pour la finale ! ⚔️` },
      },
    ]);
  });
});

describe('victoryText : la phrase demandée par les organisateurs', () => {
  it('qualification pour le tour suivant', () => {
    const after = recordResult(four, 'R1-M2', 'away');
    expect(victoryText(t, after, 'R1-M2')).toBe(
      `🏆 Victoire de ${after.matches[1].away!.name} qui se qualifie pour la finale ! ⚔️`,
    );
  });

  it('la finale : le champion remporte le tournoi', () => {
    let b = recordResult(four, 'R1-M1', 'home');
    b = recordResult(b, 'R1-M2', 'home');
    b = recordResult(b, 'R2-M1', 'away');
    expect(victoryText(t, b, 'R2-M1')).toBe(
      `🏆 Victoire de ${b.matches[2].away!.name} qui remporte Cup ! 👑`,
    );
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
