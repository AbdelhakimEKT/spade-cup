import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SITE_CONFIG } from '../../../core/site-config';
import { AdminGate } from './admin-gate';

@Component({
  imports: [AdminGate],
  template: `<sc-admin-gate><p class="secret">Outil admin</p></sc-admin-gate>`,
})
class Host {}

const URL_UNLOCK = `${SITE_CONFIG.apiUrl}/admin/unlock`;

async function render() {
  TestBed.configureTestingModule({ imports: [Host], providers: [provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const http = TestBed.inject(HttpTestingController);
  const type = async (code: string) => {
    const input = el.querySelector<HTMLInputElement>('#admin-code')!;
    input.value = code;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    TestBed.tick();
  };
  const settle = () => new Promise((r) => setTimeout(r)).then(() => fixture.whenStable());
  return { el, http, type, settle };
}

describe('AdminGate', () => {
  beforeEach(() => localStorage.removeItem('fw.admin.unlocked'));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('verrouillé : le champ du code, pas le contenu', async () => {
    const { el } = await render();
    expect(el.querySelector('#admin-code')).not.toBeNull();
    expect(el.querySelector('.secret')).toBeNull();
  });

  it('code envoyé au SERVEUR ; accepté → le contenu, et l’appareil s’en souvient', async () => {
    const { el, http, type, settle } = await render();
    await type('trefle-2026');
    const req = http.expectOne(URL_UNLOCK);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ code: 'trefle-2026' });
    req.flush({ ok: true });
    await settle();
    expect(el.querySelector('.secret')?.textContent).toBe('Outil admin');
    expect(localStorage.getItem('fw.admin.unlocked')).toBe('yes');
  });

  it('code faux, puis trop d’essais : messages clairs, toujours verrouillé', async () => {
    const { el, http, type, settle } = await render();
    await type('faux');
    http
      .expectOne(URL_UNLOCK)
      .flush({ error: 'Code incorrect.' }, { status: 401, statusText: 'Unauthorized' });
    await settle();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Code incorrect');
    expect(el.querySelector('.secret')).toBeNull();

    await type('encore');
    http.expectOne(URL_UNLOCK).flush({}, { status: 429, statusText: 'Too Many Requests' });
    await settle();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Trop d’essais');
  });

  it('déjà déverrouillé sur cet appareil : contenu direct, sans redemander', async () => {
    localStorage.setItem('fw.admin.unlocked', 'yes');
    const { el } = await render();
    expect(el.querySelector('.secret')).not.toBeNull();
  });
});
