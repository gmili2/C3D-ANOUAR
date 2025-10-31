<template>
  <div class="fabric-designer-container">
    <div class="designer-toolbar">
      <button @click="addText" class="toolbar-btn">Ajouter du texte</button>
      <button @click="addImage" class="toolbar-btn">Ajouter une image</button>
      <button @click="addCircle" class="toolbar-btn">Cercle</button>
      <button @click="addRectangle" class="toolbar-btn">Rectangle</button>
      <button @click="toggleDrawMode" class="toolbar-btn">
        {{ isDrawMode ? 'Mode objet' : 'Mode dessin' }}
      </button>
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
    <canvas ref="canvasElement" class="fabric-canvas"></canvas>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { Canvas, Rect, Circle, Textbox, Image as FabricImage, Pattern } from 'fabric'
import { useCanvasTextureStore } from '../composables/useCanvasTexture'

const emit = defineEmits(['design-updated', 'canvas-ready'])

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
  }
})

const canvasElement = ref(null)
let canvas = null
let renderTimeout = null

const isDrawMode = ref(false)
const drawColor = ref('#000000')
const drawWidth = ref(5)

const canvasWidth = props.canvasWidth || 800
const canvasHeight = props.canvasHeight || 600

// Store pour la synchronisation avec Three.js
const { requestTextureUpdate } = useCanvasTextureStore()

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
})

watch(() => drawColor.value, () => {
  updateBrush()
})

watch(() => drawWidth.value, () => {
  updateBrush()
})

const initCanvas = () => {
  if (!canvasElement.value) return

  try {
    canvas = new Canvas(canvasElement.value, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: '#ffffff' // Fond blanc pour mieux voir les objets
    })
    
    console.log('Canvas Fabric.js initialisé:', {
      width: canvasWidth,
      height: canvasHeight,
      element: canvasElement.value
    })

    // Set up drawing mode
    canvas.isDrawingMode = isDrawMode.value
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.width = drawWidth.value
      canvas.freeDrawingBrush.color = drawColor.value
    }

    // Fonction helper pour signaler les changements
    const signalChange = () => {
      canvas.renderAll() // Forcer le rendu du canvas
      requestTextureUpdate() // Signal au store pour mettre à jour la texture
      emit('design-updated', canvas) // Émettre l'événement
    }

    // Écouter tous les événements de modification
    canvas.on('path:created', signalChange)
    canvas.on('object:added', signalChange)
    canvas.on('object:modified', signalChange)
    canvas.on('object:removed', signalChange)
    canvas.on('object:moving', () => {
      // Pendant le déplacement, mettre à jour fréquemment
      canvas.renderAll()
      requestTextureUpdate()
    })
    canvas.on('object:moved', signalChange) // Quand le déplacement est terminé
    canvas.on('object:scaled', signalChange)
    canvas.on('object:rotated', signalChange)
    canvas.on('object:skewed', signalChange)
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
        emit('canvas-ready', canvas.getElement())
      })
    }
  } catch (error) {
    console.error('Error initializing Fabric.js canvas:', error)
  }
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
}

const addText = () => {
  if (!canvas) return
  const text = new Textbox('Nouveau texte', {
    left: canvasWidth / 2 - 100,
    top: canvasHeight / 2 - 25,
    fontSize: 32,
    fill: drawColor.value,
    fontFamily: 'Arial',
    width: 200
  })
  canvas.add(text)
  canvas.setActiveObject(text)
  canvas.isDrawingMode = false
  isDrawMode.value = false
  canvas.renderAll()
  requestTextureUpdate() // Signal pour mettre à jour la texture 3D
  emit('design-updated', canvas)
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
      
      canvas.add(fabricImg)
      canvas.setActiveObject(fabricImg)
      canvas.isDrawingMode = false
      isDrawMode.value = false
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
    return
  }
  
  const circle = new Circle({
    left: (props.canvasWidth || 800) / 2 - 50,
    top: (props.canvasHeight || 600) / 2 - 50,
    radius: 50,
    fill: drawColor.value,
    stroke: '#000000',
    strokeWidth: 2
  })
  
    console.log('Ajout du cercle:', {
      left: circle.left,
      top: circle.top,
      radius: circle.radius,
      fill: circle.fill,
      canvasWidth: props.canvasWidth || 800,
      canvasHeight: props.canvasHeight || 600
    })
  
  canvas.add(circle)
  canvas.setActiveObject(circle)
  canvas.isDrawingMode = false
  isDrawMode.value = false
  canvas.renderAll()
  
  console.log('Cercle ajouté, objets sur le canvas:', canvas.getObjects().length)
  
  requestTextureUpdate() // Signal pour mettre à jour la texture 3D
  emit('design-updated', canvas)
  
  // Vérifier que le cercle est bien visible
  setTimeout(() => {
    const fabricCanvas = canvas.getElement()
    if (fabricCanvas) {
      console.log('Canvas HTML vérifié:', {
        width: fabricCanvas.width,
        height: fabricCanvas.height,
        hasContent: fabricCanvas.width > 0 && fabricCanvas.height > 0
      })
    }
  }, 100)
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
  canvas.add(rect)
  canvas.setActiveObject(rect)
  canvas.isDrawingMode = false
  isDrawMode.value = false
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
 * Gère un clic provenant du modèle 3D
 * @param {number} x - Coordonnée X sur le canvas
 * @param {number} y - Coordonnée Y sur le canvas
 */
const handle3DClick = (x, y) => {
  if (!canvas) return
  
  // Si on est en mode dessin, on peut continuer à dessiner
  // Sinon, on peut ajouter un point ou activer le mode dessin
  if (isDrawMode.value) {
    // Simuler un clic pour continuer le dessin
    console.log('Clic 3D projeté sur canvas:', { x, y })
    // Le mode dessin de Fabric.js gère automatiquement les clics
  } else {
    // Ajouter un point/cercle à cette position
    const circle = new Circle({
      left: x - 10,
      top: y - 10,
      radius: 10,
      fill: drawColor.value,
      stroke: '#000000',
      strokeWidth: 2
    })
    canvas.add(circle)
    canvas.setActiveObject(circle)
    canvas.renderAll()
    requestTextureUpdate()
    emit('design-updated', canvas)
    
    console.log('Point ajouté depuis clic 3D:', { x, y })
  }
}

// Expose methods
defineExpose({
  getCanvas: () => canvas,
  getCanvasAsTexture,
  clearCanvas,
  getCanvasElement: () => canvas ? canvas.getElement() : null,
  handle3DClick
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

.toolbar-btn:hover {
  background: #f0f0f0;
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
  flex: 1;
  border: 1px solid #ddd;
  cursor: crosshair;
}
</style>

