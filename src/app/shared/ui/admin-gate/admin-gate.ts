import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminAccess, UnlockResult } from '../../../core/admin/admin-access';

const MESSAGES: Record<Exclude<UnlockResult, 'ok'>, string> = {
  wrong: 'Code incorrect.',
  blocked: 'Trop d’essais. Réessaie dans un quart d’heure.',
  unconfigured: 'Le code admin n’est pas encore configuré sur le serveur.',
  network: 'Le serveur ne répond pas. Réessaie dans un instant.',
};

/**
 * Verrou des pages admin : tant que l'appareil n'est pas déverrouillé, on
 * affiche le champ du code ; ensuite, le contenu de la page (`<ng-content>`).
 */
@Component({
  selector: 'sc-admin-gate',
  imports: [FormsModule],
  templateUrl: './admin-gate.html',
  styleUrl: './admin-gate.scss',
})
export class AdminGate {
  /** Ce que la page permet, affiché au-dessus du champ. */
  readonly purpose = input('Cette page est réservée aux admins du serveur.');

  protected readonly access = inject(AdminAccess);
  protected readonly code = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (!this.code().trim() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const result = await this.access.unlock(this.code());
    this.busy.set(false);
    if (result !== 'ok') {
      this.error.set(MESSAGES[result]);
      this.code.set('');
    }
  }
}
