
<template>
  <div class="design-studio">
    <div class="studio-content">
      <div class="view-panel view-3d">
        <div class="panel-header">
          <h3>🎯 Vue 3D - Modèle</h3>
        </div>
        <div v-if="true" class="debug-rotation-preview">
        <div class="debug-header">Preview Shader</div>
        <img :src="tempCanvasDataUrl" alt="Debug Preview" />
      </div>
      <ThreeScene 
        ref="threeSceneRef"
          :texture="appliedTexture"
          :canvas2D="fabricCanvasElement"
          :enable-direct-edit="true"
          :drag-mode="dragMode"
          @texture-ready="onTextureReady"
          @3d-click="on3DClickForPlacement"
          @3d-click-outside="on3DClickOutside"
          @3d-rotation-click="on3DRotationClick"
          @3d-rotation-start="on3DRotationStart"
          @3d-rotation="on3DRotation"
          @3d-rotation-end="on3DRotationEnd"
          @3d-drag="on3DDrag"
          @3d-drag-start="on3DDragStart"
          @3d-drag-end="on3DDragEnd"
          @3d-scale="on3DScale"
          @3d-resize-start="on3DResizeStart"
          @3d-resize="on3DResize"
          @3d-resize-end="on3DResizeEnd"
          @3d-hover="on3DHover"
          @detect-resize-handle="onDetectResizeHandle"
        />
      </div>

      <div class="view-panel view-2d">
        <FabricDesigner
          ref="fabricDesignerRef"
          :canvas-width="500"
          :canvas-height="500"
          :update-texture-direct="() => threeSceneRef?.updateTextureDirect?.()"
          @canvas-ready="onFabricCanvasReady"
          @placement-mode-changed="onPlacementModeChanged"
          @object-selected="onObjectSelected"
          @object-deselected="onObjectDeselected"
          @move-object="onMoveObject"
          @objects-changed="updateAllObjectsList"
          @object-rotated="onObjectRotated"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import ThreeScene from './components/ThreeScene.vue'
import FabricDesigner from './components/FabricDesigner.vue'
import * as THREE from 'three'

const threeSceneRef = ref(null)      // Référence au composant ThreeScene (affichage 3D)
const fabricDesignerRef = ref(null)  // Référence au composant FabricDesigner (canvas 2D)
const appliedTexture = ref(null)            // Texture Three.js appliquée sur le modèle 3D
const fabricCanvasElement = ref(null)        // Référence au canvas HTML Fabric.js (pour la texture partagée)

const placementMode = ref(false)  // Mode de placement actif (clic sur 3D pour placer)
const placementType = ref(null)   // Type d'élément à placer: 'circle', 'rectangle', 'text', 'image'
const dragMode = ref(false)       // Mode drag actif pour déplacer un objet sélectionné
const useDecalOptimization = ref(true)  // Activer/désactiver l'optimisation Decal pour la rotation
const tempCanvasDataUrl = ref(null)  // URL de l'image du tempCanvas pour débogage (rotation optimisée)
const isDragging = ref(false)    // Indique si on est en train de glisser un objet


const onTextureReady = (texture) => {
  appliedTexture.value = texture
}


const on3DClickForPlacement = (clickData) => {
  if (clickData.canvasX === undefined || clickData.canvasY === undefined || 
      clickData.canvasX === null || clickData.canvasY === null) {
    return
  }
  
  // Si on est en mode placement, placer un nouvel élément
  if (placementMode.value && placementType.value) {
    
    if (fabricDesignerRef.value && fabricDesignerRef.value.placeElementAt) {
      fabricDesignerRef.value.placeElementAt(placementType.value, clickData.canvasX, clickData.canvasY)
      nextTick(() => {
        updateAllObjectsList()
      })
    }
    return
  }
  
  if (clickData.checkForObject && fabricDesignerRef.value) {
    const canvas = fabricDesignerRef.value.getCanvas()
    if (canvas) {
      // Chercher un objet à la position du clic
      const found = fabricDesignerRef.value.selectObjectAtPosition(clickData.canvasX, clickData.canvasY)
      
      if (found) {
        // Un objet a été trouvé et sélectionné
        // Activer le mode drag pour pouvoir déplacer immédiatement
        dragMode.value = true
        if (threeSceneRef.value && threeSceneRef.value.setDragMode) {
          threeSceneRef.value.setDragMode(true)
        }
        console.log('✅ Objet trouvé et sélectionné à la position du clic')
      } else {
        // Aucun objet trouvé à cette position
        // Désélectionner tous les objets du canvas
        console.log('❌ Aucun objet trouvé - Désélection de tous les objets')
        canvas.discardActiveObject()
        canvas.requestRenderAll()
        
        // Désactiver le mode drag
        dragMode.value = false
        if (threeSceneRef.value && threeSceneRef.value.setDragMode) {
          threeSceneRef.value.setDragMode(false)
        }
        
        // Mettre à jour la liste des objets pour refléter la désélection
        nextTick(() => {
          updateAllObjectsList()
        })
      }
    }
    return
  }
  
  // Comportement par défaut (sans checkForObject)
  // Sinon, sélectionner l'objet à cette position sur le modèle 3D
  if (fabricDesignerRef.value && fabricDesignerRef.value.selectObjectAtPosition) {
    const found = fabricDesignerRef.value.selectObjectAtPosition(clickData.canvasX, clickData.canvasY)
    if (found) {
      // Activer le mode drag après sélection pour pouvoir déplacer immédiatement
      dragMode.value = true
      if (threeSceneRef.value && threeSceneRef.value.setDragMode) {
        threeSceneRef.value.setDragMode(true)
      }
    } else {
      // Désactiver le mode drag si aucun objet n'est trouvé
      dragMode.value = false
      if (threeSceneRef.value && threeSceneRef.value.setDragMode) {
        threeSceneRef.value.setDragMode(false)
      }
    }
  }
}


