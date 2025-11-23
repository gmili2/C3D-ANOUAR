# 📚 Explication détaillée : `initCanvas()` et `updateHasSelection()`

## 🎯 Vue d'ensemble

Ces deux fonctions sont au cœur du système de gestion du canvas 2D dans `FabricDesigner.vue`.

---

## 1️⃣ `updateHasSelection()` - Fonction simple

### **Rôle**

Mettre à jour l'état réactif `hasSelection` pour indiquer si un objet est actuellement sélectionné sur le canvas.

### **Code**

```javascript
const updateHasSelection = () => {
  if (!canvas) {
    hasSelection.value = false;
    return;
  }
  const activeObject = canvas.getActiveObject();
  hasSelection.value = activeObject !== null && activeObject !== undefined;
};
```

### **Fonctionnement**

1. **Vérification** : Si le canvas n'existe pas → `hasSelection = false`
2. **Récupération** : Obtenir l'objet actif avec `canvas.getActiveObject()`
3. **Mise à jour** : `hasSelection = true` si un objet existe, `false` sinon

### **Utilisation**

Cette variable réactive est utilisée dans le template pour :

- Activer/désactiver des boutons (ex: "Supprimer", "Appliquer couleur")
- Afficher/masquer des contrôles
- Conditionner certaines actions

```vue
<button :disabled="!hasSelection">
  🎨 Appliquer couleur
</button>
```

---

## 2️⃣ `initCanvas()` - Fonction complexe et centrale

### **Rôle**

Initialiser le canvas Fabric.js avec toutes ses configurations, événements et comportements. C'est le **cœur du système 2D**.

---

## 📖 Explication détaillée de `initCanvas()`

### **Phase 1 : Création du canvas Fabric.js** (lignes 1178-1198)

```javascript
canvas = new Canvas(canvasElement.value, {
  width: canvasWidth, // 500px (exemple)
  height: canvasHeight, // 500px
  backgroundColor: "#ffffff", // Fond blanc
  selection: true, // Permettre la sélection
  moveCursor: "move", // Curseur pendant le déplacement
  defaultCursor: "default", // Curseur par défaut
  enableRetinaScaling: false, // ⚠️ IMPORTANT : Désactiver le scaling retina
  uniformScaling: false, // Permettre resize non-uniforme
  centeredScaling: false, // Resize depuis le coin (pas le centre)
  centeredRotation: false, // Rotation depuis le centre
  controlsAboveOverlay: false, // Contrôles au-dessus
});
```

#### **Pourquoi `enableRetinaScaling: false` ?**

Sur les écrans Retina (MacBook, iPhone), le `devicePixelRatio` est 2 ou 3. Si activé, Fabric.js double/triple les dimensions internes du canvas, ce qui crée un **décalage** entre :

- Les coordonnées 2D (Fabric.js)
- Les coordonnées 3D projetées (ThreeScene)

En désactivant, on garantit que `canvas.width = canvasElement.width`.

---

### **Phase 2 : Forcer les dimensions exactes** (lignes 1200-1207)

```javascript
if (canvasElement.value) {
  canvasElement.value.width = canvasWidth; // Dimension logique
  canvasElement.value.height = canvasHeight;
  canvasElement.value.style.width = `${canvasWidth}px`; // Dimension CSS
  canvasElement.value.style.height = `${canvasHeight}px`;
}
```

Cela garantit une **cohérence parfaite** entre :

