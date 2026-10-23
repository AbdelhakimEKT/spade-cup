import { TOURNAMENT_RULES, ClanRef, Side, SideScore } from './models';

/**
 * Lecture d'une guerre amicale telle que l'API officielle de Clash of Clans
 * la renvoie (GET /clans/{tag}/currentwar), pour en tirer le score du match
 * et la ligne de chaque joueur.
 *
 * Pur et sans réseau : le serveur fait l'appel, cette fonction ne fait que
 * lire la réponse. On la teste donc avec de simples objets.
 */

// ------------------------------------------------- forme de la réponse du jeu
// Seulement les champs utilisés : le reste de la réponse est ignoré.

export interface CocWarAttack {
  readonly attackerTag: string;
  readonly defenderTag: string;
  readonly stars: number;
  readonly destructionPercentage: number;
  /** Durée de l'attaque, en secondes. */
  readonly duration: number;
}

export interface CocWarMember {
  readonly tag: string;
  readonly name: string;
  readonly townhallLevel: number;
  readonly mapPosition: number;
  /** Absent si le joueur n'a pas attaqué. */
  readonly attacks?: readonly CocWarAttack[];
}

export interface CocWarClan {
  readonly tag: string;
  readonly name: string;
  readonly badgeUrls?: { readonly small?: string; readonly medium?: string };
  readonly stars: number;
  readonly destructionPercentage: number;
  readonly members?: readonly CocWarMember[];
}

export interface CocWar {
  readonly state: 'notInWar' | 'preparation' | 'inWar' | 'warEnded';
  readonly teamSize?: number;
  /** Lancement de la guerre, au format du jeu : « 20261020T191758.000Z ». */
  readonly preparationStartTime?: string;
  readonly startTime?: string;
  readonly clan?: CocWarClan;
  readonly opponent?: CocWarClan;
}

// ------------------------------------------------- ce qu'on en tire

/** Ce qu'un joueur a fait pendant un match. */
export interface PlayerLine {
  readonly tag: string;
  readonly name: string;
  readonly side: Side;
  readonly townHall: number;
  /** Place sur la carte de guerre (1 = en haut). */
  readonly mapPosition: number;
  readonly attacks: number;
  readonly stars: number;
  /** Destruction moyenne par attaque (0 s'il n'a pas attaqué). */
  readonly destruction: number;
  /** Attaques à 3 étoiles. */
  readonly triples: number;
  readonly durationSec: number;
}

export type WarReading =
  | {
      readonly ok: true;
      readonly score: { readonly home: SideScore; readonly away: SideScore };
      readonly players: readonly PlayerLine[];
      /** Écarts au règlement à signaler aux arbitres (le résultat est quand même lu). */
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly reason: string };

const STATE_LABEL: Record<CocWar['state'], string> = {
  notInWar: 'aucune guerre',
  preparation: 'jour de préparation',
  inWar: 'guerre en cours',
  warEnded: 'guerre terminée',
};

/**
 * Lit la guerre d'un match entre `home` et `away`. Peu importe quel clan a
 * servi à interroger le jeu : chaque camp est retrouvé par son tag.
 */
export function readFriendlyWar(war: CocWar, home: ClanRef, away: ClanRef): WarReading {
  if (war.state === 'notInWar' || !war.clan || !war.opponent) {
    return { ok: false, reason: `Le jeu n'indique aucune guerre récente pour ${home.name}.` };
  }

  const sides = new Map<string, CocWarClan>([
    [war.clan.tag, war.clan],
    [war.opponent.tag, war.opponent],
  ]);
  const homeWar = sides.get(home.tag);
  const awayWar = sides.get(away.tag);
  if (!homeWar || !awayWar) {
    return {
      ok: false,
      reason: `La dernière guerre trouvée oppose ${war.clan.name} à ${war.opponent.name}, pas ${home.name} à ${away.name}.`,
    };
  }

  if (war.state !== 'warEnded') {
    return {
      ok: false,
      reason: `La guerre n'est pas finie (${STATE_LABEL[war.state]}). Relance la commande à la fin.`,
    };
  }

  const warnings: string[] = [];
  if (war.teamSize !== undefined && war.teamSize !== TOURNAMENT_RULES.teamSize) {
    warnings.push(
      `Guerre en ${war.teamSize} contre ${war.teamSize} (le règlement impose ${TOURNAMENT_RULES.teamSize} contre ${TOURNAMENT_RULES.teamSize}).`,
    );
  }

  const players = [
    ...playerLines(homeWar, 'home', warnings),
    ...playerLines(awayWar, 'away', warnings),
  ];

  return {
    ok: true,
    score: { home: sideScore(homeWar), away: sideScore(awayWar) },
    players,
    warnings,
  };
}

function sideScore(clan: CocWarClan): SideScore {
  const totalDurationSec = (clan.members ?? [])
    .flatMap((m) => m.attacks ?? [])
    .reduce((sum, a) => sum + a.duration, 0);
  return {
    stars: clan.stars,
    destruction: round1(clan.destructionPercentage),
    totalDurationSec,
  };
}

function playerLines(clan: CocWarClan, side: Side, warnings: string[]): PlayerLine[] {
  return [...(clan.members ?? [])]
    .sort((a, b) => a.mapPosition - b.mapPosition)
    .map((m) => {
      if (m.townhallLevel !== TOURNAMENT_RULES.townHallLevel) {
        warnings.push(`${m.name} (${clan.name}) est HDV ${m.townhallLevel}.`);
      }
      const attacks = m.attacks ?? [];
      const destructionSum = attacks.reduce((sum, a) => sum + a.destructionPercentage, 0);
      return {
        tag: m.tag,
        name: m.name,
        side,
        townHall: m.townhallLevel,
        mapPosition: m.mapPosition,
        attacks: attacks.length,
        stars: attacks.reduce((sum, a) => sum + a.stars, 0),
        destruction: attacks.length ? round1(destructionSum / attacks.length) : 0,
        triples: attacks.filter((a) => a.stars === 3).length,
        durationSec: attacks.reduce((sum, a) => sum + a.duration, 0),
      };
    });
}

/** « 20261020T191758.000Z » (format du jeu) → millisecondes. `NaN` si illisible. */
export function cocTime(value: string | undefined): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(value ?? '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
