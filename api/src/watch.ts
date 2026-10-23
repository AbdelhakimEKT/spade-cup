import {
  championOf,
  recordResult,
  roundLabel,
  startMatch,
} from '../../src/app/core/tournament/bracket';
import {
  cocTime,
  readFriendlyWar,
  type CocWar,
  type WarReading,
} from '../../src/app/core/tournament/coc-war';
import type { BracketMatch } from '../../src/app/core/tournament/models';
import { decideWinner } from '../../src/app/core/tournament/war-result';
import type { CocClient } from './coc';
import { bracketCaption, resultMessage, versus, warningsText, type Reply } from './discord/bot';
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
  readonly captureBracket: (slug: string) => Promise<Uint8Array>;
  /** Poste dans le salon des résultats ; `null` si aucun webhook n'est configuré. */
  readonly announce: ((reply: Reply) => Promise<void>) | null;
}

/** Ce qu'a fait un passage : identifiants des matchs concernés (pour les journaux et les tests). */
export interface WatchReport {
  checked: number;
  readonly started: string[];
  readonly finished: string[];
  readonly ties: string[];
}

/**
 * Plafond de matchs regardés par passage. Chacun coûte jusqu'à 2 appels au
 * jeu, et une exécution gratuite n'a droit qu'à 50 requêtes sortantes. Avec
 * 32 clans, le premier tour a 16 matchs : ceux en trop passent 5 minutes plus
 * tard (on commence par ceux qui attendent depuis le plus longtemps).
 */
const MAX_MATCHES = 15;

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

  const messages: Reply[] = [];
  for (const match of candidates) {
    report.checked++;
    const assessment = await assess(deps.coc, match, readyAt.get(match.id)!);

    if (assessment.kind === 'started' && match.status === 'pending') {
      bracket = startMatch(bracket, match.id);
      await saveBracket(deps.db, id, bracket);
      report.started.push(match.id);
      messages.push({
        content:
          `⚔️ **${versus(match)}** a commencé ` +
          `(${roundLabel(match.round, bracket.roundCount).toLowerCase()}). Bonne guerre !`,
      });
    }

    if (assessment.kind === 'ended') {
      const { score, players, warnings } = assessment.reading;
      const winner = decideWinner(score.home, score.away);
      if (!winner) {
        // Rien n'est enregistré : l'alerte n'est envoyée qu'une fois par guerre.
        if (await markAnnounced(deps.db, id, match.id, 'tie', assessment.warKey)) {
          report.ties.push(match.id);
          messages.push({
            content:
              `⚖️ Égalité parfaite entre **${match.home!.name}** et **${match.away!.name}** ` +
              '(étoiles, pourcentage ET temps) : aux arbitres de trancher avec `/arbitre vainqueur`.',
          });
        }
        continue;
      }
      bracket = recordResult(bracket, match.id, winner, score);
      await saveBracket(deps.db, id, bracket, {
        status: championOf(bracket) ? 'finished' : undefined,
        result: { matchId: match.id, source: 'game', players },
        finished: { matchId: match.id, at: assessment.endedAt },
      });
      report.finished.push(match.id);
      messages.push({
        content:
          resultMessage(deps.siteUrl, tournament, bracket, match.id) + warningsText(warnings),
      });
    }
  }

  if (deps.announce) {
    // 1. Le texte D'ABORD : si l'image échoue (ou si l'exécution est coupée
    //    pendant la capture), les résultats sont quand même annoncés. Au
    //    passage suivant, ces matchs sont joués : ce serait trop tard.
    //    Les annonces sont regroupées : Discord limite chaque webhook à
    //    5 messages toutes les 2 secondes, et le salon reste lisible.
    for (const content of pack(messages.map((m) => m.content))) {
      await deps.announce({ content });
    }
    // 2. Puis UNE image de l'arbre, à jour de tous les résultats du passage.
    if (report.finished.length) {
      try {
        const png = await deps.captureBracket(tournament.slug);
        await deps.announce({
          content: bracketCaption(tournament.name, bracket),
          files: [{ name: 'arbre.png', data: png }],
        });
      } catch (error) {
        console.error('Image de l’arbre impossible', error);
      }
    }
  }
  return report;
}

/** Regroupe des annonces en messages de 2 000 caractères au plus (limite de Discord). */
export function pack(contents: readonly string[], limit = 2000): string[] {
  const packed: string[] = [];
  for (const content of contents) {
    const last = packed.at(-1);
    if (last !== undefined && last.length + 2 + content.length <= limit) {
      packed[packed.length - 1] = `${last}\n\n${content}`;
    } else {
      packed.push(content.slice(0, limit));
    }
  }
  return packed;
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
