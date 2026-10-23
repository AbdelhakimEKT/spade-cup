/**
 * La petite partie de l'API Discord dont le bot a besoin.
 * Référence : https://discord.com/developers/docs/interactions/receiving-and-responding
 */

export const InteractionType = { Ping: 1, Command: 2, Autocomplete: 4 } as const;

export const ResponseType = {
  Pong: 1,
  /** Réponse immédiate. */
  Message: 4,
  /** « Le bot réfléchit… » : la vraie réponse suivra (15 minutes maximum). */
  Deferred: 5,
  AutocompleteResult: 8,
} as const;

export const OptionType = {
  Subcommand: 1,
  String: 3,
  Integer: 4,
  Number: 10,
} as const;

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
  };
  readonly data?: { readonly name: string; readonly options?: readonly CommandOption[] };
}

export interface Choice {
  readonly name: string;
  readonly value: string;
}
