-- Fiche d'inscription « en blocs » (Discord Components V2) et vérification
-- dans le jeu : le compte inscrit a-t-il rejoint le clan de sa team ?

-- Les soirées déjà lancées gardent leur ancienne fiche (0) : on ne transforme
-- pas un message déjà posté. Les nouvelles soirées ont la nouvelle (1).
ALTER TABLE fw_evenings ADD COLUMN sheet_v2 INTEGER NOT NULL DEFAULT 0;

-- Le clan où le bot a vu ce compte : celui de la FW-Team 1 ('violet'), de la
-- FW-Team 2 ('vert'), aucun des deux ('none'), ou pas encore vérifié (NULL).
-- On garde le clan plutôt qu'un « oui / non » : si un modo change le compte
-- d'équipe, l'état affiché reste juste sans attendre la vérification suivante.
ALTER TABLE fw_signups ADD COLUMN in_clan TEXT CHECK (in_clan IN ('violet', 'vert', 'none'));
