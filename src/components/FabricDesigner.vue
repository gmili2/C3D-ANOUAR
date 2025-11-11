<!-- 
  FabricDesigner.vue - Composant pour le design 2D avec Fabric.js
  
  Ce composant gère :
  - Le canvas 2D Fabric.js pour créer des designs
  - L'ajout d'éléments (texte, images, formes)
  - Le dessin libre avec le pinceau
  - L'historique undo/redo
  - La synchronisation avec le modèle 3D via texture partagée
  - Les zones de travail (exclusion de zones haut/bas)
  - Le placement d'éléments depuis le modèle 3D
-->
<template>
  <div class="fabric-designer-container">
    <!-- Barre d'outils avec tous les boutons d'action -->
    <div class="designer-toolbar">
      <!-- Bouton pour ajouter du texte -->
      <button 
        @click="activatePlacementMode('text')" 
        class="toolbar-btn"
      >
        Ajouter du texte
      </button>
      <button 
        @click="activatePlacementMode('image')" 
        class="toolbar-btn"
      >
        Ajouter une image
      </button>
      <button 
        @click="activatePlacementMode('circle')" 
        class="toolbar-btn"
      >
        Cercle
      </button>
      <button 
        @click="activatePlacementMode('rectangle')" 
        class="toolbar-btn"
      >
        Rectangle
      </button>
      <button @click="toggleDrawMode" class="toolbar-btn">
        {{ isDrawMode ? 'Mode objet' : 'Mode dessin' }}
      </button>
      <button @click="deleteSelected" class="toolbar-btn" :disabled="!hasSelection" title="Supprimer l'élément sélectionné (Suppr)">
        🗑️ Supprimer
      </button>
      <div class="toolbar-separator"></div>
      <button @click="undo" class="toolbar-btn" :disabled="!canUndo" title="Annuler (Ctrl+Z)">
        ↶ Retour
      </button>
      <button @click="redo" class="toolbar-btn" :disabled="!canRedo" title="Refaire (Ctrl+Y)">
        ↷ Suivant
      </button>
      <div class="toolbar-separator"></div>
      <label class="toolbar-btn">
        Couleur:
        <input type="color" v-model="drawColor" @change="updateBrushAndSelection" />
      </label>
      <button @click="applyColorToSelection" class="toolbar-btn" :disabled="!hasSelection">
        🎨 Appliquer couleur
      </button>
      <label class="toolbar-btn">
        Largeur:
        <input type="range" v-model.number="drawWidth" min="1" max="20" @input="updateBrush" />
        {{ drawWidth }}px
      </label>
      <button @click="clearCanvas" class="toolbar-btn">Effacer</button>
      <button @click="exportDesign" class="toolbar-btn export-btn">Exporter</button>
    </div>
    <div class="fabric-canvas-wrapper">
      <canvas ref="canvasElement" class="fabric-canvas"></canvas>
    </div>
  </div>
</template>

<script setup>
/**
 * SCRIPT SETUP - Configuration du composant Fabric.js
 * 
 * Ce composant gère un canvas 2D interactif avec Fabric.js pour créer
 * des designs qui seront appliqués comme texture sur le modèle 3D.
 */

import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { Canvas, Rect, Circle, Textbox, Image as FabricImage, Pattern } from 'fabric'
import { useCanvasTextureStore } from '../composables/useCanvasTexture'

// ===== ÉVÉNEMENTS ÉMIS =====
const emit = defineEmits([
  'design-updated',          // Le design a été modifié
  'canvas-ready',            // Le canvas est prêt
  'placement-mode-changed',  // Le mode placement a changé
  'object-selected',         // Un objet a été sélectionné
  'object-deselected',       // Aucun objet n'est sélectionné
  'move-object'              // Un objet a été déplacé
])

