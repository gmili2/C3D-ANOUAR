
<template>
  <div class="fabric-designer-container">
    <div class="designer-toolbar">
      <button @click="activatePlacementMode('text')" class="toolbar-btn">
        Ajouter du texte
      </button>
      <button @click="activatePlacementMode('circle')" class="toolbar-btn">
        Cercle
      </button>
    </div>
    <div class="fabric-canvas-wrapper">
      <canvas ref="canvasElement" class="fabric-canvas"></canvas>
    </div>
  </div>
</template>

<script setup>

import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { Canvas, Rect, Circle, Textbox, Image as FabricImage, Pattern, ActiveSelection } from 'fabric'
import { useCanvasTextureStore } from '../composables/useCanvasTexture'

const emit = defineEmits([
  'design-updated',
  'canvas-ready',
  'placement-mode-changed',
  'object-selected',
  'object-deselected',
  'move-object',
  'objects-changed',
  'object-rotated'
])

const props = defineProps({
  updateTextureDirect: {
    type: Function,
    default: null
  },
  on3DClick: {
    type: Function,
    default: null
  },
})

const canvasElement = ref(null)
let canvas = null
let renderTimeout = null

const wrapAroundCopies = new Map()

const isDrawMode = ref(false)
const drawColor = ref('#000000')
const drawWidth = ref(5)
const placementMode = ref(null)
const rotationAngle = ref(0)

const canvasWidth =  800
const canvasHeight = 500

const { requestTextureUpdate, requestTextureUpdateImmediate } = useCanvasTextureStore()



const hasSelection = ref(false)

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

})



const removeWrapAroundCopies = (obj) => {
  if (!canvas) return
  const original = obj.userData?.isWrapAroundCopy ? obj.userData.originalObject : obj
  const copies = wrapAroundCopies.get(original)
  if (copies) {
    if (canvas.userData?.multiSelectedObjects) {
      copies.forEach(copy => {
        const index = canvas.userData.multiSelectedObjects.indexOf(copy)
        if (index > -1) canvas.userData.multiSelectedObjects.splice(index, 1)
      })
      const index = canvas.userData.multiSelectedObjects.indexOf(original)
      if (index > -1) canvas.userData.multiSelectedObjects.splice(index, 1)
    }
    copies.forEach(copy => canvas.remove(copy))
    wrapAroundCopies.delete(original)
  }
}

const isCompletelyOutsideCanvas = (obj) => {
  if (!obj || !canvas) return false
  const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
  const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
  const objLeft = obj.left || 0
  const objTop = obj.top || 0
  const topHeight = 0
  const bottomHeight = 0
  const activeZoneTop = topHeight
  const activeZoneBottom = canvasHeight - bottomHeight
  if (objLeft > canvasWidth) return true
  if (objLeft + objWidth < 0) return true
  if (objTop > activeZoneBottom) return true
  if (objTop + objHeight < activeZoneTop) return true
  return false
}

const replaceOriginalWithCopy = (original, copy) => {
  if (!canvas || !original || !copy) return
  const objects = canvas.getObjects()
  if (!objects.includes(copy)) return
  const copies = wrapAroundCopies.get(original)
  if (copies) {
    copies.forEach(c => {
      if (c !== copy && objects.includes(c)) canvas.remove(c)
    })
    wrapAroundCopies.delete(original)
  }
  if (objects.includes(original)) canvas.remove(original)
  copy.set({
    selectable: true,
    evented: true,
    excludeFromExport: false
  })
  const newUserData = {}
  if (copy.userData) {
    Object.keys(copy.userData).forEach(key => {
      if (key !== 'isWrapAroundCopy' && key !== 'originalObject' && key !== 'wrapDirection') {
        newUserData[key] = copy.userData[key]
      }
    })
  }
  copy.userData = newUserData
  copy.userData.isWrapAroundCopy = false
  copy.userData.originalObject = null
  wrapAroundCopies.delete(original)
  wrapAroundCopies.forEach((copiesList, orig) => {
    copiesList.forEach(c => {
      if (c.userData?.originalObject === original) {
        c.userData.originalObject = null
        c.userData.isWrapAroundCopy = false
        if (objects.includes(c)) canvas.remove(c)
      }
    })
  })
  canvas.renderAll()
  requestTextureUpdate()
  emit('design-updated', canvas)
}