const on3DRotationClick = (clickData) => {
  if (!fabricDesignerRef.value) return
  
  const canvas = fabricDesignerRef.value.getCanvas()
  if (!canvas) return
  
  const activeObject = canvas.getActiveObject()
  if (!activeObject || activeObject.userData?.isWorkZoneIndicator) return
  
  // Activer le mode rotation en simulant un clic sur le contrôle mtr
  if (fabricDesignerRef.value.activateRotationMode && clickData.mtrCoords) {
    fabricDesignerRef.value.activateRotationMode(activeObject, clickData.mtrCoords)
  }
}

let rotationInitialAngle = 0
let lastRotationAngle = 0 // Stocker le dernier angle calculé pour l'appliquer à la fin
let skipped2DFrames = 0 // Compteur pour les frames 2D sautées (optimisation)

const on3DRotationStart = (rotationData) => {
  console.log('🟣 DesignStudio: on3DRotationStart', rotationData);
  if (!fabricDesignerRef.value) return
  
  const canvas = fabricDesignerRef.value.getCanvas()
  if (!canvas) return
  
  const activeObject = canvas.getActiveObject()
  if (!activeObject || activeObject.userData?.isWorkZoneIndicator) return
  
  // Stocker l'angle initial de l'objet
  rotationInitialAngle = activeObject.angle || 0
  skipped2DFrames = 0 // Réinitialiser le compteur
  
  // Activer le flag de rotation
  isRotating.value = true
  
  
  // Activer le mode rotation dans FabricDesigner si mtrCoords est disponible
  // rotationData contient: { canvasX, canvasY, mtrCoords }
  if (rotationData && rotationData.mtrCoords && fabricDesignerRef.value.activateRotationMode) {
    console.log('🟢 DesignStudio: Activating rotation mode with mtrCoords', rotationData.mtrCoords)
    fabricDesignerRef.value.activateRotationMode(activeObject, rotationData.mtrCoords)
  }

  // 🔒 DÉSACTIVER OrbitControls pour empêcher la rotation du goblet
  if (threeSceneRef.value && threeSceneRef.value.disableOrbitControls) {
    threeSceneRef.value.disableOrbitControls()
    console.log('🔒 OrbitControls désactivés depuis DesignStudio')
  }

  // OPTIMISATION DECAL: Démarrer la rotation via Decal (seulement si activé)
  if (useDecalOptimization.value && threeSceneRef.value && threeSceneRef.value.startDecalRotation) {
    console.log('⚡ Utilisation de l\'optimisation Decal - Version directe sans tempCanvas')
    
    // 1️⃣ Récupérer l'angle actuel et les propriétés
    const currentAngle = activeObject.angle || 0
    
    // 🔒 Mettre temporairement l'objet à plat (0°) pour la capture
    // Cela assure que l'image générée colle exactement aux dimensions de l'objet
    // sans marges vides dues à la rotation, évitant ainsi l'écrasement/déformation dans le shader
    activeObject.set('angle', 0)
    activeObject.setCoords() // Important pour recalculer les dimensions à plat
    
    // 2️⃣ Dimensions de l'objet (à plat)
    const objWidth = activeObject.getScaledWidth()
    const objHeight = activeObject.getScaledHeight()
    const zoom = 4  // Zoom suffisant (trop haut peut causer des lags)
    
    // 3️⃣ Générer l'image de l'objet "à plat"
    const dataUrl = activeObject.toDataURL({
      format: 'png',
      multiplier: zoom,
      enableRetinaScaling: true,
      withoutBorders: true,
      withoutControls: true
    })
    
    // 🔓 Restaurer l'angle d'origine immédiatement
    activeObject.set('angle', currentAngle)
    activeObject.setCoords()
    
    // 4️⃣ Stocker pour affichage de débogage
    tempCanvasDataUrl.value = dataUrl
    
    // 5️⃣ Calculer le centre de l'objet pour un positionnement précis
    const center = activeObject.getCenterPoint()
    
    // 6️⃣ Démarrer le decal avec l'image "droite"
    // Le shader va maintenant appliquer la rotation proprement sur cette image parfaite
    threeSceneRef.value.startDecalRotation({
      left: center.x,
      top: center.y,
      width: objWidth,
      height: objHeight,
      angle: -(currentAngle)  // ✅ Inverser l'angle pour corriger le sens
    }, dataUrl)

    
    // 7️⃣ Cacher l'objet 2D ET ses contrôles
    activeObject.set({
      opacity: 0,           // Cacher l'objet
      hasControls: false,   // Cacher les contrôles (coins, mtr, etc.)
      hasBorders: false     // Cacher la bordure de sélection
    })
    canvas.renderAll()
  }  // Fin de if (threeSceneRef.value && ...)
}  // Fin de on3DRotationStart


