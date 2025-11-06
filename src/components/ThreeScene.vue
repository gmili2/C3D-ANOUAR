<!-- 
  ThreeScene.vue - Composant pour l'affichage 3D avec Three.js
  
  Ce composant gère :
  - Le chargement et l'affichage de modèles 3D (fichiers OBJ)
  - La scène Three.js avec caméra, lumières et contrôles
  - La projection des clics 3D vers le canvas 2D
  - L'application de textures depuis le canvas 2D
  - La génération automatique de coordonnées UV si manquantes
  - Les interactions (clic, drag, zoom) avec le modèle 3D
-->
<template>
  <div class="three-scene-container">
    <!-- Canvas WebGL pour le rendu 3D -->
    <canvas ref="canvasElement" class="three-canvas"></canvas>
    <!-- TextureUpdater invisible pour surveiller les mises à jour de texture -->
    <TextureUpdater
      v-if="canvasTexture && renderer && scene && camera"
      ref="textureUpdaterRef"
      :texture="canvasTexture"
      :renderer="renderer"
      :scene="scene"
      :camera="camera"
    />
    <!-- Affichage des coordonnées en temps réel -->
    <div v-if="coordinatesDisplay.show" class="coordinates-display">
      <div class="coord-title">📍 Coordonnées Curseur</div>
      <div class="coord-section">
        <div class="coord-label">3D (UV):</div>
        <div class="coord-value">
          U: {{ coordinatesDisplay.uvU.toFixed(3) }}, 
          V: {{ coordinatesDisplay.uvV.toFixed(3) }}
        </div>
      </div>
      <div class="coord-section">
        <div class="coord-label">2D (Canvas):</div>
        <div class="coord-value">
          X: {{ coordinatesDisplay.canvasX.toFixed(1) }}, 
          Y: {{ coordinatesDisplay.canvasY.toFixed(1) }}
        </div>
      </div>
      <div v-if="coordinatesDisplay.worldPos" class="coord-section">
        <div class="coord-label">3D (World):</div>
        <div class="coord-value">
          X: {{ coordinatesDisplay.worldPos.x.toFixed(2) }}, 
          Y: {{ coordinatesDisplay.worldPos.y.toFixed(2) }}, 
          Z: {{ coordinatesDisplay.worldPos.z.toFixed(2) }}
        </div>
      </div>
    </div>
    
    <!-- Affichage des coordonnées de l'élément sélectionné -->
    <div v-if="selectedObjectCoords.show" class="coordinates-display selected-object-coords">
      <div class="coord-title">🎯 Élément Sélectionné</div>
      <div class="coord-content">
        <div class="coord-section">
          <div class="coord-label">Type:</div>
          <div class="coord-value">{{ selectedObjectCoords.type }}</div>
        </div>
        <div class="coord-section">
          <div class="coord-label">Position 2D:</div>
          <div class="coord-value">
            X: {{ selectedObjectCoords.left.toFixed(1) }}, 
            Y: {{ selectedObjectCoords.top.toFixed(1) }}
          </div>
        </div>
        <div class="coord-section">
          <div class="coord-label">Taille:</div>
          <div class="coord-value">
            W: {{ selectedObjectCoords.width.toFixed(1) }}, 
            H: {{ selectedObjectCoords.height.toFixed(1) }}
          </div>
        </div>
        <div v-if="selectedObjectCoords.scaleX !== 1 || selectedObjectCoords.scaleY !== 1" class="coord-section">
          <div class="coord-label">Échelle:</div>
          <div class="coord-value">
            X: {{ selectedObjectCoords.scaleX.toFixed(2) }}, 
            Y: {{ selectedObjectCoords.scaleY.toFixed(2) }}
          </div>
        </div>
        <div v-if="selectedObjectCoords.angle" class="coord-section">
          <div class="coord-label">Rotation:</div>
          <div class="coord-value">{{ selectedObjectCoords.angle.toFixed(1) }}°</div>
        </div>
      </div>
    </div>
    
    <!-- Liste de tous les éléments -->
    <div v-if="allObjectsList.length > 0" class="coordinates-display all-objects-list">
      <div class="coord-title">📋 Tous les Éléments ({{ allObjectsList.length }})</div>
      <div class="objects-scroll-container">
        <div 
          v-for="(obj, index) in allObjectsList" 
          :key="index"
          class="object-item"
          :class="{ 'selected': obj.isSelected }"
        >
          <div class="object-header">
            <span class="object-type">{{ obj.type }}</span>
            <span v-if="obj.isSelected" class="selected-badge">✓</span>
          </div>
          <div class="object-details">
            <div class="object-detail-row">
              <span>X:</span> {{ obj.left.toFixed(1) }}, 
              <span>Y:</span> {{ obj.top.toFixed(1) }}
            </div>
            <div class="object-detail-row">
              <span>W:</span> {{ obj.width.toFixed(1) }}, 
              <span>H:</span> {{ obj.height.toFixed(1) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * SCRIPT SETUP - Configuration du composant Three.js
 * 
 * Ce composant initialise une scène Three.js et gère toutes les interactions
 * avec le modèle 3D, incluant la conversion des coordonnées 3D vers 2D.
 */

import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { setupCanvasTexture, applyTextureToMesh, useCanvasTextureStore } from '../composables/useCanvasTexture'
import { project3DClickToCanvas } from '../composables/use3DTo2DProjection'
import TextureUpdater from './TextureUpdater.vue'

// ===== PROPS (Propriétés reçues du composant parent) =====
const props = defineProps({
  modelUrl: {
    type: [String, File],
    default: null  // URL (String) ou fichier (File) du modèle OBJ à charger
  },
  texture: {
    type: THREE.Texture,
    default: null  // Texture Three.js optionnelle à appliquer
  },
  canvas2D: {
    type: HTMLCanvasElement,
    default: null  // Canvas HTML 2D (Fabric.js) pour la texture partagée
  },
  enableDirectEdit: {
    type: Boolean,
    default: true  // Activer les interactions directes (clic, drag)
  },
  workZoneTop: {
    type: Number,
    default: 0.1  // 10% par défaut - Zone à exclure du haut
  },
  workZoneBottom: {
    type: Number,
    default: 0.1  // 10% par défaut - Zone à exclure du bas
  },
  placementMode: {
    type: Boolean,
    default: false  // Mode placement actif (clic pour placer)
  },
  placementType: {
    type: String,
    default: null  // 'circle', 'rectangle', 'text', 'image'
  },
  dragMode: {
    type: Boolean,
    default: false  // Mode drag actif (glisser pour déplacer)
  },
  selectedObject: {
    type: Object,
    default: null  // Objet sélectionné sur le canvas 2D
  }
})

// ===== ÉVÉNEMENTS ÉMIS =====
const emit = defineEmits([
  'model-loaded',      // Modèle 3D chargé avec succès
  'model-error',       // Erreur lors du chargement
  'texture-ready',     // Texture partagée prête
  '3d-click',          // Clic sur le modèle 3D
  'meshes-extracted',  // Liste des meshes extraits
  '3d-drag',           // Glissement sur le modèle 3D
  '3d-drag-start',     // Début du glissement
  '3d-drag-end',       // Fin du glissement
  '3d-scale',          // Redimensionnement avec molette
  '3d-resize-start',   // Début du redimensionnement par bord
  '3d-resize',         // Redimensionnement en cours par bord
  '3d-resize-end',     // Fin du redimensionnement par bord
  '3d-hover'           // Survol du modèle 3D (pour détecter les bords)
])

// ===== ÉTAT INTERNE =====
let allMeshes = []           // Tous les meshes du modèle
let activeMesh = null        // Mesh actuellement actif pour l'édition
let highlightedMesh = null   // Mesh actuellement mis en évidence

// ===== RÉFÉRENCES VUE =====
const canvasElement = ref(null)      // Référence au canvas HTML
const textureUpdaterRef = ref(null)  // Référence au composant TextureUpdater

// ===== VARIABLES THREE.JS =====
let scene = null          // Scène Three.js
let camera = null         // Caméra perspective
let renderer = null       // Rendu WebGL
let controls = null       // Contrôles OrbitControls (rotation, zoom, pan)
let currentMesh = null    // Modèle 3D actuellement chargé
let animationId = null    // ID de l'animation frame pour cleanup
let handleResize = null   // Handler pour le redimensionnement
let canvasTexture = null  // Texture partagée du canvas 2D (Fabric.js)

// ===== AFFICHAGE DES COORDONNÉES =====
const coordinatesDisplay = ref({
  show: false,
  uvU: 0,
  uvV: 0,
  canvasX: 0,
  canvasY: 0,
  worldPos: null
})

const selectedObjectCoords = ref({
  show: false,
  type: '',
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  scaleX: 1,
  scaleY: 1,
  angle: 0
})

const allObjectsList = ref([])

onMounted(async () => {
  await nextTick()
  initScene()
  
  // Si un canvas 2D est fourni, configurer la texture partagée
  if (props.canvas2D) {
    setupSharedCanvasTexture(props.canvas2D)
  }
  
  if (props.modelUrl) {
    loadModel(props.modelUrl)
  }
})

// Watch pour mettre à jour les coordonnées de l'objet sélectionné
watch(() => props.selectedObject, (newObject) => {
  updateSelectedObjectCoords(newObject)
}, { deep: true })

// Watch pour le canvas 2D - Reconfigurer la texture quand le canvas change
watch(() => props.canvas2D, (newCanvas, oldCanvas) => {
  if (newCanvas && currentMesh) {
    // Vérifier si les dimensions ont changé
    const oldWidth = oldCanvas?.width || 0
    const oldHeight = oldCanvas?.height || 0
    const newWidth = newCanvas.width || 0
    const newHeight = newCanvas.height || 0
    
    if (oldWidth !== newWidth || oldHeight !== newHeight) {
      console.log('📐 Dimensions du canvas changées:', {
        old: { width: oldWidth, height: oldHeight },
        new: { width: newWidth, height: newHeight }
      })
    }
    
    setupSharedCanvasTexture(newCanvas)
  }
}, { deep: true })

onUnmounted(() => {
  cleanup()
})

watch(() => props.modelUrl, (newUrl) => {
  if (newUrl && scene) {
    loadModel(newUrl)
  }
})

watch(() => props.texture, (newTexture) => {
  if (currentMesh && newTexture) {
    applyTexture(newTexture)
  }
})

/**
 * Initialise la scène Three.js
 * 
 * Crée la scène, la caméra, le renderer, les lumières et les contrôles.
 * Configure également la boucle d'animation pour le rendu continu.
 */
const initScene = () => {
  if (!canvasElement.value) return

  // Créer la scène avec un fond sombre
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a1a)

  // Obtenir les dimensions du canvas
  const width = canvasElement.value.clientWidth || 800
  const height = canvasElement.value.clientHeight || 600

  // Créer la caméra perspective
  // FOV: 75°, ratio d'aspect, near: 0.1, far: 1000
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
  camera.position.set(0, 0, 5)  // Position initiale de la caméra

  // Créer le renderer WebGL avec antialiasing
  renderer = new THREE.WebGLRenderer({
    canvas: canvasElement.value,
    antialias: true  // Lissage des bords
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(window.devicePixelRatio)  // Support des écrans haute résolution

  // ===== ÉCLAIRAGE =====
  // Lumière ambiante (éclaire uniformément)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
  scene.add(ambientLight)

  // Lumière directionnelle principale (simule le soleil)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6)
  directionalLight.position.set(5, 5, 5)
  scene.add(directionalLight)

  // Lumière directionnelle secondaire (pour réduire les ombres dures)
  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4)
  directionalLight2.position.set(-5, -5, -5)
  scene.add(directionalLight2)

  // ===== CONTRÔLES =====
  // OrbitControls permet de faire tourner, zoomer et déplacer la caméra
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true        // Amortissement pour un mouvement fluide
  controls.dampingFactor = 0.05        // Facteur d'amortissement
  controls.enableZoom = false          // DÉSACTIVÉ : Pas de zoom pour avoir des coordonnées fixes
  controls.enablePan = false           // DÉSACTIVÉ : Pas de déplacement pour avoir des coordonnées fixes
  controls.enableRotate = true         // ACTIVÉ : Permet de tourner le modèle pour voir sous différents angles

  // ===== BOUCLE D'ANIMATION =====
  // Store pour la synchronisation des mises à jour de texture
  const { render2D, resetTextureUpdate } = useCanvasTextureStore()
  
  /**
   * Boucle d'animation principale
   * 
   * Cette fonction est appelée à chaque frame pour :
   * 1. Mettre à jour la texture si le canvas 2D a changé
   * 2. Mettre à jour les contrôles (amortissement)
   * 3. Rendre la scène
   */
  const animate = () => {
    animationId = requestAnimationFrame(animate)
    
    // Vérifier si le canvas 2D a été modifié et mettre à jour la texture
    if (canvasTexture && render2D.value) {
      canvasTexture.needsUpdate = true  // Forcer la mise à jour de la texture
      resetTextureUpdate()              // Réinitialiser le flag
    }
    
    // Mettre à jour les contrôles (amortissement)
    if (controls) {
      controls.update()
    }
    
    // Rendre la scène
    renderer.render(scene, camera)
  }
  animate()  // Démarrer la boucle d'animation

  // Handle resize
  handleResize = () => {
    if (!canvasElement.value || !renderer || !camera) return
    const newWidth = canvasElement.value.clientWidth
    const newHeight = canvasElement.value.clientHeight
    camera.aspect = newWidth / newHeight
    camera.updateProjectionMatrix()
    renderer.setSize(newWidth, newHeight)
  }
  
  window.addEventListener('resize', handleResize)

  // Initial helper geometry to show when no model is loaded
  addHelperGeometry()
  
  // Setup click handler when ready
  nextTick(() => {
    if (props.enableDirectEdit && renderer && currentMesh) {
      setupClickHandler()
    }
  })
}

// ===== VARIABLES POUR LES INTERACTIONS =====
let raycaster3D = null        // Raycaster pour détecter les clics sur le modèle 3D
let mouse = null              // Coordonnées de la souris normalisées (-1 à 1)
let isDragging3D = false      // Indique si on est en train de glisser
let lastDragPosition = null  // Dernière position du glissement
let isResizing3D = false     // Flag pour indiquer si on est en mode redimensionnement
let resizeStartPosition = null // Position de départ du redimensionnement
let resizeHandleInfo = null   // Informations sur le handle utilisé pour le redimensionnement

/**
 * Configure les handlers pour les interactions (clic, drag, molette)
 * 
 * Utilise un raycaster pour convertir les coordonnées de la souris
 * en coordonnées 3D et détecter les intersections avec le modèle.
 */
const setupClickHandler = () => {
  if (!renderer || !canvasElement.value || raycaster3D) return
  
  // Créer le raycaster pour détecter les intersections
  raycaster3D = new THREE.Raycaster()
  mouse = new THREE.Vector2()  // Coordonnées de la souris normalisées (-1 à 1)
  
  const getCanvasCoords = (event) => {
    if (!currentMesh || !props.canvas2D || !raycaster3D) return null
    
    const rect = canvasElement.value.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    raycaster3D.setFromCamera(mouse, camera)
    
    const targetObject = activeMesh || currentMesh
    const intersects = raycaster3D.intersectObject(targetObject, true)
    
    if (intersects.length > 0) {
      const intersection = intersects[0]
      if (intersection.uv) {
        // IMPORTANT: Utiliser les dimensions de la texture car c'est ce qui est réellement appliqué
        // La texture peut avoir des dimensions différentes du canvas HTML à cause du devicePixelRatio
        let canvasWidth = props.canvas2D.width || 800
        let canvasHeight = props.canvas2D.height || 600
        
        // Si une texture existe, utiliser ses dimensions car c'est ce qui est réellement mappé sur le modèle 3D
        if (canvasTexture && canvasTexture.image) {
          const textureWidth = canvasTexture.image.width
          const textureHeight = canvasTexture.image.height
          
          // Les dimensions de la texture sont les dimensions réelles utilisées pour le mapping UV
          canvasWidth = textureWidth
          canvasHeight = textureHeight
          
          // Log si les dimensions diffèrent pour déboguer
          if (textureWidth !== props.canvas2D.width || textureHeight !== props.canvas2D.height) {
            console.log('📐 Utilisation des dimensions de la texture:', {
              canvasHTML: { width: props.canvas2D.width, height: props.canvas2D.height },
              texture: { width: textureWidth, height: textureHeight },
              devicePixelRatio: window.devicePixelRatio || 1
            })
          }
        }
        
        // Utiliser les dimensions de la texture pour la projection
        // car c'est ce qui correspond au mapping UV réel sur le modèle 3D
        const canvasCoords = project3DClickToCanvas(
          intersection,
          canvasWidth,
          canvasHeight,
          props.workZoneTop,
          props.workZoneBottom
        )
        
        return canvasCoords
      }
    }
    return null
  }
  
  const onMouseDown = (event) => {
    if (!props.dragMode) return
    
    const canvasCoords = getCanvasCoords(event)
    if (canvasCoords !== null) {
      // Émettre l'événement pour que le parent détermine si c'est un resize ou un drag
      // On ne met pas isDragging3D à true tout de suite, on attend la réponse du parent
      emit('3d-drag-start', {
        canvasX: canvasCoords.x,
        canvasY: canvasCoords.y
      })
      
      // On initialise la position mais on n'active pas le drag tout de suite
      lastDragPosition = canvasCoords
      
      // Empêcher les contrôles OrbitControls pendant l'interaction
      if (controls) {
        controls.enabled = false
      }
    }
  }
  
  const onMouseMove = (event) => {
    // Toujours calculer les coordonnées une seule fois
    const canvasCoords = getCanvasCoords(event)
    
    // Calculer aussi les coordonnées 3D pour l'affichage
    if (canvasCoords !== null && currentMesh && props.canvas2D && raycaster3D) {
      const rect = canvasElement.value.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      
      raycaster3D.setFromCamera(mouse, camera)
      const targetObject = activeMesh || currentMesh
      const intersects = raycaster3D.intersectObject(targetObject, true)
      
      if (intersects.length > 0 && intersects[0].uv) {
        const intersection = intersects[0]
        
        // Log de débogage pour vérifier les dimensions
        const canvasWidth = props.canvas2D.width || 800
        const canvasHeight = props.canvas2D.height || 600
        const textureWidth = canvasTexture?.image?.width || canvasWidth
        const textureHeight = canvasTexture?.image?.height || canvasHeight
        
        coordinatesDisplay.value = {
          show: true,
          uvU: intersection.uv.x,
          uvV: intersection.uv.y,
          canvasX: canvasCoords.x,
          canvasY: canvasCoords.y,
          worldPos: {
            x: intersection.point.x,
            y: intersection.point.y,
            z: intersection.point.z
          }
        }
        
        // Log périodique pour déboguer (seulement toutes les 30 frames pour ne pas surcharger)
        if (Math.random() < 0.033) {
          const activeZoneTop = props.workZoneTop
          const activeZoneBottom = 1 - props.workZoneBottom
          const activeZoneHeight = activeZoneBottom - activeZoneTop
          const normalizedV = (intersection.uv.y - activeZoneTop) / activeZoneHeight
          
          console.log('🔍 Debug coordonnées détaillées:', {
            uv: { 
              u: intersection.uv.x.toFixed(4), 
              v: intersection.uv.y.toFixed(4),
              raw: { u: intersection.uv.x, v: intersection.uv.y }
            },
            canvas: { width: canvasWidth, height: canvasHeight },
            texture: { width: textureWidth, height: textureHeight },
            workZones: { 
              top: props.workZoneTop.toFixed(4), 
              bottom: props.workZoneBottom.toFixed(4),
              activeZoneTop: activeZoneTop.toFixed(4),
              activeZoneBottom: activeZoneBottom.toFixed(4),
              activeZoneHeight: activeZoneHeight.toFixed(4)
            },
            normalizedV: normalizedV.toFixed(4),
            coords: { 
              x: canvasCoords.x.toFixed(2), 
              y: canvasCoords.y.toFixed(2),
              calculatedX: (intersection.uv.x * canvasWidth).toFixed(2),
              calculatedY: (normalizedV * canvasHeight).toFixed(2)
            }
          })
        }
      } else {
        coordinatesDisplay.value.show = false
      }
    } else {
      coordinatesDisplay.value.show = false
    }
    
    // Toujours émettre l'événement hover pour détecter les bords et changer le curseur
    if (canvasCoords !== null) {
      emit('3d-hover', {
        canvasX: canvasCoords.x,
        canvasY: canvasCoords.y
      })
    }
    
    if (!props.dragMode) {
      return
    }
    
    // Si on est en train de cliquer/maintenir (isDragging3D ou isResizing3D)
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
      
      lastDragPosition = null
      
      // Remettre le curseur normal (move pour déplacement)
      if (renderer && renderer.domElement) {
        const defaultCursor = props.dragMode ? 'move' : 'default'
        renderer.domElement.style.setProperty('cursor', defaultCursor, 'important')
      }
      
      // Réactiver les contrôles OrbitControls
      if (controls) {
        controls.enabled = true
      }
    }
  }
  
  const onCanvasClick = (event) => {
    // Si on est en train de glisser activement, ne pas gérer les clics simples
    // (pour éviter de sélectionner pendant un drag)
    if (isDragging3D || isResizing3D) return
    
    if (!currentMesh || !props.canvas2D || !raycaster3D) return
    
    const rect = canvasElement.value.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    raycaster3D.setFromCamera(mouse, camera)
    
    // Si un mesh actif est sélectionné, ne tester que celui-ci
    const targetObject = activeMesh || currentMesh
    
    const intersects = raycaster3D.intersectObject(targetObject, true)
    
    if (intersects.length > 0) {
      const intersection = intersects[0]
      
      // Identifier quel mesh a été cliqué
      let clickedMesh = intersection.object
      while (clickedMesh && !(clickedMesh instanceof THREE.Mesh)) {
        clickedMesh = clickedMesh.parent
      }
      
      console.log('🎯 Mesh cliqué:', {
        meshName: clickedMesh?.name || 'Sans nom',
        hasUVs: !!intersection.uv,
        point: intersection.point
      })
      
      // Vérifier si l'intersection a des UVs
      if (intersection.uv) {
        // Convertir le clic 3D en coordonnées canvas 2D avec zone de travail
        // IMPORTANT: Utiliser les dimensions de la texture car c'est ce qui est réellement mappé
        let canvasWidth = props.canvas2D ? props.canvas2D.width : 800
        let canvasHeight = props.canvas2D ? props.canvas2D.height : 600
        
        // Si une texture existe, utiliser ses dimensions (peut différer à cause du devicePixelRatio)
        if (canvasTexture && canvasTexture.image) {
          canvasWidth = canvasTexture.image.width
          canvasHeight = canvasTexture.image.height
        }
        
        // Log pour déboguer
        console.log('🎯 Clic 3D - Calcul des coordonnées:', {
          uv: { u: intersection.uv.x.toFixed(4), v: intersection.uv.y.toFixed(4) },
          canvasHTML: props.canvas2D ? { width: props.canvas2D.width, height: props.canvas2D.height } : null,
          texture: canvasTexture?.image ? {
            width: canvasTexture.image.width,
            height: canvasTexture.image.height
          } : null,
          finalDimensions: { width: canvasWidth, height: canvasHeight },
          workZones: { top: props.workZoneTop.toFixed(4), bottom: props.workZoneBottom.toFixed(4) },
          devicePixelRatio: window.devicePixelRatio || 1
        })
        
        const canvasCoords = project3DClickToCanvas(
          intersection,
          canvasWidth,
          canvasHeight,
          props.workZoneTop,
          props.workZoneBottom
        )
        
        if (canvasCoords) {
          const activeZoneTop = props.workZoneTop
          const activeZoneBottom = 1 - props.workZoneBottom
          const activeZoneHeight = activeZoneBottom - activeZoneTop
          const normalizedV = (intersection.uv.y - activeZoneTop) / activeZoneHeight
          
          console.log('📍 Coordonnées calculées:', {
            x: canvasCoords.x.toFixed(2),
            y: canvasCoords.y.toFixed(2),
            activeZoneTop: activeZoneTop.toFixed(4),
            activeZoneBottom: activeZoneBottom.toFixed(4),
            activeZoneHeight: activeZoneHeight.toFixed(4),
            normalizedV: normalizedV.toFixed(4),
            calculatedX: (intersection.uv.x * canvasWidth).toFixed(2),
            calculatedY: (normalizedV * canvasHeight).toFixed(2)
          })
        }
        
        if (canvasCoords !== null) {
          // Si on est en mode placement, émettre l'événement pour placer l'élément
          if (props.placementMode && props.placementType) {
            emit('3d-click', {
              intersection,
              canvasX: canvasCoords.x,
              canvasY: canvasCoords.y,
              uv: intersection.uv,
              mesh: clickedMesh,
              placementType: props.placementType
            })
          } else {
            // Sinon, comportement normal (peut être utilisé pour d'autres fonctionnalités)
            emit('3d-click', {
              intersection,
              canvasX: canvasCoords.x,
              canvasY: canvasCoords.y,
              uv: intersection.uv,
              mesh: clickedMesh
            })
          }
          
          console.log('✅ Clic sur modèle 3D:', {
            mesh: clickedMesh?.name || 'Sans nom',
            worldPosition: intersection.point,
            uv: intersection.uv,
            canvasCoords: canvasCoords
          })
        } else {
          console.warn('⚠️ Impossible de projeter le clic sur le canvas')
        }
      } else {
        console.warn('⚠️ L\'intersection n\'a pas de coordonnées UV. Génération des UVs...')
        // Essayer de générer les UVs si possible
        if (clickedMesh && clickedMesh.geometry) {
          // Générer les UVs pour tous les meshes du modèle si nécessaire
          if (currentMesh) {
            currentMesh.traverse((mesh) => {
              if (mesh instanceof THREE.Mesh && mesh.geometry && !mesh.geometry.attributes.uv) {
                generateUVs(mesh.geometry)
              }
            })
          }
          
          // Réessayer après génération avec un délai plus long pour la mise à jour
          setTimeout(() => {
            // Forcer la mise à jour de la géométrie
            if (clickedMesh.geometry) {
              clickedMesh.geometry.attributes.uv.needsUpdate = true
            }
            
            const newIntersects = raycaster3D.intersectObject(targetObject, true)
            if (newIntersects.length > 0 && newIntersects[0].uv) {
              // IMPORTANT: Toujours utiliser les dimensions RÉELLES du canvas HTML
              const canvasWidth = props.canvas2D ? props.canvas2D.width : 800
              const canvasHeight = props.canvas2D ? props.canvas2D.height : 600
              
              const newCanvasCoords = project3DClickToCanvas(
                newIntersects[0],
                canvasWidth,
                canvasHeight,
                props.workZoneTop,
                props.workZoneBottom
              )
              if (newCanvasCoords !== null) {
                if (props.placementMode && props.placementType) {
                  emit('3d-click', {
                    intersection: newIntersects[0],
                    canvasX: newCanvasCoords.x,
                    canvasY: newCanvasCoords.y,
                    uv: newIntersects[0].uv,
                    mesh: clickedMesh,
                    placementType: props.placementType
                  })
                } else {
                  emit('3d-click', {
                    intersection: newIntersects[0],
                    canvasX: newCanvasCoords.x,
                    canvasY: newCanvasCoords.y,
                    uv: newIntersects[0].uv,
                    mesh: clickedMesh
                  })
                }
                console.log('✅ UVs générées et clic projeté avec succès')
              }
            } else {
              console.warn('⚠️ Les UVs ont été générées mais le raycaster ne les trouve toujours pas')
            }
          }, 200)
        }
      }
    }
  }
  
  // Handler pour la molette de la souris pour redimensionner les objets
  const onMouseWheel = (event) => {
    // Seulement si un objet est sélectionné (en mode drag ou non)
    // On vérifie si dragMode est actif, ce qui signifie qu'un objet est sélectionné
    if (!props.dragMode) return
    
    // Empêcher le zoom par défaut de Three.js et OrbitControls
    event.preventDefault()
    event.stopPropagation()
    
    // Calculer le facteur de scale basé sur la direction de la molette
    // DeltaY positif = scroll down = réduire, négatif = scroll up = agrandir
    // Utiliser un facteur plus fin pour un contrôle plus précis
    const delta = event.deltaY > 0 ? 1 : -1
    const scaleFactor = 1 + (delta * 0.02) // 2% par incrément pour plus de précision
    
    // Émettre l'événement de redimensionnement
    emit('3d-scale', { scaleFactor })
  }
  
  // Ajouter les event listeners pour le drag
  renderer.domElement.addEventListener('mousedown', onMouseDown)
  renderer.domElement.addEventListener('mousemove', onMouseMove)
  renderer.domElement.addEventListener('mouseup', onMouseUp)
  renderer.domElement.addEventListener('click', onCanvasClick)
  renderer.domElement.addEventListener('wheel', onMouseWheel, { passive: false })
  
  // Nettoyer les event listeners au démontage
  window._threeSceneDragHandlers = {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onCanvasClick,
    onMouseWheel
  }
  
  // Stocker le handler pour cleanup
  window._threeSceneClickHandler = onCanvasClick
  
  console.log('✅ Handler de clic 3D configuré')
}

const addHelperGeometry = () => {
  // Add a simple helper geometry to show when no model is loaded
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({ color: 0x888888, wireframe: true })
  const helperCube = new THREE.Mesh(geometry, material)
  helperCube.position.set(0, 0, 0)
  scene.add(helperCube)
  
  currentMesh = helperCube
}

const loadModel = async (url) => {
  if (!scene) return

  try {
    // Remove existing model
    if (currentMesh) {
      scene.remove(currentMesh)
      if (currentMesh.geometry) currentMesh.geometry.dispose()
      if (currentMesh.material) {
        if (Array.isArray(currentMesh.material)) {
          currentMesh.material.forEach(mat => mat.dispose())
        } else {
          currentMesh.material.dispose()
        }
      }
      currentMesh = null
    }

    // Load OBJ
    const loader = new OBJLoader()
    
    let obj
    if (url instanceof File) {
      const text = await url.text()
      obj = loader.parse(text)
    } else if (typeof url === 'string') {
      if (url.startsWith('data:')) {
        // Data URL
        const text = atob(url.split(',')[1])
        obj = loader.parse(text)
      } else {
        // Regular URL - try to fetch
        try {
          const response = await fetch(url)
          const text = await response.text()
          obj = loader.parse(text)
        } catch (error) {
          console.error('Error fetching OBJ from URL:', error)
          throw new Error('Impossible de charger le fichier OBJ depuis cette URL')
        }
      }
    } else {
      throw new Error('Format de fichier non supporté')
    }

    // Vérifier que le modèle ne contient pas de NaN dans les positions
    let hasInvalidGeometry = false
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const positions = child.geometry.attributes.position
        if (positions) {
          for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i)
            const y = positions.getY(i)
            const z = positions.getZ(i)
            if (isNaN(x) || isNaN(y) || isNaN(z) || !isFinite(x) || !isFinite(y) || !isFinite(z)) {
              hasInvalidGeometry = true
              console.error(`❌ Position invalide trouvée dans le mesh "${child.name || 'sans nom'}":`, { x, y, z, index: i })
            }
          }
        }
      }
    })
    
    if (hasInvalidGeometry) {
      throw new Error('Le modèle contient des coordonnées invalides (NaN ou Infinity). Vérifiez le fichier OBJ.')
    }

    // Calculate bounding box and center the model
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    
    // Vérifier que la bounding box est valide
    if (isNaN(size.x) || isNaN(size.y) || isNaN(size.z) || 
        isNaN(center.x) || isNaN(center.y) || isNaN(center.z)) {
      throw new Error('Le modèle contient des coordonnées invalides (NaN). Vérifiez le fichier OBJ.')
    }
    
    const maxDim = Math.max(size.x, size.y, size.z)
    
    // Vérifier que maxDim est valide
    if (maxDim <= 0 || !isFinite(maxDim)) {
      throw new Error('Le modèle a une taille invalide. Impossible de le charger.')
    }

    // Scale to fit in view - Réduire la taille pour mieux correspondre au canvas 2D
    // Facteur réduit de 3 à 2.2 pour diminuer la taille du gobelet
    const scale = 2.2 / maxDim
    obj.scale.multiplyScalar(scale)

    // Center the model
    obj.position.sub(center.multiplyScalar(scale))

    // Track if we generated UVs to reapply texture later
    let generatedUVs = false
    
    // Apply materials to all meshes and ensure UVs exist
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Ensure geometry has UVs - critical for textures!
        if (child.geometry && !child.geometry.attributes.uv) {
          console.log('📐 Génération des UVs pour le mesh:', child.name || 'Mesh sans nom')
          generateUVs(child.geometry)
          generatedUVs = true
        }
        
        if (!child.material) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            map: null // Will be set when texture is applied
          })
        } else if (!child.material.map) {
          // Ensure material can accept textures
          child.material.map = null
        }
      }
    })
    
    console.log('Modèle chargé avec matériaux et UVs configurés', {
      generatedUVs: generatedUVs
    })

    scene.add(obj)
    currentMesh = obj

    // Adjust camera - position fixe pour avoir des coordonnées stables
    // Distance ajustée pour correspondre à la nouvelle taille du modèle
    const scaledMaxDim = maxDim * scale
    const distance = scaledMaxDim * 0.7  // Distance augmentée pour voir le modèle plus petit et mieux aligné
    camera.position.set(distance, distance, distance)
    camera.lookAt(0, 0, 0)
    
    if (controls) {
      controls.target.set(0, 0, 0)
      // S'assurer que les contrôles restent configurés après le chargement
      controls.enableZoom = false      // Pas de zoom pour coordonnées fixes
      controls.enablePan = false       // Pas de déplacement pour coordonnées fixes
      controls.enableRotate = true    // Rotation activée pour voir le modèle sous différents angles
      controls.update()
    }

    // Extraire tous les meshes
    allMeshes = []
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        allMeshes.push(child)
      }
    })
    
    console.log(`✅ ${allMeshes.length} pièce(s) trouvée(s) dans le modèle`)
    
    emit('model-loaded', obj)
    emit('meshes-extracted', allMeshes)

    // Si un canvas 2D est fourni, configurer la texture partagée
    // Attendre un peu pour s'assurer que tout est prêt
    await nextTick()
    
    if (props.canvas2D) {
      setupSharedCanvasTexture(props.canvas2D)
    } else if (props.texture) {
      // Sinon, utiliser la texture fournie en prop
      applyTexture(props.texture)
    }
  } catch (error) {
    console.error('Error loading model:', error)
    emit('model-error', error)
  }
}

