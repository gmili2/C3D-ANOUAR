
<template>
  <div class="fabric-designer-container">
    <div class="designer-toolbar">
      <button 
        @click="activatePlacementMode('text')" 
        class="toolbar-btn"
      >
        Ajouter du texte
      </button>
      <button 
        @click="activatePlacementMode('circle')" 
        class="toolbar-btn"
      >
        Cercle
      </button>
    </div>
    <div class="fabric-canvas-wrapper">
      <canvas ref="canvasElement" class="fabric-canvas"></canvas>
      <!-- Div de débogage pour afficher les coordonnées des contrôles -->
   
      <!-- Div de débogage pour afficher les coordonnées du curseur -->
    
    </div>
  </div>
</template>

<script setup>

import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { Canvas, Rect, Circle, Textbox, Image as FabricImage, Pattern, ActiveSelection } from 'fabric'
import { useCanvasTextureStore } from '../composables/useCanvasTexture'

const emit = defineEmits([
  'design-updated',          // Le design a été modifié
  'canvas-ready',            // Le canvas est prêt
  'placement-mode-changed',  // Le mode placement a changé
  'object-selected',         // Un objet a été sélectionné
  'object-deselected',       // Aucun objet n'est sélectionné
  'move-object',             // Un objet a été déplacé
  'objects-changed',         // La liste des objets a changé (ajout/suppression)
  'object-rotated'           // Un objet a été roté (pour appliquer la rotation au modèle 3D)
])

// ===== PROPS =====
const props = defineProps({
  updateTextureDirect: {
    type: Function,
    default: null
  },
  canvasWidth: {
    type: Number,
    default: 800  // Largeur du canvas en pixels
  },
  canvasHeight: {
    type: Number,
    default: 600  // Hauteur du canvas en pixels
  },
  on3DClick: {
    type: Function,
    default: null  // Callback pour les clics 3D (déprécié)
  },
  workZoneTop: {
    type: Number,
    default: 0.1  // 10% par défaut - Zone à exclure du haut
  },
  workZoneBottom: {
    type: Number,
    default: 0.1  // 10% par défaut - Zone à exclure du bas
  }
})

// ===== RÉFÉRENCES =====
const canvasElement = ref(null)      // Référence au canvas HTML
const canvasContainer = ref(null)    // Référence au conteneur du canvas
let canvas = null                    // Instance Fabric.js Canvas
let renderTimeout = null             // Timeout pour debounce les rendus

// ===== GESTION DES COPIES POUR WRAP AROUND =====
// Map pour stocker les copies wrap-around des objets
// Clé: objet original, Valeur: tableau de copies
const wrapAroundCopies = new Map()

// ===== ÉTAT DU MODE DE DESSIN =====
const isDrawMode = ref(false)    // Mode dessin libre actif
const drawColor = ref('#000000')  // Couleur du pinceau
const drawWidth = ref(5)          // Largeur du pinceau en pixels
const placementMode = ref(null)   // Mode placement: null, 'circle', 'rectangle', 'text', 'image'
const rotationAngle = ref(0)      // Angle de rotation en degrés

// ===== DÉBOGAGE DES CONTRÔLES 2D =====
const detectedControl2D = ref({
  show: false,
  handle: null,
  corner: null,
  edge: null,
  isRotation: false,
  distance: null,
  x: null,
  y: null
})



// ===== COORDONNÉES DU CURSEUR 2D =====
const cursorCoords2D = ref({
  x: null,
  y: null
})

// ===== DIMENSIONS DU CANVAS =====
// Dimensions réduites pour mieux correspondre au modèle 3D
const canvasWidth = props.canvasWidth || 800
const canvasHeight = props.canvasHeight || 600

// ===== STORE POUR LA SYNCHRONISATION =====
// Store pour signaler les mises à jour de texture à Three.js
// requestTextureUpdate: throttled avec RAF (pour événements fréquents)
// requestTextureUpdateImmediate: immédiat (pour événements critiques)
const { requestTextureUpdate, requestTextureUpdateImmediate } = useCanvasTextureStore()

// ===== SYSTÈME D'HISTORIQUE (UNDO/REDO) =====
let history = []                    // Historique des états du canvas (JSON)
let historyIndex = -1               // Index actuel dans l'historique
const maxHistorySize = 50            // Taille maximale de l'historique
let isUndoRedoInProgress = false    // Flag pour éviter de sauvegarder pendant undo/redo

const canUndo = computed(() => {
  return canvas && historyIndex > 0
})

const canRedo = computed(() => {
  return canvas && historyIndex < history.length - 1
})

// Fonction pour sauvegarder l'historique
const saveHistory = () => {
  if (!canvas || isUndoRedoInProgress) return
  const json = JSON.stringify(canvas.toJSON())
  // Supprimer les éléments futurs si on est au milieu de l'historique
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1)
  }
  history.push(json)
  historyIndex = history.length - 1
  
  // Limiter la taille de l'historique
  if (history.length > maxHistorySize) {
    history.shift()
    historyIndex = history.length - 1
  }
}

// Vérifier si un objet est sélectionné (ref réactive pour la réactivité Vue)
const hasSelection = ref(false)

// Fonction pour mettre à jour hasSelection
const updateHasSelection = () => {
  if (!canvas) {
    hasSelection.value = false
    return
  }
  const activeObject = canvas.getActiveObject()
  hasSelection.value = activeObject !== null && activeObject !== undefined
}

onMounted(async () => {
  await nextTick()
  initCanvas()
})

onUnmounted(() => {
  if (renderTimeout) {
    clearTimeout(renderTimeout)
    renderTimeout = null
  }
  
  // Nettoyer toutes les copies wrap-around
  if (wrapAroundCopies) {
    wrapAroundCopies.forEach((copies, obj) => {
      removeWrapAroundCopies(obj)
    })
    wrapAroundCopies.clear()
  }
  
  if (canvas) {
    canvas.dispose()
    canvas = null
  }
  // Nettoyer les raccourcis clavier
  if (window._fabricKeyboardHandler) {
    window.removeEventListener('keydown', window._fabricKeyboardHandler)
    delete window._fabricKeyboardHandler
  }
})

watch(() => drawColor.value, () => {
  updateBrush()
})

watch(() => drawWidth.value, () => {
  updateBrush()
})

// Watch pour les zones de travail
watch([() => props.workZoneTop, () => props.workZoneBottom], () => {
  if (canvas) {
    drawWorkZoneIndicators()
  }
})

/**
 * Supprime les copies wrap-around d'un objet
 * 
 * @param {fabric.Object} obj - L'objet original (ou une copie)
 */
const removeWrapAroundCopies = (obj) => {
  if (!canvas) return
  
  // Si c'est une copie, trouver l'original
  const original = obj.userData?.isWrapAroundCopy ? obj.userData.originalObject : obj
  
  const copies = wrapAroundCopies.get(original)
  if (copies) {
    // Retirer les copies de la liste des objets multi-sélectionnés avant de les supprimer
    if (canvas.userData?.multiSelectedObjects) {
      copies.forEach(copy => {
        const index = canvas.userData.multiSelectedObjects.indexOf(copy)
        if (index > -1) {
          canvas.userData.multiSelectedObjects.splice(index, 1)
        }
      })
      // Retirer aussi l'original de la liste s'il n'a plus de copies
      const index = canvas.userData.multiSelectedObjects.indexOf(original)
      if (index > -1) {
        canvas.userData.multiSelectedObjects.splice(index, 1)
      }
    }
    
    // Supprimer les copies du canvas
    copies.forEach(copy => {
      canvas.remove(copy)
    })
    wrapAroundCopies.delete(original)
  }
}

/**
 * Vérifie si un objet est complètement hors du canvas
 * 
 * @param {fabric.Object} obj - L'objet à vérifier
 * @returns {boolean} - true si l'objet est complètement hors du canvas
 */
const isCompletelyOutsideCanvas = (obj) => {
  if (!obj || !canvas) return false
  
  const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
  const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
  const objLeft = obj.left || 0
  const objTop = obj.top || 0
  
  const topHeight = canvasHeight * props.workZoneTop
  const bottomHeight = canvasHeight * props.workZoneBottom
  const activeZoneTop = topHeight
  const activeZoneBottom = canvasHeight - bottomHeight
  
  // Vérifier si l'objet est complètement à droite
  if (objLeft > canvasWidth) return true
  // Vérifier si l'objet est complètement à gauche
  if (objLeft + objWidth < 0) return true
  // Vérifier si l'objet est complètement en bas
  if (objTop > activeZoneBottom) return true
  // Vérifier si l'objet est complètement en haut
  if (objTop + objHeight < activeZoneTop) return true
  
  return false
}

/**
 * Remplace l'objet original par une copie et met à jour les références
 * 
 * @param {fabric.Object} original - L'objet original à remplacer
 * @param {fabric.Object} copy - La copie qui devient le nouvel original
 */
const replaceOriginalWithCopy = (original, copy) => {
  if (!canvas || !original || !copy) return
  
  // Vérifier que la copie existe toujours dans le canvas
  const objects = canvas.getObjects()
  if (!objects.includes(copy)) {
    return
  }
  
  // Supprimer toutes les autres copies (sauf celle qui devient l'original)
  const copies = wrapAroundCopies.get(original)
  if (copies) {
    copies.forEach(c => {
      if (c !== copy && objects.includes(c)) {
        canvas.remove(c)
      }
    })
    wrapAroundCopies.delete(original)
  }
  
  // Supprimer l'original du canvas
  if (objects.includes(original)) {
    canvas.remove(original)
  }
  
  // Transformer la copie en original
  // Nettoyer complètement les userData pour éviter toute confusion
  copy.set({
    selectable: true,
    evented: true,
    excludeFromExport: false
  })
  
  // Créer un nouvel userData propre sans références à l'ancien original
  const newUserData = {}
  if (copy.userData) {
    // Copier les autres propriétés utiles mais supprimer les références wrap-around
    Object.keys(copy.userData).forEach(key => {
      if (key !== 'isWrapAroundCopy' && key !== 'originalObject' && key !== 'wrapDirection') {
        newUserData[key] = copy.userData[key]
      }
    })
  }
  copy.userData = newUserData
  
  // S'assurer que isWrapAroundCopy est bien false
  copy.userData.isWrapAroundCopy = false
  copy.userData.originalObject = null
  
  // Mettre à jour la Map pour supprimer toutes les références
  wrapAroundCopies.delete(original)
  
  // Nettoyer toutes les références dans d'autres copies qui pourraient pointer vers l'ancien original
  wrapAroundCopies.forEach((copiesList, orig) => {
    copiesList.forEach(c => {
      if (c.userData?.originalObject === original) {
        // Cette copie pointait vers l'ancien original, nettoyer
        c.userData.originalObject = null
        c.userData.isWrapAroundCopy = false
        // Supprimer cette copie aussi puisqu'elle n'a plus de sens
        if (objects.includes(c)) {
          canvas.remove(c)
        }
      }
    })
  })
  
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
}

/**
 * Synchronise une copie avec son original (lors du déplacement d'une copie)
 * 
 * @param {fabric.Object} copy - La copie déplacée
 */
const syncCopyWithOriginal = (copy) => {
  if (!copy || !copy.userData?.isWrapAroundCopy || !copy.userData?.originalObject) return
  
  const original = copy.userData.originalObject
  const wrapDirection = copy.userData.wrapDirection
  
  if (!original || !canvas) return
  
  // Vérifier que l'original existe toujours dans le canvas
  // Si l'original a été supprimé (remplacé par la copie), cette copie est maintenant le nouvel original
  const objects = canvas.getObjects()
  const originalExists = objects.includes(original)
  
  if (!originalExists) {
    // L'original a été supprimé, cette copie est maintenant le nouvel original
    // Transformer cette copie en original
    copy.set({
      selectable: true,
      evented: true,
      excludeFromExport: false
    })
    copy.userData = {
      ...copy.userData,
      isWrapAroundCopy: false,
      originalObject: null
    }
    // Supprimer cette copie de la Map si elle y était
    wrapAroundCopies.forEach((copies, orig) => {
      const index = copies.indexOf(copy)
      if (index > -1) {
        copies.splice(index, 1)
        if (copies.length === 0) {
          wrapAroundCopies.delete(orig)
        }
      }
    })
    canvas.renderAll()
    requestTextureUpdate()
    return
  }
  
  // Calculer la nouvelle position de l'original basée sur la position de la copie
  let newOriginalLeft = copy.left
  let newOriginalTop = copy.top
  
  // Ajuster selon la direction du wrap
  if (wrapDirection === 'horizontal-right') {
    // La copie est à gauche, donc l'original doit être à droite
    newOriginalLeft = copy.left + canvasWidth
  } else if (wrapDirection === 'horizontal-left') {
    // La copie est à droite, donc l'original doit être à gauche
    newOriginalLeft = copy.left - canvasWidth
  }
  
  // Pour les directions verticales
  const topHeight = canvasHeight * props.workZoneTop
  const bottomHeight = canvasHeight * props.workZoneBottom
  const activeZoneTop = topHeight
  const activeZoneBottom = canvasHeight - bottomHeight
  const zoneHeight = activeZoneBottom - activeZoneTop
  
  if (wrapDirection === 'vertical-bottom') {
    newOriginalTop = copy.top + zoneHeight
  } else if (wrapDirection === 'vertical-top') {
    newOriginalTop = copy.top - zoneHeight
  }
  
  // Empêcher la mise en boucle infinie en désactivant temporairement les événements
  const wasEvented = original.evented
  original.evented = false
  
  // Mettre à jour l'original avec TOUTES les propriétés de la copie (synchronisation complète)
  original.set({
    left: newOriginalLeft,
    top: newOriginalTop,
    scaleX: copy.scaleX || original.scaleX,
    scaleY: copy.scaleY || original.scaleY,
    angle: copy.angle || original.angle,
    flipX: copy.flipX || original.flipX,
    flipY: copy.flipY || original.flipY,
    // Synchroniser les propriétés visuelles
    fill: copy.fill,
    stroke: copy.stroke,
    strokeWidth: copy.strokeWidth,
    opacity: copy.opacity,
    shadow: copy.shadow,
    // Synchroniser les propriétés de transformation
    skewX: copy.skewX,
    skewY: copy.skewY,
    // Synchroniser les propriétés spécifiques selon le type
    ...(original.type === 'rect' && {
      rx: copy.rx,
      ry: copy.ry
    }),
    ...(original.type === 'circle' && {
      radius: copy.radius
    }),
    ...(original.type === 'textbox' && {
      text: copy.text,
      fontSize: copy.fontSize,
      fontFamily: copy.fontFamily,
      fontWeight: copy.fontWeight,
      fontStyle: copy.fontStyle,
      textAlign: copy.textAlign,
      lineHeight: copy.lineHeight
    })
  })
  original.setCoords()
  
  // Réactiver les événements
  original.evented = wasEvented
  
  // Forcer le rendu immédiat
  canvas.renderAll()
  requestTextureUpdate()
  
  // Vérifier si l'original est maintenant complètement hors du canvas
  if (isCompletelyOutsideCanvas(original)) {
    // Remplacer l'original par la copie
    replaceOriginalWithCopy(original, copy)
  } else {
    // Mettre à jour les autres copies si elles existent (sans recréer)
    syncAllCopiesWithOriginal(original)
  }
}

/**
 * Helper pour créer une copie d'un objet Fabric.js
 * 
 * @param {fabric.Object} obj - L'objet original
 * @returns {Promise<fabric.Object>} - La copie de l'objet
 */
const cloneFabricObject = async (obj) => {
  if (!obj) return null
  
  try {
    // Dans Fabric.js v6, clone() peut retourner une Promise
    const cloned = await obj.clone()
    return cloned
  } catch (error) {
    // Si clone() échoue ou n'est pas disponible, utiliser toObject/fromObject
    try {
      const objData = obj.toObject()
      const objClass = obj.constructor
      const cloned = await objClass.fromObject(objData)
      return cloned
    } catch (e) {
      return null
    }
  }
}

/**
 * Active les contrôles de redimensionnement pour un objet
 * @param {fabric.Object} obj - L'objet pour lequel activer les contrôles
 */
