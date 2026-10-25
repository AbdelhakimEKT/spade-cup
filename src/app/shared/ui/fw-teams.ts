import { SITE_CONFIG } from '../../core/site-config';
import { FriendlyWarSummary, FwSide } from '../../core/tournament/stats';

export type TeamColor = 'violet' | 'green';

/** La couleur d'un clan de FW (team 1 violet, team 2 vert), ou `null` pour un autre clan. */
export function fwTeamColor(tag: string): TeamColor | null {
  return (SITE_CONFIG.fwTeams.find((t) => t.tag === tag)?.color as TeamColor) ?? null;
}

/** Les couleurs de tous les clans de FW, par tag (pour le tableau de classement). */
export const FW_TEAM_COLORS: Readonly<Record<string, TeamColor>> = Object.fromEntries(
  SITE_CONFIG.fwTeams.map((t) => [t.tag, t.color as TeamColor]),
);

export interface FwRowSide extends FwSide {
  readonly color: TeamColor | null;
  readonly won: boolean;
}

/**
 * Une FW prête à afficher : team 1 TOUJOURS à gauche, team 2 à droite, quel
 * que soit l'ordre d'enregistrement. `winner` : le camp gagnant, ou `null`
 * pour une égalité parfaite.
 */
export function orderFw(war: FriendlyWarSummary): {
  readonly left: FwRowSide;
  readonly right: FwRowSide;
  readonly winner: FwRowSide | null;
} {
  const rank = (tag: string) => {
    const i = SITE_CONFIG.fwTeams.findIndex((t) => t.tag === tag);
    return i === -1 ? Infinity : i;
  };
  const side = (s: FwSide, which: 'home' | 'away'): FwRowSide => ({
    ...s,
    color: fwTeamColor(s.tag),
    won: war.winner === which,
  });
  const home = side(war.home, 'home');
  const away = side(war.away, 'away');
  const [left, right] = rank(home.tag) <= rank(away.tag) ? [home, away] : [away, home];
  return { left, right, winner: left.won ? left : right.won ? right : null };
}
