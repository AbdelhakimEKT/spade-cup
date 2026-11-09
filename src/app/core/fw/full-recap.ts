/**
 * Bilan COMPLET d'une soirée FW : chaque FW (score), et pour chaque équipe
 * chaque joueur avec chacune de ses attaques (étoiles, destruction, cible,
 * temps) et ses totaux. Le bot en fait une image (/fw bilan-complet), photo
 * de la page /affiche/bilan-complet.
 *
 * TypeScript pur, sans Angular : le Worker l'importe aussi.
 */

/** FW-Team 1 (violet, à gauche) ou FW-Team 2 (vert, à droite). */
export type Team = 1 | 2;

/** Une attaque d'un joueur. */
export interface FullAttack {
  readonly stars: number;
  /** Destruction, en %. */
  readonly destruction: number;
  /** Position de la base attaquée (n° 1 = la plus forte), ou `null` si inconnue. */
  readonly target: number | null;
  /** Durée, en secondes. */
  readonly seconds: number;
}

/** Un joueur sur la soirée. */
export interface FullPlayer {
  readonly name: string;
  readonly th: number | null;
  /**
   * Une case par FW de la soirée, dans l'ordre : ses attaques ([] = aligné
   * mais n'a pas attaqué), ou `null` s'il ne jouait pas cette FW.
   */
  readonly wars: readonly (readonly FullAttack[] | null)[];
}

/** Une FW de la soirée, vue de la FW-Team 1 puis de la FW-Team 2. */
export interface FullWar {
  readonly stars: readonly [number, number];
  readonly destruction: readonly [number, number];
  /** `null` : égalité parfaite. */
  readonly winner: Team | null;
}

export interface FullRecap {
  /** « FW #44 ». */
  readonly number: number;
  /** « vendredi 06/11 ». */
  readonly day: string;
  /** Joueurs par équipe (3 pour du 3 contre 3). */
  readonly size: number;
  readonly wars: readonly FullWar[];
  /** Les joueurs de la FW-Team 1, puis ceux de la FW-Team 2. */
  readonly teams: readonly [readonly FullPlayer[], readonly FullPlayer[]];
}

// ------------------------------------------------------------ calculs

/** Largeur de l'image : 1080 px jusqu'à 3 FW, une colonne de 120 px de plus par FW ensuite. */
export function fullRecapWidth(wars: number): number {
  return 1080 + Math.max(0, wars - 3) * 120;
}

/** Les totaux d'un joueur sur la soirée. */
export interface PlayerTotals {
  readonly attacks: number;
  readonly stars: number;
  readonly triples: number;
  /** Étoiles par attaque (0 sans attaque). */
  readonly starsPerAttack: number;
  /** Destruction moyenne par attaque, en %. */
  readonly destruction: number;
  /** Temps moyen par attaque, en secondes. */
  readonly seconds: number;
}

export function playerTotals(p: FullPlayer): PlayerTotals {
  const attacks = p.wars.flatMap((w) => w ?? []);
  const n = attacks.length;
  const sum = (f: (a: FullAttack) => number) => attacks.reduce((s, a) => s + f(a), 0);
  return {
    attacks: n,
    stars: sum((a) => a.stars),
    triples: attacks.filter((a) => a.stars === 3).length,
    starsPerAttack: n ? sum((a) => a.stars) / n : 0,
    destruction: n ? sum((a) => a.destruction) / n : 0,
    seconds: n ? sum((a) => a.seconds) / n : 0,
  };
}

/**
 * Le classement dans une équipe, comme celui de la soirée : étoiles par
 * attaque, puis destruction moyenne, puis le plus rapide. Ceux qui n'ont
 * jamais attaqué passent en dernier.
 */
