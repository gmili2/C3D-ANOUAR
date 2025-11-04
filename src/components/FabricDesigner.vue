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
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { Canvas, Rect, Circle, Textbox, Image as FabricImage, Pattern } from 'fabric'
import { useCanvasTextureStore } from '../composables/useCanvasTexture'

const emit = defineEmits(['design-updated', 'canvas-ready', 'placement-mode-changed', 'object-selected', 'object-deselected', 'move-object'])

const props = defineProps({
  canvasWidth: {
    type: Number,
    default: 800
  },
  canvasHeight: {
    type: Number,
    default: 600
  },
  on3DClick: {
    type: Function,
    default: null
  },
  workZoneTop: {
    type: Number,
    default: 0.1 // 10% par défaut
  },
  workZoneBottom: {
    type: Number,
    default: 0.1 // 10% par défaut
  }
})

const canvasElement = ref(null)
let canvas = null
let renderTimeout = null

const isDrawMode = ref(false)
const drawColor = ref('#000000')
const drawWidth = ref(5)
const placementMode = ref(null) // null, 'circle', 'rectangle', 'text', 'image'

const canvasWidth = props.canvasWidth || 1200
const canvasHeight = props.canvasHeight || 900

// Store pour la synchronisation avec Three.js
const { requestTextureUpdate } = useCanvasTextureStore()

// Système d'historique pour undo/redo
let history = []
let historyIndex = -1
const maxHistorySize = 50
let isUndoRedoInProgress = false // Flag pour éviter de sauvegarder pendant undo/redo

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

const initCanvas = () => {
  if (!canvasElement.value) return

  try {
    canvas = new Canvas(canvasElement.value, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: '#ffffff', // Fond blanc pour mieux voir les objets
      selection: true, // Permettre la sélection d'objets
      moveCursor: 'move', // Curseur de déplacement
      defaultCursor: 'default' // Curseur par défaut
    })
    
    // Activer le déplacement et la sélection
    canvas.selection = true
    canvas.allowTouchScrolling = false
    
    // Forcer la visibilité du canvas
    if (canvasElement.value) {
      canvasElement.value.style.display = 'block'
      canvasElement.value.style.visibility = 'visible'
      canvasElement.value.style.opacity = '1'
    }
    
    console.log('Canvas Fabric.js initialisé:', {
      width: canvasWidth,
      height: canvasHeight,
      element: canvasElement.value,
      selection: canvas.selection,
      elementWidth: canvasElement.value?.offsetWidth,
      elementHeight: canvasElement.value?.offsetHeight,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    })

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
        emit('object-selected', { 
          object: activeObject,
          type: activeObject.type 
        })
      }
    })
    
    canvas.on('selection:updated', (e) => {
      const activeObject = e.selected?.[0] || canvas.getActiveObject()
      if (activeObject && !activeObject.userData?.isWorkZoneIndicator) {
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
    })
    canvas.on('object:modified', () => {
      // Ne pas sauvegarder pendant la modification, seulement après
      signalChange()
    })
    canvas.on('object:removed', () => {
      saveHistory()
      signalChange()
    })
    canvas.on('object:moving', () => {
      // Pendant le déplacement, mettre à jour fréquemment
      canvas.renderAll()
      requestTextureUpdate()
    })
    canvas.on('object:moved', () => {
      saveHistory()
      signalChange()
    })
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
          console.log('Canvas élément final:', {
            display: canvasEl.style.display,
            visibility: canvasEl.style.visibility,
            opacity: canvasEl.style.opacity,
            width: canvasEl.width,
            height: canvasEl.height,
            offsetWidth: canvasEl.offsetWidth,
            offsetHeight: canvasEl.offsetHeight
          })
        }
        emit('canvas-ready', canvas.getElement())
      })
    }
    
    // Ajouter les raccourcis clavier
    setupKeyboardShortcuts()
  } catch (error) {
    console.error('Error initializing Fabric.js canvas:', error)
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
    console.error('Erreur lors du dessin des indicateurs de zone:', error)
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
  
  console.log('Couleur appliquée à l\'objet sélectionné:', drawColor.value)
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
    console.error('Canvas non initialisé')
    alert('Canvas non initialisé. Veuillez attendre le chargement.')
    return
  }
  
  console.log('Ajout d\'un texte, canvas:', {
    exists: !!canvas,
    width: canvas.width,
    height: canvas.height
  })
  
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
  
  console.log('Texte créé:', {
    left: text.left,
    top: text.top,
    text: text.text,
    fill: text.fill
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
    console.log('Texte ajouté, vérification:', {
      objectsCount: canvas.getObjects().length,
      canvasVisible: canvas.getElement()?.offsetWidth > 0
    })
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
      console.error('Error loading image:', error)
      alert('Erreur lors du chargement de l\'image')
    }
  }
  input.click()
}

