# 📚 Documentation Complète du Système de Rotation

Bienvenue dans la documentation complète du système de rotation des éléments dans l'application 3D.

---

## 🎯 Objectif de cette Documentation

Cette documentation explique **en détail** comment fonctionne le système de rotation des éléments (images, texte, formes) affichés sur un modèle 3D. Elle couvre tous les aspects techniques, mathématiques et pratiques du système.

---

## 📖 Documents Disponibles

Cette documentation est divisée en **4 documents** complémentaires:

### 1. 📘 ROTATION_EXPLICATION.md
**Explication Détaillée du Système de Rotation**

**Contenu**:
- Vue d'ensemble du système
- Architecture et composants impliqués
- Variables clés et leur rôle
- Flux de fonctionnement complet
- Algorithmes mathématiques détaillés
- Gestion des événements
- Cas particuliers et optimisations

**Pour qui**: Développeurs qui veulent comprendre le système en profondeur

**Commencer par**: [ROTATION_EXPLICATION.md](./ROTATION_EXPLICATION.md)

---

### 2. 🎨 ROTATION_GUIDE_VISUEL.md
**Guide Visuel avec Diagrammes**

**Contenu**:
- Diagrammes de flux
- Illustrations ASCII
- Exemples concrets avec valeurs numériques
- Timeline d'une rotation complète
- Machine à états
- Gestion des erreurs et cas limites

**Pour qui**: Développeurs qui préfèrent les explications visuelles

**Commencer par**: [ROTATION_GUIDE_VISUEL.md](./ROTATION_GUIDE_VISUEL.md)

---

### 3. 📍 ROTATION_INDEX_FICHIERS.md
**Index des Fichiers et Lignes de Code**

**Contenu**:
- Liste complète des fichiers concernés
- Numéros de lignes précis pour chaque section
- Extraits de code commentés
- Checklist pour les modifications
- Points de débogage recommandés

**Pour qui**: Développeurs qui veulent modifier ou déboguer le code

**Commencer par**: [ROTATION_INDEX_FICHIERS.md](./ROTATION_INDEX_FICHIERS.md)

---

### 4. 📝 README_ROTATION.md (ce document)
**Point d'Entrée et Vue d'Ensemble**

**Contenu**:
- Vue d'ensemble de la documentation
- Guide de démarrage rapide
- FAQ
- Glossaire des termes

**Pour qui**: Tout le monde, pour commencer

---

## 🚀 Guide de Démarrage Rapide

### Vous voulez comprendre rapidement comment ça marche ?

