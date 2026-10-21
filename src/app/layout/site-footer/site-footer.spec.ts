import { TestBed } from '@angular/core/testing';
import { SiteFooter } from './site-footer';

describe('SiteFooter', () => {
  it('affiche la mention exigée par Supercell pour les contenus de fans', async () => {
    const fixture = TestBed.createComponent(SiteFooter);
    await fixture.whenStable();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a');

    expect(link?.getAttribute('href')).toBe('https://supercell.com/en/fan-content-policy/');
  });
});
