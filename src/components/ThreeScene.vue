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
    <div v-if="coordinatesDisplay.show" 
         :class="['coordinates-display', { 'on-seam': isOnSeam }]">
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
    
    <!-- Liste des meshes de l'objet -->
    <!-- <div v-if="meshesList.length > 0" class="coordinates-display meshes-list">
      <div class="coord-title">🔷 Meshes de l'Objet ({{ meshesList.length }})</div>
      <div class="meshes-scroll-container">
        <div 
          v-for="(meshInfo, index) in meshesList" 
          :key="index"
          class="mesh-item"
          :class="{ 'active': activeMeshIndex === index }"
          @click="selectMesh(index)"
        >
          <div class="mesh-header">
            <span class="mesh-name">{{ meshInfo.name || `Mesh ${index + 1}` }}</span>
            <span v-if="activeMeshIndex === index" class="active-badge">✓</span>
          </div>
          <div class="mesh-details">
            <div class="mesh-detail-row">
              <span>Sommets:</span> {{ meshInfo.vertexCount }}
            </div>
            <div class="mesh-detail-row">
              <span>UVs:</span> {{ meshInfo.hasUVs ? 'Oui' : 'Non' }}
            </div>
          </div>
        </div>
      </div>
    </div> -->
    
    <!-- Liste des éléments du canvas -->
    <div v-if="allObjectsList.length > 0" class="coordinates-display meshes-list">
      <div class="coord-title">📦 Éléments du Canvas ({{ allObjectsList.length }})</div>
      <div class="meshes-scroll-container">
        <div 
          v-for="(obj, index) in allObjectsList" 
          :key="obj.id || index"
          class="mesh-item canvas-object-item"
          :class="{ 'active': obj.isSelected }"
        >
          <div class="mesh-header">
            <span class="mesh-name">{{ obj.type || 'unknown' }}</span>
            <span v-if="obj.isSelected" class="active-badge">✓</span>
          </div>
          <div class="mesh-details">
            <div class="mesh-detail-row">
              <span>X:</span> {{ obj.left.toFixed(1) }}
            </div>
            <div class="mesh-detail-row">
              <span>Y:</span> {{ obj.top.toFixed(1) }}
            </div>
            <div class="mesh-detail-row">
              <span>L:</span> {{ obj.width.toFixed(1) }}
            </div>
            <div class="mesh-detail-row">
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

import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { setupCanvasTexture, applyTextureToMesh, useCanvasTextureStore } from '../composables/useCanvasTexture'
import { project3DClickToCanvas } from '../composables/use3DTo2DProjection'
import TextureUpdater from './TextureUpdater.vue'
import { log } from 'three'

