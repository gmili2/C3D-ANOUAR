# 📍 Index des Fichiers - Système de Rotation

Ce document liste tous les fichiers et les lignes de code concernés par le système de rotation.

---

## 📂 Fichier Principal: ThreeScene.vue

**Chemin**: `/src/components/ThreeScene.vue`

### 1. Déclaration des variables de rotation

**Lignes**: 746-794

```javascript
// Variables d'état pour la rotation
let isRotating3D = false
let rotationStartPosition = null
let rotationStartCursor = null
let rotationStartAngle = null
let rotationJustEnded = false
let rotationEndTime = 0
```

**Description**: Déclaration et documentation de toutes les variables utilisées pour gérer l'état de la rotation.

---

### 2. Fonction resetRotationState()

**Lignes**: 796-862

```javascript
const resetRotationState = () => {
  // Réinitialise complètement l'état de rotation
  if (isRotating3D) {
    emit('3d-rotation-end')
  }
  isRotating3D = false
  rotationStartPosition = null
  rotationStartCursor = null
  rotationStartAngle = null
  rotationJustEnded = false
  rotationEndTime = 0
  
  // Restaurer le curseur et les contrôles
  if (renderer && renderer.domElement) {
    const defaultCursor = props.dragMode ? 'move' : 'default'
    renderer.domElement.style.setProperty('cursor', defaultCursor, 'important')
  }
  
  if (controls) {
    controls.enabled = true
  }
}
```

**Description**: Fonction pour réinitialiser complètement l'état de rotation. Appelée lors du changement de vue ou de la désélection d'un objet.

---

### 3. Détection du clic sur le mtr (onMouseDown)

**Lignes**: 968-1078

**Sections importantes**:

#### 3.1. Vérification si rotation déjà active
**Lignes**: 930-966

```javascript
if (isRotating3D) {
  // Vérifier si on clique toujours sur le mtr
  // Sinon, désactiver la rotation
}
```

#### 3.2. Détection du clic sur le mtr
**Lignes**: 968-1078

```javascript
// Calculer le temps écoulé depuis la dernière rotation
const timeSinceRotationEnd = Date.now() - rotationEndTime
const minTimeBetweenRotationAndDrag = 100

// Vérifier les conditions
if (!rotationJustEnded && 
    timeSinceRotationEnd > minTimeBetweenRotationAndDrag && 
    selectedObjectCoords.value.show && 
    selectedObjectCoords.value.controls && 
    selectedObjectCoords.value.controls.mtr) {
  
  // Récupérer les positions
  const mtrX = selectedObjectCoords.value.controls.mtr.x
  const mtrY = selectedObjectCoords.value.controls.mtr.y
  const cursorX = canvasCoords.x
  const cursorY = canvasCoords.y
  
  // Calculer la distance
  const distance = Math.sqrt(
    Math.pow(cursorX - mtrX, 2) + 
    Math.pow(cursorY - mtrY, 2)
  )
  
  // Vérifier la proximité
  const clickThreshold = 10
  if (distance <= clickThreshold) {
    // ACTIVER LA ROTATION
    isRotating3D = true
    rotationJustEnded = false
    rotationStartPosition = { x: mtrX, y: mtrY }
    rotationStartCursor = { x: cursorX, y: cursorY }
    
    // Désactiver OrbitControls
    if (controls) {
      controls.enabled = false
    }
    
    // Émettre l'événement de début
    emit('3d-rotation-start', {
      canvasX: canvasCoords.x,
      canvasY: canvasCoords.y,
      mtrCoords: selectedObjectCoords.value.controls.mtr
    })
    
    return // Ne pas continuer avec le drag normal
  }
}
```

**Description**: Détecte si l'utilisateur clique sur le contrôle de rotation (mtr). Si oui, active le mode rotation.

---

### 4. Calcul de l'angle pendant le mouvement (onMouseMove)

**Lignes**: 1207-1343

**Sections importantes**:

#### 4.1. Vérification des conditions
**Lignes**: 1207-1230

```javascript
if (isRotating3D && 
    canvasCoords !== null && 
    rotationStartPosition && 
    rotationStartCursor && 
    selectedObjectCoords.value.show) {
  // Calcul de l'angle
}
```

