import { POSTER_FORMATS } from '../../../src/app/core/poster/poster';
import { OptionType } from './types';

/**
 * Les commandes du bot, telles qu'on les déclare à Discord
 * (scripts/register-commands.ts les envoie une fois pour toutes).
 *
 * QUI PEUT FAIRE QUOI : `/arbitre` est réservé par défaut aux membres qui
 * peuvent « Gérer le serveur ». C'est Discord qui applique cette règle ; les
 * admins peuvent ensuite l'ouvrir au rôle Modo dans
 * Paramètres du serveur → Intégrations → Spade Cup (le bot accepte aussi les
 * rôles de FW_MANAGER_ROLES). `/fw` est visible de tous, mais le bot ne
 * l'exécute que pour les admins et les modos.
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

/** Une info de la fiche d'une FW (texte libre). */
const fwText = (name: string, description: string, max = 60) => ({
  name,
  description,
  type: OptionType.String,
  max_length: max,
});

/** Les infos de la fiche : facultatives (valeurs habituelles par défaut). */
const fwDetails = [
  fwText('format', 'Défaut : « HDV 18 mode e-sport »'),
  fwText('preparation', 'Défaut : « 5 min de préparation »'),
  fwText('guerre', 'Défaut : « 15 min de guerre »'),
  fwText('attaques', 'Défaut : « 1 attaque par joueur »'),
  fwText('rounds', 'Défaut : « Plusieurs rounds »'),
  fwText('hdv', 'Défaut : « HDV 17 et HDV 16 acceptés »'),
];

const fwTeams = {
  name: 'equipes',
  description: 'Défaut : tirées au hasard 10 min avant',
  type: OptionType.String,
  choices: [
    { name: 'Random (tirées au hasard 10 min avant)', value: 'random' },
    { name: 'Libres (chacun choisit violette ou verte)', value: 'libre' },
  ],
};

const fwNumber = {
  name: 'numero',
  description: 'Numéro de la FW (défaut : le suivant)',
  type: OptionType.Integer,
  min_value: 1,
  max_value: 9999,
};

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
    // Visible de tous (les modos n'ont pas « Gérer le serveur ») : le bot
    // vérifie lui-même que la personne est admin ou modo (FW_MANAGER_ROLES).
    name: 'fw',
    description: 'Soirées FW (admins et modos)',
    ...GUILD_ONLY,
    options: [
      {
        name: 'lancer',
        description: 'Lancer une FW : annonce (ping) et fiche d’inscription',
        type: OptionType.Subcommand,
        options: [
          { ...fwText('date', 'Jour de la FW, par exemple 28/10', 8), required: true },
          { ...fwText('heure', 'Heure de début (France), par exemple 21h00', 8), required: true },
          fwTeams,
          ...fwDetails,
          fwNumber,
        ],
      },
      {
        name: 'modifier',
        description: 'Corriger la fiche de la FW en cours (seules les infos tapées changent)',
        type: OptionType.Subcommand,
        options: [
          fwText('date', 'Nouveau jour, par exemple 28/10', 8),
          fwText('heure', 'Nouvelle heure de début, par exemple 21h00', 8),
          fwTeams,
          ...fwDetails,
          fwNumber,
        ],
      },
      {
        name: 'equipes',
        description: 'Faire les équipes maintenant (sinon : automatique, 10 min avant)',
        type: OptionType.Subcommand,
        options: [
          {
            name: 'refaire',
            description: 'Refaire le tirage au hasard (équipes random)',
            type: OptionType.String,
            choices: [
              { name: 'Oui, nouveau tirage', value: 'oui' },
              { name: 'Non, juste les afficher', value: 'non' },
            ],
          },
        ],
      },
      {
        name: 'deplacer',
        description: 'Rééquilibrage : changer un compte d’équipe',
        type: OptionType.Subcommand,
        options: [
          {
            name: 'compte',
            description: 'Le compte (choisis dans la liste)',
            type: OptionType.String,
            required: true,
            autocomplete: true,
          },
          {
            name: 'equipe',
            description: 'Sa nouvelle équipe',
            type: OptionType.String,
            required: true,
            choices: [
              { name: 'Équipe violette', value: 'violet' },
              { name: 'Équipe verte', value: 'vert' },
            ],
          },
        ],
      },
      {
        name: 'bilan',
        description: 'Fin de soirée : publier le top 5 des joueurs dans #résultats',
        type: OptionType.Subcommand,
      },
      {
        name: 'annuler',
        description: 'Annuler la FW en cours',
        type: OptionType.Subcommand,
      },
    ],
  },
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