1. **Lisez d'abord**: [Vue d'ensemble](#vue-densemble-rapide) (ci-dessous)
2. **Ensuite**: Consultez les [diagrammes visuels](./ROTATION_GUIDE_VISUEL.md#1-vue-densemble-du-système)
3. **Enfin**: Explorez le [code détaillé](./ROTATION_INDEX_FICHIERS.md)

---

## 📊 Vue d'Ensemble Rapide

### Comment fonctionne la rotation en 5 étapes:

```
1. CLIC
   └─ L'utilisateur clique sur le contrôle mtr (poignée de rotation)

2. DÉTECTION
   └─ Le système vérifie que le clic est bien sur le mtr (distance ≤ 10px)

3. CALCUL
   └─ Pendant le mouvement de la souris, on calcule l'angle de rotation
      en utilisant atan2 et le centre géométrique de l'objet

4. APPLICATION
   └─ L'angle calculé est envoyé au composant parent qui applique
      la rotation à l'objet Fabric.js

5. FIN
   └─ Au relâchement de la souris, on finalise et on réinitialise
```

### Formules clés:

```javascript
// Distance entre deux points
distance = √[(x₂-x₁)² + (y₂-y₁)²]

// Angle d'un vecteur
angle = atan2(dy, dx) × (180/π)

// Différence d'angle normalisée
angleDelta = currentAngle - startAngle
if (angleDelta > 180) angleDelta -= 360
if (angleDelta < -180) angleDelta += 360
```

---

## 🔑 Concepts Clés

### 1. Le contrôle mtr (middle-top-rotate)
- **Qu'est-ce que c'est**: Une petite poignée au-dessus de l'élément sélectionné
- **À quoi ça sert**: Permet de faire tourner l'élément autour de son centre
- **Comment on le détecte**: En calculant la distance entre le curseur et le mtr

### 2. Le centre géométrique
- **Qu'est-ce que c'est**: Le point autour duquel l'objet tourne
- **Comment on le calcule**: Intersection des deux diagonales de l'objet
- **Pourquoi c'est important**: Il ne change pas pendant la rotation

### 3. L'angle de rotation
- **Comment on le calcule**: Avec la fonction `atan2` qui donne l'angle d'un vecteur
- **Unité**: Degrés (conversion depuis radians)
- **Normalisation**: Entre -180° et 180° pour éviter les sauts

### 4. Les événements
- **3d-rotation-start**: Début de la rotation
- **3d-rotation**: Rotation en cours (émis à chaque frame)
- **3d-rotation-end**: Fin de la rotation

---

## 📂 Structure des Fichiers

```
/src
├── components
│   └── ThreeScene.vue          ← Fichier principal (détection et calcul)
├── composables
│   ├── use3DTo2DProjection.js  ← Conversion 3D → 2D
│   └── use2DTo3DProjection.js  ← Conversion 2D → 3D
└── DesignStudio.vue            ← Composant parent (application de la rotation)

/docs (cette documentation)
├── README_ROTATION.md          ← Point d'entrée (ce fichier)
├── ROTATION_EXPLICATION.md     ← Explication détaillée
├── ROTATION_GUIDE_VISUEL.md    ← Guide visuel
└── ROTATION_INDEX_FICHIERS.md  ← Index des fichiers
```

---

## ❓ FAQ (Questions Fréquentes)

### Q1: Pourquoi utilise-t-on l'intersection des diagonales pour le centre ?
**R**: Parce que cette méthode fonctionne même après rotation. Le centre calculé avec `left + width/2` ne serait correct que pour un objet non tourné.

### Q2: Pourquoi normalise-t-on l'angle entre -180° et 180° ?
**R**: Pour éviter les sauts brusques. Par exemple, passer de 170° à -170° représente une rotation de 20°, pas de 340°.

### Q3: Pourquoi y a-t-il un délai de protection de 100ms ?
**R**: Pour éviter qu'un relâchement de souris après rotation soit immédiatement détecté comme un nouveau clic.

### Q4: Que se passe-t-il si les diagonales sont parallèles ?
**R**: C'est un cas très rare. On utilise alors un fallback qui calcule la moyenne des 4 coins.

### Q5: Pourquoi désactive-t-on OrbitControls pendant la rotation ?
**R**: Pour éviter que la caméra ne tourne en même temps que l'objet, ce qui serait déroutant pour l'utilisateur.

### Q6: Comment modifier le seuil de détection du mtr ?
**R**: Modifiez la variable `clickThreshold` (ligne ~984 dans ThreeScene.vue). Valeur actuelle: 10 pixels.

### Q7: Peut-on avoir plusieurs objets en rotation simultanément ?
**R**: Non, le système ne gère qu'une seule rotation à la fois (un seul objet sélectionné).

### Q8: Comment déboguer une rotation qui ne fonctionne pas ?
**R**: Consultez la section [Débogage](./ROTATION_INDEX_FICHIERS.md#-débogage) dans l'index des fichiers.

---

## 🎓 Glossaire

### Termes Techniques

**mtr (middle-top-rotate)**
- Contrôle de rotation situé au-dessus de l'élément sélectionné
- Permet de faire tourner l'élément autour de son centre

**Raycasting**
- Technique pour détecter les intersections entre un rayon (clic de souris) et un objet 3D
- Utilisé pour convertir un clic 2D en coordonnées 3D

**Coordonnées UV**
- Système de coordonnées normalisées (0-1) pour mapper une texture sur un modèle 3D
- U = coordonnée horizontale, V = coordonnée verticale

**atan2**
- Fonction mathématique qui calcule l'angle d'un vecteur
- Retourne un angle en radians entre -π et π

**OrbitControls**
- Contrôles Three.js qui permettent de faire tourner, zoomer et déplacer la caméra
- Désactivés pendant la rotation pour éviter les conflits

**Fabric.js**
- Bibliothèque JavaScript pour manipuler des objets sur un canvas HTML5
- Utilisée pour le canvas 2D dans l'application

**Centre géométrique**
- Point central d'un objet, calculé comme l'intersection de ses diagonales
- Ne change pas pendant la rotation

**Normalisation d'angle**
- Processus pour ramener un angle dans l'intervalle [-180°, 180°]
- Évite les sauts brusques dans la rotation

---

### Variables Clés

**isRotating3D**
- Type: Boolean
- Indique si une rotation est actuellement en cours

**rotationStartPosition**
- Type: Object {x, y} | null
- Position initiale du contrôle mtr au moment du clic

**rotationStartCursor**
- Type: Object {x, y} | null
- Position initiale du curseur au moment du clic

**rotationJustEnded**
- Type: Boolean
- Flag de protection anti-rebond

**rotationEndTime**
- Type: Number (timestamp)
- Moment où la rotation s'est terminée

---

## 🛠️ Cas d'Usage Pratiques

### Cas 1: Ajouter un indicateur visuel pendant la rotation

**Fichier**: `ThreeScene.vue`

**Où**: Dans la fonction `onMouseMove`, après l'émission de `'3d-rotation'`

**Code à ajouter**:
```javascript
// Changer le curseur pendant la rotation
if (renderer && renderer.domElement) {
  renderer.domElement.style.cursor = 'grabbing'
}
```

---

### Cas 2: Limiter la rotation à des angles spécifiques (ex: 15°)

**Fichier**: `DesignStudio.vue`

**Où**: Dans le handler `handleRotation`

**Code à modifier**:
```javascript
const handleRotation = (data) => {
  if (selectedObject) {
    // Arrondir l'angle à des multiples de 15°
    const snapAngle = 15
    const snappedAngle = Math.round(data.angle / snapAngle) * snapAngle
    
    selectedObject.set('angle', snappedAngle)
    canvas.renderAll()
  }
}
```

---

### Cas 3: Afficher l'angle en temps réel

**Fichier**: `DesignStudio.vue`

**Où**: Dans le handler `handleRotation`

**Code à ajouter**:
```javascript
const handleRotation = (data) => {
  // Afficher l'angle dans la console
  console.log(`Rotation: ${data.angle.toFixed(1)}°`)
  
  // Ou dans l'interface
  rotationAngleDisplay.value = data.angle.toFixed(1)
  
  // Appliquer la rotation
  if (selectedObject) {
    selectedObject.rotate(data.angle)
    canvas.renderAll()
  }
}
```

---

## 📊 Métriques et Performances

### Seuils de Détection

| Paramètre | Valeur | Fichier | Ligne |
|-----------|--------|---------|-------|
| Clic sur mtr | 10 pixels | ThreeScene.vue | ~984 |
| Hover sur mtr | 20 pixels | ThreeScene.vue | ~1166 |
| Délai anti-rebond | 100 ms | ThreeScene.vue | ~971 |
| Délai de réinitialisation | 200 ms | ThreeScene.vue | ~1333 |

### Fréquence des Événements

- **3d-rotation-start**: 1 fois au début
- **3d-rotation**: À chaque frame (~60 fois par seconde)
- **3d-rotation-end**: 1 fois à la fin

### Complexité Algorithmique

- **Détection du clic**: O(1) - calcul de distance simple
- **Calcul du centre**: O(1) - formule mathématique directe
- **Calcul de l'angle**: O(1) - fonction atan2
- **Normalisation**: O(1) - comparaisons simples

---

## 🔄 Workflow de Développement

### Pour ajouter une nouvelle fonctionnalité:

1. **Comprendre le système actuel**
   - Lire [ROTATION_EXPLICATION.md](./ROTATION_EXPLICATION.md)
   - Consulter [ROTATION_GUIDE_VISUEL.md](./ROTATION_GUIDE_VISUEL.md)

2. **Identifier les fichiers à modifier**
   - Consulter [ROTATION_INDEX_FICHIERS.md](./ROTATION_INDEX_FICHIERS.md)

3. **Implémenter les changements**
   - Modifier le code dans `ThreeScene.vue`
   - Mettre à jour les handlers dans `DesignStudio.vue`

4. **Tester**
   - Tester avec différents types d'objets
   - Tester les cas limites (angles extrêmes, clics rapides, etc.)

5. **Documenter**
   - Mettre à jour cette documentation si nécessaire

---

## 🐛 Débogage Rapide

### Problème: La rotation ne se déclenche pas

**Vérifications**:
1. ✅ Un objet est-il sélectionné ?
2. ✅ Le contrôle mtr existe-t-il ?
3. ✅ La distance curseur ↔ mtr est-elle ≤ 10px ?
4. ✅ Le délai de protection est-il écoulé ?

**Console**:
```javascript
console.log('selectedObjectCoords:', selectedObjectCoords.value)
console.log('distance:', distance)
console.log('rotationJustEnded:', rotationJustEnded)
```

---

### Problème: L'angle calculé est incorrect

**Vérifications**:
1. ✅ Le centre géométrique est-il correct ?
2. ✅ Les vecteurs sont-ils bien calculés ?
3. ✅ La normalisation fonctionne-t-elle ?

**Console**:
```javascript
console.log('centerX, centerY:', centerX, centerY)
console.log('startAngle:', startAngle)
console.log('currentAngle:', currentAngle)
console.log('angleDelta:', angleDelta)
```

---

### Problème: La rotation continue après le relâchement

**Vérifications**:
1. ✅ L'événement `mouseup` est-il bien capturé ?
2. ✅ `isRotating3D` est-il bien réinitialisé ?

**Console**:
```javascript
console.log('isRotating3D:', isRotating3D)
console.log('rotationStartPosition:', rotationStartPosition)
```

---

## 📚 Ressources Supplémentaires

### Documentation Three.js
- [Raycaster](https://threejs.org/docs/#api/en/core/Raycaster)
- [OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls)

### Documentation Fabric.js
- [Object Rotation](http://fabricjs.com/docs/fabric.Object.html#rotate)
- [Object Transformations](http://fabricjs.com/docs/fabric.Object.html#setCoords)

### Mathématiques
- [atan2 sur Wikipedia](https://fr.wikipedia.org/wiki/Atan2)
- [Intersection de segments](https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection)

---

## 📝 Historique des Versions

### Version 1.0 (2025-11-19)
- ✅ Documentation initiale complète
- ✅ Commentaires détaillés dans le code
- ✅ 4 documents complémentaires
- ✅ Exemples et diagrammes

---

## 👥 Contributeurs

Cette documentation a été créée pour expliquer le système de rotation implémenté dans `ThreeScene.vue`.

---

## 📞 Support

Pour toute question ou problème:
1. Consultez d'abord la [FAQ](#-faq-questions-fréquentes)
2. Vérifiez le [guide de débogage](#-débogage-rapide)
3. Consultez l'[index des fichiers](./ROTATION_INDEX_FICHIERS.md) pour les détails techniques

---

## 🎯 Prochaines Étapes

Maintenant que vous avez lu ce document, voici ce que vous pouvez faire:

### Pour comprendre le système:
→ Lire [ROTATION_EXPLICATION.md](./ROTATION_EXPLICATION.md)

### Pour voir des exemples visuels:
→ Consulter [ROTATION_GUIDE_VISUEL.md](./ROTATION_GUIDE_VISUEL.md)

### Pour modifier le code:
→ Utiliser [ROTATION_INDEX_FICHIERS.md](./ROTATION_INDEX_FICHIERS.md)

---

**Bonne lecture ! 📖**

---

**Document créé le**: 2025-11-19  
**Dernière mise à jour**: 2025-11-19  
**Version**: 1.0
