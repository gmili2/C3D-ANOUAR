# Prompt: Implémentation du système de Drag 3D vers 2D

## Contexte
Je dois implémenter un système permettant de déplacer des objets 2D (sur un canvas) en glissant directement sur un modèle 3D. Le système doit convertir les coordonnées 3D (position du curseur sur le modèle) en coordonnées 2D (position sur le canvas) en temps réel pendant le drag.

## Architecture requise

### Composants nécessaires

1. **Composant 3D Scene** (`ThreeScene.vue`)
   - Gère le rendu Three.js du modèle 3D
   - Détecte les interactions souris (mousedown, mousemove, mouseup)
   - Convertit les clics 3D en coordonnées canvas 2D
   - Émet des événements pour communiquer avec le composant parent

2. **Composable de projection 3D→2D** (`use3DTo2DProjection.js`)
   - Convertit les coordonnées UV du modèle 3D en coordonnées canvas 2D
   - Gère les zones de travail (work zones) pour exclure certaines parties du modèle

3. **Composant parent** (`DesignStudio.vue`)
   - Coordonne les interactions entre la scène 3D et le canvas 2D
   - Gère le calcul du décalage initial (dragOffset)
   - Déplace les objets sur le canvas 2D pendant le drag

## Implémentation détaillée

### 1. Système de conversion 3D → 2D

#### Fonction `getCanvasCoords(event)`
```javascript
const getCanvasCoords = (event) => {
  if (!currentMesh || !props.canvas2D || !raycaster3D) return null
  
  const canvas = renderer.domElement
  const rect = canvas.getBoundingClientRect()
  
  // Normaliser les coordonnées de la souris (-1 à 1)
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  
  // Créer un rayon depuis la caméra
  raycaster3D.setFromCamera(mouse, camera)
  
  // Calculer l'intersection avec le mesh 3D
  const targetObject = activeMesh || currentMesh
  const intersects = raycaster3D.intersectObject(targetObject, true)
  
  if (intersects.length > 0) {
    const intersection = intersects[0]
    if (intersection.uv) {
      // Convertir les UV en coordonnées canvas
      const canvasCoords = project3DClickToCanvas(
        intersection,
        canvasWidth,
        canvasHeight,
        workZoneTop,
        workZoneBottom
      )
      return canvasCoords
    }
  }
  return null
}
```

#### Composable `use3DTo2DProjection.js`
```javascript
/**
 * Convertit un clic sur le modèle 3D en coordonnées canvas 2D
 * 
 * @param {THREE.Intersection} intersection - L'intersection du raycast
 * @param {number} canvasWidth - Largeur du canvas en pixels
 * @param {number} canvasHeight - Hauteur du canvas en pixels
 * @param {number} workZoneTop - Pourcentage à exclure du haut (0-1)
 * @param {number} workZoneBottom - Pourcentage à exclure du bas (0-1)
 * @returns {Object|null} - { x, y } coordonnées canvas en pixels
 */
export const project3DClickToCanvas = (intersection, canvasWidth, canvasHeight, workZoneTop = 0, workZoneBottom = 0) => {
  // Extraire les coordonnées UV (0-1)
  const uv = {
    u: intersection.uv.x,
    v: intersection.uv.y
  }
  
  // Calculer la zone active (entre workZoneTop et 1 - workZoneBottom)
  const activeZoneTop = workZoneTop
  const activeZoneBottom = 1 - workZoneBottom
  const activeZoneHeight = activeZoneBottom - activeZoneTop
  
  // Vérifier si le point est dans la zone active
  if (uv.v < activeZoneTop || uv.v > activeZoneBottom) {
    return null // Point hors zone
  }
  
  // Normaliser V dans la zone active
  const normalizedV = (uv.v - activeZoneTop) / activeZoneHeight
  
  // Convertir UV en coordonnées canvas (pixels)
  const activeZoneTopPx = workZoneTop * canvasHeight
  const activeZoneBottomPx = (1 - workZoneBottom) * canvasHeight
  const activeZoneHeightPx = activeZoneBottomPx - activeZoneTopPx
  
  return {
    x: uv.u * canvasWidth,
    y: activeZoneBottomPx - normalizedV * activeZoneHeightPx
  }
}
```

