import { TestBed } from '@angular/core/testing';
import { ClanAvatar } from './clan-avatar';

async function render(clan: { tag: string; name: string; badgeUrl?: string } | null) {
  TestBed.configureTestingModule({ imports: [ClanAvatar] });
  const fixture = TestBed.createComponent(ClanAvatar);
  fixture.componentRef.setInput('clan', clan);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('ClanAvatar', () => {
  it('affiche les initiales quand le blason est inconnu', async () => {
    const el = await render({ tag: '#A', name: 'Titans FR' });
    expect(el.textContent?.trim()).toBe('TF');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('affiche le blason officiel quand il est connu', async () => {
    const el = await render({
      tag: '#A',
      name: 'Titans FR',
      badgeUrl: 'https://exemple.test/b.png',
    });
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://exemple.test/b.png');
  });

  it('place inconnue : un point d’interrogation', async () => {
    const el = await render(null);
    expect(el.textContent?.trim()).toBe('?');
  });
});
