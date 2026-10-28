/**
 * Une soirée FW (« FW #41 ») : ses infos, telles qu'affichées sur la fiche,
 * et les règles des équipes. Partagé par le serveur (bot) et le site (fiche).
 *
 * TypeScript pur, sans Angular : le Worker l'importe aussi.
 */

/** Équipes tirées au hasard à H − 10, ou chacun choisit la sienne. */
export type TeamMode = 'random' | 'libre';
/** 'violet' = FW-Team 1, 'vert' = FW-Team 2 (couleurs du site). */
export type Team = 'violet' | 'vert';

/** Les infos de la fiche, modifiables par les modos. */
export interface SessionDetails {
  readonly format: string;
  readonly preparation: string;
  readonly war: string;
  readonly attacks: string;
  readonly rounds: string;
  readonly accepted: string;
}

/** Ce qui se fait d'habitude : il suffit souvent de donner la date et l'heure. */
export const DEFAULT_DETAILS: SessionDetails = {
  format: 'HDV 18 mode e-sport',
  preparation: '5 min de préparation',
  war: '15 min de guerre',
  attacks: '1 attaque par joueur',
  rounds: 'Plusieurs rounds',
  accepted: 'HDV 17 et HDV 16 acceptés',
};

/** Fin des inscriptions : 15 minutes avant le début. */
export const CLOSE_BEFORE_MS = 15 * 60 * 1000;
/** Équipes faites et affichées : 10 minutes avant le début. */
export const TEAMS_BEFORE_MS = 10 * 60 * 1000;

/** « 20h45 » : l'heure de Paris à cet instant. */
export function parisClock(ms: number): string {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('hour')}h${get('minute')}`;
}

/** La fin des inscriptions et l'heure des équipes, en clair. */
export function sessionClocks(startsAt: number): { close: string; teams: string; start: string } {
  return {
    close: parisClock(startsAt - CLOSE_BEFORE_MS),
    teams: parisClock(startsAt - TEAMS_BEFORE_MS),
    start: parisClock(startsAt),
  };
}

/** Paramètres de l'adresse de la fiche (/affiche/soiree). */
export interface SessionPosterInput {
  readonly number: number;
  /** « 28/10 », « 21H00 ». */
  readonly date: string;
  readonly time: string;
  readonly mode: TeamMode;
  readonly details: SessionDetails;
}

export function sessionPosterQuery(input: SessionPosterInput): string {
  const { details: d } = input;
  return new URLSearchParams({
    n: String(input.number),
    j: input.date,
    h: input.time,
    m: input.mode,
    f: d.format,
    p: d.preparation,
    g: d.war,
    a: d.attacks,
    r: d.rounds,
    t: d.accepted,
  }).toString();
}

/**
 * Les équipes, tirées au hasard : on mélange, puis on distribue une fois à
 * gauche, une fois à droite. Nombre impair : la FW-Team 1 a un joueur de plus
 * (les modos comblent les trous). `random` : un nombre dans [0, 1[.
 */
export function drawTeams<T>(players: readonly T[], random: () => number): Map<T, Team> {
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return new Map(shuffled.map((p, i) => [p, i % 2 === 0 ? 'violet' : 'vert']));
}

/** Quelqu'un arrive en cours de route : dans l'équipe qui a le moins de monde. */
export function smallerTeam(violet: number, vert: number, random: () => number): Team {
  if (violet !== vert) return violet < vert ? 'violet' : 'vert';
  return random() < 0.5 ? 'violet' : 'vert';
}

export const TEAM_LABEL: Record<Team, string> = {
  violet: 'FW-Team 1',
  vert: 'FW-Team 2',
};