export function sortPlayers(players: readonly FullPlayer[]): FullPlayer[] {
  const t = new Map(players.map((p) => [p, playerTotals(p)]));
  return [...players].sort((a, b) => {
    const x = t.get(a)!;
    const y = t.get(b)!;
    return (
      Number(y.attacks > 0) - Number(x.attacks > 0) ||
      y.starsPerAttack - x.starsPerAttack ||
      y.destruction - x.destruction ||
      x.seconds - y.seconds ||
      a.name.localeCompare(b.name)
    );
  });
}

/** Le résultat de la soirée : FW gagnées, étoiles au total, vainqueur. */
export interface Outcome {
  readonly wins: readonly [number, number];
  readonly stars: readonly [number, number];
  /** Le plus de FW gagnées, puis le plus d'étoiles ; `null` : égalité. */
  readonly winner: Team | null;
}

export function outcome(r: FullRecap): Outcome {
  const wins: [number, number] = [0, 0];
  const stars: [number, number] = [0, 0];
  for (const w of r.wars) {
    if (w.winner) wins[w.winner - 1]++;
    stars[0] += w.stars[0];
    stars[1] += w.stars[1];
  }
  const winner: Team | null =
    wins[0] !== wins[1] ? (wins[0] > wins[1] ? 1 : 2) : stars[0] !== stars[1] ? (stars[0] > stars[1] ? 1 : 2) : null;
  return { wins, stars, winner };
}

// ------------------------------------------------------------ depuis la base

/** Une FW telle qu'enregistrée (table friendly_wars). */
export interface WarRow {
  readonly id: number;
  readonly homeTag: string;
  readonly homeStars: number;
  readonly homeDestruction: number;
  readonly awayStars: number;
  readonly awayDestruction: number;
  readonly winner: 'home' | 'away' | null;
  readonly teamSize: number | null;
}

/** Un joueur dans une FW (table fw_players). */
export interface PlayerRow {
  readonly warId: number;
  readonly clanTag: string;
  readonly tag: string;
  readonly name: string;
  readonly townHall: number | null;
  readonly attacks: number;
  readonly stars: number;
  readonly destructionSum: number;
  readonly duration: number;
  /** Le détail de ses attaques (JSON de fw_players.targets), absent pour les vieilles FW. */
  readonly targets: readonly {
    readonly position?: number;
    readonly stars?: number;
    readonly destruction?: number;
    readonly durationSec?: number;
  }[];
}

/**
 * Assemble le bilan depuis la base. `wars` dans l'ordre de la soirée (la
 * première FW d'abord) ; `team1Tag` = le clan de la FW-Team 1. Un joueur
 * garde le nom et l'HDV de sa dernière FW.
 */
export function buildFullRecap(
  head: { readonly number: number; readonly day: string },
  wars: readonly WarRow[],
  players: readonly PlayerRow[],
  team1Tag: string,
): FullRecap {
  const isTeam1 = (tag: string) => tag.toUpperCase() === team1Tag.toUpperCase();
  const fullWars: FullWar[] = wars.map((w) => {
    const homeIs1 = isTeam1(w.homeTag);
    const side = (home: number, away: number) => (homeIs1 ? [home, away] : [away, home]) as [number, number];
    const winnerSide = w.winner === null ? null : (w.winner === 'home') === homeIs1 ? 1 : 2;
    return {
      stars: side(w.homeStars, w.awayStars),
      destruction: side(w.homeDestruction, w.awayDestruction),
      winner: winnerSide as Team | null,
    };
  });

  const index = new Map(wars.map((w, i) => [w.id, i]));
  const byTag = new Map<string, { team: Team; name: string; th: number | null; last: number; wars: (FullAttack[] | null)[] }>();
  for (const row of players) {
    const i = index.get(row.warId);
    if (i === undefined) continue;
    const p = byTag.get(row.tag) ?? {
      team: (isTeam1(row.clanTag) ? 1 : 2) as Team,
      name: row.name,
      th: row.townHall,
      last: -1,
      wars: wars.map(() => null),
    };
    if (i > p.last) {
      p.last = i;
      p.name = row.name;
      p.th = row.townHall;
      p.team = isTeam1(row.clanTag) ? 1 : 2;
    }
    p.wars[i] = attacksOf(row);
    byTag.set(row.tag, p);
  }
  const team = (t: Team) =>
    sortPlayers([...byTag.values()].filter((p) => p.team === t).map(({ name, th, wars: w }) => ({ name, th, wars: w })));
  return {
    number: head.number,
    day: head.day,
    size: Math.max(0, ...wars.map((w) => w.teamSize ?? 0)),
    wars: fullWars,
    teams: [team(1), team(2)],
  };
}

