/**
 * Déclare les commandes du bot auprès de Discord. À relancer seulement quand
 * la liste des commandes change (src/discord/commands.ts).
 *
 * Le jeton du bot est un SECRET : il se passe en variable d'environnement le
 * temps de la commande, et n'est jamais écrit dans un fichier du projet.
 *
 *   DISCORD_APPLICATION_ID=… DISCORD_BOT_TOKEN=… npm run register:commands
 */
import { COMMANDS } from '../src/discord/commands';

const appId = process.env.DISCORD_APPLICATION_ID;
const token = process.env.DISCORD_BOT_TOKEN;
if (!appId || !token) {
  console.error('Il manque DISCORD_APPLICATION_ID ou DISCORD_BOT_TOKEN (voir le README).');
  process.exit(1);
}

// PUT remplace TOUTE la liste : une commande retirée du fichier disparaît de Discord.
const response = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: 'PUT',
  headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(COMMANDS),
});

if (!response.ok) {
  console.error(`Refusé par Discord (HTTP ${response.status}) :`, await response.text());
  process.exit(1);
}
const saved = (await response.json()) as { name: string }[];
console.log(
  `✅ ${saved.length} commandes enregistrées : ${saved.map((c) => `/${c.name}`).join(', ')}`,
);
