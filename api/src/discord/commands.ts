import { POSTER_FORMATS } from '../../../src/app/core/poster/poster';
import { OptionType } from './types';

/**
 * Les commandes du bot, telles qu'on les déclare à Discord
 * (scripts/register-commands.ts les envoie une fois pour toutes).
 *
 * QUI PEUT FAIRE QUOI : `/arbitre` est réservé par défaut aux membres qui
 * peuvent « Gérer le serveur ». C'est Discord qui applique cette règle ; les
 * admins peuvent ensuite l'ouvrir à un rôle « Arbitre » dans
 * Paramètres du serveur → Intégrations → Spade Cup.
 */

/** Permission Discord « Gérer le serveur » (bit 5). */
export const MANAGE_GUILD = 1n << 5n;
/** Permission Discord « Administrateur » (bit 3). */
export const ADMINISTRATOR = 1n << 3n;

const tag = (description: string) => ({
  name: 'tag',
  description,
  type: OptionType.String,
  required: true,
  min_length: 4,
  max_length: 15,
});

const match = {
  name: 'match',
  description: 'Le match (choisis dans la liste)',
  type: OptionType.String,
  required: true,
  autocomplete: true,
};

const sideScore = (n: 1 | 2) => [
  {
    name: `etoiles_${n}`,
    description: `Étoiles du ${n === 1 ? '1er' : '2e'} clan de l'affiche`,
    type: OptionType.Integer,
    required: true,
    min_value: 0,
    max_value: 15,
  },
  {
    name: `pourcent_${n}`,
    description: `Destruction du ${n === 1 ? '1er' : '2e'} clan, en % (ex. 87.5)`,
    type: OptionType.Number,
    required: true,
    min_value: 0,
    max_value: 100,
  },
  {
    name: `temps_${n}`,
    description: `Temps total d'attaque du ${n === 1 ? '1er' : '2e'} clan (ex. 14:05)`,
    type: OptionType.String,
    required: true,
  },
];

/** Uniquement sur un serveur, pas en message privé. */
const GUILD_ONLY = { contexts: [0] };

/** Nom et logo d'une équipe de l'affiche (1 = à gauche, en violet ; 2 = à droite, en vert). */
const posterTeam = (n: 1 | 2) => [
  {
    name: `equipe_${n}`,
    description: `Nom de l'équipe ${n === 1 ? 'de gauche' : 'de droite'}`,
    type: OptionType.String,
    required: true,
    max_length: 30,
  },
  {
    name: `logo_${n}`,
    description: `Logo de l'équipe ${n === 1 ? 'de gauche' : 'de droite'} (image PNG, JPG ou WebP)`,
    type: OptionType.Attachment,
    required: true,
  },
];

export const COMMANDS = [
  {
    name: 'inscription',
    description: 'Inscrire ton clan au tournoi en cours',
    options: [tag('Le tag du clan, par exemple #2JU0GRG98')],
    ...GUILD_ONLY,
  },
  {
    name: 'desinscription',
    description: 'Retirer un clan du tournoi (celui qui l’a inscrit, ou un admin)',
    options: [tag('Le tag du clan à retirer')],
    ...GUILD_ONLY,
  },
  {
    name: 'tournoi',
    description: 'Où en est le tournoi ?',
    ...GUILD_ONLY,
  },
  {
    name: 'arbitre',
    description: 'Commandes des arbitres',
    default_member_permissions: String(MANAGE_GUILD),
    ...GUILD_ONLY,
    options: [
      {
        name: 'creer',
        description: 'Créer un tournoi et ouvrir les inscriptions',
        type: OptionType.Subcommand,
        options: [
          {
            name: 'nom',
            description: 'Nom du tournoi',
            type: OptionType.String,
            required: true,
            max_length: 60,
          },
          {
            name: 'reglement',
            description: 'Règlement affiché sur le site (facultatif)',
            type: OptionType.String,
            max_length: 500,
          },
        ],
      },
      {
        name: 'tirage',
        description: 'Clore les inscriptions et tirer l’arbre au sort',
        type: OptionType.Subcommand,
      },
      {
        name: 'arbre',
        description: 'Publier l’image de l’arbre dans ce salon',
        type: OptionType.Subcommand,
        options: [
          {
            name: 'tournoi',
            description: 'Un autre tournoi que celui en cours (la démo, par exemple)',
            type: OptionType.String,
            autocomplete: true,
          },
        ],
      },
      {
        name: 'affiche',
        description: 'Générer l’affiche d’un match entre deux équipes (avec leurs logos)',
        type: OptionType.Subcommand,
        options: [
          ...posterTeam(1),
          ...posterTeam(2),
          {
            name: 'format',
            description: 'Taille des équipes',
            type: OptionType.String,
            required: true,
            choices: POSTER_FORMATS.map((f) => ({ name: f, value: f })),
          },
          {
            name: 'date',
            description: 'Jour du match, par exemple 26/10',
            type: OptionType.String,
            required: true,
            max_length: 8,
          },
          {
            name: 'heure',
            description: 'Heure de France, par exemple 22h00',
            type: OptionType.String,
            required: true,
            max_length: 8,
          },
          {
            name: 'regles',
            description: 'Les règles, par exemple « Esport — BO3 » ou « Légende 1 »',
            type: OptionType.String,
            required: true,
            max_length: 40,
          },
        ],
      },
      {
        name: 'annuler',
        description: 'Supprimer le tournoi en cours (test, erreur). Irréversible.',
        type: OptionType.Subcommand,
        options: [
          {
            name: 'nom',
            description: 'Retape le nom exact du tournoi pour confirmer',
            type: OptionType.String,
            required: true,
          },
        ],
      },
      {
        name: 'lancer',
        description: 'Signaler qu’une guerre amicale a commencé',
        type: OptionType.Subcommand,
        options: [match],
      },
      {
        name: 'resultat',
        description: 'Lire le résultat dans le jeu (guerre terminée)',
        type: OptionType.Subcommand,
        options: [match],
      },
      {
        name: 'score',
        description: 'Saisir le score à la main (si le jeu ne répond pas)',
        type: OptionType.Subcommand,
        options: [match, ...sideScore(1), ...sideScore(2)],
      },
      {
        name: 'vainqueur',
        description: 'Désigner le vainqueur (forfait, égalité parfaite, litige)',
        type: OptionType.Subcommand,
        options: [
          match,
          {
            name: 'clan',
            description: 'Le clan qualifié',
            type: OptionType.String,
            required: true,
            autocomplete: true,
          },
        ],
      },
    ],
  },
] as const;