const on3DRotation = (rotationData) => {
  console.log('on3DRotation',rotationData);
  if (!fabricDesignerRef.value) return
  
  const canvas = fabricDesignerRef.value.getCanvas()
  if (!canvas) return
  
  const activeObject = canvas.getActiveObject()
  if (!activeObject || activeObject.userData?.isWorkZoneIndicator) return
  
  // Calculer le nouvel angle en ajoutant la différence d'angle à l'angle initial
  const newAngle = rotationInitialAngle + rotationData.angle
  lastRotationAngle = newAngle // Sauvegarder pour la fin
  
  // OPTIMISATION DECAL: Mettre à jour seulement le decal 3D (si activé)
  if (useDecalOptimization.value && threeSceneRef.value && threeSceneRef.value.updateDecalRotation) {
    // ✅ IMPORTANT: Inverser l'angle pour que le Decal tourne dans le bon sens
    threeSceneRef.value.updateDecalRotation(-newAngle)
    
    // Log pour montrer l'économie de performance
    skipped2DFrames++
    if (skipped2DFrames % 10 === 0) {
      console.log(`⚡ [2D Canvas] SKIPPED Update #${skipped2DFrames} (CPU saved) - Canvas NOT re-rendered`)
    }
    
    // On ne met PAS à jour le canvas 2D ici pour éviter le lag
    return
  }
  
  // FALLBACK: Si l'optimisation n'est pas disponible, utiliser l'ancienne méthode (lente)
  console.log('🟡 DesignStudio: newAngle', newAngle,rotationInitialAngle,rotationData.angle);
  
  // Obtenir le centre actuel de l'objet avant la rotation
  // getCenterPoint() retourne le centre géométrique réel de l'objet
  activeObject.setCoords() // S'assurer que les coordonnées sont à jour
  const centerBefore = activeObject.getCenterPoint()
  const centerX = centerBefore.x
  const centerY = centerBefore.y
  
  // Appliquer la rotation à l'objet dans le canvas 2D
  const angleBefore = activeObject.angle || 0
  console.log('🔄 Rotation 2D - Angle avant:', angleBefore, '°')
  activeObject.set({ angle: newAngle })
  activeObject.setCoords() // Nécessaire pour mettre à jour les coordonnées après rotation
  
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
  
  const angleAfter = activeObject.angle || 0
  console.log('🔄 Rotation 2D - Angle après:', angleAfter, '°')
  canvas.renderAll()
  
  // Mettre à jour les coordonnées des contrôles dans ThreeScene pour refléter la nouvelle rotation
  if (threeSceneRef.value && threeSceneRef.value.updateSelectedObjectCoords) {
    threeSceneRef.value.updateSelectedObjectCoords(activeObject)
  }
  
  // La rotation dans le canvas 2D déclenchera automatiquement l'événement 'object-rotated'
  // qui appliquera la rotation dans la vue 3D via rotateModel
}

/**
 * Gère la fin de la rotation depuis le contrôle de rotation (mtr) dans la vue 3D
 */
const on3DRotationEnd = () => {
  // OPTIMISATION DECAL: Terminer la rotation et appliquer le résultat final (si activé)
  if (useDecalOptimization.value && threeSceneRef.value && threeSceneRef.value.endDecalRotation) {
    threeSceneRef.value.endDecalRotation()
    console.log('⚡ Fin de l\'optimisation Decal')
    
    // Réinitialiser l'affichage du tempCanvas
    tempCanvasDataUrl.value = null
  }

  // 🔓 RÉACTIVER OrbitControls pour permettre la rotation du goblet
  if (threeSceneRef.value && threeSceneRef.value.enableOrbitControls) {
    threeSceneRef.value.enableOrbitControls()
    console.log('🔓 OrbitControls réactivés depuis DesignStudio')
  }

  if (!fabricDesignerRef.value) {
    rotationInitialAngle = 0
    return
  }
  
  const canvas = fabricDesignerRef.value.getCanvas()
  if (!canvas) {
    rotationInitialAngle = 0
    return
  }
  
  const activeObject = canvas.getActiveObject()
  if (activeObject && !activeObject.userData?.isWorkZoneIndicator) {
    // Restaurer l'opacité ET les contrôles
    activeObject.set({
      opacity: 1,          // Réafficher l'objet
      hasControls: true,   // Réafficher les contrôles
      hasBorders: true     // Réafficher la bordure
    })
    
    // Appliquer la rotation finale stockée dans lastRotationAngle
    // Si lastRotationAngle est 0 (pas de mouvement), on garde l'angle actuel
    const finalAngle = lastRotationAngle || activeObject.angle
    
    // --- LOGIQUE DE ROTATION AUTOUR DU CENTRE ---
    // Obtenir le centre actuel de l'objet avant la rotation
    activeObject.setCoords()
    const centerBefore = activeObject.getCenterPoint()
    const centerX = centerBefore.x
    const centerY = centerBefore.y
    
    // Appliquer la rotation
    activeObject.set({ angle: finalAngle })
    activeObject.setCoords()
    
    // Obtenir le nouveau centre après rotation
    const centerAfter = activeObject.getCenterPoint()
    
    // Calculer le décalage
    const deltaX = centerX - centerAfter.x
    const deltaY = centerY - centerAfter.y
    
    // Ajuster la position
    activeObject.set({
      left: (activeObject.left || 0) + deltaX,
      top: (activeObject.top || 0) + deltaY
    })
    activeObject.setCoords()
    
    canvas.renderAll()
    
    // Mettre à jour ThreeScene
    if (threeSceneRef.value && threeSceneRef.value.updateSelectedObjectCoords) {
      threeSceneRef.value.updateSelectedObjectCoords(activeObject)
    }
    
    // IMPORTANT: Forcer la mise à jour de la texture
    if (threeSceneRef.value && threeSceneRef.value.setupSharedCanvasTexture) {
       // La mise à jour se fera via le watch ou l'event, mais on peut forcer si besoin
    }
  }
  
  rotationInitialAngle = 0
  lastRotationAngle = 0
  
  // Désactiver le flag de rotation
  isRotating.value = false
  
  // Mettre à jour les coordonnées de l'objet sélectionné pour actualiser la position du mtr
  if (fabricDesignerRef.value) {
    const canvas = fabricDesignerRef.value.getCanvas()
    if (canvas) {
      const activeObject = canvas.getActiveObject()
      if (activeObject && !activeObject.userData?.isWorkZoneIndicator) {
        // Mettre à jour les coordonnées dans ThreeScene
        if (threeSceneRef.value && threeSceneRef.value.updateSelectedObjectCoords) {
          threeSceneRef.value.updateSelectedObjectCoords(activeObject)
        }
      }
    }
  }
}