/**
 * Configure la texture partagée à partir du canvas 2D HTML
 */
const setupSharedCanvasTexture = (htmlCanvas) => {
  if (!htmlCanvas || !currentMesh) {
    console.warn('Canvas HTML ou mesh manquant pour la texture partagée')
    return
  }

  try {
    // Récupérer tous les matériaux du mesh
    const materials = []
    currentMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Assurer les UVs
        if (child.geometry && !child.geometry.attributes.uv) {
          generateUVs(child.geometry)
        }
        
        if (Array.isArray(child.material)) {
          materials.push(...child.material)
        } else if (child.material) {
          materials.push(child.material)
        }
      }
    })

    // Si une texture existe déjà, la supprimer avant d'en créer une nouvelle
    if (canvasTexture) {
      canvasTexture.dispose()
      canvasTexture = null
    }
    
    // Créer et configurer la texture
    canvasTexture = setupCanvasTexture(htmlCanvas, materials)
    
    if (!canvasTexture) {
      console.error('❌ Échec de la création de la texture')
      return
    }
    
    // Appliquer sur tous les meshes
    applyTextureToMesh(currentMesh, canvasTexture)
    
    emit('texture-ready', canvasTexture)
    
    console.log('✅ Texture partagée configurée avec succès', {
      canvasWidth: htmlCanvas.width,
      canvasHeight: htmlCanvas.height,
      canvasOffsetWidth: htmlCanvas.offsetWidth,
      canvasOffsetHeight: htmlCanvas.offsetHeight,
      texture: !!canvasTexture,
      textureImage: !!canvasTexture.image,
      textureWidth: canvasTexture?.image?.width,
      textureHeight: canvasTexture?.image?.height,
      workZoneTop: props.workZoneTop,
      workZoneBottom: props.workZoneBottom,
      materialCount: materials.length
    })
  } catch (error) {
    console.error('Erreur lors de la configuration de la texture partagée:', error)
  }
}

