import { Component, computed, input } from '@angular/core';
import { ClanRef } from '../../../core/tournament/models';
import { clanColor, clanInitials } from '../clan-visuals';

/**
 * Pastille ronde d'un clan : son blason officiel s'il est connu, sinon ses
 * initiales sur une couleur propre au clan. Purement décorative : le nom du
 * clan est toujours écrit à côté, donc on la cache aux lecteurs d'écran.
 */
@Component({
  selector: 'sc-clan-avatar',
  template: `
    @if (clan()?.badgeUrl; as url) {
      <img [src]="url" alt="" [width]="pixels()" [height]="pixels()" />
    } @else {
      {{ initials() }}
    }
  `,
  styles: `
    :host {
      display: inline-grid;
      flex: none;
      place-items: center;
      overflow: hidden;
      width: var(--avatar-size);
      height: var(--avatar-size);
      border-radius: 50%;
      color: #fff;
      font-family: var(--font-display);
      font-size: calc(var(--avatar-size) * 0.5);
      font-weight: 700;
      line-height: 1;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  `,
  host: {
    'aria-hidden': 'true',
    '[style.--avatar-size]': "pixels() + 'px'",
    '[style.background]': 'background()',
    '[style.box-shadow]': "size() === 'lg' ? '0 0 0 3px rgb(255 255 255 / 0.08)' : null",
  },
})
export class ClanAvatar {
  /** `null` = place encore inconnue (« ? »). */
  readonly clan = input.required<ClanRef | null>();
  readonly size = input<'sm' | 'lg'>('sm');

  protected readonly pixels = computed(() => (this.size() === 'lg' ? 64 : 22));
  protected readonly initials = computed(() => {
    const clan = this.clan();
    return clan ? clanInitials(clan.name) : '?';
  });
  protected readonly background = computed(() => {
    const clan = this.clan();
    if (!clan) return 'var(--card-divider)';
    return clan.badgeUrl ? 'transparent' : clanColor(clan.tag);
  });
}
