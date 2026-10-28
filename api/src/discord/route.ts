import { announce, createAnnouncer } from '../announcements';
import { captureScreens } from '../screens';
import { createCocClient } from '../coc';
import { json } from '../http';
import { autocomplete, needsDefer, runCommand, type BotContext, type Reply } from './bot';
import { fwComponent, fwConfig } from './fw';
import { createDiscordApi } from './rest';
import { editBody, message } from './payload';
import { EPHEMERAL, InteractionType, ResponseType, type Interaction } from './types';
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
    now: () => Date.now(),
    managerRoles: (env.FW_MANAGER_ROLES ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
    discord: createDiscordApi(env),
    fw: fwConfig(env),
    background: (task) =>
      ctx.waitUntil(task.catch((error) => console.error('Tâche Discord en échec', error))),
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
        // Les réponses de /fw ne sont visibles que par le modo : le « je réfléchis » aussi.
        return json({
          type: ResponseType.Deferred,
          ...(interaction.data?.name === 'fw' ? { data: { flags: EPHEMERAL } } : {}),
        });
      }
      return json({ type: ResponseType.Message, data: message(await safeRun(interaction, bot)) });

    // Boutons et liste sous les messages des soirées FW, formulaire du tag.
    case InteractionType.Component:
    case InteractionType.ModalSubmit: {
      let response;
      try {
        response = await fwComponent(interaction, bot);
      } catch (error) {
        console.error('Bouton Discord en échec', interaction.data?.custom_id, error);
        const reply = { content: '💥 Erreur interne, réessaie dans un instant.', ephemeral: true };
        return json({ type: ResponseType.Message, data: message(reply) });
      }
      switch (response.kind) {
        case 'reply':
          return json({ type: ResponseType.Message, data: message(response.reply) });
        case 'update':
          return json({ type: ResponseType.UpdateMessage, data: message(response.reply) });
        case 'modal':
          return json({ type: ResponseType.Modal, data: response.modal });
        case 'deferred': {
          const run = response.run;
          ctx.waitUntil(
            run()
              .catch((error): Reply => {
                console.error('Formulaire Discord en échec', error);
                return { content: '💥 Erreur interne, réessaie dans un instant.', ephemeral: true };
              })
              .then((reply) => editOriginal(interaction, reply)),
          );
          // « Je réfléchis », dans un message visible seulement par la personne.
          return json({ type: ResponseType.Deferred, data: { flags: EPHEMERAL } });
        }
      }
    }

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
