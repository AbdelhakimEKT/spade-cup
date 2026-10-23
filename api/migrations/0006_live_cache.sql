-- =============================================================
-- Mémoire courte pour la page « En direct »
-- =============================================================
-- La dernière réponse du jeu pour chaque clan, avec son heure. Tant qu'elle a
-- moins de 30 secondes, on la réutilise : le jeu n'est jamais interrogé plus
-- d'une fois toutes les 30 secondes par clan, même si 100 personnes regardent.
CREATE TABLE live_cache (
  clan_tag    TEXT PRIMARY KEY,
  fetched_at  TEXT NOT NULL,
  war_json    TEXT NOT NULL
);
