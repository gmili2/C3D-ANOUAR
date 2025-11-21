# 🔄 Explication Détaillée du Système de Rotation

## 📋 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture du système](#architecture-du-système)
3. [Variables clés](#variables-clés)
4. [Flux de fonctionnement](#flux-de-fonctionnement)
5. [Algorithmes mathématiques](#algorithmes-mathématiques)
6. [Gestion des événements](#gestion-des-événements)
7. [Cas particuliers et optimisations](#cas-particuliers-et-optimisations)

---

## 🎯 Vue d'ensemble

Le système de rotation permet à l'utilisateur de faire tourner des éléments (images, texte, formes) affichés sur un modèle 3D en utilisant un contrôle de rotation visuel appelé **mtr** (middle-top-rotate).

### Principe de base

1. L'utilisateur clique sur le contrôle **mtr** (petite poignée au-dessus de l'élément sélectionné)
2. En maintenant le clic et en déplaçant la souris, l'élément tourne autour de son centre
3. L'angle de rotation est calculé en temps réel en fonction du mouvement du curseur
4. La rotation est appliquée instantanément à l'objet sur le canvas 2D

---

## 🏗️ Architecture du système

### Composants impliqués

```
┌─────────────────────────────────────────────────────────────┐
│                      ThreeScene.vue                          │
│  (Gestion de la vue 3D et détection des interactions)       │
│                                                              │
│  ┌────────────────────────────────────────────────┐         │
│  │  1. Détection du clic sur le mtr               │         │
│  │  2. Calcul de l'angle de rotation              │         │
│  │  3. Émission de l'événement '3d-rotation'      │         │
│  └────────────────────────────────────────────────┘         │
└──────────────────────────┬──────────────────────────────────┘
                           │ Événement '3d-rotation'
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     DesignStudio.vue                         │
│  (Composant parent - Gestion du canvas Fabric.js)           │
│                                                              │
│  ┌────────────────────────────────────────────────┐         │
│  │  1. Réception de l'événement                   │         │
│  │  2. Application de la rotation à l'objet       │         │
│  │  3. Mise à jour du canvas 2D                   │         │
│  └────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Variables clés

Toutes ces variables sont définies dans `ThreeScene.vue` (lignes 746-794):

### 1. `isRotating3D` (Boolean)
**Rôle**: Indique si une rotation est actuellement en cours

```javascript
let isRotating3D = false
```

- `true` = L'utilisateur est en train de faire tourner l'élément
- `false` = Pas de rotation active

### 2. `rotationStartPosition` (Object | null)
**Rôle**: Position initiale du contrôle mtr au moment du clic

```javascript
let rotationStartPosition = null
// Exemple de valeur: { x: 400, y: 150 }
```

- Coordonnées en pixels sur le canvas 2D
- Sert de point de référence fixe pendant la rotation
- `null` quand aucune rotation n'est active

### 3. `rotationStartCursor` (Object | null)
**Rôle**: Position initiale du curseur au moment du clic sur le mtr

```javascript
let rotationStartCursor = null
// Exemple de valeur: { x: 405, y: 155 }
```

- Coordonnées en pixels sur le canvas 2D
- Utilisé pour calculer l'angle initial
- `null` quand aucune rotation n'est active

### 4. `rotationStartAngle` (Number | null)
**Rôle**: Angle initial de l'objet (actuellement non utilisé)

```javascript
let rotationStartAngle = null
```

- Pourrait être utilisé pour afficher l'angle absolu
- Actuellement, on calcule uniquement l'angle delta (différence)

### 5. `rotationJustEnded` (Boolean)
**Rôle**: Flag de protection anti-rebond

```javascript
let rotationJustEnded = false
```

- `true` = La rotation vient de se terminer, on ignore les clics pendant un court délai
- `false` = On peut détecter une nouvelle rotation
- Évite qu'un relâchement de souris soit interprété comme un nouveau drag

### 6. `rotationEndTime` (Number)
**Rôle**: Timestamp de fin de rotation

```javascript
let rotationEndTime = 0
// Exemple de valeur: 1700000000000 (timestamp Unix en ms)
```

- Utilisé avec `rotationJustEnded` pour implémenter un délai de protection
- Permet de calculer le temps écoulé depuis la dernière rotation

---

## 🔄 Flux de fonctionnement

### Phase 1: Détection du clic sur le mtr

**Fichier**: `ThreeScene.vue` (lignes 968-1078)  
**Fonction**: `onMouseDown(event)`

```
┌─────────────────────────────────────────────────────────┐
│ 1. L'utilisateur clique sur le modèle 3D               │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Conversion du clic 3D en coordonnées 2D (canvas)    │
│    - Raycasting pour trouver le point d'intersection   │
│    - Projection UV → coordonnées pixel                 │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Vérification des conditions                         │
│    ✓ Un objet est sélectionné ?                        │
│    ✓ L'objet a des contrôles ?                         │
│    ✓ Le contrôle mtr existe ?                          │
│    ✓ Pas de rotation récente (délai > 100ms) ?         │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Calcul de la distance curseur ↔ mtr                 │
│    distance = √[(cursorX - mtrX)² + (cursorY - mtrY)²] │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Distance ≤ 10px ?                                    │
│    OUI → Activer la rotation                           │
│    NON → Continuer avec le drag normal                 │
└─────────────────────────────────────────────────────────┘
```

#### Code simplifié:

```javascript
const onMouseDown = (event) => {
  // 1. Obtenir les coordonnées du clic
  const canvasCoords = getCanvasCoords(event)
  
  // 2. Vérifier les conditions
  if (selectedObjectCoords.value.show && 
      selectedObjectCoords.value.controls && 
      selectedObjectCoords.value.controls.mtr) {
    
    // 3. Récupérer les positions
    const mtrX = selectedObjectCoords.value.controls.mtr.x
    const mtrY = selectedObjectCoords.value.controls.mtr.y
    const cursorX = canvasCoords.x
    const cursorY = canvasCoords.y
    
    // 4. Calculer la distance
    const distance = Math.sqrt(
      Math.pow(cursorX - mtrX, 2) + 
      Math.pow(cursorY - mtrY, 2)
    )
    
    // 5. Vérifier la proximité
    if (distance <= 10) {
      // ACTIVER LA ROTATION
      isRotating3D = true
      rotationStartPosition = { x: mtrX, y: mtrY }
      rotationStartCursor = { x: cursorX, y: cursorY }
      
      // Désactiver OrbitControls
      controls.enabled = false
      
      // Émettre l'événement de début
      emit('3d-rotation-start', {
        canvasX: cursorX,
        canvasY: cursorY,
        mtrCoords: { x: mtrX, y: mtrY }
      })
    }
  }
}
```

---

### Phase 2: Calcul de l'angle pendant le mouvement

**Fichier**: `ThreeScene.vue` (lignes 1207-1343)  
**Fonction**: `onMouseMove(event)`

```
┌─────────────────────────────────────────────────────────┐
│ 1. L'utilisateur déplace la souris                     │
│    (isRotating3D = true)                               │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 2. ÉTAPE 1: Calcul du centre géométrique               │
│    Méthode 1: Intersection des diagonales (tl→br, tr→bl)│
│    Méthode 2: Calcul via left/top/width/height         │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 3. ÉTAPE 2: Calcul des angles                          │
│    startAngle = atan2(startDy, startDx) × (180/π)      │
│    currentAngle = atan2(currentDy, currentDx) × (180/π)│
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 4. ÉTAPE 3: Calcul de la différence d'angle            │
│    angleDelta = currentAngle - startAngle              │
│    Normalisation entre -180° et 180°                   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Émission de l'événement '3d-rotation'               │
│    { canvasX, canvasY, angle, mtrCoords }              │
└─────────────────────────────────────────────────────────┘
```

---

### Phase 3: Fin de la rotation

**Fichier**: `ThreeScene.vue` (lignes 1311-1335)  
**Fonction**: `onMouseUp(event)`

```
┌─────────────────────────────────────────────────────────┐
│ 1. L'utilisateur relâche le bouton de la souris        │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Émission de l'événement '3d-rotation-end'           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Réinitialisation des variables                      │
│    - isRotating3D = false                              │
│    - rotationStartPosition = null                      │
│    - rotationStartCursor = null                        │
│    - rotationJustEnded = true                          │
│    - rotationEndTime = Date.now()                      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Restauration du curseur et des contrôles            │
│    - Curseur → 'move' ou 'default'                     │
│    - OrbitControls.enabled = true                      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Délai de protection (200ms)                         │
│    setTimeout(() => rotationJustEnded = false, 200)    │
└─────────────────────────────────────────────────────────┘
```

---

## 📐 Algorithmes mathématiques

### 1. Calcul de la distance euclidienne

**Formule**:
```
distance = √[(x₂ - x₁)² + (y₂ - y₁)²]
```

**Code**:
```javascript
const distance = Math.sqrt(
  Math.pow(cursorX - mtrX, 2) + 
  Math.pow(cursorY - mtrY, 2)
)
```

**Exemple**:
- mtr à (400, 150)
- curseur à (405, 155)
- distance = √[(405-400)² + (155-150)²] = √[25 + 25] = √50 ≈ 7.07 pixels

---

### 2. Calcul du centre géométrique (Méthode 1: Intersection des diagonales)

**Principe**: Le centre d'un rectangle (même après rotation) est toujours à l'intersection de ses deux diagonales.

**Diagonales**:
- Diagonale 1: tl (top-left) → br (bottom-right)
- Diagonale 2: tr (top-right) → bl (bottom-left)

**Formule mathématique**:

Pour deux segments de ligne:
- Segment 1: de (x₁, y₁) à (x₂, y₂)
- Segment 2: de (x₃, y₃) à (x₄, y₄)

Point d'intersection:
```
denom = (x₁ - x₂)(y₃ - y₄) - (y₁ - y₂)(x₃ - x₄)
t = [(x₁ - x₃)(y₃ - y₄) - (y₁ - y₃)(x₃ - x₄)] / denom
x = x₁ + t(x₂ - x₁)
y = y₁ + t(y₂ - y₁)
```

**Code**:
```javascript
// Coordonnées des 4 coins
const x1 = controls.tl.x, y1 = controls.tl.y  // Top-left
const x2 = controls.br.x, y2 = controls.br.y  // Bottom-right
const x3 = controls.tr.x, y3 = controls.tr.y  // Top-right
const x4 = controls.bl.x, y4 = controls.bl.y  // Bottom-left

// Calcul du dénominateur
const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)

// Vérifier que les diagonales ne sont pas parallèles
if (Math.abs(denom) > 0.001) {
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
  centerX = x1 + t * (x2 - x1)
  centerY = y1 + t * (y2 - y1)
} else {
  // Fallback: moyenne des 4 coins
  centerX = (x1 + x2 + x3 + x4) / 4
  centerY = (y1 + y2 + y3 + y4) / 4
}
```

**Exemple visuel**:
```
    tl ●─────────────● tr
       │╲           ╱│
       │ ╲       ╱   │
       │  ╲   ╱     │
       │   ● CENTER  │
       │  ╱   ╲     │
       │╱       ╲   │
    bl ●─────────────● br
```

---

### 3. Calcul de l'angle avec atan2

**Fonction**: `Math.atan2(y, x)`

**Principe**: Calcule l'angle (en radians) entre l'axe X positif et le point (x, y).

**Système de coordonnées**:
```
        -90° (haut)
            ↑
            │
-180° ←─────●─────→ 0° (droite)
            │
            ↓
         90° (bas)
```

**Formule**:
```
angle_radians = atan2(dy, dx)
angle_degrees = angle_radians × (180 / π)
```

**Code**:
```javascript
// Vecteur du centre vers le curseur initial
const startDx = rotationStartCursor.x - centerX
const startDy = rotationStartCursor.y - centerY

// Vecteur du centre vers le curseur actuel
const currentDx = canvasCoords.x - centerX
const currentDy = canvasCoords.y - centerY

// Calcul des angles en degrés
const startAngle = Math.atan2(startDy, startDx) * (180 / Math.PI)
const currentAngle = Math.atan2(currentDy, currentDx) * (180 / Math.PI)
```

**Exemple**:
- Centre à (400, 300)
- Curseur initial à (450, 300) → dx=50, dy=0 → angle = 0°
- Curseur actuel à (400, 250) → dx=0, dy=-50 → angle = -90°
- Différence = -90° - 0° = -90° (rotation de 90° dans le sens horaire)

---

### 4. Normalisation de l'angle

**Problème**: Les angles peuvent dépasser ±180°, ce qui crée des sauts.

**Exemple du problème**:
- Angle initial: 170°
- Angle actuel: -170°
- Différence brute: -170° - 170° = -340°
- Différence normalisée: 20° (rotation de 20° dans le sens horaire)

**Code**:
```javascript
let angleDelta = currentAngle - startAngle

// Normaliser entre -180° et 180°
if (angleDelta > 180) angleDelta -= 360
if (angleDelta < -180) angleDelta += 360
```

**Tableau de normalisation**:
| Angle brut | Normalisé | Explication |
|------------|-----------|-------------|
| 200° | -160° | 200 - 360 = -160 |
| -200° | 160° | -200 + 360 = 160 |
| 90° | 90° | Pas de changement |
| -90° | -90° | Pas de changement |

---

## 📡 Gestion des événements

### Événements émis par ThreeScene.vue

#### 1. `3d-rotation-start`
**Quand**: Au moment du clic sur le mtr

**Payload**:
```javascript
{
  canvasX: 405,        // Position X du curseur (pixels)
  canvasY: 155,        // Position Y du curseur (pixels)
  mtrCoords: {         // Position du mtr
    x: 400,
    y: 150
  }
}
```

**Utilisation**: Préparer l'objet Fabric.js pour la rotation

---

#### 2. `3d-rotation`
**Quand**: Pendant le mouvement de la souris (rotation en cours)

**Payload**:
```javascript
{
  canvasX: 420,           // Position X actuelle du curseur
  canvasY: 180,           // Position Y actuelle du curseur
  angle: -15.5,           // Angle de rotation à appliquer (degrés)
  mtrCoords: {            // Position du mtr (référence)
    x: 400,
    y: 150
  }
}
```

**Utilisation**: Appliquer la rotation à l'objet Fabric.js

---

#### 3. `3d-rotation-end`
**Quand**: Au relâchement de la souris

**Payload**: Aucun

**Utilisation**: Finaliser la rotation, nettoyer les états temporaires

---

### Réception dans DesignStudio.vue

```javascript
// Template
<ThreeScene
  @3d-rotation-start="handleRotationStart"
  @3d-rotation="handleRotation"
  @3d-rotation-end="handleRotationEnd"
/>

// Script
const handleRotationStart = (data) => {
  console.log('Rotation commence', data)
  // Préparer l'objet pour la rotation
}

const handleRotation = (data) => {
  // Appliquer la rotation
  if (selectedObject) {
    selectedObject.rotate(data.angle)
    canvas.renderAll()
  }
}

const handleRotationEnd = () => {
  console.log('Rotation terminée')
  // Finaliser, sauvegarder l'état, etc.
}
```

---

## ⚠️ Cas particuliers et optimisations

### 1. Protection anti-rebond

**Problème**: Après avoir relâché la souris, un clic immédiat pourrait être détecté comme une nouvelle rotation.

**Solution**: Délai de protection de 100ms + flag `rotationJustEnded`

```javascript
const timeSinceRotationEnd = Date.now() - rotationEndTime
const minTimeBetweenRotationAndDrag = 100 // 100ms

if (!rotationJustEnded && timeSinceRotationEnd > minTimeBetweenRotationAndDrag) {
  // On peut détecter une nouvelle rotation
}
```

---

### 2. Désactivation d'OrbitControls

**Problème**: Pendant la rotation, OrbitControls pourrait faire tourner la caméra en même temps.

**Solution**: Désactiver OrbitControls pendant la rotation

```javascript
// Au début de la rotation
controls.enabled = false

// À la fin de la rotation
controls.enabled = true
```

---

### 3. Gestion du curseur

**Problème**: Le curseur doit refléter l'état actuel (rotation, drag, normal).

**Solution**: Changement dynamique du curseur

```javascript
// Pendant la rotation
renderer.domElement.style.setProperty('cursor', 'grabbing', 'important')

// Après la rotation
const defaultCursor = props.dragMode ? 'move' : 'default'
renderer.domElement.style.setProperty('cursor', defaultCursor, 'important')
```

---

### 4. Seuils de détection

**Seuils utilisés**:
- **Clic sur mtr**: 10 pixels
- **Proximité mtr (hover)**: 20 pixels
- **Délai anti-rebond**: 100 millisecondes
- **Délai de réinitialisation**: 200 millisecondes

**Justification**:
- 10px pour le clic = précision suffisante sans être trop strict
- 20px pour le hover = zone confortable pour l'utilisateur
- 100ms = temps minimum pour éviter les faux positifs
- 200ms = temps de réinitialisation pour une UX fluide

---

## 🎓 Résumé

### Flux complet en 10 étapes

1. **Clic**: L'utilisateur clique sur le mtr
2. **Détection**: Distance curseur ↔ mtr ≤ 10px
3. **Activation**: `isRotating3D = true`, enregistrement des positions
4. **Événement start**: Émission de `3d-rotation-start`
5. **Mouvement**: L'utilisateur déplace la souris
6. **Calcul centre**: Intersection des diagonales ou calcul via dimensions
7. **Calcul angles**: `atan2` pour obtenir les angles initial et actuel
8. **Calcul delta**: Différence normalisée entre -180° et 180°
9. **Événement rotation**: Émission de `3d-rotation` avec l'angle
10. **Relâchement**: Émission de `3d-rotation-end`, réinitialisation

### Formules clés

```javascript
// Distance
distance = √[(x₂-x₁)² + (y₂-y₁)²]

// Angle
angle = atan2(dy, dx) × (180/π)

// Normalisation
if (angle > 180) angle -= 360
if (angle < -180) angle += 360
```

### Variables d'état

```javascript
isRotating3D          // Boolean: rotation active ?
rotationStartPosition // Object: position du mtr
rotationStartCursor   // Object: position initiale du curseur
rotationJustEnded     // Boolean: protection anti-rebond
rotationEndTime       // Number: timestamp de fin
```

---

## 📚 Références

- **Fichier principal**: `/src/components/ThreeScene.vue`
- **Lignes variables**: 746-794
- **Lignes détection**: 968-1078
- **Lignes calcul**: 1207-1343
- **Lignes fin**: 1311-1335

---

**Document créé le**: 2025-11-19  
**Auteur**: Système de rotation ThreeScene.vue  
**Version**: 1.0