const onPlacementModeChanged = (modeData) => {
  placementMode.value = modeData.active
  placementType.value = modeData.type
  
  // Mettre à jour le curseur du modèle 3D si nécessaire
  if (threeSceneRef.value && threeSceneRef.value.setPlacementMode) {
    threeSceneRef.value.setPlacementMode(modeData.active, modeData.type)
  }
}

const onObjectSelected = (data) => {
  dragMode.value = true
  
  // Activer le mode drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragMode) {
    threeSceneRef.value.setDragMode(true)
  }
  
  // Mettre à jour les coordonnées de l'objet sélectionné dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.updateSelectedObjectCoords) {
    threeSceneRef.value.updateSelectedObjectCoords(data.object)
  }
  
  // Mettre à jour la liste de tous les objets
  updateAllObjectsList()
}

const onObjectDeselected = () => {
  dragMode.value = false
  isDragging.value = false
  
  // Désactiver le mode drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragMode) {
    threeSceneRef.value.setDragMode(false)
  }
  
  // Masquer les coordonnées de l'objet sélectionné
  if (threeSceneRef.value && threeSceneRef.value.updateSelectedObjectCoords) {
    threeSceneRef.value.updateSelectedObjectCoords(null)
  }
  
  // Mettre à jour la liste de tous les objets
  updateAllObjectsList()
}


const on3DClickOutside = () => {
  // Désélectionner l'objet dans FabricDesigner
  if (fabricDesignerRef.value && fabricDesignerRef.value.deselectObject) {
    fabricDesignerRef.value.deselectObject()
  }
  
  // Mettre à jour l'état local
  dragMode.value = false
  isDragging.value = false
  
  // Désactiver le mode drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragMode) {
    threeSceneRef.value.setDragMode(false)
  }
  
  // Masquer les coordonnées de l'objet sélectionné
  if (threeSceneRef.value && threeSceneRef.value.updateSelectedObjectCoords) {
    threeSceneRef.value.updateSelectedObjectCoords(null)
  }
}

const updateAllObjectsList = () => {
  if (!fabricDesignerRef.value || !fabricDesignerRef.value.getCanvas) return
  
  const canvas = fabricDesignerRef.value.getCanvas()
  if (!canvas) return
  
  const objects = canvas.getObjects().filter(obj => !obj.userData?.isWorkZoneIndicator)
  
  // Mettre à jour la liste dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.updateObjectsListFromCanvas) {
    threeSceneRef.value.updateObjectsListFromCanvas(objects)
  }
}

const onMoveObject = () => {
  // Mettre à jour la liste des objets après déplacement
  updateAllObjectsList()
}

/**
 * Gère la rotation d'un objet sur le canvas 2D
 * Applique la rotation au modèle 3D
 */
const onObjectRotated = (data) => {
  if (!data || !data.angle) return
  
  // Appliquer la rotation au modèle 3D
  if (threeSceneRef.value && threeSceneRef.value.rotateModel) {
    threeSceneRef.value.rotateModel(data.angle)
  }
}

/**
 * Détecte si le clic est sur un handle de resize
 * Cette fonction est appelée de manière synchrone par ThreeScene
 * 
 * @param {Object} data - Données contenant canvasX, canvasY, et result
 */
const onDetectResizeHandle = (data) => {
  if (!fabricDesignerRef.value || !fabricDesignerRef.value.getCanvas) {
    return
  }
  
  const canvas = fabricDesignerRef.value.getCanvas()
  const activeObject = canvas?.getActiveObject()
  
  if (!activeObject || !fabricDesignerRef.value.detectResizeHandle) {
    return
  }
  
  const handleInfo = fabricDesignerRef.value.detectResizeHandle(
    activeObject,
    data.canvasX,
    data.canvasY
  )
  
  if (handleInfo) {
    // Modifier l'objet result pour indiquer qu'on a détecté un handle
    data.result.isResize = true
    data.result.handleInfo = handleInfo
    console.log('🔍 Handle de resize détecté:', handleInfo)
  }
}

const isResizing = ref(false)
const resizeStartPos = ref({ x: 0, y: 0 })
const currentResizeHandle = ref(null)

const isRotating = ref(false)

const dragOffset = ref({ x: 0, y: 0 })

/**
 * Gère le début du glissement (drag) sur le modèle 3D
 * 
 * Cette fonction est appelée quand ThreeScene a déterminé que c'est un drag (déplacement)
 * et non un resize. La détection est faite en amont par ThreeScene via onDetectResizeHandle.
 * 
 * @param {Object} clickData - Données du clic contenant canvasX, canvasY
 */
