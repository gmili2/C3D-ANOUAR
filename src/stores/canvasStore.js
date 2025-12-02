import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Store Pinia pour gérer l'état du canvas Fabric.js et la communication
 * entre FabricDesigner (2D) et ThreeScene (3D)
 */
export const useCanvasStore = defineStore('canvas', () => {
  // ===== ÉTAT DU CANVAS =====
  const canvas = ref(null)                    // Instance Fabric.js Canvas
  const canvasElement = ref(null)             // Référence au canvas HTML
  const isCanvasReady = ref(false)            // Canvas prêt ou non

  // ===== ÉTAT DES OBJETS =====
  const selectedObject = ref(null)            // Objet actuellement sélectionné
  const allObjects = ref([])                  // Liste de tous les objets sur le canvas
  const isDesignUpdated = ref(false)          // Flag pour indiquer que le design a changé

  // ===== MODES D'INTERACTION =====
  const placementMode = ref(false)            // Mode placement actif
  const placementType = ref(null)            // Type d'élément à placer: 'circle', 'rectangle', 'text', 'image'
  const dragMode = ref(false)                 // Mode drag actif
  const isDragging = ref(false)               // En train de glisser
  const isResizing = ref(false)               // En train de redimensionner
  const isRotating = ref(false)               // En train de rotater

  // ===== ÉVÉNEMENTS 3D =====
  // Ces callbacks seront appelés depuis ThreeScene
  const on3DClickCallback = ref(null)
  const on3DClickOutsideCallback = ref(null)
  const on3DRotationClickCallback = ref(null)
  const on3DRotationStartCallback = ref(null)
  const on3DRotationCallback = ref(null)
  const on3DRotationEndCallback = ref(null)
  const on3DDragStartCallback = ref(null)
  const on3DDragCallback = ref(null)
  const on3DDragEndCallback = ref(null)
  const on3DResizeStartCallback = ref(null)
  const on3DResizeCallback = ref(null)
  const on3DResizeEndCallback = ref(null)
  const on3DHoverCallback = ref(null)
  const on3DScaleCallback = ref(null)
  const onDetectResizeHandleCallback = ref(null)
  const onAddRectangleClickCallback = ref(null)

  // ===== ÉVÉNEMENTS 2D =====
  // Ces callbacks seront appelés depuis FabricDesigner
  const onDesignUpdatedCallback = ref(null)
  const onCanvasReadyCallback = ref(null)
  const onPlacementModeChangedCallback = ref(null)
  const onObjectSelectedCallback = ref(null)
  const onObjectDeselectedCallback = ref(null)
  const onMoveObjectCallback = ref(null)
  const onObjectsChangedCallback = ref(null)
  const onObjectRotatedCallback = ref(null)

  // ===== ÉVÉNEMENTS MODÈLE 3D =====
  const onModelLoadedCallback = ref(null)
  const onModelErrorCallback = ref(null)
  const onTextureReadyCallback = ref(null)
  const onMeshesExtractedCallback = ref(null)

  // ===== COMPUTED PROPERTIES =====
  const hasObjects = computed(() => allObjects.value.length > 0)
  const hasSelectedObject = computed(() => selectedObject.value !== null)

  // ===== ACTIONS POUR LE CANVAS =====
  function setCanvas(canvasInstance) {
    canvas.value = canvasInstance
  }

  function setCanvasElement(element) {
    canvasElement.value = element
    isCanvasReady.value = true
    if (onCanvasReadyCallback.value) {
      onCanvasReadyCallback.value(element)
    }
  }

  function markDesignUpdated() {
    isDesignUpdated.value = true
    if (onDesignUpdatedCallback.value) {
      onDesignUpdatedCallback.value(canvas.value)
    }
  }

  // ===== ACTIONS POUR LES OBJETS =====
  function setSelectedObject(object, skipCallback = false) {
    // Éviter la boucle infinie : ne pas mettre à jour si c'est le même objet
    if (selectedObject.value === object) {
      return
    }
    
    selectedObject.value = object
    
    // Ne pas appeler le callback si skipCallback est true (pour éviter les boucles infinies)
    if (!skipCallback) {
      if (object && onObjectSelectedCallback.value) {
        onObjectSelectedCallback.value({ object })
      } else if (!object && onObjectDeselectedCallback.value) {
        onObjectDeselectedCallback.value()
      }
    }
  }

  function updateAllObjects(objects) {
    allObjects.value = objects
    if (onObjectsChangedCallback.value) {
      onObjectsChangedCallback.value()
    }
  }

  function notifyObjectRotated(data) {
    if (onObjectRotatedCallback.value) {
      onObjectRotatedCallback.value(data)
    }
  }

  function notifyMoveObject(data) {
    if (onMoveObjectCallback.value) {
      onMoveObjectCallback.value(data)
    }
  }

  // ===== ACTIONS POUR LES MODES =====
  function setPlacementMode(active, type, skipCallback = false) {
    // Éviter la boucle infinie : ne pas mettre à jour si c'est déjà la même valeur
    if (placementMode.value === active && placementType.value === type) {
      return
    }
    
    placementMode.value = active
    placementType.value = type
    
    // Ne pas appeler le callback si skipCallback est true (pour éviter les boucles infinies)
    if (!skipCallback && onPlacementModeChangedCallback.value) {
      onPlacementModeChangedCallback.value({ active, type })
    }
  }

  function setDragMode(active) {
    dragMode.value = active
  }

  function setDragging(active) {
    isDragging.value = active
  }

  function setResizing(active) {
    isResizing.value = active
  }

  function setRotating(active) {
    isRotating.value = active
  }

  // ===== ACTIONS POUR LES ÉVÉNEMENTS 3D =====
  function trigger3DClick(data) {
    if (on3DClickCallback.value) {
      on3DClickCallback.value(data)
    }
  }

  function trigger3DClickOutside(data) {
    if (on3DClickOutsideCallback.value) {
      on3DClickOutsideCallback.value(data)
    }
  }

  function trigger3DRotationClick(data) {
    if (on3DRotationClickCallback.value) {
      on3DRotationClickCallback.value(data)
    }
  }

  function trigger3DRotationStart(data) {
    if (on3DRotationStartCallback.value) {
      on3DRotationStartCallback.value(data)
    }
  }

  function trigger3DRotation(data) {
    if (on3DRotationCallback.value) {
      on3DRotationCallback.value(data)
    }
  }

  function trigger3DRotationEnd() {
    if (on3DRotationEndCallback.value) {
      on3DRotationEndCallback.value()
    }
  }

  function trigger3DDragStart(data) {
    if (on3DDragStartCallback.value) {
      on3DDragStartCallback.value(data)
    }
  }

  function trigger3DDrag(data) {
    if (on3DDragCallback.value) {
      on3DDragCallback.value(data)
    }
  }

  function trigger3DDragEnd() {
    if (on3DDragEndCallback.value) {
      on3DDragEndCallback.value()
    }
  }

  function trigger3DResizeStart(data) {
    if (on3DResizeStartCallback.value) {
      on3DResizeStartCallback.value(data)
    }
  }

  function trigger3DResize(data) {
    if (on3DResizeCallback.value) {
      on3DResizeCallback.value(data)
    }
  }

  function trigger3DResizeEnd() {
    if (on3DResizeEndCallback.value) {
      on3DResizeEndCallback.value()
    }
  }

  function trigger3DHover(data) {
    if (on3DHoverCallback.value) {
      on3DHoverCallback.value(data)
    }
  }

  function trigger3DScale(data) {
    if (on3DScaleCallback.value) {
      on3DScaleCallback.value(data)
    }
  }

  function triggerDetectResizeHandle(data) {
    if (onDetectResizeHandleCallback.value) {
      onDetectResizeHandleCallback.value(data)
    }
  }

  function triggerAddRectangleClick(data) {
    if (onAddRectangleClickCallback.value) {
      onAddRectangleClickCallback.value(data)
    }
  }

  // ===== ACTIONS POUR LES ÉVÉNEMENTS MODÈLE 3D =====
  function triggerModelLoaded(mesh) {
    if (onModelLoadedCallback.value) {
      onModelLoadedCallback.value(mesh)
    }
  }

  function triggerModelError(error) {
    if (onModelErrorCallback.value) {
      onModelErrorCallback.value(error)
    }
  }

  function triggerTextureReady(texture) {
    if (onTextureReadyCallback.value) {
      onTextureReadyCallback.value(texture)
    }
  }

  function triggerMeshesExtracted(meshes) {
    if (onMeshesExtractedCallback.value) {
      onMeshesExtractedCallback.value(meshes)
    }
  }

  // ===== REGISTRATION DES CALLBACKS =====
  // Permet aux composants d'enregistrer leurs callbacks
  function register3DCallbacks(callbacks) {
    if (callbacks.on3DClick) on3DClickCallback.value = callbacks.on3DClick
    if (callbacks.on3DClickOutside) on3DClickOutsideCallback.value = callbacks.on3DClickOutside
    if (callbacks.on3DRotationClick) on3DRotationClickCallback.value = callbacks.on3DRotationClick
    if (callbacks.on3DRotationStart) on3DRotationStartCallback.value = callbacks.on3DRotationStart
    if (callbacks.on3DRotation) on3DRotationCallback.value = callbacks.on3DRotation
    if (callbacks.on3DRotationEnd) on3DRotationEndCallback.value = callbacks.on3DRotationEnd
    if (callbacks.on3DDragStart) on3DDragStartCallback.value = callbacks.on3DDragStart
    if (callbacks.on3DDrag) on3DDragCallback.value = callbacks.on3DDrag
    if (callbacks.on3DDragEnd) on3DDragEndCallback.value = callbacks.on3DDragEnd
    if (callbacks.on3DResizeStart) on3DResizeStartCallback.value = callbacks.on3DResizeStart
    if (callbacks.on3DResize) on3DResizeCallback.value = callbacks.on3DResize
    if (callbacks.on3DResizeEnd) on3DResizeEndCallback.value = callbacks.on3DResizeEnd
    if (callbacks.on3DHover) on3DHoverCallback.value = callbacks.on3DHover
    if (callbacks.on3DScale) on3DScaleCallback.value = callbacks.on3DScale
    if (callbacks.onDetectResizeHandle) onDetectResizeHandleCallback.value = callbacks.onDetectResizeHandle
    if (callbacks.onAddRectangleClick) onAddRectangleClickCallback.value = callbacks.onAddRectangleClick
  }

  function register2DCallbacks(callbacks) {
    if (callbacks.onDesignUpdated) onDesignUpdatedCallback.value = callbacks.onDesignUpdated
    if (callbacks.onCanvasReady) onCanvasReadyCallback.value = callbacks.onCanvasReady
    if (callbacks.onPlacementModeChanged) onPlacementModeChangedCallback.value = callbacks.onPlacementModeChanged
    if (callbacks.onObjectSelected) onObjectSelectedCallback.value = callbacks.onObjectSelected
    if (callbacks.onObjectDeselected) onObjectDeselectedCallback.value = callbacks.onObjectDeselected
    if (callbacks.onMoveObject) onMoveObjectCallback.value = callbacks.onMoveObject
    if (callbacks.onObjectsChanged) onObjectsChangedCallback.value = callbacks.onObjectsChanged
    if (callbacks.onObjectRotated) onObjectRotatedCallback.value = callbacks.onObjectRotated
  }

  function registerModelCallbacks(callbacks) {
    if (callbacks.onModelLoaded) onModelLoadedCallback.value = callbacks.onModelLoaded
    if (callbacks.onModelError) onModelErrorCallback.value = callbacks.onModelError
    if (callbacks.onTextureReady) onTextureReadyCallback.value = callbacks.onTextureReady
    if (callbacks.onMeshesExtracted) onMeshesExtractedCallback.value = callbacks.onMeshesExtracted
  }

  // ===== RESET =====
  function reset() {
    selectedObject.value = null
    placementMode.value = false
    placementType.value = null
    dragMode.value = false
    isDragging.value = false
    isResizing.value = false
    isRotating.value = false
    isDesignUpdated.value = false
  }

  return {
    // State
    canvas,
    canvasElement,
    isCanvasReady,
    selectedObject,
    allObjects,
    isDesignUpdated,
    placementMode,
    placementType,
    dragMode,
    isDragging,
    isResizing,
    isRotating,
    // Computed
    hasObjects,
    hasSelectedObject,
    // Actions
    setCanvas,
    setCanvasElement,
    markDesignUpdated,
    setSelectedObject,
    updateAllObjects,
    notifyObjectRotated,
    notifyMoveObject,
    setPlacementMode,
    setDragMode,
    setDragging,
    setResizing,
    setRotating,
    // 3D Events
    trigger3DClick,
    trigger3DClickOutside,
    trigger3DRotationClick,
    trigger3DRotationStart,
    trigger3DRotation,
    trigger3DRotationEnd,
    trigger3DDragStart,
    trigger3DDrag,
    trigger3DDragEnd,
    trigger3DResizeStart,
    trigger3DResize,
    trigger3DResizeEnd,
    trigger3DHover,
    trigger3DScale,
    triggerDetectResizeHandle,
    triggerAddRectangleClick,
    // Model Events
    triggerModelLoaded,
    triggerModelError,
    triggerTextureReady,
    triggerMeshesExtracted,
    // Callback Registration
    register3DCallbacks,
    register2DCallbacks,
    registerModelCallbacks,
    // Reset
    reset
  }
})

