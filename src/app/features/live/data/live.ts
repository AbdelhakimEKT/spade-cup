import { HttpResourceRef, httpResource } from '@angular/common/http';
import { Service } from '@angular/core';
import { SITE_CONFIG } from '../../../core/site-config';
import { LiveWar } from '../../../core/tournament/live';

/** Les guerres en train de se jouer, lues sur le serveur (lui-même relit le jeu toutes les 30 s). */
@Service()
export class Live {
  wars(): HttpResourceRef<readonly LiveWar[] | undefined> {
    return httpResource<readonly LiveWar[]>(() => `${SITE_CONFIG.apiUrl}/live`);
  }
}
