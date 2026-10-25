import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BackLink, backLabel } from './back-link';

describe('backLabel', () => {
  it('nomme la page d’où l’on vient, d’après son adresse', () => {
    expect(backLabel('/joueurs?type=fw')).toBe('Classement des FW classiques');
    expect(backLabel('/joueurs')).toBe('Classement des joueurs');
    expect(backLabel('/joueurs?tournoi=demo')).toBe('Classement des joueurs');
    expect(backLabel('/fw/5')).toBe('Détail de la FW');
    expect(backLabel('/tournois/demo/matchs/R1-M1')).toBe('Match');
    expect(backLabel('/tournois/demo')).toBe('Tournoi');
    expect(backLabel('/clans/2JU0GRG98')).toBe('Clan');
    expect(backLabel('/')).toBe('Accueil');
    expect(backLabel('/a-propos')).toBe('Retour');
  });
});

describe('BackLink', () => {
  it('page ouverte directement (aucune page précédente) : mène à la page de repli', async () => {
    TestBed.configureTestingModule({ imports: [BackLink], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BackLink);
    fixture.componentRef.setInput('fallback', '/joueurs?type=fw');
    fixture.componentRef.setInput('fallbackLabel', 'Classement des FW classiques');
    await fixture.whenStable();
    const a = (fixture.nativeElement as HTMLElement).querySelector('a')!;
    expect(a.getAttribute('href')).toBe('/joueurs?type=fw');
    expect(a.textContent?.trim()).toBe('← Classement des FW classiques');
  });
});