const on3DDragStart = (clickData) => {
  if (!dragMode.value) return
  
  // Vérifier que les coordonnées sont valides
  if (clickData.canvasX === undefined || clickData.canvasY === undefined || 
      clickData.canvasX === null || clickData.canvasY === null) {
    return
  }
  
  // C'est un déplacement normal (le resize a déjà été détecté par ThreeScene)
  isDragging.value = true
  isResizing.value = false
  
  console.log('✋ Début du DRAG (déplacement)')
  
  // Calculer le décalage entre le point de clic et la position actuelle de l'objet
  if (fabricDesignerRef.value && fabricDesignerRef.value.getCanvas) {
    const canvas = fabricDesignerRef.value.getCanvas()
    const activeObject = canvas?.getActiveObject()
    
    if (activeObject) {
      // Obtenir les dimensions de l'objet (avec le scale appliqué)
      const objWidth = (activeObject.width || (activeObject.radius ? activeObject.radius * 2 : 50)) * (activeObject.scaleX || 1)
      const objHeight = (activeObject.height || (activeObject.radius ? activeObject.radius * 2 : 50)) * (activeObject.scaleY || 1)
      
      // Obtenir l'origine de l'objet
      const originX = activeObject.originX || 'left'
      const originY = activeObject.originY || 'top'
      
      // Calculer la position du coin haut-gauche de l'objet
      let objLeft = activeObject.left || 0
      let objTop = activeObject.top || 0
      
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
      
      // Calculer le décalage entre le point de clic et le coin haut-gauche de l'objet
      dragOffset.value = {
        x: clickData.canvasX - objLeft,
        y: clickData.canvasY - objTop
      }
      
    }
  }
  
  // Activer le flag de drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragState) {
    threeSceneRef.value.setDragState(true)
  }
}

/**
 * Gère le glissement (drag) sur le modèle 3D pour déplacer un objet 2D
 * 
 * Quand l'utilisateur glisse sur le modèle 3D avec un objet sélectionné,
 * l'objet est déplacé sur le canvas 2D en suivant la position du curseur 3D.
 * 
 * @param {Object} clickData - Données du clic contenant canvasX, canvasY
 */
