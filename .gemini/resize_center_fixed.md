# 🎯 Resize avec centre fixe

## 📋 Objectif

Maintenir le **centre de l'objet fixe** pendant le resize, au lieu d'utiliser le coin haut-gauche comme point d'ancrage.

## 🔄 Différence d'approche

### **Approche 1 : Coin haut-gauche fixe** (ancienne)

```
AVANT resize :              APRÈS resize :
┌─────────┐                 ┌─────────────────┐
│    ●    │  ← centre       │         ●       │  ← centre déplacé
│         │                 │                 │
└─────────┘                 └─────────────────┘
↑                           ↑
Coin fixe                   Coin fixe (même position)
```

**Problème** : Le centre se déplace pendant le resize !

### **Approche 2 : Centre fixe** (nouvelle) ✅

```
AVANT resize :              APRÈS resize :
┌─────────┐                 ┌─────────────────┐
│    ●    │  ← centre       │         ●       │  ← centre au même endroit
│         │                 │                 │
└─────────┘                 └─────────────────┘
    ↑                               ↑
    Centre fixe                     Centre fixe (même position)
```

**Avantage** : Le centre reste au même endroit, resize plus intuitif !

---

## 💻 Code implémenté

```javascript
// ========================================================================
// MAINTENIR LE CENTRE FIXE PENDANT LE RESIZE
// ========================================================================

// ÉTAPE 1 : Calculer le centre de l'objet AVANT le resize
const oldWidth = originalWidth * initialScale.scaleX;
const oldHeight = originalHeight * initialScale.scaleY;
const oldCenterX = initialScale.left + oldWidth / 2;
const oldCenterY = initialScale.top + oldHeight / 2;

// ÉTAPE 2 : Calculer les nouvelles dimensions APRÈS le resize
const newWidth = originalWidth * newScaleX;
const newHeight = originalHeight * newScaleY;

// ÉTAPE 3 : Calculer la nouvelle position pour que le centre reste fixe
// Formule : centre = left + width/2  →  left = centre - width/2
const finalLeft = oldCenterX - newWidth / 2;
const finalTop = oldCenterY - newHeight / 2;

// ÉTAPE 4 : Appliquer les transformations
activeObject.set({
  scaleX: newScaleX,
  scaleY: newScaleY,
  left: finalLeft, // Position ajustée pour maintenir le centre
  top: finalTop, // Position ajustée pour maintenir le centre
});
```

---

## 📐 Explication mathématique

### **Formule du centre**

```
Centre X = left + width / 2
Centre Y = top + height / 2
```

### **Formule inverse (trouver left/top depuis le centre)**

```
left = Centre X - width / 2
top = Centre Y - height / 2
```

### **Exemple numérique**

```javascript
// État initial
left = 100
top = 150
width = 100  (originalWidth * scaleX = 100 * 1.0)
height = 80  (originalHeight * scaleY = 80 * 1.0)

// Calculer le centre initial
oldCenterX = 100 + 100/2 = 150
oldCenterY = 150 + 80/2 = 190

// Après resize (scale x1.5)
newWidth = 100 * 1.5 = 150
newHeight = 80 * 1.5 = 120

// Calculer la nouvelle position pour maintenir le centre à (150, 190)
finalLeft = 150 - 150/2 = 75
finalTop = 190 - 120/2 = 130

// Vérification : le nouveau centre est bien (150, 190)
nouveau centre X = 75 + 150/2 = 150 ✅
nouveau centre Y = 130 + 120/2 = 190 ✅
```

---

## 🎨 Visualisation

### **Exemple : Agrandir un rectangle**

```
AVANT resize :
┌─────────────────────────────┐
│                             │
│         100, 150            │  ← Position (left, top)
│            ●────────┐       │
│            │        │       │
│            │  100x80│       │
│            │        │       │
│            └────────┘       │
│              ● (150, 190)   │  ← Centre
│                             │
└─────────────────────────────┘

APRÈS resize (scale x1.5) :
┌─────────────────────────────┐
│                             │
│      75, 130                │  ← Nouvelle position (ajustée)
│         ●──────────────┐    │
│         │              │    │
│         │   150x120    │    │
│         │              │    │
│         └──────────────┘    │
│              ● (150, 190)   │  ← Centre (inchangé !)
│                             │
└─────────────────────────────┘
```

**Observation** :

- Le centre reste à `(150, 190)` ✅
- La position `(left, top)` a changé de `(100, 150)` à `(75, 130)`
- L'objet s'est agrandi de manière **symétrique** autour du centre