// ===== PROPS (Propriétés reçues du composant parent) =====
const props = defineProps({
  modelUrl: {
    type: [String, File],
    default: null  // URL (String) ou fichier (File) du modèle 3D à charger (.obj, .glb, .gltf)
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
  '3d-click-outside',  // Clic en dehors du modèle 3D (pour désélectionner)
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

// ============================================================================
// SECTION 1 : ÉTAT INTERNE & VARIABLES
// ============================================================================

// ----- Meshes & Modèles -----
let allMeshes = []           // Tous les meshes du modèle
let activeMesh = null        // Mesh actuellement actif pour l'édition
let highlightedMesh = null   // Mesh actuellement mis en évidence
let currentMesh = null       // Modèle 3D actuellement chargé

// ----- Textures & Environnement -----
let environmentMap = null    // Texture d'environnement pour les réflexions
let canvasTexture = null     // Texture partagée du canvas 2D (Fabric.js)

// ----- Références Vue -----
const canvasElement = ref(null)      // Référence au canvas HTML
const textureUpdaterRef = ref(null)  // Référence au composant TextureUpdater

// ----- Variables Three.js -----
let scene = null          // Scène Three.js
let camera = null         // Caméra perspective
let renderer = null       // Rendu WebGL
let controls = null       // Contrôles OrbitControls (rotation, zoom, pan)
let animationId = null   // ID de l'animation frame pour cleanup
let handleResize = null   // Handler pour le redimensionnement

// ============================================================================
// SECTION 2 : AFFICHAGE & UI (Coordonnées et Informations)
// ============================================================================

// ----- Coordonnées du Curseur -----
const coordinatesDisplay = ref({
  show: false,
  uvU: 0,
  uvV: 0,
  canvasX: 0,
  canvasY: 0,
  worldPos: null,
  isOnSeam: false // Flag pour indiquer si le curseur est sur la couture
})

// Computed pour vérifier si on est sur la couture
const isOnSeam = computed(() => {
  return coordinatesDisplay.value.isOnSeam || false
})

// ----- Coordonnées de l'Objet Sélectionné -----
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

// ----- Liste de Tous les Objets -----
const allObjectsList = ref([])

// ----- Liste des Meshes -----
const meshesList = ref([])
const activeMeshIndex = ref(-1)

// ============================================================================
// SECTION 3 : INITIALISATION & CONFIGURATION
// ============================================================================

/**
 * Charge une texture d'environnement équirectangulaire
 * Utilise une texture générée par défaut si aucune URL n'est fournie
 * 
 * @param {string|null} url - URL de la texture d'environnement (optionnel)
 */
const loadEnvironmentMap = async (url = null) => {
  const loader = new THREE.TextureLoader()
  
  try {
    if (url) {
      // Charger depuis une URL
      environmentMap = await new Promise((resolve, reject) => {
        loader.load(
          url,
          (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping
            texture.needsUpdate = true
            resolve(texture)
          },
          undefined,
          (error) => reject(error)
        )
      })
    } else {
      // Créer une texture d'environnement simple (dégradé bleu-blanc)
      const envCanvas = document.createElement('canvas')
      envCanvas.width = 2048 // Format 2:1 pour équirectangulaire
      envCanvas.height = 1024
      const ctx = envCanvas.getContext('2d')
      
      // Créer un dégradé simple (ciel bleu)
      const gradient = ctx.createLinearGradient(0, 0, 0, envCanvas.height)
      gradient.addColorStop(0, '#87CEEB') // Bleu ciel en haut
      gradient.addColorStop(0.5, '#E0F6FF') // Bleu clair au milieu
      gradient.addColorStop(1, '#FFFFFF') // Blanc en bas
      
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, envCanvas.width, envCanvas.height)
      
      // Ajouter quelques nuages simples
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      for (let i = 0; i < 5; i++) {
        const x = (envCanvas.width / 5) * i + 200
        const y = 200 + Math.sin(i) * 50
        ctx.beginPath()
        ctx.arc(x, y, 150, 0, Math.PI * 2)
        ctx.fill()
      }
      
      environmentMap = new THREE.CanvasTexture(envCanvas)
      environmentMap.mapping = THREE.EquirectangularReflectionMapping
      environmentMap.needsUpdate = true
    }
    
    // Appliquer la texture d'environnement à tous les meshes existants
    if (currentMesh) {
      currentMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.envMap = environmentMap
                mat.needsUpdate = true
              }
            })
          } else {
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.envMap = environmentMap
              child.material.needsUpdate = true
            }
          }
        }
      })
    }
    
  } catch (error) {
  }
}

