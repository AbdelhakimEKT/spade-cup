import { Bracket, BracketMatch, ClanRef, Side, SideScore } from './models';

/**
 * Arbre à élimination directe.
 *
 * Toutes les fonctions sont « pures » : elles ne modifient jamais l'arbre
 * reçu, elles en renvoient un nouveau. C'est ce qui permet de les tester
 * simplement, et c'est la règle d'or avec les signaux d'Angular (on remplace
 * une valeur, on ne la trafique pas en place).
 */

/** Plus petite puissance de 2 supérieure ou égale à n (5 clans → 8 places). */
export function bracketSize(clanCount: number): number {
  let size = 2;
  while (size < clanCount) size *= 2;
  return size;
}

/**
 * Ordre officiel des têtes de série dans un arbre (celui du tennis) :
 * pour 8 places → 1, 8, 4, 5, 2, 7, 3, 6.
 * Le n°1 ne peut croiser le n°2 qu'en finale, et quand il manque des clans,
 * les places vides (les « exempts ») tombent face aux premiers numéros :
 * jamais deux places vides l'une contre l'autre.
 */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, next - seed]);
  }
  return order;
}

/** Mélange de Fisher-Yates. `random` est injectable pour des tests reproductibles. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function matchId(round: number, index: number): string {
  return `R${round}-M${index}`;
}

/**
 * Tire l'arbre au sort à la clôture des inscriptions.
 * Les clans exemptés passent directement au deuxième tour.
 */
export function createBracket(
  clans: readonly ClanRef[],
  random: () => number = Math.random,
): Bracket {
  return bracketFromSeeds(shuffle(clans, random));
}

/**
 * Construit l'arbre à partir de clans DÉJÀ classés : le premier est la tête
 * de série n° 1, et ainsi de suite. Séparé du tirage pour que le serveur
 * puisse enregistrer l'ordre tiré, et la démo choisir ses affiches.
 */
export function bracketFromSeeds(clans: readonly ClanRef[]): Bracket {
  if (clans.length < 2) {
    throw new Error('Il faut au moins 2 clans pour créer un arbre.');
  }
  const tags = new Set(clans.map((c) => c.tag));
  if (tags.size !== clans.length) {
    throw new Error('Un même clan est inscrit deux fois.');
  }

  const size = bracketSize(clans.length);
  const roundCount = Math.log2(size);
  // Le clan à l'indice i est la tête de série n° i+1.
  const bySeed = (seed: number): ClanRef | null => clans[seed - 1] ?? null;
  const order = seedOrder(size);

  let matches: BracketMatch[] = [];
  for (let round = 1; round <= roundCount; round++) {
    const count = size / 2 ** round;
    for (let index = 1; index <= count; index++) {
      const home = round === 1 ? bySeed(order[(index - 1) * 2]) : null;
      const away = round === 1 ? bySeed(order[(index - 1) * 2 + 1]) : null;
      matches.push({
        id: matchId(round, index),
        round,
        index,
        home,
        away,
        status: 'pending',
        winner: null,
        score: null,
      });
    }
  }

  // Exempts du premier tour : le clan présent est qualifié d'office.
  for (const m of matches.filter((x) => x.round === 1)) {
    if (m.home && !m.away) matches = advance(matches, { ...m, status: 'bye', winner: 'home' });
    if (!m.home && m.away) matches = advance(matches, { ...m, status: 'bye', winner: 'away' });
  }

  return { size, roundCount, matches };
}

/**
 * Enregistre le résultat d'un match et qualifie le vainqueur pour le tour
 * suivant. Une correction reste possible tant que le match suivant n'est
 * pas joué : après, ce serait réécrire l'histoire du tournoi.
 */
export function recordResult(
  bracket: Bracket,
  id: string,
  winner: Side,
  score: { home: SideScore; away: SideScore } | null = null,
): Bracket {
  const match = bracket.matches.find((m) => m.id === id);
  if (!match) throw new Error(`Match inconnu : ${id}.`);
  if (!match.home || !match.away) throw new Error(`Le match ${id} n'a pas encore ses deux clans.`);

  if (!isResultEditable(bracket, match)) {
    const next = nextMatchOf(bracket.matches, match)!;
    throw new Error(`Le match suivant (${next.id}) est déjà joué : résultat de ${id} figé.`);
  }

  const updated: BracketMatch = { ...match, status: 'done', winner, score };
  return { ...bracket, matches: advance(bracket.matches, updated) };
}