const activateControlsForObject = (obj) => {
  if (obj && !obj.userData?.isWorkZoneIndicator) {
    // Vérifier si l'objet est actuellement sélectionné
    const isSelected = canvas && canvas.getActiveObject() === obj
    
    // Activer les contrôles avec setControlsVisibility
    // Activer tous les contrôles, y compris mt et mtr pour tous les objets
    obj.setControlsVisibility({
      mt: true,  // ✅ Contrôle du milieu haut (activé pour tous)
      mb: true, // Bottom (milieu bas)
      ml: true, // Left (milieu gauche)
      mr: true, // Right (milieu droite)
      tl: true, // Top-left (coin haut-gauche)
      tr: true, // Top-right (coin haut-droite)
      bl: true, // Bottom-left (coin bas-gauche)
      br: true, // Bottom-right (coin bas-droite)
      mtr: true  // ✅ Contrôle de rotation (activé pour tous)
    })
    
    // S'assurer que chaque contrôle individuel est visible
    if (obj.controls) {
      const controlNames = ['mt', 'mb', 'ml', 'mr', 'tl', 'tr', 'bl', 'br', 'mtr']
      controlNames.forEach(controlName => {
        if (obj.controls[controlName]) {
          // Activer tous les contrôles, y compris mt et mtr
          obj.controls[controlName].visible = true
        }
      })
    }
    
    // Mettre à jour les coordonnées pour que les contrôles soient correctement positionnés
    if (obj.setCoords) {
      obj.setCoords()
    }
    
    // Si l'objet est sélectionné, forcer un rendu pour afficher les contrôles
    if (isSelected && canvas) {
      canvas.renderAll()
    }
    
    // Afficher les contrôles après activation avec leur état visible
    if (obj.controls) {
      const controlsState = {}
      Object.keys(obj.controls).forEach(key => {
        controlsState[key] = {
          visible: obj.controls[key]?.visible,
          actionName: obj.controls[key]?.actionName
        }
      })
    }
  }
}

/**
 * Crée des copies wrap-around pour un objet qui dépasse les bords
 * 
 * Quand un objet dépasse un bord, une copie complète est créée de l'autre côté
 * pour montrer la partie qui dépasse. L'objet original reste à sa position.
 * 
 * @param {fabric.Object} obj - L'objet original
 */
const createWrapAroundCopies = async (obj) => {
  if (!obj || !canvas || obj.userData?.isWorkZoneIndicator) return
  
  // Supprimer les anciennes copies
  removeWrapAroundCopies(obj)
  
  // Obtenir les dimensions de l'objet (avec le scale appliqué)
  const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
  const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
  
  const objLeft = obj.left || 0
  const objTop = obj.top || 0
  
  const copies = []
  const topHeight = canvasHeight * props.workZoneTop
  const bottomHeight = canvasHeight * props.workZoneBottom
  const activeZoneTop = topHeight
  const activeZoneBottom = canvasHeight - bottomHeight
  
  // ===== COPIES HORIZONTALES =====
  // Si l'objet dépasse à droite, créer une copie complète à gauche
  // La copie montre la partie qui dépasse
  if (objLeft + objWidth > canvasWidth) {
    const copy = await cloneFabricObject(obj)
    if (copy) {
      copy.set({
        left: objLeft - canvasWidth,
        top: objTop,
        selectable: true,  // Permettre la sélection et le déplacement
        evented: true,      // Permettre les événements
        excludeFromExport: true
      })
      copy.userData = { 
        isWrapAroundCopy: true, 
        originalObject: obj,
        wrapDirection: 'horizontal-right'
      }
      canvas.add(copy)
      // Activer les contrôles de redimensionnement pour la copie
      activateControlsForObject(copy)
      // Envoyer la copie à l'arrière-plan pour ne pas gêner la sélection de l'original
      try {
        if (canvas.sendObjectToBack) {
          canvas.sendObjectToBack(copy)
        }
      } catch (e) {
        // Si la méthode n'existe pas, ignorer (l'ordre d'ajout détermine le z-index)
      }
      copies.push(copy)
    }
  }
  
  // Si l'objet dépasse à gauche, créer une copie complète à droite
  // La copie montre la partie qui dépasse
  if (objLeft < 0) {
    const copy = await cloneFabricObject(obj)
    if (copy) {
      copy.set({
        left: objLeft + canvasWidth,
        top: objTop,
        selectable: true,  // Permettre la sélection et le déplacement
        evented: true,      // Permettre les événements
        excludeFromExport: true
      })
      copy.userData = { 
        isWrapAroundCopy: true, 
        originalObject: obj,
        wrapDirection: 'horizontal-left'
      }
      canvas.add(copy)
      // Activer les contrôles de redimensionnement pour la copie
      activateControlsForObject(copy)
      // Envoyer la copie à l'arrière-plan pour ne pas gêner la sélection de l'original
      try {
        if (canvas.sendObjectToBack) {
          canvas.sendObjectToBack(copy)
        }
      } catch (e) {
        // Si la méthode n'existe pas, ignorer (l'ordre d'ajout détermine le z-index)
      }
      copies.push(copy)
    }
  }
  
  // ===== COPIES VERTICALES (avec zones de travail) =====
  // Si l'objet dépasse en bas de la zone active, créer une copie en haut
  if (objTop + objHeight > activeZoneBottom) {
    const copy = await cloneFabricObject(obj)
    if (copy) {
      copy.set({
        left: objLeft,
        top: objTop - (activeZoneBottom - activeZoneTop),
        selectable: true,  // Permettre la sélection et le déplacement
        evented: true,      // Permettre les événements
        excludeFromExport: true
      })
      copy.userData = { 
        isWrapAroundCopy: true, 
        originalObject: obj,
        wrapDirection: 'vertical-bottom'
      }
      canvas.add(copy)
      // Activer les contrôles de redimensionnement pour la copie
      activateControlsForObject(copy)
      // Envoyer la copie à l'arrière-plan pour ne pas gêner la sélection de l'original
      try {
        if (canvas.sendObjectToBack) {
          canvas.sendObjectToBack(copy)
        }
      } catch (e) {
        // Si la méthode n'existe pas, ignorer (l'ordre d'ajout détermine le z-index)
      }
      copies.push(copy)
    }
  }
  
  // Si l'objet dépasse en haut de la zone active, créer une copie en bas
  if (objTop < activeZoneTop) {
    const copy = await cloneFabricObject(obj)
    if (copy) {
      copy.set({
        left: objLeft,
        top: objTop + (activeZoneBottom - activeZoneTop),
        selectable: true,  // Permettre la sélection et le déplacement
        evented: true,      // Permettre les événements
        excludeFromExport: true
      })
      copy.userData = { 
        isWrapAroundCopy: true, 
        originalObject: obj,
        wrapDirection: 'vertical-top'
      }
      canvas.add(copy)
      // Activer les contrôles de redimensionnement pour la copie
      activateControlsForObject(copy)
      // Envoyer la copie à l'arrière-plan pour ne pas gêner la sélection de l'original
      try {
        if (canvas.sendObjectToBack) {
          canvas.sendObjectToBack(copy)
        }
      } catch (e) {
        // Si la méthode n'existe pas, ignorer (l'ordre d'ajout détermine le z-index)
      }
      copies.push(copy)
    }
  }
  
  // ===== COPIES DIAGONALES (coins) =====
  // Si l'objet dépasse en coin (haut-droite, bas-droite, etc.), créer des copies supplémentaires
  if (objLeft + objWidth > canvasWidth && objTop < activeZoneTop) {
    // Coin haut-droite : copie en haut-gauche
    const copy = await cloneFabricObject(obj)
    if (copy) {
      copy.set({
        left: objLeft - canvasWidth,
        top: objTop + (activeZoneBottom - activeZoneTop),
        selectable: true,  // Permettre la sélection pour activer les contrôles
        evented: true,      // Permettre les événements
        excludeFromExport: true
      })
      copy.userData = { isWrapAroundCopy: true, originalObject: obj }
      canvas.add(copy)
      // Activer les contrôles de redimensionnement pour la copie
      activateControlsForObject(copy)
      // Envoyer la copie à l'arrière-plan pour ne pas gêner la sélection de l'original
      try {
        if (canvas.sendObjectToBack) {
          canvas.sendObjectToBack(copy)
        }
      } catch (e) {
        // Si la méthode n'existe pas, ignorer (l'ordre d'ajout détermine le z-index)
      }
      copies.push(copy)
    }
  }
  
  if (objLeft + objWidth > canvasWidth && objTop + objHeight > activeZoneBottom) {
    // Coin bas-droite : copie en bas-gauche
    const copy = await cloneFabricObject(obj)
    if (copy) {
      copy.set({
        left: objLeft - canvasWidth,
        top: objTop - (activeZoneBottom - activeZoneTop),
        selectable: true,  // Permettre la sélection pour activer les contrôles
        evented: true,      // Permettre les événements
        excludeFromExport: true
      })
      copy.userData = { isWrapAroundCopy: true, originalObject: obj }
      canvas.add(copy)
      // Activer les contrôles de redimensionnement pour la copie
      activateControlsForObject(copy)
      // Envoyer la copie à l'arrière-plan pour ne pas gêner la sélection de l'original
      try {
        if (canvas.sendObjectToBack) {
          canvas.sendObjectToBack(copy)
        }
      } catch (e) {
        // Si la méthode n'existe pas, ignorer (l'ordre d'ajout détermine le z-index)
      }
      copies.push(copy)
    }
  }
  
  if (objLeft < 0 && objTop < activeZoneTop) {
    // Coin haut-gauche : copie en haut-droite
    const copy = await cloneFabricObject(obj)
    if (copy) {
      copy.set({
        left: objLeft + canvasWidth,
        top: objTop + (activeZoneBottom - activeZoneTop),
        selectable: true,  // Permettre la sélection pour activer les contrôles
        evented: true,      // Permettre les événements
        excludeFromExport: true
      })
      copy.userData = { isWrapAroundCopy: true, originalObject: obj }
      canvas.add(copy)
      // Activer les contrôles de redimensionnement pour la copie
      activateControlsForObject(copy)
      // Envoyer la copie à l'arrière-plan pour ne pas gêner la sélection de l'original
      try {
        if (canvas.sendObjectToBack) {
          canvas.sendObjectToBack(copy)
        }
      } catch (e) {
        // Si la méthode n'existe pas, ignorer (l'ordre d'ajout détermine le z-index)
      }
      copies.push(copy)
    }
  }
  
  if (objLeft < 0 && objTop + objHeight > activeZoneBottom) {
    // Coin bas-gauche : copie en bas-droite
    const copy = await cloneFabricObject(obj)
    if (copy) {
      copy.set({
        left: objLeft + canvasWidth,
        top: objTop - (activeZoneBottom - activeZoneTop),
        selectable: true,  // Permettre la sélection pour activer les contrôles
        evented: true,      // Permettre les événements
        excludeFromExport: true
      })
      copy.userData = { isWrapAroundCopy: true, originalObject: obj }
      canvas.add(copy)
      // Activer les contrôles de redimensionnement pour la copie
      activateControlsForObject(copy)
      // Envoyer la copie à l'arrière-plan pour ne pas gêner la sélection de l'original
      try {
        if (canvas.sendObjectToBack) {
          canvas.sendObjectToBack(copy)
        }
      } catch (e) {
        // Si la méthode n'existe pas, ignorer (l'ordre d'ajout détermine le z-index)
      }
      copies.push(copy)
    }
  }
  
  // Stocker les copies
  if (copies.length > 0) {
    wrapAroundCopies.set(obj, copies)
    
    // Ajouter l'original et toutes ses copies à la liste des objets multi-sélectionnés
    // Cela permet d'afficher les contrôles de l'original et de toutes les copies simultanément
    if (!canvas.userData) {
      canvas.userData = {}
    }
    if (!canvas.userData.multiSelectedObjects) {
      canvas.userData.multiSelectedObjects = []
    }
    
    // Vérifier si l'original est déjà dans la liste, sinon l'ajouter
    if (!canvas.userData.multiSelectedObjects.includes(obj)) {
      canvas.userData.multiSelectedObjects.push(obj)
    }
    
    // Ajouter toutes les copies à la liste
    copies.forEach(copy => {
      if (copy && canvas.getObjects().includes(copy) && !canvas.userData.multiSelectedObjects.includes(copy)) {
        canvas.userData.multiSelectedObjects.push(copy)
      }
    })
  }
}

/**
 * Synchronise toutes les copies avec leur original
 * Appelé quand l'original est modifié (position, taille, etc.)
 * 
 * @param {fabric.Object} original - L'objet original
 */
const syncAllCopiesWithOriginal = (original) => {
  if (!original || !canvas) return
  
  const copies = wrapAroundCopies.get(original)
  if (!copies || copies.length === 0) return
  
  const objWidth = (original.width || (original.radius ? original.radius * 2 : 50)) * (original.scaleX || 1)
  const objHeight = (original.height || (original.radius ? original.radius * 2 : 50)) * (original.scaleY || 1)
  const objLeft = original.left || 0
  const objTop = original.top || 0
  
  const topHeight = canvasHeight * props.workZoneTop
  const bottomHeight = canvasHeight * props.workZoneBottom
  const activeZoneTop = topHeight
  const activeZoneBottom = canvasHeight - bottomHeight
  const zoneHeight = activeZoneBottom - activeZoneTop
  
  // Mettre à jour chaque copie selon sa direction
  copies.forEach(copy => {
    if (!copy || !copy.userData) return
    
    const wrapDirection = copy.userData.wrapDirection
    let newLeft = objLeft
    let newTop = objTop
    
    // Calculer la nouvelle position selon la direction
    if (wrapDirection === 'horizontal-right') {
      newLeft = objLeft - canvasWidth
    } else if (wrapDirection === 'horizontal-left') {
      newLeft = objLeft + canvasWidth
    } else if (wrapDirection === 'vertical-bottom') {
      newTop = objTop - zoneHeight
    } else if (wrapDirection === 'vertical-top') {
      newTop = objTop + zoneHeight
    }
    
    // Mettre à jour la copie avec TOUTES les propriétés de l'original (synchronisation complète)
    copy.set({
      left: newLeft,
      top: newTop,
      scaleX: original.scaleX,
      scaleY: original.scaleY,
      angle: original.angle,
      flipX: original.flipX,
      flipY: original.flipY,
      // Synchroniser les propriétés visuelles
      fill: original.fill,
      stroke: original.stroke,
      strokeWidth: original.strokeWidth,
      opacity: original.opacity,
      shadow: original.shadow,
      // Synchroniser les propriétés de transformation
      skewX: original.skewX,
      skewY: original.skewY,
      // Synchroniser les propriétés spécifiques selon le type
      ...(original.type === 'rect' && {
        rx: original.rx,
        ry: original.ry
      }),
      ...(original.type === 'circle' && {
        radius: original.radius
      }),
      ...(original.type === 'textbox' && {
        text: original.text,
        fontSize: original.fontSize,
        fontFamily: original.fontFamily,
        fontWeight: original.fontWeight,
        fontStyle: original.fontStyle,
        textAlign: original.textAlign,
        lineHeight: original.lineHeight
      })
    })
    copy.setCoords()
  })
}

/**
 * Applique l'effet wrap around à un objet
 * 
 * Quand l'objet dépasse un bord, des copies visuelles apparaissent de l'autre côté
 * pour montrer la partie qui dépasse. L'objet original reste à sa position.
 * 
 * @param {fabric.Object} obj - L'objet Fabric.js à ajuster
 */
const applyWrapAround = async (obj) => {
  if (!obj || !canvas || obj.userData?.isWorkZoneIndicator || obj.userData?.isWrapAroundCopy) return
  
  // Obtenir les dimensions de l'objet (avec le scale appliqué)
  const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
  const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
  
  const objLeft = obj.left || 0
  const objTop = obj.top || 0
  
  const topHeight = canvasHeight * props.workZoneTop
  const bottomHeight = canvasHeight * props.workZoneBottom
  const activeZoneTop = topHeight
  const activeZoneBottom = canvasHeight - bottomHeight
  
  // Vérifier si l'objet dépasse les bords
  const exceedsRight = objLeft + objWidth > canvasWidth
  const exceedsLeft = objLeft < 0
  const exceedsBottom = objTop + objHeight > activeZoneBottom
  const exceedsTop = objTop < activeZoneTop
  
  // Si l'objet dépasse, créer ou mettre à jour les copies
  if (exceedsRight || exceedsLeft || exceedsBottom || exceedsTop) {
    // Vérifier si des copies existent déjà
    const existingCopies = wrapAroundCopies.get(obj)
    if (existingCopies && existingCopies.length > 0) {
      // Mettre à jour les copies existantes
      syncAllCopiesWithOriginal(obj)
    } else {
      // Créer de nouvelles copies
      await createWrapAroundCopies(obj)
    }
  } else {
    // Si l'objet ne dépasse plus, supprimer les copies
    removeWrapAroundCopies(obj)
  }
}

