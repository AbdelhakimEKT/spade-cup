-- =============================================================
-- Heure de fin réelle d'un match
-- =============================================================
-- Pour une guerre lue dans le jeu : l'heure de FIN de la guerre (donnée par
-- le jeu). Sinon : l'heure de la décision. Le match suivant devient jouable
-- à la plus tardive des fins de ses deux matchs d'origine.
--
-- Pourquoi : un clan qui gagne à 20h00 et lance son match suivant à 20h02
-- doit voir cette guerre comptée, même si le bot n'a remarqué la victoire
-- qu'à 20h05 (il passe toutes les 5 minutes).
ALTER TABLE matches ADD COLUMN finished_at TEXT;

UPDATE matches SET finished_at = updated_at WHERE status IN ('done', 'bye');
