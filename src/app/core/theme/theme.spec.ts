import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Theme } from './theme';

describe('Theme', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    root = TestBed.inject(DOCUMENT).documentElement;
    delete root.dataset['theme'];
  });

  it('sans choix enregistré, suit le système (sombre ici) sans forcer de thème sur la page', () => {
    const theme = TestBed.inject(Theme);
    TestBed.tick(); // exécute les effects en attente

    expect(theme.current()).toBe('dark');
    expect(root.dataset['theme']).toBeUndefined();
  });

  it('toggle() bascule en clair, le pose sur la page et le retient', () => {
    const theme = TestBed.inject(Theme);
    theme.toggle();
    TestBed.tick();

    expect(theme.current()).toBe('light');
    expect(root.dataset['theme']).toBe('light');
    expect(localStorage.getItem('spadecup.theme')).toBe('light');
  });

  it('reprend le choix enregistré lors de la visite précédente', () => {
    localStorage.setItem('spadecup.theme', 'light');
    const theme = TestBed.inject(Theme);

    expect(theme.current()).toBe('light');
  });

  it('ignore une valeur enregistrée invalide', () => {
    localStorage.setItem('spadecup.theme', 'violet');
    const theme = TestBed.inject(Theme);

    expect(theme.current()).toBe('dark');
  });
});
