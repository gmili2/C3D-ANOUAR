<template>
  <div class="three-scene-container">
      <TresAmbientLight :intensity="0.8" />
      <TresDirectionalLight
        :position="[5, 5, 5]"
        :intensity="0.6"
      />
      <TresDirectionalLight
        :position="[-5, -5, -5]"
        :intensity="0.4"
      />
      
      <OrbitControls
        :damping-factor="cameraDamping"
        :target="[cameraTarget.x, cameraTarget.y, cameraTarget.z]"
        :min-distance="cameraMinDistance"
        :max-distance="cameraMaxDistance"
        :min-polar-angle="cameraMinPolarAngle"
        :max-polar-angle="cameraMaxPolarAngle"
        :enable-pan="false"
        :enable-rotate="orbitControlsEnabled"
        :enable-zoom="false"
      />
    </TresCanvas>
    
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

import { ref, shallowRef, computed, onMounted, onUnmounted, watch, nextTick, markRaw } from 'vue'
import * as THREE from 'three'
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { setupCanvasTexture, applyTextureToMesh, useCanvasTextureStore } from '../composables/useCanvasTexture'
import { project3DClickToCanvas } from '../composables/use3DTo2DProjection'
import TextureUpdater from './TextureUpdater.vue'
import { get3DPositionFromUV } from '../composables/use2DTo3DProjection'
import { TresCanvas, useTres } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'

const props = defineProps({
  modelUrl: {
    type: [String, File],
    default: null
  },
  texture: {
    type: THREE.Texture,
    default: null
  },
  canvas2D: {
    type: HTMLCanvasElement,
    default: null
  },
  enableDirectEdit: {
    type: Boolean,
    default: true
  },
  workZoneTop: {
    type: Number,
    default: 0.1
  },
  workZoneBottom: {
    type: Number,
    default: 0.1
  },
  placementMode: {
    type: Boolean,
    default: false
  },
  placementType: {
    type: String,
    default: null
  },
  dragMode: {
    type: Boolean,
    default: false
  },
  selectedObject: {
    type: Object,
    default: null
  }
})

const emit = defineEmits([
  'model-loaded',
  'model-error',
  'texture-ready',
  '3d-click',
  '3d-click-outside',
  'meshes-extracted',
  '3d-drag',
  '3d-drag-start',
  '3d-drag-end',
  '3d-scale',
  '3d-resize-start',
  '3d-resize',
  '3d-resize-end',
  '3d-hover',
  '3d-rotation-click',
  '3d-rotation-start',
  '3d-rotation',
  '3d-rotation-end',
  'add-rectangle-click',
  'detect-resize-handle'
])


let allMeshes = []
let activeMesh = null
let highlightedMesh = null
let currentMesh = null
const loadedMeshes = shallowRef([])

const cameraDamping = ref(0.05)
const cameraTarget = ref({ x: 0, y: 9, z: 0 })
const cameraMinDistance = ref(37)
const cameraMaxDistance = ref(50)
const cameraMinPolarAngle = ref(1.37)
const cameraMaxPolarAngle = ref(1.57)
const orbitControlsEnabled = ref(true)

let environmentMap = null
let canvasTexture = null

const canvasElement = ref(null)
const tresCanvasRef = ref(null)
const textureUpdaterRef = ref(null)

let scene = null
let camera = null
let renderer = null
let controls = null
let animationId = null
let handleResize = null
let tresContext = null

let shaderUniforms = {
  uDecalMap: { value: null },
  uDecalVisible: { value: 0 },
  uDecalCenter: { value: new THREE.Vector2(0.5, 0.5) },
  uDecalScale: { value: new THREE.Vector2(1, 1) },
  uDecalAngle: { value: 0 }
}
let isMaterialPatched = false


const coordinatesDisplay = ref({
  show: false,
  uvU: 0,
  uvV: 0,
  canvasX: 0,
  canvasY: 0,
  worldPos: null,
  isOnSeam: false,
  isOnRotationHandle: false
})

const isOnSeam = computed(() => {
  return coordinatesDisplay.value.isOnSeam || false
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
  angle: 0,
  opacity: 1.0,
  controls: {},
  originX: 'left',
  originY: 'top'
})

const isNearRotationHandle = ref(false)


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

let isUpdatingSelectedObject = false
let isUpdatingObjectsList = false

const allObjectsList = ref([])

const meshesList = ref([])
const activeMeshIndex = ref(-1)


const loadEnvironmentMap = async (url = null) => {
  const loader = new THREE.TextureLoader()
  
  try {
    if (url) {
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
      const envCanvas = document.createElement('canvas')
      envCanvas.width = 2048
      envCanvas.height = 1024
      const ctx = envCanvas.getContext('2d')
      
      const gradient = ctx.createLinearGradient(0, 0, 0, envCanvas.height)
      gradient.addColorStop(0, '#87CEEB')
      gradient.addColorStop(0.5, '#E0F6FF')
      gradient.addColorStop(1, '#FFFFFF')
      
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, envCanvas.width, envCanvas.height)
      
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
  
  
  
})

watch(() => props.selectedObject, (newObject) => {
  updateSelectedObjectCoords(newObject)
}, { deep: true })