#### 4.2. Calcul du centre géométrique
**Lignes**: 1231-1302

**Méthode 1: Intersection des diagonales**
```javascript
if (controls.tl && controls.tr && controls.bl && controls.br) {
  // Extraire les coordonnées des 4 coins
  const x1 = controls.tl.x, y1 = controls.tl.y
  const x2 = controls.br.x, y2 = controls.br.y
  const x3 = controls.tr.x, y3 = controls.tr.y
  const x4 = controls.bl.x, y4 = controls.bl.y
  
  // Calculer le dénominateur
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  
  if (Math.abs(denom) > 0.001) {
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    centerX = x1 + t * (x2 - x1)
    centerY = y1 + t * (y2 - y1)
  } else {
    // Fallback: moyenne des 4 coins
    centerX = (x1 + x2 + x3 + x4) / 4
    centerY = (y1 + y2 + y3 + y4) / 4
  }
}
```

**Méthode 2: Calcul via dimensions (fallback)**
```javascript
else {
  const originX = selectedObjectCoords.value.originX || 'left'
  const originY = selectedObjectCoords.value.originY || 'top'
  const objLeft = selectedObjectCoords.value.left || 0
  const objTop = selectedObjectCoords.value.top || 0
  const objWidth = selectedObjectCoords.value.width || 0
  const objHeight = selectedObjectCoords.value.height || 0
  
  // Ajuster selon l'origine
  let actualLeft = objLeft
  let actualTop = objTop
  
  if (originX === 'center') {
    actualLeft = objLeft - objWidth / 2
  } else if (originX === 'right') {
    actualLeft = objLeft - objWidth
  }
  
  if (originY === 'center') {
    actualTop = objTop - objHeight / 2
  } else if (originY === 'bottom') {
    actualTop = objTop - objHeight
  }
  
  centerX = actualLeft + objWidth / 2
  centerY = actualTop + objHeight / 2
}
```

#### 4.3. Calcul des angles
**Lignes**: 1304-1326

```javascript
// Calculer les vecteurs
const startDx = rotationStartCursor.x - centerX
const startDy = rotationStartCursor.y - centerY
const currentDx = canvasCoords.x - centerX
const currentDy = canvasCoords.y - centerY

// Calculer les angles en degrés
const startAngle = Math.atan2(startDy, startDx) * (180 / Math.PI)
const currentAngle = Math.atan2(currentDy, currentDx) * (180 / Math.PI)

// Calculer la différence d'angle
let angleDelta = currentAngle - startAngle

// Normaliser entre -180° et 180°
if (angleDelta > 180) angleDelta -= 360
if (angleDelta < -180) angleDelta += 360
```

#### 4.4. Émission de l'événement
**Lignes**: 1327-1343

```javascript
emit('3d-rotation', {
  canvasX: canvasCoords.x,
  canvasY: canvasCoords.y,
  angle: angleDelta,
  mtrCoords: rotationStartPosition
})
```

**Description**: Calcule l'angle de rotation en temps réel pendant le mouvement de la souris et émet l'événement correspondant.

---

### 5. Fin de la rotation (onMouseUp)

**Lignes**: 1311-1335

```javascript
const onMouseUp = (event) => {
  if (isRotating3D) {
    // Émettre l'événement de fin
    emit('3d-rotation-end')
    
    // Réinitialiser les variables
    isRotating3D = false
    rotationStartPosition = null
    rotationStartCursor = null
    rotationJustEnded = true
    rotationEndTime = Date.now()
    
    // Restaurer le curseur
    if (renderer && renderer.domElement) {
      const defaultCursor = props.dragMode ? 'move' : 'default'
      renderer.domElement.style.setProperty('cursor', defaultCursor, 'important')
    }
    
    // Réactiver OrbitControls
    if (controls) {
      controls.enabled = true
    }
    
    // Réinitialiser le flag après un délai
    setTimeout(() => {
      rotationJustEnded = false
    }, 200)
  }
  
  // ... (gestion du drag et resize)
}
```

