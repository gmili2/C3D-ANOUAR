# 📐 Explication : `delta` vs `localDelta` dans le resize

## 🎯 Vue d'ensemble

Quand on redimensionne un objet **tourné**, on doit gérer **deux systèmes de coordonnées** différents :

1. **Système GLOBAL** : Le canvas (axes X et Y fixes)
2. **Système LOCAL** : L'objet tourné (axes qui tournent avec l'objet)

Les variables `delta` et `localDelta` permettent de convertir entre ces deux systèmes.

---

## 📊 Les variables expliquées

### **1. `deltaX` et `deltaY` - Mouvement dans le système GLOBAL**

```javascript
const deltaX = x - startX;
const deltaY = y - startY;
```

**Signification** :

- `deltaX` = Combien de pixels la souris s'est déplacée **horizontalement** sur le canvas
- `deltaY` = Combien de pixels la souris s'est déplacée **verticalement** sur le canvas

**Exemple** :

```javascript
// Position de départ du clic
startX = 250
startY = 180

// Position actuelle de la souris
x = 300
y = 230

// Calcul des deltas
deltaX = 300 - 250 = 50  // La souris a bougé de 50px vers la DROITE
deltaY = 230 - 180 = 50  // La souris a bougé de 50px vers le BAS
```

**Visualisation** :

```
Canvas (système GLOBAL)
        Y
        ↑
        │
        │  (startX, startY) = (250, 180)
        │      ●
        │       ╲
        │        ╲ deltaX = 50 →
        │         ╲
        │          ● (x, y) = (300, 230)
        │           ↓ deltaY = 50
        │
        └──────────────────────→ X
```

---

### **2. `localDeltaX` et `localDeltaY` - Mouvement dans le système LOCAL**

```javascript
const localDeltaX = deltaX * cosAngle - deltaY * sinAngle;
const localDeltaY = deltaX * sinAngle + deltaY * cosAngle;
```

**Signification** :

- `localDeltaX` = Combien de pixels la souris s'est déplacée **selon l'axe X de l'objet tourné**
- `localDeltaY` = Combien de pixels la souris s'est déplacée **selon l'axe Y de l'objet tourné**

**Pourquoi ?** Parce que l'objet est tourné, ses axes ne sont plus alignés avec les axes du canvas !

---

## 🔄 Transformation de coordonnées

### **Formule mathématique**

La transformation utilise une **matrice de rotation inverse** :

```
┌ localDeltaX ┐   ┌  cos(-angle)  -sin(-angle) ┐   ┌ deltaX ┐
│            │ = │                             │ × │        │
└ localDeltaY ┘   └  sin(-angle)   cos(-angle) ┘   └ deltaY ┘
```

En JavaScript :

```javascript
const angle = ((activeObject.angle || 0) * Math.PI) / 180;
const cosAngle = Math.cos(-angle); // Angle NÉGATIF pour rotation inverse
const sinAngle = Math.sin(-angle);

const localDeltaX = deltaX * cosAngle - deltaY * sinAngle;
const localDeltaY = deltaX * sinAngle + deltaY * cosAngle;
```

---

## 📖 Exemple concret : Rectangle tourné de 90°

### **Configuration**

```javascript
// Rectangle de 100x80px tourné de 90°
activeObject.width = 100;
activeObject.height = 80;
activeObject.angle = 90;
```

### **Scénario : Tirer sur le handle `mr` (middle-right)**

#### **Étape 1 : Mouvement de la souris (système GLOBAL)**

```
Position initiale : (250, 180)
Position finale   : (300, 230)

deltaX = 300 - 250 = 50  (vers la droite)
deltaY = 230 - 180 = 50  (vers le bas)
```

**Visualisation** :

```
Canvas (système GLOBAL)
        Y
        ↑
        │
        │  ● (250, 180)
        │   ╲
        │    ╲ Mouvement de la souris
        │     ╲
        │      ● (300, 230)
        │
        └──────────────────────→ X
```

#### **Étape 2 : Transformation en système LOCAL**

```javascript
angle = 90° = π/2 radians
cosAngle = Math.cos(-90°) = 0
sinAngle = Math.sin(-90°) = -1

localDeltaX = deltaX * cosAngle - deltaY * sinAngle
            = 50 * 0 - 50 * (-1)
            = 0 + 50
            = 50

localDeltaY = deltaX * sinAngle + deltaY * cosAngle
            = 50 * (-1) + 50 * 0
            = -50 + 0
            = -50
```

**Interprétation** :

- `localDeltaX = 50` : La souris s'est déplacée de **50px vers la droite** dans le système de l'objet
- `localDeltaY = -50` : La souris s'est déplacée de **50px vers le haut** dans le système de l'objet

**Visualisation** :

```
Rectangle tourné de 90° (système LOCAL)

        Y_local (vers la droite du canvas)
        ↑
        │
        │   ┌──┐
        │   │  │
        │   │  │ Rectangle
        │   │  │
        │   └──┘
        │
        └──────────────────────→ X_local (vers le bas du canvas)

Mouvement dans le système LOCAL :
- localDeltaX = +50 (vers la droite de l'objet)
- localDeltaY = -50 (vers le haut de l'objet)
```

---

## 🎨 Visualisation complète

### **Sans rotation (0°)**

```
Canvas et Objet alignés :

        Y (canvas) = Y (objet)
        ↑
        │
        │   ┌─────────────┐
        │   │             │
        │   │   Rectangle │
        │   │             │
        │   └─────────────┘
        │
        └──────────────────────→ X (canvas) = X (objet)

deltaX = localDeltaX  (pas de transformation)
deltaY = localDeltaY
```