const on3DDrag = (clickData) => {
  if (!dragMode.value || !isDragging.value || isResizing.value) return
  
  // Vérifier que le clic est dans la zone active
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

// Variable pour stocker le handle survolé actuellement
const currentHoveredHandle = ref(null)

/**
 * Gère le survol du modèle 3D pour détecter les bords de redimensionnement
 * 
 * @param {Object} hoverData - Données contenant canvasX, canvasY
 */
const on3DHover = (hoverData) => {
  if (!fabricDesignerRef.value) return
  
  const canvas = fabricDesignerRef.value.getCanvas()
  const activeObject = canvas?.getActiveObject()
  
  // Si aucun objet n'est sélectionné ou si dragMode n'est pas actif, réinitialiser
  if (!activeObject || !dragMode.value) {
    // Réinitialiser le style
    // DÉSACTIVÉ: Pas besoin si highlightResizeHandle est désactivé
    // if (fabricDesignerRef.value.resetResizeHover) {
    //   fabricDesignerRef.value.resetResizeHover()
    // }
    currentHoveredHandle.value = null
    
    // Réinitialiser le flag de rotation
    if (threeSceneRef.value && threeSceneRef.value.setRotationHandleHover) {
      threeSceneRef.value.setRotationHandleHover(false)
    }
    
      // Remettre le curseur par défaut (move pour déplacement)
      if (threeSceneRef.value && threeSceneRef.value.renderer && threeSceneRef.value.renderer()) {
        const element = threeSceneRef.value.renderer().domElement
        const defaultCursor = dragMode.value ? 'move' : 'default'
        element.style.setProperty('cursor', defaultCursor, 'important')
      }
    return
  }
  
  // Vérifier si on est près d'un bord pour changer le curseur et le style
  if (fabricDesignerRef.value.detectResizeHandle) {
    const handleInfo = fabricDesignerRef.value.detectResizeHandle(
      activeObject,
      hoverData.canvasX,
      hoverData.canvasY
    )
    
    if (handleInfo) {
      // Calculer la distance au contrôle détecté
      let distance = null
      
      // Pour tous les contrôles, calculer la distance
      const objLeft = activeObject.left || 0
      const objTop = activeObject.top || 0
      const objWidth = (activeObject.width || (activeObject.radius ? activeObject.radius * 2 : 50)) * (activeObject.scaleX || 1)
      const objHeight = (activeObject.height || (activeObject.radius ? activeObject.radius * 2 : 50)) * (activeObject.scaleY || 1)
      const objRight = objLeft + objWidth
      const objBottom = objTop + objHeight
      
      let controlX = 0
      let controlY = 0
      
      if (handleInfo.isRotation) {
        // Pour le contrôle de rotation, utiliser les coordonnées calculées dans detectResizeHandle
        // On doit recalculer la position du mtr
        if (activeObject.setCoords) {
          activeObject.setCoords()
        }
        const coords = activeObject.oCoords || activeObject.calcCoords()
        if (coords && coords.tl && coords.tr) {
          const centerTopX = (coords.tl.x + coords.tr.x) / 2
          const centerTopY = (coords.tl.y + coords.tr.y) / 2
          const dx = coords.tr.x - coords.tl.x
          const dy = coords.tr.y - coords.tl.y
          const length = Math.sqrt(dx * dx + dy * dy)
          
          if (Math.abs(dy) < 0.01) {
            controlX = centerTopX
            controlY = centerTopY - 30
          } else {
            // Rectangle roté : utiliser (dy, -dx) pour pointer vers le haut (au-dessus du bord)
            const offset = 30
            controlX = centerTopX + (dy / length) * offset
            controlY = centerTopY - (dx / length) * offset
          }
        }
      } else if (handleInfo.corner) {
        if (handleInfo.corner === 'tl') {
          controlX = objLeft
          controlY = objTop
        } else if (handleInfo.corner === 'tr') {
          controlX = objRight
          controlY = objTop
        } else if (handleInfo.corner === 'bl') {
          controlX = objLeft
          controlY = objBottom
        } else if (handleInfo.corner === 'br') {
          controlX = objRight
          controlY = objBottom
        }
      } else if (handleInfo.edge) {
        if (handleInfo.edge === 'left') {
          controlX = objLeft
          controlY = (objTop + objBottom) / 2
        } else if (handleInfo.edge === 'right') {
          controlX = objRight
          controlY = (objTop + objBottom) / 2
        } else if (handleInfo.edge === 'top') {
          controlX = (objLeft + objRight) / 2
          controlY = objTop
        } else if (handleInfo.edge === 'bottom') {
          controlX = (objLeft + objRight) / 2
          controlY = objBottom
        }
      }
      
      if (controlX !== 0 || controlY !== 0) {
        distance = Math.sqrt(
          Math.pow(hoverData.canvasX - controlX, 2) + 
          Math.pow(hoverData.canvasY - controlY, 2)
        )
      }
      
      // Mettre à jour l'état de débogage dans ThreeScene avec les coordonnées du contrôle
      if (threeSceneRef.value && threeSceneRef.value.setDetectedControl) {
        threeSceneRef.value.setDetectedControl(handleInfo, distance, controlX, controlY)
      }
      
      // Si c'est un nouveau handle, mettre à jour le style
      if (!currentHoveredHandle.value || 
          currentHoveredHandle.value.handle !== handleInfo.handle) {
        currentHoveredHandle.value = handleInfo
        
        // Mettre en évidence le handle
        // DÉSACTIVÉ: Contour mauve supprimé
        // if (fabricDesignerRef.value.highlightResizeHandle) {
        //   fabricDesignerRef.value.highlightResizeHandle(activeObject, handleInfo)
        // }
      }
      
      // Changer le curseur selon le type de handle
      // Seulement si on n'est pas en train de draguer ou faire une rotation
      // (on permet le changement pendant le resize pour garder le bon curseur)
      if (threeSceneRef.value && threeSceneRef.value.renderer && threeSceneRef.value.renderer() && !isDragging.value && !isRotating.value) {
        let cursor = 'move' // Par défaut, curseur de déplacement
        
        if (handleInfo.corner) {
          // Curseur diagonal pour les coins
          if (handleInfo.corner === 'tl' || handleInfo.corner === 'br') {
            cursor = 'nwse-resize' // Diagonale \
          } else if (handleInfo.corner === 'tr' || handleInfo.corner === 'bl') {
            cursor = 'nesw-resize' // Diagonale /
          }
        } else if (handleInfo.edge) {
          // Curseur pour les bords
          if (handleInfo.edge === 'left' || handleInfo.edge === 'right') {
            cursor = 'ew-resize' // Horizontal
          } else if (handleInfo.edge === 'top' || handleInfo.edge === 'bottom') {
            cursor = 'ns-resize' // Vertical
          }
        } else if (handleInfo.isRotation) {
          // Curseur pour le contrôle de rotation
          cursor = 'grab' // Curseur de rotation
        }
        
        // Appliquer le curseur
        if (threeSceneRef.value.renderer() && threeSceneRef.value.renderer().domElement) {
          const element = threeSceneRef.value.renderer().domElement
          
          // Utiliser setProperty pour forcer l'application
          element.style.setProperty('cursor', cursor, 'important')
          
          // Fallback si setProperty ne fonctionne pas
          if (element.style.cursor !== cursor) {
            element.style.cursor = cursor
          }
        }
        
        // Informer ThreeScene si on survole le contrôle de rotation
        if (threeSceneRef.value && threeSceneRef.value.setRotationHandleHover) {
          threeSceneRef.value.setRotationHandleHover(handleInfo.isRotation || false)
        }
      } else {
        // Plus de handle survolé, réinitialiser le flag de rotation
        if (threeSceneRef.value && threeSceneRef.value.setRotationHandleHover) {
          threeSceneRef.value.setRotationHandleHover(false)
        }
      }
    } else {
      // Plus de handle survolé, réinitialiser le style
      if (currentHoveredHandle.value) {
        currentHoveredHandle.value = null
        // DÉSACTIVÉ: Pas besoin si highlightResizeHandle est désactivé
        // if (fabricDesignerRef.value && fabricDesignerRef.value.resetResizeHover) {
        //   fabricDesignerRef.value.resetResizeHover()
        // }
        }
      
      // Réinitialiser l'état de débogage
      if (threeSceneRef.value && threeSceneRef.value.setDetectedControl) {
        threeSceneRef.value.setDetectedControl(null)
      }
      
      // Réinitialiser le flag de rotation
      if (threeSceneRef.value && threeSceneRef.value.setRotationHandleHover) {
        threeSceneRef.value.setRotationHandleHover(false)
      }
      
      if (threeSceneRef.value && threeSceneRef.value.renderer && threeSceneRef.value.renderer()) {
        const element = threeSceneRef.value.renderer().domElement
        element.style.setProperty('cursor', 'move', 'important')
      }
    }
  }
}

/**
 * Gère le début du redimensionnement depuis le modèle 3D
 * 
 * Cette fonction est appelée quand ThreeScene a déterminé que c'est un resize.
 * La détection du handle est faite en amont par ThreeScene via onDetectResizeHandle.
 * 
 * @param {Object} resizeData - Données contenant canvasX, canvasY, handleInfo
 */
const on3DResizeStart = (resizeData) => {
  isResizing.value = true
  isDragging.value = false
  resizeStartPos.value = { x: resizeData.canvasX, y: resizeData.canvasY }
  currentResizeHandle.value = resizeData.handleInfo
  
  console.log('🔧 Début du RESIZE', resizeData.handleInfo)
}

/**
 * Gère le redimensionnement en cours depuis le modèle 3D
 * 
 * @param {Object} resizeData - Données contenant canvasX, canvasY, startX, startY, handleInfo
 */
const on3DResize = (resizeData) => {
  if (!dragMode.value || !isResizing.value) return
  
  // Vérifier que les coordonnées sont valides
  if (resizeData.canvasX === undefined || resizeData.canvasY === undefined || 
      resizeData.canvasX === null || resizeData.canvasY === null) {
    return
  }
  
  // Redimensionner l'objet sélectionné
  if (fabricDesignerRef.value && fabricDesignerRef.value.resizeSelectedObjectFromHandle) {
    fabricDesignerRef.value.resizeSelectedObjectFromHandle(
      resizeData.canvasX,
      resizeData.canvasY,
      resizeData.startX,
      resizeData.startY,
      resizeData.handleInfo
    )
  }
}

/**
 * Gère la fin du redimensionnement depuis le modèle 3D
 */
const on3DResizeEnd = () => {
  // Réinitialiser les données de resize dans le canvas
  if (fabricDesignerRef.value && fabricDesignerRef.value.getCanvas) {
    const canvas = fabricDesignerRef.value.getCanvas()
    const activeObject = canvas?.getActiveObject()
    if (activeObject && fabricDesignerRef.value.resetResizeData) {
      fabricDesignerRef.value.resetResizeData(activeObject)
    }
  }
  
  // Réinitialiser le style de hover
  if (fabricDesignerRef.value && fabricDesignerRef.value.resetResizeHover) {
    fabricDesignerRef.value.resetResizeHover()
  }
  currentHoveredHandle.value = null
  
  isResizing.value = false
  resizeStartPos.value = { x: 0, y: 0 }
  currentResizeHandle.value = null
  
  // Désactiver le mode resize dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setResizing) {
    threeSceneRef.value.setResizing(false, null, null)
  }
  
  // Désactiver le drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragState) {
    threeSceneRef.value.setDragState(false)
  }
  
  // Remettre le curseur normal (move pour déplacement)
  if (threeSceneRef.value && threeSceneRef.value.renderer && threeSceneRef.value.renderer()) {
    const element = threeSceneRef.value.renderer().domElement
    const defaultCursor = dragMode.value ? 'move' : 'default'
    element.style.setProperty('cursor', defaultCursor, 'important')
  }
}