**Description**: Gère la fin de la rotation lorsque l'utilisateur relâche la souris.

---

### 6. Détection de proximité du mtr (onMouseMove - hover)

**Lignes**: 1155-1178

```javascript
// Comparer les coordonnées du curseur avec le mtr
if (selectedObjectCoords.value.show && 
    selectedObjectCoords.value.controls && 
    selectedObjectCoords.value.controls.mtr) {
  
  const mtrX = selectedObjectCoords.value.controls.mtr.x
  const mtrY = selectedObjectCoords.value.controls.mtr.y
  const cursorX = canvasCoords.x
  const cursorY = canvasCoords.y
  
  // Calculer la distance
  const distance = Math.sqrt(
    Math.pow(cursorX - mtrX, 2) + 
    Math.pow(cursorY - mtrY, 2)
  )
  
  // Seuil de proximité pour le hover
  const proximityThreshold = 20
  
  if (distance <= proximityThreshold) {
    if (!isNearRotationHandle.value) {
      isNearRotationHandle.value = true
    }
  } else {
    isNearRotationHandle.value = false
  }
} else {
  isNearRotationHandle.value = false
}
```

**Description**: Détecte si le curseur est proche du mtr (hover) pour afficher un indicateur visuel.

---

### 7. Événements émis

**Lignes**: 354-373

```javascript
const emit = defineEmits([
  // ... autres événements
  '3d-rotation-click',  // Clic sur le contrôle de rotation (mtr)
  '3d-rotation-start',  // Début de la rotation depuis le mtr
  '3d-rotation',        // Rotation en cours depuis le mtr
  '3d-rotation-end'     // Fin de la rotation depuis le mtr
])
```

**Description**: Déclaration des événements émis par le composant pour la rotation.

---

### 8. Variables réactives pour l'affichage

**Lignes**: 417-426

```javascript
const coordinatesDisplay = ref({
  show: false,
  uvU: 0,
  uvV: 0,
  canvasX: 0,
  canvasY: 0,
  worldPos: null,
  isOnSeam: false,
  isOnRotationHandle: false  // Flag pour le contrôle de rotation
})
```

**Lignes**: 450-451

```javascript
// État pour indiquer si on est proche du contrôle de rotation
const isNearRotationHandle = ref(false)
```

**Description**: Variables réactives pour afficher les informations de rotation dans l'interface.

---

### 9. Template - Affichage des informations

**Lignes**: 82-85

```vue
<div v-if="selectedObjectCoords.angle" class="coord-section">
  <div class="coord-label">Rotation:</div>
  <div class="coord-value">{{ selectedObjectCoords.angle.toFixed(1) }}°</div>
</div>
```

**Lignes**: 90-92

```vue
<div v-if="isNearRotationHandle" class="coord-section rotation-active-indicator">
  <div class="coord-label">🔄 Rotation Active</div>
</div>
```

**Description**: Affichage de l'angle de rotation et de l'indicateur de proximité du mtr.

---

## 📂 Fichier Parent: DesignStudio.vue

**Chemin**: `/src/DesignStudio.vue`

### 1. Gestion des événements de rotation

**Rechercher les lignes contenant**:
- `@3d-rotation-start`
- `@3d-rotation`
- `@3d-rotation-end`

**Exemple de code attendu**:

```vue
<ThreeScene
  @3d-rotation-start="handleRotationStart"
  @3d-rotation="handleRotation"
  @3d-rotation-end="handleRotationEnd"
/>
```

```javascript
const handleRotationStart = (data) => {
  // Préparer l'objet pour la rotation
  console.log('Rotation commence', data)
}

const handleRotation = (data) => {
  // Appliquer la rotation
  if (selectedObject) {
    // Calculer le nouvel angle
    const currentAngle = selectedObject.angle || 0
    const newAngle = currentAngle + data.angle
    
    // Appliquer la rotation
    selectedObject.set('angle', newAngle)
    canvas.renderAll()
  }
}

const handleRotationEnd = () => {
  // Finaliser la rotation
  console.log('Rotation terminée')
}
```

---

## 📂 Fichiers de Composables

### 1. use3DTo2DProjection.js

