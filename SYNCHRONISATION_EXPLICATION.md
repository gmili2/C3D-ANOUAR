# 🔄 Explication de la Synchronisation Fabric.js ↔ Three.js

## Vue d'ensemble

Les objets placés sur le canvas **Fabric.js** (2D) sont automatiquement synchronisés avec le modèle **Three.js** (3D) en temps réel. Voici comment cela fonctionne :

## 📋 Architecture de Synchronisation

### 1. **Canvas Partagé (Shared Canvas)**

Le canvas HTML de Fabric.js est directement utilisé comme source de texture pour Three.js :

```javascript
// Dans ThreeScene.vue - setupSharedCanvasTexture()
const texture = new THREE.CanvasTexture(htmlCanvas)
```

**Avantage** : La texture Three.js est liée directement au canvas HTML, donc toute modification sur le canvas 2D peut être reflétée sur le modèle 3D.

### 2. **Store de Synchronisation (useCanvasTexture.js)**

Un store Vue réactif gère les demandes de mise à jour :

```javascript
// Flag réactif
const render2D = ref(false)

// Fonction pour demander une mise à jour
const requestTextureUpdate = () => {
  render2D.value = true
}
```

### 3. **Déclenchement des Mises à Jour**

Dans `FabricDesigner.vue`, chaque modification du canvas déclenche une mise à jour :

```javascript
// Exemples d'événements qui déclenchent requestTextureUpdate() :
- object:added      // Quand un objet est ajouté
- object:removed    // Quand un objet est supprimé
- object:modified   // Quand un objet est modifié
- object:moving     // Quand un objet est déplacé
- path:created      // Quand on dessine avec le pinceau
- etc.
```

**Code dans FabricDesigner.vue** :
```javascript
canvas.on('object:added', () => {
  requestTextureUpdate() // Signal au store
  emit('objects-changed')
})
```

### 4. **Boucle d'Animation Three.js**

Dans `ThreeScene.vue`, la boucle d'animation vérifie le flag `render2D` :

```javascript
const animate = () => {
  animationId = requestAnimationFrame(animate)
  
  // Vérifier si le canvas 2D a été modifié
  if (canvasTexture && render2D.value) {
    canvasTexture.needsUpdate = true  // Forcer la mise à jour
    resetTextureUpdate()              // Réinitialiser le flag
  }
  
  // Rendre la scène
  renderer.render(scene, camera)
}
```

## 🔄 Flux de Synchronisation Complet

```
┌─────────────────┐
│  Fabric.js      │
│  Canvas 2D      │
│                 │
│  [Objet ajouté] │
└────────┬────────┘
         │
         │ 1. Événement déclenché
         │    (object:added, etc.)
         ▼
┌─────────────────┐
│ FabricDesigner  │
│                 │
│ requestTexture  │
│ Update()        │
└────────┬────────┘
         │
         │ 2. render2D.value = true
         ▼
┌─────────────────┐
│ useCanvasTexture│
│ Store           │
│                 │
│ render2D = true │
└────────┬────────┘
         │
         │ 3. Watch détecte le changement
         ▼
┌─────────────────┐
│ ThreeScene      │
│                 │
│ Boucle animate()│
│ vérifie render2D│
└────────┬────────┘
         │
         │ 4. canvasTexture.needsUpdate = true
         ▼
┌─────────────────┐
│ Three.js        │
│                 │
│ Texture mise à  │
│ jour sur modèle │
│ 3D              │
└─────────────────┘
```

## 🎯 Points Clés

### **1. Texture Partagée**
- Le canvas HTML de Fabric.js est utilisé directement comme source de texture
- `THREE.CanvasTexture` crée une texture liée au canvas
- Quand le canvas change, on met `texture.needsUpdate = true`

### **2. Synchronisation en Temps Réel**
- Les modifications sont détectées via les événements Fabric.js
- Le store réactif (`render2D`) signale qu'une mise à jour est nécessaire
- La boucle d'animation Three.js vérifie ce flag à chaque frame (~60 FPS)

### **3. Performance**
- La mise à jour se fait uniquement quand nécessaire (pas à chaque frame)
- Le flag `needsUpdate` indique à Three.js de recharger la texture
- Pas de copie de données, juste une référence au canvas

## 📍 Coordonnées 2D → 3D

Les coordonnées sont converties via les **UVs** (coordonnées de texture) :

1. **Clic sur modèle 3D** → Coordonnées 3D (x, y, z)
2. **Projection UV** → Coordonnées UV (u, v) entre 0 et 1
3. **Conversion Canvas** → Coordonnées 2D (canvasX, canvasY)
4. **Placement Fabric** → Objet placé à cette position

**Code dans ThreeScene.vue** :
```javascript
// Convertir les coordonnées 3D en coordonnées canvas 2D
const canvasX = uv.u * canvasWidth
const canvasY = (1 - uv.v) * canvasHeight  // Inverser Y
```

## 🔧 Configuration

### Dimensions du Canvas
- Le canvas 2D a des dimensions fixes (par défaut 800x600)
- Ces dimensions correspondent à la zone personnalisable du modèle 3D
- Les zones exclues (haut/bas) sont gérées via `workZoneTop` et `workZoneBottom`

### Zones de Travail
- Certaines zones peuvent être exclues (ex: manches, col)
- Les objets placés dans ces zones sont filtrés
- Seule la zone active est synchronisée avec le modèle 3D

## 🐛 Debugging

Pour vérifier la synchronisation :

1. **Console logs** : Les événements sont loggés dans la console
2. **Flag render2D** : Vérifier que `render2D.value` passe à `true`
3. **Texture needsUpdate** : Vérifier que `texture.needsUpdate = true`
4. **Canvas objects** : Vérifier `canvas.getObjects().length`

## 📝 Résumé

**En une phrase** : Les objets Fabric.js sont synchronisés vers Three.js via une texture partagée qui se met à jour automatiquement quand le canvas 2D est modifié, grâce à un système de store réactif et une boucle d'animation qui vérifie les changements.

