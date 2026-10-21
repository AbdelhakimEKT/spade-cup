# Spade Cup FR

Site des tournois de guerres amicales Clash of Clans entre clans francophones :
inscription des clans, arbre des matchs généré à la clôture, résultats et
statistiques des joueurs.

## Stack

- **Angular 22** : composants autonomes (standalone), signaux, sans zone.js
- **SCSS** avec des jetons de design en variables CSS (thèmes sombre et clair)
- **Vitest** pour les tests unitaires
- Polices Rajdhani et Inter hébergées avec le site (Fontsource)
- **Serveur** : Cloudflare Worker en TypeScript + base **D1** (SQLite), dans `api/`

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

## Serveur (`api/`)

API publique en lecture : https://spade-cup-api.popi-coc.workers.dev

| Adresse | Rôle |
|---|---|
| `GET /health` | le serveur répond-il ? |
| `GET /tournaments` | liste des tournois |
| `GET /tournaments/:slug` | un tournoi complet : clans et arbre |

Le serveur importe directement la logique du tournoi de `src/app/core/tournament/` :
une seule version des règles, partagée avec le site.

Il a son propre `package.json` (les tests Cloudflare exigent une autre version de
Vitest que le site). Installer avec **npm 11** : npm 10.9 plante sur les
dépendances optionnelles de Vitest 4.

```bash
cd api && npx npm@11 install
```

| Commande (dans `api/`) | Rôle |
|---|---|
| `npm test` | tests dans le vrai moteur des Workers, avec une base D1 jetable |
| `npm run typecheck` | vérification des types |
| `npm run dev` | serveur local sur http://localhost:8787 |
| `npm run migrate` | applique les migrations à la base de production |
| `npm run seed:demo` | (ré)installe le tournoi de démonstration en production |
| `npm run deploy` | met le serveur en ligne |

Base de données : une **migration** par évolution du schéma, dans `api/migrations/`.
On ne modifie jamais la base à la main.

