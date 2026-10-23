import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { DEMO_TOURNAMENT } from '../data/demo-tournament';
import { RoundView } from './round-view';

describe('RoundView', () => {
  it('s’ouvre sur le tour en cours, puis change de tour au clic', async () => {
    TestBed.configureTestingModule({ imports: [RoundView], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(RoundView);
    fixture.componentRef.setInput('bracket', DEMO_TOURNAMENT.bracket!);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.round-list sc-match-card')).toHaveLength(4); // les quarts

    const buttons = el.querySelectorAll<HTMLButtonElement>('.round-picker__btn');
    buttons[0].click(); // huitièmes
    await fixture.whenStable();

    expect(el.querySelectorAll('.round-list sc-match-card')).toHaveLength(8);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    // Le tour en cours reste repérable.
    expect(buttons[1].classList).toContain('round-picker__btn--now');
  });
});
