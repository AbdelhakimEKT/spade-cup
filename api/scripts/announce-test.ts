/**
 * Test des annonces dans les VRAIS salons Discord, avec le tournoi de
 * démonstration. Jamais mis en ligne : uniquement en développement, sur le
 * réseau de Cloudflare (`--remote`), où sont enregistrés les webhooks.
 *
 *   npx wrangler dev scripts/announce-test.ts --remote --port 8798
 *   http://localhost:8798/            aperçu : rien n'est envoyé
 *   http://localhost:8798/?envoyer=1  envoi réel (une fois)
 */
import { announce, webhookFor, type Announcer, type Channel } from '../src/announcements';
import type { Reply } from '../src/discord/bot';
import { postToWebhook } from '../src/discord/payload';
import { getTournament } from '../src/repository';
import { captureScreens } from '../src/screens';

const BANNER =
  '🧪 **Test des annonces Spade Cup FR.** Voici à quoi ressembleront les messages du bot ' +
  'pendant les tournois. Clans et scores fictifs (tournoi de démonstration).';

export default {
  async fetch(request, env): Promise<Response> {
    const send = new URL(request.url).searchParams.get('envoyer') === '1';
    const channels: Channel[] = ['results', 'bracket', 'referees'];
    const configured = Object.fromEntries(channels.map((c) => [c, Boolean(webhookFor(env, c))]));

    const t = await getTournament(env.DB, 'demo');
    if (!t?.bracket) return Response.json({ error: 'Démo introuvable en base.' }, { status: 500 });

    // Ce qui serait posté, dans l'ordre, salon par salon.
    const plan: { channel: Channel; content: string; files: string[] }[] = [];
    const bannerDone = new Set<Channel>();
    const announcer: Announcer = {
      async post(channel, reply: Reply) {
        if (!bannerDone.has(channel)) {
          bannerDone.add(channel);
          plan.push({ channel, content: BANNER, files: [] });
          if (send) await postToWebhook(webhookFor(env, channel)!, { content: BANNER });
        }
        plan.push({
          channel,
          content: reply.content,
          files: (reply.files ?? []).map((f) => f.name),
        });
        if (send) await postToWebhook(webhookFor(env, channel)!, reply);
      },
      // En aperçu, pas de navigateur : on note seulement quelles images partiraient.
      capture: (shots) =>
        send
          ? captureScreens(env.BROWSER, env.SITE_URL, shots)
          : Promise.resolve(shots.map(() => new Uint8Array())),
    };

    const match = (id: string) => t.bracket!.matches.find((m) => m.id === id)!;
    // Comme en vrai, trois moments distincts : un début de guerre, un résultat,
    // puis une égalité parfaite (le seul message du salon des arbitres).
    await announce(announcer, env.SITE_URL, t, t.bracket, { started: [match('R2-M1')] });
    await announce(announcer, env.SITE_URL, t, t.bracket, {
      finished: [{ matchId: 'R1-M3' }],
    });
    await announce(announcer, env.SITE_URL, t, t.bracket, { ties: [match('R2-M4')] });

    return Response.json({ envoye: send, salons: configured, plan });
  },
} satisfies ExportedHandler<Env>;