### **Avec rotation de 90°**

```
Canvas (système GLOBAL) :

        Y_canvas
        ↑
        │
        │   ┌──┐  ← Y_objet (vers la droite)
        │   │  │
        │   │  │
        │   │  │
        │   └──┘
        │    ↓
        │   X_objet (vers le bas)
        │
        └──────────────────────→ X_canvas

Mouvement de la souris :
- Dans le système GLOBAL : deltaX = +50, deltaY = +50
- Dans le système LOCAL : localDeltaX = +50, localDeltaY = -50
```

---

## 💻 Code complet avec commentaires

```javascript
// ========== ÉTAPE 1 : MOUVEMENT DANS LE SYSTÈME GLOBAL ==========
const deltaX = x - startX; // Mouvement horizontal sur le canvas
const deltaY = y - startY; // Mouvement vertical sur le canvas

// Exemple : deltaX = 50, deltaY = 50
// → La souris a bougé de 50px vers la droite et 50px vers le bas

// ========== ÉTAPE 2 : OBTENIR L'ANGLE DE ROTATION ==========
const angle = ((activeObject.angle || 0) * Math.PI) / 180;

// Exemple : angle = 90° = 1.5708 radians

// ========== ÉTAPE 3 : CALCULER COS ET SIN ==========
const cosAngle = Math.cos(-angle); // Angle NÉGATIF pour rotation inverse
const sinAngle = Math.sin(-angle);

// Exemple avec 90° :
// cosAngle = Math.cos(-90°) = 0
// sinAngle = Math.sin(-90°) = -1

// ========== ÉTAPE 4 : TRANSFORMATION EN SYSTÈME LOCAL ==========
const localDeltaX = deltaX * cosAngle - deltaY * sinAngle;
const localDeltaY = deltaX * sinAngle + deltaY * cosAngle;

// Exemple avec deltaX = 50, deltaY = 50, angle = 90° :
// localDeltaX = 50 * 0 - 50 * (-1) = 50
// localDeltaY = 50 * (-1) + 50 * 0 = -50

// ========== ÉTAPE 5 : UTILISER LES DELTAS LOCAUX POUR LE RESIZE ==========
if (handleInfo.edge === "right") {
  // Redimensionner selon l'axe X LOCAL de l'objet
  newScaleX = (initialWidth + localDeltaX) / originalWidth;
  // Exemple : (100 + 50) / 100 = 1.5 (150% de la taille originale)
}
```

---

## 🔍 Pourquoi utiliser `localDelta` ?

### **Problème sans transformation**

Si on utilisait directement `deltaX` et `deltaY` pour un objet tourné de 90° :

```javascript
// ❌ MAUVAIS : Utiliser deltaX/deltaY directement
if (handleInfo.edge === "right") {
  newScaleX = (initialWidth + deltaX) / originalWidth;
  // Avec deltaX = 50, on agrandirait selon l'axe X du CANVAS
  // Mais l'axe X de l'objet pointe vers le BAS !
  // → Resize dans la mauvaise direction
}
```

### **Solution avec transformation**

```javascript
// ✅ BON : Utiliser localDeltaX/localDeltaY
if (handleInfo.edge === "right") {
  newScaleX = (initialWidth + localDeltaX) / originalWidth;
  // Avec localDeltaX = 50, on agrandit selon l'axe X de l'OBJET
  // → Resize dans la bonne direction
}
```

---

## 📊 Tableau récapitulatif

| Angle    | deltaX | deltaY | localDeltaX | localDeltaY | Signification                           |
| -------- | ------ | ------ | ----------- | ----------- | --------------------------------------- |
| **0°**   | +50    | +50    | +50         | +50         | Pas de transformation                   |
| **90°**  | +50    | +50    | +50         | -50         | X_objet = Y_canvas, Y_objet = -X_canvas |
| **180°** | +50    | +50    | -50         | -50         | Axes inversés                           |
| **270°** | +50    | +50    | -50         | +50         | X_objet = -Y_canvas, Y_objet = X_canvas |

---

## 🎯 Résumé

### **`deltaX` et `deltaY`**

- Mouvement de la souris dans le **système GLOBAL** (canvas)
- Axes fixes (X horizontal, Y vertical)
- Facile à calculer : `x - startX`, `y - startY`

### **`localDeltaX` et `localDeltaY`**

- Mouvement de la souris dans le **système LOCAL** (objet)
- Axes qui tournent avec l'objet
- Nécessite une transformation mathématique (rotation inverse)

### **Pourquoi les deux ?**

- On **mesure** le mouvement dans le système global (`delta`)
- On **applique** le resize dans le système local (`localDelta`)
- Cela permet un resize correct même si l'objet est tourné !

---

## 🧪 Test pratique

Pour bien comprendre, essayez ceci :

1. Créez un rectangle
2. Tournez-le de 90°
3. Tirez sur le handle `mr` (middle-right) vers la droite
4. Observez les logs :

```javascript
console.log("Delta GLOBAL:", deltaX, deltaY);
// → deltaX = 50, deltaY = 0 (mouvement vers la droite du canvas)

console.log("Delta LOCAL:", localDeltaX, localDeltaY);
// → localDeltaX = 0, localDeltaY = -50 (mouvement vers le haut de l'objet)
```

Le rectangle s'agrandit **vers le haut** (dans son propre système de coordonnées), ce qui correspond visuellement à un mouvement **vers la droite** sur le canvas !
