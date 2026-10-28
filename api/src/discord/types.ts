/**
 * La petite partie de l'API Discord dont le bot a besoin.
 * Référence : https://discord.com/developers/docs/interactions/receiving-and-responding
 */

export const InteractionType = {
  Ping: 1,
  Command: 2,
  /** Clic sur un bouton, choix dans une liste (sous un message du bot). */
  Component: 3,
  Autocomplete: 4,
  /** Formulaire envoyé (fenêtre ouverte par le bot). */
  ModalSubmit: 5,
} as const;

export const ResponseType = {
  Pong: 1,
  /** Réponse immédiate. */
  Message: 4,
  /** « Le bot réfléchit… » : la vraie réponse suivra (15 minutes maximum). */
  Deferred: 5,
  /** Clic sur un bouton : « je réfléchis », puis modification du message cliqué. */
  DeferredUpdate: 6,
  /** Clic sur un bouton : on remplace le message cliqué. */
  UpdateMessage: 7,
  AutocompleteResult: 8,
  /** Ouvre une petite fenêtre de saisie (un formulaire). */
  Modal: 9,
} as const;

/** Les éléments interactifs d'un message : boutons, listes, champs de formulaire. */
export const ComponentType = {
  Row: 1,
  Button: 2,
  StringSelect: 3,
  TextInput: 4,
} as const;

export const ButtonStyle = { Primary: 1, Secondary: 2, Success: 3, Danger: 4 } as const;

export const OptionType = {
  Subcommand: 1,
  String: 3,
  Integer: 4,
  Number: 10,
  /** Fichier joint à la commande (une image, ici). */
  Attachment: 11,
} as const;

/** Un fichier joint à une commande, tel que Discord le décrit. */
export interface Attachment {
  readonly id: string;
  readonly filename: string;
  /** Adresse temporaire sur cdn.discordapp.com. */
  readonly url: string;
  readonly content_type?: string;
  /** Octets. */
  readonly size: number;
}

/** Message visible seulement par la personne qui a tapé la commande. */
export const EPHEMERAL = 64;

/** Pas de grande carte d'aperçu sous les liens : le lien reste cliquable. */
export const SUPPRESS_EMBEDS = 4;

export interface DiscordUser {
  readonly id: string;
  readonly username: string;
  readonly global_name?: string | null;
}

export interface CommandOption {
  readonly name: string;
  readonly type: number;
  readonly value?: string | number;
  /** Autocomplétion : l'option que la personne est en train de taper. */
  readonly focused?: boolean;
  readonly options?: readonly CommandOption[];
}

export interface Interaction {
  readonly type: number;
  readonly token: string;
  readonly application_id: string;
  /** Présent quand la commande est tapée sur un serveur (pas en message privé). */
  readonly member?: {
    readonly user: DiscordUser;
    readonly nick?: string | null;
    /** Permissions de la personne, sous forme de nombre en texte (champ de bits). */
    readonly permissions: string;
    /** Identifiants de ses rôles sur le serveur. */
    readonly roles?: readonly string[];
  };
  readonly data?: {
    readonly name: string;
    readonly options?: readonly CommandOption[];
    /** Les fichiers joints : la valeur d'une option « fichier » est leur identifiant. */
    readonly resolved?: { readonly attachments?: Readonly<Record<string, Attachment>> };
    /** Bouton ou liste cliqués, formulaire envoyé : l'identifiant choisi par le bot. */
    readonly custom_id?: string;
    /** Liste à choix : les valeurs cochées. */
    readonly values?: readonly string[];
    /** Formulaire : ses lignes, chacune avec son champ et sa valeur. */
    readonly components?: readonly {
      readonly components: readonly { readonly custom_id: string; readonly value?: string }[];
    }[];
  };
  /** Bouton cliqué : le message qui le porte. */
  readonly message?: { readonly id: string };
}

export interface Choice {
  readonly name: string;
  readonly value: string;
}
