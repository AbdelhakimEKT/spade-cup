import { Component } from '@angular/core';

/**
 * Éclairs décoratifs sur les bords de la page (violet à gauche, vert à droite),
 * repris de la maquette. Purement décoratifs : invisibles pour les lecteurs
 * d'écran, et masqués sur les écrans étroits où ils mangeraient le contenu.
 */
@Component({
  selector: 'sc-brand-bolts',
  template: `
    <svg class="bolt bolt--left" viewBox="0 0 300 1000" preserveAspectRatio="xMinYMid slice">
      <defs>
        <linearGradient id="sc-bolt-l" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#b067ff" />
          <stop offset="1" stop-color="#5a12d6" />
        </linearGradient>
      </defs>
      <g fill="url(#sc-bolt-l)">
        <polygon points="0,120 230,60 120,150 260,120 40,260 120,200 0,250" />
        <polygon points="0,420 190,330 110,420 240,390 30,560 110,480 0,520" />
        <polygon points="0,720 210,620 120,720 250,690 20,880 110,790 0,830" />
      </g>
    </svg>
    <svg class="bolt bolt--right" viewBox="0 0 300 1000" preserveAspectRatio="xMinYMid slice">
      <defs>
        <linearGradient id="sc-bolt-r" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#35e07a" />
          <stop offset="1" stop-color="#19d3ff" />
        </linearGradient>
      </defs>
      <g fill="url(#sc-bolt-r)">
        <polygon points="0,90 220,40 120,130 260,100 30,250 110,180 0,220" />
        <polygon points="0,400 200,310 110,400 250,370 20,540 110,460 0,500" />
        <polygon points="0,700 220,610 120,700 260,670 30,860 110,770 0,810" />
      </g>
    </svg>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
    }

    .bolt {
      position: absolute;
      top: 0;
      width: 15vw;
      max-width: 230px;
      height: 100%;
      opacity: var(--bolt-opacity);
      // Halo lumineux autour des éclairs.
      filter: blur(0.5px) drop-shadow(0 0 10px currentColor);
    }

    .bolt--left {
      left: 0;
      color: #8b2cff;
    }

    .bolt--right {
      right: 0;
      color: #35e07a;
      transform: scaleX(-1); // même dessin, retourné
    }

    @media (max-width: 1100px) {
      :host {
        display: none;
      }
    }
  `,
  host: { 'aria-hidden': 'true' },
})
export class BrandBolts {}
