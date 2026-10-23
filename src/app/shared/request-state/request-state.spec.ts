import { Component, resource } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RequestState } from './request-state';

/**
 * Hôte de test : une ressource dont le TEST décide quand et comment le
 * chargement se termine (`finish.resolve()` ou `finish.reject()`).
 */
@Component({
  imports: [RequestState],
  template: `<sc-request-state [resource]="data" errorMessage="Oups." />`,
})
class Host {
  attempts = 0;
  finish!: { resolve: (v: string) => void; reject: (e: Error) => void };
  readonly data = resource({
    loader: () =>
      new Promise<string>((resolve, reject) => {
        this.attempts++;
        this.finish = { resolve, reject };
      }),
  });
}

function render() {
  const fixture = TestBed.createComponent(Host);
  TestBed.tick(); // affiche, et lance le chargement
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

describe('RequestState', () => {
  it('pendant le chargement : un message de statut (annoncé aux lecteurs d’écran)', async () => {
    const { el, host, fixture } = render();
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Chargement');
    expect(el.querySelector('[role="alert"]')).toBeNull();

    host.finish.resolve('ok');
    await fixture.whenStable();
    expect(el.textContent?.trim()).toBe(''); // données arrivées : plus rien à afficher
  });

  it('en erreur : le message, et « Réessayer » relance le chargement', async () => {
    const { el, host, fixture } = render();
    host.finish.reject(new Error('panne'));
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Oups.');

    el.querySelector<HTMLButtonElement>('.retry')!.click();
    TestBed.tick(); // relance le chargement…
    TestBed.tick(); // …puis redessine avec le nouvel état
    expect(host.attempts).toBe(2);
    expect(el.querySelector('[role="status"]')).not.toBeNull();

    host.finish.resolve('ok');
    await fixture.whenStable();
  });
});
