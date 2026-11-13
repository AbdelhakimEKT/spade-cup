import type { Reply } from './bot';

/**
 * Les briques d'un message Discord « en blocs » (Components V2) : un cadre
 * avec une barre de couleur à gauche, et dedans une image, des textes en
 * Markdown, des séparateurs et des boutons.
 *
 * Limites de Discord : 40 composants par message, 4 000 caractères de texte
 * au total. Un message en blocs n'a pas de `content`.
 */

/** Type de chaque composant (documentation Discord, « Component Types »). */
const enum Block {
  Row = 1,
  Text = 10,
  Gallery = 12,
  Separator = 14,
  Container = 17,
}

/** Le cadre : `accent` est la couleur de la barre de gauche (0xRRGGBB). */
export const container = (accent: number, components: readonly unknown[]) => ({
  type: Block.Container,
  accent_color: accent,
  components: components.filter(Boolean),
});

/** Du texte en Markdown (titres « ## », citations « > », petit texte « -# »…). */
export const text = (content: string) => ({ type: Block.Text, content });

/** Un trait horizontal (ou un simple espace si `divider` est faux). */
export const separator = (divider = true) => ({ type: Block.Separator, divider, spacing: 1 });

/** Une ou plusieurs images en grand (la bannière). */
export const gallery = (...urls: string[]) => ({
  type: Block.Gallery,
  items: urls.map((url) => ({ media: { url } })),
});

/** Une rangée de boutons (5 au plus). */
export const row = (components: readonly unknown[]) => ({ type: Block.Row, components });

/** Tout le texte d'un message (en blocs ou classique) : pour les tests et les journaux. */
export function textOf(reply: Pick<Reply, 'content' | 'components'>): string {
  const out: string[] = [];
  const walk = (c: unknown) => {
    if (!c || typeof c !== 'object') return;
    const block = c as { content?: unknown; components?: unknown[] };
    if (typeof block.content === 'string') out.push(block.content);
    block.components?.forEach(walk);
  };
  if (reply.content) out.push(reply.content);
  reply.components?.forEach(walk);
  return out.join('\n');
}
