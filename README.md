# Spade Cup FR

Site des tournois de guerres amicales Clash of Clans entre clans francophones :
inscription des clans, arbre des matchs généré à la clôture, résultats et
statistiques des joueurs.

## Stack

- **Angular 22** : composants autonomes (standalone), signaux, sans zone.js
- **SCSS** avec des jetons de design en variables CSS (thèmes sombre et clair)
- **Vitest** pour les tests unitaires
- Polices Rajdhani et Inter hébergées avec le site (Fontsource)

## Commandes

| Commande | Rôle |
|---|---|
| `npm start` | serveur de développement sur http://localhost:4200 |
| `npm test` | tests unitaires (Vitest) |
| `npm run build` | version de production dans `dist/` |
| `npx ng generate component features/x/y` | créer un composant |

## Organisation

```
src/
├─ styles/              jetons de design (_tokens), base globale (_base)
├─ app/
│  ├─ app.ts / app.html  coquille : en-tête, contenu, pied de page
│  ├─ app.routes.ts      plan du site, pages chargées à la demande
│  ├─ app.config.ts      configuration globale (routeur, titres)
│  ├─ core/              services uniques : thème, titre des pages, réglages
│  ├─ layout/            en-tête et pied de page
│  └─ features/          un dossier par domaine : accueil, tournois, clans, joueurs
public/                  fichiers servis tels quels : logos, favicon
```

Les règles de code suivies sont dans `CLAUDE.md` (bonnes pratiques officielles d'Angular 22).
