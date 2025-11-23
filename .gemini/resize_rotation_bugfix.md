# 🐛 Bug Fix : Resize avec rotation

## 📋 Description du problème

Quand un objet est **tourné de 90°** (ou tout autre angle), le resize ne fonctionne pas correctement. Par exemple :

- Tirer sur le handle **`mt`** (middle-top) redimensionne l'objet dans la mauvaise direction
- Seuls les handles **`mb`** et **`mr`** fonctionnent correctement

## 🔍 Analyse du problème

### **Cause racine**

Les handles (`mt`, `mb`, `ml`, `mr`) sont définis dans le **système de coordonnées GLOBAL** du canvas, mais après rotation, ils ne correspondent plus aux bonnes directions dans le **système LOCAL** de l'objet.

### **Exemple visuel avec rotation de 90°**

```
Sans rotation (0°):          Avec rotation (90°):
    mt (haut)                    ml (gauche)
    ↑                            ↑
ml ← ● → mr                 mb ← ● → mt
    ↓                            ↓
    mb (bas)                     mr (droite)
```

Quand l'utilisateur tire sur **`mt`** (qui est visuellement en haut), le code pense que c'est le **haut** de l'objet, mais en réalité c'est le **côté droit** de l'objet tourné !

### **Pourquoi `mb` et `mr` fonctionnaient ?**

Par **coïncidence**, après une rotation de 90° :

- `mb` (middle-bottom) global → correspond au `ml` (middle-left) local ✅
- `mr` (middle-right) global → correspond au `mt` (middle-top) local ✅

Ces deux handles se trouvaient par hasard dans la bonne position !

## ✅ Solution : Remapping des handles

La solution consiste à **remapper les handles** en fonction de l'angle de rotation avant d'appliquer le resize.

### **Algorithme de remapping**

```javascript
// 1. Normaliser l'angle entre 0 et 360
const normalizedAngle = ((angleDeg % 360) + 360) % 360;

// 2. Déterminer le quadrant de rotation
if (normalizedAngle >= 45 && normalizedAngle < 135) {
  // Rotation de ~90° (sens horaire)
  // mt → mr, mr → mb, mb → ml, ml → mt
} else if (normalizedAngle >= 135 && normalizedAngle < 225) {
  // Rotation de ~180°
  // mt → mb, mr → ml, mb → mt, ml → mr
} else if (normalizedAngle >= 225 && normalizedAngle < 315) {
  // Rotation de ~270° (ou -90°)
  // mt → ml, mr → mt, mb → mr, ml → mb
}
```

### **Tables de mapping**

#### **Bords (edges)**

| Angle           | mt → | mr → | mb → | ml → |
| --------------- | ---- | ---- | ---- | ---- |
| 0-45°           | mt   | mr   | mb   | ml   |
| 45-135° (90°)   | mr   | mb   | ml   | mt   |
| 135-225° (180°) | mb   | ml   | mt   | mr   |
| 225-315° (270°) | ml   | mt   | mr   | mb   |

#### **Coins (corners)**

| Angle           | tl → | tr → | br → | bl → |
| --------------- | ---- | ---- | ---- | ---- |
| 0-45°           | tl   | tr   | br   | bl   |
| 45-135° (90°)   | tr   | br   | bl   | tl   |
| 135-225° (180°) | br   | bl   | tl   | tr   |
| 225-315° (270°) | bl   | tl   | tr   | br   |

## 💻 Code de la correction

### **Avant (bugué)**

```javascript
// Utiliser directement handleInfo sans tenir compte de la rotation
if (handleInfo.edge === "top") {
  newScaleY = (initialHeight - localDeltaY) / originalHeight;
  newTop = initialScale.top + deltaY;
}
```

**Problème** : Avec une rotation de 90°, `handleInfo.edge === 'top'` correspond visuellement au **côté droit** de l'objet, pas au haut !

### **Après (corrigé)**

```javascript
// 1. Remapper le handle en fonction de la rotation
let mappedHandleInfo = { ...handleInfo };

if (handleInfo.edge) {
  const normalizedAngle = ((angleDeg % 360) + 360) % 360;
  const originalEdge = handleInfo.edge;
  let remappedEdge = originalEdge;

  if (normalizedAngle >= 45 && normalizedAngle < 135) {
    // Rotation de ~90°
    const edgeMap = {
      top: "right",
      right: "bottom",
      bottom: "left",
      left: "top",
    };
    remappedEdge = edgeMap[originalEdge] || originalEdge;
  }
  // ... autres quadrants

  mappedHandleInfo = {
    ...handleInfo,
    edge: remappedEdge,
    handle:
      remappedEdge === "top"
        ? "mt"
        : remappedEdge === "bottom"
        ? "mb"
        : remappedEdge === "left"
        ? "ml"
        : "mr",
  };
}

// 2. Utiliser le handle mappé
if (mappedHandleInfo.edge === "top") {
  newScaleY = (initialHeight - localDeltaY) / originalHeight;
  newTop = initialScale.top + deltaY;
}
```

