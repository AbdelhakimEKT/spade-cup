import { DestroyRef, Service, inject } from '@angular/core';
import { Router, Scroll } from '@angular/router';

/** Au-delà, on abandonne : la page ne sera jamais assez longue. */
const RESTORE_TIMEOUT_MS = 3000;

/**
 * Retour en arrière : remet la page à l'endroit où on l'avait laissée.
 *
 * Le routeur sait le faire, mais trop tôt : au moment du retour, le
 * classement n'est pas encore revenu du serveur, la page est trop courte et
 * on reste en haut. On réessaie donc à chaque image (≈ 60 fois par seconde)
 * jusqu'à y arriver, au plus 3 secondes, et on arrête dès que le visiteur
 * fait défiler lui-même.
 */
@Service()
export class ScrollRestore {
  private cancel: (() => void) | null = null;

  constructor() {
    const subscription = inject(Router).events.subscribe((event) => {
      if (event instanceof Scroll && event.position) this.restore(event.position);
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  private restore([x, y]: [number, number]): void {
    this.cancel?.();
    const deadline = performance.now() + RESTORE_TIMEOUT_MS;
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      for (const type of ['wheel', 'touchstart', 'keydown'] as const) {
        window.removeEventListener(type, stop);
      }
      this.cancel = null;
    };
    const step = () => {
      window.scrollTo(x, y);
      if (Math.abs(window.scrollY - y) <= 2 || performance.now() > deadline) stop();
      else frame = requestAnimationFrame(step);
    };
    for (const type of ['wheel', 'touchstart', 'keydown'] as const) {
      window.addEventListener(type, stop, { passive: true });
    }
    this.cancel = stop;
    frame = requestAnimationFrame(step);
  }
}