- Dimensions logiques (pour les calculs)
- Dimensions CSS (pour l'affichage)

---

### **Phase 3 : Personnalisation des contrôles** (lignes 1213-1243)

#### **Fonction `customizeControls(obj)`**

```javascript
const customizeControls = (obj) => {
  Object.keys(obj.controls).forEach((controlName) => {
    const control = obj.controls[controlName];

    // Style des contrôles
    control.fill = "transparent"; // Carré vide
    control.stroke = "#3b82f6"; // Bordure bleue
    control.strokeWidth = 1; // Bordure fine
    control.sizeX = 12; // Largeur 12px
    control.sizeY = 12; // Hauteur 12px

    // Position des contrôles (offset)
    if (controlName === "mt") {
      control.y = -2; // Déplacer vers le haut
    }
    // ... autres contrôles
  });
};
```

**Résultat visuel** :

```
Avant :                  Après :
● ─── ● ─── ●           □ ─── □ ─── □
│           │           │           │
●     ●     ●    →      □     ●     □
│           │           │           │
● ─── ● ─── ●           □ ─── □ ─── □

● = carrés pleins       □ = carrés vides bleus
```

---

### **Phase 4 : Activation des contrôles** (lignes 1245-1261)

#### **Fonction `enableScalingControls(obj)`**

```javascript
const enableScalingControls = (obj) => {
  obj.setControlsVisibility({
    mt: true, // Middle-top (bord haut)
    mb: true, // Middle-bottom (bord bas)
    ml: true, // Middle-left (bord gauche)
    mr: true, // Middle-right (bord droit)
    tl: true, // Top-left (coin haut-gauche)
    tr: true, // Top-right (coin haut-droit)
    bl: true, // Bottom-left (coin bas-gauche)
    br: true, // Bottom-right (coin bas-droit)
    mtr: true, // Middle-top-rotate (rotation)
  });
};
```

**Schéma des contrôles** :

```
    tl ─── mt ─── tr
    │              │
    ml     ●      mr    ● = centre de l'objet
    │              │    mtr = contrôle de rotation
    bl ─── mb ─── br
           │
          mtr
```

---

### **Phase 5 : Événements du canvas** (lignes 1265-1795)

C'est la **partie la plus importante** ! Fabric.js émet des événements pour chaque action, et on les écoute pour :

- Sauvegarder l'historique (undo/redo)
- Synchroniser avec le 3D
- Gérer les copies wrap-around
- Mettre à jour l'interface

#### **5.1 - Événement `object:added`** (lignes 1265-1295)

```javascript
canvas.on("object:added", (e) => {
  const obj = e.target;

  // Appliquer la configuration des contrôles
  if (obj.userData?.controlsConfig) {
    obj.setControlsVisibility(obj.userData.controlsConfig);
    if (obj.userData?.customizeControls) {
      customizeControls(obj);
    }
  } else {
    enableScalingControls(obj); // Activer tous les contrôles par défaut
  }

  // Rendre l'objet sélectionnable
  obj.selectable = true;
  obj.evented = true;
});
```

**Quand ?** Chaque fois qu'un objet est ajouté au canvas (texte, image, forme).

**Pourquoi ?** Pour s'assurer que l'objet a les bons contrôles et est interactif.

---

#### **5.2 - Événement `selection:created`** (lignes 1343-1407)

```javascript
canvas.on("selection:created", (e) => {
  updateObjectsList2D(); // Mettre à jour la liste des objets
  updateHasSelection(); // hasSelection = true

  const activeObject = e.selected?.[0] || canvas.getActiveObject();

  if (activeObject && !activeObject.userData?.isWorkZoneIndicator) {
    // Mettre à jour l'angle de rotation
    rotationAngle.value = activeObject.angle || 0;

    // Activer les contrôles
    enableScalingControls(activeObject);

    // Gérer les copies wrap-around
    const original = activeObject.userData?.isWrapAroundCopy
      ? activeObject.userData.originalObject
      : activeObject;

    if (original) {
      // Ajouter l'original et ses copies à la liste multi-sélection
      canvas.userData.multiSelectedObjects = [original];

      const copies = wrapAroundCopies.get(original);
      if (copies && copies.length > 0) {
        copies.forEach((copy) => {
          activateControlsForObject(copy);
          canvas.userData.multiSelectedObjects.push(copy);
        });
      }
    }

    // Émettre l'événement vers le parent
    emit("object-selected", {
      object: activeObject,
      type: activeObject.type,
    });
  }
});
```

**Quand ?** Quand l'utilisateur sélectionne un objet pour la première fois.

**Pourquoi ?**

1. Activer les contrôles de l'objet
2. Gérer les copies wrap-around (afficher leurs contrôles aussi)
3. Notifier le parent (DesignStudio) pour activer le mode drag 3D

---

#### **5.3 - Événement `selection:updated`** (lignes 1409-1472)

Identique à `selection:created`, mais appelé quand on **change** de sélection (passer d'un objet à un autre).

---

#### **5.4 - Événement `selection:cleared`** (lignes 1474-1483)

```javascript
canvas.on("selection:cleared", () => {
  updateHasSelection(); // hasSelection = false

  // Vider la liste des objets multi-sélectionnés
  if (canvas.userData?.multiSelectedObjects) {
    canvas.userData.multiSelectedObjects = [];
  }

  emit("object-deselected");
  updateObjectsList2D();
});
```

**Quand ?** Quand l'utilisateur désélectionne (clic en dehors).

**Pourquoi ?** Nettoyer l'état et notifier le parent pour désactiver le mode drag 3D.

---

#### **5.5 - Événement `object:modified`** (lignes 1498-1521)

```javascript
canvas.on("object:modified", (e) => {
  updateObjectsList2D();
  const obj = e.target;

  // Synchroniser les copies wrap-around
  if (obj && !obj.userData?.isWrapAroundCopy) {
    syncAllCopiesWithOriginal(obj);
    applyWrapAround(obj);
  }

  signalChange(); // Sauvegarder + mettre à jour texture

  // Émettre l'événement de sélection
  const activeObject = canvas.getActiveObject();
  if (activeObject) {
    emit("object-selected", {
      object: activeObject,
      type: activeObject.type,
    });
  }
});
```

**Quand ?** Après toute modification (déplacement, resize, rotation).

**Pourquoi ?**

1. Synchroniser les copies wrap-around
2. Sauvegarder l'historique
3. Mettre à jour la texture 3D

---

#### **5.6 - Événement `object:moving`** (lignes 1535-1566)

```javascript
canvas.on("object:moving", async (e) => {
  const obj = e.target;

  if (obj.userData?.isWrapAroundCopy) {
    // Copie qui bouge → synchroniser avec l'original
    syncCopyWithOriginal(obj);
  } else {
    // Original qui bouge → mettre à jour les copies
    await applyWrapAround(obj);
  }

  // Mise à jour en temps réel (RAPIDE)
  canvas.renderAll();
  if (props.updateTextureDirect) {
    props.updateTextureDirect(); // ~0-16ms (bypass du store)
  } else {
    requestTextureUpdate(); // Fallback
  }
});
```

**Quand ?** Pendant le déplacement (chaque frame).

**Pourquoi ?**

1. Mettre à jour les copies wrap-around en temps réel
2. Mettre à jour la texture 3D **immédiatement** pour un feedback fluide

---

#### **5.7 - Événement `object:scaling`** (lignes 1605-1646)

Similaire à `object:moving`, mais pour le redimensionnement.

---

#### **5.8 - Événement `object:rotated`** (lignes 1675-1714)

```javascript
canvas.on("object:rotated", (e) => {
  const obj = e.target;

  obj.setCoords(); // Mettre à jour les coordonnées

  // Mettre à jour l'angle dans l'input
  if (obj === canvas.getActiveObject()) {
    rotationAngle.value = obj.angle || 0;
  }

  // Synchroniser les copies wrap-around
  if (obj && !obj.userData?.isWrapAroundCopy) {
    syncAllCopiesWithOriginal(obj);
  } else if (obj.userData?.isWrapAroundCopy) {
    const original = obj.userData?.originalObject;
    if (original) {
      original.set({ angle: obj.angle });
      original.setCoords();
      syncAllCopiesWithOriginal(original);
    }
  }

  // Émettre l'événement pour le 3D
  emit("object-rotated", {
    object: obj,
    angle: obj.angle || 0,
  });

  saveHistory();
  signalChange();
});
```

**Quand ?** Après une rotation.

**Pourquoi ?**

1. Synchroniser les copies wrap-around
2. Notifier le parent pour appliquer la rotation au modèle 3D

---

#### **5.9 - Événement `mouse:move`** (lignes 1720-1795)

```javascript
canvas.on('mouse:move', (e) => {
  const pointer = canvas.getPointer(e.e)
  const x = pointer.x
  const y = pointer.y

  // Mettre à jour les coordonnées du curseur
  cursorCoords2D.value = { x, y }

  const activeObject = canvas.getActiveObject()

  if (activeObject) {
    // Détecter le contrôle survolé
    const handleInfo = detectResizeHandle(activeObject, x, y, 10)

    if (handleInfo) {
      // Calculer les coordonnées du contrôle
      const controls = calculateControlCoordinates2D(activeObject)
      const controlCoords = controls[handleInfo.handle]

      // Calculer la distance
      const distance = Math.sqrt(
        Math.pow(x - controlCoords.x, 2) +
        Math.pow(y - controlCoords.y, 2)
      )

      // Mettre à jour l'état de débogage
      detectedControl2D.value = {
        show: true,
        handle: handleInfo.handle,
        corner: handleInfo.corner,
        edge: handleInfo.edge,
        isRotation: handleInfo.isRotation,
        distance: distance,
        x: controlCoords.x,
        y: controlCoords.y
      }
    } else {
      // Aucun contrôle détecté
      detectedControl2D.value = { show: false, ... }
    }
  }
})
```

**Quand ?** À chaque mouvement de la souris sur le canvas.

**Pourquoi ?**

1. Afficher les coordonnées du curseur (débogage)
2. Détecter quel contrôle est survolé (débogage)
3. Afficher les informations dans l'interface

---

### **Phase 6 : Initialisation finale** (lignes 1307-1339)

```javascript
// Activer le mode dessin si nécessaire
canvas.isDrawingMode = isDrawMode.value;
if (canvas.freeDrawingBrush) {
  canvas.freeDrawingBrush.width = drawWidth.value;
  canvas.freeDrawingBrush.color = drawColor.value;
}

// Forcer un rendu initial
canvas.renderAll();

// Dessiner les indicateurs de zone de travail
nextTick(() => {
  setTimeout(() => {
    drawWorkZoneIndicators();
  }, 100);
});

// Sauvegarder l'état initial
saveHistory();
```

**Pourquoi ?**

1. Configurer le pinceau de dessin
2. Afficher le canvas immédiatement
3. Dessiner les zones de travail (bandes vertes)
4. Sauvegarder l'état initial pour l'undo/redo

---

## 🔄 Diagramme de flux

```
onMounted
    ↓
initCanvas()
    ↓
┌───────────────────────────────────────┐
│ 1. Créer le canvas Fabric.js         │
│ 2. Forcer les dimensions              │
│ 3. Personnaliser les contrôles        │
│ 4. Configurer les événements          │
│ 5. Initialiser le mode dessin         │
│ 6. Sauvegarder l'historique           │
└───────────────────────────────────────┘
    ↓
Canvas prêt et réactif
    ↓
┌───────────────────────────────────────┐
│ Événements en continu :               │
│ - object:added                        │
│ - selection:created                   │
│ - object:moving                       │
│ - object:modified                     │
│ - mouse:move                          │
│ - etc.                                │
└───────────────────────────────────────┘
```

---

## 📊 Résumé des événements

| Événement           | Quand ?                 | Actions                                             |
| ------------------- | ----------------------- | --------------------------------------------------- |
| `object:added`      | Objet ajouté            | Activer contrôles, sauvegarder                      |
| `selection:created` | Première sélection      | Activer contrôles, émettre event, gérer wrap-around |
| `selection:updated` | Changement de sélection | Idem `selection:created`                            |
| `selection:cleared` | Désélection             | Nettoyer état, émettre event                        |
| `object:modified`   | Après modification      | Synchroniser copies, sauvegarder                    |
| `object:moving`     | Pendant déplacement     | Mettre à jour copies, texture (temps réel)          |
| `object:scaling`    | Pendant resize          | Idem `object:moving`                                |
| `object:rotated`    | Après rotation          | Synchroniser copies, émettre event                  |
| `mouse:move`        | Mouvement souris        | Détecter contrôles, afficher infos                  |

---

## 🎯 Points clés

### 1. **Désactivation du Retina Scaling**

```javascript
enableRetinaScaling: false;
```

**Crucial** pour la cohérence entre 2D et 3D !

### 2. **Contrôles personnalisés**

Carrés vides bleus au lieu des carrés pleins par défaut.

### 3. **Wrap-around**

Gestion automatique des copies pour l'effet de texture répétée.

### 4. **Mise à jour temps réel**

Utilisation de `updateTextureDirect()` pour un feedback fluide pendant le déplacement/resize.

### 5. **Historique**

Sauvegarde automatique après chaque modification pour l'undo/redo.

---

## 🐛 Débogage

Pour déboguer `initCanvas()`, surveillez :

```javascript
console.log("Canvas créé:", canvas);
console.log("Dimensions:", canvas.width, "x", canvas.height);
console.log("Retina scaling:", canvas.enableRetinaScaling);
console.log("Objets:", canvas.getObjects().length);
```

Pour déboguer les événements :

```javascript
canvas.on("object:added", (e) => {
  console.log("✅ Objet ajouté:", e.target.type);
});

canvas.on("selection:created", (e) => {
  console.log("🎯 Sélection créée:", e.selected);
});
```
