import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID, Provider } from '@angular/core';

// Comme dans app.config.ts : nombres au format français (« 91,2 » et non « 91.2 »).
registerLocaleData(localeFr);

export const FRENCH_LOCALE: Provider = { provide: LOCALE_ID, useValue: 'fr' };