watch(() => props.canvas2D, (newCanvas, oldCanvas) => {
  if (newCanvas && currentMesh) {
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

const onTresReady = (state) => {
  console.log('onTresReady called with state:', state)
  
  nextTick(() => {
    if (!tresCanvasRef.value) {
      console.error('tresCanvasRef.value is null')
      return
    }
    
    const tresState = tresCanvasRef.value.state || state || tresCanvasRef.value
    
    if (!tresState) {
      console.error('TresCanvas state not available')
      return
    }
    
    console.log('TresCanvas state:', tresState)
    
    scene = tresState.scene?.value || tresState.scene
    camera = tresState.camera?.value || tresState.camera
    renderer = tresState.renderer?.value || tresState.renderer
    
    console.log('Extracted objects:', { scene, camera, renderer })
    
    if (!scene || !camera || !renderer) {
      console.error('TresCanvas objects not available', { scene, camera, renderer })
      return
    }
    
    if (!camera.position) {
      console.error('Camera position not available', camera)
      return
    }
    
    camera.position.set(0, 16, 29)
    camera.fov = 75
    camera.near = 0.1
    camera.far = 1000
    camera.updateProjectionMatrix()
    
    if (scene) {
      scene.background = new THREE.Color(0xf4e8d8)
      
    }
    
    if (renderer && renderer.domElement) {
      controls = new ThreeOrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      controls.enableZoom = false
      controls.enablePan = false
      controls.enableRotate = true
      
      controls.target.set(0, 9, 0)
      controls.minDistance = 37
      controls.maxDistance = 50
      controls.minPolarAngle = 1.37
      controls.maxPolarAngle = 1.57
    }
    
    initSceneAfterTresReady()
  })
}

const initSceneAfterTresReady = () => {
  if (!scene || !camera || !renderer) return

  const canvas = renderer.domElement
  if (canvasElement.value) {
    canvasElement.value.width = canvas.width
    canvasElement.value.height = canvas.height
  }

  const { render2D, resetTextureUpdate } = useCanvasTextureStore()
  
  const animate = () => {
    animationId = requestAnimationFrame(animate)
    
    if (canvasTexture && render2D.value) {
      canvasTexture.needsUpdate = true
      resetTextureUpdate()
    }
    
    if (controls) {
      controls.update()
    }
    
    renderer.render(scene, camera)
  }
  animate()

  handleResize = () => {
    if (!renderer || !camera) return
    const canvas = renderer.domElement
    const newWidth = canvas.clientWidth
    const newHeight = canvas.clientHeight
    camera.aspect = newWidth / newHeight
    camera.updateProjectionMatrix()
    renderer.setSize(newWidth, newHeight)
  }
  
  window.addEventListener('resize', handleResize)

  addHelperGeometry()
  
  loadEnvironmentMap().then(() => {
    if (props.canvas2D) {
      setupSharedCanvasTexture(props.canvas2D)
    }
    
    if (props.modelUrl) {
      loadModel(props.modelUrl)
    }
    
    nextTick(() => {
      if (props.enableDirectEdit && renderer && renderer.domElement) {
        console.log('Setting up click handler, renderer:', renderer, 'domElement:', renderer.domElement)
        setupClickHandler()
      } else {
        console.warn('Cannot setup click handler:', { 
          enableDirectEdit: props.enableDirectEdit, 
          renderer: !!renderer, 
          domElement: !!(renderer && renderer.domElement) 
        })
      }
    })
  })
}


let raycaster3D = null
let mouse = null
let isDragging3D = false
let lastDragPosition = null
let isResizing3D = false
let resizeStartPosition = null
let resizeHandleInfo = null

let isRotating3D = false

let rotationStartPosition = null

let rotationStartCursor = null

let rotationStartAngle = null

let rotationCenter = null

let rotationJustEnded = false

let rotationEndTime = 0

const resetRotationState = () => {
  if (isRotating3D) {
  }
  
  isRotating3D = false
  
  rotationStartPosition = null
  
  rotationStartCursor = null
  
  rotationStartAngle = null
  
  rotationCenter = null
  
  rotationJustEnded = false
  
  rotationEndTime = 0
  
  if (renderer && renderer.domElement) {
    const defaultCursor = props.dragMode ? 'move' : 'default'
    
    renderer.domElement.style.setProperty('cursor', defaultCursor, 'important')
  }
  
  if (controls) {
    controls.enabled = true
    controls.enableRotate = true
  }
}

const setupClickHandler = () => {
  if (!renderer || !renderer.domElement) {
    console.error('setupClickHandler: renderer or domElement not available')
    return
  }
  
  if (!raycaster3D) {
    raycaster3D = new THREE.Raycaster()
    mouse = new THREE.Vector2()
  }
  
  const getCanvasCoords = (event) => {
    if (!props.canvas2D || !raycaster3D) return null
    
    const canvas = renderer.domElement
    const rect = canvas.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    raycaster3D.setFromCamera(mouse, camera)
    
    let intersects = []
    if (loadedMeshes.value.length > 0) {
      for (const mesh of loadedMeshes.value) {
        const meshIntersects = raycaster3D.intersectObject(mesh, true)
        if (meshIntersects.length > 0) {
          intersects = meshIntersects
          break
        }
      }
    } else if (activeMesh) {
      intersects = raycaster3D.intersectObject(activeMesh, true)
    } else if (currentMesh) {
      intersects = raycaster3D.intersectObject(currentMesh, true)
    }
    
    if (intersects.length > 0) {
      const intersection = intersects[0]
      if (intersection.uv) {
        const canvasWidth = props.canvas2D.width || 800
        const canvasHeight = props.canvas2D.height || 600
        
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
    console.log('onMouseDown called', { 
      isDragging3D, 
      isResizing3D, 
      isRotating3D, 
      dragMode: props.dragMode,
      placementMode: props.placementMode 
    })
    
    if (isRotating3D) {
      event.stopPropagation()
      event.preventDefault()
      console.log('🚫 Événement mousedown bloqué - rotation en cours')
    }
    
    if (!props.dragMode) return
    
    const canvasCoords = getCanvasCoords(event)
    if (canvasCoords !== null) {
      if (isRotating3D) {
        if (selectedObjectCoords.value.show && selectedObjectCoords.value.controls && selectedObjectCoords.value.controls.mtr) {
          const mtrX = selectedObjectCoords.value.controls.mtr.x
          const mtrY = selectedObjectCoords.value.controls.mtr.y
          const cursorX = canvasCoords.x
          const cursorY = canvasCoords.y
          
          const distance = Math.sqrt(Math.pow(cursorX - mtrX, 2) + Math.pow(cursorY - mtrY, 2))
          const clickThreshold = 25
          
          if (distance > clickThreshold) {
            emit('3d-rotation-end')
            isRotating3D = false
            rotationStartPosition = null
            rotationStartCursor = null
            
            if (controls) {
              controls.enabled = true
            }
          }
        } else {
          emit('3d-rotation-end')
          isRotating3D = false
          rotationStartPosition = null
          rotationStartCursor = null
          
          if (controls) {
            controls.enabled = true
          }
        }
      }
      
      
      const timeSinceRotationEnd = Date.now() - rotationEndTime
      
      const minTimeBetweenRotationAndDrag = 100
      
      if (!rotationJustEnded && timeSinceRotationEnd > minTimeBetweenRotationAndDrag && 
          selectedObjectCoords.value.show && selectedObjectCoords.value.controls && selectedObjectCoords.value.controls.mtr) {
        
        const mtrX = selectedObjectCoords.value.controls.mtr.x
        const mtrY = selectedObjectCoords.value.controls.mtr.y
        
        const cursorX = canvasCoords.x
        const cursorY = canvasCoords.y
        
        const distance = Math.sqrt(Math.pow(cursorX - mtrX, 2) + Math.pow(cursorY - mtrY, 2))
        
        const clickThreshold = 10
        
        if (distance <= clickThreshold) {
          
          isRotating3D = true
          
          rotationJustEnded = false
          
          rotationStartPosition = { x: mtrX, y: mtrY }
          
          rotationStartCursor = { x: cursorX, y: cursorY }
          
          const controls = selectedObjectCoords.value.controls || {}
          let centerX, centerY
          
          if (controls.tl && controls.tr && controls.bl && controls.br) {
            const x1 = controls.tl.x, y1 = controls.tl.y
            const x2 = controls.br.x, y2 = controls.br.y
            const x3 = controls.tr.x, y3 = controls.tr.y
            const x4 = controls.bl.x, y4 = controls.bl.y
            
            const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
            
            if (Math.abs(denom) > 0.001) {
              const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
              centerX = x1 + t * (x2 - x1)
              centerY = y1 + t * (y2 - y1)
            } else {
              centerX = (x1 + x2 + x3 + x4) / 4
              centerY = (y1 + y2 + y3 + y4) / 4
            }
          } else {
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
          
          rotationCenter = { x: centerX, y: centerY }
          
          console.log('🎯 Centre géométrique calculé au début de la rotation:', rotationCenter)
          
          if (controls) {
            controls.enabled = false
            controls.enableRotate = false
            console.log('🔒 OrbitControls désactivés pendant la rotation')
          }
          
          console.log('3d-rotation-start',canvasCoords.x,canvasCoords.y,selectedObjectCoords.value.controls.mtr,rotationStartCursor);
          
          emit('3d-rotation-start', {
            canvasX: canvasCoords.x,
            canvasY: canvasCoords.y,
            mtrCoords: selectedObjectCoords.value.controls.mtr
          })
          
          return
        }
      }
      
      if (isRotating3D) {
        console.log('3d-rotation-end');
        emit('3d-rotation-end')
        isRotating3D = false
        rotationStartPosition = null
        rotationStartCursor = null
        
        if (controls) {
          controls.enabled = true
        }
      }
      
      
      let isResizeClick = false
      let handleInfo = null
      
      const detectResizeResult = { isResize: false, handleInfo: null }
      emit('detect-resize-handle', {
        canvasX: canvasCoords.x,
        canvasY: canvasCoords.y,
        result: detectResizeResult
      })
      if (detectResizeResult.isResize && detectResizeResult.handleInfo) {
        isResizeClick = true
        handleInfo = detectResizeResult.handleInfo
        
        isResizing3D = true
        isDragging3D = false
        resizeStartPosition = { x: canvasCoords.x, y: canvasCoords.y }
        resizeHandleInfo = handleInfo
        
        emit('3d-resize-start', {
          canvasX: canvasCoords.x,
          canvasY: canvasCoords.y,
          handleInfo: handleInfo
        })
        
        console.log('🔧 Mode RESIZE activé', handleInfo)
      } else {
        isDragging3D = true
        isResizing3D = false
        
        emit('3d-drag-start', {
          canvasX: canvasCoords.x,
          canvasY: canvasCoords.y
        })
        
        console.log('✋ Mode DRAG activé')
      }
      
      lastDragPosition = canvasCoords
      
      if (controls) {
        controls.enabled = false
      }
    }
  }
  
  const onMouseMove = (event) => {
    if (isDragging3D || isResizing3D || isRotating3D) {
      console.log('onMouseMove - action active', { isDragging3D, isResizing3D, isRotating3D })
    }
    if (isRotating3D) {
      event.stopPropagation()
      event.preventDefault()
    }
    
    const canvasCoords = getCanvasCoords(event)
    
    if (canvasCoords !== null && props.canvas2D && raycaster3D && renderer) {
      const canvas = renderer.domElement
      const rect = canvas.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      
      raycaster3D.setFromCamera(mouse, camera)
      
      let intersects = []
      if (loadedMeshes.value.length > 0) {
        for (const mesh of loadedMeshes.value) {
          const meshIntersects = raycaster3D.intersectObject(mesh, true)
          if (meshIntersects.length > 0) {
            intersects = meshIntersects
            break
          }
        }
      } else if (activeMesh) {
        intersects = raycaster3D.intersectObject(activeMesh, true)
      } else if (currentMesh) {
        intersects = raycaster3D.intersectObject(currentMesh, true)
      }
      
      if (intersects.length > 0 && intersects[0].uv) {
        const intersection = intersects[0]
        
        const canvasWidth = props.canvas2D.width || 800
        const canvasHeight = props.canvas2D.height || 600
        const textureWidth = canvasTexture?.image?.width || canvasWidth
        const textureHeight = canvasTexture?.image?.height || canvasHeight
        
        const uvU = intersection.uv.x
        const seamThreshold = 0.01
        const isOnSeamValue = uvU < seamThreshold || uvU > (1 - seamThreshold)
        
        coordinatesDisplay.value = {
          show: true,
          uvU: uvU,
          uvV: intersection.uv.y,
          canvasX: canvasCoords.x,
          canvasY: canvasCoords.y,
          isOnSeam: isOnSeamValue,
          isOnRotationHandle: coordinatesDisplay.value.isOnRotationHandle || false,
          worldPos: {
            x: intersection.point.x,
            y: intersection.point.y,
            z: intersection.point.z
          }
        }
        
        if (selectedObjectCoords.value.show && selectedObjectCoords.value.controls && selectedObjectCoords.value.controls.mtr) {
          const mtrX = selectedObjectCoords.value.controls.mtr.x
          const mtrY = selectedObjectCoords.value.controls.mtr.y
          const cursorX = canvasCoords.x
          const cursorY = canvasCoords.y
          
          const distance = Math.sqrt(Math.pow(cursorX - mtrX, 2) + Math.pow(cursorY - mtrY, 2))
          
          const proximityThreshold = 20
          
          if (distance <= proximityThreshold) {
            if (!isNearRotationHandle.value) {
              isNearRotationHandle.value = true
            }
          } else {
            isNearRotationHandle.value = false
          }
        } else {
          isNearRotationHandle.value = false
        }


        
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
    
    if (canvasCoords !== null) {
      emit('3d-hover', {
        canvasX: canvasCoords.x,
        canvasY: canvasCoords.y
      })
    }
    
    if (!props.dragMode) {
      return
    }
    
    if (isRotating3D && canvasCoords !== null && rotationStartPosition && rotationStartCursor && selectedObjectCoords.value.show && rotationCenter) {
      
      const centerX = rotationCenter.x
      const centerY = rotationCenter.y
      
      console.log('🎯 Utilisation du centre pré-calculé:', centerX, centerY)
      
      
      const startDx = rotationStartCursor.x - centerX
      const startDy = rotationStartCursor.y - centerY
      
      const currentDx = canvasCoords.x - centerX
      const currentDy = canvasCoords.y - centerY
      
      const startAngle = Math.atan2(startDy, startDx) * (180 / Math.PI)
      
      const currentAngle = Math.atan2(currentDy, currentDx) * (180 / Math.PI)
      
      
      let angleDelta = currentAngle - startAngle
      
      if (angleDelta > 180) angleDelta -= 360
      if (angleDelta < -180) angleDelta += 360
      
      emit('3d-rotation', {
        canvasX: canvasCoords.x,
        canvasY: canvasCoords.y,
        angle: angleDelta,
        mtrCoords: rotationStartPosition
      })
    }
    
    if (isDragging3D || isResizing3D) {
      if (canvasCoords !== null) {
        if (isResizing3D && resizeStartPosition && resizeHandleInfo) {
          emit('3d-resize', {
            canvasX: canvasCoords.x,
            canvasY: canvasCoords.y,
            startX: resizeStartPosition.x,
            startY: resizeStartPosition.y,
            handleInfo: resizeHandleInfo
          })
        } else if (isDragging3D) {
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
      rotationCenter = null
      rotationJustEnded = true
      rotationEndTime = Date.now()
      
      if (renderer && renderer.domElement) {
        const defaultCursor = props.dragMode ? 'move' : 'default'
        renderer.domElement.style.setProperty('cursor', defaultCursor, 'important')
      }
      
      if (controls) {
        controls.enabled = true
        controls.enableRotate = true
        console.log('🔓 OrbitControls réactivés après la rotation')
      }
      
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
      
      if (renderer && renderer.domElement) {
        const defaultCursor = props.dragMode ? 'move' : 'default'
        renderer.domElement.style.setProperty('cursor', defaultCursor, 'important')
      }
      
      if (controls) {
        controls.enabled = true
      }
    }
  }
  
  const onCanvasClick = (event) => {
    if (isDragging3D || isResizing3D || isRotating3D) return
    
    if (!props.canvas2D || !raycaster3D || !renderer) return
    
    const canvas = renderer.domElement
    const rect = canvas.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    raycaster3D.setFromCamera(mouse, camera)
    
    let intersects = []
    let targetObject = null
    
    if (loadedMeshes.value.length > 0) {
      for (const mesh of loadedMeshes.value) {
        const meshIntersects = raycaster3D.intersectObject(mesh, true)
        if (meshIntersects.length > 0) {
          intersects = meshIntersects
          targetObject = mesh
          break
        }
      }
    } else if (activeMesh) {
      targetObject = activeMesh
      intersects = raycaster3D.intersectObject(activeMesh, true)
    } else if (currentMesh) {
      targetObject = currentMesh
      intersects = raycaster3D.intersectObject(currentMesh, true)
    }
    
    if (intersects.length > 0) {
      const intersection = intersects[0]
      
      let clickedMesh = intersection.object
      while (clickedMesh && !(clickedMesh instanceof THREE.Mesh)) {
        clickedMesh = clickedMesh.parent
      }
      
      
      if (intersection.uv) {
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
          let isRotationClick = false
          if (selectedObjectCoords.value.show && selectedObjectCoords.value.controls && selectedObjectCoords.value.controls.mtr) {
            const mtrX = selectedObjectCoords.value.controls.mtr.x
            const mtrY = selectedObjectCoords.value.controls.mtr.y
            const cursorX = canvasCoords.x
            const cursorY = canvasCoords.y
            
            const distance = Math.sqrt(Math.pow(cursorX - mtrX, 2) + Math.pow(cursorY - mtrY, 2))
            
            const clickThreshold = 10
            
            if (distance <= clickThreshold) {
              isRotationClick = true
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
        if (clickedMesh && clickedMesh.geometry) {
          if (currentMesh) {
            currentMesh.traverse((mesh) => {
              if (mesh instanceof THREE.Mesh && mesh.geometry && !mesh.geometry.attributes.uv) {
                generateUVs(mesh.geometry)
              }
            })
          }
          
          setTimeout(() => {
            if (clickedMesh.geometry) {
              clickedMesh.geometry.attributes.uv.needsUpdate = true
            }
            
            let newIntersects = []
            if (targetObject) {
              newIntersects = raycaster3D.intersectObject(targetObject, true)
            } else if (loadedMeshes.value.length > 0) {
              for (const mesh of loadedMeshes.value) {
                const meshIntersects = raycaster3D.intersectObject(mesh, true)
                if (meshIntersects.length > 0) {
                  newIntersects = meshIntersects
                  break
                }
              }
            }
            if (newIntersects.length > 0 && newIntersects[0].uv) {
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
      emit('3d-click-outside', {})
    }
  }
  
  const onMouseWheel = (event) => {
    if (!props.dragMode) return
    
    event.preventDefault()
    event.stopPropagation()
    
    const delta = event.deltaY > 0 ? 1 : -1
    const scaleFactor = 1 + (delta * 0.02)
    
    emit('3d-scale', { scaleFactor })
  }
  
  if (!renderer || !renderer.domElement) {
    console.error('setupClickHandler: renderer.domElement not available')
    return
  }
  
  const canvas = renderer.domElement
  console.log('Attaching event listeners to canvas:', canvas)
  
  if (window._threeSceneDragHandlers) {
    canvas.removeEventListener('mousedown', window._threeSceneDragHandlers.onMouseDown)
    canvas.removeEventListener('mousemove', window._threeSceneDragHandlers.onMouseMove)
    canvas.removeEventListener('mouseup', window._threeSceneDragHandlers.onMouseUp)
    canvas.removeEventListener('click', window._threeSceneDragHandlers.onCanvasClick)
    canvas.removeEventListener('wheel', window._threeSceneDragHandlers.onMouseWheel)
  }
  
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseup', onMouseUp)
  canvas.addEventListener('click', onCanvasClick)
  canvas.addEventListener('wheel', onMouseWheel, { passive: false })
  
  console.log('Event listeners attached successfully')
  
  window._threeSceneDragHandlers = {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onCanvasClick,
    onMouseWheel
  }
  
  window._threeSceneClickHandler = onCanvasClick
  
}

const addHelperGeometry = () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({ color: 0x888888, wireframe: true })
  const helperCube = new THREE.Mesh(geometry, material)
  helperCube.position.set(0, 0, 0)
  
  currentMesh = helperCube
  loadedMeshes.value = [markRaw(helperCube)]
}

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
  return 'obj'
}

const loadModel = async (url) => {
  if (!scene) return

  try {
    if (currentMesh) {
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
    
    loadedMeshes.value = []

    const fileType = getFileType(url)
    let obj
    
    if (fileType === 'gltf') {
      const gltfLoader = new GLTFLoader()
      
      const dracoLoader = new DRACOLoader()
      dracoLoader.setDecoderPath('https:
      gltfLoader.setDRACOLoader(dracoLoader)
      
      if (url instanceof File) {
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
      const objLoader = new OBJLoader()
      
      if (url instanceof File) {
        const text = await url.text()
        obj = objLoader.parse(text)
      } else if (typeof url === 'string') {
        if (url.startsWith('data:')) {
          const text = atob(url.split(',')[1])
          obj = objLoader.parse(text)
        } else {
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

    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    
    if (isNaN(size.x) || isNaN(size.y) || isNaN(size.z) || 
        isNaN(center.x) || isNaN(center.y) || isNaN(center.z)) {
      throw new Error('Le modèle contient des coordonnées invalides (NaN). Vérifiez le fichier 3D.')
    }
    
    const maxDim = Math.max(size.x, size.y, size.z)
    
    if (maxDim <= 0 || !isFinite(maxDim)) {
      throw new Error('Le modèle a une taille invalide. Impossible de le charger.')
    }

    const scale = 5.5 / maxDim
    obj.scale.multiplyScalar(scale)

    obj.position.sub(center.multiplyScalar(scale))

    let generatedUVs = false
    
        
    

    currentMesh = obj
    
    const meshesArray = []
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshesArray.push(markRaw(child))
      }
    })
    
    loadedMeshes.value = meshesArray
    
    await loadBase()
    

    const scaledMaxDim = maxDim * scale
    
    
    const distance = scaledMaxDim * 1.5
    camera.position.set(distance, distance, distance)
    
    
    
    
    camera.lookAt(0, 0, 0)
    
    cameraTarget.value = { x: 0, y: 0, z: 0 }
    orbitControlsEnabled.value = true
    
    if (controls) {
      controls.target.set(0, 0, 0)
      controls.enableZoom = false
      controls.enablePan = false
      controls.enableRotate = true
      
      
      controls.update()
    }

    obj.rotation.y = Math.PI

        
        
        
    
    emit('model-loaded', obj)
    emit('meshes-extracted', allMeshes) 

    await nextTick()
    
    if (props.canvas2D) {
      setupSharedCanvasTexture(props.canvas2D)
    } else if (props.texture) {
      applyTexture(props.texture)
    }
  } catch (error) {
    emit('model-error', error)
  }
}

const loadBase = async () => {
  try {
    console.log('🔄 Début du chargement de la base...')
    
    const textureLoader = new THREE.TextureLoader()
    
    const baseTextureUrl = 'https:
    
    console.log('📥 Chargement de la texture:', baseTextureUrl)
    const map = await textureLoader.loadAsync(baseTextureUrl)
    map.colorSpace = 'srgb'
    map.flipY = false
    
    let baseRadius = 1
    let basePosition = { x: 0, y: -1, z: 0 }
    
    if (currentMesh) {
      const box = new THREE.Box3().setFromObject(currentMesh)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      
      console.log('📐 Dimensions du modèle:', { size, center, scale: currentMesh.scale })
      
      baseRadius = Math.max(size.x, size.z) / 2 + 0.3
      
      console.log('📏 Taille calculée de la base:', { sizeX: size.x, sizeZ: size.z, baseRadius })
      
      basePosition = {
        x: center.x,
        y: center.y - size.y / 2 - 0.1,
        z: center.z
      }
      
      console.log('📍 Position de la base:', basePosition, 'Rayon:', baseRadius)
    }
    
    const geometry = new THREE.CircleGeometry(baseRadius, 128)
    
    const material = new THREE.MeshStandardMaterial({
      color: '#FFFFFF',
      side: THREE.DoubleSide,
      map: map,
      transparent: false,
      roughness: 0.5,
      metalness: 0.1
    })
    
    const baseMesh = new THREE.Mesh(geometry, material)
    
    baseMesh.position.set(basePosition.x, basePosition.y, basePosition.z)
    
    baseMesh.rotation.x = -Math.PI / 2
    
    baseMesh.name = 'Base'
    
    baseMesh.layers = new THREE.Layers()
    
    const currentMeshes = [...loadedMeshes.value]
    currentMeshes.push(markRaw(baseMesh))
    loadedMeshes.value = currentMeshes
    
    console.log('✅ Base chargée avec succès:', {
      position: baseMesh.position,
      rotation: baseMesh.rotation,
      radius: baseRadius,
      totalMeshes: loadedMeshes.value.length,
      baseMeshVisible: baseMesh.visible,
      baseMeshLayers: baseMesh.layers.mask
    })
    
    baseMesh.visible = true
    
    if (renderer && scene && camera) {
      renderer.render(scene, camera)
    }
  } catch (error) {
    console.error('❌ Erreur lors du chargement de la base:', error)
  }
}

const setupSharedCanvasTexture = (htmlCanvas) => {
  if (!htmlCanvas) {
    console.warn('setupSharedCanvasTexture: htmlCanvas is null')
    return
  }
  
  const targetMeshes = loadedMeshes.value.length > 0 ? loadedMeshes.value : (currentMesh ? [currentMesh] : [])
  
  if (targetMeshes.length === 0) {
    console.warn('setupSharedCanvasTexture: No meshes available')
    return
  }

  try {
    const materials = []
    let meshCount = 0
    
    targetMeshes.forEach((mesh) => {
      if (mesh instanceof THREE.Mesh) {
        meshCount++
        
        if (mesh.geometry && !mesh.geometry.attributes.uv) {
          generateUVs(mesh.geometry)
        }
        
        if (Array.isArray(mesh.material)) {
          materials.push(...mesh.material)
        } else if (mesh.material) {
          materials.push(mesh.material)
        }
      } else if (mesh.traverse) {
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            meshCount++
            
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
      }
    })
    
    console.log(`setupSharedCanvasTexture: Found ${meshCount} meshes, ${materials.length} materials`)
    
    if (canvasTexture) {
      canvasTexture.dispose()
      canvasTexture = null
    }
    
    canvasTexture = setupCanvasTexture(htmlCanvas, materials)
    
    if (!canvasTexture) {
      console.error('setupSharedCanvasTexture: Failed to create texture')
      return
    }
    
    targetMeshes.forEach((mesh) => {
      if (mesh instanceof THREE.Mesh) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => {
            if (mat) {
              mat.map = canvasTexture
              mat.transparent = true
              mat.opacity = 0.9
              mat.alphaTest = 0.01
              mat.needsUpdate = true
            }
          })
        } else if (mesh.material) {
          mesh.material.map = canvasTexture
          mesh.material.transparent = true
          mesh.material.opacity = 0.9
          mesh.material.alphaTest = 0.01
          mesh.material.needsUpdate = true
        }
      } else if (mesh.traverse) {
        applyTextureToMesh(mesh, canvasTexture)
      }
    })
    
    console.log('setupSharedCanvasTexture: Texture applied successfully')
    
    emit('texture-ready', canvasTexture)
    
  } catch (error) {
    console.error('setupSharedCanvasTexture error:', error)
  }
}


const generateSeamlessUVs = (geometry, seamless = false) => {
  const positions = geometry.attributes.position
  const uvs = []
  
  if (!positions || positions.count === 0) {
    return
  }
  
  const box = new THREE.Box3().setFromBufferAttribute(positions)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  
  const isCylindrical = size.y > size.x * 0.8 && size.y > size.z * 0.8
  const isWide = size.x > size.y * 1.5 || size.z > size.y * 1.5
  
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
  
  try {
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.attributes.uv.needsUpdate = true
  } catch (error) {
  }
}

const generateUVs = (geometry) => {
  const positions = geometry.attributes.position
  const uvs = []
  
  if (!positions || positions.count === 0) {
    return
  }
  
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
  
  const box = new THREE.Box3().setFromBufferAttribute(positions)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  
  if (size.x === 0 && size.y === 0 && size.z === 0) {
    size.x = size.x || 1
    size.y = size.y || 1
    size.z = size.z || 1
  }
  
  if (isNaN(size.x) || isNaN(size.y) || isNaN(size.z) || 
      isNaN(center.x) || isNaN(center.y) || isNaN(center.z)) {
    return
  }
  
  const isCylindrical = size.y > size.x * 0.8 && size.y > size.z * 0.8
  const isWide = size.x > size.y * 1.5 || size.z > size.y * 1.5
  
  if (isCylindrical) {
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) - center.x
      const y = positions.getY(i) - center.y
      const z = positions.getZ(i) - center.z
      
      const angle = Math.atan2(z, x)
      let u = 1 - ((angle / (2 * Math.PI)) + 0.5)
      
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
  
  let hasInvalidUVs = false
  for (let i = 0; i < uvs.length; i++) {
    if (isNaN(uvs[i]) || !isFinite(uvs[i])) {
      hasInvalidUVs = true
      uvs[i] = 0.5
    }
  }
  
  if (hasInvalidUVs) {
  }
  
  if (uvs.length !== positions.count * 2) {
    return
  }
  
  try {
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
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

  texture.flipY = true
  texture.needsUpdate = true
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  let meshCount = 0
  currentMesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount++
      
      if (child.geometry && !child.geometry.attributes.uv) {
        generateUVs(child.geometry)
      }
      
      if (Array.isArray(child.material)) {
        child.material.forEach((mat, idx) => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhongMaterial) {
            mat.map = texture
            mat.envMap = environmentMap
            mat.transparent = true
            mat.opacity = 0.9
            mat.alphaTest = 0.01
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.metalness = mat.metalness !== undefined ? mat.metalness : 0.3
              mat.roughness = mat.roughness !== undefined ? mat.roughness : 0.7
            }
            mat.needsUpdate = true
          } else {
            child.material[idx] = new THREE.MeshStandardMaterial({
              map: texture,
              envMap: environmentMap,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.9,
              alphaTest: 0.01,
              metalness: 0.3,
              roughness: 0.7
            })
          }
        })
      } else {
        if (child.material instanceof THREE.MeshStandardMaterial || child.material instanceof THREE.MeshPhongMaterial) {
          child.material.map = texture
          child.material.envMap = environmentMap
          child.material.transparent = true
          child.material.opacity = 0.9
          child.material.alphaTest = 0.01
          if (child.material instanceof THREE.MeshStandardMaterial) {
            child.material.metalness = child.material.metalness !== undefined ? child.material.metalness : 0.3
            child.material.roughness = child.material.roughness !== undefined ? child.material.roughness : 0.7
          }
          child.material.needsUpdate = true
        } else {
          child.material = new THREE.MeshStandardMaterial({
            map: texture,
            envMap: environmentMap,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            alphaTest: 0.01,
            metalness: 0.3,
            roughness: 0.7
          })
        }
      }
    }
  })
  
}


const createSeamlessGoblet = () => {
  if (!currentMesh) {
    return false
  }
  
  try {
    const clonedMesh = currentMesh.clone()
    
    clonedMesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const clonedGeometry = child.geometry.clone()
        
        generateSeamlessUVs(clonedGeometry, true)
        
        child.geometry = clonedGeometry
        
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
    
    currentMesh = clonedMesh
    
    const meshesArray = []
    clonedMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshesArray.push(markRaw(child))
      }
    })
    
    loadedMeshes.value = meshesArray
    
    if (canvasTexture) {
      applyTexture(canvasTexture)
    }
    
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
    
    allMeshes = []
    meshesList.value = []
    let meshIndex = 0
    clonedMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        allMeshes.push(child)
        
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

  if (window._threeSceneClickHandler && renderer) {
    renderer.domElement.removeEventListener('click', window._threeSceneClickHandler)
    delete window._threeSceneClickHandler
  }
  
  if (window._threeSceneDragHandlers && window._threeSceneDragHandlers.onMouseWheel && renderer) {
    renderer.domElement.removeEventListener('wheel', window._threeSceneDragHandlers.onMouseWheel)
  }
  
  raycaster3D = null

  scene = null
  camera = null
}


const highlightMesh = (mesh, isHighlighting = true) => {
  if (!mesh) return
  
  if (highlightedMesh && highlightedMesh !== mesh) {
    resetMeshHighlight(highlightedMesh)
  }
  
  if (isHighlighting) {
    if (!mesh.userData.originalMaterial) {
      mesh.userData.originalMaterial = mesh.material.clone()
    }
    
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
  if (mesh) {
    const meshIndex = meshesList.value.findIndex(m => m.mesh === mesh)
    activeMeshIndex.value = meshIndex >= 0 ? meshIndex : -1
  } else {
    activeMeshIndex.value = -1
  }
}

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

const updateWorkZone = (top, bottom) => {
}

const setPlacementMode = (active, type) => {
  if (renderer && renderer.domElement) {
    if (active) {
      renderer.domElement.style.cursor = 'crosshair'
    } else {
      renderer.domElement.style.cursor = 'default'
    }
  }
}

const setDragMode = (active) => {
  if (renderer && renderer.domElement) {
    if (active) {
      renderer.domElement.style.setProperty('cursor', 'move', 'important')
    } else {
      renderer.domElement.style.setProperty('cursor', 'default', 'important')
    }
  }
}

const setResizing = (resizing, startPos, handleInfo) => {
  isResizing3D = resizing
  if (resizing) {
    resizeStartPosition = startPos
    resizeHandleInfo = handleInfo
    isDragging3D = true
    if (renderer && renderer.domElement) {
      renderer.domElement.style.setProperty('cursor', 'move', 'important')
    }
  } else {
    resizeStartPosition = null
    resizeHandleInfo = null
  }
}

const setDragState = (dragging) => {
  isDragging3D = dragging
  if (dragging) {
    if (renderer && renderer.domElement) {
      renderer.domElement.style.setProperty('cursor', 'move', 'important')
    }
  }
}

const updateSelectedObjectCoords = (obj) => {
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
    const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
    const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
    
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
    nextTick(() => {
      isUpdatingSelectedObject = false
    })
  }
}

const updateAllObjectsList = () => {
  if (!props.canvas2D) {
    allObjectsList.value = []
    return
  }
  
  allObjectsList.value = []
}

const calculateControlCoordinates = (obj, skipSetCoords = false) => {
  if (!obj) return {}
  
  let coords = null
  try {
    coords = obj.calcCoords ? obj.calcCoords() : null
    
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
    coords = obj.oCoords || null
  }
  
  if (!coords || !coords.tl) return {}
  
  const controls = {}
  
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

const updateObjectsListFromCanvas = (objects) => {
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
    const selectedObj = props.selectedObject
    
    allObjectsList.value = objects
      .filter(obj => !obj.userData?.isWorkZoneIndicator)
      .map((obj, index) => {
        const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
        const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
        
        const isSelected = selectedObj && (
          (obj.id && selectedObj.id && obj.id === selectedObj.id) ||
          obj === selectedObj
        )
        
        const controls = calculateControlCoordinates(obj, true)
        
        let centerX = 0
        let centerY = 0
        
        if (controls.tl && controls.tr && controls.bl && controls.br) {
          const x1 = controls.tl.x, y1 = controls.tl.y
          const x2 = controls.br.x, y2 = controls.br.y
          const x3 = controls.tr.x, y3 = controls.tr.y
          const x4 = controls.bl.x, y4 = controls.bl.y
          
          const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
          if (Math.abs(denom) > 0.001) {
            const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
            centerX = x1 + t * (x2 - x1)
            centerY = y1 + t * (y2 - y1)
          } else {
            centerX = (controls.tl.x + controls.tr.x + controls.bl.x + controls.br.x) / 4
            centerY = (controls.tl.y + controls.tr.y + controls.bl.y + controls.br.y) / 4
          }
        } else {
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
    nextTick(() => {
      isUpdatingObjectsList = false
    })
  }
}

const setCameraPosition = (position, target = { x: 0, y: 0, z: 0 }, updateControls = true) => {
  if (!camera) {
    console.warn('setCameraPosition: Camera not available')
    return
  }
  
  camera.position.set(position.x, position.y, position.z)
  
  camera.lookAt(target.x, target.y, target.z)
  
  if (updateControls && controls) {
    controls.target.set(target.x, target.y, target.z)
    controls.update()
  }
  
  console.log('📷 Position de la caméra modifiée:', {
    position: { x: position.x, y: position.y, z: position.z },
    target: { x: target.x, y: target.y, z: target.z }
  })
}

const rotateModel = (angleDegrees) => {
  if (!currentMesh) return
  
  const angleRadians = THREE.MathUtils.degToRad(angleDegrees)
  
  console.log('🔄 Rotation 3D - Angle:', angleDegrees, '° (', angleRadians, 'rad)')
  
  const euler = new THREE.Euler(0, angleRadians, 0, 'XYZ')
  currentMesh.setRotationFromEuler(euler)
  
  
  
  if (controls) {
  }
}

const updateTextureDirect = (immediate = false) => {
  if (!canvasTexture) return
  
  canvasTexture.needsUpdate = true
  
  if (immediate && renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

const scaleModel = (scaleFactor = 0.8) => {
  if (!currentMesh) return
  
  currentMesh.scale.multiplyScalar(scaleFactor)
  
  if (controls) {
    controls.update()
  }
}

const setRotationHandleHover = (isHovering) => {
  coordinatesDisplay.value.isOnRotationHandle = isHovering
}

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

const patchMaterialForDecal = (material) => {
  if (material.userData.isPatched) return
  
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDecalMap = shaderUniforms.uDecalMap
    shader.uniforms.uDecalVisible = shaderUniforms.uDecalVisible
    shader.uniforms.uDecalCenter = shaderUniforms.uDecalCenter
    shader.uniforms.uDecalScale = shaderUniforms.uDecalScale
    shader.uniforms.uDecalAngle = shaderUniforms.uDecalAngle
    
    shader.fragmentShader = `
      uniform sampler2D uDecalMap;
      uniform float uDecalVisible;
      uniform vec2 uDecalCenter;
      uniform vec2 uDecalScale;
      uniform float uDecalAngle;
      
      vec2 rotateUV(vec2 uv, float rotation, vec2 center) {
        float c = cos(rotation);
        float s = sin(rotation);
        mat2 rotMat = mat2(c, -s, s, c);
        return rotMat * (uv - center) + center;
      }
    ` + shader.fragmentShader
    
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #include <map_fragment>
      
      if (uDecalVisible > 0.5) {
        vec2 centeredUv = vMapUv - uDecalCenter;
        
        float c = cos(-uDecalAngle);
        float s = sin(-uDecalAngle);
        vec2 rotatedUv = vec2(
          centeredUv.x * c - centeredUv.y * s,
          centeredUv.x * s + centeredUv.y * c
        );
        
        vec2 finalUv = rotatedUv / uDecalScale;
        
        finalUv += vec2(0.5, 0.5);
        
        if (finalUv.x >= 0.0 && finalUv.x <= 1.0 && finalUv.y >= 0.0 && finalUv.y <= 1.0) {
          vec4 decalColor = texture2D(uDecalMap, finalUv);
          
          diffuseColor.rgb = mix(diffuseColor.rgb, decalColor.rgb, decalColor.a);
        }
      }
      `
    )
  }
  
  material.userData.isPatched = true
  material.needsUpdate = true
}

const startDecalRotation = async (objectProps, dataUrl) => {
  if (!dataUrl || !scene) return

  try {
    const textureLoader = new THREE.TextureLoader()
    const texture = await textureLoader.loadAsync(dataUrl)
    
    const meshesToPatch = loadedMeshes.value.length > 0 ? loadedMeshes.value : (currentMesh ? [] : [])
    
    if (meshesToPatch.length === 0 && currentMesh) {
      currentMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshesToPatch.push(child)
        }
      })
    }
    
    let materialsPatched = false
    meshesToPatch.forEach((mesh) => {
      if (mesh instanceof THREE.Mesh && mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => {
            if (mat) {
              patchMaterialForDecal(mat)
              materialsPatched = true
              mat.needsUpdate = true
            }
          })
        } else {
          patchMaterialForDecal(mesh.material)
          materialsPatched = true
          mesh.material.needsUpdate = true
        }
      }
    })
    
    if (!materialsPatched) {
      console.warn('startDecalRotation: No materials found to patch')
      return
    }
    
    const canvasWidth = props.canvas2D ? props.canvas2D.width : 800
    const canvasHeight = props.canvas2D ? props.canvas2D.height : 600
    
    const centerX = objectProps.left
    const centerY = objectProps.top
    
    const centerU = centerX / canvasWidth
    const centerV = 1 - (centerY / canvasHeight)
    
    const scaleU = objectProps.width / canvasWidth
    const scaleV = objectProps.height / canvasHeight
    
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
  shaderUniforms.uDecalAngle.value = absoluteAngle * (Math.PI / 180)
}

const endDecalRotation = () => {
  shaderUniforms.uDecalVisible.value = 0
  shaderUniforms.uDecalMap.value = null
}

const handleAddRectangleClick = () => {
  if (props.placementMode && props.placementType === 'rectangle') {
    emit('add-rectangle-click', { active: false })
  } else {
    emit('add-rectangle-click', { active: true })
  }
}

const disableOrbitControls = () => {
  if (controls) {
    controls.enabled = false
    controls.enableRotate = false
    console.log('🔒 OrbitControls désactivés')
  }
}

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
  disableOrbitControls,
  enableOrbitControls,
  getCurrentMesh: () => currentMesh,
  applyTexture,
  getCanvasTexture: () => canvasTexture,
  setCameraPosition,
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
  updateTextureDirect,
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

.three-canvas-hidden {
  display: none;
}

  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  font-weight: 600;
  
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

}

  border: 2px solid #ff0000; /* Bordure rouge */
  color: #fff;
  box-shadow: 0 4px 16px rgba(255, 0, 0, 0.5); /* Ombre rouge */
}

.coordinates-display.on-seam .coord-title {
  color: #fff;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
}

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