/**
 * Gère la fin du glissement sur le modèle 3D
 */
const on3DDragEnd = () => {
  isDragging.value = false
  
  // Réinitialiser le décalage
  dragOffset.value = { x: 0, y: 0 }
  
  // Réinitialiser le style de hover
  if (fabricDesignerRef.value && fabricDesignerRef.value.resetResizeHover) {
    fabricDesignerRef.value.resetResizeHover()
  }
  currentHoveredHandle.value = null
  
  // Désactiver le drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragState) {
    threeSceneRef.value.setDragState(false)
  }
  
  // Remettre le curseur normal (move pour déplacement)
  if (threeSceneRef.value && threeSceneRef.value.renderer && threeSceneRef.value.renderer()) {
    const element = threeSceneRef.value.renderer().domElement
    const defaultCursor = dragMode.value ? 'move' : 'default'
    element.style.setProperty('cursor', defaultCursor, 'important')
  }
}

/**
 * Gère le redimensionnement d'un objet avec la molette de la souris
 * 
 * Quand l'utilisateur utilise la molette sur le modèle 3D avec un objet sélectionné,
 * l'objet est redimensionné proportionnellement.
 * 
 * @param {Object} scaleData - Données contenant le facteur de redimensionnement
 */
const on3DScale = (scaleData) => {
  // Vérifier qu'un objet est sélectionné (dragMode actif signifie qu'un objet est sélectionné)
  if (!dragMode.value) return
  
  // Vérifier qu'il y a bien un objet sélectionné dans le canvas
  if (!fabricDesignerRef.value) return
  
  const canvas = fabricDesignerRef.value.getCanvas()
  if (!canvas || !canvas.getActiveObject()) {
    return
  }
  
  // Redimensionner l'objet sélectionné sur le canvas 2D
  if (fabricDesignerRef.value.scaleSelectedObject) {
    fabricDesignerRef.value.scaleSelectedObject(scaleData.scaleFactor)
  }
}

const onFabricCanvasReady = (htmlCanvas) => {
  fabricCanvasElement.value = htmlCanvas
  
  // Si le modèle est déjà chargé, configurer la texture partagée
  if (threeSceneRef.value && threeSceneRef.value.setupSharedCanvasTexture) {
    threeSceneRef.value.setupSharedCanvasTexture(htmlCanvas)
  }
  
  // Mettre à jour la liste de tous les objets
  updateAllObjectsList()
}

onMounted(async () => {
})
</script>