onMounted(async () => {
  await nextTick()
  initScene()
  
  // Charger la texture d'environnement
  await loadEnvironmentMap()
  
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

  // Créer la scène avec un fond beige clair
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf4e8d8)

  // Obtenir les dimensions du canvas
  const width = canvasElement.value.clientWidth || 800
  const height = canvasElement.value.clientHeight || 600

  // Créer la caméra perspective
  // FOV: 75°, ratio d'aspect, near: 0.1, far: 1000
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
  camera.position.set(0, 0, 3.5)  // Position initiale de la caméra (zoomé)

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
  // Désactiver la rotation verticale (autour de l'axe X)
  // minPolarAngle et maxPolarAngle fixés à la même valeur = pas de rotation verticale
  const fixedPolarAngle = Math.PI / 2  // Angle horizontal (90 degrés)
  controls.minPolarAngle = fixedPolarAngle
  controls.maxPolarAngle = fixedPolarAngle

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
// ============================================================================
// SECTION 4 : INTERACTIONS 3D (Clic, Drag, Resize)
// ============================================================================

// ----- Variables d'État pour les Interactions -----
let raycaster3D = null        // Raycaster pour détecter les clics sur le modèle 3D
let mouse = null              // Coordonnées de la souris normalisées (-1 à 1)
let isDragging3D = false      // Indique si on est en train de glisser
let lastDragPosition = null   // Dernière position du glissement
let isResizing3D = false      // Flag pour indiquer si on est en mode redimensionnement
let resizeStartPosition = null // Position de départ du redimensionnement
let resizeHandleInfo = null    // Informations sur le handle utilisé pour le redimensionnement

/**
 * Configure les handlers pour les interactions (clic, drag, molette)
 * 
 * Utilise un raycaster pour convertir les coordonnées de la souris
 * en coordonnées 3D et détecter les intersections avec le modèle.
 * 
 * Cette fonction configure :
 * - Les handlers de clic (onCanvasClick)
 * - Les handlers de mouvement (onMouseMove)
 * - Les handlers de molette (onMouseWheel)
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
        // IMPORTANT: Toujours utiliser les dimensions LOGIQUES du canvas (props.canvas2D.width/height)
        // et non les dimensions de la texture, car les coordonnées UV sont normalisées (0-1)
        // et doivent être converties en pixels selon les dimensions logiques du canvas Fabric.js
        // Les dimensions de la texture peuvent être différentes à cause du devicePixelRatio,
        // mais cela n'affecte pas le mapping UV qui est toujours basé sur les dimensions logiques
        const canvasWidth = props.canvas2D.width || 800
        const canvasHeight = props.canvas2D.height || 600
        
        // Utiliser les dimensions logiques du canvas pour la projection
        // Les coordonnées UV (0-1) sont converties en pixels selon ces dimensions
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
        
        // Détecter si on est sur la couture (U proche de 0 ou 1)
        const uvU = intersection.uv.x
        const seamThreshold = 0.01 // Tolérance de 1% pour détecter la couture
        const isOnSeamValue = uvU < seamThreshold || uvU > (1 - seamThreshold)
        
        coordinatesDisplay.value = {
          show: true,
          uvU: uvU,
          uvV: intersection.uv.y,
          canvasX: canvasCoords.x,
          canvasY: canvasCoords.y,
          isOnSeam: isOnSeamValue, // Flag pour indiquer si on est sur la couture
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
      
      
      // Vérifier si l'intersection a des UVs
      if (intersection.uv) {
        // Convertir le clic 3D en coordonnées canvas 2D avec zone de travail
        // IMPORTANT: Toujours utiliser les dimensions LOGIQUES du canvas
        // Les coordonnées UV sont normalisées (0-1) et doivent être converties
        // selon les dimensions logiques du canvas Fabric.js, pas les dimensions de la texture
        const canvasWidth = props.canvas2D ? props.canvas2D.width : 800
        const canvasHeight = props.canvas2D ? props.canvas2D.height : 600
        
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
          
        } else {
        }
      } else {
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
              }
            } else {
            }
          }, 200)
        }
      }
    } else {
      // Clic en dehors du modèle 3D - désélectionner l'objet
      emit('3d-click-outside', {})
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

/**
 * Détermine le type de fichier à partir de l'URL ou du fichier
 */
const getFileType = (url) => {
  if (url instanceof File) {
    const fileName = url.name.toLowerCase()
    if (fileName.endsWith('.glb') || fileName.endsWith('.gltf')) {
      return 'gltf'
    } else if (fileName.endsWith('.obj')) {
      return 'obj'
    }
  } else if (typeof url === 'string') {
    const urlLower = url.toLowerCase()
    if (urlLower.endsWith('.glb') || urlLower.endsWith('.gltf')) {
      return 'gltf'
    } else if (urlLower.endsWith('.obj')) {
      return 'obj'
    }
  }
  // Par défaut, essayer OBJ pour la compatibilité
  return 'obj'
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

    // Déterminer le type de fichier
    const fileType = getFileType(url)
    let obj
    
    if (fileType === 'gltf') {
      // Load GLB/GLTF
      const gltfLoader = new GLTFLoader()
      
      // Configurer DRACOLoader pour la compression de mesh (optionnel)
      // Si le fichier utilise DRACO, il sera décompressé automatiquement
      const dracoLoader = new DRACOLoader()
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
      gltfLoader.setDRACOLoader(dracoLoader)
      
      if (url instanceof File) {
        // Charger depuis un fichier
        const fileUrl = URL.createObjectURL(url)
        const gltf = await new Promise((resolve, reject) => {
          gltfLoader.load(
            fileUrl,
            (gltf) => resolve(gltf),
            undefined,
            (error) => reject(error)
          )
        })
        URL.revokeObjectURL(fileUrl)
        obj = gltf.scene
      } else if (typeof url === 'string') {
        // Charger depuis une URL
        const gltf = await new Promise((resolve, reject) => {
          gltfLoader.load(
            url,
            (gltf) => resolve(gltf),
            undefined,
            (error) => reject(error)
          )
        })
        obj = gltf.scene
      } else {
        throw new Error('Format de fichier GLTF non supporté')
      }
    } else {
      // Load OBJ
      const objLoader = new OBJLoader()
      
      if (url instanceof File) {
        const text = await url.text()
        obj = objLoader.parse(text)
      } else if (typeof url === 'string') {
        if (url.startsWith('data:')) {
          // Data URL
          const text = atob(url.split(',')[1])
          obj = objLoader.parse(text)
        } else {
          // Regular URL - try to fetch
          try {
            const response = await fetch(url)
            const text = await response.text()
            obj = objLoader.parse(text)
          } catch (error) {
            throw new Error('Impossible de charger le fichier OBJ depuis cette URL')
          }
        }
      } else {
        throw new Error('Format de fichier non supporté')
      }
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
            }
          }
        }
      }
    })
    
    if (hasInvalidGeometry) {
      throw new Error('Le modèle contient des coordonnées invalides (NaN ou Infinity). Vérifiez le fichier 3D.')
    }

    // Calculate bounding box and center the model
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    
    // Vérifier que la bounding box est valide
    if (isNaN(size.x) || isNaN(size.y) || isNaN(size.z) || 
        isNaN(center.x) || isNaN(center.y) || isNaN(center.z)) {
      throw new Error('Le modèle contient des coordonnées invalides (NaN). Vérifiez le fichier 3D.')
    }
    
    const maxDim = Math.max(size.x, size.y, size.z)
    
    // Vérifier que maxDim est valide
    if (maxDim <= 0 || !isFinite(maxDim)) {
      throw new Error('Le modèle a une taille invalide. Impossible de le charger.')
    }

    // Scale to fit in view - Réduire la taille pour mieux correspondre au canvas 2D
    // Facteur réduit de 3 à 1.3 pour diminuer la taille du gobelet de manière visible
    const scale = 1.3 / maxDim
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
          generateUVs(child.geometry)
          generatedUVs = true
        }
        
        if (!child.material) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            map: null, // Will be set when texture is applied
            envMap: environmentMap, // Texture d'environnement pour les réflexions
            transparent: true, // Rendre le gobelet transparent
            opacity: 0.3, // Niveau de transparence (0 = complètement transparent, 1 = opaque)
            metalness: 0.3, // Légèrement métallique pour voir les réflexions
            roughness: 0.7 // Surface légèrement rugueuse
          })
        } else {
          // S'assurer que le matériau existant est aussi transparent
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              mat.transparent = true
              mat.opacity = 0.3
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.envMap = environmentMap
                mat.metalness = mat.metalness !== undefined ? mat.metalness : 0.3
                mat.roughness = mat.roughness !== undefined ? mat.roughness : 0.7
              }
            })
          } else {
            child.material.transparent = true
            child.material.opacity = 0.3
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.envMap = environmentMap
              child.material.metalness = child.material.metalness !== undefined ? child.material.metalness : 0.3
              child.material.roughness = child.material.roughness !== undefined ? child.material.roughness : 0.7
            }
          }
          if (!child.material.map) {
            // Ensure material can accept textures
            child.material.map = null
          }
        }
      }
    })
    

    scene.add(obj)
    currentMesh = obj
    
    // S'assurer que la texture d'environnement est appliquée si elle existe
    if (environmentMap) {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.envMap = environmentMap
                mat.needsUpdate = true
              }
            })
          } else {
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.envMap = environmentMap
              child.material.needsUpdate = true
            }
          }
        }
      })
    }

    // Adjust camera - position fixe pour avoir des coordonnées stables
    // Distance ajustée pour correspondre à la nouvelle taille du modèle
    const scaledMaxDim = maxDim * scale
    const distance = scaledMaxDim * 0.6  // Distance réduite pour zoomer le modèle (0.5 au lieu de 0.7)
    camera.position.set(distance, distance, distance)
    camera.lookAt(0, 0, 0)
    
    if (controls) {
      controls.target.set(0, 0, 0)
      // S'assurer que les contrôles restent configurés après le chargement
      controls.enableZoom = false      // Pas de zoom pour coordonnées fixes
      controls.enablePan = false       // Pas de déplacement pour coordonnées fixes
      controls.enableRotate = true    // Rotation activée pour voir le modèle sous différents angles
      // Maintenir la restriction de rotation verticale
      const fixedPolarAngle = Math.PI / 2  // Angle horizontal (90 degrés)
      controls.minPolarAngle = fixedPolarAngle
      controls.maxPolarAngle = fixedPolarAngle
      controls.update()
    }

    // Extraire tous les meshes
    allMeshes = []
    meshesList.value = []
    let meshIndex = 0
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        allMeshes.push(child)
        
        // Ajouter les informations du mesh à la liste
        const geometry = child.geometry
        const vertexCount = geometry.attributes.position ? geometry.attributes.position.count : 0
        const hasUVs = geometry.attributes.uv ? true : false
        
        // Analyser les UVs pour détecter la couture
        let uvRange = null
        if (hasUVs && geometry.attributes.uv) {
          const uvArray = geometry.attributes.uv.array
          let minU = Infinity
          let maxU = -Infinity
          for (let i = 0; i < uvArray.length; i += 2) {
            const u = uvArray[i]
            minU = Math.min(minU, u)
            maxU = Math.max(maxU, u)
          }
          uvRange = { minU, maxU, range: maxU - minU }
        }
        
        const meshInfo = {
          index: meshIndex++,
          mesh: child,
          name: child.name || `Mesh_${meshIndex}`,
          vertexCount: vertexCount,
          hasUVs: hasUVs,
          uvRange: uvRange
        }
        meshesList.value.push(meshInfo)
      }
    })
    
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
    emit('model-error', error)
  }
}