const initCanvas = () => {
  if (!canvasElement.value) return

  try {
    canvas = new Canvas(canvasElement.value, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: '#ffffff', // Fond blanc pour mieux voir les objets
      selection: true, // Permettre la sélection d'objets
      moveCursor: 'move', // Curseur de déplacement
      defaultCursor: 'default', // Curseur par défaut
      // Désactiver le devicePixelRatio pour que les dimensions restent cohérentes
      // Cela évite les problèmes de décalage entre les coordonnées 2D et 3D
      enableRetinaScaling: false, // Désactiver le scaling retina/devicePixelRatio
      // Configuration des contrôles de redimensionnement
      uniformScaling: false, // Permettre le redimensionnement non-uniforme (largeur/hauteur séparées)
      centeredScaling: false, // Utiliser le coin comme point de référence (comportement standard)
      centeredRotation: false, // Rotation depuis le centre
      // Activer tous les contrôles de transformation
      controlsAboveOverlay: false // Les contrôles sont au-dessus des objets
    })
    
    // Forcer les dimensions du canvas HTML à correspondre exactement aux dimensions logiques
    // Cela garantit que canvas.width/height correspondent à canvasElement.width/height
    if (canvasElement.value) {
      canvasElement.value.width = canvasWidth
      canvasElement.value.height = canvasHeight
      canvasElement.value.style.width = `${canvasWidth}px`
      canvasElement.value.style.height = `${canvasHeight}px`
    }
    
    // Activer le déplacement et la sélection
    canvas.selection = true
    canvas.allowTouchScrolling = false
    
    // Fonction pour personnaliser les contrôles (position et couleur)
    const customizeControls = (obj) => {
      if (!obj.controls) return
      
      Object.keys(obj.controls).forEach(controlName => {
        const control = obj.controls[controlName]
        if (control) {
          // Personnaliser la couleur des contrôles : carrés vides avec bordure bleue
          control.fill = 'transparent' // Pas de remplissage (carré vide)
          control.stroke = '#3b82f6' // Bordure bleue
          control.strokeWidth = 1 // Bordure fine
          
          // Personnaliser la taille des contrôles
          control.sizeX = 12
          control.sizeY = 12
          
          // Personnaliser la position des contrôles (offset depuis la position par défaut)
          // Les valeurs x et y sont des offsets relatifs (entre -0.5 et 0.5)
          // Par exemple, pour déplacer un contrôle vers l'extérieur :
          if (controlName === 'mt') {
            control.y = -2 // Déplacer légèrement plus haut
          } else if (controlName === 'mb') {
            control.y = 4 // Déplacer légèrement plus bas
          } else if (controlName === 'ml') {
            control.x = -0.6 // Déplacer légèrement plus à gauche
          } else if (controlName === 'mr') {
            control.x = 0.1 // Déplacer légèrement plus à droite
          }
        }
      })
    }
    
    // Fonction helper pour activer les contrôles de redimensionnement
    const enableScalingControls = (obj) => {
      if (obj && !obj.userData?.isWorkZoneIndicator) {
        // Activer tous les contrôles de redimensionnement et transformation
        obj.setControlsVisibility({
          mt: true, // Top (milieu haut)
          mb: true, // Bottom (milieu bas)
          ml: true, // Left (milieu gauche)
          mr: true, // Right (milieu droite)
          tl: true, // Top-left (coin haut-gauche)
          tr: true, // Top-right (coin haut-droite)
          bl: true, // Bottom-left (coin bas-gauche)
          br: true, // Bottom-right (coin bas-droite)
          mtr: true // Rotation (top-center pour rotation)
        })
      }
    }
    
    // Configurer les contrôles de redimensionnement pour tous les objets ajoutés
    // Cela permet d'avoir des handles de redimensionnement visibles et fonctionnels
    canvas.on('object:added', (e) => {
      const obj = e.target
      
      // Si l'objet a une configuration de contrôles personnalisée, l'utiliser
      if (obj.userData?.controlsConfig) {
        obj.setControlsVisibility(obj.userData.controlsConfig)
        if (obj.controls) {
          Object.keys(obj.controls).forEach(key => {
            if (obj.controls[key] && obj.userData.controlsConfig[key] !== undefined) {
              obj.controls[key].visible = obj.userData.controlsConfig[key]
            }
          })
        }
        
        // Personnaliser les contrôles (position et couleur) si demandé
        if (obj.userData?.customizeControls) {
          customizeControls(obj)
        }
        
        obj.setCoords()
      } else {
        // Sinon, activer tous les contrôles par défaut
        enableScalingControls(obj)
      }
      
      // S'assurer que l'objet est sélectionnable et transformable
      if (obj && !obj.userData?.isWorkZoneIndicator) {
        obj.selectable = true
        obj.evented = true
      }
    })
    
    // S'assurer que les objets existants ont aussi les contrôles activés lors de la sélection
    // (Note: Ces événements sont aussi gérés plus bas pour emit, on les configure ici pour les contrôles)
    
    // Forcer la visibilité du canvas
    if (canvasElement.value) {
      canvasElement.value.style.display = 'block'
      canvasElement.value.style.visibility = 'visible'
      canvasElement.value.style.opacity = '1'
    }

    // Set up drawing mode
    canvas.isDrawingMode = isDrawMode.value
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.width = drawWidth.value
      canvas.freeDrawingBrush.color = drawColor.value
    }
    
    // Forcer un rendu initial
    canvas.renderAll()
    
    // Dessiner les indicateurs de zone de travail après un petit délai pour s'assurer que le canvas est prêt
    nextTick(() => {
      setTimeout(() => {
        drawWorkZoneIndicators()
      }, 100)
    })

    // Fonction helper pour signaler les changements (événements critiques)
    const signalChange = () => {
      canvas.renderAll() // Forcer le rendu du canvas
      requestTextureUpdateImmediate() // Mise à jour immédiate pour événements critiques
      emit('design-updated', canvas) // Émettre l'événement
    }
    
    // Fonction helper pour signaler les changements fréquents (throttled)
    const signalChangeThrottled = () => {
      canvas.renderAll() // Forcer le rendu du canvas
      requestTextureUpdate() // Mise à jour throttled avec RAF
      emit('design-updated', canvas) // Émettre l'événement
    }

    // Sauvegarder l'état initial
    saveHistory()
    
    // Écouter quand un objet est sélectionné pour activer le mode drag sur 3D
    // Mettre à jour la liste quand un objet est sélectionné
    canvas.on('selection:created', (e) => {
      // alert('selection:created')

      // updateHasSelection() // Mettre à jour hasSelection
      const activeObject = e.selected?.[0] || canvas.getActiveObject()
      if (activeObject && !activeObject.userData?.isWorkZoneIndicator) {
        // Mettre à jour l'angle de rotation dans l'input
        rotationAngle.value = activeObject.angle || 0
        // Si l'objet a une configuration de contrôles personnalisée, l'utiliser
        if (activeObject.userData?.controlsConfig) {
          activeObject.setControlsVisibility(activeObject.userData.controlsConfig)
          if (activeObject.controls) {
            Object.keys(activeObject.controls).forEach(key => {
              if (activeObject.controls[key] && activeObject.userData.controlsConfig[key] !== undefined) {
                activeObject.controls[key].visible = activeObject.userData.controlsConfig[key]
              }
            })
          }
          
          // Personnaliser les contrôles (position et couleur) si demandé
          if (activeObject.userData?.customizeControls) {
            customizeControls(activeObject)
          }
          
          activeObject.setCoords()
        } else {
          // Sinon, activer tous les contrôles par défaut
          enableScalingControls(activeObject)
        }
        
        // Ajouter l'original et ses copies wrap-around à la liste des objets multi-sélectionnés
        if (!canvas.userData) {
          canvas.userData = {}
        }
        if (!canvas.userData.multiSelectedObjects) {
          canvas.userData.multiSelectedObjects = []
        }
        
        // Déterminer l'objet original (soit l'objet sélectionné, soit son original si c'est une copie)
        const original = activeObject.userData?.isWrapAroundCopy 
          ? activeObject.userData.originalObject 
          : activeObject
        
        if (original) {
          // Vider la liste précédente et ajouter l'original
          canvas.userData.multiSelectedObjects = [original]
          
          // Ajouter toutes les copies wrap-around de l'original
          const copies = wrapAroundCopies.get(original)
          if (copies && copies.length > 0) {
            copies.forEach(copy => {
              if (copy && canvas.getObjects().includes(copy)) {
                // Activer les contrôles pour chaque copie
                activateControlsForObject(copy)
                canvas.userData.multiSelectedObjects.push(copy)
              }
            })
          }
        }
        
        emit('object-selected', { 
          object: activeObject,
          type: activeObject.type 
        })
      }
    })
    
    canvas.on('selection:updated', (e) => {
      updateHasSelection() // Mettre à jour hasSelection
      const activeObject = e.selected?.[0] || canvas.getActiveObject()
      if (activeObject && !activeObject.userData?.isWorkZoneIndicator) {
        // Mettre à jour l'angle de rotation dans l'input
        rotationAngle.value = activeObject.angle || 0
        // Si l'objet a une configuration de contrôles personnalisée, l'utiliser
        if (activeObject.userData?.controlsConfig) {
          activeObject.setControlsVisibility(activeObject.userData.controlsConfig)
          if (activeObject.controls) {
            Object.keys(activeObject.controls).forEach(key => {
              if (activeObject.controls[key] && activeObject.userData.controlsConfig[key] !== undefined) {
                activeObject.controls[key].visible = activeObject.userData.controlsConfig[key]
              }
            })
          }
          
          // Personnaliser les contrôles (position et couleur) si demandé
          if (activeObject.userData?.customizeControls) {
            customizeControls(activeObject)
          }
          
          activeObject.setCoords()
        } else {
          // Sinon, activer tous les contrôles par défaut
          enableScalingControls(activeObject)
        }
        
        // Ajouter l'original et ses copies wrap-around à la liste des objets multi-sélectionnés
        if (!canvas.userData) {
          canvas.userData = {}
        }
        if (!canvas.userData.multiSelectedObjects) {
          canvas.userData.multiSelectedObjects = []
        }
        
        // Déterminer l'objet original (soit l'objet sélectionné, soit son original si c'est une copie)
        const original = activeObject.userData?.isWrapAroundCopy 
          ? activeObject.userData.originalObject 
          : activeObject
        
        if (original) {
          // Vider la liste précédente et ajouter l'original
          canvas.userData.multiSelectedObjects = [original]
          
          // Ajouter toutes les copies wrap-around de l'original
          const copies = wrapAroundCopies.get(original)
          if (copies && copies.length > 0) {
            copies.forEach(copy => {
              if (copy && canvas.getObjects().includes(copy)) {
                // Activer les contrôles pour chaque copie
                activateControlsForObject(copy)
                canvas.userData.multiSelectedObjects.push(copy)
              }
            })
          }
        }
        
        emit('object-selected', { 
          object: activeObject,
          type: activeObject.type 
        })
      }
    })
    
    canvas.on('selection:cleared', () => {
      updateHasSelection() // Mettre à jour hasSelection
      // Vider la liste des objets multi-sélectionnés
      if (canvas.userData?.multiSelectedObjects) {
        canvas.userData.multiSelectedObjects = []
      }
      emit('object-deselected')

    })
    
    // Écouter tous les événements de modification et sauvegarder l'historique
    canvas.on('path:created', () => {
      saveHistory()
      signalChange()
    })
    canvas.on('object:added', () => {
      saveHistory()
      signalChange()
      // Notifier le parent pour mettre à jour la liste des objets
      emit('objects-changed')

    })
    canvas.on('object:modified', (e) => {

      // Ne pas sauvegarder pendant la modification, seulement après
      const obj = e.target
      
      // Synchroniser les copies wrap-around si l'objet modifié est un original
      if (obj && !obj.userData?.isWorkZoneIndicator && !obj.userData?.isWrapAroundCopy) {
        syncAllCopiesWithOriginal(obj)
        // Vérifier si de nouvelles copies doivent être créées
        applyWrapAround(obj)
      }
      
      signalChange()
      
      // Mettre à jour les coordonnées de l'objet sélectionné si nécessaire
      const activeObject = canvas.getActiveObject()
      if (activeObject) {
        emit('object-selected', {
          object: activeObject,
          type: activeObject.type
        })
      }
    })
    canvas.on('object:removed', (e) => {

      const obj = e.target
      // Supprimer les copies wrap-around si l'objet original est supprimé
      if (obj && !obj.userData?.isWrapAroundCopy) {
        removeWrapAroundCopies(obj)
      }
      saveHistory()
      signalChange()
      // Notifier le parent pour mettre à jour la liste des objets
      emit('objects-changed')
    })
    canvas.on('object:moving', async (e) => {
      // Appliquer l'effet wrap around pendant le déplacement avec la souris
      const obj = e.target
      
      if (obj && !obj.userData?.isWorkZoneIndicator) {
        if (obj.userData?.isWrapAroundCopy) {
          // Si c'est une copie qui bouge, synchroniser avec l'original
          syncCopyWithOriginal(obj)
        } else {
          // Si c'est l'original qui bouge, mettre à jour les copies
          await applyWrapAround(obj)
        }
      }
      
      // Mettre à jour les coordonnées de l'objet sélectionné en temps réel
      const activeObject = canvas.getActiveObject()
      if (activeObject === obj) {
        emit('object-selected', {
          object: activeObject,
          type: activeObject.type
        })
      }
      
      // Pendant le déplacement, mettre à jour fréquemment (MISE À JOUR DIRECTE - plus rapide)
      canvas.renderAll()
      // Utiliser la mise à jour directe si disponible (bypass du store réactif)
      if (props.updateTextureDirect) {
        props.updateTextureDirect() // Mise à jour directe ~0-16ms
      } else {
        requestTextureUpdate() // Fallback vers le store si méthode directe non disponible
      }
    })
    canvas.on('object:moved', async (e) => {
      const obj = e.target
      
      if (obj && !obj.userData?.isWorkZoneIndicator) {
        // Vérifier si l'objet existe toujours dans le canvas (pas supprimé)
        const objects = canvas.getObjects()
        if (!objects.includes(obj)) {
          // L'objet a été supprimé, ne rien faire
          return
        }
        
        if (obj.userData?.isWrapAroundCopy) {
          // Si c'est une copie qui a été déplacée, synchroniser avec l'original
          syncCopyWithOriginal(obj)
        } else {
          // Si c'est l'original qui a été déplacé, mettre à jour les copies
          await applyWrapAround(obj)
          
          // Vérifier si l'objet original est maintenant complètement hors du canvas
          if (isCompletelyOutsideCanvas(obj)) {
            // Trouver une copie pour la remplacer
            const copies = wrapAroundCopies.get(obj)
            if (copies && copies.length > 0) {
              // Utiliser la première copie disponible
              replaceOriginalWithCopy(obj, copies[0])
              // Ne pas continuer car l'objet original a été remplacé
              saveHistory()
              signalChange()
              return
            }
          }
        }
      }
      
      saveHistory()
      signalChange()
    })
    // Événement pendant le redimensionnement (scaling en cours)
    canvas.on('object:scaling', async (e) => {
      const obj = e.target
      // Mettre à jour les copies wrap-around si elles existent
      if (obj && !obj.userData?.isWorkZoneIndicator) {
        if (obj.userData?.isWrapAroundCopy) {
          // Si c'est une copie qui est redimensionnée, synchroniser avec l'original
          const original = obj.userData?.originalObject
          if (original) {
            // Appliquer le même scale à l'original
            original.set({
              scaleX: obj.scaleX,
              scaleY: obj.scaleY
            })
            original.setCoords()
            syncAllCopiesWithOriginal(original)
          }
        } else {
          // Si c'est l'original, mettre à jour toutes les copies
          syncAllCopiesWithOriginal(obj)
          await applyWrapAround(obj)
        }
      }
      
      // Mettre à jour les coordonnées de l'objet sélectionné en temps réel
      const activeObject = canvas.getActiveObject()
      if (activeObject === obj) {
        emit('object-selected', {
          object: activeObject,
          type: activeObject.type
        })
      }
      
      // Pendant le redimensionnement, mettre à jour en temps réel (MISE À JOUR DIRECTE - plus rapide)
      canvas.renderAll()
      // Utiliser la mise à jour directe si disponible (bypass du store réactif)
      if (props.updateTextureDirect) {
        props.updateTextureDirect() // Mise à jour directe ~0-16ms
      } else {
        requestTextureUpdate() // Fallback vers le store si méthode directe non disponible
      }
      emit('design-updated', canvas)
    })
    // Événement après le redimensionnement (scaling terminé)
    canvas.on('object:scaled', (e) => {

      const obj = e.target
      
      // Synchroniser les copies wrap-around si l'objet redimensionné est un original
      if (obj && !obj.userData?.isWorkZoneIndicator && !obj.userData?.isWrapAroundCopy) {
        syncAllCopiesWithOriginal(obj)
        // Vérifier si de nouvelles copies doivent être créées après le redimensionnement
        applyWrapAround(obj)
      } else if (obj && obj.userData?.isWrapAroundCopy) {
        // Si c'est une copie qui est redimensionnée, synchroniser avec l'original
        const original = obj.userData?.originalObject
        if (original) {
          original.set({ 
            scaleX: obj.scaleX,
            scaleY: obj.scaleY
          })
          original.setCoords()
          syncAllCopiesWithOriginal(original)
          applyWrapAround(original)
        }
      }
      
      saveHistory()
      signalChange()
    })
    canvas.on('object:rotated', (e) => {
      const obj = e.target
      
      // S'assurer que les coordonnées sont à jour après la rotation
      if (obj && obj.setCoords) {
        obj.setCoords()
      }
      
      // Mettre à jour l'angle dans l'input si l'objet est sélectionné
      if (obj === canvas.getActiveObject()) {
        rotationAngle.value = obj.angle || 0
      }
      

      
      // Synchroniser les copies wrap-around si l'objet roté est un original
      if (obj && !obj.userData?.isWorkZoneIndicator && !obj.userData?.isWrapAroundCopy) {
        syncAllCopiesWithOriginal(obj)
      } else if (obj && obj.userData?.isWrapAroundCopy) {
        // Si c'est une copie qui est rotée, synchroniser avec l'original
        const original = obj.userData?.originalObject
        if (original) {
          original.set({ angle: obj.angle })
          original.setCoords()
          syncAllCopiesWithOriginal(original)
        }
      }
      
      // Émettre l'événement de rotation pour appliquer la rotation au modèle 3D
      if (obj && !obj.userData?.isWorkZoneIndicator) {
        emit('object-rotated', {
          object: obj,
          angle: obj.angle || 0 // Angle en degrés
        })
      }
      
      saveHistory()
      signalChange()
    })
    canvas.on('object:skewed', () => {
      saveHistory()
      signalChange()
    })
    
    // Événement mousemove pour détecter les contrôles et afficher leurs coordonnées
    canvas.on('mouse:move', (e) => {
      if (!canvas) return
      
      const pointer = canvas.getPointer(e.e)
      const x = pointer.x
      const y = pointer.y
      
      // Mettre à jour les coordonnées du curseur
      cursorCoords2D.value = {
        x: x,
        y: y
      }
      
      // Chercher l'objet actif (sélectionné)
      const activeObject = canvas.getActiveObject()
      
      if (activeObject && !activeObject.userData?.isWorkZoneIndicator) {
        // Détecter le contrôle survolé
        const handleInfo = detectResizeHandle(activeObject, x, y, 10)
        
        if (handleInfo) {
          // Calculer les coordonnées des contrôles
          const controls = calculateControlCoordinates2D(activeObject)
          const controlKey = handleInfo.handle
          const controlCoords = controls[controlKey]
          
          // Calculer la distance au contrôle
          let distance = null
          let controlX = null
          let controlY = null
          
          if (controlCoords) {
            controlX = controlCoords.x
            controlY = controlCoords.y
            distance = Math.sqrt(Math.pow(x - controlX, 2) + Math.pow(y - controlY, 2))
          }
          
          // Mettre à jour l'état de débogage
          detectedControl2D.value = {
            show: true,
            handle: handleInfo.handle || null,
            corner: handleInfo.corner || null,
            edge: handleInfo.edge || null,
            isRotation: handleInfo.isRotation || false,
            distance: distance,
            x: controlX,
            y: controlY
          }
        } else {
          // Aucun contrôle détecté
          detectedControl2D.value = {
            show: false,
            handle: null,
            corner: null,
            edge: null,
            isRotation: false,
            distance: null,
            x: null,
            y: null
          }
        }
      } else {
        // Aucun objet sélectionné
        detectedControl2D.value = {
          show: false,
          handle: null,
          corner: null,
          edge: null,
          isRotation: false,
          distance: null,
          x: null,
          y: null
        }
      }
    })
    canvas.on('selection:created', () => {
      // Ne pas mettre à jour pour la sélection, juste le rendu
      canvas.renderAll()
    })
    canvas.on('selection:updated', () => {
      canvas.renderAll()
    })
    canvas.on('after:render', (e) => {
      // Afficher les contrôles des objets multi-sélectionnés
      if (canvas.userData?.multiSelectedObjects) {
        const ctx = e.ctx || canvas.getContext()
        const activeObject = canvas.getActiveObject()
        
        canvas.userData.multiSelectedObjects.forEach(obj => {
          if (obj && canvas.getObjects().includes(obj) && obj !== activeObject) {
            // Afficher les contrôles de l'objet même s'il n'est pas sélectionné
            obj.setCoords()
            if (obj.controls) {
              // Utiliser les coordonnées transformées de l'objet
              const coords = obj.aCoords || obj.oCoords
              if (coords) {
                // Stocker les positions de tous les contrôles pour tracer les lignes
                const controlPositions = {}
                
                Object.keys(obj.controls).forEach(controlName => {
                  const control = obj.controls[controlName]
                  if (control && control.visible !== false) {
                    let finalX, finalY
                    
                    // Calculer la position du contrôle en fonction de son type
                    switch (controlName) {
                      case 'tl': // Top-left
                        finalX = coords.tl.x
                        finalY = coords.tl.y
                        break
                      case 'tr': // Top-right
                        finalX = coords.tr.x
                        finalY = coords.tr.y
                        break
                      case 'bl': // Bottom-left
                        finalX = coords.bl.x
                        finalY = coords.bl.y
                        break
                      case 'br': // Bottom-right
                        finalX = coords.br.x
                        finalY = coords.br.y
                        break
                      case 'mt': // Middle-top
                        finalX = (coords.tl.x + coords.tr.x) / 2
                        finalY = (coords.tl.y + coords.tr.y) / 2
                        break
                      case 'mb': // Middle-bottom
                        finalX = (coords.bl.x + coords.br.x) / 2
                        finalY = (coords.bl.y + coords.br.y) / 2
                        break
                      case 'ml': // Middle-left
                        finalX = (coords.tl.x + coords.bl.x) / 2
                        finalY = (coords.tl.y + coords.bl.y) / 2
                        break
                      case 'mr': // Middle-right
                        finalX = (coords.tr.x + coords.br.x) / 2
                        finalY = (coords.tr.y + coords.br.y) / 2
                        break
                      case 'mtr': // Middle-top-rotation
                        // Position au-dessus du centre du haut
                        const centerTopX = (coords.tl.x + coords.tr.x) / 2
                        const centerTopY = (coords.tl.y + coords.tr.y) / 2
                        // Calculer un vecteur perpendiculaire vers le haut
                        const dx = coords.tr.x - coords.tl.x
                        const dy = coords.tr.y - coords.tl.y
                        const length = Math.sqrt(dx * dx + dy * dy)
                        
                        // Si le rectangle n'est pas roté (length horizontal), simplifier le calcul
                        if (Math.abs(dy) < 0.01) {
                          // Rectangle non roté : positionner directement au-dessus
                          finalX = centerTopX
                          finalY = centerTopY - 30 // Directement au-dessus (Y diminue vers le haut)
                        } else {
                          // Rectangle roté : utiliser le calcul vectoriel
                          // Le vecteur perpendiculaire à (dx, dy) est (-dy, dx) ou (dy, -dx)
                          // On choisit (dy, -dx) pour pointer vers le haut (au-dessus du bord)
                          const offset = 30 // Distance au-dessus du bord
                          finalX = centerTopX + (dy / length) * offset
                          finalY = centerTopY - (dx / length) * offset
                        }
                        break
                      default:
                        // Position par défaut basée sur control.x et control.y
                        finalX = coords.tl.x + (coords.tr.x - coords.tl.x) * (control.x + 0.5)
                        finalY = coords.tl.y + (coords.bl.y - coords.tl.y) * (control.y + 0.5)
                    }
                    
                    // Stocker la position pour tracer les lignes
                    controlPositions[controlName] = { x: finalX, y: finalY }
                    
                    // Dessiner le contrôle comme un carré vide avec bordure bleue
                    ctx.save()
                    ctx.fillStyle = control.fill || 'transparent'
                    ctx.strokeStyle = control.stroke || '#3b82f6'
                    ctx.lineWidth = control.strokeWidth || 1
                    const size = (control.sizeX || 12) / 2
                    // Dessiner un carré au lieu d'un cercle
                    ctx.beginPath()
                    ctx.rect(finalX - size, finalY - size, size * 2, size * 2)
                    ctx.fill()
                    ctx.stroke()
                    ctx.restore()
                  }
                })
                
                // Tracer des lignes entre les contrôles des coins pour former un rectangle
                ctx.save()
                ctx.strokeStyle = '#3b82f6'
                ctx.lineWidth = 0.5 // Ligne fine
                ctx.setLineDash([5, 5]) // Ligne en pointillés
                ctx.beginPath()
                
                // Ligne entre les coins (tl -> tr -> br -> bl -> tl)
                if (controlPositions.tl && controlPositions.tr) {
                  ctx.moveTo(controlPositions.tl.x, controlPositions.tl.y)
                  ctx.lineTo(controlPositions.tr.x, controlPositions.tr.y)
                }
                if (controlPositions.tr && controlPositions.br) {
                  ctx.lineTo(controlPositions.br.x, controlPositions.br.y)
                }
                if (controlPositions.br && controlPositions.bl) {
                  ctx.lineTo(controlPositions.bl.x, controlPositions.bl.y)
                }
                if (controlPositions.bl && controlPositions.tl) {
                  ctx.lineTo(controlPositions.tl.x, controlPositions.tl.y)
                }
                
                ctx.stroke()
                ctx.restore()
              }
            }
          }
        })
      }
    })
    
    canvas.on('after:render', () => {
      // Debounced updates from render (utilise RAF pour meilleure performance)
      if (renderTimeout) {
        clearTimeout(renderTimeout)
      }
      renderTimeout = setTimeout(() => {
        requestTextureUpdate() // Throttled avec RAF pour performance optimale
        emit('design-updated', canvas)
      }, 100)
    })
    
    // Émettre l'événement que le canvas est prêt
    if (canvas) {
      nextTick(() => {
        // Double vérification que le canvas est visible
        const canvasEl = canvas.getElement()
        if (canvasEl) {
          canvasEl.style.display = 'block'
          canvasEl.style.visibility = 'visible'
          canvasEl.style.opacity = '1'
        }
        emit('canvas-ready', canvas.getElement())
      })
    }
    
    // Ajouter les raccourcis clavier
    setupKeyboardShortcuts()
  } catch (error) {
    alert('Erreur lors de l\'initialisation du canvas: ' + error.message)
  }
}

