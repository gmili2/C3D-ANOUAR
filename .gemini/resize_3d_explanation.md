# 🔧 Comment fonctionne le Resize depuis la vue 3D

## 📋 Vue d'ensemble

Le système de resize 3D permet à l'utilisateur de redimensionner un élément 2D (texte, image, forme) en cliquant et en glissant sur les **handles de redimensionnement** directement sur le modèle 3D du gobelet.

## 🎯 Composants impliqués

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   ThreeScene    │  ←───→  │  DesignStudio    │  ←───→  │ FabricDesigner  │
│   (Vue 3D)      │         │   (Coordinateur) │         │   (Canvas 2D)   │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

## 🔄 Flux complet du Resize

### **Phase 1 : Détection du clic sur un handle** 🖱️

#### 1.1 - L'utilisateur clique sur le modèle 3D

```javascript
// ThreeScene.vue - onMouseDown()
const onMouseDown = (event) => {
  // Convertir le clic 3D en coordonnées 2D du canvas
  const canvasCoords = getCanvasCoords(event);
  // canvasCoords = { x: 250, y: 180 } (exemple)
};
```

#### 1.2 - ThreeScene demande la détection du handle

```javascript
// ThreeScene.vue - onMouseDown()
const detectResizeResult = { isResize: false, handleInfo: null };

// Émettre un événement SYNCHRONE vers DesignStudio
emit("detect-resize-handle", {
  canvasX: canvasCoords.x, // 250
  canvasY: canvasCoords.y, // 180
  result: detectResizeResult, // Objet qui sera modifié
});
```

#### 1.3 - DesignStudio détecte le handle

```javascript
// DesignStudio.vue - onDetectResizeHandle()
const onDetectResizeHandle = (data) => {
  const canvas = fabricDesignerRef.value.getCanvas();
  const activeObject = canvas?.getActiveObject();

  // Demander à FabricDesigner de détecter le handle
  const handleInfo = fabricDesignerRef.value.detectResizeHandle(
    activeObject,
    data.canvasX, // 250
    data.canvasY // 180
  );

  if (handleInfo) {
    // Modifier l'objet result (passage par référence)
    data.result.isResize = true;
    data.result.handleInfo = {
      corner: "br", // Bottom-right corner
      handle: "br",
      x: 250,
      y: 180,
    };
  }
};
```

#### 1.4 - FabricDesigner détecte le handle

```javascript
// FabricDesigner.vue - detectResizeHandle()
const detectResizeHandle = (obj, x, y) => {
  // Calculer les coordonnées des contrôles de l'objet
  const coords = obj.oCoords || obj.calcCoords();

  // Vérifier la distance entre le clic et chaque handle
  const threshold = 20; // pixels

  // Vérifier les coins (tl, tr, bl, br)
  if (distance(x, y, coords.br.x, coords.br.y) <= threshold) {
    return {
      corner: "br",
      handle: "br",
      x: coords.br.x,
      y: coords.br.y,
    };
  }

  // Vérifier les bords (mt, mb, ml, mr)
  // ...

  return null; // Aucun handle détecté
};
```

### **Phase 2 : Activation du mode Resize** 🔧

#### 2.1 - ThreeScene active le mode resize

```javascript
// ThreeScene.vue - onMouseDown()
if (detectResizeResult.isResize && detectResizeResult.handleInfo) {
  // C'EST UN RESIZE !
  isResizing3D = true;
  isDragging3D = false;
  resizeStartPosition = { x: canvasCoords.x, y: canvasCoords.y };
  resizeHandleInfo = detectResizeResult.handleInfo;

  // Émettre l'événement de début de resize
  emit("3d-resize-start", {
    canvasX: canvasCoords.x, // 250
    canvasY: canvasCoords.y, // 180
    handleInfo: detectResizeResult.handleInfo,
  });

  console.log("🔧 Mode RESIZE activé", handleInfo);
}
```