/**
 * Configure la texture partagée à partir du canvas 2D HTML
 */
const setupSharedCanvasTexture = (htmlCanvas) => {
  if (!htmlCanvas || !currentMesh) {
    return
  }

  try {
    // Récupérer tous les matériaux du mesh
    const materials = []
    let meshCount = 0
    currentMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshCount++
        
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
      return
    }
    
    // Appliquer sur tous les meshes
    applyTextureToMesh(currentMesh, canvasTexture)
    
    emit('texture-ready', canvasTexture)
    
  } catch (error) {
  }
}

// ============================================================================
// SECTION 5 : GÉNÉRATION D'UVs (Mapping Texture)
// ============================================================================

/**
 * Génère des coordonnées UV sans couture pour une géométrie
 * Les UVs sont étalés de 0.05 à 0.95 pour éviter la discontinuité à U=0/U=1
 * 
 * @param {THREE.BufferGeometry} geometry - La géométrie à traiter
 * @param {boolean} seamless - Si true, étale les UVs pour éviter la couture
 */
const generateSeamlessUVs = (geometry, seamless = false) => {
  const positions = geometry.attributes.position
  const uvs = []
  
  if (!positions || positions.count === 0) {
    return
  }
  
  // Calculer la bounding box
  const box = new THREE.Box3().setFromBufferAttribute(positions)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  
  // Déterminer la meilleure projection
  const isCylindrical = size.y > size.x * 0.8 && size.y > size.z * 0.8
  const isWide = size.x > size.y * 1.5 || size.z > size.y * 1.5
  
  // Facteur d'étalement pour éviter la couture (0.05 à 0.95 au lieu de 0 à 1)
  const uMin = seamless ? 0.05 : 0
  const uMax = seamless ? 0.95 : 1
  const uRange = uMax - uMin
  
  if (isCylindrical) {
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) - center.x
      const y = positions.getY(i) - center.y
      const z = positions.getZ(i) - center.z
      
      const angle = Math.atan2(z, x)
      let u = 1 - ((angle / (2 * Math.PI)) + 0.5)
      
      // Étaler les UVs pour éviter la couture
      if (seamless) {
        u = uMin + (u * uRange)
      }
      
      let v = size.y > 0 ? 1 - ((y + size.y / 2) / size.y) : 0.5
      
      if (isNaN(u) || !isFinite(u)) u = 0.5
      if (isNaN(v) || !isFinite(v)) v = 0.5
      
      uvs.push(Math.max(0, Math.min(1, u)))
      uvs.push(Math.max(0, Math.min(1, v)))
    }
  } else if (isWide) {
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) - center.x
      const z = positions.getZ(i) - center.z
      
      let u = size.x > 0 ? 1 - ((x + size.x / 2) / size.x) : 0.5
      
      // Étaler les UVs pour éviter la couture
      if (seamless) {
        u = uMin + (u * uRange)
      }
      
      let v = size.z > 0 ? 1 - ((z + size.z / 2) / size.z) : 0.5
      
      if (isNaN(u) || !isFinite(u)) u = 0.5
      if (isNaN(v) || !isFinite(v)) v = 0.5
      
      uvs.push(Math.max(0, Math.min(1, u)))
      uvs.push(Math.max(0, Math.min(1, v)))
    }
  } else {
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) - center.x
      const y = positions.getY(i) - center.y
      const z = positions.getZ(i) - center.z
      
      const length = Math.sqrt(x * x + y * y + z * z)
      if (length > 0.0001) {
        const nx = x / length
        const ny = y / length
        const nz = z / length
        
        let u = 1 - ((Math.atan2(nz, nx) / (2 * Math.PI)) + 0.5)
        
        // Étaler les UVs pour éviter la couture
        if (seamless) {
          u = uMin + (u * uRange)
        }
        
        let v = 1 - ((Math.asin(ny) / Math.PI) + 0.5)
        
        if (isNaN(u) || !isFinite(u)) u = 0.5
        if (isNaN(v) || !isFinite(v)) v = 0.5
        
        uvs.push(Math.max(0, Math.min(1, u)))
        uvs.push(Math.max(0, Math.min(1, v)))
      } else {
        uvs.push(0.5, 0.5)
      }
    }
  }
  
  // Ajouter les UVs à la géométrie
  try {
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.attributes.uv.needsUpdate = true
  } catch (error) {
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
      break
    }
  }
  
  if (hasInvalidPositions) {
    return
  }
  
  // Calculer la bounding box pour normaliser les coordonnées
  const box = new THREE.Box3().setFromBufferAttribute(positions)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  
  // Vérifier que la taille est valide (non nulle)
  if (size.x === 0 && size.y === 0 && size.z === 0) {
    // Utiliser une taille minimale pour éviter les divisions par zéro
    size.x = size.x || 1
    size.y = size.y || 1
    size.z = size.z || 1
  }
  
  // Vérifier que les valeurs sont valides
  if (isNaN(size.x) || isNaN(size.y) || isNaN(size.z) || 
      isNaN(center.x) || isNaN(center.y) || isNaN(center.z)) {
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
      // Corriger les valeurs invalides
      uvs[i] = 0.5
    }
  }
  
  if (hasInvalidUVs) {
  }
  
  // Vérifier que le nombre d'UVs correspond au nombre de vertices
  if (uvs.length !== positions.count * 2) {
    return
  }
  
  // Ajouter les UVs à la géométrie
  try {
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    // Marquer l'attribut comme mis à jour
    geometry.attributes.uv.needsUpdate = true
  } catch (error) {
  }
}

