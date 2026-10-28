import { Component, computed, input } from '@angular/core';
import qrcode from 'qrcode-generator';

/**
 * Un QR code, dessiné en SVG (net à toutes les tailles, et dans l'image
 * exportée). Un seul chemin : chaque case noire est un petit carré.
 */
@Component({
  selector: 'sc-qr-code',
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + code().size + ' ' + code().size"
      shape-rendering="crispEdges"
      role="img"
      [attr.aria-label]="'QR code : ' + text()"
    >
      <rect [attr.width]="code().size" [attr.height]="code().size" fill="#fff" />
      <path [attr.d]="code().path" fill="#0b0a12" />
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class QrCode {
  /** Ce que le QR code contient (une adresse). */
  readonly text = input.required<string>();

  protected readonly code = computed(() => qrPath(this.text()));
}

/** Les cases noires du QR code, en un chemin SVG, avec 2 cases de marge blanche. */
export function qrPath(text: string): { size: number; path: string } {
  const qr = qrcode(0, 'M'); // taille automatique, correction d'erreurs moyenne
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const margin = 2;
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + margin} ${row + margin}h1v1h-1z`;
    }
  }
  return { size: count + 2 * margin, path };
}
