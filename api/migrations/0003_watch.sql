-- =============================================================
-- Arbitrage automatique : le bot surveille les guerres en cours
-- =============================================================

-- Moment où le match est devenu jouable (ses deux clans connus). Une guerre
-- lancée AVANT ce moment ne compte pas : sinon le bot validerait une vieille
-- guerre amicale entre les deux mêmes clans.
ALTER TABLE matches ADD COLUMN ready_at TEXT;

-- Les matchs déjà complets reçoivent une date tout de suite.
UPDATE matches SET ready_at = CURRENT_TIMESTAMP
WHERE home_tag IS NOT NULL AND away_tag IS NOT NULL;

-- Ce que le bot a déjà annoncé, pour ne jamais le répéter toutes les
-- 5 minutes (une égalité parfaite reste « à trancher » jusqu'aux arbitres).
-- `war_key` identifie la guerre : son heure de lancement dans le jeu.
CREATE TABLE watch_events (
  tournament_id  INTEGER NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  match_id       TEXT    NOT NULL,
  kind           TEXT    NOT NULL,
  war_key        TEXT    NOT NULL,
  created_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, match_id, kind, war_key)
);
