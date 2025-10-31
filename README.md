# Fabric.js Playground - Vue.js

Un terrain d'entraînement pour Fabric.js avec Vue.js 3 et Vite.

## Installation

```bash
npm install
```

## Démarrer le serveur de développement

```bash
npm run dev
```

Le projet sera accessible à `http://localhost:5173`

## Build pour la production

```bash
npm run build
```

Les fichiers de production seront dans le dossier `dist/`.

## Prévisualiser le build de production

```bash
npm run preview
```

## Fonctions incluses

- Ajout de rectangle, cercle, texte
- Effacer le canvas
- Export / Import JSON
- Zoom avec la molette
- Pan en maintenant la barre d'espace

## Structure du projet

```
fabric-playground/
├── src/
│   ├── App.vue          # Composant principal Vue
│   └── main.js          # Point d'entrée de l'application
├── index.html           # Point d'entrée HTML pour Vite
├── package.json         # Dépendances du projet
├── vite.config.js       # Configuration Vite
└── README.md
```

## Technologies utilisées

- Vue.js 3 (Composition API)
- Vite
- Fabric.js (via CDN)
