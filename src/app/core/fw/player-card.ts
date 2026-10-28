import { PlayerLine } from '../tournament/coc-war';
import { PlayerProfile, PlayerTotals } from '../tournament/stats';

/**
 * La carte d'un joueur (à partager) : ses perfs en FW, calculées depuis sa
 * fiche. Les FW classiques d'abord ; un joueur qui n'a fait que la Spade Cup
 * a la carte de ses guerres de tournoi.
 */
export interface PlayerCard {
  readonly tag: string;
  readonly name: string;
  /** Son HDV à la dernière guerre. */
  readonly townHall: number | null;
  /** « FW » ou « Spade Cup » : d'où viennent les chiffres. */
  readonly source: 'FW' | 'Spade Cup';
  readonly wars: number;
  readonly attacks: number;
  readonly stars: number;
  readonly starsPerAttack: number;
  readonly triples: number;
  /** Part des attaques à 3 étoiles (0 à 1). */
  readonly tripleRate: number;
  readonly destruction: number;
  /** Temps moyen d'une attaque, en secondes (`null` si inconnu). */
  readonly avgDurationSec: number | null;
  readonly wins: number;
  /** Part des guerres gagnées par son équipe (0 à 1), sur les guerres décidées. */
  readonly winRate: number | null;
  /** Ses dernières guerres, de la plus ancienne à la plus récente : étoiles de chacune. */
  readonly form: readonly number[];
  /** Le plus de guerres d'affilée avec un triple. */
  readonly bestTripleStreak: number;
  /** Sa place au classement (étoiles par attaque), si on le connaît. */
  readonly rank: { readonly position: number; readonly total: number } | null;
}

/** Les 10 dernières guerres sur la carte. */
const FORM_SIZE = 10;
/** Il faut 3 attaques pour figurer au classement de la carte. */
const RANK_MIN_ATTACKS = 3;

export function playerCard(
  profile: PlayerProfile,
  ranking: readonly PlayerTotals[] | null = null,
): PlayerCard {
  const fw = profile.fw;
  const totals = fw?.totals ?? profile.totals;
  // Les guerres où il a attaqué, de la plus récente à la plus ancienne.
  const wars: { line: PlayerLine; won: boolean | null }[] = (fw ? fw.history : profile.history).map(
    (h) => ({ line: h.line, won: h.won }),
  );
  const played = wars.filter((w) => w.line.attacks > 0);

  const decided = played.filter((w) => w.won !== null);
  const wins = decided.filter((w) => w.won).length;
  const duration = played.reduce((sum, w) => sum + w.line.durationSec, 0);

  // Série de triples, dans l'ordre chronologique.
  let best = 0;
  let run = 0;
  for (const w of [...played].reverse()) {
    run = w.line.triples > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }

  return {
    tag: totals.tag,
    name: totals.name,
    townHall: wars[0]?.line.townHall ?? null,
    source: fw ? 'FW' : 'Spade Cup',
    wars: totals.wars,
    attacks: totals.attacks,
    stars: totals.stars,
    starsPerAttack: totals.attacks ? totals.stars / totals.attacks : 0,
    triples: totals.triples,
    tripleRate: totals.attacks ? totals.triples / totals.attacks : 0,
    destruction: totals.destruction,
    avgDurationSec: totals.attacks && duration ? Math.round(duration / totals.attacks) : null,
    wins,
    winRate: decided.length ? wins / decided.length : null,
    form: played
      .slice(0, FORM_SIZE)
      .map((w) => w.line.stars)
      .reverse(),
    bestTripleStreak: best,
    rank: rankOf(totals.tag, ranking),
  };
}

/** Sa place au classement par étoiles par attaque (3 attaques au moins). */
function rankOf(tag: string, ranking: readonly PlayerTotals[] | null): PlayerCard['rank'] {
  if (!ranking) return null;
  const ranked = ranking
    .filter((p) => p.attacks >= RANK_MIN_ATTACKS)
    .sort((a, b) => b.stars / b.attacks - a.stars / a.attacks || b.stars - a.stars);
  const position = ranked.findIndex((p) => p.tag === tag);
  return position < 0 ? null : { position: position + 1, total: ranked.length };
}
