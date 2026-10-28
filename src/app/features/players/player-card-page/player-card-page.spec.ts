import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { friendlyWar, player, playerProfile } from '../../../../testing/fixtures';
import { openPage } from '../../../../testing/open-page';
import { PlayerCardPage } from './player-card-page';

describe('PlayerCardPage (/joueurs/:tag/carte)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  /** Un joueur de FW : 2 FW, 3★ puis 2★ (la plus récente d'abord). */
  function fwProfile() {
    const base = playerProfile();
    const line = base.history[0].line;
    const totals = { ...base.totals, wars: 2, attacks: 2, stars: 5, triples: 1 };
    return {
      ...base,
      history: [],
      fw: {
        totals,
        history: [
          { war: friendlyWar(2), won: true, line: { ...line, stars: 3, triples: 1, attacks: 1 } },
          { war: friendlyWar(1), won: false, line: { ...line, stars: 2, triples: 0, attacks: 1 } },
        ],
      },
    };
  }

  it('la carte : nom, perfs, forme, QR code vers sa fiche ; boutons de partage', async () => {
    const { el, answer, reply } = await openPage(PlayerCardPage, { tag: 'D1P1' });
    const profile = fwProfile();
    answer('/fw/players', [player(9, { tag: profile.totals.tag, attacks: 3, stars: 8 })]);
    await reply('/players/D1P1', profile);

    expect(el.querySelector('.pc__name')?.textContent?.trim()).toBe(profile.totals.name);
    expect(el.querySelector('.pc__big')?.textContent?.trim()).toBe('2,50');
    expect([...el.querySelectorAll('.pip')].map((p) => p.textContent)).toEqual(['2★', '3★']);
    expect(el.querySelector('.pc__rank')?.textContent).toContain('#1');
    expect(el.querySelector('sc-qr-code path')?.getAttribute('d')).toMatch(/^M2 2h1v1h-1z/);
    expect(el.querySelector('.pc__url')?.textContent).toContain('/joueurs/D1P1');
    expect(el.textContent).toContain('Télécharger (PNG)');
    expect(el.textContent).toContain('Copier le lien');
  });

  it('mode capture : la carte seule', async () => {
    const { el, answer, reply } = await openPage(PlayerCardPage, { tag: 'D1P1', capture: true });
    answer('/fw/players', []);
    await reply('/players/D1P1', fwProfile());
    expect(el.querySelector('sc-player-card')).not.toBeNull();
    expect(el.querySelector('.actions')).toBeNull();
  });
});