/**
 * Peut-on (encore) saisir le résultat de ce match ? Il faut ses deux clans,
 * et, s'il est déjà joué, que le match suivant ne le soit pas.
 */
export function isResultEditable(bracket: Bracket, match: BracketMatch): boolean {
  if (!match.home || !match.away || match.status === 'bye') return false;
  return match.status !== 'done' || nextMatchOf(bracket.matches, match)?.status !== 'done';
}

/** Signale qu'une guerre amicale a commencé : le match passe « en cours ». */
export function startMatch(bracket: Bracket, id: string): Bracket {
  const match = bracket.matches.find((m) => m.id === id);
  if (!match) throw new Error(`Match inconnu : ${id}.`);
  if (!match.home || !match.away) throw new Error(`Le match ${id} n'a pas encore ses deux clans.`);
  if (match.status !== 'pending') throw new Error(`Le match ${id} n'est pas en attente.`);
  return {
    ...bracket,
    matches: bracket.matches.map((m) => (m.id === id ? { ...m, status: 'live' as const } : m)),
  };
}

/** Le clan vainqueur d'un match, ou `null` s'il n'est pas encore connu. */
export function winnerOf(match: BracketMatch): ClanRef | null {
  if (!match.winner) return null;
  return match.winner === 'home' ? match.home : match.away;
}

/**
 * Le tour en cours : celui du premier match en cours ou prêt à être joué.
 * Une fois tout joué, c'est le dernier tour (la finale).
 */
export function currentRound(bracket: Bracket): number {
  const ready = bracket.matches.find(
    (m) => (m.status === 'pending' || m.status === 'live') && m.home && m.away,
  );
  return ready?.round ?? bracket.roundCount;
}

/** Le match à mettre à la une : le premier qui se joue en ce moment. */
export function liveMatch(bracket: Bracket): BracketMatch | null {
  return bracket.matches.find((m) => m.status === 'live') ?? null;
}

/** Le champion, une fois la finale jouée. */
export function championOf(bracket: Bracket): ClanRef | null {
  const final = bracket.matches.find((m) => m.round === bracket.roundCount);
  return final ? winnerOf(final) : null;
}

/** Version courte pour les en-têtes de colonnes : « Huitièmes », « Quarts », « Demis ». */
export function roundShortLabel(round: number, roundCount: number): string {
  const labels = ['Finale', 'Demis', 'Quarts', 'Huitièmes', 'Seizièmes'];
  return labels[roundCount - round] ?? `Tour ${round}`;
}

/** « Finale », « Demi-finales », « Quarts de finale »… selon la profondeur. */
export function roundLabel(round: number, roundCount: number): string {
  const fromEnd = roundCount - round;
  const labels = [
    'Finale',
    'Demi-finales',
    'Quarts de finale',
    'Huitièmes de finale',
    'Seizièmes de finale',
  ];
  return labels[fromEnd] ?? `Tour ${round}`;
}

// ---------------------------------------------------------------------------

function nextMatchOf(matches: readonly BracketMatch[], match: BracketMatch): BracketMatch | null {
  return matches.find((m) => m.id === matchId(match.round + 1, Math.ceil(match.index / 2))) ?? null;
}

/**
 * Remplace `updated` dans la liste et place son vainqueur dans le match
 * suivant : les matchs impairs alimentent la place « home », les pairs « away ».
 */
function advance(matches: readonly BracketMatch[], updated: BracketMatch): BracketMatch[] {
  const next = nextMatchOf(matches, updated);
  const slot: Side = updated.index % 2 === 1 ? 'home' : 'away';
  return matches.map((m) => {
    if (m.id === updated.id) return updated;
    if (next && m.id === next.id) return { ...m, [slot]: winnerOf(updated) };
    return m;
  });
}
