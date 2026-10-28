import type { PosterInput } from '../../src/app/core/poster/poster';
import type { Choice } from './discord/types';

/**
 * Les matchs « Clan vs Clan » annoncés par une affiche (/arbitre affiche),
 * retenus pour l'affiche du résultat (/arbitre victoire).
 */

export interface ClanMatch extends PosterInput {
  readonly id: number;
  /** Le vainqueur, une fois le résultat publié. */
  readonly result: 'left' | 'right' | null;
}

interface Row {
  id: number;
  left_name: string;
  left_logo: string;
  right_name: string;
  right_logo: string;
  format: string;
  date_label: string;
  time_label: string;
  rules: string;
  winner: 'left' | 'right' | null;
}

const toMatch = (r: Row): ClanMatch => ({
  id: r.id,
  leftName: r.left_name,
  leftLogo: r.left_logo,
  rightName: r.right_name,
  rightLogo: r.right_logo,
  format: r.format,
  date: r.date_label,
  time: r.time_label,
  rules: r.rules,
  result: r.winner,
});

/** Retient le match ; renvoie son identifiant. */
export async function saveClanMatch(
  db: D1Database,
  m: PosterInput,
  createdBy: string,
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO cvc_matches (created_by, left_name, left_logo, right_name, right_logo,
         format, date_label, time_label, rules)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      createdBy,
      m.leftName,
      m.leftLogo,
      m.rightName,
      m.rightLogo,
      m.format,
      m.date,
      m.time,
      m.rules,
    )
    .first<{ id: number }>();
  return row!.id;
}

/** Les logos copiés chez nous (gardés jusqu'au match) remplacent les liens de Discord. */
export async function saveClanLogos(
  db: D1Database,
  id: number,
  logos: { left: string | null; right: string | null },
): Promise<void> {
  await db
    .prepare(
      `UPDATE cvc_matches SET left_logo = COALESCE(?, left_logo),
         right_logo = COALESCE(?, right_logo) WHERE id = ?`,
    )
    .bind(logos.left, logos.right, id)
    .run();
}

export async function getClanMatch(db: D1Database, id: number): Promise<ClanMatch | null> {
  const row = await db.prepare('SELECT * FROM cvc_matches WHERE id = ?').bind(id).first<Row>();
  return row ? toMatch(row) : null;
}

export async function saveClanResult(
  db: D1Database,
  id: number,
  winner: 'left' | 'right',
  score: string,
): Promise<void> {
  await db
    .prepare('UPDATE cvc_matches SET winner = ?, score = ? WHERE id = ?')
    .bind(winner, score || null, id)
    .run();
}

/** Suggestions pour `/arbitre victoire match:` : les affiches récentes, sans résultat d'abord. */
export async function clanMatchChoices(db: D1Database, typed: string): Promise<Choice[]> {
  const { results } = await db
    .prepare(`SELECT * FROM cvc_matches ORDER BY (winner IS NOT NULL), id DESC LIMIT 50`)
    .all<Row>();
  const query = typed.toLowerCase();
  return results
    .map(toMatch)
    .map((m) => ({
      name: `${m.leftName} vs ${m.rightName} · ${m.date} ${m.time}${m.result ? ' (résultat publié)' : ''}`.slice(
        0,
        100,
      ),
      value: String(m.id),
    }))
    .filter((c) => c.name.toLowerCase().includes(query))
    .slice(0, 25);
}

/**
 * Un lien d'image de Discord a-t-il expiré ? Ils portent leur date de fin
 * (paramètre `ex`, en secondes, en hexadécimal) ; on garde 5 minutes de marge.
 */
export function linkExpired(url: string, now: number): boolean {
  try {
    const ex = new URL(url).searchParams.get('ex');
    return ex !== null && parseInt(ex, 16) * 1000 < now + 5 * 60 * 1000;
  } catch {
    return true;
  }
}