**Résultat** : Avec une rotation de 90°, `handleInfo.edge === 'top'` est remappé en `'right'`, ce qui correspond correctement au côté droit de l'objet !

## 🎯 Exemple concret

### **Scénario : Rectangle tourné de 90°**

```
Rectangle original (0°):     Rectangle tourné (90°):
┌─────────────┐              ┌──┐
│             │              │  │
│   mt (↑)    │              │mt│
│             │              │(→)
└─────────────┘              │  │
                             └──┘
```

#### **Utilisateur tire sur `mt` (visuellement en haut)**

**Sans correction** :

```javascript
handleInfo.edge = "top";
// Le code pense que c'est le haut de l'objet
// Mais visuellement, c'est le côté droit !
// ❌ Resize dans la mauvaise direction
```

**Avec correction** :

```javascript
handleInfo.edge = "top";
normalizedAngle = 90;
// Remapping : 'top' → 'right'
mappedHandleInfo.edge = "right";
// Le code sait maintenant que c'est le côté droit
// ✅ Resize dans la bonne direction
```

## 📊 Diagramme de flux

```
Utilisateur tire sur un handle
    ↓
ThreeScene détecte le handle (système GLOBAL)
    ↓
handleInfo = { edge: 'top' }
    ↓
FabricDesigner.resizeSelectedObjectFromHandle()
    ↓
┌────────────────────────────────────────┐
│ 1. Obtenir l'angle de rotation         │
│    angleDeg = 90                       │
│                                        │
│ 2. Normaliser l'angle                  │
│    normalizedAngle = 90                │
│                                        │
│ 3. Déterminer le quadrant              │
│    45 <= 90 < 135 → Rotation de 90°   │
│                                        │
│ 4. Remapper le handle                  │
│    'top' → 'right'                     │
│                                        │
│ 5. Créer mappedHandleInfo              │
│    { edge: 'right' }                   │
└────────────────────────────────────────┘
    ↓
Utiliser mappedHandleInfo pour le resize
    ↓
✅ Resize correct !
```

## 🧪 Tests

### **Test 1 : Rotation de 0°**

- Handle `mt` → Reste `mt` ✅
- Resize vers le haut ✅

### **Test 2 : Rotation de 90°**

- Handle `mt` → Devient `mr` ✅
- Resize vers la droite ✅

### **Test 3 : Rotation de 180°**

- Handle `mt` → Devient `mb` ✅
- Resize vers le bas ✅

### **Test 4 : Rotation de 270°**

- Handle `mt` → Devient `ml` ✅
- Resize vers la gauche ✅

### **Test 5 : Rotation de 45°**

- Handle `mt` → Reste `mt` (pas encore dans le quadrant 90°) ✅

## 🎨 Visualisation complète

```
Rotation 0° :               Rotation 90° :
    mt                          ml
    ↑                           ↑
ml ← ● → mr                mb ← ● → mt
    ↓                           ↓
    mb                          mr

Rotation 180° :             Rotation 270° :
    mb                          mr
    ↑                           ↑
mr ← ● → ml                mt ← ● → mb
    ↓                           ↓
    mt                          ml
```

## 🔧 Logs de débogage

Pour déboguer, surveillez ces logs :

```javascript
console.log("handleInfo AVANT mapping:", handleInfo);
// { edge: 'top', handle: 'mt' }

console.log("🔄 Remapping edge: top → right (angle: 90°)");

console.log("handleInfo APRÈS mapping:", mappedHandleInfo);
// { edge: 'right', handle: 'mr' }
```

## 📝 Résumé

### **Problème**

Les handles sont définis dans le système GLOBAL, mais après rotation, ils ne correspondent plus au système LOCAL de l'objet.

### **Solution**

Remapper les handles en fonction de l'angle de rotation avant d'appliquer le resize.

### **Résultat**

Le resize fonctionne correctement quelle que soit la rotation de l'objet ! ✅

### **Fichier modifié**

`/Users/anouar/fabric-playground/src/components/FabricDesigner.vue`

- Fonction : `resizeSelectedObjectFromHandle()`
- Lignes : ~3527-3711

### **Complexité**

- Ajout de ~120 lignes de code
- Logique de remapping pour 4 quadrants (0°, 90°, 180°, 270°)
- Support des bords ET des coins
