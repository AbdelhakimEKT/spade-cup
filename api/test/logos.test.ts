import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { serveLogo, storeLogo } from '../src/logos';
import { FAKE_PNG } from './helpers';

/** Un faux Discord qui sert une image. */
const discord =
  (type = 'image/png', body: BodyInit = FAKE_PNG, status = 200): typeof fetch =>
  async () =>
    new Response(body, { status, headers: { 'content-type': type } });

describe('logos des matchs Clan vs Clan (gardés jusqu’au match)', () => {
  const now = Date.UTC(2026, 9, 29, 12);
  const until = Date.UTC(2026, 10, 28, 21); // 28/11 : un match de ligue, bien après 24 h

  it('copiés depuis Discord, puis servis par GET /logos/:clé', async () => {
    const url = await storeLogo(
      env.LOGOS,
      'cvc-1-left',
      'https://cdn.discordapp.com/a.png',
      until,
      now,
      discord(),
    );
    expect(url).toBe('https://spade-cup-api.popi-coc.workers.dev/logos/cvc-1-left');
    const response = await serveLogo(env.LOGOS, 'cvc-1-left');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(FAKE_PNG);
  });

  it('pas une image, ou Discord refuse : pas de copie (on garde le lien de Discord)', async () => {
    expect(
      await storeLogo(env.LOGOS, 'cvc-2-left', 'x', until, now, discord('text/html')),
    ).toBeNull();
    expect(
      await storeLogo(env.LOGOS, 'cvc-2-left', 'x', until, now, discord('image/png', 'x', 404)),
    ).toBeNull();
    expect((await serveLogo(env.LOGOS, 'cvc-2-left')).status).toBe(404);
  });
});
