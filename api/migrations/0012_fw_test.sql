-- =============================================================
-- Soirées FW d'essai (/fw lancer test:oui)
-- =============================================================
-- Tout est posté dans le salon où la commande est tapée, sans ping du rôle,
-- et le bilan reste dans ce salon. Une soirée d'essai ne prend pas de numéro.
ALTER TABLE fw_evenings ADD COLUMN test INTEGER NOT NULL DEFAULT 0;
