import { HttpResourceRef, httpResource } from '@angular/common/http';
import { Service } from '@angular/core';
import { SITE_CONFIG } from '../../../core/site-config';
import { ClanProfile } from '../../../core/tournament/stats';

/** Fiches des clans, lues sur le serveur. */
@Service()
export class Clans {
  private readonly api = SITE_CONFIG.apiUrl;

  /** `tag` sans le « # », tel qu'il apparaît dans l'URL du site. */
  profile(tag: () => string): HttpResourceRef<ClanProfile | undefined> {
    return httpResource<ClanProfile>(() => `${this.api}/clans/${encodeURIComponent(tag())}`);
  }
}
