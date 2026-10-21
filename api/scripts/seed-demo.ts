/**
 * Génère le SQL qui (ré)installe le tournoi de démonstration dans la base de
 * production. Usage : npm run seed:demo
 *
 * Il réutilise `toRows`, la même traduction objet → lignes que le serveur :
 * la démo en base est donc exactement celle que le site affichait.
 */
import { DEMO_TOURNAMENT } from '../../src/app/features/tournaments/data/demo-tournament';
import { toRows } from '../src/repository';

/** Valeur SQL littérale (les apostrophes sont doublées, c'est la règle SQL). */
const sql = (value: string | number | null): string =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${value.replaceAll("'", "''")}'`;

const t = DEMO_TOURNAMENT;
const rows = toRows(t);
const id = `(SELECT id FROM tournaments WHERE slug = ${sql(t.slug)})`;

const lines = [
  `DELETE FROM matches WHERE tournament_id = ${id};`,
  `DELETE FROM registrations WHERE tournament_id = ${id};`,
  `DELETE FROM tournaments WHERE slug = ${sql(t.slug)};`,
  `INSERT INTO tournaments (slug, name, status, organizer, referees, rules, is_demo) VALUES (${[
    rows.tournament.slug,
    rows.tournament.name,
    rows.tournament.status,
    rows.tournament.organizer,
    rows.tournament.referees,
    rows.tournament.rules,
    rows.tournament.is_demo,
  ]
    .map(sql)
    .join(', ')});`,
  ...rows.registrations.map(
    (r) =>
      `INSERT INTO registrations (tournament_id, clan_tag, clan_name, badge_url, seed) VALUES (${id}, ${[
        r.clan_tag,
        r.clan_name,
        r.badge_url,
        r.seed,
      ]
        .map(sql)
        .join(', ')});`,
  ),
  ...rows.matches.map(
    (m) =>
      `INSERT INTO matches (tournament_id, match_id, round, idx, home_tag, away_tag, status, winner, home_stars, home_destruction, home_duration, away_stars, away_destruction, away_duration) VALUES (${id}, ${[
        m.match_id,
        m.round,
        m.idx,
        m.home_tag,
        m.away_tag,
        m.status,
        m.winner,
        m.home_stars,
        m.home_destruction,
        m.home_duration,
        m.away_stars,
        m.away_destruction,
        m.away_duration,
      ]
        .map(sql)
        .join(', ')});`,
  ),
];

console.log(lines.join('\n'));