const applyTexture = (texture) => {
  if (!currentMesh) {
    return
  }

  if (!texture || !texture.image) {
    return
  }

  texture.flipY = true  // Inverser verticalement pour correspondre à l'orientation du modèle 3D
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
            mat.envMap = environmentMap // Ajouter la texture d'environnement
            mat.transparent = true // Maintenir la transparence
            mat.opacity = 0.3 // Maintenir le niveau de transparence
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.metalness = mat.metalness !== undefined ? mat.metalness : 0.3
              mat.roughness = mat.roughness !== undefined ? mat.roughness : 0.7
            }
            mat.needsUpdate = true
          } else {
            child.material[idx] = new THREE.MeshStandardMaterial({
              map: texture,
              envMap: environmentMap, // Ajouter la texture d'environnement
              side: THREE.DoubleSide,
              transparent: true, // Rendre transparent
              opacity: 0.3, // Niveau de transparence
              metalness: 0.3,
              roughness: 0.7
            })
          }
        })
      } else {
        if (child.material instanceof THREE.MeshStandardMaterial || child.material instanceof THREE.MeshPhongMaterial) {
          child.material.map = texture
          child.material.envMap = environmentMap // Ajouter la texture d'environnement
          child.material.transparent = true // Maintenir la transparence
          child.material.opacity = 0.3 // Maintenir le niveau de transparence
          if (child.material instanceof THREE.MeshStandardMaterial) {
            child.material.metalness = child.material.metalness !== undefined ? child.material.metalness : 0.3
            child.material.roughness = child.material.roughness !== undefined ? child.material.roughness : 0.7
          }
          child.material.needsUpdate = true
        } else {
          child.material = new THREE.MeshStandardMaterial({
            map: texture,
            envMap: environmentMap, // Ajouter la texture d'environnement
            side: THREE.DoubleSide,
            transparent: true, // Rendre transparent
            opacity: 0.3, // Niveau de transparence
            metalness: 0.3,
            roughness: 0.7
          })
        }
      }
    }
  })
  
}

