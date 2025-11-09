# 📐 Relation entre les Dimensions Canvas Fabric.js et Three.js

## Vue d'ensemble

Les dimensions du canvas Fabric.js (`width` et `height`) sont **directement liées** aux dimensions de la texture Three.js. Elles servent de **référence pour convertir les coordonnées** entre le modèle 3D et le canvas 2D.

## 🔗 Relation Directe

### 1. **Texture Partagée**

Le canvas HTML de Fabric.js est utilisé **directement** comme source de texture pour Three.js :

```javascript
// Dans useCanvasTexture.js
const texture = new THREE.CanvasTexture(canvas)
// La texture utilise automatiquement canvas.width et canvas.height
```

**Relation** :
- `texture.image.width` = `canvas.width`
- `texture.image.height` = `canvas.height`

### 2. **Conversion de Coordonnées**

Les dimensions du canvas sont utilisées pour convertir les coordonnées UV (0-1) en pixels :

```javascript
// Dans use3DTo2DProjection.js
const canvasX = uv.u * canvasWidth   // U (0-1) → X (0 à canvasWidth)
const canvasY = normalizedV * canvasHeight  // V (0-1) → Y (0 à canvasHeight)
```

## 📊 Formule de Conversion

### Coordonnées 3D → 2D

```
1. Clic sur modèle 3D → Intersection avec coordonnées UV (u, v) entre 0 et 1
2. Conversion en pixels :
   - canvasX = u * canvasWidth
   - canvasY = normalizedV * canvasHeight
```

### Exemple Concret

Si le canvas fait **800x600 pixels** :

- **UV (0.5, 0.5)** → Canvas **(400, 300)** pixels
  - `canvasX = 0.5 * 800 = 400`
  - `canvasY = 0.5 * 600 = 300`

- **UV (0.0, 0.0)** → Canvas **(0, 0)** pixels (coin haut-gauche)
- **UV (1.0, 1.0)** → Canvas **(800, 600)** pixels (coin bas-droite)

## 🎯 Zones de Travail

Les dimensions du canvas sont aussi utilisées pour calculer les zones actives :

```javascript
// Zone active après exclusion des zones haut/bas
const activeZoneTop = workZoneTop * canvasHeight      // Ex: 0.1 * 600 = 60px
const activeZoneBottom = (1 - workZoneBottom) * canvasHeight  // Ex: 0.9 * 600 = 540px
const activeZoneHeight = activeZoneBottom - activeZoneTop  // Ex: 480px
```

**Exemple avec canvas 800x600 et zones exclues de 10%** :
- Zone exclue haut : 0 à 60px
- Zone active : 60px à 540px (480px de hauteur)
- Zone exclue bas : 540px à 600px

## 🔄 Dimensions dans le Code

### DesignStudio.vue

```javascript
// Dimensions calculées dynamiquement
const canvasWidth = computed(() => {
  return 800 // Largeur fixe
})

const canvasHeight = computed(() => {
  // Calculée selon la zone personnalisable
  const customizableRatio = customizableHeightCm.value / gobletHeightCm.value
  return Math.max(200, 600 * customizableRatio)
})
```

### ThreeScene.vue

```javascript
// Utilisation des dimensions pour la conversion
let canvasWidth = props.canvas2D.width || 800
let canvasHeight = props.canvas2D.height || 600

// Si une texture existe, utiliser ses dimensions (peut différer à cause du devicePixelRatio)
if (canvasTexture && canvasTexture.image) {
  canvasWidth = canvasTexture.image.width
  canvasHeight = canvasTexture.image.height
}

// Conversion UV → Canvas
const canvasX = uv.u * canvasWidth
const canvasY = normalizedV * canvasHeight
```

## ⚠️ Points Importants

### 1. **Device Pixel Ratio**

Sur les écrans haute résolution (Retina), le canvas peut avoir des dimensions différentes :

```javascript
// Canvas HTML peut avoir :
canvas.width = 800   // Dimensions logiques
canvas.height = 600

// Mais le canvas réel peut être :
canvas.offsetWidth = 800   // Affichage
canvas.offsetHeight = 600

// Et la texture peut être :
texture.image.width = 1600  // Si devicePixelRatio = 2
texture.image.height = 1200
```

**Solution** : Le code utilise toujours les dimensions de la texture pour la conversion :

```javascript
// Priorité aux dimensions de la texture
if (canvasTexture && canvasTexture.image) {
  canvasWidth = canvasTexture.image.width
  canvasHeight = canvasTexture.image.height
}
```

### 2. **Cohérence des Dimensions**

Pour que la synchronisation fonctionne correctement :

- ✅ Les dimensions du canvas Fabric doivent correspondre aux dimensions de la texture
- ✅ Les zones de travail doivent être calculées avec les mêmes dimensions
- ✅ La conversion UV → Canvas doit utiliser les mêmes dimensions

### 3. **Ratio d'Aspect**

Le ratio d'aspect du canvas doit correspondre au ratio d'aspect de la zone personnalisable du modèle 3D :

```javascript
// Si le modèle a une zone personnalisable de 8cm de hauteur sur 12cm total
// Le canvas doit avoir un ratio qui correspond à cette zone
const ratio = customizableHeightCm / gobletHeightCm
const canvasHeight = baseHeight * ratio
```

## 📝 Résumé

**Relation principale** :
- Les dimensions du canvas Fabric.js (`width`, `height`) définissent la taille de la texture Three.js
- Ces dimensions sont utilisées pour convertir les coordonnées UV (0-1) en pixels (0 à width/height)
- La formule : `pixel = uv * dimension`

**Exemple** :
- Canvas : 800x600 pixels
- UV (0.5, 0.5) → Pixel (400, 300)
- Texture Three.js : 800x600 pixels (identique au canvas)

**En une phrase** : Les dimensions du canvas Fabric.js sont directement utilisées comme dimensions de la texture Three.js et servent de référence pour convertir toutes les coordonnées entre le 2D et le 3D.