**Chemin**: `/src/composables/use3DTo2DProjection.js`

**Fonction utilisée**: `project3DClickToCanvas`

**Description**: Convertit les coordonnées 3D (UV) en coordonnées 2D (pixels sur le canvas).

---

### 2. use2DTo3DProjection.js

**Chemin**: `/src/composables/use2DTo3DProjection.js`

**Fonction utilisée**: `get3DPositionFromUV`

**Description**: Convertit les coordonnées 2D (pixels) en coordonnées 3D (UV).

---

## 📊 Résumé des Lignes de Code

| Fichier | Section | Lignes | Description |
|---------|---------|--------|-------------|
| ThreeScene.vue | Variables | 746-794 | Déclaration des variables de rotation |
| ThreeScene.vue | resetRotationState | 796-862 | Fonction de réinitialisation |
| ThreeScene.vue | onMouseDown | 968-1078 | Détection du clic sur mtr |
| ThreeScene.vue | onMouseMove (calcul) | 1207-1343 | Calcul de l'angle de rotation |
| ThreeScene.vue | onMouseMove (hover) | 1155-1178 | Détection de proximité du mtr |
| ThreeScene.vue | onMouseUp | 1311-1335 | Fin de la rotation |
| ThreeScene.vue | Événements | 354-373 | Déclaration des événements |
| ThreeScene.vue | Variables réactives | 417-426, 450-451 | Affichage des informations |
| ThreeScene.vue | Template | 82-85, 90-92 | Affichage dans l'interface |
| DesignStudio.vue | Handlers | À rechercher | Gestion des événements |

---

## 🔍 Comment Naviguer dans le Code

### Pour comprendre la détection du clic:
1. Ouvrir `ThreeScene.vue`
2. Aller à la ligne **968**
3. Lire la section **"DÉTECTION DU CLIC SUR LE CONTRÔLE DE ROTATION (mtr)"**

### Pour comprendre le calcul de l'angle:
1. Ouvrir `ThreeScene.vue`
2. Aller à la ligne **1207**
3. Lire la section **"CALCUL DE L'ANGLE DE ROTATION PENDANT LE MOUVEMENT"**

### Pour comprendre la réinitialisation:
1. Ouvrir `ThreeScene.vue`
2. Aller à la ligne **796**
3. Lire la fonction **`resetRotationState()`**

---

## 📝 Checklist pour Modifier le Système de Rotation

Si vous devez modifier le système de rotation, voici les points à vérifier:

### ✅ Changement du seuil de détection
- [ ] Modifier `clickThreshold` (ligne ~984)
- [ ] Modifier `proximityThreshold` (ligne ~1166)
- [ ] Tester avec différentes tailles d'objets

### ✅ Changement du délai de protection
- [ ] Modifier `minTimeBetweenRotationAndDrag` (ligne ~971)
- [ ] Modifier le délai du setTimeout (ligne ~1333)
- [ ] Tester les clics rapides

### ✅ Changement du calcul de l'angle
- [ ] Modifier la section de calcul (lignes 1304-1326)
- [ ] Vérifier la normalisation (lignes 1318-1320)
- [ ] Tester avec des rotations complètes (360°)

### ✅ Ajout d'un nouveau type de contrôle
- [ ] Ajouter la détection dans `onMouseDown`
- [ ] Ajouter le calcul dans `onMouseMove`
- [ ] Ajouter la gestion dans `onMouseUp`
- [ ] Émettre les événements appropriés

---

## 🐛 Débogage

### Variables à surveiller dans la console:

```javascript
console.log('isRotating3D:', isRotating3D)
console.log('rotationStartPosition:', rotationStartPosition)
console.log('rotationStartCursor:', rotationStartCursor)
console.log('angleDelta:', angleDelta)
console.log('centerX, centerY:', centerX, centerY)
```

### Points de breakpoint recommandés:

1. **Ligne 999**: Début de la rotation (activation)
2. **Ligne 1327**: Émission de l'événement de rotation
3. **Ligne 1313**: Fin de la rotation

---

**Document créé le**: 2025-11-19  
**Auteur**: Index des fichiers - Système de rotation  
**Version**: 1.0