#### 2.2 - DesignStudio active le mode resize

```javascript
// DesignStudio.vue - on3DResizeStart()
const on3DResizeStart = (resizeData) => {
  isResizing.value = true;
  isDragging.value = false;
  resizeStartPos.value = { x: 250, y: 180 };
  currentResizeHandle.value = resizeData.handleInfo;

  console.log("🔧 Début du RESIZE", resizeData.handleInfo);
};
```

### **Phase 3 : Mouvement de la souris (Resize en cours)** 🖱️➡️

#### 3.1 - L'utilisateur déplace la souris

```javascript
// ThreeScene.vue - onMouseMove()
const onMouseMove = (event) => {
  const canvasCoords = getCanvasCoords(event);
  // canvasCoords = { x: 300, y: 230 } (nouvelle position)

  if (isResizing3D && resizeStartPosition && resizeHandleInfo) {
    // Émettre l'événement de resize en cours
    emit("3d-resize", {
      canvasX: canvasCoords.x, // 300 (position actuelle)
      canvasY: canvasCoords.y, // 230
      startX: resizeStartPosition.x, // 250 (position de départ)
      startY: resizeStartPosition.y, // 180
      handleInfo: resizeHandleInfo, // { corner: 'br', ... }
    });
  }
};
```

#### 3.2 - DesignStudio transmet à FabricDesigner

```javascript
// DesignStudio.vue - on3DResize()
const on3DResize = (resizeData) => {
  if (!isResizing.value) return;

  // Appeler la fonction de resize de FabricDesigner
  fabricDesignerRef.value.resizeSelectedObjectFromHandle(
    resizeData.canvasX, // 300 (position actuelle)
    resizeData.canvasY, // 230
    resizeData.startX, // 250 (position de départ)
    resizeData.startY, // 180
    resizeData.handleInfo // { corner: 'br', ... }
  );
};
```

#### 3.3 - FabricDesigner redimensionne l'objet

```javascript
// FabricDesigner.vue - resizeSelectedObjectFromHandle()
const resizeSelectedObjectFromHandle = async (
  x,
  y,
  startX,
  startY,
  handleInfo
) => {
  const activeObject = canvas.getActiveObject();

  // 1. Obtenir les dimensions originales
  const originalWidth = activeObject.width; // 100
  const originalHeight = activeObject.height; // 80

  // 2. Stocker l'état initial (au premier appel)
  if (!activeObject.userData.initialScaleOnResize) {
    activeObject.userData.initialScaleOnResize = {
      scaleX: activeObject.scaleX || 1, // 1.0
      scaleY: activeObject.scaleY || 1, // 1.0
      left: activeObject.left || 0, // 100
      top: activeObject.top || 0, // 150
    };
  }

  const initialScale = activeObject.userData.initialScaleOnResize;
  const initialWidth = originalWidth * initialScale.scaleX; // 100
  const initialHeight = originalHeight * initialScale.scaleY; // 80

  // 3. Calculer les deltas (différence de position)
  const deltaX = x - startX; // 300 - 250 = 50
  const deltaY = y - startY; // 230 - 180 = 50

  // 4. Gérer la rotation de l'objet
  const angle = ((activeObject.angle || 0) * Math.PI) / 180;
  const cosAngle = Math.cos(-angle);
  const sinAngle = Math.sin(-angle);

  // Transformer les deltas dans le système local de l'objet
  const localDeltaX = deltaX * cosAngle - deltaY * sinAngle;
  const localDeltaY = deltaX * sinAngle + deltaY * cosAngle;

  // 5. Calculer le nouveau scale selon le handle
  let newScaleX = initialScale.scaleX;
  let newScaleY = initialScale.scaleY;
  let newLeft = initialScale.left;
  let newTop = initialScale.top;

  if (handleInfo.corner === "br") {
    // Coin bas-droite : agrandir depuis le coin haut-gauche
    newScaleX = (initialWidth + localDeltaX) / originalWidth;
    newScaleY = (initialHeight + localDeltaY) / originalHeight;
    // La position ne change pas (on agrandit vers la droite et le bas)
  } else if (handleInfo.corner === "tl") {
    // Coin haut-gauche : agrandir depuis le coin bas-droite
    newScaleX = (initialWidth - localDeltaX) / originalWidth;
    newScaleY = (initialHeight - localDeltaY) / originalHeight;
    // La position change (on agrandit vers la gauche et le haut)
    newLeft = initialScale.left + deltaX;
    newTop = initialScale.top + deltaY;
  }
  // ... autres coins et bords

  // 6. Limiter le scale (entre 0.1 et 10)
  newScaleX = Math.max(0.1, Math.min(10, newScaleX));
  newScaleY = Math.max(0.1, Math.min(10, newScaleY));

  // 7. Appliquer les transformations
  activeObject.set({
    scaleX: newScaleX, // 1.5 (150% de la taille originale)
    scaleY: newScaleY, // 1.625 (162.5%)
    left: newLeft, // 100 (inchangé pour 'br')
    top: newTop, // 150 (inchangé pour 'br')
  });

  activeObject.setCoords();

  // 8. Mettre à jour les copies wrap-around
  await applyWrapAround(activeObject);

  // 9. Rafraîchir le canvas
  canvas.renderAll();
  requestTextureUpdate();
  emit("design-updated", canvas);
};
```

