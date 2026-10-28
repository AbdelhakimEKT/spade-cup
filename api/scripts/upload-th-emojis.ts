/**
 * Envoie les icônes des HDV (scripts/th-emojis/th9.png … th18.png) comme
 * émojis de l'application Discord : le bot les affiche à côté de chaque
 * inscrit d'une FW (« <:th18:…> Rags »). À lancer une seule fois ; un émoji
 * déjà présent n'est pas renvoyé.
 *
 * Le jeton du bot est un SECRET : il se passe en variable d'environnement le
 * temps de la commande, et n'est jamais écrit dans un fichier du projet.
 *
 *   DISCORD_APPLICATION_ID=… DISCORD_BOT_TOKEN=… npm run upload:emojis
 */
import { readdir, readFile } from 'node:fs/promises';

const appId = process.env.DISCORD_APPLICATION_ID;
const token = process.env.DISCORD_BOT_TOKEN;
if (!appId || !token) {
  console.error('Il manque DISCORD_APPLICATION_ID ou DISCORD_BOT_TOKEN.');
  process.exit(1);
}

const api = `https://discord.com/api/v10/applications/${appId}/emojis`;
const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
const folder = new URL('./th-emojis/', import.meta.url);

const existing = await fetch(api, { headers });
if (!existing.ok) {
  console.error(`Refusé par Discord (HTTP ${existing.status}) :`, await existing.text());
  process.exit(1);
}
const { items } = (await existing.json()) as { items: { name: string }[] };
const known = new Set(items.map((e) => e.name));

for (const file of (await readdir(folder)).filter((f) => /^th\d+\.png$/.test(f)).sort()) {
  const name = file.replace('.png', '');
  if (known.has(name)) {
    console.log(`= ${name} déjà présent`);
    continue;
  }
  const image = `data:image/png;base64,${(await readFile(new URL(file, folder))).toString('base64')}`;
  const response = await fetch(api, { method: 'POST', headers, body: JSON.stringify({ name, image }) });
  console.log(response.ok ? `✅ ${name}` : `❌ ${name} : ${response.status} ${await response.text()}`);
}