// Fonctions undo/redo
const undo = () => {
  if (!canvas || !canUndo.value) return
  
  isUndoRedoInProgress = true
  historyIndex--
  if (historyIndex >= 0 && history[historyIndex]) {
    canvas.loadFromJSON(history[historyIndex], () => {
      canvas.renderAll()
      requestTextureUpdate()
      emit('design-updated', canvas)
      isUndoRedoInProgress = false
    })
  } else {
    isUndoRedoInProgress = false
  }
}

const redo = () => {
  if (!canvas || !canRedo.value) return
  
  isUndoRedoInProgress = true
  historyIndex++
  if (historyIndex < history.length && history[historyIndex]) {
    canvas.loadFromJSON(history[historyIndex], () => {
      canvas.renderAll()
      requestTextureUpdate()
      emit('design-updated', canvas)
      isUndoRedoInProgress = false
    })
  } else {
    isUndoRedoInProgress = false
  }
}

// Fonction pour supprimer l'élément sélectionné
/**
 * Désélectionne l'objet actuellement sélectionné sur le canvas
 */
const deselectObject = () => {
  if (!canvas) return
  
  canvas.discardActiveObject()
  updateHasSelection() // Mettre à jour hasSelection
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
}

const deleteSelected = () => {
  if (!canvas || !hasSelection.value) return
  
  const activeObject = canvas.getActiveObject()
  if (activeObject) {
    if (activeObject.type === 'activeSelection') {
      // Si plusieurs objets sont sélectionnés
      activeObject.getObjects().forEach(obj => canvas.remove(obj))
    } else {
      canvas.remove(activeObject)
    }
    canvas.discardActiveObject()
    updateHasSelection() // Mettre à jour hasSelection
    canvas.renderAll()
    requestTextureUpdate()
    emit('design-updated', canvas)
    
    // Sauvegarder dans l'historique
    const json = JSON.stringify(canvas.toJSON())
    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1)
    }
    history.push(json)
    historyIndex = history.length - 1
  }
}

// Dessiner les indicateurs de zone de travail (zones exclues)
const drawWorkZoneIndicators = () => {
  if (!canvas) return
  
  try {
    // Supprimer les anciens indicateurs s'ils existent
    const existingIndicators = canvas.getObjects().filter(obj => obj.userData?.isWorkZoneIndicator)
    existingIndicators.forEach(obj => canvas.remove(obj))
    
    const topHeight = canvasHeight * props.workZoneTop
    const bottomHeight = canvasHeight * props.workZoneBottom
    
    // Zone exclue du haut (grisée)
    if (topHeight > 0) {
      const topZone = new Rect({
        left: 0,
        top: 0,
        width: canvasWidth,
        height: topHeight,
        fill: 'rgba(200, 200, 200, 0.3)',
        stroke: 'rgba(150, 150, 150, 0.5)',
        strokeWidth: 2
      })
      // Configurer les propriétés après création
      topZone.set({
        selectable: false,
        evented: false
      })
      topZone.userData = { isWorkZoneIndicator: true }
      canvas.add(topZone)
    }
    
    // Zone exclue du bas (grisée)
    if (bottomHeight > 0) {
      const bottomZone = new Rect({
        left: 0,
        top: canvasHeight - bottomHeight,
        width: canvasWidth,
        height: bottomHeight,
        fill: 'rgba(200, 200, 200, 0.3)',
        stroke: 'rgba(150, 150, 150, 0.5)',
        strokeWidth: 2
      })
      // Configurer les propriétés après création
      bottomZone.set({
        selectable: false,
        evented: false
      })
      bottomZone.userData = { isWorkZoneIndicator: true }
      canvas.add(bottomZone)
    }
    
    canvas.renderAll()
  } catch (error) {
  }
}

// Configuration des raccourcis clavier
const setupKeyboardShortcuts = () => {
  const handleKeyDown = (e) => {
    // Ctrl+Z pour undo
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    }
    // Ctrl+Y ou Ctrl+Shift+Z pour redo
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
      e.preventDefault()
      redo()
    }
    // Suppr ou Delete pour supprimer
    if ((e.key === 'Delete' || e.key === 'Backspace') && hasSelection.value) {
      e.preventDefault()
      deleteSelected()
    }
  }
  
  window.addEventListener('keydown', handleKeyDown)
  
  // Stocker le handler pour le cleanup
  window._fabricKeyboardHandler = handleKeyDown
}

