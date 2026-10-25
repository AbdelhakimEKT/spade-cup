-- =============================================================
-- Cible de chaque attaque en FW classique
-- =============================================================
-- Les bases attaquées par le joueur (place sur la carte adverse, pseudo,
-- étoiles, %, temps), en JSON : un ou deux éléments, seulement affichés,
-- jamais recherchés ni additionnés. NULL pour les FW enregistrées avant.
ALTER TABLE fw_players ADD COLUMN targets TEXT;