<style scoped>
.design-studio {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.studio-header {
  background: white;
  padding: 15px 20px;
  border-bottom: 2px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
}

.studio-header h1 {
  margin: 0;
  font-size: 24px;
  color: #1f2937;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.upload-btn {
  padding: 8px 16px;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.upload-btn:hover {
  background: #4338ca;
}

/* Style pour le bouton Decal actif */
.upload-btn.active {
  background: #10b981;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
}

.upload-btn.active:hover {
  background: #059669;
}

.view-toggle-btn {
  padding: 8px 16px;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
  margin-left: 10px;
}

.view-toggle-btn:hover {
  background: #059669;
}

.apply-btn {
  padding: 8px 16px;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.apply-btn:hover:not(:disabled) {
  background: #059669;
}

.apply-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
  opacity: 0.6;
}

.mesh-selector-btn {
  padding: 8px 16px;
  background: #8b5cf6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.mesh-selector-btn:hover:not(:disabled) {
  background: #7c3aed;
}

.mesh-selector-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
  opacity: 0.6;
}

.toggle-realtime {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f3f4f6;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  user-select: none;
}

.toggle-realtime input[type="checkbox"] {
  cursor: pointer;
  width: 18px;
  height: 18px;
}

.toggle-realtime span {
  color: #374151;
  font-weight: 500;
}

.studio-content {
  flex: 1;
  display: flex;
  flex-direction: column; /* Afficher les vues l'une sous l'autre */
  position: relative;
  overflow: hidden;
  gap: 0; /* Pas d'espace entre les vues */
}

/* ===== VUES EN MODE SPLIT (une sous l'autre) ===== */
.view-panel {
  position: relative; /* Changé de absolute à relative */
  width: 100%;
  height: 50%; /* Chaque vue prend 50% de la hauteur */
  display: flex;
  flex-direction: column;
  border-bottom: 2px solid #e5e7eb;
}

.view-panel:last-child {
  border-bottom: none; /* Pas de bordure pour la dernière vue */
}

.view-3d {
  background: #1a1a1a;
  z-index: 1;
}

.view-2d {
  background: white;
  z-index: 1; /* Même z-index car elles ne se chevauchent plus */
  overflow: hidden;
}

/* Headers des panneaux */
.view-panel .panel-header {
  flex-shrink: 0;
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.05);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.view-3d .panel-header {
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.view-panel .panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.view-3d .panel-header h3 {
  color: #fff;
}

/* Prévisualisation du tempCanvas */
.temp-canvas-preview {
  position: absolute;
  top: 60px;
  right: 330px;
  background: rgba(0, 0, 0, 0.8);
  border: 2px solid #10b981;
  border-radius: 8px;
  padding: 10px;
  z-index: 1000;
  max-width: 300px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.temp-canvas-header {
  color: #10b981;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
  text-align: center;
}

.temp-canvas-preview img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.view-2d .panel-header {
  flex-shrink: 0;
}

.view-2d .work-zone-controls {
  flex-shrink: 0;
}

.view-2d .fabric-designer-container {
  flex: 1;
  overflow: auto;
}

/* Anciens styles pour compatibilité */
.scene-panel {
  flex: 1;
  position: relative;
  background: #1a1a1a;
  transition: width 0.3s ease;
}

.scene-panel.full-width {
  width: 100%;
}

.designer-panel {
  flex: 1;
  background: white;
  border-left: 2px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  height: 100%;
}

.panel-header {
  padding: 10px 15px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f9fafb;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #374151;
}

.toggle-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.toggle-btn:hover {
  background: #e5e7eb;
}

.floating-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  padding: 10px 20px;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  z-index: 100;
  transition: background 0.2s;
}

.floating-btn:hover {
  background: #4338ca;
}

.error-message {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  background: #ef4444;
  color: white;
  border-radius: 6px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  animation: slideUp 0.3s ease;
}

.work-zone-controls {
  padding: 15px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.control-group label {
  display: block;
  font-weight: 600;
  font-size: 14px;
  color: #374151;
  margin-bottom: 10px;
}

.slider-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.slider-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #6b7280;
}

.slider-label input[type="range"] {
  flex: 1;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  outline: none;
}

.slider-label input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  background: #4f46e5;
  border-radius: 50%;
  cursor: pointer;
}

.slider-label input[type="range"]::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: #4f46e5;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.zone-info {
  margin-top: 10px;
  padding: 8px 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  font-size: 12px;
  color: #1e40af;
}

.placement-indicator {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  background: #4f46e5;
  color: white;
  border-radius: 6px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  font-size: 14px;
  font-weight: 500;
  animation: slideDown 0.3s ease;
}

.drag-indicator {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  background: #10b981;
  color: white;
  border-radius: 6px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  font-size: 14px;
  font-weight: 500;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@media (max-width: 1024px) {
  .designer-panel {
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
  }
  
  .studio-header {
    flex-direction: column;
    align-items: flex-start;
  }
}

.debug-rotation-preview {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: white;
  border: 2px solid #178efa;
  border-radius: 8px;
  padding: 10px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  z-index: 9999;
  max-width: 300px;
}

.debug-header {
  font-size: 12px;
  font-weight: bold;
  color: #333;
  margin-bottom: 5px;
  text-align: center;
  border-bottom: 1px solid #eee;
  padding-bottom: 5px;
}

.debug-rotation-preview img {
  max-width: 100%;
  height: auto;
  display: block;
  border: 1px solid #eee;
  background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), 
                    linear-gradient(-45deg, #ccc 25%, transparent 25%), 
                    linear-gradient(45deg, transparent 75%, #ccc 75%), 
                    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}
</style>