// ============================================================================
// SECTION 6 : FONCTIONNALITÉS SPÉCIALES
// ============================================================================

/**
 * Crée un nouveau gobelet sans couture en modifiant les UVs du modèle actuel
 * Les UVs sont étalés pour éviter la discontinuité à U=0/U=1
 * 
 * @returns {boolean} - true si succès, false sinon
 */
const createSeamlessGoblet = () => {
  if (!currentMesh) {
    return false
  }
  
  try {
    // Cloner le modèle actuel
    const clonedMesh = currentMesh.clone()
    
    // Modifier les UVs de tous les meshes pour éviter la couture
    clonedMesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        // Cloner la géométrie pour éviter de modifier l'original
        const clonedGeometry = child.geometry.clone()
        
        // Régénérer les UVs sans couture
        generateSeamlessUVs(clonedGeometry, true)
        
        // Remplacer la géométrie
        child.geometry = clonedGeometry
        
        // Appliquer RepeatWrapping pour que la texture se répète sans couture
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              if (mat.map) {
                mat.map.wrapS = THREE.RepeatWrapping
                mat.map.wrapT = THREE.RepeatWrapping
                mat.map.needsUpdate = true
              }
            })
          } else {
            if (child.material.map) {
              child.material.map.wrapS = THREE.RepeatWrapping
              child.material.map.wrapT = THREE.RepeatWrapping
              child.material.map.needsUpdate = true
            }
          }
        }
      }
    })
    
    // Supprimer l'ancien modèle de la scène
    if (currentMesh && currentMesh.parent) {
      currentMesh.parent.remove(currentMesh)
    } else if (currentMesh) {
      scene.remove(currentMesh)
    }
    
    // Ajouter le nouveau modèle à la scène
    scene.add(clonedMesh)
    currentMesh = clonedMesh
    
    // Réappliquer la texture si elle existe
    if (canvasTexture) {
      applyTexture(canvasTexture)
    }
    
    // Réappliquer la texture d'environnement
    if (environmentMap) {
      clonedMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.envMap = environmentMap
                mat.needsUpdate = true
              }
            })
          } else {
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.envMap = environmentMap
              child.material.needsUpdate = true
            }
          }
        }
      })
    }
    
    // Extraire tous les meshes
    allMeshes = []
    meshesList.value = []
    let meshIndex = 0
    clonedMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        allMeshes.push(child)
        
        // Ajouter les informations du mesh à la liste
        const geometry = child.geometry
        const vertexCount = geometry.attributes.position ? geometry.attributes.position.count : 0
        const hasUVs = geometry.attributes.uv ? true : false
        
        meshesList.value.push({
          index: meshIndex++,
          mesh: child,
          name: child.name || `Mesh_${meshIndex}`,
          vertexCount: vertexCount,
          hasUVs: hasUVs
        })
      }
    })
    
    
    emit('model-loaded', clonedMesh)
    emit('meshes-extracted', allMeshes)
    
    return true
  } catch (error) {
    return false
  }
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

