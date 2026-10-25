-- =============================================================
-- Filet de sécurité des FW classiques
-- =============================================================
-- Le jeu ne garde que la DERNIÈRE guerre d'un clan. Si une FW est relancée
-- juste après la précédente, celle-ci peut disparaître avant que le bot l'ait
-- vue terminée. Pendant chaque guerre, le bot garde donc son dernier état vu ;
-- si elle disparaît, elle est enregistrée d'après ce dernier état.

-- Dernier état vu de chaque FW en cours (effacé une fois la FW enregistrée).
CREATE TABLE fw_snapshots (
  war_key   TEXT PRIMARY KEY,
  war_json  TEXT NOT NULL,
  seen_at   TEXT NOT NULL
);

-- 1 : lue terminée dans le jeu. 0 : reconstituée d'après le dernier état vu
-- (les toutes dernières attaques peuvent manquer).
ALTER TABLE friendly_wars ADD COLUMN complete INTEGER NOT NULL DEFAULT 1;