### 2. Gestion des événements souris

#### Variables d'état
```javascript
let isDragging3D = false      // Flag pour indiquer qu'un drag est en cours
let isResizing3D = false       // Flag pour indiquer qu'un resize est en cours
let lastDragPosition = null   // Dernière position du drag
```

#### `onMouseDown` - Détection du début du drag
```javascript
const onMouseDown = (event) => {
  if (!props.dragMode) return  // Vérifier que le mode drag est actif
  
  const canvasCoords = getCanvasCoords(event)
  if (canvasCoords !== null) {
    // Vérifier si c'est un resize ou un drag
    let isResizeClick = false
    let handleInfo = null
    
    // Détecter si on clique sur un handle de resize
    // (votre logique de détection ici)
    
    if (isResizeClick && handleInfo) {
      // Mode resize
      isResizing3D = true
      isDragging3D = false
      resizeStartPosition = { x: canvasCoords.x, y: canvasCoords.y }
      resizeHandleInfo = handleInfo
      emit('3d-resize-start', { canvasX: canvasCoords.x, canvasY: canvasCoords.y, handleInfo })
    } else {
      // Mode drag
      isDragging3D = true
      isResizing3D = false
      emit('3d-drag-start', {
        canvasX: canvasCoords.x,
        canvasY: canvasCoords.y
      })
    }
    
    lastDragPosition = canvasCoords
    
    // Désactiver les contrôles de caméra pendant l'interaction
    if (controls) {
      controls.enabled = false
    }
  }
}
```

#### `onMouseMove` - Suivi du mouvement
```javascript
const onMouseMove = (event) => {
  const canvasCoords = getCanvasCoords(event)
  
  if (!props.dragMode) return
  
  if (isDragging3D || isResizing3D) {
    if (canvasCoords !== null) {
      if (isResizing3D && resizeStartPosition && resizeHandleInfo) {
        // Mode redimensionnement
        emit('3d-resize', {
          canvasX: canvasCoords.x,
          canvasY: canvasCoords.y,
          startX: resizeStartPosition.x,
          startY: resizeStartPosition.y,
          handleInfo: resizeHandleInfo
        })
      } else if (isDragging3D) {
        // Mode déplacement
        emit('3d-drag', {
          canvasX: canvasCoords.x,
          canvasY: canvasCoords.y
        })
      }
      lastDragPosition = canvasCoords
    }
  }
}
```

#### `onMouseUp` - Fin du drag
```javascript
const onMouseUp = (event) => {
  if (isDragging3D || isResizing3D) {
    if (isResizing3D) {
      emit('3d-resize-end')
      isResizing3D = false
      resizeStartPosition = null
      resizeHandleInfo = null
    }
    
    if (isDragging3D) {
      emit('3d-drag-end')
      isDragging3D = false
    }
    
    // Réactiver les contrôles de caméra
    if (controls) {
      controls.enabled = true
    }
  }
}
```

#### Enregistrement des event listeners
```javascript
onMounted(() => {
  const canvas = renderer.domElement
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseup', onMouseUp)
})

onUnmounted(() => {
  const canvas = renderer.domElement
  canvas.removeEventListener('mousedown', onMouseDown)
  canvas.removeEventListener('mousemove', onMouseMove)
  canvas.removeEventListener('mouseup', onMouseUp)
})
```

### 3. Gestion du drag dans le composant parent

#### Variables d'état
```javascript
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const dragStartPos = ref({ x: 0, y: 0 })
```