const updateBrush = () => {
  if (canvas && canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.width = drawWidth.value
    canvas.freeDrawingBrush.color = drawColor.value
  }
}

const updateBrushAndSelection = () => {
  updateBrush()
  
  // Si un objet est sélectionné, appliquer la couleur immédiatement
  if (canvas) {
    const activeObject = canvas.getActiveObject()
    if (activeObject) {
      applyColorToSelection()
    }
  }
}

const applyColorToSelection = () => {
  if (!canvas) return
  
  const activeObject = canvas.getActiveObject()
  
  if (!activeObject) {
    alert('Veuillez d\'abord sélectionner un objet (cliquez dessus)')
    return
  }
  
  // Appliquer la couleur selon le type d'objet
  if (activeObject.type === 'textbox' || activeObject.type === 'text' || activeObject.type === 'i-text') {
    activeObject.set('fill', drawColor.value)
  } else if (activeObject.type === 'circle' || activeObject.type === 'rect' || activeObject.type === 'ellipse') {
    activeObject.set('fill', drawColor.value)
  } else if (activeObject.type === 'image') {
    // Pour les images, on peut appliquer une couleur de filtre ou de bordure
    activeObject.set('stroke', drawColor.value)
    activeObject.set('strokeWidth', 3)
  } else {
    // Pour les autres types, essayer fill
    activeObject.set('fill', drawColor.value)
  }
  
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
  
}

const applyRotation = () => {
  if (!canvas) return
  
  const activeObject = canvas.getActiveObject()
  
  if (!activeObject) {
    alert('Veuillez d\'abord sélectionner un objet (cliquez dessus)')
    return
  }
  
  // Normaliser l'angle entre -360 et 360
  let angle = rotationAngle.value
  if (angle < -360) angle = -360
  if (angle > 360) angle = 360
  
  // Obtenir le centre actuel de l'objet avant la rotation
  // getCenterPoint() retourne le centre géométrique réel de l'objet
  activeObject.setCoords() // S'assurer que les coordonnées sont à jour
  const centerBefore = activeObject.getCenterPoint()
  const centerX = centerBefore.x
  const centerY = centerBefore.y
  
  // Appliquer la rotation à l'objet
  activeObject.set({ angle: angle })
  activeObject.setCoords()
  
  // Obtenir le nouveau centre après rotation
  const centerAfter = activeObject.getCenterPoint()
  
  // Calculer le décalage nécessaire pour ramener le centre à sa position d'origine
  const deltaX = centerX - centerAfter.x
  const deltaY = centerY - centerAfter.y
  
  // Ajuster la position pour maintenir le même centre
  activeObject.set({
    left: (activeObject.left || 0) + deltaX,
    top: (activeObject.top || 0) + deltaY
  })
  activeObject.setCoords()
  
  // Synchroniser les copies wrap-around si l'objet roté est un original
  if (!activeObject.userData?.isWorkZoneIndicator && !activeObject.userData?.isWrapAroundCopy) {
    syncAllCopiesWithOriginal(activeObject)
  } else if (activeObject.userData?.isWrapAroundCopy) {
    // Si c'est une copie qui est rotée, synchroniser avec l'original
    const original = activeObject.userData?.originalObject
    if (original) {
      original.set({ angle: angle })
      original.setCoords()
      syncAllCopiesWithOriginal(original)
    }
  }
  

  
  // Émettre l'événement de rotation pour appliquer la rotation au modèle 3D
  if (!activeObject.userData?.isWorkZoneIndicator) {
    emit('object-rotated', {
      object: activeObject,
      angle: angle // Angle en degrés
    })
  }
  
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
  saveHistory()
  signalChange()
}

const toggleDrawMode = () => {
  if (!canvas) return
  isDrawMode.value = !isDrawMode.value
  canvas.isDrawingMode = isDrawMode.value
  
  if (isDrawMode.value) {
    // Mode dessin : désactiver la sélection temporairement
    canvas.selection = false
    canvas.defaultCursor = 'crosshair'
    // Désactiver les événements sur les objets pendant le dessin
    canvas.getObjects().forEach(obj => {
      obj.evented = false
    })
  } else {
    // Mode objet : activer la sélection et le déplacement
    canvas.selection = true
    canvas.defaultCursor = 'default'
    // Réactiver les événements sur tous les objets
    canvas.getObjects().forEach(obj => {
      obj.selectable = true
      obj.evented = true
    })
    canvas.renderAll()
  }
}






/**
 * Ajoute une ligne rouge verticale pour visualiser la couture du gobelet
 * La couture est à x = 0 (et x = canvasWidth car c'est le même point sur un modèle cylindrique)
 */
const addSeamLine = () => {
  if (!canvas) {
    return
  }
  
  // Vérifier si une ligne de couture existe déjà
  const existingSeam = canvas.getObjects().find(obj => obj.userData?.isSeamLine)
  if (existingSeam) {
    // Si elle existe, la supprimer
    canvas.remove(existingSeam)
    canvas.renderAll()
    requestTextureUpdate()
    emit('design-updated', canvas)
    return
  }
  
  // Créer une ligne rouge verticale à x = 0 (couture)
  // La ligne va de haut en bas du canvas
  const seamLine = new Rect({
    left: 0,
    top: 0,
    width: 2, // Largeur de 2px pour être visible
    height: canvasHeight,
    fill: '#ff0000', // Rouge pur
    stroke: '#cc0000', // Bordure rouge foncé
    strokeWidth: 0,
    rx: 0,
    ry: 0,
    selectable: false, // Non sélectionnable pour éviter de la déplacer
    evented: false, // Ne bloque pas les interactions
    excludeFromExport: false // Inclure dans l'export
  })
  
  seamLine.userData = { isSeamLine: true }
  
  canvas.add(seamLine)
  // Envoyer la ligne à l'arrière-plan pour ne pas gêner
  try {
    if (canvas.sendObjectToBack) {
      canvas.sendObjectToBack(seamLine)
    }
  } catch (e) {
    // Si la méthode n'existe pas, ignorer
  }
  
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
  
}

// Fonction addSeamPoint supprimée - fonctionnalité de point vert sur la couture désactivée

/**
 * Ajoute une bande verte horizontale au centre du gobelet
 * Cette bande apparaîtra comme une bande horizontale sur le modèle 3D
 */
const addGreenBand = () => {
  if (!canvas) {
    return
  }
  
  // Calculer la position au centre vertical du canvas (zone active)
  const topHeight = canvasHeight * props.workZoneTop
  const bottomHeight = canvasHeight * props.workZoneBottom
  const activeZoneTop = topHeight
  const activeZoneBottom = canvasHeight - bottomHeight
  const activeZoneCenterY = activeZoneTop + (activeZoneBottom - activeZoneTop) / 2
  
  // Créer une bande verte horizontale
  // IMPORTANT: Éviter la zone de couture (bords gauche et droit)
  // La couture est à x = 0 et x = canvasWidth (même point dans la projection cylindrique)
  // On crée deux bandes séparées pour éviter que la bande soit traversée par la couture
  
  const bandHeight = 20
  const seamAvoidanceZone = 50 // Zone à éviter autour de la couture (50px de chaque côté)
  const bandWidth = (canvasWidth - seamAvoidanceZone * 2) / 2 // Largeur de chaque bande
  
  // Bande gauche (de la zone d'évitement jusqu'au centre)
  const leftBand = new Rect({
    left: seamAvoidanceZone, // Commencer après la zone de couture
    top: activeZoneCenterY - bandHeight / 2,
    width: bandWidth,
    height: bandHeight,
    fill: '#00ff00', // Vert pur
    stroke: '#00cc00', // Bordure vert foncé
    strokeWidth: 1,
    rx: 0,
    ry: 0,
    selectable: true,
    evented: true
  })
  
  // Bande droite (du centre jusqu'à la zone d'évitement)
  const rightBand = new Rect({
    left: canvasWidth / 2, // Commencer au centre
    top: activeZoneCenterY - bandHeight / 2,
    width: bandWidth,
    height: bandHeight,
    fill: '#00ff00', // Vert pur
    stroke: '#00cc00', // Bordure vert foncé
    strokeWidth: 1,
    rx: 0,
    ry: 0,
    selectable: true,
    evented: true
  })
  
  canvas.add(leftBand)
  canvas.add(rightBand)
  canvas.setActiveObject(leftBand) // Sélectionner la première bande
  
  canvas.isDrawingMode = false
  isDrawMode.value = false
  canvas.selection = true
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
}

const clearCanvas = () => {
  if (!canvas) return
  canvas.clear()
  canvas.backgroundColor = 'transparent'
  canvas.renderAll()
  requestTextureUpdate() // Signal pour mettre à jour la texture 3D
  emit('design-updated', canvas)
  
  // Réinitialiser l'historique après avoir effacé
  history = []
  historyIndex = -1
  saveHistory()
}

const exportDesign = () => {
  if (!canvas) return
  const dataURL = canvas.toDataURL({
    format: 'png',
    quality: 1
  })
  
  const link = document.createElement('a')
  link.href = dataURL
  link.download = 'design.png'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Methods to get canvas data for texture
const getCanvasAsTexture = () => {
  if (!canvas) {
    return null
  }
  
  try {
    // Wait for canvas to be fully rendered
    canvas.renderAll()
    
    // Create a temporary canvas with white background for proper texture
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = canvasWidth
    tempCanvas.height = canvasHeight
    const ctx = tempCanvas.getContext('2d')
    
    if (ctx) {
      // Fill with white background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)
      
      // Get the fabric canvas element
      const fabricCanvas = canvas.getElement()
      
      // Ensure it's fully rendered
      if (fabricCanvas && fabricCanvas.width > 0 && fabricCanvas.height > 0) {
        // Draw the fabric canvas content
        ctx.drawImage(fabricCanvas, 0, 0, canvasWidth, canvasHeight)
        
        const objectCount = canvas.getObjects().length
        const dataURL = tempCanvas.toDataURL()
        const hasContent = dataURL.length > 100
        
        return tempCanvas
      } else {
      }
    }
  } catch (error) {
  }
  
  return null
}

/**
 * Active le mode de placement pour un type d'élément
 * Ajoute directement l'élément au centre du canvas
 */
const activatePlacementMode = (type) => {
  if (!canvas) {
    return
  }
  
  // Calculer le centre du canvas en tenant compte de la zone de travail
  const topHeight = canvasHeight * props.workZoneTop
  const bottomHeight = canvasHeight * props.workZoneBottom
  const activeZoneTop = topHeight
  const activeZoneBottom = canvasHeight - bottomHeight
  const activeZoneCenterY = activeZoneTop + (activeZoneBottom - activeZoneTop) / 2
  const centerX = canvasWidth / 2
  
  // Ajouter directement l'élément au centre
  placeElementAt(type, centerX, activeZoneCenterY)
}

/**
 * Place un élément à une position spécifique sur le canvas
 */
const placeElementAt = (type, x, y) => {
  if (!canvas) {
    return
  }
  
  
  // Vérifier que la position est dans la zone active
  const topHeight = canvasHeight * props.workZoneTop
  const bottomHeight = canvasHeight * props.workZoneBottom
  const activeZoneTop = topHeight
  const activeZoneBottom = canvasHeight - bottomHeight
  
  // Ajuster y pour qu'il soit dans la zone active
  const adjustedY = Math.max(activeZoneTop, Math.min(activeZoneBottom, y))
  
  switch(type) {
    case 'circle':
      placeCircleAt(x, adjustedY)
      break
    case 'rectangle':
      placeRectangleAt(x, adjustedY)
      break
    case 'text':
      placeTextAt(x, adjustedY)
      break
    default:
  }
  
  // Désactiver le mode placement après placement
  placementMode.value = null
  emit('placement-mode-changed', { active: false, type: null })
}

const placeCircleAt = (x, y) => {
  const circle = new Circle({
    left: x - 50,
    top: y - 50,
    radius: 50,
    opacity: 1.0,
    fill: drawColor.value || '#000000',
    stroke: '#000000',
    strokeWidth: 2,
    selectable: true,
    evented: true
  })
  
  canvas.add(circle)
  canvas.setActiveObject(circle)
  canvas.isDrawingMode = false
  isDrawMode.value = false
  canvas.selection = true
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
}
/**
 * Crée un rectangle centré à la position (x, y) et configure ses contrôles
 * 
 * @param {number} x - Position X où placer le rectangle (centre)
 * @param {number} y - Position Y où placer le rectangle (centre)
 */
const placeRectangleAt = (x, y) => {
  // ===== ÉTAPE 1: Définir les dimensions =====
  const rectWidth = 100      // Largeur du rectangle
  const rectHeight = 100      // Hauteur du rectangle
  
  // ===== ÉTAPE 2: Créer le rectangle centré sur (x, y) =====
  const rect = new Rect({
    left: x - rectWidth / 2,  // Position X: centré horizontalement
    top: y - rectHeight / 2,   // Position Y: centré verticalement
    width: rectWidth,
    height: rectHeight,
    fill: drawColor.value || '#000000',
    stroke: '#000000',
    strokeWidth: 2,
    rx: 8,
    ry: 8,
    selectable: true,
    evented: true
  })
  
  // ===== ÉTAPE 3: Configurer les contrôles du rectangle =====
  // Les contrôles sont les petits carrés/cercles qui permettent de redimensionner/rotater
  // mt = middle-top, mb = middle-bottom, ml = middle-left, mr = middle-right
  // tl = top-left, tr = top-right, bl = bottom-left, br = bottom-right
  // mtr = middle-top-rotation (contrôle de rotation)
  rect.userData = rect.userData || {}
  rect.userData.controlsConfig = {
    mt: true,   // ✅ Contrôle en haut au milieu
    mb: true,   // ✅ Contrôle en bas au milieu
    ml: true,   // ✅ Contrôle à gauche au milieu (pour redimensionner vers la gauche)
    mr: true,   // ✅ Contrôle à droite au milieu (pour redimensionner vers la droite)
    tl: true,   // ✅ Contrôle coin haut-gauche
    tr: true,   // ✅ Contrôle coin haut-droite
    bl: true,   // ✅ Contrôle coin bas-gauche
    br: true,   // ✅ Contrôle coin bas-droite
    mtr: true  // ✅ Contrôle de rotation (en haut)
  }
  
  // ===== ÉTAPE 4: Ajouter le rectangle au canvas =====
  // Quand on ajoute un objet, l'événement 'object:added' se déclenche
  // Cet événement vérifie si userData.controlsConfig existe et l'applique automatiquement
  canvas.add(rect)
  
  // ===== ÉTAPE 5: Enregistrer l'objet pour l'affichage multi-sélection =====
  // On stocke le rectangle dans canvas.userData.multiSelectedObjects
  // Cela permet à l'événement 'after:render' d'afficher les contrôles
  if (!canvas.userData) {
    canvas.userData = {}
  }
  if (!canvas.userData.multiSelectedObjects) {
    canvas.userData.multiSelectedObjects = []
  }
  canvas.userData.multiSelectedObjects.push(rect)
  
  // ===== ÉTAPE 6: Configuration finale du canvas =====
  canvas.isDrawingMode = false  // Désactiver le mode dessin
  isDrawMode.value = false      // Désactiver le mode dessin (variable Vue)
  canvas.selection = true       // Activer la sélection d'objets
  canvas.renderAll()            // Rendre le canvas
  requestTextureUpdate()        // Demander la mise à jour de la texture 3D
  emit('design-updated', canvas) // Notifier le composant parent que le design a changé
}

const placeTextAt = (x, y) => {
  const text = new Textbox('Hello', {
    left: x - 100,
    top: y - 25,
    fontSize: 32,
    fill: drawColor.value || '#000000',
    fontFamily: 'Arial',
    width: 80,
    selectable: true,
    evented: true
  })
  
  canvas.add(text)
  canvas.setActiveObject(text)
  canvas.isDrawingMode = false
  isDrawMode.value = false
  canvas.selection = true
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
}

const placeImageAt = async (x, y) => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const url = URL.createObjectURL(file)
      const fabricImg = await FabricImage.fromURL(url)
      
      fabricImg.set({
        left: x - fabricImg.width / 2,
        top: y - fabricImg.height / 2,
        selectable: true,
        evented: true
      })
      
      canvas.add(fabricImg)
      canvas.setActiveObject(fabricImg)
      canvas.isDrawingMode = false
      isDrawMode.value = false
      canvas.selection = true
      canvas.renderAll()
      requestTextureUpdate()
      emit('design-updated', canvas)
      
      URL.revokeObjectURL(url)
    } catch (error) {
      alert('Erreur lors du chargement de l\'image')
    }
  }
  input.click()
}

