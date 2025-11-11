# 📐 Structure du Code - Organisation et Architecture

Ce document explique l'organisation du code pour faciliter la compréhension et la maintenance.

## 📁 Structure des Fichiers

```
src/
├── components/
│   ├── ThreeScene.vue          # Composant 3D (Three.js)
│   ├── FabricDesigner.vue      # Composant 2D (Fabric.js)
│   ├── MeshSelector.vue        # Sélecteur de meshes
│   └── TextureUpdater.vue      # Mise à jour des textures
├── composables/
│   ├── useCanvasTexture.js     # Gestion de la texture partagée
│   └── use3DTo2DProjection.js  # Projection 3D → 2D
├── DesignStudio.vue            # Composant principal (orchestration)
├── Home.vue                    # Page d'accueil
└── App.vue                     # Composant racine
```

## 🎯 Composants Principaux

### 1. **DesignStudio.vue** - Orchestrateur Principal

**Rôle** : Coordonne l'interaction entre les composants 2D et 3D

**Sections** :
- **Props & State** : État global de l'application
- **Configuration** : Zones de travail, dimensions
- **Event Handlers** : Gestion des événements entre composants
- **File Upload** : Gestion de l'upload de modèles 3D
- **View Management** : Basculement entre vue 2D et 3D

**Fonctions principales** :
- `handleFileUpload()` : Upload de fichiers OBJ/GLB/GLTF
- `on3DClickForPlacement()` : Placement d'éléments depuis le clic 3D
- `on3DDrag()` : Déplacement d'objets via drag 3D
- `updateAllObjectsList()` : Mise à jour de la liste des objets

---

### 2. **ThreeScene.vue** - Rendu 3D

**Rôle** : Gère l'affichage 3D avec Three.js

**Sections organisées** :

#### 📦 **IMPORTS & CONFIGURATION**
- Imports Vue, Three.js, loaders
- Props et événements

#### 🎨 **ÉTAT & VARIABLES**
- Variables Three.js (scene, camera, renderer, controls)
- État interne (meshes, textures, environnement)
- Références Vue (refs)

#### 🖼️ **AFFICHAGE & UI**
- Coordonnées du curseur
- Coordonnées de l'objet sélectionné
- Liste des objets

#### 🔧 **INITIALISATION**
- `initScene()` : Initialise la scène Three.js
- `loadEnvironmentMap()` : Charge la texture d'environnement
- `addHelperGeometry()` : Ajoute la géométrie d'aide

#### 📥 **CHARGEMENT DE MODÈLES**
- `getFileType()` : Détermine le type de fichier
- `loadModel()` : Charge OBJ/GLB/GLTF
- Configuration du modèle (scale, centrage, UVs)

#### 🎨 **GESTION DES TEXTURES**
- `setupSharedCanvasTexture()` : Configure la texture partagée
- `applyTexture()` : Applique une texture sur le modèle
- Synchronisation avec le canvas 2D

#### 📐 **GÉNÉRATION D'UVs**
- `generateUVs()` : Génère les UVs pour une géométrie
- `generateSeamlessUVs()` : Génère des UVs sans couture
- Projections : cylindrique, plane, sphérique

#### 🖱️ **INTERACTIONS 3D**
- `setupClickHandler()` : Configure les handlers de clic/drag
- `onMouseMove()` : Suivi du curseur
- `onCanvasClick()` : Gestion des clics
- `onMouseWheel()` : Redimensionnement avec molette

#### ✨ **FONCTIONNALITÉS SPÉCIALES**
- `createSeamlessGoblet()` : Crée un gobelet sans couture
- `highlightMesh()` : Mise en évidence de meshes
- `setActiveMesh()` : Définit le mesh actif

#### 🧹 **NETTOYAGE**
- `cleanup()` : Nettoyage des ressources

---

### 3. **FabricDesigner.vue** - Édition 2D

**Rôle** : Gère le canvas 2D avec Fabric.js

**Sections organisées** :

#### 📦 **IMPORTS & CONFIGURATION**
- Imports Vue, Fabric.js
- Props et événements

#### 🎨 **ÉTAT & VARIABLES**
- Canvas Fabric.js
- Mode de dessin (draw mode, placement mode)
- Historique (undo/redo)
- Wrap-around system

#### 🖼️ **INITIALISATION**
- `initCanvas()` : Initialise le canvas Fabric.js
- Configuration des événements
- Zones de travail

#### ✏️ **OUTILS DE DESSIN**
- `toggleDrawMode()` : Active/désactive le mode dessin
- `updateBrush()` : Met à jour le pinceau
- `clearCanvas()` : Efface le canvas

#### 📝 **AJOUT D'ÉLÉMENTS**
- `addText()` : Ajoute du texte
- `addImage()` : Ajoute une image
- `addCircle()` : Ajoute un cercle
- `addRectangle()` : Ajoute un rectangle