/** Ses attaques dans une FW : le détail si on l'a, sinon une attaque « moyenne ». */
function attacksOf(row: PlayerRow): FullAttack[] {
  if (row.attacks <= 0) return [];
  if (row.targets.length === row.attacks) {
    return row.targets.map((t) => ({
      stars: t.stars ?? 0,
      destruction: t.destruction ?? 0,
      target: t.position ?? null,
      seconds: t.durationSec ?? 0,
    }));
  }
  // Vieille FW sans le détail : on répartit les totaux.
  return Array.from({ length: row.attacks }, (_, k) => ({
    stars: k === 0 ? row.stars : 0,
    destruction: row.destructionSum / row.attacks,
    target: null,
    seconds: row.duration / row.attacks,
  }));
}

// ------------------------------------------------------------ dans l'adresse

/**
 * L'adresse de la page : tout le bilan en JSON compact dans `b`.
 * Attaque = [étoiles, destruction, cible, secondes] ; FW non jouée = 0.
 */
export function fullRecapQuery(r: FullRecap): string {
  const attack = (a: FullAttack) => [a.stars, Math.round(a.destruction), a.target ?? 0, Math.round(a.seconds)];
  const player = (p: FullPlayer) => [p.name, p.th ?? 0, p.wars.map((w) => (w ? w.map(attack) : 0))];
  return new URLSearchParams({
    n: String(r.number),
    d: r.day,
    s: String(r.size),
    b: JSON.stringify({
      w: r.wars.map((w) => [w.stars[0], w.stars[1], w.destruction[0], w.destruction[1], w.winner ?? 0]),
      t: [r.teams[0].map(player), r.teams[1].map(player)],
    }),
  }).toString();
}

/** Le bilan lu dans l'adresse ; illisible → `null` (la page affiche un message). */
export function parseFullRecap(n: string, d: string, s: string, b: string): FullRecap | null {
  try {
    const raw = JSON.parse(b) as { w?: unknown; t?: unknown };
    if (!Array.isArray(raw.w) || !Array.isArray(raw.t) || raw.t.length !== 2) return null;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const wars: FullWar[] = raw.w.map((row) => {
      const [s1, s2, d1, d2, win] = row as unknown[];
      const w = num(win);
      return {
        stars: [num(s1), num(s2)],
        destruction: [num(d1), num(d2)],
        winner: w === 1 || w === 2 ? w : null,
      };
    });
    const player = (row: unknown): FullPlayer => {
      const [name, th, cells] = row as unknown[];
      return {
        name: String(name ?? '?'),
        th: num(th) || null,
        wars: wars.map((_, i) => {
          const cell = Array.isArray(cells) ? cells[i] : 0;
          if (!Array.isArray(cell)) return null;
          return cell.map((a) => {
            const [st, de, ta, se] = a as unknown[];
            return { stars: num(st), destruction: num(de), target: num(ta) || null, seconds: num(se) };
          });
        }),
      };
    };
    const [t1, t2] = raw.t as unknown[][];
    return {
      number: Number(n) || 0,
      day: d,
      size: Number(s) || 0,
      wars,
      teams: [(t1 ?? []).map(player), (t2 ?? []).map(player)],
    };
  } catch {
    return null;
  }
}