#### `on3DDragStart` - Calcul du décalage initial
```javascript
const on3DDragStart = (clickData) => {
  if (!dragMode.value) return
  
  // Vérifier que les coordonnées sont valides
  if (clickData.canvasX === undefined || clickData.canvasY === undefined || 
      clickData.canvasX === null || clickData.canvasY === null) {
    return
  }
  
  isDragging.value = true
  
  // Obtenir l'objet actif sur le canvas 2D
  const canvas = fabricDesignerRef.value.getCanvas()
  const activeObject = canvas?.getActiveObject()
  
  if (activeObject) {
    // Calculer les dimensions réelles avec le scale
    const objWidth = (activeObject.width || 50) * (activeObject.scaleX || 1)
    const objHeight = (activeObject.height || 50) * (activeObject.scaleY || 1)
    
    // Obtenir l'origine de l'objet
    const originX = activeObject.originX || 'left'
    const originY = activeObject.originY || 'top'
    
    // Calculer la position du coin haut-gauche de l'objet
    let objLeft = activeObject.left || 0
    let objTop = activeObject.top || 0
    
    // Ajuster selon l'origine
    if (originX === 'center') {
      objLeft = objLeft - objWidth / 2
    } else if (originX === 'right') {
      objLeft = objLeft - objWidth
    }
    
    if (originY === 'center') {
      objTop = objTop - objHeight / 2
    } else if (originY === 'bottom') {
      objTop = objTop - objHeight
    }
    
    // Calculer le décalage entre le point de clic et le coin haut-gauche
    dragOffset.value = {
      x: clickData.canvasX - objLeft,
      y: clickData.canvasY - objTop
    }
    
    dragStartPos.value = { x: clickData.canvasX, y: clickData.canvasY }
  }
  
  // Activer le flag de drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragState) {
    threeSceneRef.value.setDragState(true)
  }
}
```

#### `on3DDrag` - Déplacement de l'objet
```javascript
const on3DDrag = (clickData) => {
  if (!dragMode.value || !isDragging.value) return
  
  // Vérifier que les coordonnées sont valides
  if (clickData.canvasX === undefined || clickData.canvasY === undefined || 
      clickData.canvasX === null || clickData.canvasY === null) {
    return
  }
  
  // Calculer la position de l'objet en soustrayant le décalage initial
  const targetX = clickData.canvasX - dragOffset.value.x
  const targetY = clickData.canvasY - dragOffset.value.y
  
  // Déplacer l'objet sélectionné sur le canvas 2D
  if (fabricDesignerRef.value && fabricDesignerRef.value.moveSelectedObject) {
    fabricDesignerRef.value.moveSelectedObject(targetX, targetY)
  }
}
```

#### `on3DDragEnd` - Nettoyage
```javascript
const on3DDragEnd = () => {
  isDragging.value = false
  
  // Réinitialiser le décalage
  dragOffset.value = { x: 0, y: 0 }
  dragStartPos.value = { x: 0, y: 0 }
  
  // Désactiver le drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragState) {
    threeSceneRef.value.setDragState(false)
  }
}
```

### 4. Méthode `moveSelectedObject` dans le canvas 2D

```javascript
const moveSelectedObject = (x, y) => {
  const canvas = getCanvas()
  const activeObject = canvas.getActiveObject()
  
  if (!activeObject) return
  
  // Obtenir les dimensions et l'origine
  const objWidth = (activeObject.width || 50) * (activeObject.scaleX || 1)
  const objHeight = (activeObject.height || 50) * (activeObject.scaleY || 1)
  const originX = activeObject.originX || 'left'
  const originY = activeObject.originY || 'top'
  
  // Ajuster la position selon l'origine
  let finalX = x
  let finalY = y
  
  if (originX === 'center') {
    finalX = x + objWidth / 2
  } else if (originX === 'right') {
    finalX = x + objWidth
  }
  
  if (originY === 'center') {
    finalY = y + objHeight / 2
  } else if (originY === 'bottom') {
    finalY = y + objHeight
  }
  
  // Déplacer l'objet
  activeObject.set({
    left: finalX,
    top: finalY
  })
  
  canvas.renderAll()
}
```

