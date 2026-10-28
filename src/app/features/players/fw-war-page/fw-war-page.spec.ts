import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { fwWarDetail } from '../../../../testing/fixtures';
import { openPage } from '../../../../testing/open-page';
import { FwWarPage } from './fw-war-page';

describe('FwWarPage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('team 1 violet à gauche, team 2 vert à droite ; le gagnant a son trophée', async () => {
    const { el, reply } = await openPage(FwWarPage, { id: '1' });
    await reply('/fw/wars/1', fwWarDetail());

    expect(el.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'FW-team1 contre FW-team2',
    );
    const [left, right] = el.querySelectorAll('.scoreboard .team');
    expect(left.querySelector('.team__name')?.classList).toContain('team--violet');
    expect(left.classList).toContain('team--lost');
    expect(left.textContent).toContain('11'); // étoiles de FW-team1
    expect(left.textContent).toContain('10 min 55 s'); // 655 s
    expect(right.textContent).toContain('🏆');
    expect(right.querySelector('.chip--green')?.textContent).toContain('Victoire FW-team2');
    expect(TestBed.inject(Title).getTitle()).toBe('FW-team1 – FW-team2 · Friendly Wars');
  });

  it('mode capture (image Discord) : ni lien de retour ni filtres, signature du site', async () => {
    const { el, reply } = await openPage(FwWarPage, { id: '1', capture: true });
    await reply('/fw/wars/1', fwWarDetail());
    expect(el.querySelector('sc-back-link')).toBeNull();
    expect(el.querySelector('.filter')).toBeNull();
    expect(el.querySelector('sc-war-players-table')).not.toBeNull();
    expect(el.querySelector('.capture-url')?.textContent).toMatch(/\/fw\/\d+$/);
  });

  it('les joueurs qui ont attaqué, triés par étoiles ; pas les comptes de lancement', async () => {
    const { el, reply, fixture } = await openPage(FwWarPage, { id: '1' });
    await reply('/fw/wars/1', fwWarDetail()); // 10 joueurs, dont 2 sans attaque

    const rows = () => el.querySelectorAll('sc-war-players-table tbody tr');
    expect(rows()).toHaveLength(8);
    expect(el.textContent).not.toContain('Pas attaqué');
    expect(el.querySelector('.hint')?.textContent?.replace(/\s+/g, ' ')).toContain(
      '2 comptes sans attaque (lancement de la FW) ne sont pas affichés',
    );
    expect(el.querySelector('th[aria-sort="descending"]')?.textContent).toContain('Étoiles');

    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('.filter button')].find(
        (b) => b.textContent?.trim() === label,
      )!;
    button('FW-team1').click();
    await fixture.whenStable();
    expect(rows()).toHaveLength(3);
    expect(button('FW-team1').getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelectorAll('sc-war-players-table tbody .team--green')).toHaveLength(0);

    button('Tous').click();
    await fixture.whenStable();
    expect(rows()).toHaveLength(8);
  });

  it('relevé partiel : le dit clairement', async () => {
    const { el, reply } = await openPage(FwWarPage, { id: '1' });
    const detail = fwWarDetail();
    await reply('/fw/wars/1', { ...detail, war: { ...detail.war, partial: true } });
    expect(el.querySelector('.note')?.textContent).toContain('Relevé partiel');
  });

  it('404 : « FW introuvable », avec un lien vers les FW', async () => {
    const { el, reply } = await openPage(FwWarPage, { id: '99' });
    await reply('/fw/wars/99', { error: 'FW introuvable.' }, 404);
    expect(el.querySelector('h1')?.textContent).toBe('FW introuvable');
    expect(el.querySelector('a[href="/joueurs?type=fw"]')).not.toBeNull();
  });
});
