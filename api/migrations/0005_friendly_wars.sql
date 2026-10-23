-- =============================================================
-- FW classiques (hors tournoi)
-- =============================================================
-- Les FW de tous les jours entre les deux clans du serveur (FW-team1 et
-- FW-team2). Aucune annonce : juste les stats des joueurs, dans un
-- classement séparé de celui de la Spade Cup.

CREATE TABLE friendly_wars (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Identifie la guerre : son heure de lancement dans le jeu + les deux tags.
  -- UNIQUE : la même guerre, vue à chaque passage du bot, n'est gardée qu'une fois.
  war_key         TEXT    NOT NULL UNIQUE,
  started_at      TEXT,
  ended_at        TEXT,
  team_size       INTEGER,
  home_tag        TEXT    NOT NULL,
  home_name       TEXT    NOT NULL,
  home_stars      INTEGER NOT NULL,
  home_destruction REAL   NOT NULL,
  home_duration   INTEGER NOT NULL,
  away_tag        TEXT    NOT NULL,
  away_name       TEXT    NOT NULL,
  away_stars      INTEGER NOT NULL,
  away_destruction REAL   NOT NULL,
  away_duration   INTEGER NOT NULL,
  winner          TEXT    CHECK (winner IN ('home', 'away')),  -- NULL = égalité parfaite
  recorded_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE fw_players (
  war_id           INTEGER NOT NULL REFERENCES friendly_wars (id) ON DELETE CASCADE,
  side             TEXT    NOT NULL CHECK (side IN ('home', 'away')),
  clan_tag         TEXT    NOT NULL,
  player_tag       TEXT    NOT NULL,
  player_name      TEXT    NOT NULL,
  town_hall        INTEGER NOT NULL,
  map_position     INTEGER NOT NULL,
  attacks          INTEGER NOT NULL,
  stars            INTEGER NOT NULL,
  destruction_sum  REAL    NOT NULL,
  triples          INTEGER NOT NULL,
  duration         INTEGER NOT NULL,
  PRIMARY KEY (war_id, player_tag)
);

CREATE INDEX fw_players_by_player ON fw_players (player_tag);