// ===== PROPS =====
const props = defineProps({
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

// ===== DIMENSIONS DU CANVAS =====
// Dimensions réduites pour mieux correspondre au modèle 3D
const canvasWidth = props.canvasWidth || 800
const canvasHeight = props.canvasHeight || 600

// ===== STORE POUR LA SYNCHRONISATION =====
// Store pour signaler les mises à jour de texture à Three.js
const { requestTextureUpdate } = useCanvasTextureStore()

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

// Vérifier si un objet est sélectionné
const hasSelection = computed(() => {
  if (!canvas) return false
  const activeObject = canvas.getActiveObject()
  return activeObject !== null && activeObject !== undefined
})

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
  
  // Mettre à jour l'original avec toutes les propriétés de la copie
  original.set({
    left: newOriginalLeft,
    top: newOriginalTop,
    scaleX: copy.scaleX || original.scaleX,
    scaleY: copy.scaleY || original.scaleY,
    angle: copy.angle || original.angle,
    flipX: copy.flipX || original.flipX,
    flipY: copy.flipY || original.flipY
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
        selectable: false,
        evented: false,
        excludeFromExport: true
      })
      copy.userData = { isWrapAroundCopy: true, originalObject: obj }
      canvas.add(copy)
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
        selectable: false,
        evented: false,
        excludeFromExport: true
      })
      copy.userData = { isWrapAroundCopy: true, originalObject: obj }
      canvas.add(copy)
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
        selectable: false,
        evented: false,
        excludeFromExport: true
      })
      copy.userData = { isWrapAroundCopy: true, originalObject: obj }
      canvas.add(copy)
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
        selectable: false,
        evented: false,
        excludeFromExport: true
      })
      copy.userData = { isWrapAroundCopy: true, originalObject: obj }
      canvas.add(copy)
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
    
    // Mettre à jour la copie (sans déclencher les événements)
    copy.set({
      left: newLeft,
      top: newTop,
      scaleX: original.scaleX,
      scaleY: original.scaleY,
      angle: original.angle,
      flipX: original.flipX,
      flipY: original.flipY
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
      enableScalingControls(obj)
      
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

    // Fonction helper pour signaler les changements
    const signalChange = () => {
      canvas.renderAll() // Forcer le rendu du canvas
      requestTextureUpdate() // Signal au store pour mettre à jour la texture
      emit('design-updated', canvas) // Émettre l'événement
    }

    // Sauvegarder l'état initial
    saveHistory()
    
    // Écouter quand un objet est sélectionné pour activer le mode drag sur 3D
    canvas.on('selection:created', (e) => {
      const activeObject = e.selected?.[0] || canvas.getActiveObject()
      if (activeObject && !activeObject.userData?.isWorkZoneIndicator) {
        // Activer les contrôles de redimensionnement pour l'objet sélectionné
        enableScalingControls(activeObject)
        
        emit('object-selected', { 
          object: activeObject,
          type: activeObject.type 
        })
      }
    })
    
    canvas.on('selection:updated', (e) => {
      const activeObject = e.selected?.[0] || canvas.getActiveObject()
      if (activeObject && !activeObject.userData?.isWorkZoneIndicator) {
        // Activer les contrôles de redimensionnement pour l'objet sélectionné
        enableScalingControls(activeObject)
        
        emit('object-selected', { 
          object: activeObject,
          type: activeObject.type 
        })
      }
    })
    
    canvas.on('selection:cleared', () => {
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
    canvas.on('object:modified', () => {
      // Ne pas sauvegarder pendant la modification, seulement après
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
      
      // Pendant le déplacement, mettre à jour fréquemment
      canvas.renderAll()
      requestTextureUpdate()
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
      
      // Pendant le redimensionnement, mettre à jour en temps réel
      canvas.renderAll()
      requestTextureUpdate()
      emit('design-updated', canvas)
    })
    // Événement après le redimensionnement (scaling terminé)
    canvas.on('object:scaled', () => {
      saveHistory()
      signalChange()
    })
    canvas.on('object:rotated', () => {
      saveHistory()
      signalChange()
    })
    canvas.on('object:skewed', () => {
      saveHistory()
      signalChange()
    })
    canvas.on('selection:created', () => {
      // Ne pas mettre à jour pour la sélection, juste le rendu
      canvas.renderAll()
    })
    canvas.on('selection:updated', () => {
      canvas.renderAll()
    })
    canvas.on('after:render', () => {
      // Debounced updates from render
      if (renderTimeout) {
        clearTimeout(renderTimeout)
      }
      renderTimeout = setTimeout(() => {
        requestTextureUpdate()
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

const addText = () => {
  if (!canvas) {
    alert('Canvas non initialisé. Veuillez attendre le chargement.')
    return
  }
  
  
  const text = new Textbox('Nouveau texte', {
    left: canvasWidth / 2 - 100,
    top: canvasHeight / 2 - 25,
    fontSize: 32,
    fill: drawColor.value || '#000000',
    fontFamily: 'Arial',
    width: 200,
    selectable: true,
    evented: true
  })
  
  
  canvas.add(text)
  canvas.setActiveObject(text)
  canvas.isDrawingMode = false
  isDrawMode.value = false
  canvas.selection = true
  
  // Forcer le rendu
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
  
  setTimeout(() => {
    canvas.renderAll()
  }, 50)
}

const addImage = () => {
  if (!canvas) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const url = URL.createObjectURL(file)
      const fabricImg = await FabricImage.fromURL(url)
      
      // Center the image
      fabricImg.set({
        left: canvasWidth / 2 - fabricImg.width / 2,
        top: canvasHeight / 2 - fabricImg.height / 2
      })
      
      // S'assurer que l'image est sélectionnable et déplaçable
      fabricImg.selectable = true
      fabricImg.evented = true
      
      canvas.add(fabricImg)
      canvas.setActiveObject(fabricImg)
      canvas.isDrawingMode = false
      isDrawMode.value = false
      canvas.selection = true // Réactiver la sélection
      canvas.renderAll()
      requestTextureUpdate() // Signal pour mettre à jour la texture 3D
      emit('design-updated', canvas)
      
      URL.revokeObjectURL(url)
    } catch (error) {
      alert('Erreur lors du chargement de l\'image')
    }
  }
  input.click()
}

const addCircle = () => {
  if (!canvas) {
    alert('Canvas non initialisé. Veuillez attendre le chargement.')
    return
  }
  
  
  const circle = new Circle({
    left: canvasWidth / 2 - 50,
    top: canvasHeight / 2 - 50,
    radius: 50,
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
  
  // Forcer le rendu plusieurs fois pour s'assurer que c'est visible
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
  
  // Double vérification
  setTimeout(() => {
    canvas.renderAll()
  }, 50)
}

const addRectangle = () => {
  if (!canvas) return
  const rect = new Rect({
    left: canvasWidth / 2 - 75,
    top: canvasHeight / 2 - 50,
    width: 150,
    height: 100,
    fill: drawColor.value,
    stroke: '#000000',
    strokeWidth: 2,
    rx: 8,
    ry: 8
  })
  // S'assurer que le rectangle est sélectionnable et déplaçable
  rect.selectable = true
  rect.evented = true
  
  canvas.add(rect)
  canvas.setActiveObject(rect)
  canvas.isDrawingMode = false
  isDrawMode.value = false
  canvas.selection = true // Réactiver la sélection
  canvas.renderAll()
  requestTextureUpdate() // Signal pour mettre à jour la texture 3D
  emit('design-updated', canvas)
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

/**
 * Ajoute un point vert à la position spécifiée (utilisé pour marquer les clics sur la couture)
 * @param {number} x - Position X sur le canvas
 * @param {number} y - Position Y sur le canvas
 */
const addSeamPoint = (x, y) => {
  if (!canvas) {
    return
  }
  
  // Créer un petit cercle vert pour marquer la position de la couture
  const pointSize = 8 // Rayon du point en pixels
  const seamPoint = new Circle({
    left: x - pointSize,
    top: y - pointSize,
    radius: pointSize,
    fill: '#00ff00', // Vert pur
    stroke: '#00cc00', // Bordure verte foncée
    strokeWidth: 2,
    selectable: false, // Non sélectionnable
    evented: false, // Ne bloque pas les interactions
    excludeFromExport: false // Inclure dans l'export
  })
  
  // Marquer ce point comme point de couture
  seamPoint.userData = { isSeamPoint: true }
  
  canvas.add(seamPoint)
  // Envoyer le point à l'avant-plan pour qu'il soit visible
  try {
    if (canvas.bringObjectToFront) {
      canvas.bringObjectToFront(seamPoint)
    }
  } catch (e) {
    // Si la méthode n'existe pas, ignorer
  }
  
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
  
}

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
    case 'image':
      placeImageAt(x, adjustedY)
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

const placeRectangleAt = (x, y) => {
  const rect = new Rect({
    left: x - 75,
    top: y - 50,
    width: 150,
    height: 100,
    fill: drawColor.value || '#000000',
    stroke: '#000000',
    strokeWidth: 2,
    rx: 8,
    ry: 8,
    selectable: true,
    evented: true
  })
  
  canvas.add(rect)
  canvas.setActiveObject(rect)
  canvas.isDrawingMode = false
  isDrawMode.value = false
  canvas.selection = true
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
}

const placeTextAt = (x, y) => {
  const text = new Textbox('Nouveau texte', {
    left: x - 100,
    top: y - 25,
    fontSize: 32,
    fill: drawColor.value || '#000000',
    fontFamily: 'Arial',
    width: 200,
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
  
  const objLeft = obj.left || 0
  const objTop = obj.top || 0
  const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
  const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
  const objRight = objLeft + objWidth
  const objBottom = objTop + objHeight
  
  // Vérifier les coins en premier (priorité)
  const cornerThreshold = threshold * 1.5 // Un peu plus large pour les coins
  
  // Coin haut-gauche (top-left)
  if (Math.abs(x - objLeft) < cornerThreshold && Math.abs(y - objTop) < cornerThreshold) {
    return { edge: 'corner', corner: 'tl', handle: 'tl' }
  }
  // Coin haut-droite (top-right)
  if (Math.abs(x - objRight) < cornerThreshold && Math.abs(y - objTop) < cornerThreshold) {
    return { edge: 'corner', corner: 'tr', handle: 'tr' }
  }
  // Coin bas-gauche (bottom-left)
  if (Math.abs(x - objLeft) < cornerThreshold && Math.abs(y - objBottom) < cornerThreshold) {
    return { edge: 'corner', corner: 'bl', handle: 'bl' }
  }
  // Coin bas-droite (bottom-right)
  if (Math.abs(x - objRight) < cornerThreshold && Math.abs(y - objBottom) < cornerThreshold) {
    return { edge: 'corner', corner: 'br', handle: 'br' }
  }
  
  // Vérifier les bords
  // Bord gauche
  if (Math.abs(x - objLeft) < threshold && y >= objTop && y <= objBottom) {
    return { edge: 'left', corner: null, handle: 'ml' }
  }
  // Bord droit
  if (Math.abs(x - objRight) < threshold && y >= objTop && y <= objBottom) {
    return { edge: 'right', corner: null, handle: 'mr' }
  }
  // Bord haut
  if (Math.abs(y - objTop) < threshold && x >= objLeft && x <= objRight) {
    return { edge: 'top', corner: null, handle: 'mt' }
  }
  // Bord bas
  if (Math.abs(y - objBottom) < threshold && x >= objLeft && x <= objRight) {
    return { edge: 'bottom', corner: null, handle: 'mb' }
  }
  
  return null
}

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
    
    // Si c'est une copie wrap-around, sélectionner l'original à la place
    const targetObject = obj.userData?.isWrapAroundCopy && obj.userData?.originalObject 
      ? obj.userData.originalObject 
      : obj
    
    canvas.setActiveObject(targetObject)
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
      const targetObject = obj.userData?.isWrapAroundCopy && obj.userData?.originalObject 
        ? obj.userData.originalObject 
        : obj
      
      canvas.setActiveObject(targetObject)
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
    
    const targetObject = closestObj.userData?.isWrapAroundCopy && closestObj.userData?.originalObject 
      ? closestObj.userData.originalObject 
      : closestObj
    
    canvas.setActiveObject(targetObject)
    canvas.renderAll()
    
    emit('object-selected', {
      object: targetObject,
      type: targetObject.type
    })
    
    return true
  }
  
  canvas.discardActiveObject()
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
  
  // Calculer les différences de position depuis le début du resize
  const deltaX = x - startX
  const deltaY = y - startY
  
  let newScaleX = initialScale.scaleX
  let newScaleY = initialScale.scaleY
  let newLeft = initialScale.left
  let newTop = initialScale.top
  
  // Calculer le nouveau scale et position selon le handle
  if (handleInfo.corner) {
    // Redimensionnement par coin (scale proportionnel)
    if (handleInfo.corner === 'br') {
      // Coin bas-droite : scale depuis le coin haut-gauche
      newScaleX = (initialWidth + deltaX) / originalWidth
      newScaleY = (initialHeight + deltaY) / originalHeight
    } else if (handleInfo.corner === 'tl') {
      // Coin haut-gauche : scale depuis le coin bas-droite
      newScaleX = (initialWidth - deltaX) / originalWidth
      newScaleY = (initialHeight - deltaY) / originalHeight
      newLeft = initialScale.left + deltaX
      newTop = initialScale.top + deltaY
    } else if (handleInfo.corner === 'tr') {
      // Coin haut-droite : scale depuis le coin bas-gauche
      newScaleX = (initialWidth + deltaX) / originalWidth
      newScaleY = (initialHeight - deltaY) / originalHeight
      newTop = initialScale.top + deltaY
    } else if (handleInfo.corner === 'bl') {
      // Coin bas-gauche : scale depuis le coin haut-droite
      newScaleX = (initialWidth - deltaX) / originalWidth
      newScaleY = (initialHeight + deltaY) / originalHeight
      newLeft = initialScale.left + deltaX
    }
  } else {
    // Redimensionnement par bord (scale dans une direction)
    if (handleInfo.edge === 'right') {
      newScaleX = (initialWidth + deltaX) / originalWidth
      // Garder la position et le scale Y inchangés
    } else if (handleInfo.edge === 'left') {
      newScaleX = (initialWidth - deltaX) / originalWidth
      newLeft = initialScale.left + deltaX
    } else if (handleInfo.edge === 'bottom') {
      newScaleY = (initialHeight + deltaY) / originalHeight
      // Garder la position et le scale X inchangés
    } else if (handleInfo.edge === 'top') {
      newScaleY = (initialHeight - deltaY) / originalHeight
      newTop = initialScale.top + deltaY
    }
  }
  
  // Limiter le scale (entre 0.1 et 10)
  newScaleX = Math.max(0.1, Math.min(10, newScaleX))
  newScaleY = Math.max(0.1, Math.min(10, newScaleY))
  
  // Appliquer les transformations
  activeObject.set({
    scaleX: newScaleX,
    scaleY: newScaleY,
    left: newLeft,
    top: newTop
  })
  
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
  addGreenBand,
  addSeamLine,
  addSeamPoint
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
</style>