### **Phase 4 : Relâchement de la souris (Fin du resize)** 🖱️⬆️

#### 4.1 - ThreeScene détecte le relâchement

```javascript
// ThreeScene.vue - onMouseUp()
const onMouseUp = (event) => {
  if (isResizing3D) {
    // Émettre l'événement de fin de resize
    emit("3d-resize-end");

    // Réinitialiser les flags
    isResizing3D = false;
    resizeStartPosition = null;
    resizeHandleInfo = null;

    // Réactiver les contrôles OrbitControls
    if (controls) {
      controls.enabled = true;
    }
  }
};
```

#### 4.2 - DesignStudio nettoie l'état

```javascript
// DesignStudio.vue - on3DResizeEnd()
const on3DResizeEnd = () => {
  // Réinitialiser les données de resize dans FabricDesigner
  if (fabricDesignerRef.value && fabricDesignerRef.value.resetResizeData) {
    const canvas = fabricDesignerRef.value.getCanvas();
    const activeObject = canvas?.getActiveObject();
    if (activeObject) {
      fabricDesignerRef.value.resetResizeData(activeObject);
    }
  }

  // Réinitialiser les variables locales
  isResizing.value = false;
  resizeStartPos.value = { x: 0, y: 0 };
  currentResizeHandle.value = null;
};
```

#### 4.3 - FabricDesigner nettoie les données temporaires

```javascript
// FabricDesigner.vue - resetResizeData()
const resetResizeData = (obj) => {
  if (obj && obj.userData && obj.userData.initialScaleOnResize) {
    // Supprimer les données temporaires stockées pendant le resize
    delete obj.userData.initialScaleOnResize;
  }
};
```

## 🎨 Gestion de la rotation

Un aspect crucial du resize est la **gestion de la rotation**. Quand un objet est tourné, les handles ne sont plus alignés avec les axes X/Y du canvas.

### Exemple avec un rectangle tourné de 45°

```
Sans rotation (0°):          Avec rotation (45°):
┌─────────────┐              ╱╲
│             │             ╱  ╲
│   Texte     │            ╱    ╲
│             │           ╱ Texte╲
└─────────────┘          ╱        ╲
                        ╱__________╲
```

### Transformation des coordonnées

```javascript
// Angle de rotation en radians
const angle = ((activeObject.angle || 0) * Math.PI) / 180;

// Matrices de rotation
const cosAngle = Math.cos(-angle); // Rotation inverse
const sinAngle = Math.sin(-angle);

// Transformation du delta (mouvement de la souris)
const localDeltaX = deltaX * cosAngle - deltaY * sinAngle;
const localDeltaY = deltaX * sinAngle + deltaY * cosAngle;
```