---

## 🔍 Comparaison avec l'ancienne méthode

### **Ancienne méthode (coin fixe)**

```javascript
// Appliquer directement newLeft et newTop calculés
activeObject.set({
  scaleX: newScaleX,
  scaleY: newScaleY,
  left: newLeft, // Calculé pour chaque handle différemment
  top: newTop, // Calculé pour chaque handle différemment
});
```

**Problème** :

- Comportement différent selon le handle (haut, bas, gauche, droite)
- Le centre se déplace
- Moins intuitif pour l'utilisateur

### **Nouvelle méthode (centre fixe)**

```javascript
// Calculer la position pour maintenir le centre fixe
const finalLeft = oldCenterX - newWidth / 2;
const finalTop = oldCenterY - newHeight / 2;

activeObject.set({
  scaleX: newScaleX,
  scaleY: newScaleY,
  left: finalLeft,
  top: finalTop,
});
```

**Avantage** :

- Comportement **uniforme** pour tous les handles
- Le centre reste fixe
- Plus intuitif et prévisible

---

## 🧪 Logs de débogage

Les logs affichent :

```javascript
console.log("🎯 Maintien du centre fixe:");
console.log("  Ancien centre:", oldCenterX, oldCenterY);
console.log("  Anciennes dimensions:", oldWidth, "x", oldHeight);
console.log("  Nouvelles dimensions:", newWidth, "x", newHeight);
console.log("  Ancienne position:", initialScale.left, initialScale.top);
console.log("  Nouvelle position:", finalLeft, finalTop);
console.log(
  "  Nouveau centre:",
  finalLeft + newWidth / 2,
  finalTop + newHeight / 2
);
```

**Exemple de sortie** :

```
🎯 Maintien du centre fixe:
  Ancien centre: 150 190
  Anciennes dimensions: 100 x 80
  Nouvelles dimensions: 150 x 120
  Ancienne position: 100 150
  Nouvelle position: 75 130
  Nouveau centre: 150 190
```

**Vérification** : L'ancien centre et le nouveau centre sont identiques ! ✅

---

## 📊 Tableau récapitulatif

| Aspect              | Coin fixe (ancien)     | Centre fixe (nouveau) |
| ------------------- | ---------------------- | --------------------- |
| **Point d'ancrage** | Coin haut-gauche       | Centre de l'objet     |
| **Comportement**    | Différent selon handle | Uniforme pour tous    |
| **Centre**          | Se déplace             | Reste fixe ✅         |
| **Intuitivité**     | Moins intuitive        | Plus intuitive ✅     |
| **Complexité code** | Calculs par handle     | Calcul uniforme ✅    |

---

## 🎯 Cas d'usage

### **Quand utiliser le centre fixe ?**

✅ **Bon pour** :

- Resize symétrique
- Interface intuitive
- Objets centrés (logos, icônes)
- Animations de resize

❌ **Moins bon pour** :

- Resize avec contraintes de bords
- Alignement précis sur une grille

---

## 🔧 Améliorations possibles

### **Option 1 : Rendre configurable**

```javascript
const keepCenterFixed = true; // Option

if (keepCenterFixed) {
  // Utiliser la méthode centre fixe
  const finalLeft = oldCenterX - newWidth / 2;
  const finalTop = oldCenterY - newHeight / 2;
} else {
  // Utiliser la méthode coin fixe
  const finalLeft = newLeft;
  const finalTop = newTop;
}
```

### **Option 2 : Selon le handle**

```javascript
// Centre fixe pour les coins
if (handleInfo.corner) {
  const finalLeft = oldCenterX - newWidth / 2;
  const finalTop = oldCenterY - newHeight / 2;
}
// Coin fixe pour les bords
else {
  const finalLeft = newLeft;
  const finalTop = newTop;
}
```

---

## 📝 Résumé

### **Principe**

Maintenir le centre de l'objet au même endroit pendant le resize.

### **Formule**

```javascript
finalLeft = oldCenterX - newWidth / 2;
finalTop = oldCenterY - newHeight / 2;
```

### **Avantages**

- ✅ Resize symétrique et intuitif
- ✅ Comportement uniforme pour tous les handles
- ✅ Centre fixe (ne se déplace pas)
- ✅ Code plus simple

### **Résultat**

Un resize beaucoup plus naturel et prévisible pour l'utilisateur ! 🎉
