# 🎨 Design Studio - Application Vue.js 3D + 2D

Application Vue.js permettant d'uploader des modèles 3D (.OBJ), de les visualiser avec Three.js, et d'ajouter des designs 2D avec Fabric.js qui peuvent être appliqués comme textures sur le modèle 3D.

## 📁 Structure du Projet

```
src/
├── components/
│   ├── ThreeScene.vue      # Composant pour l'affichage 3D avec Three.js
│   └── FabricDesigner.vue  # Composant pour l'édition 2D avec Fabric.js
├── DesignStudio.vue         # Composant principal qui intègre les deux
├── router.js                # Configuration Vue Router
└── main.js                  # Point d'entrée de l'application
```

## 🚀 Fonctionnalités

### 1. Upload de Modèles 3D
- Support des fichiers `.obj`
- Chargement automatique et centrage du modèle
- Éclairage optimisé pour la visualisation

### 2. Édition 2D avec Fabric.js
- **Dessin libre** : Mode dessin avec pinceau personnalisable
- **Texte** : Ajout de textes personnalisables
- **Images** : Import d'images depuis l'ordinateur
- **Formes** : Cercles et rectangles
- **Personnalisation** : Couleur et largeur du pinceau

### 3. Application de Texture
- Conversion du canvas 2D en texture Three.js
- Application de la texture sur le modèle 3D
- Mise à jour en temps réel

## 🛠️ Technologies

- **Vue 3** (Composition API)
- **Vite** (Build tool)
- **Three.js** (Rendu 3D)
- **Fabric.js** (Édition 2D)
- **Vue Router** (Navigation)

## 📦 Installation

Les dépendances sont déjà installées dans le projet. Pour démarrer :

```bash
npm run dev
```

Puis accédez à : `http://localhost:5173/design-studio`

## 🎯 Utilisation

1. **Uploader un modèle** : Cliquez sur "📁 Uploader un modèle 3D (.obj)"
2. **Créer un design** : Utilisez les outils du canvas 2D (texte, images, dessin, etc.)
3. **Appliquer** : Cliquez sur "✨ Appliquer le design sur le modèle" pour voir votre design sur le modèle 3D

## 🎨 Composants

### `ThreeScene.vue`
Composant dédié à la gestion de Three.js :
- Initialisation de la scène, caméra, rendu
- Chargement de fichiers OBJ
- Application de textures
- Contrôles OrbitControls (rotation, zoom, pan)

**Props :**
- `modelUrl` : Fichier OBJ à charger
- `texture` : Texture Three.js à appliquer

**Events :**
- `model-loaded` : Émis quand le modèle est chargé
- `model-error` : Émis en cas d'erreur

### `FabricDesigner.vue`
Composant pour l'édition 2D :
- Canvas Fabric.js avec outils d'édition
- Mode dessin libre ou mode objet
- Ajout de texte, images, formes
- Export du design

**Events :**
- `design-updated` : Émis à chaque modification du canvas

**Methods exposées :**
- `getCanvas()` : Retourne l'instance Fabric.js
- `getCanvasAsTexture()` : Convertit le canvas en texture
- `clearCanvas()` : Efface le canvas

### `DesignStudio.vue`
Composant principal qui orchestre tout :
- Gestion de l'upload de fichiers
- Intégration ThreeScene + FabricDesigner
- Application des textures
- Interface utilisateur

## 🔧 Personnalisation

### Modifier la taille du canvas
Dans `FabricDesigner.vue`, modifiez :
```javascript
const canvasWidth = 800
const canvasHeight = 600
```

### Modifier les contrôles 3D
Dans `ThreeScene.vue`, ajustez les `OrbitControls` :
```javascript
controls.enableDamping = true
controls.dampingFactor = 0.05
```

## 📝 Notes

- Le canvas Fabric.js est superposé à côté de la scène 3D
- Vous pouvez masquer/afficher le designer avec le bouton flottant
- Les textures sont appliquées en temps réel
- Le modèle 3D est automatiquement centré et dimensionné

## 🐛 Dépannage

**Le modèle ne s'affiche pas :**
- Vérifiez que le fichier est bien un `.obj` valide
- Consultez la console pour les erreurs

**La texture ne s'applique pas :**
- Assurez-vous qu'il y a du contenu sur le canvas 2D
- Vérifiez que le modèle est chargé

**Problèmes de performance :**
- Réduisez la taille du canvas Fabric.js
- Optimisez la résolution de la texture

## 🎉 Prochaines améliorations possibles

- Support de formats 3D supplémentaires (GLTF, STL)
- Export du modèle 3D avec texture
- Sauvegarde/chargement de projets
- Outils avancés d'édition (calques, filtres)
- Mapping UV personnalisé