// ============================================================================
// SECTION 8 : GESTION DES MESHES (Highlight, Active, etc.)
// ============================================================================

/**
 * Met en évidence un mesh (change sa couleur)
 * 
 * @param {THREE.Mesh} mesh - Le mesh à mettre en évidence
 * @param {boolean} isHighlighting - true pour mettre en évidence, false pour réinitialiser
 */
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
  // Mettre à jour l'index actif dans la liste
  if (mesh) {
    const meshIndex = meshesList.value.findIndex(m => m.mesh === mesh)
    activeMeshIndex.value = meshIndex >= 0 ? meshIndex : -1
  } else {
    activeMeshIndex.value = -1
  }
}

/**
 * Sélectionne un mesh depuis la liste
 * 
 * @param {number} index - Index du mesh dans la liste
 */
const selectMesh = (index) => {
  if (index >= 0 && index < meshesList.value.length) {
    activeMeshIndex.value = index
    const meshInfo = meshesList.value[index]
    setActiveMesh(meshInfo.mesh)
    highlightMesh(meshInfo.mesh, true)
  } else {
    activeMeshIndex.value = -1
    setActiveMesh(null)
    highlightAllMeshes()
  }
}

// Méthode pour mettre à jour la zone de travail
const updateWorkZone = (top, bottom) => {
  // Les props sont réactives, donc les changements seront automatiquement pris en compte
}