/**
 * Génère des coordonnées UV pour une géométrie sans UVs
 * 
 * Les coordonnées UV sont nécessaires pour mapper une texture 2D sur une surface 3D.
 * Cette fonction choisit automatiquement la meilleure méthode de projection selon
 * la forme de l'objet :
 * - Cylindrique : pour objets verticaux (bocal, t-shirt, etc.)
 * - Plane : pour objets plats
 * - Sphérique : pour objets arrondis
 * 
 * @param {THREE.BufferGeometry} geometry - La géométrie à traiter
 */
const generateUVs = (geometry) => {
  const positions = geometry.attributes.position
  const uvs = []
  
  if (!positions || positions.count === 0) {
    console.warn('⚠️ Géométrie sans positions valides')
    return
  }
  
  // Vérifier que les positions ne contiennent pas de NaN
  let hasInvalidPositions = false
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const y = positions.getY(i)
    const z = positions.getZ(i)
    if (isNaN(x) || isNaN(y) || isNaN(z) || !isFinite(x) || !isFinite(y) || !isFinite(z)) {
      hasInvalidPositions = true
      console.warn(`⚠️ Position invalide à l'index ${i}:`, { x, y, z })
      break
    }
  }
  
  if (hasInvalidPositions) {
    console.error('❌ La géométrie contient des positions invalides (NaN ou Infinity). Impossible de générer les UVs.')
    return
  }
  
  // Calculer la bounding box pour normaliser les coordonnées
  const box = new THREE.Box3().setFromBufferAttribute(positions)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  
  // Vérifier que la taille est valide (non nulle)
  if (size.x === 0 && size.y === 0 && size.z === 0) {
    console.warn('⚠️ Géométrie avec taille nulle, utilisation de valeurs par défaut')
    // Utiliser une taille minimale pour éviter les divisions par zéro
    size.x = size.x || 1
    size.y = size.y || 1
    size.z = size.z || 1
  }
  
  // Vérifier que les valeurs sont valides
  if (isNaN(size.x) || isNaN(size.y) || isNaN(size.z) || 
      isNaN(center.x) || isNaN(center.y) || isNaN(center.z)) {
    console.error('❌ Bounding box invalide (NaN). Impossible de générer les UVs.')
    return
  }
  
  // Déterminer la meilleure projection selon la forme de l'objet
  const isCylindrical = size.y > size.x * 0.8 && size.y > size.z * 0.8  // Forme verticale
  const isWide = size.x > size.y * 1.5 || size.z > size.y * 1.5        // Forme plate
  
  if (isCylindrical) {
    // ===== PROJECTION CYLINDRIQUE =====
    // Pour objets verticaux (t-shirt, bocal, etc.)
    // U = angle autour de l'axe Y (0-1)
    // V = hauteur (0-1)
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) - center.x
      const y = positions.getY(i) - center.y
      const z = positions.getZ(i) - center.z
      
      // Angle autour de l'axe Y (azimuth) - inversé pour corriger l'inversion horizontale
      const angle = Math.atan2(z, x)
      let u = 1 - ((angle / (2 * Math.PI)) + 0.5)
      
      // Hauteur normalisée selon Y - inversé pour corriger l'inversion verticale
      // Protection contre division par zéro
      let v = size.y > 0 ? 1 - ((y + size.y / 2) / size.y) : 0.5
      
      // Vérifier et corriger les NaN
      if (isNaN(u) || !isFinite(u)) u = 0.5
      if (isNaN(v) || !isFinite(v)) v = 0.5
      
      uvs.push(Math.max(0, Math.min(1, u)))
      uvs.push(Math.max(0, Math.min(1, v)))
    }
  } else if (isWide) {
    // ===== PROJECTION PLANE =====
    // Pour objets plats (plan XZ)
    // U = position X (0-1)
    // V = position Z (0-1)
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) - center.x
      const z = positions.getZ(i) - center.z
      
      // Protection contre division par zéro
      let u = size.x > 0 ? 1 - ((x + size.x / 2) / size.x) : 0.5
      let v = size.z > 0 ? 1 - ((z + size.z / 2) / size.z) : 0.5  // Inversé pour corriger l'inversion verticale
      
      // Vérifier et corriger les NaN
      if (isNaN(u) || !isFinite(u)) u = 0.5
      if (isNaN(v) || !isFinite(v)) v = 0.5
      
      uvs.push(Math.max(0, Math.min(1, u)))
      uvs.push(Math.max(0, Math.min(1, v)))
    }
  } else {
    // ===== PROJECTION SPHÉRIQUE =====
    // Pour objets arrondis
    // Utilise les coordonnées sphériques pour mapper la texture
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) - center.x
      const y = positions.getY(i) - center.y
      const z = positions.getZ(i) - center.z
      
      // Normaliser pour obtenir un vecteur unitaire
      const length = Math.sqrt(x * x + y * y + z * z)
      if (length > 0.0001) { // Utiliser un seuil minimal au lieu de 0
        const nx = x / length
        const ny = y / length
        const nz = z / length
        
        // Coordonnées UV sphériques - inversé pour corriger l'inversion
        let u = 1 - ((Math.atan2(nz, nx) / (2 * Math.PI)) + 0.5)
        let v = 1 - ((Math.asin(ny) / Math.PI) + 0.5)
        
        // Vérifier et corriger les NaN
        if (isNaN(u) || !isFinite(u)) u = 0.5
        if (isNaN(v) || !isFinite(v)) v = 0.5
        
        uvs.push(Math.max(0, Math.min(1, u)))
        uvs.push(Math.max(0, Math.min(1, v)))
      } else {
        // Point à l'origine : coordonnées par défaut
        uvs.push(0.5, 0.5)
      }
    }
  }
  
  // Vérifier que tous les UVs sont valides avant de les ajouter
  let hasInvalidUVs = false
  for (let i = 0; i < uvs.length; i++) {
    if (isNaN(uvs[i]) || !isFinite(uvs[i])) {
      hasInvalidUVs = true
      console.warn(`⚠️ UV invalide à l'index ${i}:`, uvs[i])
      // Corriger les valeurs invalides
      uvs[i] = 0.5
    }
  }
  
  if (hasInvalidUVs) {
    console.warn('⚠️ Certains UVs étaient invalides et ont été corrigés')
  }
  
  // Vérifier que le nombre d'UVs correspond au nombre de vertices
  if (uvs.length !== positions.count * 2) {
    console.error(`❌ Nombre d'UVs incorrect: ${uvs.length} attendu ${positions.count * 2}`)
    return
  }
  
  // Ajouter les UVs à la géométrie
  try {
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    // Marquer l'attribut comme mis à jour
    geometry.attributes.uv.needsUpdate = true
    console.log('✅ UVs générées avec projection adaptée', {
      type: isCylindrical ? 'cylindrique' : isWide ? 'plane' : 'sphérique',
      vertexCount: positions.count,
      uvCount: uvs.length / 2
    })
  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout des UVs à la géométrie:', error)
  }
}

