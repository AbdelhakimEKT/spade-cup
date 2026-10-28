-- =============================================================
-- Soirées FW, version 2 : numérotées, avec leur fiche complète et les équipes
-- =============================================================
-- /fw lancer publie la fiche dans #inscription (liste des inscrits tenue à
-- jour par le bot) et l'annonce avec le ping du rôle dans #annonce-fw. À
-- H − 10 min, le bot fait (ou affiche) les équipes. Le bilan de la soirée est
-- publié par un modo (/fw bilan), plus automatiquement.

-- « FW #41 » : numéro de la soirée.
ALTER TABLE fw_evenings ADD COLUMN number INTEGER;
-- 'random' : équipes tirées au hasard à H − 10 ; 'libre' : chacun choisit la sienne.
ALTER TABLE fw_evenings ADD COLUMN mode TEXT NOT NULL DEFAULT 'random';
-- Les infos de la fiche, modifiables (/fw modifier). NULL : valeur par défaut.
ALTER TABLE fw_evenings ADD COLUMN format TEXT;
ALTER TABLE fw_evenings ADD COLUMN preparation TEXT;
ALTER TABLE fw_evenings ADD COLUMN war_length TEXT;
ALTER TABLE fw_evenings ADD COLUMN attacks TEXT;
ALTER TABLE fw_evenings ADD COLUMN rounds TEXT;
ALTER TABLE fw_evenings ADD COLUMN accepted TEXT;
-- Les messages du bot : la fiche dans #inscription (tenue à jour), l'annonce.
ALTER TABLE fw_evenings ADD COLUMN signup_channel TEXT;
ALTER TABLE fw_evenings ADD COLUMN signup_message TEXT;
ALTER TABLE fw_evenings ADD COLUMN announce_channel TEXT;
ALTER TABLE fw_evenings ADD COLUMN announce_message TEXT;
-- Équipes faites et affichées (H − 10).
ALTER TABLE fw_evenings ADD COLUMN teams_at TEXT;

-- L'équipe d'un compte inscrit : 'violet' (FW-team1) ou 'vert' (FW-team2) ;
-- NULL tant que les équipes ne sont pas faites (mode random).
ALTER TABLE fw_signups ADD COLUMN team TEXT CHECK (team IN ('violet', 'vert'));
