import { TestBed } from '@angular/core/testing';
import { PosterPage } from './poster-page';

describe('PosterPage (/affiche, photographiée par le bot)', () => {
  it('logos de Discord affichés ; une autre adresse est remplacée par les initiales', async () => {
    TestBed.configureTestingModule({ imports: [PosterPage] });
    const fixture = TestBed.createComponent(PosterPage);
    fixture.componentRef.setInput('g', 'FR ESPORT');
    fixture.componentRef.setInput('gl', 'https://cdn.discordapp.com/attachments/1/2/fr.png');
    fixture.componentRef.setInput('d', 'Ci E-SPORTS');
    fixture.componentRef.setInput('dl', 'https://evil.example/ci.png');
    fixture.componentRef.setInput('f', '10v10');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.team--left img')?.getAttribute('src')).toContain(
      'cdn.discordapp.com',
    );
    expect(el.querySelector('.team--right img')).toBeNull();
    expect(el.querySelector('.team--right .team__initials')?.textContent).toBe('CE');
    expect(el.querySelector('.fact dd')?.textContent?.trim()).toBe('10V10');
  });

  it('paramètres absents : pas de plantage, « À définir » et initiales', async () => {
    TestBed.configureTestingModule({ imports: [PosterPage] });
    const fixture = TestBed.createComponent(PosterPage);
    fixture.componentRef.setInput('g', undefined);
    fixture.componentRef.setInput('gl', undefined);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.team--left .team__name')?.textContent).toBe('À définir');
    expect(el.querySelector('.team--left .team__initials')).not.toBeNull();
  });

  it('style « arene » : l’affiche Arène', async () => {
    TestBed.configureTestingModule({ imports: [PosterPage] });
    const fixture = TestBed.createComponent(PosterPage);
    fixture.componentRef.setInput('g', 'FR ESPORT');
    fixture.componentRef.setInput('s', 'arene');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.poster.arena')).not.toBeNull();
    expect(el.querySelector('.arena__team--left .arena__name')?.textContent).toBe('FR ESPORT');
  });

  it('styles « edito » et « billet » : leurs affiches, avec les mêmes infos', async () => {
    for (const [style, name] of [
      ['edito', '.edito__team--left .edito__name'],
      ['billet', '.billet__team--left .billet__name'],
    ]) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [PosterPage] });
      const fixture = TestBed.createComponent(PosterPage);
      fixture.componentRef.setInput('g', 'FR ESPORT');
      fixture.componentRef.setInput('s', style);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector(`.poster.${style}`)).not.toBeNull();
      expect(el.querySelector(name)?.textContent?.trim()).toBe('FR ESPORT');
    }
  });
});
