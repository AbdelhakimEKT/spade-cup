-- =============================================================
-- Soirées FW « chill » : inscriptions par le bot, bilan de la soirée
-- =============================================================
-- Un modo crée une soirée avec /fw soiree : le bot publie l'affiche et le
-- bouton « Je m'inscris ». Après la soirée, le bot publie le top 5 des
-- joueurs, calculé sur toutes les FW jouées pendant la soirée.

CREATE TABLE fw_evenings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Début prévu (UTC, format SQLite), tel que tapé par le modo en heure de France.
  starts_at        TEXT    NOT NULL,
  -- Tels qu'affichés : « 28/10 », « 20H30 », « 3 FW · 15v15 ».
  date_label       TEXT    NOT NULL,
  time_label       TEXT    NOT NULL,
  note             TEXT,
  created_by       TEXT    NOT NULL,
  created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Bilan publié (ou abandonné : soirée sans aucune FW) : la soirée est close.
  recap_posted_at  TEXT,
  cancelled        INTEGER NOT NULL DEFAULT 0
);

-- Les comptes du jeu d'une personne sur Discord (un joueur peut en avoir plusieurs).
-- Retenus une fois pour toutes : aux soirées suivantes, un clic suffit.
CREATE TABLE discord_accounts (
  discord_id   TEXT    NOT NULL,
  player_tag   TEXT    NOT NULL,
  player_name  TEXT    NOT NULL,
  town_hall    INTEGER,
  added_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (discord_id, player_tag)
);

-- Les comptes inscrits à une soirée.
CREATE TABLE fw_signups (
  evening_id    INTEGER NOT NULL REFERENCES fw_evenings (id) ON DELETE CASCADE,
  player_tag    TEXT    NOT NULL,
  player_name   TEXT    NOT NULL,
  town_hall     INTEGER,
  discord_id    TEXT    NOT NULL,
  -- Pseudo sur le serveur au moment de l'inscription (affiché dans la liste).
  discord_name  TEXT    NOT NULL,
  signed_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (evening_id, player_tag)
);

-- Top de la semaine déjà publié (une seule fois par semaine).
CREATE TABLE fw_weekly_posts (
  week       TEXT PRIMARY KEY,  -- le lundi : « 2026-10-26 »
  posted_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX friendly_wars_by_start ON friendly_wars (started_at);
