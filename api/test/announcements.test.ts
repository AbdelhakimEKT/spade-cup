import { describe, expect, it } from 'vitest';
import { bracketFromSeeds, recordResult } from '../../src/app/core/tournament/bracket';
import { announce, pack, webhookFor } from '../src/announcements';
import { CLANS, FAKE_PNG, fakeAnnouncer } from './helpers';

describe('webhookFor : chaque annonce dans son salon', () => {
  const all = {
    DISCORD_WEBHOOK_RESULTATS: 'r',
    DISCORD_WEBHOOK_CLASSEMENT: 'c',
    DISCORD_WEBHOOK_ARBITRES: 'a',
    DISCORD_ANNOUNCE_WEBHOOK: 'ancien',
  };

  it('un webhook par salon', () => {
    expect(webhookFor(all, 'results')).toBe('r');
    expect(webhookFor(all, 'bracket')).toBe('c');
    expect(webhookFor(all, 'referees')).toBe('a');
  });

  it('à défaut, l’ancien webhook unique sert pour tout', () => {
    const old = { DISCORD_ANNOUNCE_WEBHOOK: 'ancien' };
    expect([
      webhookFor(old, 'results'),
      webhookFor(old, 'bracket'),
      webhookFor(old, 'referees'),
    ]).toEqual(['ancien', 'ancien', 'ancien']);
  });

  it('sans salon des arbitres : les alertes vont dans #résultats plutôt que d’être perdues', () => {
    expect(webhookFor({ DISCORD_WEBHOOK_RESULTATS: 'r' }, 'referees')).toBe('r');
  });

  it('rien de configuré : aucune annonce', () => {
    expect(webhookFor({}, 'results')).toBeUndefined();
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
      finished: [{ matchId: 'R1-M1', warnings: [] }],
    });
    expect(posted.map((p) => [p.channel, p.reply.files?.[0].name ?? 'texte'])).toEqual([
      ['results', 'texte'],
      ['results', 'recap-R1-M1.png'],
      ['bracket', 'arbre.png'],
    ]);
    expect(posted[0].reply.content).toContain('se qualifie pour la finale');
    expect(posted[0].reply.content).toContain('https://site.test/tournois/cup/matchs/R1-M1');
    expect(posted[2].reply.files?.[0].data).toEqual(FAKE_PNG);
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
