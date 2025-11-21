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
    
    <!-- Bouton flottant pour ajouter un rectangle -->
    <button 
      v-if="currentMesh"
      @click="handleAddRectangleClick"
      class="add-rectangle-btn"
      :class="{ 'active': props.placementMode && props.placementType === 'rectangle' }"
      title="Ajouter un rectangle sur le modèle 3D"
    >
      <span class="btn-icon">📐</span>
      <span class="btn-text">{{ props.placementMode && props.placementType === 'rectangle' ? 'Cliquez sur le modèle' : '+ Rectangle' }}</span>
    </button>
    
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
         :class="['coordinates-display', { 'on-seam': isOnSeam, 'on-rotation': coordinatesDisplay.isOnRotationHandle }]">
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
        <div class="coord-section">
          <div class="coord-label">Opacité:</div>
          <div class="coord-value">{{ (selectedObjectCoords.opacity !== undefined ? selectedObjectCoords.opacity : 1.0).toFixed(2) }}</div>
        </div>
        <div v-if="isNearRotationHandle" class="coord-section rotation-active-indicator">
          <div class="coord-label">🔄 Rotation Active</div>
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
            <div class="object-detail-row">
              <span>Opacité:</span> {{ (obj.opacity !== undefined ? obj.opacity : 1.0).toFixed(2) }}
            </div>
            <div v-if="obj.controls" class="controls-section">
              <div class="controls-title">Contrôles:</div>
              <div v-if="obj.controls.tl" class="control-item">
                <span>tl:</span> ({{ obj.controls.tl.x.toFixed(1) }}, {{ obj.controls.tl.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.tr" class="control-item">
                <span>tr:</span> ({{ obj.controls.tr.x.toFixed(1) }}, {{ obj.controls.tr.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.bl" class="control-item">
                <span>bl:</span> ({{ obj.controls.bl.x.toFixed(1) }}, {{ obj.controls.bl.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.br" class="control-item">
                <span>br:</span> ({{ obj.controls.br.x.toFixed(1) }}, {{ obj.controls.br.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.mt" class="control-item">
                <span>mt:</span> ({{ obj.controls.mt.x.toFixed(1) }}, {{ obj.controls.mt.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.mb" class="control-item">
                <span>mb:</span> ({{ obj.controls.mb.x.toFixed(1) }}, {{ obj.controls.mb.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.ml" class="control-item">
                <span>ml:</span> ({{ obj.controls.ml.x.toFixed(1) }}, {{ obj.controls.ml.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.mr" class="control-item">
                <span>mr:</span> ({{ obj.controls.mr.x.toFixed(1) }}, {{ obj.controls.mr.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.mtr" class="control-item">
                <span>mtr:</span> ({{ obj.controls.mtr.x.toFixed(1) }}, {{ obj.controls.mtr.y.toFixed(1) }})
              </div>
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
    
    <!-- Div de débogage pour les contrôles détectés -->
    <div v-if="detectedControl.show" class="coordinates-display debug-control">
      <div class="coord-title">🔧 Contrôle Détecté</div>
      <div class="coord-content">
        <div class="coord-section">
          <div class="coord-label">Handle:</div>
          <div class="coord-value">{{ detectedControl.handle || 'Aucun' }}</div>
        </div>
        <div v-if="detectedControl.corner" class="coord-section">
          <div class="coord-label">Coin:</div>
          <div class="coord-value">{{ detectedControl.corner }}</div>
        </div>
        <div v-if="detectedControl.edge" class="coord-section">
          <div class="coord-label">Bord:</div>
          <div class="coord-value">{{ detectedControl.edge }}</div>
        </div>
        <div v-if="detectedControl.isRotation" class="coord-section">
          <div class="coord-label">Type:</div>
          <div class="coord-value">Rotation (mtr)</div>
        </div>
        <div v-if="detectedControl.distance !== null" class="coord-section">
          <div class="coord-label">Distance:</div>
          <div class="coord-value">{{ detectedControl.distance.toFixed(1) }}px</div>
        </div>
        <div v-if="detectedControl.x !== null && detectedControl.y !== null" class="coord-section">
          <div class="coord-label">Coordonnées:</div>
          <div class="coord-value">
            X: {{ detectedControl.x.toFixed(1) }}, 
            Y: {{ detectedControl.y.toFixed(1) }}
          </div>
        </div>
      </div>
    </div>
    
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
            <div class="mesh-detail-row center-coords">
              <span>Centre:</span> ({{ obj.centerX.toFixed(1) }}, {{ obj.centerY.toFixed(1) }})
            </div>
            <div class="mesh-detail-row">
              <span>Opacité:</span> {{ (obj.opacity !== undefined ? obj.opacity : 1.0).toFixed(2) }}
            </div>
            <div v-if="obj.controls" class="controls-section">
              <div class="controls-title">Contrôles:</div>
              <div v-if="obj.controls.tl" class="control-item">
                <span>tl:</span> ({{ obj.controls.tl.x.toFixed(1) }}, {{ obj.controls.tl.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.tr" class="control-item">
                <span>tr:</span> ({{ obj.controls.tr.x.toFixed(1) }}, {{ obj.controls.tr.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.bl" class="control-item">
                <span>bl:</span> ({{ obj.controls.bl.x.toFixed(1) }}, {{ obj.controls.bl.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.br" class="control-item">
                <span>br:</span> ({{ obj.controls.br.x.toFixed(1) }}, {{ obj.controls.br.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.mt" class="control-item">
                <span>mt:</span> ({{ obj.controls.mt.x.toFixed(1) }}, {{ obj.controls.mt.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.mb" class="control-item">
                <span>mb:</span> ({{ obj.controls.mb.x.toFixed(1) }}, {{ obj.controls.mb.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.ml" class="control-item">
                <span>ml:</span> ({{ obj.controls.ml.x.toFixed(1) }}, {{ obj.controls.ml.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.mr" class="control-item">
                <span>mr:</span> ({{ obj.controls.mr.x.toFixed(1) }}, {{ obj.controls.mr.y.toFixed(1) }})
              </div>
              <div v-if="obj.controls.mtr" class="control-item">
                <span>mtr:</span> ({{ obj.controls.mtr.x.toFixed(1) }}, {{ obj.controls.mtr.y.toFixed(1) }})
              </div>
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
// DecalGeometry supprimé pour utiliser les Shaders
import { get3DPositionFromUV } from '../composables/use2DTo3DProjection'

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
  '3d-hover',          // Survol du modèle 3D (pour détecter les bords)
  '3d-rotation-click',  // Clic sur le contrôle de rotation (mtr) dans la vue 3D
  '3d-rotation-start',  // Début de la rotation depuis le mtr
  '3d-rotation',        // Rotation en cours depuis le mtr
  '3d-rotation-end',    // Fin de la rotation depuis le mtr
  'add-rectangle-click' // Clic sur le bouton "+ Rectangle" dans la vue 3D
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

// ----- Shaders (Optimisation Rotation Pro) -----
// On stocke les références aux uniforms pour pouvoir les mettre à jour rapidement
let shaderUniforms = {
  uDecalMap: { value: null },
  uDecalVisible: { value: 0 }, // 0: caché, 1: visible
  uDecalCenter: { value: new THREE.Vector2(0.5, 0.5) },
  uDecalScale: { value: new THREE.Vector2(1, 1) },
  uDecalAngle: { value: 0 }
}
let isMaterialPatched = false

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
  isOnSeam: false, // Flag pour indiquer si le curseur est sur la couture
  isOnRotationHandle: false // Flag pour indiquer si le curseur est sur le contrôle de rotation
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
  angle: 0,
  opacity: 1.0,
  controls: {}, // Coordonnées des contrôles, notamment mtr
  originX: 'left',
  originY: 'top'
})

// État pour indiquer si on est proche du contrôle de rotation
const isNearRotationHandle = ref(false)


// État pour le débogage des contrôles détectés
const detectedControl = ref({
  show: false,
  handle: null,
  corner: null,
  edge: null,
  isRotation: false,
  distance: null,
  x: null,
  y: null
})

// Gardes pour éviter les mises à jour récursives
let isUpdatingSelectedObject = false
let isUpdatingObjectsList = false

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
   * Boucle d'animation principale (OPTIMISÉE)
   * 
   * Cette fonction est appelée à chaque frame pour :
   * 1. Mettre à jour la texture si le canvas 2D a changé (vérification directe optimisée)
   * 2. Mettre à jour les contrôles (amortissement)
   * 3. Rendre la scène
   * 
   * OPTIMISATIONS:
   * - Vérification directe du flag render2D sans passer par Vue reactivity
   * - Mise à jour immédiate de la texture
   */
  const animate = () => {
    animationId = requestAnimationFrame(animate)
    
    // Vérifier si le canvas 2D a été modifié et mettre à jour la texture
    // Vérification directe pour éviter la latence de Vue reactivity
    if (canvasTexture && render2D.value) {
      // Mise à jour directe de la texture (plus rapide)
      canvasTexture.needsUpdate = true
      resetTextureUpdate()  // Réinitialiser le flag immédiatement
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
 * ============================================================================
 * VARIABLES DE ROTATION - Gestion de la rotation des éléments via le contrôle mtr
 * ============================================================================
 * 
 * Le système de rotation permet à l'utilisateur de faire tourner un élément
 * sélectionné en cliquant et en glissant le contrôle de rotation (mtr - middle-top-rotate).
 * 
 * FONCTIONNEMENT:
 * 1. L'utilisateur clique sur le contrôle mtr (petite poignée au-dessus de l'élément)
 * 2. Le système capture la position initiale du curseur et du mtr
 * 3. Pendant le mouvement, on calcule l'angle entre la position initiale et actuelle
 * 4. L'angle est calculé par rapport au centre géométrique de l'élément
 * 5. L'événement '3d-rotation' est émis avec l'angle calculé
 * 6. Le composant parent (DesignStudio) applique la rotation à l'objet Fabric.js
 */

// Flag booléen indiquant si une rotation est en cours
// true = l'utilisateur est en train de faire tourner l'élément
// false = pas de rotation active
let isRotating3D = false

// Position initiale du contrôle mtr (middle-top-rotate) au moment du clic
// Objet avec {x, y} en coordonnées canvas 2D (pixels)
// Cette position sert de référence pour calculer l'angle de rotation
// Exemple: { x: 400, y: 150 } si le mtr est à 400px de gauche et 150px du haut
let rotationStartPosition = null

// Position initiale du curseur au moment du clic sur le mtr
// Objet avec {x, y} en coordonnées canvas 2D (pixels)
// Utilisé pour calculer l'angle initial entre le curseur et le centre de l'objet
// Exemple: { x: 405, y: 155 } si l'utilisateur clique légèrement à côté du mtr
let rotationStartCursor = null

// Angle initial de l'objet au moment où la rotation commence (en degrés)
// Actuellement non utilisé car on calcule l'angle delta (différence)
// Pourrait être utilisé pour afficher l'angle absolu de l'objet
let rotationStartAngle = null

// Centre géométrique de l'objet calculé au début de la rotation
// Objet avec {x, y} en coordonnées canvas 2D (pixels)
// Ce centre est calculé UNE SEULE FOIS au début de la rotation et réutilisé
// pendant toute la durée de la rotation pour éviter les problèmes de décalage
// Exemple: { x: 400, y: 250 } si le centre de l'objet est à 400px de gauche et 250px du haut
let rotationCenter = null

// Flag de protection pour éviter les conflits entre rotation et drag
// true = la rotation vient de se terminer, on ignore les clics pendant un court délai
// false = on peut détecter une nouvelle rotation
// Ce flag évite qu'un relâchement de souris après rotation soit interprété comme un drag
let rotationJustEnded = false

// Timestamp (en millisecondes) du moment où la rotation s'est terminée
// Utilisé avec rotationJustEnded pour implémenter un délai de protection
// Exemple: 1700000000000 (timestamp Unix en ms)
let rotationEndTime = 0

/**
 * ============================================================================
 * FONCTION: resetRotationState
 * ============================================================================
 * 
 * Réinitialise complètement l'état de rotation du système.
 * 
 * QUAND EST-ELLE APPELÉE:
 * - Lors du changement de vue (2D ↔ 3D)
 * - Lors de la désélection d'un objet
 * - Lors d'une annulation d'opération
 * 
 * QUE FAIT-ELLE:
 * 1. Émet l'événement '3d-rotation-end' si une rotation était en cours
 * 2. Réinitialise tous les flags et variables de rotation à leur état initial
 * 3. Restaure le curseur par défaut (move ou default selon le mode)
 * 4. Réactive les contrôles OrbitControls pour permettre la rotation de la caméra
 * 
 * POURQUOI C'EST IMPORTANT:
 * - Évite les états incohérents où le système pense qu'une rotation est active
 * - Garantit que l'utilisateur peut à nouveau interagir normalement avec la scène
 * - Nettoie proprement toutes les ressources liées à la rotation
 */
const resetRotationState = () => {
  // Si une rotation est actuellement active, on doit la terminer proprement
  if (isRotating3D) {
    // Émettre l'événement de fin de rotation pour que le parent puisse nettoyer
    // Cet événement permet au composant parent (DesignStudio) de finaliser la rotation
    // emit('3d-rotation-end')
  }
  
  // Réinitialiser le flag de rotation active
  // false = aucune rotation en cours
  isRotating3D = false
  
  // Effacer la position de départ du contrôle mtr
  // null = pas de position de référence enregistrée
  rotationStartPosition = null
  
  // Effacer la position initiale du curseur
  // null = pas de position de curseur enregistrée
  rotationStartCursor = null
  
  // Effacer l'angle initial (non utilisé actuellement)
  rotationStartAngle = null
  
  // Effacer le centre géométrique calculé
  // null = pas de centre enregistré
  rotationCenter = null
  
  // Désactiver le flag de protection "rotation vient de se terminer"
  // false = on peut détecter une nouvelle rotation immédiatement
  rotationJustEnded = false
  
  // Réinitialiser le timestamp de fin de rotation
  // 0 = pas de rotation récente
  rotationEndTime = 0
  
  // Restaurer le curseur par défaut
  if (renderer && renderer.domElement) {
    // Déterminer quel curseur utiliser selon le mode actif
    // 'move' si on est en mode drag, 'default' sinon
    const defaultCursor = props.dragMode ? 'move' : 'default'
    
    // Appliquer le curseur avec !important pour surcharger les styles inline
    renderer.domElement.style.setProperty('cursor', defaultCursor, 'important')
  }
  
  // Réactiver COMPLÈTEMENT les contrôles OrbitControls
  // Pendant la rotation, les contrôles sont désactivés pour éviter les conflits
  // On les réactive maintenant pour permettre la rotation de la caméra
  if (controls) {
    controls.enabled = true
    controls.enableRotate = true
  }
}

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
    // BLOQUER OrbitControls pendant la rotation
    // Si une rotation est en cours, empêcher OrbitControls de recevoir l'événement
    if (isRotating3D) {
      event.stopPropagation()
      event.preventDefault()
      console.log('🚫 Événement mousedown bloqué - rotation en cours')
    }
    
    if (!props.dragMode) return
    
    const canvasCoords = getCanvasCoords(event)
    if (canvasCoords !== null) {
      // Si on est déjà en mode rotation, vérifier si on clique toujours sur le mtr
      if (isRotating3D) {
        // Si on clique ailleurs que sur le mtr, désactiver la rotation
        if (selectedObjectCoords.value.show && selectedObjectCoords.value.controls && selectedObjectCoords.value.controls.mtr) {
          const mtrX = selectedObjectCoords.value.controls.mtr.x
          const mtrY = selectedObjectCoords.value.controls.mtr.y
          const cursorX = canvasCoords.x
          const cursorY = canvasCoords.y
          
          const distance = Math.sqrt(Math.pow(cursorX - mtrX, 2) + Math.pow(cursorY - mtrY, 2))
          const clickThreshold = 25
          
          // Si on clique ailleurs que sur le mtr, désactiver la rotation
          if (distance > clickThreshold) {
            emit('3d-rotation-end')
            isRotating3D = false
            rotationStartPosition = null
            rotationStartCursor = null
            
            // Réactiver les contrôles OrbitControls
            if (controls) {
              controls.enabled = true
            }
          }
        } else {
          // Si l'objet n'est plus sélectionné, désactiver la rotation
          emit('3d-rotation-end')
          isRotating3D = false
          rotationStartPosition = null
          rotationStartCursor = null
          
          // Réactiver les contrôles OrbitControls
          if (controls) {
            controls.enabled = true
          }
        }
      }
      
      /**
       * ========================================================================
       * DÉTECTION DU CLIC SUR LE CONTRÔLE DE ROTATION (mtr)
       * ========================================================================
       * 
       * Cette section détecte si l'utilisateur clique sur le contrôle de rotation
       * (mtr = middle-top-rotate) d'un élément sélectionné.
       * 
       * PRÉREQUIS:
       * - Un élément doit être sélectionné (selectedObjectCoords.value.show = true)
       * - L'élément doit avoir des contrôles visibles (selectedObjectCoords.value.controls)
       * - Le contrôle mtr doit exister (selectedObjectCoords.value.controls.mtr)
       * - On ne doit pas avoir terminé une rotation récemment (protection anti-rebond)
       * 
       * ALGORITHME DE DÉTECTION:
       * 1. Calculer le temps écoulé depuis la dernière rotation
       * 2. Vérifier qu'un délai minimum s'est écoulé (100ms)
       * 3. Récupérer les coordonnées du mtr et du curseur
       * 4. Calculer la distance euclidienne entre les deux points
       * 5. Si distance ≤ 10px, on considère que l'utilisateur clique sur le mtr
       * 
       * FORMULE DE DISTANCE:
       * distance = √[(x₂-x₁)² + (y₂-y₁)²]
       * où (x₁,y₁) = position du mtr
       *     (x₂,y₂) = position du curseur
       */
      
      // Calculer le temps écoulé depuis la fin de la dernière rotation (en millisecondes)
      // Cela permet d'éviter de détecter immédiatement une nouvelle rotation après la fin d'une rotation
      const timeSinceRotationEnd = Date.now() - rotationEndTime
      
      // Délai minimum de protection entre deux rotations (en millisecondes)
      // Ce délai évite les faux positifs lors du relâchement de la souris
      const minTimeBetweenRotationAndDrag = 100 // 100ms = 0.1 seconde
      
      // Vérifier toutes les conditions pour détecter un clic sur le mtr:
      // 1. rotationJustEnded = false (pas de rotation qui vient de se terminer)
      // 2. timeSinceRotationEnd > 100ms (délai de protection écoulé)
      // 3. selectedObjectCoords.value.show = true (un objet est sélectionné)
      // 4. selectedObjectCoords.value.controls existe (l'objet a des contrôles)
      // 5. selectedObjectCoords.value.controls.mtr existe (le contrôle mtr est présent)
      if (!rotationJustEnded && timeSinceRotationEnd > minTimeBetweenRotationAndDrag && 
          selectedObjectCoords.value.show && selectedObjectCoords.value.controls && selectedObjectCoords.value.controls.mtr) {
        
        // Récupérer les coordonnées du contrôle mtr (en pixels sur le canvas 2D)
        const mtrX = selectedObjectCoords.value.controls.mtr.x
        const mtrY = selectedObjectCoords.value.controls.mtr.y
        
        // Récupérer les coordonnées du curseur (en pixels sur le canvas 2D)
        const cursorX = canvasCoords.x
        const cursorY = canvasCoords.y
        
        // Calculer la distance euclidienne entre le curseur et le mtr
        // Formule: distance = √[(cursorX - mtrX)² + (cursorY - mtrY)²]
        // Math.pow(x, 2) calcule x²
        // Math.sqrt() calcule la racine carrée
        const distance = Math.sqrt(Math.pow(cursorX - mtrX, 2) + Math.pow(cursorY - mtrY, 2))
        
        // Seuil de proximité pour considérer qu'on clique sur le mtr (en pixels)
        // Si la distance est ≤ 10px, on considère que l'utilisateur clique sur le mtr
        // Ce seuil permet une certaine tolérance pour faciliter le clic
        const clickThreshold = 10
        
        // Si le curseur est suffisamment proche du mtr
        if (distance <= clickThreshold) {
          /**
           * ACTIVATION DU MODE ROTATION
           * 
           * À ce stade, on a confirmé que l'utilisateur clique sur le mtr.
           * On active le mode rotation et on enregistre les positions initiales.
           */
          
          // Activer le flag de rotation
          // true = une rotation est maintenant en cours
          isRotating3D = true
          
          // Désactiver le flag de protection
          // false = on est en rotation active, pas en fin de rotation
          rotationJustEnded = false
          
          // Enregistrer la position du mtr comme point de référence
          // Cette position ne changera pas pendant la rotation
          rotationStartPosition = { x: mtrX, y: mtrY }
          
          // Enregistrer la position initiale du curseur
          // Cette position servira à calculer l'angle de rotation initial
          rotationStartCursor = { x: cursorX, y: cursorY }
          
          /**
           * CALCUL DU CENTRE GÉOMÉTRIQUE AU DÉBUT DE LA ROTATION
           * 
           * Le centre est calculé UNE SEULE FOIS ici et stocké dans rotationCenter.
           * Il sera réutilisé pendant toute la durée de la rotation.
           * Cela évite les problèmes de décalage causés par le recalcul du centre
           * à chaque frame (car les coordonnées des contrôles changent pendant la rotation).
           */
          const controls = selectedObjectCoords.value.controls || {}
          let centerX, centerY
          
          // MÉTHODE 1: Intersection des diagonales (méthode préférée)
          if (controls.tl && controls.tr && controls.bl && controls.br) {
            // Extraire les coordonnées des 4 coins
            const x1 = controls.tl.x, y1 = controls.tl.y  // Top-left
            const x2 = controls.br.x, y2 = controls.br.y  // Bottom-right
            const x3 = controls.tr.x, y3 = controls.tr.y  // Top-right
            const x4 = controls.bl.x, y4 = controls.bl.y  // Bottom-left
            
            // Calculer le dénominateur
            const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
            
            if (Math.abs(denom) > 0.001) {
              const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
              centerX = x1 + t * (x2 - x1)
              centerY = y1 + t * (y2 - y1)
            } else {
              // Fallback: moyenne des 4 coins
              centerX = (x1 + x2 + x3 + x4) / 4
              centerY = (y1 + y2 + y3 + y4) / 4
            }
          } else {
            // MÉTHODE 2: Calcul via left/top/width/height (fallback)
            const originX = selectedObjectCoords.value.originX || 'left'
            const originY = selectedObjectCoords.value.originY || 'top'
            const objLeft = selectedObjectCoords.value.left || 0
            const objTop = selectedObjectCoords.value.top || 0
            const objWidth = selectedObjectCoords.value.width || 0
            const objHeight = selectedObjectCoords.value.height || 0
            
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
            
            centerX = actualLeft + objWidth / 2
            centerY = actualTop + objHeight / 2
          }
          
          // Stocker le centre calculé pour toute la durée de la rotation
          rotationCenter = { x: centerX, y: centerY }
          
          console.log('🎯 Centre géométrique calculé au début de la rotation:', rotationCenter)
          
          // Désactiver COMPLÈTEMENT les contrôles OrbitControls pendant la rotation
          // Cela évite que la caméra/goblet ne tourne en même temps que l'objet
          if (controls) {
            controls.enabled = false        // Désactiver tous les contrôles
            controls.enableRotate = false   // Désactiver spécifiquement la rotation
            console.log('🔒 OrbitControls désactivés pendant la rotation')
          }
          
          // Log de débogage pour vérifier les valeurs
          console.log('3d-rotation-start',canvasCoords.x,canvasCoords.y,selectedObjectCoords.value.controls.mtr,rotationStartCursor);
          
          // Émettre l'événement '3d-rotation-start' vers le composant parent
          // Cet événement informe le parent (DesignStudio) qu'une rotation commence
          // Le parent peut alors préparer l'objet Fabric.js pour la rotation
          emit('3d-rotation-start', {
            canvasX: canvasCoords.x,      // Position X du curseur
            canvasY: canvasCoords.y,      // Position Y du curseur
            mtrCoords: selectedObjectCoords.value.controls.mtr  // Coordonnées du mtr
          })
          
          // Arrêter le traitement ici et ne pas continuer avec le drag normal
          // return empêche l'exécution du code de drag qui suit
          return // Ne pas continuer avec le drag normal
        }
      }
      
      // Si on clique ailleurs que sur le mtr, désactiver la rotation si elle était active
      // (cela couvre le cas où on clique sur un autre point de la surface ou en dehors de l'objet)
      if (isRotating3D) {
        console.log('3d-rotation-end');
        emit('3d-rotation-end')
        isRotating3D = false
        rotationStartPosition = null
        rotationStartCursor = null
        
        // Réactiver les contrôles OrbitControls
        if (controls) {
          controls.enabled = true
        }
      }
      
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
    // BLOQUER OrbitControls pendant la rotation
    // Si une rotation est en cours, empêcher OrbitControls de recevoir l'événement
    if (isRotating3D) {
      event.stopPropagation()
      event.preventDefault()
    }
    
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
          isOnRotationHandle: coordinatesDisplay.value.isOnRotationHandle || false, // Conserver l'état du contrôle de rotation
          worldPos: {
            x: intersection.point.x,
            y: intersection.point.y,
            z: intersection.point.z
          }
        }
        
        // Comparer les coordonnées du curseur avec le contrôle de rotation (mtr) de l'élément sélectionné
        if (selectedObjectCoords.value.show && selectedObjectCoords.value.controls && selectedObjectCoords.value.controls.mtr) {
          const mtrX = selectedObjectCoords.value.controls.mtr.x
          const mtrY = selectedObjectCoords.value.controls.mtr.y
          const cursorX = canvasCoords.x
          const cursorY = canvasCoords.y
          
          // Calculer la distance entre le curseur et le mtr
          const distance = Math.sqrt(Math.pow(cursorX - mtrX, 2) + Math.pow(cursorY - mtrY, 2))
          
          // Seuil de proximité (en pixels)
          const proximityThreshold = 20
          
          if (distance <= proximityThreshold) {
            if (!isNearRotationHandle.value) {
              // Afficher l'alerte seulement la première fois qu'on entre dans la zone
              isNearRotationHandle.value = true
            }
          } else {
            isNearRotationHandle.value = false
          }
        } else {
          isNearRotationHandle.value = false
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
    
    /**
     * ============================================================================
     * CALCUL DE L'ANGLE DE ROTATION PENDANT LE MOUVEMENT
     * ============================================================================
     * 
     * Cette section est exécutée pendant que l'utilisateur déplace la souris
     * alors qu'une rotation est active (isRotating3D = true).
     * 
     * OBJECTIF:
     * Calculer l'angle de rotation de l'objet en fonction du mouvement du curseur
     * par rapport au centre géométrique de l'objet.
     * 
     * ALGORITHME EN 3 ÉTAPES:
     * 1. Trouver le centre géométrique exact de l'objet (même après rotation)
     * 2. Calculer les angles entre le centre et les positions du curseur (début et actuelle)
     * 3. Calculer la différence d'angle et l'émettre au composant parent
     * 
     * PRÉREQUIS:
     * - isRotating3D = true (rotation en cours)
     * - canvasCoords !== null (curseur sur le modèle 3D)
     * - rotationStartPosition !== null (position mtr enregistrée)
     * - rotationStartCursor !== null (position initiale curseur enregistrée)
     * - selectedObjectCoords.value.show = true (objet sélectionné)
     */
    if (isRotating3D && canvasCoords !== null && rotationStartPosition && rotationStartCursor && selectedObjectCoords.value.show && rotationCenter) {
      /**
       * ======================================================================
       * ÉTAPE 1: UTILISATION DU CENTRE GÉOMÉTRIQUE PRÉ-CALCULÉ
       * ======================================================================
       * 
       * Le centre géométrique a été calculé UNE SEULE FOIS au début de la rotation
       * et stocké dans la variable rotationCenter.
       * 
       * On utilise directement ce centre pré-calculé au lieu de le recalculer
       * à chaque frame. Cela évite les problèmes de décalage causés par le fait
       * que les coordonnées des contrôles (tl, tr, bl, br) changent pendant la rotation.
       * 
       * AVANTAGES:
       * - Performance: pas de recalcul à chaque frame
       * - Précision: le centre reste fixe pendant toute la rotation
       * - Stabilité: pas de décalage de position pendant la rotation
       */
      
      // Utiliser le centre pré-calculé
      const centerX = rotationCenter.x
      const centerY = rotationCenter.y
      
      console.log('🎯 Utilisation du centre pré-calculé:', centerX, centerY)
      
      /**
       * ======================================================================
       * ÉTAPE 2: CALCUL DES ANGLES
       * ======================================================================
       * 
       * Maintenant qu'on a le centre, on calcule les angles entre:
       * 1. Le centre et la position initiale du curseur (startAngle)
       * 2. Le centre et la position actuelle du curseur (currentAngle)
       * 
       * FORMULE:
       * angle = atan2(dy, dx) * (180 / π)
       * 
       * où:
       * - dx = différence en X entre le curseur et le centre
       * - dy = différence en Y entre le curseur et le centre
       * - atan2 retourne l'angle en radians (entre -π et π)
       * - On multiplie par (180/π) pour convertir en degrés
       * 
       * SYSTÈME DE COORDONNÉES:
       *        0° (droite)
       *           →
       *     90°   ↓   -90°
       *        180° (gauche)
       */
      
      // Calculer le vecteur entre le centre et la position initiale du curseur
      const startDx = rotationStartCursor.x - centerX  // Différence en X (début)
      const startDy = rotationStartCursor.y - centerY  // Différence en Y (début)
      
      // Calculer le vecteur entre le centre et la position actuelle du curseur
      const currentDx = canvasCoords.x - centerX  // Différence en X (actuel)
      const currentDy = canvasCoords.y - centerY  // Différence en Y (actuel)
      
      // Calculer l'angle initial (en degrés)
      // Math.atan2(y, x) retourne l'angle en radians entre -π et π
      // On multiplie par (180 / Math.PI) pour convertir en degrés
      const startAngle = Math.atan2(startDy, startDx) * (180 / Math.PI)
      
      // Calculer l'angle actuel (en degrés)
      const currentAngle = Math.atan2(currentDy, currentDx) * (180 / Math.PI)
      
      /**
       * ======================================================================
       * ÉTAPE 3: CALCUL DE LA DIFFÉRENCE D'ANGLE (DELTA)
       * ======================================================================
       * 
       * La différence d'angle (angleDelta) est la rotation à appliquer.
       * 
       * NORMALISATION:
       * Les angles sont normalisés entre -180° et 180° pour éviter les sauts.
       * Par exemple, si on passe de 170° à -170°, la différence est de 20°
       * et non de -340°.
       */
      
      // Calculer la différence d'angle (rotation à appliquer)
      let angleDelta = currentAngle - startAngle
      
      // Normaliser l'angle entre -180° et 180°
      // Si l'angle est > 180°, on soustrait 360° (rotation dans l'autre sens)
      if (angleDelta > 180) angleDelta -= 360
      // Si l'angle est < -180°, on ajoute 360° (rotation dans l'autre sens)
      if (angleDelta < -180) angleDelta += 360
      
      /**
       * ======================================================================
       * ÉMISSION DE L'ÉVÉNEMENT DE ROTATION
       * ======================================================================
       * 
       * On émet l'événement '3d-rotation' vers le composant parent avec:
       * - canvasX, canvasY: position actuelle du curseur
       * - angle: différence d'angle calculée (en degrés)
       * - mtrCoords: position du contrôle mtr (pour référence)
       * 
       * Le composant parent (DesignStudio) reçoit cet événement et applique
       * la rotation à l'objet Fabric.js correspondant.
       */
      emit('3d-rotation', {
        canvasX: canvasCoords.x,           // Position X actuelle du curseur
        canvasY: canvasCoords.y,           // Position Y actuelle du curseur
        angle: angleDelta,                 // Angle de rotation à appliquer (en degrés)
        mtrCoords: rotationStartPosition   // Position du mtr (pour référence)
      })
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
    if (isRotating3D) {
      emit('3d-rotation-end')
      isRotating3D = false
      rotationStartPosition = null
      rotationStartCursor = null
      rotationCenter = null  // Réinitialiser le centre calculé
      rotationJustEnded = true
      rotationEndTime = Date.now()
      
      // Remettre le curseur normal
      if (renderer && renderer.domElement) {
        const defaultCursor = props.dragMode ? 'move' : 'default'
        renderer.domElement.style.setProperty('cursor', defaultCursor, 'important')
      }
      
      // Réactiver COMPLÈTEMENT les contrôles OrbitControls
      if (controls) {
        controls.enabled = true         // Réactiver tous les contrôles
        controls.enableRotate = true    // Réactiver spécifiquement la rotation
        console.log('🔓 OrbitControls réactivés après la rotation')
      }
      
      // Réinitialiser le flag après un délai
      setTimeout(() => {
        rotationJustEnded = false
      }, 200)
    }
    
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
    if (isDragging3D || isResizing3D || isRotating3D) return
    
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
          // Vérifier si on clique sur le contrôle de rotation (mtr) de l'élément sélectionné
          let isRotationClick = false
          if (selectedObjectCoords.value.show && selectedObjectCoords.value.controls && selectedObjectCoords.value.controls.mtr) {
            const mtrX = selectedObjectCoords.value.controls.mtr.x
            const mtrY = selectedObjectCoords.value.controls.mtr.y
            const cursorX = canvasCoords.x
            const cursorY = canvasCoords.y
            
            // Calculer la distance entre le clic et le mtr
            const distance = Math.sqrt(Math.pow(cursorX - mtrX, 2) + Math.pow(cursorY - mtrY, 2))
            
            // Seuil de proximité pour considérer qu'on clique sur le mtr (en pixels)
            const clickThreshold = 10
            
            if (distance <= clickThreshold) {
              isRotationClick = true
              // Émettre un événement spécial pour activer la rotation
              console.log('3d-rotation-click');
              emit('3d-rotation-click', {
                intersection,
                canvasX: canvasCoords.x,
                canvasY: canvasCoords.y,
                uv: intersection.uv,
                mesh: clickedMesh,
                mtrCoords: selectedObjectCoords.value.controls.mtr
              })
            }
          }
          
          // Si on est en mode placement, émettre l'événement pour placer l'élément
          if (!isRotationClick && props.placementMode && props.placementType) {
            emit('3d-click', {
              intersection,
              canvasX: canvasCoords.x,
              canvasY: canvasCoords.y,
              uv: intersection.uv,
              mesh: clickedMesh,
              placementType: props.placementType
            })
          } else if (!isRotationClick) {
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
    // Réduction supplémentaire de 20% (multiplier par 0.8)
    const scale = (1.3 / maxDim) * 0.8
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
            opacity: 0.9, // Opacité élevée pour que les éléments soient visibles (les zones transparentes restent transparentes grâce à alphaTest)
            alphaTest: 0.01, // Seuil alpha très bas : pixels avec alpha > 0.01 sont rendus, zones vraiment transparentes (alpha < 0.01) sont complètement invisibles
            metalness: 0.3, // Légèrement métallique pour voir les réflexions
            roughness: 0.7 // Surface légèrement rugueuse
          })
        } else {
          // S'assurer que le matériau existant est aussi transparent
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              mat.transparent = true
              mat.opacity = 0.9 // Opacité élevée pour que les éléments soient visibles
              mat.alphaTest = 0.01 // Seuil alpha très bas : pixels avec alpha > 0.01 sont rendus
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.envMap = environmentMap
                mat.metalness = mat.metalness !== undefined ? mat.metalness : 0.3
                mat.roughness = mat.roughness !== undefined ? mat.roughness : 0.7
              }
            })
          } else {
            child.material.transparent = true
            child.material.opacity = 0.9 // Opacité élevée pour que les éléments soient visibles
            child.material.alphaTest = 0.01 // Seuil alpha très bas : pixels avec alpha > 0.01 sont rendus
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

    // Faire tourner le gobelet de 180 degrés au début pour voir l'arrière
    obj.rotation.y = Math.PI  // 180 degrés en radians

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
            mat.opacity = 0.9 // Opacité élevée pour que les éléments soient visibles
            mat.alphaTest = 0.01 // Seuil alpha très bas : pixels avec alpha > 0.01 sont rendus
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
              opacity: 0.9, // Opacité élevée pour que les éléments soient visibles
              alphaTest: 0.01, // Seuil alpha très bas : pixels avec alpha > 0.01 sont rendus
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
          child.material.opacity = 0.9 // Opacité élevée pour que les éléments soient visibles
          child.material.alphaTest = 0.01 // Seuil alpha très bas : pixels avec alpha > 0.01 sont rendus
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
            opacity: 0.9, // Opacité élevée pour que les éléments soient visibles
            alphaTest: 0.01, // Seuil alpha très bas : pixels avec alpha > 0.01 sont rendus
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
  // Éviter les mises à jour récursives
  if (isUpdatingSelectedObject) {
    return
  }
  
  if (!obj) {
    isUpdatingSelectedObject = true
    selectedObjectCoords.value.show = false
    isNearRotationHandle.value = false
    isUpdatingSelectedObject = false
    return
  }
  
  isUpdatingSelectedObject = true
  
  try {
    // Calculer les dimensions réelles avec le scale
    const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
    const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
    
    // Calculer les coordonnées des contrôles
    // Utiliser skipSetCoords = true pour éviter les boucles récursives
    // calcCoords() recalcule les coordonnées à partir de l'état actuel sans déclencher d'événements
    const controls = calculateControlCoordinates(obj, true)
    
    selectedObjectCoords.value = {
      show: true,
      type: obj.type || 'unknown',
      left: obj.left || 0,
      top: obj.top || 0,
      width: objWidth,
      height: objHeight,
      scaleX: obj.scaleX || 1,
      scaleY: obj.scaleY || 1,
      angle: obj.angle || 0,
      opacity: obj.opacity !== undefined ? obj.opacity : 1.0,
      controls: controls,
      originX: obj.originX || 'left',
      originY: obj.originY || 'top'
    }
  } finally {
    // Utiliser nextTick pour s'assurer que la mise à jour est terminée avant de réinitialiser le garde
    nextTick(() => {
      isUpdatingSelectedObject = false
    })
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
 * Calcule les coordonnées de tous les contrôles pour un objet Fabric.js
 * @param {fabric.Object} obj - L'objet Fabric.js
 * @param {boolean} skipSetCoords - Si true, ne pas appeler setCoords() pour éviter les boucles récursives
 * @returns {Object} - Objet contenant les coordonnées de tous les contrôles
 */
const calculateControlCoordinates = (obj, skipSetCoords = false) => {
  if (!obj) return {}
  
  // Toujours recalculer les coordonnées pour avoir les valeurs à jour (notamment après rotation)
  let coords = null
  try {
    // Même si skipSetCoords est true, on doit s'assurer que les coordonnées sont à jour
    // calcCoords() recalcule à partir de l'état actuel (angle, scale, position) sans déclencher d'événements
    // C'est la méthode recommandée pour obtenir des coordonnées à jour sans risque de boucle récursive
    coords = obj.calcCoords ? obj.calcCoords() : null
    
    // Si calcCoords() n'est pas disponible ou retourne null, utiliser oCoords
    // Mais seulement si skipSetCoords est false, sinon on risque une boucle récursive
    if (!coords || !coords.tl) {
      if (!skipSetCoords && obj.setCoords) {
        obj.setCoords()
        coords = obj.oCoords || (obj.calcCoords ? obj.calcCoords() : null)
      } else if (obj.oCoords) {
        coords = obj.oCoords
      }
    }
  } catch (e) {
    console.warn('Erreur lors de calcCoords:', e)
    // Si calcCoords échoue, essayer oCoords
    coords = obj.oCoords || null
  }
  
  if (!coords || !coords.tl) return {}
  
  const controls = {}
  
  // Coins
  if (coords.tl) {
    controls.tl = { x: coords.tl.x, y: coords.tl.y }
  }
  if (coords.tr) {
    controls.tr = { x: coords.tr.x, y: coords.tr.y }
  }
  if (coords.bl) {
    controls.bl = { x: coords.bl.x, y: coords.bl.y }
  }
  if (coords.br) {
    controls.br = { x: coords.br.x, y: coords.br.y }
  }
  
  // Bords
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
  
  // Contrôle de rotation (mtr)
  if (coords.tl && coords.tr) {
    const centerTopX = (coords.tl.x + coords.tr.x) / 2
    const centerTopY = (coords.tl.y + coords.tr.y) / 2
    const dx = coords.tr.x - coords.tl.x
    const dy = coords.tr.y - coords.tl.y
    const length = Math.sqrt(dx * dx + dy * dy)
    
    if (Math.abs(dy) < 0.01) {
      // Rectangle non roté
      controls.mtr = { 
        x: centerTopX, 
        y: centerTopY - 30 
      }
    } else {
      // Rectangle roté : utiliser (dy, -dx) pour pointer vers le haut
      // Cela garantit que mtr est toujours au-dessus du bord (côté opposé à bl)
      const offset = 30
      controls.mtr = { 
        x: centerTopX + (dy / length) * offset, 
        y: centerTopY - (dx / length) * offset 
      }
    }
  }
  
  return controls
}

/**
 * Met à jour la liste de tous les objets depuis le canvas Fabric.js
 * Cette fonction sera appelée depuis DesignStudio
 */
const updateObjectsListFromCanvas = (objects) => {
  // Éviter les mises à jour récursives
  if (isUpdatingObjectsList) {
    return
  }
  
  if (!objects || !Array.isArray(objects)) {
    isUpdatingObjectsList = true
    allObjectsList.value = []
    nextTick(() => {
      isUpdatingObjectsList = false
    })
    return
  }
  
  isUpdatingObjectsList = true
  
  try {
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
        
        // Calculer les coordonnées des contrôles (skipSetCoords = true pour éviter les boucles récursives)
        const controls = calculateControlCoordinates(obj, true)
        
        // Calculer le centre géométrique réel de l'élément
        // Le centre est l'intersection des diagonales, ce qui reste fixe même après rotation
        let centerX = 0
        let centerY = 0
        
        if (controls.tl && controls.tr && controls.bl && controls.br) {
          // Calculer l'intersection des deux diagonales (tl->br et tr->bl)
          // Cela donne toujours le centre géométrique réel, même après rotation
          const x1 = controls.tl.x, y1 = controls.tl.y  // Point 1 de la première diagonale
          const x2 = controls.br.x, y2 = controls.br.y  // Point 2 de la première diagonale
          const x3 = controls.tr.x, y3 = controls.tr.y  // Point 1 de la deuxième diagonale
          const x4 = controls.bl.x, y4 = controls.bl.y  // Point 2 de la deuxième diagonale
          
          // Formule d'intersection de deux segments de ligne
          const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
          if (Math.abs(denom) > 0.001) {
            const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
            centerX = x1 + t * (x2 - x1)
            centerY = y1 + t * (y2 - y1)
          } else {
            // Fallback : moyenne des 4 coins si les diagonales sont parallèles
            centerX = (controls.tl.x + controls.tr.x + controls.bl.x + controls.br.x) / 4
            centerY = (controls.tl.y + controls.tr.y + controls.bl.y + controls.br.y) / 4
          }
        } else {
          // Fallback : utiliser left/top + width/height si les contrôles ne sont pas disponibles
          const originX = obj.originX || 'left'
          const originY = obj.originY || 'top'
          const objLeft = obj.left || 0
          const objTop = obj.top || 0
          
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
          
          centerX = actualLeft + objWidth / 2
          centerY = actualTop + objHeight / 2
        }
        
        return {
          id: obj.id || `obj-${index}`,
          type: obj.type || 'unknown',
          left: obj.left || 0,
          top: obj.top || 0,
          width: objWidth,
          height: objHeight,
          opacity: obj.opacity !== undefined ? obj.opacity : 1.0,
          isSelected: isSelected,
          controls: controls,
          centerX: centerX,
          centerY: centerY
        }
      })
  } finally {
    // Utiliser nextTick pour s'assurer que la mise à jour est terminée avant de réinitialiser le garde
    nextTick(() => {
      isUpdatingObjectsList = false
    })
  }
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
  
  console.log('🔄 Rotation 3D - Angle:', angleDegrees, '° (', angleRadians, 'rad)')
  
  // Méthode 1 : Utiliser setRotationFromEuler (plus propre et explicite)
  // Créer un Euler avec rotation uniquement autour de l'axe Y
  const euler = new THREE.Euler(0, angleRadians, 0, 'XYZ')
  currentMesh.setRotationFromEuler(euler)
  
  // Alternative : Méthode 2 - Utiliser rotateOnAxis (rotation additive)
  // const axis = new THREE.Vector3(0, 1, 0) // Axe Y (vertical)
  // currentMesh.rotateOnAxis(axis, angleRadians)
  
  // Alternative : Méthode 3 - Utiliser rotation.y directement (méthode actuelle)
  // currentMesh.rotation.y = angleRadians
  
  // Mettre à jour les contrôles pour que la caméra suive la rotation
  if (controls) {
    // Optionnel : faire tourner aussi la caméra pour suivre le modèle
    // controls.update()
  }
}

/**
 * Mise à jour DIRECTE de la texture (solution la plus rapide)
 * 
 * Cette méthode met à jour la texture directement sans passer par le store réactif Vue.
 * Élimine la latence de la réactivité Vue pour les événements fréquents.
 * 
 * Performance : ~0-16ms (vs ~16-33ms avec le store)
 * 
 * @param {boolean} immediate - Si true, force la mise à jour immédiatement
 */
const updateTextureDirect = (immediate = false) => {
  if (!canvasTexture) return
  
  // Mise à jour directe de la texture (bypass du store réactif)
  canvasTexture.needsUpdate = true
  
  // Si immediate, on peut forcer un rendu immédiat (optionnel)
  if (immediate && renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

/**
 * Réduit la taille du modèle 3D actuellement chargé
 * @param {number} scaleFactor - Facteur de réduction (ex: 0.8 pour réduire de 20%)
 */
const scaleModel = (scaleFactor = 0.8) => {
  if (!currentMesh) return
  
  // Appliquer le scale au modèle
  currentMesh.scale.multiplyScalar(scaleFactor)
  
  // Mettre à jour les contrôles de la caméra si nécessaire
  if (controls) {
    controls.update()
  }
}

/**
 * Définit si le curseur survole le contrôle de rotation
 * @param {boolean} isHovering - true si on survole le contrôle de rotation
 */
const setRotationHandleHover = (isHovering) => {
  coordinatesDisplay.value.isOnRotationHandle = isHovering
}

/**
 * Met à jour l'état de débogage pour afficher le contrôle détecté
 * @param {Object|null} handleInfo - Informations sur le contrôle détecté ou null
 * @param {number|null} distance - Distance au contrôle (optionnel)
 * @param {number|null} x - Coordonnée X du contrôle (optionnel)
 * @param {number|null} y - Coordonnée Y du contrôle (optionnel)
 */
const setDetectedControl = (handleInfo, distance = null, x = null, y = null) => {
  if (!handleInfo) {
    detectedControl.value = {
      show: false,
      handle: null,
      corner: null,
      edge: null,
      isRotation: false,
      distance: null,
      x: null,
      y: null
    }
    return
  }

  detectedControl.value = {
    show: true,
    handle: handleInfo.handle || null,
    corner: handleInfo.corner || null,
    edge: handleInfo.edge || null,
    isRotation: handleInfo.isRotation || false,
    distance: distance,
    x: x,
    y: y
  }
}

/**
 * Prépare le matériau pour supporter le shader de decal
 * Cette fonction injecte le code GLSL dans le shader standard de Three.js
 */
const patchMaterialForDecal = (material) => {
  if (material.userData.isPatched) return
  
  material.onBeforeCompile = (shader) => {
    // 1. Ajouter nos uniforms
    shader.uniforms.uDecalMap = shaderUniforms.uDecalMap
    shader.uniforms.uDecalVisible = shaderUniforms.uDecalVisible
    shader.uniforms.uDecalCenter = shaderUniforms.uDecalCenter
    shader.uniforms.uDecalScale = shaderUniforms.uDecalScale
    shader.uniforms.uDecalAngle = shaderUniforms.uDecalAngle
    
    // 2. Déclarer les uniforms et la fonction de rotation dans le Fragment Shader
    shader.fragmentShader = `
      uniform sampler2D uDecalMap;
      uniform float uDecalVisible;
      uniform vec2 uDecalCenter;
      uniform vec2 uDecalScale;
      uniform float uDecalAngle;
      
      // Fonction pour tourner un point autour d'un centre
      vec2 rotateUV(vec2 uv, float rotation, vec2 center) {
        float c = cos(rotation);
        float s = sin(rotation);
        mat2 rotMat = mat2(c, -s, s, c);
        return rotMat * (uv - center) + center;
      }
    ` + shader.fragmentShader
    
    // 3. Injecter la logique de compositing
    // On remplace la fin du calcul de la couleur de base (map_fragment)
    // pour ajouter notre couche par dessus
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #include <map_fragment>
      
      if (uDecalVisible > 0.5) {
        // Calculer les UVs transformés pour le decal
        // 1. Centrer sur le point de pivot (uDecalCenter)
        vec2 centeredUv = vMapUv - uDecalCenter;
        
        // 2. Appliquer la rotation
        // Note: On inverse l'angle pour matcher le sens horaire
        float c = cos(-uDecalAngle);
        float s = sin(-uDecalAngle);
        vec2 rotatedUv = vec2(
          centeredUv.x * c - centeredUv.y * s,
          centeredUv.x * s + centeredUv.y * c
        );
        
        // 3. Appliquer l'échelle (inverse car on transforme les coordonnées, pas l'image)
        vec2 finalUv = rotatedUv / uDecalScale;
        
        // 4. Ramener dans l'espace texture (0-1)
        // Le centre de la texture decal est (0.5, 0.5)
        finalUv += vec2(0.5, 0.5);
        
        // Vérifier si on est dans les bornes de la texture decal
        if (finalUv.x >= 0.0 && finalUv.x <= 1.0 && finalUv.y >= 0.0 && finalUv.y <= 1.0) {
          vec4 decalColor = texture2D(uDecalMap, finalUv);
          
          // Mélange alpha (Compositing)
          // diffuseColor est la variable de Three.js qui contient la couleur accumulée
          diffuseColor.rgb = mix(diffuseColor.rgb, decalColor.rgb, decalColor.a);
        }
      }
      `
    )
  }
  
  material.userData.isPatched = true
  // Forcer la recompilation
  material.needsUpdate = true
}

/**
 * Démarre la rotation optimisée via Shader
 */
const startDecalRotation = async (objectProps, dataUrl) => {
  if (!currentMesh || !dataUrl || !scene) return

  try {
    // 1. Charger la texture
    const textureLoader = new THREE.TextureLoader()
    const texture = await textureLoader.loadAsync(dataUrl)
    
    // 2. S'assurer que le matériau est patché
    let targetMaterial = null
    currentMesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        targetMaterial = child.material
      }
    })
    
    if (targetMaterial) {
      patchMaterialForDecal(targetMaterial)
    }
    
    // 3. Calculer les coordonnées UV du centre
    const canvasWidth = props.canvas2D ? props.canvas2D.width : 800
    const canvasHeight = props.canvas2D ? props.canvas2D.height : 600
    
    // ✅ IMPORTANT: left et top sont maintenant le CENTRE de l'objet
    // (pas le coin supérieur gauche)
    const centerX = objectProps.left  // Déjà le centre X
    const centerY = objectProps.top   // Déjà le centre Y
    
    const centerU = centerX / canvasWidth
    // Inversion Y standard pour les UVs
    const centerV = 1 - (centerY / canvasHeight)
    
    // 4. Calculer l'échelle UV
    // Quelle portion de l'espace UV (0-1) l'objet occupe-t-il ?
    const scaleU = objectProps.width / canvasWidth
    const scaleV = objectProps.height / canvasHeight
    
    // 5. Mettre à jour les uniforms
    shaderUniforms.uDecalMap.value = texture
    shaderUniforms.uDecalCenter.value.set(centerU, centerV)
    shaderUniforms.uDecalScale.value.set(scaleU, scaleV)
    shaderUniforms.uDecalAngle.value = objectProps.angle * (Math.PI / 180)
    shaderUniforms.uDecalVisible.value = 1
    
  } catch (e) {
    console.error("Erreur setup shader:", e)
  }
}

const updateDecalRotation = (absoluteAngle) => {
  // Mise à jour ultra-rapide via uniform (GPU)
  shaderUniforms.uDecalAngle.value = absoluteAngle * (Math.PI / 180)
}

const endDecalRotation = () => {
  // Cacher le decal
  shaderUniforms.uDecalVisible.value = 0
  shaderUniforms.uDecalMap.value = null
}

/**
 * ============================================================================
 * FONCTION: handleAddRectangleClick
 * ============================================================================
 * 
 * Gère le clic sur le bouton "+ Rectangle" dans la vue 3D.
 * 
 * FONCTIONNEMENT:
 * - Si le mode placement de rectangle est déjà actif, on le désactive
 * - Sinon, on émet un événement 'add-rectangle-click' vers le composant parent
 *   pour activer le mode placement de rectangle
 * 
 * Le composant parent (DesignStudio.vue) recevra cet événement et:
 * 1. Activera le mode placement dans FabricDesigner
 * 2. Mettra à jour les props placementMode et placementType
 * 3. L'utilisateur pourra alors cliquer sur le modèle 3D pour placer le rectangle
 */
const handleAddRectangleClick = () => {
  // Si le mode placement de rectangle est déjà actif, le désactiver
  if (props.placementMode && props.placementType === 'rectangle') {
    emit('add-rectangle-click', { active: false })
  } else {
    // Sinon, activer le mode placement de rectangle
    emit('add-rectangle-click', { active: true })
  }
}

/**
 * Désactiver OrbitControls (empêcher la rotation du goblet)
 */
const disableOrbitControls = () => {
  if (controls) {
    controls.enabled = false
    controls.enableRotate = false
    console.log('🔒 OrbitControls désactivés')
  }
}

/**
 * Réactiver OrbitControls (permettre la rotation du goblet)
 */
const enableOrbitControls = () => {
  if (controls) {
    controls.enabled = true
    controls.enableRotate = true
    console.log('🔓 OrbitControls réactivés')
  }
}

defineExpose({
  startDecalRotation,
  updateDecalRotation,
  endDecalRotation,
  disableOrbitControls,  // ✅ NOUVEAU
  enableOrbitControls,   // ✅ NOUVEAU
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
  scaleModel,
  setRotationHandleHover,
  setDetectedControl,
  resetRotationState,
  updateTextureDirect, // Méthode pour mise à jour directe (plus rapide)
  renderer: () => renderer,
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

/* Bouton flottant pour ajouter un rectangle */
.add-rectangle-btn {
  position: absolute;
  bottom: 30px;
  right: 30px;
  z-index: 999;
  
  /* Style du bouton */
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  
  /* Couleurs */
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 50px;
  
  /* Typographie */
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  font-weight: 600;
  
  /* Effets */
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  
  /* Empêcher la sélection du texte */
  user-select: none;
  -webkit-user-select: none;
}

.add-rectangle-btn:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
}

.add-rectangle-btn:active {
  transform: translateY(0) scale(0.98);
  box-shadow: 0 2px 10px rgba(102, 126, 234, 0.4);
}

/* État actif (mode placement activé) */
.add-rectangle-btn.active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
  animation: pulse 2s ease-in-out infinite;
}

.add-rectangle-btn.active:hover {
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.6);
}

/* Animation de pulsation pour l'état actif */
@keyframes pulse {
  0%, 100% {
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
  }
  50% {
    box-shadow: 0 4px 25px rgba(16, 185, 129, 0.8);
  }
}

.add-rectangle-btn .btn-icon {
  font-size: 18px;
  line-height: 1;
}

.add-rectangle-btn .btn-text {
  line-height: 1;
  white-space: nowrap;
}

/* Responsive: réduire le bouton sur petits écrans */
@media (max-width: 768px) {
  .add-rectangle-btn {
    padding: 10px 16px;
    font-size: 12px;
    bottom: 20px;
    right: 20px;
  }
  
  .add-rectangle-btn .btn-icon {
    font-size: 16px;
  }
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

/* Style quand le curseur est sur le contrôle de rotation */
.coordinates-display.on-rotation {
  background: rgba(255, 165, 0, 0.9) !important; /* Fond orange */
  border: 2px solid #ff8c00; /* Bordure orange foncé */
  color: #fff;
  box-shadow: 0 4px 16px rgba(255, 165, 0, 0.5); /* Ombre orange */
}

.coordinates-display.on-rotation .coord-title {
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

.controls-section {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.controls-title {
  font-weight: 600;
  font-size: 10px;
  margin-bottom: 4px;
  opacity: 0.8;
}

.control-item {
  font-size: 10px;
  margin: 2px 0;
  opacity: 0.85;
}

.control-item span {
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

.rotation-active-indicator {
  background: rgba(255, 165, 0, 0.3) !important;
  border: 1px solid rgba(255, 165, 0, 0.6);
  border-radius: 4px;
  padding: 4px 8px;
  animation: pulse 1.5s ease-in-out infinite;
}

.rotation-active-indicator .coord-label {
  color: #ff8c00 !important;
  font-weight: bold;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
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

.mesh-details .controls-section {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.mesh-details .controls-title {
  font-weight: 600;
  font-size: 10px;
  margin-bottom: 4px;
  opacity: 0.8;
}

.mesh-details .control-item {
  font-size: 10px;
  margin: 2px 0;
  opacity: 0.85;
}

.mesh-details .control-item span {
  font-weight: 600;
  margin-right: 4px;
}

/* Style pour la div de débogage des contrôles */
.debug-control {
  position: absolute;
  height: 200px;
  top: 150px;
  right: 20px;
  background: rgba(139, 92, 246, 0.9);
  border: 2px solid #8b5cf6;
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

.debug-control .coord-title {
  color: #fff;
  font-weight: bold;
  margin-bottom: 8px;
}

.debug-control .coord-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.debug-control .coord-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
}

.debug-control .coord-label {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
}

.debug-control .coord-value {
  font-weight: 500;
  color: #fff;
}
</style>