Cette transformation permet de calculer le redimensionnement dans le **système de coordonnées local** de l'objet, même s'il est tourné.

## 📊 Diagramme de séquence complet

```
Utilisateur    ThreeScene         DesignStudio       FabricDesigner
    |              |                    |                   |
    |--mousedown-->|                    |                   |
    |              |                    |                   |
    |              |--getCanvasCoords-->|                   |
    |              |                    |                   |
    |              |--detect-resize---->|                   |
    |              |   -handle          |                   |
    |              |                    |--detectResize---->|
    |              |                    |   Handle          |
    |              |                    |<--handleInfo------|
    |              |<--result-----------|                   |
    |              |                    |                   |
    |              |--3d-resize-------->|                   |
    |              |   -start           |                   |
    |              |                    |                   |
    |--mousemove-->|                    |                   |
    |              |                    |                   |
    |              |--3d-resize-------->|                   |
    |              |                    |--resize---------->|
    |              |                    |   FromHandle      |
    |              |                    |                   |
    |              |                    |                   |--[Calcul]
    |              |                    |                   |--[Apply]
    |              |                    |                   |--[Render]
    |              |                    |<--updated---------|
    |              |                    |                   |
    |--mouseup---->|                    |                   |
    |              |                    |                   |
    |              |--3d-resize-end---->|                   |
    |              |                    |--resetResize----->|
    |              |                    |   Data            |
    |              |                    |<--done------------|
    |              |                    |                   |
```

## 🔑 Points clés

### 1. **Détection synchrone**

La détection du handle se fait de manière **synchrone** via l'événement `detect-resize-handle`. Cela permet à ThreeScene de savoir immédiatement si c'est un resize ou un drag.

### 2. **Système de coordonnées**

Le système utilise **trois systèmes de coordonnées** :

- **3D** : Coordonnées du clic sur le modèle 3D
- **2D Canvas** : Coordonnées projetées sur le canvas 2D
- **Local** : Coordonnées dans le système de l'objet (avec rotation)

### 3. **État initial**

L'état initial (scale, position) est stocké **au début du resize** dans `userData.initialScaleOnResize`. Cela permet de calculer les transformations relatives au début du resize, pas à l'état actuel.

### 4. **Handles disponibles**

- **Coins** : `tl`, `tr`, `bl`, `br` (redimensionnement proportionnel)
- **Bords** : `mt`, `mb`, `ml`, `mr` (redimensionnement dans une direction)
- **Rotation** : `mtr` (rotation, pas resize)

### 5. **Wrap-around**

Après chaque resize, les **copies wrap-around** sont mises à jour pour maintenir l'effet de texture répétée sur le gobelet.

## 🐛 Débogage

Pour déboguer le resize, surveillez ces logs :

```javascript
// Détection du handle
console.log("🔍 Handle de resize détecté:", handleInfo);

// Activation du mode resize
console.log("🔧 Mode RESIZE activé", handleInfo);
console.log("🔧 Début du RESIZE", resizeData.handleInfo);

// Pendant le resize
console.log("Delta:", { deltaX, deltaY });
console.log("Local Delta:", { localDeltaX, localDeltaY });
console.log("New Scale:", { newScaleX, newScaleY });
```

## 📝 Résumé

Le resize 3D fonctionne en **4 phases** :

1. **Détection** : Identifier quel handle est cliqué
2. **Activation** : Activer le mode resize
3. **Resize** : Calculer et appliquer les transformations
4. **Fin** : Nettoyer l'état et les données temporaires

La clé du système est la **séparation claire des responsabilités** :

- **ThreeScene** : Gère les interactions 3D et la détection
- **DesignStudio** : Coordonne les événements
- **FabricDesigner** : Applique les transformations sur le canvas 2D
