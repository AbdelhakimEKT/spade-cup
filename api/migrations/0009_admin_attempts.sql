-- =============================================================
-- Accès admin du site : tentatives de code ratées
-- =============================================================
-- Sert à bloquer qui essaierait de deviner le code (5 essais ratés par
-- quart d'heure et par connexion). Une ligne par essai raté ; les lignes de
-- plus d'un jour sont effacées au fil de l'eau.
CREATE TABLE admin_attempts (
  ip TEXT    NOT NULL,
  at INTEGER NOT NULL   -- millisecondes epoch
);
CREATE INDEX admin_attempts_by_ip ON admin_attempts (ip, at);
