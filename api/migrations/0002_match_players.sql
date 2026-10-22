-- =============================================================
-- Joueurs des matchs : la base des statistiques
-- =============================================================
-- Une ligne par joueur et par match, lue dans l'API du jeu à la fin de la
-- guerre amicale. Les classements (le plus de guerres, le plus d'étoiles…)
-- sont de simples SUM / COUNT sur cette table.

-- D'où vient le score d'un match : lu dans le jeu, ou saisi par un arbitre.
ALTER TABLE matches ADD COLUMN result_source TEXT CHECK (result_source IN ('game', 'referee'));

CREATE TABLE match_players (
  tournament_id    INTEGER NOT NULL,
  match_id         TEXT    NOT NULL,
  side             TEXT    NOT NULL CHECK (side IN ('home', 'away')),
  clan_tag         TEXT    NOT NULL,                -- le clan sous les couleurs duquel il a joué
  player_tag       TEXT    NOT NULL,
  player_name      TEXT    NOT NULL,                -- le pseudo AU MOMENT du match
  town_hall        INTEGER NOT NULL,
  map_position     INTEGER NOT NULL,
  attacks          INTEGER NOT NULL,
  stars            INTEGER NOT NULL,
  destruction_sum  REAL    NOT NULL,                -- somme des % : la moyenne se calcule
  triples          INTEGER NOT NULL,
  duration         INTEGER NOT NULL,                -- secondes
  PRIMARY KEY (tournament_id, match_id, player_tag),
  -- Supprimer un match supprime ses lignes de joueurs (et un tournoi, ses matchs).
  FOREIGN KEY (tournament_id, match_id) REFERENCES matches (tournament_id, match_id) ON DELETE CASCADE
);

-- Les pages « joueur » et « clan » cherchent par tag : un index évite de
-- parcourir toute la table.
CREATE INDEX match_players_by_player ON match_players (player_tag);
CREATE INDEX match_players_by_clan ON match_players (clan_tag);
