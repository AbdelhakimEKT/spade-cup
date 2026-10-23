/**
 * Vérifie ce que l'API du jeu renvoie pour la guerre d'un clan, exactement
 * comme le bot la lirait. Ne touche à aucune base : lecture seule.
 *
 * Pendant ou après une guerre amicale :
 *   COC_API_TOKEN=… npm run check:war -- "#TAGDUCLAN" "#TAGADVERSAIRE"
 *
 * La clé est passée en variable d'environnement, le temps de la commande :
 * elle n'est jamais écrite dans un fichier ni affichée.
 */
import { readFriendlyWar } from '../../src/app/core/tournament/coc-war';
import { normalizeTag } from '../../src/app/core/tournament/tags';
import { decideWinner } from '../../src/app/core/tournament/war-result';
import { COC_ERROR_TEXT, createCocClient } from '../src/coc';

const [rawTag, rawOpponent] = process.argv.slice(2);
if (!rawTag) {
  console.error('Usage : COC_API_TOKEN=… npm run check:war -- "#TAG" ["#TAGADVERSAIRE"]');
  process.exit(1);
}

const coc = createCocClient({
  COC_API_TOKEN: process.env.COC_API_TOKEN,
  COC_API_BASE: process.env.COC_API_BASE ?? 'https://cocproxy.royaleapi.dev/v1',
});

const tag = normalizeTag(rawTag);
const result = await coc.currentWar(tag);
if (!result.ok) {
  console.error(`❌ ${COC_ERROR_TEXT[result.error]}`);
  process.exit(1);
}

const war = result.value;
console.log(`État de la guerre : ${war.state}`);
if (!war.clan || !war.opponent) process.exit(0);

console.log(`Taille : ${war.teamSize} contre ${war.teamSize}`);
for (const side of [war.clan, war.opponent]) {
  const attacks = (side.members ?? []).flatMap((m) => m.attacks ?? []);
  console.log(
    `• ${side.name} (${side.tag}) : ${side.stars}★, ${side.destructionPercentage} %, ` +
      `${attacks.length} attaque(s), HDV : ${(side.members ?? []).map((m) => m.townhallLevel).join(' ')}`,
  );
}

// Avec le tag adverse : la lecture complète, comme /arbitre resultat.
if (rawOpponent) {
  const home = { tag, name: war.clan.tag === tag ? war.clan.name : war.opponent.name };
  const awayTag = normalizeTag(rawOpponent);
  const away = { tag: awayTag, name: awayTag };
  const reading = readFriendlyWar(war, home, away);
  if (!reading.ok) {
    console.log(`\nLecture du bot : ❌ ${reading.reason}`);
  } else {
    const winner = decideWinner(reading.score.home, reading.score.away);
    console.log('\nLecture du bot : ✅');
    console.log(`  Score : ${JSON.stringify(reading.score)}`);
    console.log(`  Vainqueur : ${winner ?? 'égalité parfaite (arbitres)'}`);
    console.log(`  ${reading.players.length} lignes de joueurs`);
    for (const w of reading.warnings) console.log(`  ⚠️ ${w}`);
  }
}