const applyTexture = (texture) => {
  if (!currentMesh) {
    console.warn('Aucun mesh pour appliquer la texture')
    return
  }

  if (!texture || !texture.image) {
    console.warn('Texture invalide', texture)
    return
  }

  texture.flipY = false
  texture.needsUpdate = true
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  let meshCount = 0
  currentMesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount++
      
      // Ensure the geometry has UVs - CRITICAL!
      if (child.geometry && !child.geometry.attributes.uv) {
        generateUVs(child.geometry)
      }
      
      // Apply texture to material
      if (Array.isArray(child.material)) {
        child.material.forEach((mat, idx) => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhongMaterial) {
            mat.map = texture
            mat.needsUpdate = true
          } else {
            child.material[idx] = new THREE.MeshStandardMaterial({
              map: texture,
              side: THREE.DoubleSide
            })
          }
        })
      } else {
        if (child.material instanceof THREE.MeshStandardMaterial || child.material instanceof THREE.MeshPhongMaterial) {
          child.material.map = texture
          child.material.needsUpdate = true
        } else {
          child.material = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide
          })
        }
      }
    }
  })
  
  console.log(`Texture appliquée sur ${meshCount} mesh(es)`)
}

const cleanup = () => {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }

  // Dispose de la texture canvas
  if (canvasTexture) {
    canvasTexture.dispose()
    canvasTexture = null
  }

  if (currentMesh) {
    if (scene) scene.remove(currentMesh)
    if (currentMesh.geometry) currentMesh.geometry.dispose()
    if (currentMesh.material) {
      if (Array.isArray(currentMesh.material)) {
        currentMesh.material.forEach(mat => mat.dispose())
      } else {
        currentMesh.material.dispose()
      }
    }
    currentMesh = null
  }

  if (controls) {
    controls.dispose()
    controls = null
  }

  if (renderer) {
    renderer.dispose()
    renderer = null
  }

  if (handleResize) {
    window.removeEventListener('resize', handleResize)
    handleResize = null
  }

  // Remove click handler
  if (window._threeSceneClickHandler && renderer) {
    renderer.domElement.removeEventListener('click', window._threeSceneClickHandler)
    delete window._threeSceneClickHandler
  }
  
  // Remove wheel handler
  if (window._threeSceneDragHandlers && window._threeSceneDragHandlers.onMouseWheel && renderer) {
    renderer.domElement.removeEventListener('wheel', window._threeSceneDragHandlers.onMouseWheel)
  }
  
  raycaster3D = null

  scene = null
  camera = null
}