const syncCopyWithOriginal = (copy) => {
  if (!copy || !copy.userData?.isWrapAroundCopy || !copy.userData?.originalObject) return
  const original = copy.userData.originalObject
  const wrapDirection = copy.userData.wrapDirection
  if (!original || !canvas) return
  const objects = canvas.getObjects()
  const originalExists = objects.includes(original)
  if (!originalExists) {
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
    wrapAroundCopies.forEach((copies, orig) => {
      const index = copies.indexOf(copy)
      if (index > -1) {
        copies.splice(index, 1)
        if (copies.length === 0) wrapAroundCopies.delete(orig)
      }
    })
    canvas.renderAll()
    requestTextureUpdate()
    return
  }
  let newOriginalLeft = copy.left
  let newOriginalTop = copy.top
  if (wrapDirection === 'horizontal-right') {
    newOriginalLeft = copy.left + canvasWidth
  } else if (wrapDirection === 'horizontal-left') {
    newOriginalLeft = copy.left - canvasWidth
  }
  const topHeight = 0
  const bottomHeight = 0
  const activeZoneTop = topHeight
  const activeZoneBottom = canvasHeight - bottomHeight
  const zoneHeight = activeZoneBottom - activeZoneTop
  if (wrapDirection === 'vertical-bottom') {
    newOriginalTop = copy.top + zoneHeight
  } else if (wrapDirection === 'vertical-top') {
    newOriginalTop = copy.top - zoneHeight
  }
  const wasEvented = original.evented
  original.evented = false
  original.set({
    left: newOriginalLeft,
    top: newOriginalTop,
    scaleX: copy.scaleX || original.scaleX,
    scaleY: copy.scaleY || original.scaleY,
    angle: copy.angle || original.angle,
    flipX: copy.flipX || original.flipX,
    flipY: copy.flipY || original.flipY,
    fill: copy.fill,
    stroke: copy.stroke,
    strokeWidth: copy.strokeWidth,
    opacity: copy.opacity,
    shadow: copy.shadow,
    skewX: copy.skewX,
    skewY: copy.skewY,
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
  original.evented = wasEvented
  canvas.renderAll()
  requestTextureUpdate()
  if (isCompletelyOutsideCanvas(original)) {
    replaceOriginalWithCopy(original, copy)
  } else {
    syncAllCopiesWithOriginal(original)
  }
}

const cloneFabricObject = async (obj) => {
  if (!obj) return null
  try {
    const cloned = await obj.clone()
    return cloned
  } catch (error) {
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

const activateControlsForObject = (obj) => {
  if (obj && !obj.userData?.isWorkZoneIndicator) {
    const isSelected = canvas && canvas.getActiveObject() === obj
    obj.setControlsVisibility({
      mt: true,
      mb: true,
      ml: true,
      mr: true,
      tl: true,
      tr: true,
      bl: true,
      br: true,
      mtr: true
    })
    if (obj.controls) {
      const controlNames = ['mt', 'mb', 'ml', 'mr', 'tl', 'tr', 'bl', 'br', 'mtr']
      controlNames.forEach(controlName => {
        if (obj.controls[controlName]) {
          obj.controls[controlName].visible = true
        }
      })
    }
    if (obj.setCoords) obj.setCoords()
    if (isSelected && canvas) canvas.renderAll()
  }
}

const createWrapAroundCopies = async (obj) => {
  if (!obj || !canvas || obj.userData?.isWorkZoneIndicator) return
  removeWrapAroundCopies(obj)
  const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
  const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
  const objLeft = obj.left || 0
  const objTop = obj.top || 0
  const copies = []
  const topHeight = 0
  const bottomHeight = 0
  const activeZoneTop = topHeight
  const activeZoneBottom = canvasHeight - bottomHeight
  if (objLeft + objWidth > canvasWidth) {
    const copy = await cloneFabricObject(obj)
    if (copy) {
      copy.set({
        left: objLeft - canvasWidth,
        top: objTop,
        selectable: true,
        evented: true,
        excludeFromExport: true
      })
      copy.userData = { 
        isWrapAroundCopy: true, 
        originalObject: obj,
        wrapDirection: 'horizontal-right'
      }
      canvas.add(copy)
      activateControlsForObject(copy)
      try {
        if (canvas.sendObjectToBack) canvas.sendObjectToBack(copy)
      } catch (e) {}
      copies.push(copy)
    }
  }
  if (objLeft < 0) {
    const copy = await cloneFabricObject(obj)
    if (copy) {
      copy.set({
        left: objLeft + canvasWidth,
        top: objTop,
        selectable: true,
        evented: true,
        excludeFromExport: true
      })
      copy.userData = { 
        isWrapAroundCopy: true, 
        originalObject: obj,
        wrapDirection: 'horizontal-left'
      }
      canvas.add(copy)
      activateControlsForObject(copy)
      try {
        if (canvas.sendObjectToBack) canvas.sendObjectToBack(copy)
      } catch (e) {}
      copies.push(copy)
    }
  }
  if (objTop + objHeight > activeZoneBottom) {
    const copy = await cloneFabricObject(obj)
    if (copy) {
      copy.set({
        left: objLeft,
        top: objTop - (activeZoneBottom - activeZoneTop),
        selectable: true,
        evented: true,
        excludeFromExport: true
      })
      copy.userData = { 
        isWrapAroundCopy: true, 
        originalObject: obj,
        wrapDirection: 'vertical-bottom'
      }
      canvas.add(copy)
      activateControlsForObject(copy)
      try {
        if (canvas.sendObjectToBack) canvas.sendObjectToBack(copy)
      } catch (e) {}
      copies.push(copy)
    }
  }
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

const syncAllCopiesWithOriginal = (original) => {
  if (!original || !canvas) return
  
  const copies = wrapAroundCopies.get(original)
  if (!copies || copies.length === 0) return
  
  const objWidth = (original.width || (original.radius ? original.radius * 2 : 50)) * (original.scaleX || 1)
  const objHeight = (original.height || (original.radius ? original.radius * 2 : 50)) * (original.scaleY || 1)
  const objLeft = original.left || 0
  const objTop = original.top || 0
  
  const topHeight = 0
  const bottomHeight = 0
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

const applyWrapAround = async (obj) => {
  if (!obj || !canvas || obj.userData?.isWorkZoneIndicator || obj.userData?.isWrapAroundCopy) return
  
  // Obtenir les dimensions de l'objet (avec le scale appliqué)
  const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
  const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
  
  const objLeft = obj.left || 0
  const objTop = obj.top || 0
  
  const topHeight = 0
  const bottomHeight = 0
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

const customizeControls = (obj) => {
  if (!obj.controls) return
  Object.keys(obj.controls).forEach(controlName => {
    const control = obj.controls[controlName]
    if (control) {
      control.fill = 'transparent'
      control.stroke = '#3b82f6'
      control.strokeWidth = 1
      control.sizeX = 12
      control.sizeY = 12
      
      if (controlName === 'mt') control.y = -2
      else if (controlName === 'mb') control.y = 4
      else if (controlName === 'ml') control.x = -0.6
      else if (controlName === 'mr') control.x = 0.1
    }
  })
}

const enableScalingControls = (obj) => {
  if (obj && !obj.userData?.isWorkZoneIndicator) {
    obj.setControlsVisibility({
      mt: true, mb: true, ml: true, mr: true,
      tl: true, tr: true, bl: true, br: true, mtr: true
    })
  }
}

const signalChange = () => {
  if (!canvas) return
  canvas.renderAll()
  requestTextureUpdateImmediate()
  emit('design-updated', canvas)
}

const updateSelectionState = (activeObject) => {
  if (activeObject && !activeObject.userData?.isWorkZoneIndicator) {
    rotationAngle.value = activeObject.angle || 0
    if (activeObject.userData?.controlsConfig) {
      activeObject.setControlsVisibility(activeObject.userData.controlsConfig)
      if (activeObject.controls) {
        Object.keys(activeObject.controls).forEach(key => {
          if (activeObject.controls[key] && activeObject.userData.controlsConfig[key] !== undefined) {
            activeObject.controls[key].visible = activeObject.userData.controlsConfig[key]
          }
        })
      }
      if (activeObject.userData?.customizeControls) {
        customizeControls(activeObject)
      }
      activeObject.setCoords()
    } else {
      enableScalingControls(activeObject)
    }
    
    if (!canvas.userData) canvas.userData = {}
    if (!canvas.userData.multiSelectedObjects) canvas.userData.multiSelectedObjects = []
    
    const original = activeObject.userData?.isWrapAroundCopy 
      ? activeObject.userData.originalObject 
      : activeObject
    
    if (original) {
      canvas.userData.multiSelectedObjects = [original]
      const copies = wrapAroundCopies.get(original)
      if (copies && copies.length > 0) {
        copies.forEach(copy => {
          if (copy && canvas.getObjects().includes(copy)) {
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
}

const handleObjectAdded = (e) => {
  const obj = e.target
  if (obj.userData?.controlsConfig) {
    obj.setControlsVisibility(obj.userData.controlsConfig)
    if (obj.controls) {
      Object.keys(obj.controls).forEach(key => {
        if (obj.controls[key] && obj.userData.controlsConfig[key] !== undefined) {
          obj.controls[key].visible = obj.userData.controlsConfig[key]
        }
      })
    }
    if (obj.userData?.customizeControls) customizeControls(obj)
    obj.setCoords()
  } else {
    enableScalingControls(obj)
  }
  if (obj && !obj.userData?.isWorkZoneIndicator) {
    obj.selectable = true
    obj.evented = true
  }
  signalChange()
  emit('objects-changed')
}

const handleSelectionCreated = (e) => {
  const activeObject = e.selected?.[0] || canvas.getActiveObject()
  updateSelectionState(activeObject)
  canvas.renderAll()
}

const handleSelectionUpdated = (e) => {
  updateHasSelection()
  const activeObject = e.selected?.[0] || canvas.getActiveObject()
  updateSelectionState(activeObject)
  canvas.renderAll()
}

const handleSelectionCleared = () => {
  updateHasSelection()
  if (canvas.userData?.multiSelectedObjects) {
    canvas.userData.multiSelectedObjects = []
  }
  emit('object-deselected')
}

const handleObjectModified = (e) => {
  const obj = e.target
  if (obj && !obj.userData?.isWorkZoneIndicator && !obj.userData?.isWrapAroundCopy) {
    syncAllCopiesWithOriginal(obj)
    applyWrapAround(obj)
  }
  signalChange()
  const activeObject = canvas.getActiveObject()
  if (activeObject) {
    emit('object-selected', {
      object: activeObject,
      type: activeObject.type
    })
  }
}

const handleObjectRemoved = (e) => {
  const obj = e.target
  if (obj && !obj.userData?.isWrapAroundCopy) {
    removeWrapAroundCopies(obj)
  }
  signalChange()
  emit('objects-changed')
}

const handleObjectMoving = async (e) => {
  const obj = e.target
  if (obj && !obj.userData?.isWorkZoneIndicator) {
    if (obj.userData?.isWrapAroundCopy) {
      syncCopyWithOriginal(obj)
    } else {
      await applyWrapAround(obj)
    }
  }
  const activeObject = canvas.getActiveObject()
  if (activeObject === obj) {
    emit('object-selected', {
      object: activeObject,
      type: activeObject.type
    })
  }
  canvas.renderAll()
  if (props.updateTextureDirect) {
    props.updateTextureDirect()
  } else {
    requestTextureUpdate()
  }
}

const handleObjectMoved = async (e) => {
  const obj = e.target
  if (obj && !obj.userData?.isWorkZoneIndicator) {
    const objects = canvas.getObjects()
    if (!objects.includes(obj)) return
    
    if (obj.userData?.isWrapAroundCopy) {
      syncCopyWithOriginal(obj)
    } else {
      await applyWrapAround(obj)
      if (isCompletelyOutsideCanvas(obj)) {
        const copies = wrapAroundCopies.get(obj)
        if (copies && copies.length > 0) {
          replaceOriginalWithCopy(obj, copies[0])
          signalChange()
          return
        }
      }
    }
  }
  signalChange()
}

const handleObjectScaling = async (e) => {
  const obj = e.target
  if (obj && !obj.userData?.isWorkZoneIndicator) {
    if (obj.userData?.isWrapAroundCopy) {
      const original = obj.userData?.originalObject
      if (original) {
        original.set({
          scaleX: obj.scaleX,
          scaleY: obj.scaleY
        })
        original.setCoords()
        syncAllCopiesWithOriginal(original)
      }
    } else {
      syncAllCopiesWithOriginal(obj)
      await applyWrapAround(obj)
    }
  }
  const activeObject = canvas.getActiveObject()
  if (activeObject === obj) {
    emit('object-selected', {
      object: activeObject,
      type: activeObject.type
    })
  }
  canvas.renderAll()
  if (props.updateTextureDirect) {
    props.updateTextureDirect()
  } else {
    requestTextureUpdate()
  }
  emit('design-updated', canvas)
}

const handleObjectScaled = (e) => {
  const obj = e.target
  if (obj && !obj.userData?.isWorkZoneIndicator && !obj.userData?.isWrapAroundCopy) {
    syncAllCopiesWithOriginal(obj)
    applyWrapAround(obj)
  } else if (obj && obj.userData?.isWrapAroundCopy) {
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
  signalChange()
}

const handleObjectRotated = (e) => {
  const obj = e.target
  if (obj && obj.setCoords) {
    obj.setCoords()
  }
  if (obj === canvas.getActiveObject()) {
    rotationAngle.value = obj.angle || 0
  }
  if (obj && !obj.userData?.isWorkZoneIndicator && !obj.userData?.isWrapAroundCopy) {
    syncAllCopiesWithOriginal(obj)
  } else if (obj && obj.userData?.isWrapAroundCopy) {
    const original = obj.userData?.originalObject
    if (original) {
      original.set({ angle: obj.angle })
      original.setCoords()
      syncAllCopiesWithOriginal(original)
    }
  }
  if (obj && !obj.userData?.isWorkZoneIndicator) {
    emit('object-rotated', {
      object: obj,
      angle: obj.angle || 0
    })
  }
  signalChange()
}

const drawControls = (ctx, obj, coords) => {
  const controlPositions = {}
  Object.keys(obj.controls).forEach(controlName => {
    const control = obj.controls[controlName]
    if (control && control.visible !== false) {
      let finalX, finalY
      switch (controlName) {
        case 'tl': finalX = coords.tl.x; finalY = coords.tl.y; break;
        case 'tr': finalX = coords.tr.x; finalY = coords.tr.y; break;
        case 'bl': finalX = coords.bl.x; finalY = coords.bl.y; break;
        case 'br': finalX = coords.br.x; finalY = coords.br.y; break;
        case 'mt': finalX = (coords.tl.x + coords.tr.x) / 2; finalY = (coords.tl.y + coords.tr.y) / 2; break;
        case 'mb': finalX = (coords.bl.x + coords.br.x) / 2; finalY = (coords.bl.y + coords.br.y) / 2; break;
        case 'ml': finalX = (coords.tl.x + coords.bl.x) / 2; finalY = (coords.tl.y + coords.bl.y) / 2; break;
        case 'mr': finalX = (coords.tr.x + coords.br.x) / 2; finalY = (coords.tr.y + coords.br.y) / 2; break;
        case 'mtr': 
          const centerTopX = (coords.tl.x + coords.tr.x) / 2
          const centerTopY = (coords.tl.y + coords.tr.y) / 2
          const dx = coords.tr.x - coords.tl.x
          const dy = coords.tr.y - coords.tl.y
          const length = Math.sqrt(dx * dx + dy * dy)
          if (Math.abs(dy) < 0.01) {
            finalX = centerTopX
            finalY = centerTopY - 30 
          } else {
            const offset = 30 
            finalX = centerTopX + (dy / length) * offset
            finalY = centerTopY - (dx / length) * offset
          }
          break
        default:
          finalX = coords.tl.x + (coords.tr.x - coords.tl.x) * (control.x + 0.5)
          finalY = coords.tl.y + (coords.bl.y - coords.tl.y) * (control.y + 0.5)
      }
      controlPositions[controlName] = { x: finalX, y: finalY }
      ctx.save()
      ctx.fillStyle = control.fill || 'transparent'
      ctx.strokeStyle = control.stroke || '#3b82f6'
      ctx.lineWidth = control.strokeWidth || 1
      const size = (control.sizeX || 12) / 2
      ctx.beginPath()
      ctx.rect(finalX - size, finalY - size, size * 2, size * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  })
  ctx.save()
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 0.5 
  ctx.setLineDash([5, 5])
  ctx.beginPath()
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

const handleAfterRender = (e) => {
  if (canvas.userData?.multiSelectedObjects) {
    const ctx = e.ctx || canvas.getContext()
    const activeObject = canvas.getActiveObject()
    canvas.userData.multiSelectedObjects.forEach(obj => {
      if (obj && canvas.getObjects().includes(obj) && obj !== activeObject) {
        obj.setCoords()
        if (obj.controls) {
          const coords = obj.aCoords || obj.oCoords
          if (coords) {
             drawControls(ctx, obj, coords)
          }
        }
      }
    })
  }
  
  if (renderTimeout) clearTimeout(renderTimeout)
  renderTimeout = setTimeout(() => {
    requestTextureUpdate()
    emit('design-updated', canvas)
  }, 100)
}

const initCanvas = () => {
  if (!canvasElement.value) return
  try {
    canvas = new Canvas(canvasElement.value, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: '#ffffff',
      selection: true,
      moveCursor: 'move',
      defaultCursor: 'default',
      enableRetinaScaling: false,
      uniformScaling: false,
      centeredScaling: false,
      centeredRotation: false,
      controlsAboveOverlay: false
    })
    
    if (canvasElement.value) {
      canvasElement.value.width = canvasWidth
      canvasElement.value.height = canvasHeight
      canvasElement.value.style.width = `${canvasWidth}px`
      canvasElement.value.style.height = `${canvasHeight}px`
    }
    
    canvas.selection = true
    canvas.allowTouchScrolling = false
    
    canvas.on('object:added', handleObjectAdded)
    canvas.on('selection:created', handleSelectionCreated)
    canvas.on('selection:updated', handleSelectionUpdated)
    canvas.on('selection:cleared', handleSelectionCleared)
    canvas.on('path:created', signalChange)
    canvas.on('object:modified', handleObjectModified)
    canvas.on('object:removed', handleObjectRemoved)
    canvas.on('object:moving', handleObjectMoving)
    canvas.on('object:moved', handleObjectMoved)
    canvas.on('object:scaling', handleObjectScaling)
    canvas.on('object:scaled', handleObjectScaled)
    canvas.on('object:rotated', handleObjectRotated)
    canvas.on('object:skewed', signalChange)
    canvas.on('after:render', handleAfterRender)
    
    canvasElement.value.style.display = 'block'
    canvasElement.value.style.visibility = 'visible'
    canvasElement.value.style.opacity = '1'

    canvas.isDrawingMode = isDrawMode.value
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.width = drawWidth.value
      canvas.freeDrawingBrush.color = drawColor.value
    }
    canvas.renderAll()

    nextTick(() => {
      const canvasEl = canvas.getElement()
      if (canvasEl) {
        canvasEl.style.display = 'block'
        canvasEl.style.visibility = 'visible'
        canvasEl.style.opacity = '1'
      }
      emit('canvas-ready', canvas.getElement())
    })
  } catch (error) {
    console.error('Error initializing canvas:', error)
  }
}



const getCanvasAsTexture = () => {
  if (!canvas) return null;

  try {
    canvas.renderAll();

    const temp = document.createElement("canvas");
    temp.width = canvasWidth;
    temp.height = canvasHeight;

    const ctx = temp.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const fabricCanvas = canvas.getElement();
    if (!fabricCanvas || fabricCanvas.width === 0 || fabricCanvas.height === 0) {
      return null;
    }

    ctx.drawImage(fabricCanvas, 0, 0, canvasWidth, canvasHeight);
    return temp;
  } catch {
    return null;
  }
};


const activatePlacementMode = (type) => {
  if (!canvas) return;

  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  placeElementAt(type, centerX, centerY);
};


const placeElementAt = (type, x, y) => {
  if (!canvas) return;

  const clampedY = Math.max(0, Math.min(canvasHeight, y));

  const map = {
    circle: () => placeCircleAt(x, clampedY),
    rectangle: () => placeRectangleAt(x, clampedY),
    text: () => placeTextAt(x, clampedY)
  };

  map[type]?.();

  placementMode.value = null;
  emit("placement-mode-changed", { active: false, type: null });
};


const finalizeCanvasUpdate = (obj) => {
  canvas.add(obj);
  canvas.setActiveObject(obj);
  canvas.isDrawingMode = false;
  isDrawMode.value = false;
  canvas.selection = true;
  canvas.renderAll();
  requestTextureUpdate();
  emit("design-updated", canvas);
};


const placeCircleAt = (x, y) => {
  const circle = new Circle({
    left: x - 50,
    top: y - 50,
    radius: 50,
    fill: drawColor.value || "#000",
    stroke: "#000",
    strokeWidth: 2,
    selectable: true,
    evented: true
  });

  finalizeCanvasUpdate(circle);
};


const placeRectangleAt = (x, y) => {
  const rect = new Rect({
    left: x - 50,
    top: y - 50,
    width: 100,
    height: 100,
    fill: drawColor.value || "#000",
    stroke: "#000",
    strokeWidth: 2,
    rx: 8,
    ry: 8,
    selectable: true,
    evented: true
  });

  rect.userData = rect.userData || {};
  rect.userData.controlsConfig = {
    mt: true, mb: true, ml: true, mr: true,
    tl: true, tr: true, bl: true, br: true,
    mtr: true
  };

  canvas.userData ||= {};
  canvas.userData.multiSelectedObjects ||= [];
  canvas.userData.multiSelectedObjects.push(rect);

  finalizeCanvasUpdate(rect);
};


const placeTextAt = (x, y) => {
  const text = new Textbox("Hello", {
    left: x - 100,
    top: y - 25,
    fontSize: 32,
    fill: drawColor.value || "#000",
    fontFamily: "Arial",
    width: 80,
    selectable: true,
    evented: true
  });

  finalizeCanvasUpdate(text);
};




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

const distanceToLineSegment = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1
  const dy = y2 - y1
  const length2 = dx * dx + dy * dy
  if (length2 === 0) {
    return Math.sqrt(Math.pow(px - x1, 2) + Math.pow(py - y1, 2))
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length2))
  const closestX = x1 + t * dx
  const closestY = y1 + t * dy
  return Math.sqrt(Math.pow(px - closestX, 2) + Math.pow(py - closestY, 2))
}

const calculateControlCoordinates2D = (obj) => {
  if (!obj) return {}
  let coords = null
  try {
    if (obj.setCoords) obj.setCoords()
    coords = obj.calcCoords ? obj.calcCoords() : obj.oCoords
  } catch (e) {
    coords = obj.oCoords || null
  }
  if (!coords || !coords.tl) return {}
  const controls = {}
  if (coords.tl) controls.tl = { x: coords.tl.x, y: coords.tl.y }
  if (coords.tr) controls.tr = { x: coords.tr.x, y: coords.tr.y }
  if (coords.bl) controls.bl = { x: coords.bl.x, y: coords.bl.y }
  if (coords.br) controls.br = { x: coords.br.x, y: coords.br.y }
  if (coords.tl && coords.tr) {
    controls.mt = { 
      x: (coords.tl.x + coords.tr.x) / 2,
      y: (coords.tl.y + coords.tr.y) / 2
    }
  }
  if (coords.bl && coords.br) {
    controls.mb = { 
      x: (coords.bl.x + coords.br.x) / 2,
      y: (coords.bl.y + coords.br.y) / 2
    }
  }
  if (coords.tl && coords.bl) {
    controls.ml = { 
      x: (coords.tl.x + coords.bl.x) / 2,
      y: (coords.tl.y + coords.bl.y) / 2
    }
  }
  if (coords.tr && coords.br) {
    controls.mr = { 
      x: (coords.tr.x + coords.br.x) / 2,
      y: (coords.tr.y + coords.br.y) / 2
    }
  }
  if (coords.tl && coords.tr) {
    const centerTopX = (coords.tl.x + coords.tr.x) / 2
    const centerTopY = (coords.tl.y + coords.tr.y) / 2
    const dx = coords.tr.x - coords.tl.x
    const dy = coords.tr.y - coords.tl.y
    const length = Math.sqrt(dx * dx + dy * dy)
    if (Math.abs(dy) < 0.01) {
      controls.mtr = { 
        x: centerTopX, 
        y: centerTopY - 30 
      }
    } else {
      const offset = 30
      controls.mtr = { 
        x: centerTopX + (dy / length) * offset,
        y: centerTopY - (dx / length) * offset
      }
    }
  }
  return controls
}

const selectObjectAtPosition = (x, y) => {
  if (!canvas) return false
  const obj = findObjectAtPosition(x, y)
  if (obj) {
    const targetObject = obj
    
    canvas.setActiveObject(targetObject)
    updateHasSelection()
    activateControlsForObject(targetObject)
    canvas.renderAll()
    emit('object-selected', {
      object: targetObject,
      type: targetObject.type
    })
    return true
  }
  const objects = canvas.getObjects().filter(obj => 
    !obj.userData?.isWorkZoneIndicator && 
    obj.visible !== false &&
    (obj.selectable !== false || obj.evented !== false)
  )
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
    
    const tolerance = 100
    const isNear = x >= actualLeft - tolerance && x <= actualLeft + objWidth + tolerance &&
                   y >= actualTop - tolerance && y <= actualTop + objHeight + tolerance
    if (isNear) {
      const targetObject = obj
      canvas.setActiveObject(targetObject)
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
    
    const centerX = actualLeft + objWidth / 2
    const centerY = actualTop + objHeight / 2
    const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2))
    const tolerance = 200
    const isInBounds = x >= actualLeft - tolerance && x <= actualLeft + objWidth + tolerance &&
                       y >= actualTop - tolerance && y <= actualTop + objHeight + tolerance
    if ((isInBounds || objects.length === 1) && distance < closestDistance) {
      closestDistance = distance
      closestObj = obj
    }
  })
  if (!closestObj && objects.length > 0) {
    const maxDistance = 300
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
      if (distance < closestDistance && distance < maxDistance) {
        closestDistance = distance
        closestObj = obj
      }
    })
  }
  if (closestObj) {
    const targetObject = closestObj
    canvas.setActiveObject(targetObject)
    updateHasSelection()
    activateControlsForObject(targetObject)
    canvas.renderAll()
    emit('object-selected', {
      object: targetObject,
      type: targetObject.type
    })
    return true
  }
  canvas.discardActiveObject()
  updateHasSelection()
  canvas.renderAll()
  emit('object-deselected')
  return false
}


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
      newTop = (initialScale.top + deltaY)
    }
  }
  
  // Limiter le scale (entre 0.1 et 10)
  newScaleX = Math.max(0.1, Math.min(10, newScaleX))
  newScaleY = Math.max(0.1, Math.min(10, newScaleY))
  
  const centerPoint = activeObject.getCenterPoint()
  const oldCenterX = centerPoint.x
  const oldCenterY = centerPoint.y
  
  activeObject.set({
    scaleX: newScaleX,
    scaleY: newScaleY
  })
  
  const newCenterPoint = activeObject.getCenterPoint()
  const centerDeltaX = newCenterPoint.x - oldCenterX
  const centerDeltaY = newCenterPoint.y - oldCenterY
  
  activeObject.set({
    left: activeObject.left - centerDeltaX,
    top: activeObject.top - centerDeltaY
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


const resetResizeData = (obj) => {
  if (obj && obj.userData && obj.userData.initialScaleOnResize) {
    delete obj.userData.initialScaleOnResize
  }
}



const moveSelectedObject = (x, y) => {
  if (!canvas) return
  
  const activeObject = canvas.getActiveObject()
  if (!activeObject || activeObject.userData?.isWorkZoneIndicator) {
    return
  }
  
  const objWidth =
    (activeObject.width || (activeObject.radius ? activeObject.radius * 2 : 50)) *
    (activeObject.scaleX || 1)

  const objHeight =
    (activeObject.height || (activeObject.radius ? activeObject.radius * 2 : 50)) *
    (activeObject.scaleY || 1)

  const originX = activeObject.originX || 'left'
  const originY = activeObject.originY || 'top'
  
  let newLeft = x
  let newTop = y
  
  if (originX === 'center') {
    newLeft = x + objWidth / 2
  } else if (originX === 'right') {
    newLeft = x + objWidth
  }
  
  if (originY === 'center') {
    newTop = y + objHeight / 2
  } else if (originY === 'bottom') {
    newTop = y + objHeight
  }

  if (activeObject.userData?.isWrapAroundCopy) {
    activeObject.set({
      left: newLeft,
      top: newTop
    })
    activeObject.setCoords()
    syncCopyWithOriginal(activeObject)
    canvas.renderAll()
    requestTextureUpdate()
    emit('design-updated', canvas)
  } else {
    activeObject.set({
      left: newLeft,
      top: newTop
    })
    
    applyWrapAround(activeObject)
      .then(() => {
        activeObject.setCoords()
        canvas.renderAll()
        requestTextureUpdate()
        emit('design-updated', canvas)
      })
      .catch(() => {
        activeObject.setCoords()
        canvas.renderAll()
        requestTextureUpdate()
        emit('design-updated', canvas)
      })
  }
}



defineExpose({
  getCanvas: () => canvas,
  getCanvasAsTexture,
  getCanvasElement: () => canvas ? canvas.getElement() : null,
  placeElementAt,
  activatePlacementMode,
  moveSelectedObject,
  selectObjectAtPosition,
  findObjectAtPosition,
  detectResizeHandle,
  resizeSelectedObjectFromHandle,
  resetResizeData,
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

