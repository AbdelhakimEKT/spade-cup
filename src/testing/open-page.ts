import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SITE_CONFIG } from '../app/core/site-config';
import { FRENCH_LOCALE } from './french-locale';

/**
 * Ouvre une page qui lit le serveur, avec un FAUX serveur piloté par le test.
 * `reply(adresse, données)` répond à la requête attendue, puis attend que la
 * page se redessine.
 */
export function openPage<T>(component: Type<T>, inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    imports: [component],
    providers: [provideRouter([]), provideHttpClientTesting(), FRENCH_LOCALE],
  });
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  // Pas de whenStable() ici : il attendrait la réponse… que le test n'a pas encore donnée.
  TestBed.tick();

  const http = TestBed.inject(HttpTestingController);
  /** Répond à une requête, sans attendre (utile quand plusieurs sont en cours). */
  const answer = (path: string, body: object, status = 200) =>
    http
      .expectOne(`${SITE_CONFIG.apiUrl}${path}`)
      .flush(body, { status, statusText: status === 200 ? 'OK' : 'Erreur' });
  /** Répond, puis attend que la page se redessine. */
  const reply = async (path: string, body: object, status = 200) => {
    answer(path, body, status);
    await fixture.whenStable();
  };
  return { fixture, el: fixture.nativeElement as HTMLElement, http, answer, reply };
}