## Points importants à respecter

### 1. Raycasting Three.js
- Utiliser `THREE.Raycaster` pour détecter les intersections avec le modèle 3D
- Normaliser les coordonnées de la souris en coordonnées NDC (-1 à 1)
- Vérifier que le mesh a des coordonnées UV valides

### 2. Conversion UV → Canvas
- Les coordonnées UV sont normalisées (0-1)
- U correspond à l'axe horizontal (X)
- V correspond à l'axe vertical (Y)
- Tenir compte des zones de travail (work zones) pour exclure certaines parties
- Inverser l'axe Y si nécessaire selon la configuration de la texture

### 3. Calcul du décalage (dragOffset)
- Calculer UNE SEULE FOIS au début du drag
- Prendre en compte l'origine de l'objet (left, center, right / top, center, bottom)
- Prendre en compte le scale de l'objet pour les dimensions réelles

### 4. Désactivation des contrôles de caméra
- Désactiver OrbitControls pendant le drag pour éviter les conflits
- Réactiver les contrôles à la fin du drag

### 5. Gestion des événements
- Utiliser `mousedown` pour détecter le début
- Utiliser `mousemove` pour suivre le mouvement
- Utiliser `mouseup` pour détecter la fin
- Nettoyer les event listeners dans `onUnmounted`

### 6. Validation des coordonnées
- Toujours vérifier que les coordonnées sont valides (non null, non undefined)
- Retourner null si le point est hors zone de travail
- Gérer les cas où le raycast ne trouve pas d'intersection

## Structure des événements émis

```javascript
// Début du drag
emit('3d-drag-start', {
  canvasX: number,  // Position X sur le canvas 2D
  canvasY: number   // Position Y sur le canvas 2D
})

// Pendant le drag
emit('3d-drag', {
  canvasX: number,  // Position X actuelle sur le canvas 2D
  canvasY: number   // Position Y actuelle sur le canvas 2D
})

// Fin du drag
emit('3d-drag-end')
```

## Dépendances nécessaires

- `three` - Bibliothèque Three.js pour le rendu 3D
- `@tresjs/core` (optionnel) - Wrapper Vue pour Three.js
- Canvas 2D (Fabric.js, Konva, ou autre) pour gérer les objets 2D

## Exemple d'utilisation

```vue
<template>
  <div>
    <ThreeScene
      ref="threeSceneRef"
      :model-url="modelUrl"
      :canvas2D="canvas2D"
      :drag-mode="dragMode"
      :work-zone-top="0.1"
      :work-zone-bottom="0.1"
      @3d-drag-start="on3DDragStart"
      @3d-drag="on3DDrag"
      @3d-drag-end="on3DDragEnd"
    />
    
    <FabricDesigner
      ref="fabricDesignerRef"
      :canvas="canvas2D"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import ThreeScene from './components/ThreeScene.vue'
import FabricDesigner from './components/FabricDesigner.vue'

const dragMode = ref(false)
const threeSceneRef = ref(null)
const fabricDesignerRef = ref(null)
const canvas2D = ref(null)

const on3DDragStart = (clickData) => {
  // Calculer dragOffset
}

const on3DDrag = (clickData) => {
  // Déplacer l'objet
}

const on3DDragEnd = () => {
  // Nettoyer
}
</script>
```

## Notes supplémentaires

- Le système doit être performant pour gérer les mises à jour en temps réel
- Gérer les cas où l'utilisateur sort de la zone du modèle pendant le drag
- Prévoir une distinction entre drag et resize (détection des handles)
- Gérer les cas où plusieurs objets peuvent être sélectionnés
- Implémenter un système de throttling si nécessaire pour améliorer les performances