const highlightMesh = (mesh, isHighlighting = true) => {
  if (!mesh) return
  
  // Réinitialiser la précédente mise en évidence
  if (highlightedMesh && highlightedMesh !== mesh) {
    resetMeshHighlight(highlightedMesh)
  }
  
  if (isHighlighting) {
    // Sauvegarder le matériau original
    if (!mesh.userData.originalMaterial) {
      mesh.userData.originalMaterial = mesh.material.clone()
    }
    
    // Appliquer un matériau de highlight
    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0x444400,
      side: THREE.DoubleSide,
      wireframe: false
    })
    
    mesh.material = highlightMaterial
    highlightedMesh = mesh
  } else {
    resetMeshHighlight(mesh)
    highlightedMesh = null
  }
}

const resetMeshHighlight = (mesh) => {
  if (mesh.userData.originalMaterial) {
    mesh.material = mesh.userData.originalMaterial
    delete mesh.userData.originalMaterial
  }
}

const highlightAllMeshes = () => {
  allMeshes.forEach(mesh => {
    resetMeshHighlight(mesh)
  })
  highlightedMesh = null
}

const setActiveMesh = (mesh) => {
  activeMesh = mesh
  // Lorsqu'un mesh est actif, on peut limiter les clics à ce mesh seulement
  console.log('Mesh actif défini:', mesh.name || 'Mesh sans nom')
}

