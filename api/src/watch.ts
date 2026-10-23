import { championOf, recordResult, startMatch } from '../../src/app/core/tournament/bracket';
import {
  cocTime,
  readFriendlyWar,
  type CocWar,
  type WarReading,
} from '../../src/app/core/tournament/coc-war';
import type { BracketMatch } from '../../src/app/core/tournament/models';
import { decideWinner } from '../../src/app/core/tournament/war-result';
import type { CocClient } from './coc';
import { announce, type Announcer } from './announcements';
import { getCurrentTournament, markAnnounced, saveBracket } from './repository';

/**
 * L'arbitre automatique. Lancé par Cloudflare toutes les 5 minutes (voir
 * `scheduled` dans index.ts), il regarde chaque match jouable du tournoi en
 * cours et demande au jeu la dernière guerre des deux clans :
 *
 *  - guerre lancée entre eux  → le match passe « en cours », annonce ⚔️ ;
 *  - guerre terminée          → résultat enregistré, vainqueur qualifié,
 *                               annonce du score + image de l'arbre à jour ;
 *  - égalité parfaite         → rien d'enregistré, alerte aux arbitres (une fois).
 *
 * Les commandes d'arbitre restent là pour tout le reste (forfait, litige,
 * résultat raté parce que les clans ont relancé une guerre trop vite).
 */

// ------------------------------------------------------------ décision (pure)

export type Assessment =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'started'; readonly warKey: string }
  | {
      readonly kind: 'ended';
      readonly warKey: string;
      /** Fin de la guerre selon le jeu (ms), `NaN` si inconnue. */
      readonly endedAt: number;
      readonly reading: Extract<WarReading, { ok: true }>;
    };

/**
 * Que dit cette guerre de ce match ? Pure : testable avec de simples objets.
 *
 * Une guerre ne compte que si elle oppose EXACTEMENT les deux clans du match,
 * et si elle a été lancée APRÈS que le match est devenu jouable : sinon une
 * vieille guerre amicale entre les deux mêmes clans serait validée au tirage.
 */
export function assessWar(war: CocWar, match: BracketMatch, readySince: number): Assessment {
  const { home, away } = match;
  if (!home || !away || !war.clan || !war.opponent || war.state === 'notInWar') {
    return { kind: 'nothing' };
  }
  const warTags = [war.clan.tag, war.opponent.tag].sort().join();
  if (warTags !== [home.tag, away.tag].sort().join()) return { kind: 'nothing' };

  const warKey = war.preparationStartTime ?? war.startTime ?? '';
  const launched = cocTime(warKey);
  if (Number.isNaN(launched) || launched < readySince) return { kind: 'nothing' };

  if (war.state !== 'warEnded') return { kind: 'started', warKey };
  const reading = readFriendlyWar(war, home, away);
  return reading.ok
    ? { kind: 'ended', warKey, endedAt: cocTime(war.endTime), reading }
    : { kind: 'nothing' };
}

// ------------------------------------------------------------ surveillance

export interface WatchDeps {
  readonly db: D1Database;
  readonly coc: CocClient;
  readonly siteUrl: string;
  /** Les annonces dans les salons ; `null` : résultats enregistrés sans rien poster. */
  readonly announcer: Announcer | null;
}

/** Ce qu'a fait un passage : identifiants des matchs concernés (pour les journaux et les tests). */
export interface WatchReport {
  checked: number;
  readonly started: string[];
  readonly finished: string[];
  readonly ties: string[];
}

/**
 * Plafond de matchs regardés par passage. Une exécution gratuite n'a droit
 * qu'à 50 requêtes sortantes. Pire cas pour 12 matchs finis d'un coup :
 * 24 appels au jeu (journaux privés), 1 message de victoires, 12 récaps,
 * 1 arbre, 1 navigateur, + 2 appels pour les FW classiques = 41. Avec 32
 * clans, les matchs en trop passent 5 minutes plus tard (les plus anciens
 * d'abord).
 */
const MAX_MATCHES = 12;

export async function runWatch(deps: WatchDeps): Promise<WatchReport> {
  const report: WatchReport = { checked: 0, started: [], finished: [], ties: [] };
  const current = await getCurrentTournament(deps.db);
  if (!current || current.tournament.status !== 'running' || !current.tournament.bracket) {
    return report;
  }
  const { id, tournament, readyAt } = current;
  let bracket = current.tournament.bracket;

  const candidates = bracket.matches
    .filter(
      (m) =>
        m.home && m.away && (m.status === 'pending' || m.status === 'live') && readyAt.has(m.id),
    )
    .sort((a, b) => readyAt.get(a.id)! - readyAt.get(b.id)!)
    .slice(0, MAX_MATCHES);

  const started: BracketMatch[] = [];
  const finished: { matchId: string }[] = [];
  const ties: BracketMatch[] = [];

  for (const match of candidates) {
    report.checked++;
    const assessment = await assess(deps.coc, match, readyAt.get(match.id)!);

    if (assessment.kind === 'started' && match.status === 'pending') {
      bracket = startMatch(bracket, match.id);
      await saveBracket(deps.db, id, bracket);
      started.push(match);
    }

    if (assessment.kind === 'ended') {
      const { score, players } = assessment.reading;
      const winner = decideWinner(score.home, score.away);
      if (!winner) {
        // Rien n'est enregistré : l'alerte n'est envoyée qu'une fois par guerre.
        if (await markAnnounced(deps.db, id, match.id, 'tie', assessment.warKey)) ties.push(match);
        continue;
      }
      bracket = recordResult(bracket, match.id, winner, score);
      await saveBracket(deps.db, id, bracket, {
        status: championOf(bracket) ? 'finished' : undefined,
        result: { matchId: match.id, source: 'game', players },
        finished: { matchId: match.id, at: assessment.endedAt },
      });
      finished.push({ matchId: match.id });
    }
  }

  report.started.push(...started.map((m) => m.id));
  report.finished.push(...finished.map((f) => f.matchId));
  report.ties.push(...ties.map((m) => m.id));
  if (deps.announcer) {
    await announce(deps.announcer, tournament, bracket, { started, finished, ties });
  }
  return report;
}

/**
 * Demande la guerre au clan « domicile », puis au clan « extérieur » si la
 * première réponse ne dit rien (journal privé, guerre plus récente…).
 */
async function assess(
  coc: CocClient,
  match: BracketMatch,
  readySince: number,
): Promise<Assessment> {
  for (const clan of [match.home!, match.away!]) {
    const war = await coc.currentWar(clan.tag);
    if (!war.ok) continue;
    const assessment = assessWar(war.value, match, readySince);
    if (assessment.kind !== 'nothing') return assessment;
  }
  return { kind: 'nothing' };
}