/**
 * Trouve l'objet Fabric.js à une position donnée sur le canvas
 * 
 * @param {number} x - Position X sur le canvas
 * @param {number} y - Position Y sur le canvas
 * @returns {fabric.Object|null} - L'objet trouvé ou null
 */
const findObjectAtPosition = (x, y) => {
  if (!canvas) return null
  
  // Obtenir tous les objets (sauf les indicateurs de zone de travail)
  const objects = canvas.getObjects().filter(obj => 
    !obj.userData?.isWorkZoneIndicator && 
    obj.visible !== false &&
    (obj.selectable !== false || obj.evented !== false)
  )
  
  // Parcourir les objets de haut en bas (les derniers ajoutés sont en premier)
  // et trouver celui qui contient le point
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i]
    
    // S'assurer que les coordonnées de l'objet sont à jour
    if (obj.setCoords) {
      obj.setCoords()
    }
    
    // Utiliser la méthode native containsPoint de Fabric.js si disponible
    // qui prend en compte toutes les transformations (rotation, scale, origine, etc.)
    try {
      if (typeof obj.containsPoint === 'function') {
        // containsPoint attend un point avec x et y
        const point = { x, y }
        if (obj.containsPoint(point)) {
          return obj
        }
      }
    } catch (e) {
      // Si containsPoint échoue, continuer avec le fallback
    }
    
    // Fallback: utiliser une vérification améliorée qui prend en compte l'origine de l'objet
    // et les transformations de base
    // Obtenir les coordonnées transformées de l'objet
    const coords = obj.aCoords || obj.oCoords || {}
    
    if (coords && coords.tl && coords.tr && coords.bl && coords.br) {
      // Utiliser les coordonnées transformées (prend en compte la rotation)
      // Vérifier si le point est dans le polygone formé par les 4 coins
      const points = [coords.tl, coords.tr, coords.br, coords.bl]
      
      // Algorithme du point dans un polygone (ray casting)
      let inside = false
      for (let j = 0, k = points.length - 1; j < points.length; k = j++) {
        const xi = points[j].x
        const yi = points[j].y
        const xj = points[k].x
        const yj = points[k].y
        
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
        if (intersect) inside = !inside
      }
      
      if (inside) {
        return obj
      }
    } else {
      // Si les coordonnées transformées ne sont pas disponibles, utiliser une vérification basique
      const objLeft = obj.left || 0
      const objTop = obj.top || 0
      const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
      const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
      
      // Prendre en compte l'origine de l'objet
      const originX = obj.originX || 'left'
      const originY = obj.originY || 'top'
      
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
      
      // Vérifier si le point est dans les limites de l'objet
      // Utiliser une tolérance plus grande pour améliorer la détection (20px)
      const tolerance = 20
      if (x >= actualLeft - tolerance && x <= actualLeft + objWidth + tolerance &&
          y >= actualTop - tolerance && y <= actualTop + objHeight + tolerance) {
        // Pour les cercles, vérifier aussi la distance au centre
        if (obj.type === 'circle' && obj.radius) {
          const centerX = objLeft
          const centerY = objTop
          const radius = obj.radius * (obj.scaleX || 1)
          const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2))
          if (distance <= radius + tolerance) {
            return obj
          }
        } else {
          // Pour les autres objets, la vérification rectangulaire suffit
          return obj
        }
      }
    }
  }
  
  return null
}

/**
 * Détecte si un point est près d'un bord ou coin d'un objet pour le redimensionnement
 * 
 * @param {fabric.Object} obj - L'objet à vérifier
 * @param {number} x - Position X du point
 * @param {number} y - Position Y du point
 * @param {number} threshold - Distance de tolérance en pixels (défaut: 10)
 * @returns {Object|null} - { edge: 'top'|'bottom'|'left'|'right'|'corner', corner: 'tl'|'tr'|'bl'|'br'|null } ou null
 */
const detectResizeHandle = (obj, x, y, threshold = 10) => {
  if (!obj) return null
  
  // Toujours utiliser les coordonnées transformées pour détecter les contrôles
  // Cela garantit que la détection fonctionne correctement après rotation
  if (obj.setCoords) {
    obj.setCoords() // S'assurer que les coordonnées sont à jour
  }
  
  const coords = obj.calcCoords ? obj.calcCoords() : (obj.oCoords || null)
  if (!coords || !coords.tl || !coords.tr || !coords.bl || !coords.br) {
    return null
  }
  
  // Utiliser les coordonnées transformées des coins
  const tl = coords.tl
  const tr = coords.tr
  const bl = coords.bl
  const br = coords.br
  
  // Vérifier les coins en premier (priorité)
  const cornerThreshold = threshold * 1.5 // Un peu plus large pour les coins
  
  // Coin haut-gauche (top-left)
  const distTL = Math.sqrt(Math.pow(x - tl.x, 2) + Math.pow(y - tl.y, 2))
  if (distTL < cornerThreshold) {
    return { edge: 'corner', corner: 'tl', handle: 'tl' }
  }
  
  // Coin haut-droite (top-right)
  const distTR = Math.sqrt(Math.pow(x - tr.x, 2) + Math.pow(y - tr.y, 2))
  if (distTR < cornerThreshold) {
    return { edge: 'corner', corner: 'tr', handle: 'tr' }
  }
  
  // Coin bas-gauche (bottom-left)
  const distBL = Math.sqrt(Math.pow(x - bl.x, 2) + Math.pow(y - bl.y, 2))
  if (distBL < cornerThreshold) {
    return { edge: 'corner', corner: 'bl', handle: 'bl' }
  }
  
  // Coin bas-droite (bottom-right)
  const distBR = Math.sqrt(Math.pow(x - br.x, 2) + Math.pow(y - br.y, 2))
  if (distBR < cornerThreshold) {
    return { edge: 'corner', corner: 'br', handle: 'br' }
  }
  
  // Vérifier les bords en utilisant la distance perpendiculaire à chaque bord
  // Mais exclure les zones proches des coins pour éviter les conflits
  
  // Bord haut (entre tl et tr)
  const distToTopEdge = distanceToLineSegment(x, y, tl.x, tl.y, tr.x, tr.y)
  if (distToTopEdge < threshold) {
    // Vérifier que le point n'est pas trop proche des coins
    // Calculer la position du point le plus proche sur le segment
    const topDx = tr.x - tl.x
    const topDy = tr.y - tl.y
    const topLength2 = topDx * topDx + topDy * topDy
    if (topLength2 > 0) {
      const t = Math.max(0, Math.min(1, ((x - tl.x) * topDx + (y - tl.y) * topDy) / topLength2))
      const closestX = tl.x + t * topDx
      const closestY = tl.y + t * topDy
      // Calculer la distance le long du bord depuis les coins
      const distFromTL = Math.sqrt(Math.pow(closestX - tl.x, 2) + Math.pow(closestY - tl.y, 2))
      const distFromTR = Math.sqrt(Math.pow(closestX - tr.x, 2) + Math.pow(closestY - tr.y, 2))
      const topEdgeLength = Math.sqrt(topLength2)
      // Exclure les 20% de chaque extrémité du bord (zones des coins)
      const excludeZone = topEdgeLength * 0.2
      if (distFromTL > excludeZone && distFromTR > excludeZone) {
        return { edge: 'top', corner: null, handle: 'mt' }
      }
    }
  }
  
  // Bord bas (entre bl et br)
  const distToBottomEdge = distanceToLineSegment(x, y, bl.x, bl.y, br.x, br.y)
  if (distToBottomEdge < threshold) {
    const bottomDx = br.x - bl.x
    const bottomDy = br.y - bl.y
    const bottomLength2 = bottomDx * bottomDx + bottomDy * bottomDy
    if (bottomLength2 > 0) {
      const t = Math.max(0, Math.min(1, ((x - bl.x) * bottomDx + (y - bl.y) * bottomDy) / bottomLength2))
      const closestX = bl.x + t * bottomDx
      const closestY = bl.y + t * bottomDy
      const distFromBL = Math.sqrt(Math.pow(closestX - bl.x, 2) + Math.pow(closestY - bl.y, 2))
      const distFromBR = Math.sqrt(Math.pow(closestX - br.x, 2) + Math.pow(closestY - br.y, 2))
      const bottomEdgeLength = Math.sqrt(bottomLength2)
      const excludeZone = bottomEdgeLength * 0.2
      if (distFromBL > excludeZone && distFromBR > excludeZone) {
        return { edge: 'bottom', corner: null, handle: 'mb' }
      }
    }
  }
  
  // Bord gauche (entre tl et bl)
  const distToLeftEdge = distanceToLineSegment(x, y, tl.x, tl.y, bl.x, bl.y)
  if (distToLeftEdge < threshold) {
    const leftDx = bl.x - tl.x
    const leftDy = bl.y - tl.y
    const leftLength2 = leftDx * leftDx + leftDy * leftDy
    if (leftLength2 > 0) {
      const t = Math.max(0, Math.min(1, ((x - tl.x) * leftDx + (y - tl.y) * leftDy) / leftLength2))
      const closestX = tl.x + t * leftDx
      const closestY = tl.y + t * leftDy
      const distFromTL = Math.sqrt(Math.pow(closestX - tl.x, 2) + Math.pow(closestY - tl.y, 2))
      const distFromBL = Math.sqrt(Math.pow(closestX - bl.x, 2) + Math.pow(closestY - bl.y, 2))
      const leftEdgeLength = Math.sqrt(leftLength2)
      const excludeZone = leftEdgeLength * 0.2
      if (distFromTL > excludeZone && distFromBL > excludeZone) {
        return { edge: 'left', corner: null, handle: 'ml' }
      }
    }
  }
  
  // Bord droit (entre tr et br)
  const distToRightEdge = distanceToLineSegment(x, y, tr.x, tr.y, br.x, br.y)
  if (distToRightEdge < threshold) {
    const rightDx = br.x - tr.x
    const rightDy = br.y - tr.y
    const rightLength2 = rightDx * rightDx + rightDy * rightDy
    if (rightLength2 > 0) {
      const t = Math.max(0, Math.min(1, ((x - tr.x) * rightDx + (y - tr.y) * rightDy) / rightLength2))
      const closestX = tr.x + t * rightDx
      const closestY = tr.y + t * rightDy
      const distFromTR = Math.sqrt(Math.pow(closestX - tr.x, 2) + Math.pow(closestY - tr.y, 2))
      const distFromBR = Math.sqrt(Math.pow(closestX - br.x, 2) + Math.pow(closestY - br.y, 2))
      const rightEdgeLength = Math.sqrt(rightLength2)
      const excludeZone = rightEdgeLength * 0.2
      if (distFromTR > excludeZone && distFromBR > excludeZone) {
        return { edge: 'right', corner: null, handle: 'mr' }
      }
    }
  }
  
  // Vérifier le contrôle de rotation (mtr - middle-top-rotation)
  // Position au-dessus du centre du haut
  const centerTopX = (tl.x + tr.x) / 2
  const centerTopY = (tl.y + tr.y) / 2
  // Calculer un vecteur perpendiculaire vers le haut
  const dx = tr.x - tl.x
  const dy = tr.y - tl.y
  const length = Math.sqrt(dx * dx + dy * dy)
  
  let rotationHandleX, rotationHandleY
  if (length < 0.01) {
    // Cas dégénéré : les points sont confondus
    return null
  }
  
  if (Math.abs(dy) < 0.01) {
    // Rectangle non roté : positionner directement au-dessus
    rotationHandleX = centerTopX
    rotationHandleY = centerTopY - 30 // Directement au-dessus (Y diminue vers le haut)
  } else {
    // Rectangle roté : utiliser le calcul vectoriel
    // Le vecteur perpendiculaire à (dx, dy) peut être (-dy, dx) ou (dy, -dx)
    // On choisit (dy, -dx) pour pointer vers le haut (au-dessus du bord)
    const offset = 30 // Distance au-dessus du bord
    rotationHandleX = centerTopX + (dy / length) * offset
    rotationHandleY = centerTopY - (dx / length) * offset
  }
  
  const rotationThreshold = threshold * 1.5 // Zone un peu plus large pour le contrôle de rotation
  const distToMTR = Math.sqrt(Math.pow(x - rotationHandleX, 2) + Math.pow(y - rotationHandleY, 2))
  
  if (distToMTR < rotationThreshold) {
    return { edge: null, corner: null, handle: 'mtr', isRotation: true }
  }
  
  return null
}

/**
 * Calcule la distance d'un point à un segment de ligne
 * @param {number} px - Coordonnée X du point
 * @param {number} py - Coordonnée Y du point
 * @param {number} x1 - Coordonnée X du premier point du segment
 * @param {number} y1 - Coordonnée Y du premier point du segment
 * @param {number} x2 - Coordonnée X du second point du segment
 * @param {number} y2 - Coordonnée Y du second point du segment
 * @returns {number} - Distance minimale du point au segment
 */
const distanceToLineSegment = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1
  const dy = y2 - y1
  const length2 = dx * dx + dy * dy
  
  if (length2 === 0) {
    // Les deux points sont confondus
    return Math.sqrt(Math.pow(px - x1, 2) + Math.pow(py - y1, 2))
  }
  
  // Paramètre t pour le point le plus proche sur le segment
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length2))
  
  // Point le plus proche sur le segment
  const closestX = x1 + t * dx
  const closestY = y1 + t * dy
  
  // Distance du point au point le plus proche
  return Math.sqrt(Math.pow(px - closestX, 2) + Math.pow(py - closestY, 2))
}

/**
 * Calcule les coordonnées de tous les contrôles pour un objet Fabric.js
 * 
 * EXPLICATION : Comment les coordonnées des contrôles changent lors de la rotation
 * ================================================================================
 * 
 * 1. RECALCUL DES COORDONNÉES DE BASE (coords)
 *    ------------------------------------------
 *    Quand un objet est roté, Fabric.js stocke l'angle dans obj.angle.
 *    Les coordonnées des coins (tl, tr, bl, br) sont recalculées automatiquement
 *    par Fabric.js via setCoords() ou calcCoords() en appliquant une transformation
 *    de rotation autour du centre de l'objet.
 * 
 *    Exemple : Un rectangle à 0° avec tl(100, 100), tr(200, 100)
 *              Après rotation de 45° : les coordonnées changent selon :
 *              x' = centerX + (x - centerX) * cos(angle) - (y - centerY) * sin(angle)
 *              y' = centerY + (x - centerX) * sin(angle) + (y - centerY) * cos(angle)
 * 
 * 2. POSITIONNEMENT DES CONTRÔLES
 *    -----------------------------
 *    Les contrôles utilisent les coordonnées transformées (coords) qui sont
 *    déjà calculées par Fabric.js après rotation :
 * 
 *    a) COINS (tl, tr, bl, br) :
 *       → Utilisent directement les coordonnées transformées
 *       → Exemple : controls.tl = { x: coords.tl.x, y: coords.tl.y }
 *       → Ces coordonnées changent automatiquement car coords.tl est déjà roté
 * 
 *    b) BORDS (mt, mb, ml, mr) :
 *       → Calculés comme la moyenne des deux coins adjacents
 *       → Exemple : mt = milieu entre tl et tr
 *       → mt.x = (coords.tl.x + coords.tr.x) / 2
 *       → mt.y = (coords.tl.y + coords.tr.y) / 2
 *       → Comme tl et tr sont déjà rotés, mt suit automatiquement la rotation
 * 
 *    c) CONTRÔLE DE ROTATION (mtr) :
 *       → Positionné perpendiculairement au bord supérieur
 *       → Utilise un calcul vectoriel pour trouver la direction perpendiculaire :
 *         - Vecteur du bord : dx = tr.x - tl.x, dy = tr.y - tl.y
 *         - Vecteur perpendiculaire vers le haut : (dy, -dx) normalisé
 *         - Position = centre du bord + offset * vecteur perpendiculaire
 *       → Formule : 
 *         x = centerTopX + (dy / length) * offset
 *         y = centerTopY - (dx / length) * offset
 *       → Ce calcul garantit que mtr reste toujours au-dessus du bord (côté opposé à bl),
 *         même après rotation
 * 
 * 3. POURQUOI ÇA FONCTIONNE
 *    -----------------------
 *    Fabric.js gère automatiquement la transformation des coordonnées lors de la rotation.
 *    Quand on appelle setCoords() ou calcCoords(), Fabric.js :
 *    - Prend les coordonnées locales de l'objet (non roté)
 *    - Applique la transformation de rotation
 *    - Retourne les coordonnées dans l'espace du canvas (déjà rotées)
 * 
 *    Donc, on n'a pas besoin de calculer manuellement la rotation des contrôles :
 *    on utilise simplement les coordonnées transformées que Fabric.js nous donne !
 * 
 * @param {fabric.Object} obj - L'objet Fabric.js
 * @returns {Object} - Objet contenant les coordonnées de tous les contrôles
 */