// Méthode pour mettre à jour la zone de travail
const updateWorkZone = (top, bottom) => {
  console.log('Zone de travail mise à jour dans ThreeScene:', {
    top: (top * 100).toFixed(1) + '%',
    bottom: (bottom * 100).toFixed(1) + '%',
    active: ((1 - top - bottom) * 100).toFixed(1) + '%'
  })
  // Les props sont réactives, donc les changements seront automatiquement pris en compte
}

// Méthode pour mettre à jour le mode placement
const setPlacementMode = (active, type) => {
  if (renderer && renderer.domElement) {
    if (active) {
      renderer.domElement.style.cursor = 'crosshair'
      console.log('🎯 Mode placement activé:', type)
    } else {
      renderer.domElement.style.cursor = 'default'
      console.log('Mode placement désactivé')
    }
  }
}

// Méthode pour mettre à jour le mode drag
const setDragMode = (active) => {
  if (renderer && renderer.domElement) {
    if (active) {
      renderer.domElement.style.setProperty('cursor', 'move', 'important')
      console.log('🎯 Mode drag activé - Sélectionnez un objet sur le canvas 2D puis glissez-le sur le modèle 3D')
    } else {
      renderer.domElement.style.setProperty('cursor', 'default', 'important')
      console.log('Mode drag désactivé')
    }
  }
}

