import { announce, createAnnouncer } from '../announcements';
import { captureScreens } from '../screens';
import { createCocClient } from '../coc';
import { json } from '../http';
import { autocomplete, needsDefer, runCommand, type BotContext, type Reply } from './bot';
import { editBody, message } from './payload';
import { InteractionType, ResponseType, type Interaction } from './types';
import { verifyDiscordSignature } from './verify';

/**
 * POST /discord : l'adresse que Discord appelle à chaque commande tapée.
 *
 * Pas de bot « connecté en permanence » : Discord nous envoie une requête
 * HTTP signée, on répond. C'est ce qui permet de faire tourner le bot sur un
 * Worker gratuit, qui ne vit que le temps d'une requête.
 */
export async function handleDiscord(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const body = await request.text();
  const authentic = await verifyDiscordSignature(
    env.DISCORD_PUBLIC_KEY,
    request.headers.get('X-Signature-Ed25519') ?? '',
    request.headers.get('X-Signature-Timestamp') ?? '',
    body,
  );
  if (!authentic) return new Response('Signature invalide.', { status: 401 });

  const interaction = JSON.parse(body) as Interaction;
  const bot: BotContext = {
    db: env.DB,
    coc: createCocClient(env),
    siteUrl: env.SITE_URL,
    capture: (shots) => captureScreens(env.BROWSER, env.SITE_URL, shots),
    publish: (t, bracket, outcome) =>
      ctx.waitUntil(
        announce(createAnnouncer(env), t, bracket, outcome).catch((error) =>
          console.error('Annonce impossible', error),
        ),
      ),
    // Hasard cryptographique pour le tirage : impossible à prédire ou à orienter.
    random: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
  };

  switch (interaction.type) {
    case InteractionType.Ping:
      // Discord vérifie que l'adresse répond avant de l'accepter.
      return json({ type: ResponseType.Pong });

    case InteractionType.Autocomplete:
      return json({
        type: ResponseType.AutocompleteResult,
        data: { choices: await autocomplete(interaction, bot) },
      });

    case InteractionType.Command:
      if (needsDefer(interaction)) {
        // Discord exige une réponse en 3 secondes ; l'API du jeu peut être plus
        // lente. On répond tout de suite « je réfléchis », et la vraie réponse
        // part après coup (`waitUntil` garde le Worker en vie jusque-là).
        ctx.waitUntil(safeRun(interaction, bot).then((reply) => editOriginal(interaction, reply)));
        return json({ type: ResponseType.Deferred });
      }
      return json({ type: ResponseType.Message, data: message(await safeRun(interaction, bot)) });

    default:
      return new Response('Interaction non gérée.', { status: 400 });
  }
}

async function safeRun(interaction: Interaction, bot: BotContext): Promise<Reply> {
  try {
    return await runCommand(interaction, bot);
  } catch (error) {
    console.error('Commande Discord en échec', interaction.data?.name, error);
    return { content: '💥 Erreur interne, réessaie dans un instant.', ephemeral: true };
  }
}

/** Remplace le « je réfléchis » par la vraie réponse. */
async function editOriginal(interaction: Interaction, reply: Reply): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;
  const response = await fetch(url, { method: 'PATCH', ...editBody(reply) });
  if (!response.ok) {
    console.error('Réponse Discord refusée', response.status, await response.text());
  }
}