const calculateControlCoordinates2D = (obj) => {
  if (!obj) return {}
  
  // ÉTAPE 1 : Recalculer les coordonnées transformées de l'objet
  // Fabric.js calcule automatiquement les nouvelles positions des coins
  // après rotation en utilisant la matrice de transformation
  let coords = null
  try {
    if (obj.setCoords) {
      obj.setCoords() // Force le recalcul des coordonnées transformées
    }
    coords = obj.calcCoords ? obj.calcCoords() : obj.oCoords
    // coords contient maintenant tl, tr, bl, br avec leurs nouvelles positions rotées
  } catch (e) {
    console.warn('Erreur lors de calcCoords:', e)
    coords = obj.oCoords || null
  }
  
  if (!coords || !coords.tl) return {}
  
  const controls = {}
  
  // ÉTAPE 2a : COINS - Utiliser directement les coordonnées transformées
  // Ces coordonnées sont déjà rotées par Fabric.js, donc on les copie telles quelles
  if (coords.tl) {
    controls.tl = { x: coords.tl.x, y: coords.tl.y } // Top-left (déjà roté)
  }
  if (coords.tr) {
    controls.tr = { x: coords.tr.x, y: coords.tr.y } // Top-right (déjà roté)
  }
  if (coords.bl) {
    controls.bl = { x: coords.bl.x, y: coords.bl.y } // Bottom-left (déjà roté)
  }
  if (coords.br) {
    controls.br = { x: coords.br.x, y: coords.br.y } // Bottom-right (déjà roté)
  }
  
  // ÉTAPE 2b : BORDS - Moyenne des deux coins adjacents (déjà rotés)
  // Comme les coins sont rotés, la moyenne donne automatiquement le bon milieu roté
  if (coords.tl && coords.tr) {
    controls.mt = { 
      x: (coords.tl.x + coords.tr.x) / 2, // Milieu horizontal du bord supérieur
      y: (coords.tl.y + coords.tr.y) / 2  // (déjà roté car tl et tr le sont)
    }
  }
  if (coords.bl && coords.br) {
    controls.mb = { 
      x: (coords.bl.x + coords.br.x) / 2, // Milieu du bord inférieur
      y: (coords.bl.y + coords.br.y) / 2  // (déjà roté)
    }
  }
  if (coords.tl && coords.bl) {
    controls.ml = { 
      x: (coords.tl.x + coords.bl.x) / 2, // Milieu du bord gauche
      y: (coords.tl.y + coords.bl.y) / 2  // (déjà roté)
    }
  }
  if (coords.tr && coords.br) {
    controls.mr = { 
      x: (coords.tr.x + coords.br.x) / 2, // Milieu du bord droit
      y: (coords.tr.y + coords.br.y) / 2  // (déjà roté)
    }
  }
  
  // ÉTAPE 2c : CONTRÔLE DE ROTATION (mtr) - Calcul vectoriel perpendiculaire
  // Ce contrôle doit rester au-dessus du bord supérieur, même après rotation
  if (coords.tl && coords.tr) {
    // Centre du bord supérieur (déjà roté)
    const centerTopX = (coords.tl.x + coords.tr.x) / 2
    const centerTopY = (coords.tl.y + coords.tr.y) / 2
    
    // Vecteur du bord supérieur (de tl vers tr)
    // Ce vecteur indique la direction du bord après rotation
    const dx = coords.tr.x - coords.tl.x
    const dy = coords.tr.y - coords.tl.y
    const length = Math.sqrt(dx * dx + dy * dy)
    
    // Cas spécial : objet non roté (bord horizontal)
    if (Math.abs(dy) < 0.01) {
      // Rectangle non roté : positionner directement au-dessus (Y diminue vers le haut)
      controls.mtr = { 
        x: centerTopX, 
        y: centerTopY - 30 
      }
    } else {
      // Rectangle roté : utiliser le calcul vectoriel
      // Le vecteur perpendiculaire à (dx, dy) peut être (-dy, dx) ou (dy, -dx)
      // On choisit (dy, -dx) pour pointer vers le haut (au-dessus du bord)
      // Cela garantit que mtr est toujours du côté opposé à bl (en haut)
      const offset = 30 // Distance au-dessus du bord
      controls.mtr = { 
        // Formule : position = centre + offset * vecteur_perpendiculaire_normalisé_vers_le_haut
        x: centerTopX + (dy / length) * offset, // Composante X du vecteur perpendiculaire (inversée)
        y: centerTopY - (dx / length) * offset   // Composante Y du vecteur perpendiculaire (inversée)
      }
    }
  }
  
  return controls
}

/**
 * Met à jour la liste de tous les objets du canvas avec leurs contrôles
 */


/**
 * Sélectionne un objet à une position donnée sur le canvas
 * 
 * @param {number} x - Position X sur le canvas
 * @param {number} y - Position Y sur le canvas
 * @returns {boolean} - true si un objet a été sélectionné
 */
const selectObjectAtPosition = (x, y) => {
  if (!canvas) {
    return false
  }
  
  
  const obj = findObjectAtPosition(x, y)
  
  if (obj) {
    // Permettre la sélection directe des copies pour voir leurs contrôles
    // Sélectionner l'objet cliqué directement (copie ou original)
    const targetObject = obj
    
    canvas.setActiveObject(targetObject)
    updateHasSelection() // Mettre à jour hasSelection
    // Activer les contrôles pour l'objet sélectionné
    activateControlsForObject(targetObject)
    canvas.renderAll()
    
    // Émettre l'événement de sélection
    emit('object-selected', {
      object: targetObject,
      type: targetObject.type
    })
    
    return true
  }
  
  // Si aucun objet n'a été trouvé exactement, chercher l'objet le plus proche
  
  const objects = canvas.getObjects().filter(obj => 
    !obj.userData?.isWorkZoneIndicator && 
    obj.visible !== false &&
    (obj.selectable !== false || obj.evented !== false)
  )
  
  // Si il n'y a qu'un seul objet, vérifier s'il est proche du point de clic
  // Si oui, le sélectionner, sinon désélectionner
  if (objects.length === 1) {
    const obj = objects[0]
    const objLeft = obj.left || 0
    const objTop = obj.top || 0
    const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
    const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
    const originX = obj.originX || 'left'
    const originY = obj.originY || 'top'
    
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
    
    // Vérifier si le clic est proche de l'objet (tolérance de 100px)
    const tolerance = 100
    const isNear = x >= actualLeft - tolerance && x <= actualLeft + objWidth + tolerance &&
                   y >= actualTop - tolerance && y <= actualTop + objHeight + tolerance
    
    if (isNear) {
      // Permettre la sélection directe des copies
      const targetObject = obj
      
      canvas.setActiveObject(targetObject)
      // Activer les contrôles pour l'objet sélectionné
      activateControlsForObject(targetObject)
      canvas.renderAll()
      
      emit('object-selected', {
        object: targetObject,
        type: targetObject.type
      })
      
      return true
    } else {
      canvas.discardActiveObject()
      canvas.renderAll()
      emit('object-deselected')
      return false
    }
  }
  
  // Chercher l'objet le plus proche du point de clic
  // Si aucun objet n'est trouvé exactement, prendre le plus proche même s'il est loin
  let closestObj = null
  let closestDistance = Infinity
  
  objects.forEach(obj => {
    const objLeft = obj.left || 0
    const objTop = obj.top || 0
    const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
    const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
    const originX = obj.originX || 'left'
    const originY = obj.originY || 'top'
    
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
    
    // Calculer le centre de l'objet
    const centerX = actualLeft + objWidth / 2
    const centerY = actualTop + objHeight / 2
    
    // Calculer la distance du point de clic au centre de l'objet
    const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2))
    
    // Vérifier si le point est dans les limites de l'objet (avec tolérance très large)
    const tolerance = 200 // Tolérance très large (200px) pour capturer même les objets éloignés
    const isInBounds = x >= actualLeft - tolerance && x <= actualLeft + objWidth + tolerance &&
                       y >= actualTop - tolerance && y <= actualTop + objHeight + tolerance
    
    // Si l'objet est dans les bounds OU si c'est le plus proche jusqu'à présent
    if ((isInBounds || objects.length === 1) && distance < closestDistance) {
      closestDistance = distance
      closestObj = obj
    }
  })
  
  // Si on n'a toujours pas trouvé d'objet mais qu'il y a des objets, prendre le plus proche
  // MAIS seulement s'il est dans une zone raisonnable (max 300px)
  if (!closestObj && objects.length > 0) {
    const maxDistance = 300 // Distance maximale pour sélectionner un objet
    objects.forEach(obj => {
      const objLeft = obj.left || 0
      const objTop = obj.top || 0
      const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
      const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
      const originX = obj.originX || 'left'
      const originY = obj.originY || 'top'
      
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
      
      const centerX = actualLeft + objWidth / 2
      const centerY = actualTop + objHeight / 2
      const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2))
      
      // Ne sélectionner que si l'objet est dans une distance raisonnable
      if (distance < closestDistance && distance < maxDistance) {
        closestDistance = distance
        closestObj = obj
      }
    })
  }
  
  // Si on a trouvé un objet proche, le sélectionner
  if (closestObj) {
    // Permettre la sélection directe des copies
    const targetObject = closestObj
    
    canvas.setActiveObject(targetObject)
    updateHasSelection() // Mettre à jour hasSelection
    // Activer les contrôles pour l'objet sélectionné
    activateControlsForObject(targetObject)
    canvas.renderAll()
    
    emit('object-selected', {
      object: targetObject,
      type: targetObject.type
    })
    
    return true
  }
  
  canvas.discardActiveObject()
  updateHasSelection() // Mettre à jour hasSelection
  canvas.renderAll()
  emit('object-deselected')
  
  return false
}

/**
 * Redimensionne un objet sélectionné en tirant depuis un bord ou coin
 * 
 * @param {number} x - Position X actuelle du curseur
 * @param {number} y - Position Y actuelle du curseur
 * @param {number} startX - Position X de départ du drag
 * @param {number} startY - Position Y de départ du drag
 * @param {Object} handleInfo - Informations sur le handle (bord/coin)
 */
const resizeSelectedObjectFromHandle = async (x, y, startX, startY, handleInfo) => {
  if (!canvas) return
  console.log('resizeSelectedObjectFromHandle')
  const activeObject = canvas.getActiveObject()
  if (!activeObject || activeObject.userData?.isWorkZoneIndicator) {
    return
  }
  
  // Obtenir les dimensions originales de l'objet (sans scale)
  const originalWidth = activeObject.width || (activeObject.radius ? activeObject.radius * 2 : 50)
  const originalHeight = activeObject.height || (activeObject.radius ? activeObject.radius * 2 : 50)
  
  // S'assurer que userData existe
  if (!activeObject.userData) {
    activeObject.userData = {}
  }
  
  // Stocker le scale et position initiale au début du resize (si pas déjà fait)
  if (!activeObject.userData.initialScaleOnResize) {
    activeObject.userData.initialScaleOnResize = {
      scaleX: activeObject.scaleX || 1,
      scaleY: activeObject.scaleY || 1,
      left: activeObject.left || 0,
      top: activeObject.top || 0
    }
  }
  
  const initialScale = activeObject.userData.initialScaleOnResize
  const initialWidth = originalWidth * initialScale.scaleX
  const initialHeight = originalHeight * initialScale.scaleY
  
  // Obtenir l'angle de rotation de l'objet (en radians)
  const angle = (activeObject.angle || 0) * Math.PI / 180
  const cosAngle = Math.cos(-angle) // Angle négatif pour la transformation inverse
  const sinAngle = Math.sin(-angle)
  // Calculer les différences de position depuis le début du resize
  const deltaX = x - startX
  const deltaY = y - startY
  
  // Transformer les deltas dans le système de coordonnées local de l'objet
  // (en tenant compte de sa rotation)
  const localDeltaX = deltaX * cosAngle - deltaY * sinAngle
  const localDeltaY = deltaX * sinAngle + deltaY * cosAngle
  
  let newScaleX = initialScale.scaleX
  let newScaleY = initialScale.scaleY
  let newLeft = initialScale.left
  let newTop = initialScale.top
  // Calculer le nouveau scale et position selon le handle
  // Utiliser les deltas locaux pour un redimensionnement correct après rotation
  if (handleInfo.corner) {
    // Redimensionnement par coin (scale proportionnel)
    if (handleInfo.corner === 'br') {
      // Coin bas-droite : scale depuis le coin haut-gauche
      newScaleX = (initialWidth + localDeltaX) / originalWidth
      newScaleY = (initialHeight + localDeltaY) / originalHeight
    } else if (handleInfo.corner === 'tl') {
      // Coin haut-gauche : scale depuis le coin bas-droite
      newScaleX = (initialWidth - localDeltaX) / originalWidth
      newScaleY = (initialHeight - localDeltaY) / originalHeight
      // Transformer le déplacement dans le système global pour la position
      newLeft = initialScale.left + deltaX
      newTop = initialScale.top + deltaY
    } else if (handleInfo.corner === 'tr') {
      // Coin haut-droite : scale depuis le coin bas-gauche
      newScaleX = (initialWidth + localDeltaX) / originalWidth
      newScaleY = (initialHeight - localDeltaY) / originalHeight
      // Transformer le déplacement dans le système global pour la position
      newTop = initialScale.top + deltaY
    } else if (handleInfo.corner === 'bl') {
      // Coin bas-gauche : scale depuis le coin haut-droite
      newScaleX = (initialWidth - localDeltaX) / originalWidth
      newScaleY = (initialHeight + localDeltaY) / originalHeight
      // Transformer le déplacement dans le système global pour la position
      newLeft = initialScale.left + deltaX
    }
  } else {
    // Redimensionnement par bord (scale dans une direction)
    if (handleInfo.edge === 'right') {
      newScaleX = (initialWidth + localDeltaX) / originalWidth
      // Garder la position et le scale Y inchangés
    } else if (handleInfo.edge === 'left') {
      newScaleX = (initialWidth - localDeltaX) / originalWidth
      // Transformer le déplacement dans le système global pour la position
      newLeft = initialScale.left + deltaX
    } else if (handleInfo.edge === 'bottom') {
      newScaleY = (initialHeight + localDeltaY) / originalHeight
      // Garder la position et le scale X inchangés
    } else if (handleInfo.edge === 'top') {
      newScaleY = (initialHeight - localDeltaY) / originalHeight
    console.log('newScaleY', newScaleY, 'newTop', newTop,'initialHeight', initialHeight,'localDeltaY', localDeltaY,'originalHeight', originalHeight,'initialScale.top', initialScale.top,'deltaY', deltaY)
      // Transformer le déplacement dans le système global pour la position
      newTop = (initialScale.top + deltaY)
    }
  }
  
  // Limiter le scale (entre 0.1 et 10)
  newScaleX = Math.max(0.1, Math.min(10, newScaleX))
  newScaleY = Math.max(0.1, Math.min(10, newScaleY))
  
  // ========================================================================
  // MAINTENIR LE CENTRE FIXE PENDANT LE RESIZE
  // ========================================================================
  
  // Obtenir le vrai centre de l'objet (tient compte de originX/originY)
  const centerPoint = activeObject.getCenterPoint()
  const oldCenterX = centerPoint.x
  const oldCenterY = centerPoint.y
  
  console.log('🎯 Maintien du centre fixe:')
  console.log('  Centre actuel (getCenterPoint):', oldCenterX, oldCenterY)
  console.log('  Origin:', activeObject.originX, activeObject.originY)
  console.log('  Ancien scale:', initialScale.scaleX, initialScale.scaleY)
  console.log('  Nouveau scale:', newScaleX, newScaleY)
  console.log('  Ancienne position:', initialScale.left, initialScale.top)
  
  // Appliquer les transformations
  activeObject.set({
    scaleX: newScaleX,
    scaleY: newScaleY
  })
  
  // Recalculer left/top pour que le centre reste au même endroit
  // Fabric.js utilise getCenterPoint() qui tient compte de originX/originY
  const newCenterPoint = activeObject.getCenterPoint()
  
  // Calculer le décalage du centre
  const centerDeltaX = newCenterPoint.x - oldCenterX
  const centerDeltaY = newCenterPoint.y - oldCenterY
  
  // Ajuster left/top pour compenser le décalage
  activeObject.set({
    left: activeObject.left - centerDeltaX,
    top: activeObject.top - centerDeltaY
  })
  
  const finalCenterPoint = activeObject.getCenterPoint()
  console.log('  Nouvelle position:', activeObject.left, activeObject.top)
  console.log('  Nouveau centre (getCenterPoint):', finalCenterPoint.x, finalCenterPoint.y)
  console.log('  Décalage du centre:', centerDeltaX, centerDeltaY)
  
  // Pour les cercles, ajuster aussi le radius
  if (activeObject.type === 'circle' && activeObject.radius) {
    const originalRadius = activeObject.radius / (activeObject.scaleX || 1)
    activeObject.set('radius', originalRadius * newScaleX)
  }
  
  activeObject.setCoords()
  
  // Mettre à jour les copies wrap-around si elles existent
  await applyWrapAround(activeObject)
  
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
}

