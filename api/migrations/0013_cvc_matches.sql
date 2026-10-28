-- =============================================================
-- Matchs « Clan vs Clan » (affiches)
-- =============================================================
-- Chaque /arbitre affiche est retenu : /arbitre victoire peut ensuite faire
-- l'affiche du résultat en choisissant le match, sans tout retaper.
-- Les logos sont des liens Discord, valables environ 24 heures.
CREATE TABLE cvc_matches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  TEXT    NOT NULL,
  left_name   TEXT    NOT NULL,
  left_logo   TEXT    NOT NULL,
  right_name  TEXT    NOT NULL,
  right_logo  TEXT    NOT NULL,
  format      TEXT    NOT NULL,
  date_label  TEXT    NOT NULL,
  time_label  TEXT    NOT NULL,
  rules       TEXT    NOT NULL,
  -- Une fois le résultat publié : 'left' ou 'right', et le score.
  winner      TEXT    CHECK (winner IN ('left', 'right')),
  score       TEXT
);