/**
 * Configure le mode redimensionnement dans ThreeScene
 * 
 * @param {boolean} resizing - true si on est en mode redimensionnement
 * @param {Object} startPos - Position de départ {x, y}
 * @param {Object} handleInfo - Informations sur le handle
 */
const setResizing = (resizing, startPos, handleInfo) => {
  isResizing3D = resizing
  if (resizing) {
    resizeStartPosition = startPos
    resizeHandleInfo = handleInfo
    // Activer aussi isDragging3D pour que onMouseMove fonctionne
    isDragging3D = true
    // Changer le curseur
    if (renderer && renderer.domElement) {
      renderer.domElement.style.setProperty('cursor', 'move', 'important')
    }
  } else {
    resizeStartPosition = null
    resizeHandleInfo = null
  }
}

/**
 * Configure l'état du drag dans ThreeScene
 * 
 * @param {boolean} dragging - true si on est en mode drag
 */
const setDragState = (dragging) => {
  isDragging3D = dragging
  if (dragging) {
    // Changer le curseur
    if (renderer && renderer.domElement) {
      renderer.domElement.style.setProperty('cursor', 'move', 'important')
    }
  }
}

/**
 * Met à jour les coordonnées de l'objet sélectionné pour l'affichage
 * 
 * @param {fabric.Object|null} obj - L'objet sélectionné ou null
 */