#### 📍 **PLACEMENT D'ÉLÉMENTS**
- `activatePlacementMode()` : Active le mode placement
- `placeElementAt()` : Place un élément à une position
- `placeCircleAt()`, `placeRectangleAt()`, etc.

#### 🔄 **WRAP-AROUND SYSTEM**
- `updateWrapAround()` : Met à jour les copies wrap-around
- `createWrapAroundCopies()` : Crée les copies
- `removeWrapAroundCopies()` : Supprime les copies

#### 📜 **HISTORIQUE (UNDO/REDO)**
- `saveHistory()` : Sauvegarde l'état
- `undo()` : Annule
- `redo()` : Refait

#### 🎨 **FONCTIONNALITÉS SPÉCIALES**
- `addGreenBand()` : Ajoute une bande verte
- `addSeamLine()` : Affiche/masque la couture
- `addSeamPoint()` : Ajoute un point vert sur la couture

#### 📤 **EXPORT**
- `getCanvasAsTexture()` : Convertit le canvas en texture
- `exportDesign()` : Exporte le design

---

## 🔄 Flux de Données

### Synchronisation 2D → 3D

```
FabricDesigner (Canvas 2D)
    ↓ (modification)
requestTextureUpdate()
    ↓
useCanvasTextureStore (store réactif)
    ↓ (flag render2D = true)
ThreeScene (boucle d'animation)
    ↓ (détecte le flag)
texture.needsUpdate = true
    ↓
Texture appliquée sur le modèle 3D
```

### Interaction 3D → 2D

```
Clic sur modèle 3D
    ↓
Raycaster détecte l'intersection
    ↓
Coordonnées UV (u, v)
    ↓
project3DClickToCanvas()
    ↓
Coordonnées Canvas 2D (x, y)
    ↓
Événement '3d-click' émis
    ↓
DesignStudio.on3DClickForPlacement()
    ↓
FabricDesigner.placeElementAt()
    ↓
Objet placé sur le canvas 2D
```

---

## 📋 Conventions de Nommage

### Variables
- **camelCase** : Variables et fonctions (`canvasWidth`, `loadModel`)
- **PascalCase** : Composants et classes (`ThreeScene`, `FabricDesigner`)
- **UPPER_CASE** : Constantes (`MAX_HISTORY_SIZE`)

### Préfixes pour les fonctions
- `init*` : Initialisation (`initScene`, `initCanvas`)
- `setup*` : Configuration (`setupClickHandler`, `setupSharedCanvasTexture`)
- `load*` : Chargement (`loadModel`, `loadEnvironmentMap`)
- `create*` : Création (`createSeamlessGoblet`, `createWrapAroundCopies`)
- `update*` : Mise à jour (`updateBrush`, `updateAllObjectsList`)
- `handle*` : Gestion d'événements (`handleFileUpload`, `handleResize`)
- `on*` : Handlers d'événements (`onMouseMove`, `on3DClick`)

---

## 🎯 Points d'Entrée Principaux

### Pour ajouter une nouvelle fonctionnalité :

1. **Fonctionnalité 2D** → `FabricDesigner.vue`
   - Ajouter dans la section appropriée
   - Émettre les événements nécessaires

2. **Fonctionnalité 3D** → `ThreeScene.vue`
   - Ajouter dans la section appropriée
   - Émettre les événements nécessaires

3. **Orchestration** → `DesignStudio.vue`
   - Connecter les événements
   - Gérer l'état global

---

## 📚 Documentation Complémentaire

- `SYNCHRONISATION_EXPLICATION.md` : Détails sur la synchronisation
- `RELATION_DIMENSIONS_CANVAS.md` : Relation entre dimensions 2D/3D
- `EDITION_DIRECTE_GUIDE.md` : Guide d'édition directe

---

## 🔍 Comment Trouver une Fonctionnalité

### Exemple : "Comment fonctionne le placement d'éléments ?"

1. **Point d'entrée** : `DesignStudio.vue` → `on3DClickForPlacement()`
2. **Événement 3D** : `ThreeScene.vue` → `onCanvasClick()` → émet `3d-click`
3. **Projection** : `use3DTo2DProjection.js` → `project3DClickToCanvas()`
4. **Placement** : `FabricDesigner.vue` → `placeElementAt()`
5. **Synchronisation** : `useCanvasTexture.js` → `requestTextureUpdate()`

---

## ✅ Checklist pour Ajouter une Fonctionnalité

- [ ] Identifier le composant approprié (2D ou 3D)
- [ ] Ajouter la fonction dans la bonne section
- [ ] Ajouter les commentaires JSDoc
- [ ] Émettre les événements nécessaires
- [ ] Mettre à jour les props/events si nécessaire
- [ ] Tester la synchronisation 2D ↔ 3D
- [ ] Documenter dans ce fichier si c'est une fonctionnalité majeure