/**
 * Réinitialise les données de redimensionnement (appelé à la fin du resize)
 * 
 * @param {fabric.Object} obj - L'objet qui a été redimensionné
 */
const resetResizeData = (obj) => {
  if (obj && obj.userData && obj.userData.initialScaleOnResize) {
    delete obj.userData.initialScaleOnResize
  }
}

// Variable pour stocker le style original de l'objet avant le hover
let originalObjectStyle = null

/**
 * Met en évidence un handle de redimensionnement sur un objet
 * 
 * @param {fabric.Object} obj - L'objet à mettre en évidence
 * @param {Object} handleInfo - Informations sur le handle (bord/coin)
 */
const highlightResizeHandle = (obj, handleInfo) => {
  if (!canvas || !obj) return
  
  // Sauvegarder le style original si ce n'est pas déjà fait
  if (!originalObjectStyle) {
    originalObjectStyle = {
      stroke: obj.stroke || 'transparent',
      strokeWidth: obj.strokeWidth || 0,
      shadow: obj.shadow ? (obj.shadow instanceof Object ? { ...obj.shadow } : obj.shadow) : null
    }
  }
  
  // Appliquer un style de mise en évidence
  // Bordure colorée et épaisse pour montrer qu'on peut redimensionner
  obj.set({
    stroke: '#4f46e5', // Couleur bleue/violette
    strokeWidth: 3,
    shadow: {
      color: 'rgba(79, 70, 229, 0.5)', // Ombre bleue/violette
      blur: 10,
      offsetX: 0,
      offsetY: 0
    }
  })
  
  obj.setCoords()
  canvas.renderAll()
  requestTextureUpdate()
}

/**
 * Réinitialise le style de l'objet après le survol
 */
const resetResizeHover = () => {
  if (!canvas) return
  
  const activeObject = canvas.getActiveObject()
  if (!activeObject || !originalObjectStyle) return
  
  // Restaurer le style original
  activeObject.set({
    stroke: originalObjectStyle.stroke,
    strokeWidth: originalObjectStyle.strokeWidth,
    shadow: originalObjectStyle.shadow
  })
  
  originalObjectStyle = null
  
  activeObject.setCoords()
  canvas.renderAll()
  requestTextureUpdate()
}

/**
 * Déplace un objet sélectionné à une nouvelle position avec effet "wrap around"
 * 
 * Quand l'objet atteint les bords du canvas, il réapparaît de l'autre côté
 * (comme si le canvas était torique). Cela permet de créer des textures
 * qui se répètent de manière fluide.
 * 
 * @param {number} x - Position X cible (peut être en dehors du canvas)
 * @param {number} y - Position Y cible (peut être en dehors du canvas)
 */
const moveSelectedObject = (x, y) => {
  if (!canvas) return
  
  const activeObject = canvas.getActiveObject()
  if (!activeObject || activeObject.userData?.isWorkZoneIndicator) {
    return
  }
  
  // Les coordonnées x, y sont déjà calculées avec le décalage dans DesignStudio
  // On les utilise directement comme position du coin haut-gauche de l'objet
  // Mais on doit tenir compte de l'origine de l'objet Fabric.js
  
  // Obtenir les dimensions de l'objet (avec le scale appliqué)
  const objWidth = (activeObject.width || (activeObject.radius ? activeObject.radius * 2 : 50)) * (activeObject.scaleX || 1)
  const objHeight = (activeObject.height || (activeObject.radius ? activeObject.radius * 2 : 50)) * (activeObject.scaleY || 1)
  
  // Obtenir l'origine de l'objet (par défaut 'left' et 'top' pour Fabric.js)
  const originX = activeObject.originX || 'left'
  const originY = activeObject.originY || 'top'
  
  // x et y sont les coordonnées du coin haut-gauche de l'objet
  // On doit les convertir selon l'origine de Fabric.js
  let newLeft = x
  let newTop = y
  
  // Ajuster selon l'origine de l'objet
  if (originX === 'center') {
    newLeft = x + objWidth / 2
  } else if (originX === 'right') {
    newLeft = x + objWidth
  }
  // Si originX === 'left', on garde x tel quel
  
  if (originY === 'center') {
    newTop = y + objHeight / 2
  } else if (originY === 'bottom') {
    newTop = y + objHeight
  }
  // Si originY === 'top', on garde y tel quel
  
  // Vérifier si c'est une copie wrap-around qui est déplacée
  if (activeObject.userData?.isWrapAroundCopy) {
    // Si c'est une copie, déplacer la copie et synchroniser avec l'original
    activeObject.set({
      left: newLeft,
      top: newTop
    })
    activeObject.setCoords()
    
    // Synchroniser avec l'original
    syncCopyWithOriginal(activeObject)
    
    canvas.renderAll()
    requestTextureUpdate()
    emit('design-updated', canvas)
  } else {
    // Si c'est l'original, déplacer normalement
    activeObject.set({
      left: newLeft,
      top: newTop
    })
    
    // Appliquer l'effet wrap around (créera des copies si nécessaire)
    // Note: applyWrapAround est async, mais on ne peut pas await ici car la fonction n'est pas async
    // Les copies seront créées de manière asynchrone
    applyWrapAround(activeObject).then(() => {
      // Mettre à jour les coordonnées pour le rendu
      activeObject.setCoords()
      canvas.renderAll()
      requestTextureUpdate()
      emit('design-updated', canvas)
    }).catch(() => {
      // En cas d'erreur, mettre à jour quand même
      activeObject.setCoords()
      canvas.renderAll()
      requestTextureUpdate()
      emit('design-updated', canvas)
    })
  }
}

/**
 * Redimensionne un objet sélectionné avec un facteur de scale
 * @param {number} scaleFactor - Facteur de redimensionnement (1.0 = taille originale, >1 = agrandir, <1 = rétrécir)
 */
const scaleSelectedObject = async (scaleFactor) => {
  if (!canvas) return
  
  const activeObject = canvas.getActiveObject()
  if (!activeObject || activeObject.userData?.isWorkZoneIndicator) {
    return
  }
  
  // Vérifier si c'est une copie wrap-around qui est redimensionnée
  if (activeObject.userData?.isWrapAroundCopy) {
    // Si c'est une copie, redimensionner la copie et synchroniser avec l'original
    const currentScaleX = activeObject.scaleX || 1
    const currentScaleY = activeObject.scaleY || 1
    const newScaleX = currentScaleX * scaleFactor
    const newScaleY = currentScaleY * scaleFactor
    
    activeObject.set({
      scaleX: newScaleX,
      scaleY: newScaleY
    })
    activeObject.setCoords()
    
    // Synchroniser avec l'original
    const original = activeObject.userData?.originalObject
    if (original) {
      original.set({
        scaleX: newScaleX,
        scaleY: newScaleY
      })
      original.setCoords()
      syncAllCopiesWithOriginal(original)
    }
    
    canvas.renderAll()
    requestTextureUpdate()
    emit('design-updated', canvas)
    return
  }
  
  // Sauvegarder la position actuelle du centre
  const centerX = activeObject.left + (activeObject.width || (activeObject.radius * 2 || 0)) / 2
  const centerY = activeObject.top + (activeObject.height || (activeObject.radius * 2 || 0)) / 2
  
  // Appliquer le scale
  const currentScaleX = activeObject.scaleX || 1
  const currentScaleY = activeObject.scaleY || 1
  
  // Calculer les nouvelles échelles
  const newScaleX = currentScaleX * scaleFactor
  const newScaleY = currentScaleY * scaleFactor
  
  // Limiter le scale (entre 0.1 et 10)
  const clampedScaleX = Math.max(0.1, Math.min(10, newScaleX))
  const clampedScaleY = Math.max(0.1, Math.min(10, newScaleY))
  
  // Appliquer le scale
  activeObject.set({
    scaleX: clampedScaleX,
    scaleY: clampedScaleY
  })
  
  // Pour les cercles, ajuster aussi le radius proportionnellement au scale
  if (activeObject.type === 'circle' && activeObject.radius) {
    const originalRadius = activeObject.radius / (activeObject.scaleX || 1)
    activeObject.set('radius', originalRadius * clampedScaleX)
  }
  
  // Recalculer la position pour maintenir le centre
  const newWidth = (activeObject.width || 0) * clampedScaleX
  const newHeight = (activeObject.height || 0) * clampedScaleY
  activeObject.set({
    left: centerX - newWidth / 2,
    top: centerY - newHeight / 2
  })
  
  activeObject.setCoords()
  
  // Mettre à jour les copies wrap-around si elles existent
  await applyWrapAround(activeObject)
  
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
}

/**
 * Active le mode rotation pour un objet en simulant un clic sur le contrôle mtr
 * @param {fabric.Object} obj - L'objet à faire tourner
 * @param {Object} mtrCoords - Coordonnées du contrôle de rotation {x, y}
 */
const activateRotationMode = (obj, mtrCoords) => {
  if (!canvas || !obj) return
  
  // S'assurer que l'objet est sélectionné
  if (canvas.getActiveObject() !== obj) {
    canvas.setActiveObject(obj)
    canvas.renderAll()
  }
  
  // S'assurer que les coordonnées sont à jour
  if (obj.setCoords) {
    obj.setCoords()
  }
  
  // Obtenir l'élément canvas HTML
  const canvasElement = canvas.getElement()
  if (!canvasElement || !mtrCoords) return
  
  // Calculer la position relative du contrôle mtr dans le canvas
  const canvasOffset = canvasElement.getBoundingClientRect()
  
  // Simuler un événement mousedown sur le contrôle mtr
  // Fabric.js utilise les coordonnées de la page pour détecter les contrôles
  const mouseEvent = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    clientX: canvasOffset.left + mtrCoords.x,
    clientY: canvasOffset.top + mtrCoords.y,
    button: 0
  })
  
  // Déclencher l'événement sur le canvas
  canvasElement.dispatchEvent(mouseEvent)
  
  // Optionnel : simuler aussi un mousemove pour commencer la rotation
  // Cela permet à l'utilisateur de commencer à faire tourner immédiatement
  setTimeout(() => {
    const moveEvent = new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: canvasOffset.left + mtrCoords.x + 10,
      clientY: canvasOffset.top + mtrCoords.y,
      button: 0
    })
    canvasElement.dispatchEvent(moveEvent)
  }, 10)
}

// Expose methods
defineExpose({
  getCanvas: () => canvas,
  getCanvasAsTexture,
  clearCanvas,
  getCanvasElement: () => canvas ? canvas.getElement() : null,
  placeElementAt,
  activatePlacementMode,
  moveSelectedObject,
  scaleSelectedObject,
  selectObjectAtPosition,
  findObjectAtPosition,
  detectResizeHandle,
  resizeSelectedObjectFromHandle,
  resetResizeData,
  highlightResizeHandle,
  resetResizeHover,
  undo,
  redo,
  deleteSelected,
  deselectObject,
  addGreenBand,
  addSeamLine,
  activateRotationMode
})
</script>

<style scoped>
.fabric-designer-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.designer-toolbar {
  display: flex;
  gap: 8px;
  padding: 10px;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
  flex-wrap: wrap;
  align-items: center;
}

.toolbar-btn {
  padding: 6px 12px;
  border: 1px solid #ccc;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.toolbar-btn:hover:not(:disabled) {
  background: #f0f0f0;
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #e5e5e5;
}

.toolbar-btn.active-mode {
  background: #4f46e5;
  color: white;
  border-color: #4338ca;
  font-weight: 600;
}

.toolbar-btn.active-mode:hover {
  background: #4338ca;
}

.toolbar-separator {
  width: 1px;
  height: 30px;
  background: #ccc;
  margin: 0 4px;
}

.toolbar-btn input[type="color"] {
  width: 30px;
  height: 25px;
  border: 1px solid #ccc;
  border-radius: 3px;
  cursor: pointer;
}

.toolbar-btn input[type="range"] {
  width: 80px;
}

.toolbar-btn input[type="number"],
.toolbar-btn .rotation-input {
  width: 70px;
  padding: 4px 6px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 14px;
  text-align: center;
}

.export-btn {
  background: #4f46e5;
  color: white;
  border-color: #4338ca;
}

.export-btn:hover {
  background: #4338ca;
}

.fabric-canvas {
  border: 1px solid #ddd;
  cursor: default;
  display: block;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin: 20px auto;
}

.fabric-designer-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.designer-toolbar {
  flex-shrink: 0;
}

.fabric-canvas-wrapper {
  flex: 1;
  overflow: auto;
  position: relative;
  background: #f5f5f5;
  min-height: 200px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 20px;
}

.fabric-canvas {
  border: 1px solid #ddd;
  cursor: default;
  display: block !important;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  visibility: visible !important;
  opacity: 1 !important;
  flex-shrink: 0;
}

/* Style pour la div de débogage des contrôles 2D */
.debug-control-2d {
  position: absolute;
  height: 200px;
  top: 150px;
  right: 20px;
  background: rgba(34, 197, 94, 0.9);
  border: 2px solid #22c55e;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  z-index: 1000;
  min-width: 200px;
  max-width: 250px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
}

.debug-control-2d .coord-title {
  color: #fff;
  font-weight: bold;
  margin-bottom: 8px;
}

.debug-control-2d .coord-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.debug-control-2d .coord-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
}

.debug-control-2d .coord-label {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
}

.debug-control-2d .coord-value {
  font-weight: 500;
  color: #fff;
}

/* Style pour la div des coordonnées du curseur 2D */
.cursor-coords-2d {
  position: absolute;
  top: 100px;
  right: 20px;
  background: rgba(59, 130, 246, 0.9);
  border: 2px solid #3b82f6;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  z-index: 1000;
  min-width: 150px;
  max-width: 200px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
}

.cursor-coords-2d .coord-title {
  color: #fff;
  font-weight: bold;
  margin-bottom: 8px;
}

.cursor-coords-2d .coord-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cursor-coords-2d .coord-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
}

.cursor-coords-2d .coord-label {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
}

.cursor-coords-2d .coord-value {
  font-weight: 500;
  color: #fff;
}


</style>