const updateSelectedObjectCoords = (obj) => {
  if (!obj) {
    selectedObjectCoords.value.show = false
    return
  }
  
  // Calculer les dimensions réelles avec le scale
  const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
  const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
  
  selectedObjectCoords.value = {
    show: true,
    type: obj.type || 'unknown',
    left: obj.left || 0,
    top: obj.top || 0,
    width: objWidth,
    height: objHeight,
    scaleX: obj.scaleX || 1,
    scaleY: obj.scaleY || 1,
    angle: obj.angle || 0
  }
}

/**
 * Met à jour la liste de tous les objets du canvas
 */
const updateAllObjectsList = () => {
  if (!props.canvas2D) {
    allObjectsList.value = []
    return
  }
  
  // Récupérer le canvas Fabric.js depuis le canvas HTML
  // On doit accéder au canvas via DesignStudio
  // Pour l'instant, on va utiliser une approche différente
  // On va écouter les événements depuis DesignStudio
  allObjectsList.value = []
}

/**
 * Met à jour la liste de tous les objets depuis le canvas Fabric.js
 * Cette fonction sera appelée depuis DesignStudio
 */
const updateObjectsListFromCanvas = (objects) => {
  if (!objects || !Array.isArray(objects)) {
    allObjectsList.value = []
    return
  }
  
  // Identifier l'objet sélectionné pour le marquer
  const selectedObj = props.selectedObject
  
  allObjectsList.value = objects
    .filter(obj => !obj.userData?.isWorkZoneIndicator)
    .map((obj, index) => {
      const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
      const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
      
      // Vérifier si cet objet est sélectionné
      const isSelected = selectedObj && (
        (obj.id && selectedObj.id && obj.id === selectedObj.id) ||
        obj === selectedObj
      )
      
      return {
        id: obj.id || `obj-${index}`,
        type: obj.type || 'unknown',
        left: obj.left || 0,
        top: obj.top || 0,
        width: objWidth,
        height: objHeight,
        isSelected: isSelected
      }
    })
}

// Expose methods for parent component
defineExpose({
  getCurrentMesh: () => currentMesh,
  applyTexture,
  getCanvasTexture: () => canvasTexture,
  setupSharedCanvasTexture: (canvas) => {
    if (canvas && currentMesh) {
      setupSharedCanvasTexture(canvas)
    }
  },
  highlightMesh,
  highlightAllMeshes,
  setActiveMesh,
  getAllMeshes: () => allMeshes,
  updateWorkZone,
  setPlacementMode,
  setDragMode,
  setResizing,
  setDragState,
  updateSelectedObjectCoords,
  updateObjectsListFromCanvas,
  renderer,
  emit
})
</script>

<style scoped>
.three-scene-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.three-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.coordinates-display {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  z-index: 1000;
  min-width: 250px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
}

.selected-object-coords {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(79, 70, 229, 0.9);
  border: 2px solid #4f46e5;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  z-index: 1000;
  min-width: 250px;
  height: 125px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.selected-object-coords .coord-content {
  flex: 1;
  overflow-y: auto;
}

.all-objects-list {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(16, 185, 129, 0.9);
  border: 2px solid #10b981;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  z-index: 1000;
  min-width: 280px;
  max-width: 320px;
  height: 100px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
}

.all-objects-list .coord-title {
  color: #fff;
  flex-shrink: 0;
}

.objects-scroll-container {
  flex: 1;
  overflow-y: auto;
  margin-top: 8px;
  padding-right: 4px;
}

.objects-scroll-container::-webkit-scrollbar {
  width: 6px;
}

.objects-scroll-container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.objects-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.objects-scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

.object-item {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 6px;
  border-left: 3px solid transparent;
  transition: all 0.2s;
}

.object-item.selected {
  background: rgba(255, 255, 255, 0.2);
  border-left-color: #fff;
}

.object-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.object-type {
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.selected-badge {
  background: #fff;
  color: #10b981;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
}

.object-details {
  font-size: 11px;
  opacity: 0.9;
}

.object-detail-row {
  margin: 2px 0;
}

.object-detail-row span {
  font-weight: 600;
  margin-right: 4px;
}

.coord-title {
  font-weight: bold;
  margin-bottom: 8px;
  color: #4f46e5;
  font-size: 13px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 6px;
}

.selected-object-coords .coord-title {
  color: #fff;
}

.coord-section {
  margin: 6px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.coord-label {
  font-size: 11px;
  color: #a0a0a0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.selected-object-coords .coord-label {
  color: rgba(255, 255, 255, 0.7);
}

.coord-value {
  font-size: 12px;
  color: #fff;
  font-weight: 500;
}
</style>

