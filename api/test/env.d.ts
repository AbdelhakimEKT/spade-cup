import type { D1Migration } from 'cloudflare:test';

// Liaison réservée aux tests : les migrations lues par vitest.config.ts.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
