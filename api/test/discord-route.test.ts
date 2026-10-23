import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { editBody } from '../src/discord/payload';
import { verifyDiscordSignature } from '../src/discord/verify';
import { command, referee } from './helpers';

/**
 * On joue le rôle de Discord : une vraie paire de clés Ed25519 est générée,
 * la clé publique est donnée au serveur, et on signe nos requêtes avec la
 * clé privée, exactement comme Discord le fait.
 */
let privateKey: CryptoKey;
let publicKeyHex: string;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  privateKey = pair.privateKey;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  publicKeyHex = toHex(raw);
});

afterEach(() => vi.restoreAllMocks());

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sign(body: string, timestamp = '1700000000') {
  const signature = await crypto.subtle.sign(
    'Ed25519',
    privateKey,
    new TextEncoder().encode(timestamp + body),
  );
  return { signature: toHex(new Uint8Array(signature)), timestamp };
}

/** Envoie une interaction au serveur, signée (ou pas), et attend le travail en arrière-plan. */
async function send(payload: unknown, options: { signed?: boolean; tamper?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const { signature, timestamp } = await sign(body);
  const headers: Record<string, string> =
    options.signed === false
      ? {}
      : { 'X-Signature-Ed25519': signature, 'X-Signature-Timestamp': timestamp };
  const request = new Request<unknown, IncomingRequestCfProperties>('https://api.test/discord', {
    method: 'POST',
    headers,
    body: options.tamper ? body.replace('creer', 'tirage') : body,
  });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, { ...env, DISCORD_PUBLIC_KEY: publicKeyHex }, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe('POST /discord', () => {
  it('requête non signée, ou modifiée après signature : 401', async () => {
    expect((await send({ type: 1 }, { signed: false })).status).toBe(401);
    expect((await send(referee('creer', { nom: 'Cup' }), { tamper: true })).status).toBe(401);
  });

  it('PING de Discord : PONG', async () => {
    const response = await send({ type: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
  });

  it('commande rapide : réponse immédiate, sans jamais notifier personne', async () => {
    const response = await send(command('tournoi'));
    const body = (await response.json()) as { type: number; data: Record<string, unknown> };
    expect(body.type).toBe(4);
    expect(body.data.content).toContain('Aucun tournoi en cours');
    expect(body.data.allowed_mentions).toEqual({ parse: [] });
  });

  it('erreur de saisie : message visible seulement par son auteur', async () => {
    const body = (await (await send(referee('lancer', { match: 'R1-M1' }))).json()) as {
      data: { flags: number };
    };
    expect(body.data.flags).toBe(64 | 4); // visible par son auteur seul, sans carte d'aperçu
  });

  it('commande lente : « je réfléchis », puis la réponse est envoyée à Discord', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response('{}');
    });
    await send(referee('creer', { nom: 'Cup' }));

    const response = await send(command('inscription', { tag: '#2PPP' }));
    expect(await response.json()).toEqual({ type: 5 });

    const edit = calls.find((c) => c.url.includes('discord.com'));
    expect(edit?.url).toBe('https://discord.com/api/v10/webhooks/app/jeton/messages/@original');
    expect(edit?.init?.method).toBe('PATCH');
    // Pas de clé de l'API du jeu en test : inscription avec le tag seul.
    expect(JSON.parse(String(edit?.init?.body)).content).toContain('`#2PPP`');
  });

  it('autocomplétion : type 8 avec des choix', async () => {
    const response = await send({ ...referee('lancer', { match: '' }), type: 4 });
    expect(await response.json()).toEqual({ type: 8, data: { choices: [] } });
  });
});

describe('verifyDiscordSignature', () => {
  it('refuse les clés et signatures mal formées sans planter', async () => {
    expect(await verifyDiscordSignature('zz', 'aa', '1', '{}')).toBe(false);
    expect(await verifyDiscordSignature(publicKeyHex, 'abc', '1', '{}')).toBe(false);
    expect(await verifyDiscordSignature(publicKeyHex, 'ab'.repeat(64), '', '{}')).toBe(false);
  });

  it('accepte une vraie signature', async () => {
    const { signature, timestamp } = await sign('{"a":1}');
    expect(await verifyDiscordSignature(publicKeyHex, signature, timestamp, '{"a":1}')).toBe(true);
  });
});

describe('editBody : la réponse envoyée à Discord', () => {
  it('sans fichier : du JSON', async () => {
    const { body, headers } = editBody({ content: 'Salut' });
    expect(headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(body))).toMatchObject({
      content: 'Salut',
      allowed_mentions: { parse: [] },
    });
  });

  it('avec l’image : un formulaire multipart, la pièce jointe déclarée dans le JSON', async () => {
    const png = new Uint8Array([1, 2, 3]);
    const { body, headers } = editBody({
      content: 'Arbre',
      files: [{ name: 'arbre.png', data: png }],
    });
    expect(headers).toBeUndefined(); // fetch écrit lui-même l'en-tête multipart
    const form = body as FormData;

    expect(JSON.parse(String(form.get('payload_json')))).toMatchObject({
      content: 'Arbre',
      attachments: [{ id: 0, filename: 'arbre.png' }],
    });
    const file = form.get('files[0]') as File;
    expect(file.name).toBe('arbre.png');
    expect(file.type).toBe('image/png');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(png);
  });
});
