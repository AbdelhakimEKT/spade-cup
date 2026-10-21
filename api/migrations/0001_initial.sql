-- =============================================================
-- Schéma initial de Spade Cup FR
-- =============================================================
-- Trois tables :
--   tournaments    un tournoi (nom, état, règlement…)
--   registrations  les clans inscrits à un tournoi
--   matches        les matchs de l'arbre, une ligne par match
--
-- L'arbre n'est pas stocké d'un bloc : chaque match est une ligne, avec ses
-- scores dans de vraies colonnes. On peut ainsi interroger les résultats en
-- SQL (meilleures attaques, stats d'un clan…) sans décoder du JSON.

CREATE TABLE tournaments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT    NOT NULL UNIQUE,               -- utilisé dans l'URL
  name         TEXT    NOT NULL,
  status       TEXT    NOT NULL CHECK (status IN ('registration', 'running', 'finished')),
  organizer    TEXT    NOT NULL,
  referees     TEXT    NOT NULL DEFAULT '[]',         -- liste JSON de pseudos
  rules        TEXT    NOT NULL DEFAULT '',
  is_demo      INTEGER NOT NULL DEFAULT 0,            -- 0 ou 1 (SQLite n'a pas de booléen)
  created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE registrations (
  tournament_id  INTEGER NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  clan_tag       TEXT    NOT NULL,                    -- avec le « # »
  clan_name      TEXT    NOT NULL,
  badge_url      TEXT,                                -- blason officiel, si connu
  seed           INTEGER,                             -- tête de série, fixée au tirage
  registered_by  TEXT,                                -- identifiant Discord du chef
  registered_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, clan_tag)               -- un clan ne s'inscrit qu'une fois
);

CREATE TABLE matches (
  tournament_id     INTEGER NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  match_id          TEXT    NOT NULL,                 -- « R1-M3 »
  round             INTEGER NOT NULL,
  idx               INTEGER NOT NULL,                 -- position dans le tour
  home_tag          TEXT,                             -- NULL = à déterminer / exempt
  away_tag          TEXT,
  status            TEXT    NOT NULL CHECK (status IN ('pending', 'live', 'bye', 'done')),
  winner            TEXT    CHECK (winner IN ('home', 'away')),
  home_stars        INTEGER,
  home_destruction  REAL,
  home_duration     INTEGER,                          -- secondes
  away_stars        INTEGER,
  away_destruction  REAL,
  away_duration     INTEGER,
  updated_at        TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, match_id)
);
