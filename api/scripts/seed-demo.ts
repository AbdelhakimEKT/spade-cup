/**
 * Génère le SQL qui (ré)installe le tournoi de démonstration dans la base de
 * production. Usage : npm run seed:demo
 *
 * Il réutilise `tournamentStatements`, les MÊMES requêtes que le serveur : la
 * démo en base est donc exactement celle des tests. Seule différence : les
 * valeurs sont écrites dans le texte SQL au lieu d'être « liées ».
 */
import { DEMO_MATCH_PLAYERS } from '../../src/app/features/tournaments/data/demo-players';
import { DEMO_TOURNAMENT } from '../../src/app/features/tournaments/data/demo-tournament';
import { tournamentStatements, type Statement } from '../src/repository';

/** Valeur SQL littérale (les apostrophes sont doublées, c'est la règle SQL). */
const literal = (value: string | number | null): string =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${value.replaceAll("'", "''")}'`;

/** Remplace chaque « ?n » ou « ? » par sa valeur. */
function inline(s: Statement): string {
  let next = 0;
  const sql = s.sql.replace(/\?(\d+)?/g, (_, n?: string) =>
    literal(s.params[n ? Number(n) - 1 : next++]),
  );
  return `${sql.replace(/\s+/g, ' ').trim()};`;
}

console.log(tournamentStatements(DEMO_TOURNAMENT, DEMO_MATCH_PLAYERS).map(inline).join('\n'));