// Méthode pour mettre à jour le mode placement
const setPlacementMode = (active, type) => {
  if (renderer && renderer.domElement) {
    if (active) {
      renderer.domElement.style.cursor = 'crosshair'
    } else {
      renderer.domElement.style.cursor = 'default'
    }
  }
}

// Méthode pour mettre à jour le mode drag
const setDragMode = (active) => {
  if (renderer && renderer.domElement) {
    if (active) {
      renderer.domElement.style.setProperty('cursor', 'move', 'important')
    } else {
      renderer.domElement.style.setProperty('cursor', 'default', 'important')
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
/**
 * Fait tourner le modèle 3D selon l'angle de rotation d'un élément 2D
 * @param {number} angleDegrees - Angle de rotation en degrés (de Fabric.js)
 */
const rotateModel = (angleDegrees) => {
  if (!currentMesh) return
  
  // Convertir l'angle de degrés en radians
  // L'angle dans Fabric.js est dans le sens horaire, on le convertit pour Three.js
  const angleRadians = THREE.MathUtils.degToRad(angleDegrees)
  
  // Faire tourner le modèle autour de l'axe Y (vertical)
  // On utilise rotation.y pour faire tourner le modèle horizontalement
  currentMesh.rotation.y = angleRadians
  
  // Mettre à jour les contrôles pour que la caméra suive la rotation
  if (controls) {
    // Optionnel : faire tourner aussi la caméra pour suivre le modèle
    // controls.update()
  }
}

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
  createSeamlessGoblet,
  rotateModel,
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
  transition: all 0.3s ease; /* Transition douce pour le changement de couleur */
}

/* Style quand le curseur est sur la couture */
.coordinates-display.on-seam {
  background: rgba(200, 0, 0, 0.9) !important; /* Fond rouge */
  border: 2px solid #ff0000; /* Bordure rouge */
  color: #fff;
  box-shadow: 0 4px 16px rgba(255, 0, 0, 0.5); /* Ombre rouge */
}

.coordinates-display.on-seam .coord-title {
  color: #fff;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
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

/* Styles pour la liste des meshes */
.meshes-list {
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(139, 92, 246, 0.9);
  border: 2px solid #8b5cf6;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  z-index: 1000;
  min-width: 280px;
  max-width: 320px;
  max-height: 400px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
}

/* Styles pour la liste des objets du canvas */
.canvas-objects-list {
  position: absolute;
  top: 20px;
  left: 360px; /* Positionné à droite de la liste des meshes */
  background: rgba(59, 130, 246, 0.9);
  border: 2px solid #3b82f6;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  z-index: 1000;
  min-width: 280px;
  max-width: 320px;
  max-height: 400px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
}

.canvas-objects-list .coord-title {
  color: #fff;
  flex-shrink: 0;
}

.canvas-object-item {
  background: rgba(255, 255, 255, 0.1);
}

.canvas-object-item.active {
  background: rgba(255, 255, 255, 0.2);
  border-left-color: #fff;
}

.meshes-list .coord-title {
  color: #fff;
  flex-shrink: 0;
}

.meshes-scroll-container {
  flex: 1;
  overflow-y: auto;
  margin-top: 8px;
  padding-right: 4px;
}

.meshes-scroll-container::-webkit-scrollbar {
  width: 6px;
}

.meshes-scroll-container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.meshes-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.meshes-scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

.mesh-item {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 6px;
  border-left: 3px solid transparent;
  transition: all 0.2s;
  cursor: pointer;
}

.mesh-item:hover {
  background: rgba(255, 255, 255, 0.15);
  border-left-color: rgba(255, 255, 255, 0.5);
}

.mesh-item.active {
  background: rgba(255, 255, 255, 0.2);
  border-left-color: #fff;
}

.mesh-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.mesh-name {
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.active-badge {
  background: #fff;
  color: #8b5cf6;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
}

.mesh-details {
  font-size: 11px;
  opacity: 0.9;
}

.mesh-detail-row {
  margin: 2px 0;
}

.mesh-detail-row span {
  font-weight: 600;
  margin-right: 4px;
}
</style>