const addCircle = () => {
  if (!canvas) {
    console.error('Canvas non initialisé')
    alert('Canvas non initialisé. Veuillez attendre le chargement.')
    return
  }
  
  console.log('Ajout d\'un cercle, canvas:', {
    exists: !!canvas,
    width: canvas.width,
    height: canvas.height,
    objectsCount: canvas.getObjects().length
  })
  
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
  
  console.log('Cercle créé:', {
    left: circle.left,
    top: circle.top,
    radius: circle.radius,
    fill: circle.fill,
    selectable: circle.selectable,
    evented: circle.evented
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
    console.log('Cercle ajouté, vérification:', {
      objectsCount: canvas.getObjects().length,
      canvasVisible: canvas.getElement()?.offsetWidth > 0,
      activeObject: !!canvas.getActiveObject()
    })
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
    console.warn('Canvas Fabric.js non disponible pour la texture')
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
        
        console.log('Canvas converti en texture:', {
          width: tempCanvas.width,
          height: tempCanvas.height,
          objectCount: objectCount,
          hasContent: hasContent,
          dataURLLength: dataURL.length,
          objects: canvas.getObjects().map(obj => ({
            type: obj.type,
            left: obj.left,
            top: obj.top
          }))
        })
        
        if (!hasContent) {
          console.warn('⚠️ Le canvas converti semble vide!')
        }
        
        return tempCanvas
      } else {
        console.warn('Fabric canvas element not ready:', {
          fabricCanvas: !!fabricCanvas,
          width: fabricCanvas?.width,
          height: fabricCanvas?.height
        })
      }
    }
  } catch (error) {
    console.error('Error creating texture canvas:', error)
  }
  
  return null
}

/**
 * Active le mode de placement pour un type d'élément
 * Ajoute directement l'élément au centre du canvas
 */
const activatePlacementMode = (type) => {
  if (!canvas) {
    console.error('Canvas non initialisé')
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
    console.error('Canvas non initialisé')
    return
  }
  
  console.log('Placing element:', { type, x, y })
  
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
      console.warn('Type d\'élément non reconnu:', type)
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
      console.error('Error loading image:', error)
      alert('Erreur lors du chargement de l\'image')
    }
  }
  input.click()
}

/**
 * Déplace un objet sélectionné à une nouvelle position
 */
const moveSelectedObject = (x, y) => {
  if (!canvas) return
  
  const activeObject = canvas.getActiveObject()
  if (!activeObject || activeObject.userData?.isWorkZoneIndicator) {
    return
  }
  
  // Vérifier que la position est dans la zone active
  const topHeight = canvasHeight * props.workZoneTop
  const bottomHeight = canvasHeight * props.workZoneBottom
  const activeZoneTop = topHeight
  const activeZoneBottom = canvasHeight - bottomHeight
  
  // Ajuster y pour qu'il soit dans la zone active
  const adjustedY = Math.max(activeZoneTop, Math.min(activeZoneBottom, y))
  
  // Obtenir les dimensions de l'objet
  const objWidth = activeObject.width || (activeObject.radius ? activeObject.radius * 2 : 50)
  const objHeight = activeObject.height || (activeObject.radius ? activeObject.radius * 2 : 50)
  
  // Obtenir l'origine de l'objet (par défaut 'left' et 'top' pour Fabric.js)
  const originX = activeObject.originX || 'left'
  const originY = activeObject.originY || 'top'
  
  // Calculer la position selon l'origine
  let newLeft = x
  let newTop = adjustedY
  
  if (originX === 'center') {
    newLeft = x - objWidth / 2
  } else if (originX === 'right') {
    newLeft = x - objWidth
  }
  
  if (originY === 'center') {
    newTop = adjustedY - objHeight / 2
  } else if (originY === 'bottom') {
    newTop = adjustedY - objHeight
  }
  
  activeObject.set({
    left: newLeft,
    top: newTop
  })
  
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
}

/**
 * Redimensionne un objet sélectionné avec un facteur de scale
 * @param {number} scaleFactor - Facteur de redimensionnement (1.0 = taille originale, >1 = agrandir, <1 = rétrécir)
 */
const scaleSelectedObject = (scaleFactor) => {
  if (!canvas) return
  
  const activeObject = canvas.getActiveObject()
  if (!activeObject || activeObject.userData?.isWorkZoneIndicator) {
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
  
  // Pour les cercles, ajuster aussi le radius
  if (activeObject.type === 'circle' && activeObject.radius) {
    activeObject.set('radius', activeObject.radius * scaleFactor)
  }
  
  // Recalculer la position pour maintenir le centre
  const newWidth = (activeObject.width || 0) * clampedScaleX
  const newHeight = (activeObject.height || 0) * clampedScaleY
  activeObject.set({
    left: centerX - newWidth / 2,
    top: centerY - newHeight / 2
  })
  
  activeObject.setCoords()
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
  undo,
  redo,
  deleteSelected
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

