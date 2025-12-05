
<template>
 <div class="three-scene-container">
  <pre class="text-white bg-black"> {{ orbitControlsEnabled }}</pre>
  <TresCanvas
    ref="tresCanvasRef"
    clear-color="#40475B"
    class="three-canvas"
    @ready="onTresReady"
  >
    <primitive
      v-for="(innerMesh, index) in loadedMeshes"
      :key="index"
      :object="innerMesh"
    />
    
    <primitive
      v-if="outerMesh"
      :object="outerMesh"
    />
  </TresCanvas>
  
  <TextureUpdater
    v-if="canvasTexture && renderer && scene && camera"
    ref="textureUpdaterRef"
    :texture="canvasTexture"
    :renderer="renderer"
    :scene="scene"
    :camera="camera"
  />
</div>

</template>

<script setup lang="ts">

import { ref, shallowRef, computed, onMounted, onUnmounted, watch, nextTick, markRaw, type PropType } from 'vue'
import * as THREE from 'three'
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { setupCanvasTexture, applyTextureToMesh, useCanvasTextureStore } from '../composables/useCanvasTexture'
import { project3DClickToCanvas } from '../composables/use3DTo2DProjection'
import { useShaderMaterial } from '../composables/useShaderMaterial'
import TextureUpdater from './TextureUpdater.vue'
import { get3DPositionFromUV } from '../composables/use2DTo3DProjection'
import { TresCanvas, useTres } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'


const props = defineProps({
  texture: {
    type: Object as PropType<THREE.Texture | null>,
    default: null
  },
  canvas2D: {
    type: Object as PropType<HTMLCanvasElement | null>,
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
  dragMode: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits<{
  (e: 'texture-ready', texture: THREE.CanvasTexture): void
  (e: '3d-click', data: any): void
  (e: '3d-click-outside', data: any): void
  (e: '3d-drag', data: { canvasX: number; canvasY: number }): void
  (e: '3d-drag-start', data: { canvasX: number; canvasY: number }): void
  (e: '3d-drag-end'): void
  (e: '3d-scale', data: { scaleFactor: number }): void
  (e: '3d-resize-start', data: { canvasX: number; canvasY: number; handleInfo: any }): void
  (e: '3d-resize', data: { canvasX: number; canvasY: number; startX: number; startY: number; handleInfo: any }): void
  (e: '3d-resize-end'): void
  (e: '3d-hover', data: { canvasX: number; canvasY: number }): void
  (e: '3d-rotation-click', data: any): void
  (e: '3d-rotation-start', data: { canvasX: number; canvasY: number; mtrCoords: { x: number; y: number } }): void
  (e: '3d-rotation', data: { canvasX: number; canvasY: number; angle: number; mtrCoords: { x: number; y: number } | null }): void
  (e: '3d-rotation-end'): void
  (e: 'detect-resize-handle', data: { canvasX: number; canvasY: number; result: { isResize: boolean; handleInfo: any } }): void
}>()

let activeMesh: THREE.Mesh | null = null
let currentMesh: THREE.Object3D | null = null
const loadedMeshes = shallowRef<THREE.Object3D[]>([])
const innerMesh = shallowRef<THREE.Mesh | null>(null)
const outerMesh = shallowRef<THREE.Mesh | null>(null)

const { innerShaderMaterial, outerShaderMaterial } = useShaderMaterial()


const orbitControlsEnabled = ref(false)

let environmentMap: THREE.Texture | null = null
let canvasTexture: THREE.CanvasTexture | null = null

const canvasElement = ref<HTMLCanvasElement | null>(null)
const tresCanvasRef = ref<any>(null)
const textureUpdaterRef = ref<any>(null)

let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let controls: ThreeOrbitControls | null = null
let animationId: number | null = null
let handleResize: (() => void) | null = null

let shaderUniforms = {
  uDecalMap: { value: null as THREE.Texture | null },
  uDecalVisible: { value: 0 },
  uDecalCenter: { value: new THREE.Vector2(0.5, 0.5) },
  uDecalScale: { value: new THREE.Vector2(1, 1) },
  uDecalAngle: { value: 0 }
}

const coordinatesDisplay = ref({
  show: false,
  uvU: 0,
  uvV: 0,
  canvasX: 0,
  canvasY: 0,
  worldPos: null as { x: number; y: number; z: number } | null,
  isOnSeam: false,
  isOnRotationHandle: false
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
  controls: {} as Record<string, { x: number; y: number }>,
  originX: 'left',
  originY: 'top'
})

const isNearRotationHandle = ref(false)
const detectedControl = ref({
  show: false,
  handle: null as string | null,
  corner: null as string | null,
  edge: null as string | null,
  isRotation: false,
  distance: null as number | null,
  x: null as number | null,
  y: null as number | null
})

let isUpdatingSelectedObject = false
let isUpdatingObjectsList = false

const allObjectsList = ref<any[]>([])
const meshesList = ref<any[]>([])
const activeMeshIndex = ref(-1)


const loadEnvironmentMap = async (url: string | null = null) => {
  const loader = new THREE.TextureLoader()

  try {
    if (url) {
      environmentMap = await new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(
          url,
          (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping
            texture.needsUpdate = true
            resolve(texture)
          },
          undefined,
          reject
        )
      })
    } else {
      const envCanvas = document.createElement('canvas')
      envCanvas.width = 2048
      envCanvas.height = 1024
      const ctx = envCanvas.getContext('2d')

      if (ctx) {
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
      }

      environmentMap = new THREE.CanvasTexture(envCanvas)
      environmentMap.mapping = THREE.EquirectangularReflectionMapping
      environmentMap.needsUpdate = true
    }

    if (currentMesh) {
      currentMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          materials.forEach((mat) => {
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.envMap = environmentMap
              mat.needsUpdate = true
            }
          })
        }
      })
    }
  } catch (error) {
    console.error('Error loading environment map:', error)
  }
}

onMounted(async () => {
  await nextTick()
})



watch(() => props.canvas2D, (newCanvas, oldCanvas) => {
  if (newCanvas && currentMesh) {
    setupSharedCanvasTexture(newCanvas)
  }
}, { deep: true })

onUnmounted(() => {
  cleanup()
})


watch(() => props.texture, (newTexture) => {
  if (currentMesh && newTexture) {
    applyTexture(newTexture)
  }
})


const onTresReady = (state: any) => {

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


    scene = (tresState.scene?.value || tresState.scene) as THREE.Scene
    camera = (tresState.camera?.value || tresState.camera) as THREE.PerspectiveCamera
    renderer = (tresState.renderer?.value || tresState.renderer) as THREE.WebGLRenderer

    console.log('Extracted objects:', { scene, camera, renderer })

    if (!scene || !camera || !renderer) {
      console.error('TresCanvas objects not available', { scene, camera, renderer })
      return
    }

    if (!camera.position) {
      console.error('Camera position not available', camera)
      return
    }

    camera.position.set(0, 10, 20)
    camera.fov = 75
    camera.near = 0.1
    camera.far = 1000
    camera.updateProjectionMatrix()

    scene.background = new THREE.Color(0x40475B)

    if (renderer.domElement) {
      controls = new ThreeOrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      controls.enableZoom = false
      controls.enablePan = false
      controls.enableRotate = true
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

  loadEnvironmentMap().then(() => {
    if (props.canvas2D) setupSharedCanvasTexture(props.canvas2D)
    loadModel("https://3d-back-wobz-v2.sh2.hidora.net/downloadSvg?filename=2025/04/24/680a5a7c34e69_2025_03_10_67cee4edc0a55_2024_02_23_65d8b8086988e_22022_05_30_6294959dca46a_12-18_(2).obj")

    nextTick(() => {
      if (props.enableDirectEdit && renderer?.domElement) {
        console.log('Setting up click handler, renderer:', renderer)
        setupClickHandler()
      } else {
        console.warn('Cannot setup click handler:', {
          enableDirectEdit: props.enableDirectEdit,
          renderer: !!renderer,
          domElement: !!renderer?.domElement
        })
      }
    })
  })
}


let raycaster3D: THREE.Raycaster | null = null
let mouse: THREE.Vector2 | null = null
let isDragging3D = false
let isResizing3D = false
let resizeStartPosition: { x: number; y: number } | null = null
let resizeHandleInfo: any = null

let isRotating3D = false
let rotationStartPosition: { x: number; y: number } | null = null
let rotationStartCursor: { x: number; y: number } | null = null
let rotationCenter: { x: number; y: number } | null = null
let rotationJustEnded = false
let rotationEndTime = 0




const setupClickHandler = () => {
  if (!renderer || !renderer.domElement) {
    console.error('setupClickHandler: renderer or domElement not available')
    return
  }
  
  // Créer le raycaster pour détecter les intersections (si pas déjà créé)
  if (!raycaster3D) {
    raycaster3D = new THREE.Raycaster()
    mouse = new THREE.Vector2()  // Coordonnées de la souris normalisées (-1 à 1)
  }
  
  const getCanvasCoords = (event: MouseEvent) => {
    if (!props.canvas2D || !raycaster3D || !mouse || !renderer || !camera) return null
    
    // Utiliser le canvas de TresCanvas
    const canvas = renderer.domElement
    const rect = canvas.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    raycaster3D.setFromCamera(mouse, camera)
    
    // Utiliser loadedMeshes si disponible, sinon fallback sur currentMesh
    let intersects: THREE.Intersection[] = []
    if (loadedMeshes.value.length > 0) {
      // Tester tous les meshes dans loadedMeshes
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
        
        return {
          ...canvasCoords,
          uvU: intersection.uv.x,
          uvV: intersection.uv.y,
          worldPos: {
            x: intersection.point.x,
            y: intersection.point.y,
            z: intersection.point.z
          },
          isOnSeam: intersection.uv.x < 0.01 || intersection.uv.x > 0.99 // Simple check for seam
        }
      }
    }
    return null
  }
  
 const onMouseDown = (event: MouseEvent) => {
  if (isRotating3D) {
    event.stopPropagation()
    event.preventDefault()
  }

  if (!props.dragMode) return

  const canvasCoords = getCanvasCoords(event)
  if (!canvasCoords) return

  const timeSinceRotationEnd = Date.now() - rotationEndTime
  const minTimeBetweenRotationAndDrag = 100

  const mtr = selectedObjectCoords.value.controls?.mtr
  if (!rotationJustEnded && timeSinceRotationEnd > minTimeBetweenRotationAndDrag && selectedObjectCoords.value.show && mtr) {
    const dx = canvasCoords.x - mtr.x
    const dy = canvasCoords.y - mtr.y
    if (Math.sqrt(dx * dx + dy * dy) <= 10) {
      isRotating3D = true
      rotationJustEnded = false
      rotationStartPosition = { x: mtr.x, y: mtr.y }
      rotationStartCursor = { x: canvasCoords.x, y: canvasCoords.y }

      const controlsObj = selectedObjectCoords.value.controls || {}
      let centerX: number, centerY: number

      if (controlsObj.tl && controlsObj.tr && controlsObj.bl && controlsObj.br) {
        const { tl, tr, bl, br } = controlsObj
        const denom = (tl.x - br.x) * (tr.y - bl.y) - (tl.y - br.y) * (tr.x - bl.x)
        if (Math.abs(denom) > 0.001) {
          const t = ((tl.x - tr.x) * (tr.y - bl.y) - (tl.y - tr.y) * (tr.x - bl.x)) / denom
          centerX = tl.x + t * (br.x - tl.x)
          centerY = tl.y + t * (br.y - tl.y)
        } else {
          centerX = (tl.x + tr.x + bl.x + br.x) / 4
          centerY = (tl.y + tr.y + bl.y + br.y) / 4
        }
      } else {
        const objLeft = selectedObjectCoords.value.left || 0
        const objTop = selectedObjectCoords.value.top || 0
        const objWidth = selectedObjectCoords.value.width || 0
        const objHeight = selectedObjectCoords.value.height || 0
        centerX = objLeft + objWidth / 2
        centerY = objTop + objHeight / 2
      }

      rotationCenter = { x: centerX, y: centerY }
      controls?.enabled && (controls.enabled = false)
      controls?.enableRotate && (controls.enableRotate = false)

      emit('3d-rotation-start', {
        canvasX: canvasCoords.x,
        canvasY: canvasCoords.y,
        mtrCoords: mtr
      })
      return
    }
  }

  if (isRotating3D) {
    emit('3d-rotation-end')
    isRotating3D = false
    rotationStartPosition = null
    rotationStartCursor = null
    controls && (controls.enabled = true)
  }

  const detectResizeResult = { isResize: false, handleInfo: null }
  emit('detect-resize-handle', { canvasX: canvasCoords.x, canvasY: canvasCoords.y, result: detectResizeResult })

  if (detectResizeResult.isResize && detectResizeResult.handleInfo) {
    isResizing3D = true
    isDragging3D = false
    resizeStartPosition = { x: canvasCoords.x, y: canvasCoords.y }
    resizeHandleInfo = detectResizeResult.handleInfo
    emit('3d-resize-start', {
      canvasX: canvasCoords.x,
      canvasY: canvasCoords.y,
      handleInfo: resizeHandleInfo
    })
  } else {
    isDragging3D = true
    isResizing3D = false
    orbitControlsEnabled.value = true
    emit('3d-drag-start', { canvasX: canvasCoords.x, canvasY: canvasCoords.y })
  }

  controls && (controls.enabled = false)
}

  
  const onMouseMove = (event: MouseEvent) => {
  if (!scene) return

  if (isDragging3D || isResizing3D || isRotating3D) {
    event.stopPropagation()
    event.preventDefault()
    if (controls?.enabled) {
      controls.enabled = false
      controls.enableRotate = false
    }
  }

  const canvasCoords = getCanvasCoords(event)
  if (!canvasCoords) return

  if (props.canvas2D && raycaster3D && renderer) {
    const canvas = renderer.domElement
    const rect = canvas.getBoundingClientRect()
    if (!mouse) return

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    if (!camera) return
    raycaster3D.setFromCamera(mouse, camera)

    let intersects: THREE.Intersection[] = []
    if (loadedMeshes.value.length) {
      for (const mesh of loadedMeshes.value) {
        const hits = raycaster3D.intersectObject(mesh, true)
        if (hits.length) {
          intersects = hits
          break
        }
      }
    } else if (activeMesh) {
      intersects = raycaster3D.intersectObject(activeMesh, true)
    } else if (currentMesh) {
      intersects = raycaster3D.intersectObject(currentMesh, true)
    }

    if (intersects.length && intersects[0].uv) {
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
        uvU,
        uvV: intersection.uv.y,
        canvasX: canvasCoords.x,
        canvasY: canvasCoords.y,
        isOnSeam: isOnSeamValue,
        isOnRotationHandle: coordinatesDisplay.value.isOnRotationHandle || false,
        worldPos: { x: intersection.point.x, y: intersection.point.y, z: intersection.point.z }
      }

      if (selectedObjectCoords.value.show && selectedObjectCoords.value.controls?.mtr) {
        const { x: mtrX, y: mtrY } = selectedObjectCoords.value.controls.mtr
        const dx = canvasCoords.x - mtrX
        const dy = canvasCoords.y - mtrY
        isNearRotationHandle.value = Math.sqrt(dx * dx + dy * dy) <= 20
      } else {
        isNearRotationHandle.value = false
      }
    } else {
      coordinatesDisplay.value.show = false
    }
  } else {
    coordinatesDisplay.value.show = false
  }

  emit('3d-hover', { canvasX: canvasCoords.x, canvasY: canvasCoords.y })

  if (!props.dragMode) return

  if (isRotating3D && rotationStartPosition && rotationStartCursor && selectedObjectCoords.value.show && rotationCenter) {
    const centerX = rotationCenter.x
    const centerY = rotationCenter.y
    const startAngle = Math.atan2(rotationStartCursor.y - centerY, rotationStartCursor.x - centerX) * (180 / Math.PI)
    const currentAngle = Math.atan2(canvasCoords.y - centerY, canvasCoords.x - centerX) * (180 / Math.PI)
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

  if (canvasCoords) {
    if (isResizing3D && resizeStartPosition && resizeHandleInfo) {
      emit('3d-resize', {
        canvasX: canvasCoords.x,
        canvasY: canvasCoords.y,
        startX: resizeStartPosition.x,
        startY: resizeStartPosition.y,
        handleInfo: resizeHandleInfo
      })
    } else if (isDragging3D) {
      emit('3d-drag', { canvasX: canvasCoords.x, canvasY: canvasCoords.y })
    }
  }
}

  
const onMouseUp = (event: MouseEvent) => {
  if (isRotating3D) {
    emit('3d-rotation-end')
    isRotating3D = false
    rotationStartPosition = null
    rotationStartCursor = null
    rotationCenter = null
    rotationJustEnded = true
    rotationEndTime = Date.now()

    if (renderer?.domElement) {
      renderer.domElement.style.setProperty('cursor', props.dragMode ? 'move' : 'default', 'important')
    }

    if (controls) {
      controls.enabled = true
      controls.enableRotate = true
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
      orbitControlsEnabled.value = true
    }

    if (renderer?.domElement) {
      renderer.domElement.style.setProperty('cursor', props.dragMode ? 'move' : 'default', 'important')
    }

    if (controls) {
      controls.enabled = true
      controls.enableRotate = true
    }
  }
}

 const onCanvasClick = (event: MouseEvent) => {
  if (isDragging3D || isResizing3D || isRotating3D) return
  if (!props.canvas2D || !raycaster3D || !renderer || !mouse || !camera) return

  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster3D.setFromCamera(mouse, camera)

  const meshesToCheck =
    loadedMeshes.value.length > 0
      ? loadedMeshes.value
      : [activeMesh, currentMesh].filter(Boolean)

  let intersects: THREE.Intersection[] = []
  let targetMesh: THREE.Object3D | null = null

  for (const mesh of meshesToCheck) {
    const result = raycaster3D.intersectObject(mesh!, true)
    if (result.length > 0) {
      intersects = result
      targetMesh = mesh!
      break
    }
  }

  if (intersects.length === 0) {
    emit('3d-click-outside', {})
    return
  }

  const intersection = intersects[0]
  let clickedMesh: THREE.Object3D | null = intersection.object

  while (clickedMesh && !(clickedMesh instanceof THREE.Mesh)) {
    clickedMesh = clickedMesh.parent
  }

  const canvasWidth = props.canvas2D.width
  const canvasHeight = props.canvas2D.height

  if (intersection.uv) {
    const canvasCoords = project3DClickToCanvas(
      intersection,
      canvasWidth,
      canvasHeight,
      props.workZoneTop,
      props.workZoneBottom
    )

    if (!canvasCoords) return

    const controls = selectedObjectCoords.value.controls
    const mtr = controls?.mtr
    let isRotationClick = false

    if (selectedObjectCoords.value.show && mtr) {
      const dx = canvasCoords.x - mtr.x
      const dy = canvasCoords.y - mtr.y
      if (Math.hypot(dx, dy) <= 10) {
        isRotationClick = true
        emit('3d-rotation-click', {
          intersection,
          canvasX: canvasCoords.x,
          canvasY: canvasCoords.y,
          uv: intersection.uv,
          mesh: clickedMesh,
          mtrCoords: mtr
        })
      }
    }

    if (!isRotationClick) {
      emit('3d-click', {
        intersection,
        canvasX: canvasCoords.x,
        canvasY: canvasCoords.y,
        uv: intersection.uv,
        mesh: clickedMesh,
        checkForObject: true
      })
    }

    return
  }

  if (clickedMesh instanceof THREE.Mesh && clickedMesh.geometry) {
    if (currentMesh) {
      currentMesh.traverse(mesh => {
        if (mesh instanceof THREE.Mesh && mesh.geometry && !mesh.geometry.attributes.uv) {
          generateUVs(mesh.geometry)
        }
      })
    }

    setTimeout(() => {
      clickedMesh!.geometry.attributes.uv.needsUpdate = true

      const retryList = targetMesh ? [targetMesh] : meshesToCheck
      for (const mesh of retryList) {
        const newHit = raycaster3D!.intersectObject(mesh!, true)
        if (newHit.length > 0 && newHit[0].uv) {
          const coords = project3DClickToCanvas(
            newHit[0],
            canvasWidth,
            canvasHeight,
            props.workZoneTop,
            props.workZoneBottom
          )
          if (coords) {
            emit('3d-click', {
              intersection: newHit[0],
              canvasX: coords.x,
              canvasY: coords.y,
              uv: newHit[0].uv,
              mesh: clickedMesh
            })
          }
          break
        }
      }
    }, 200)
  }
}

  
  // Handler pour la molette de la souris pour redimensionner les objets
  const onMouseWheel = (event: WheelEvent) => {
    if (!props.dragMode) return
    
    event.preventDefault()
    event.stopPropagation()
    
    const delta = event.deltaY > 0 ? 1 : -1
    const scaleFactor = 1 + (delta * 0.02) // 2% par incrément pour plus de précision
    
    emit('3d-scale', { scaleFactor })
  }
  
  if (!renderer || !renderer.domElement) {
    console.error('setupClickHandler: renderer.domElement not available')
    return
  }
  
  const canvas = renderer.domElement
  console.log('Attaching event listeners to canvas:', canvas)
  
  // Retirer les anciens listeners s'ils existent (pour éviter les doublons)
  if (window._threeSceneDragHandlers) {
    canvas.removeEventListener('mousedown', window._threeSceneDragHandlers.onMouseDown)
    canvas.removeEventListener('mousemove', window._threeSceneDragHandlers.onMouseMove)
    canvas.removeEventListener('mouseup', window._threeSceneDragHandlers.onMouseUp)
    canvas.removeEventListener('click', window._threeSceneDragHandlers.onCanvasClick)
    canvas.removeEventListener('wheel', window._threeSceneDragHandlers.onMouseWheel)
  }
  
  // Ajouter les event listeners pour le drag
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseup', onMouseUp)
  canvas.addEventListener('click', onCanvasClick)
  canvas.addEventListener('wheel', onMouseWheel, { passive: false })
  
  console.log('Event listeners attached successfully')
  
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
  
  // Stocker le helper cube comme mesh unique dans l'array
  // Marquer comme non-réactif pour éviter les problèmes de proxy
  currentMesh = helperCube
  loadedMeshes.value = [markRaw(helperCube)]
}


const loadUvMapsData = async (url: string): Promise<THREE.BufferAttribute | null> => {
    try {
        console.log('📥 Chargement de la UV Map:', url)
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        
        // On suppose que le JSON est un tableau dont le premier élément contient les UVs
        // Structure attendue: [ [u1, v1, u2, v2, ...] ]
        if (Array.isArray(data) && data.length > 0) {
            return new THREE.Float32BufferAttribute(data[0], 2)
        } else {
            console.warn('⚠️ Format de données UV inattendu')
            return null
        }
    } catch (error) {
        console.error('❌ Erreur chargement UV Map:', error)
        return null
    }
}

// ----------------------------------------
// 🔧 Fonction utilitaire : Normalize du modèle
// ----------------------------------------
function normalizeModel(obj, targetSize = 8.5) {
  const box = new THREE.Box3().setFromObject(obj)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  if (
    isNaN(size.x) || isNaN(size.y) || isNaN(size.z) ||
    isNaN(center.x) || isNaN(center.y) || isNaN(center.z)
  ) {
    throw new Error("Le modèle contient des coordonnées invalides (NaN).")
  }

  const maxDim = Math.max(size.x, size.y, size.z)

  if (maxDim <= 0 || !isFinite(maxDim)) {
    throw new Error("Taille du modèle invalide.")
  }

  const scale = targetSize / maxDim
  obj.scale.multiplyScalar(scale)

  obj.position.sub(center.multiplyScalar(scale))

  return { center, size, maxDim, scale }
}

const loadModel = async (url: string | File) => {
  if (!scene) return

  try {
    if (currentMesh) {
      if (currentMesh instanceof THREE.Mesh) {
        currentMesh.geometry?.dispose()
        if (Array.isArray(currentMesh.material)) {
          currentMesh.material.forEach(m => m.dispose())
        } else {
          currentMesh.material?.dispose()
        }
      }
      currentMesh = null
    }

    loadedMeshes.value = []

    const objLoader = new OBJLoader()
    let text: string

    if (url instanceof File) {
      text = await url.text()
    } else if (typeof url === "string") {
      text = url.startsWith("data:") ? atob(url.split(",")[1]) : await fetch(url).then(r => r.text())
    }

    const obj = objLoader.parse(text)

    const { scale, maxDim } = normalizeModel(obj, 9.5)

    let mainMesh: THREE.Mesh | null = null
    obj.traverse(child => {
      if (child instanceof THREE.Mesh && !mainMesh) mainMesh = child
    })

    if (mainMesh) {
      const geometry = mainMesh.geometry.clone()
      const inner = new THREE.Mesh(geometry, innerShaderMaterial)
      const outer = new THREE.Mesh(geometry, outerShaderMaterial)

      inner.name = "Inner_Glass"
      outer.name = "Outer_Texture"
      inner.renderOrder = 0
      outer.renderOrder = 1

      innerMesh.value = markRaw(inner)
      outerMesh.value = markRaw(outer)
      currentMesh = outer
    } else {
      currentMesh = obj
    }

    const distance = maxDim * scale * 1.1
    camera.position.set(distance, distance, distance)
    camera.lookAt(0, 0, 0)

    if (controls) {
      controls.target.set(0, 0, 0)
      controls.enableZoom = false
      controls.enablePan = false
      controls.enableRotate = true
      controls.update()
    }

    obj.rotation.y = Math.PI
    await nextTick()

    if (props.canvas2D) {
      setupSharedCanvasTexture(props.canvas2D)
    } else if (props.texture) {
      applyTexture(props.texture)
    }

  } catch (error) {
   
  }
}


/**
 * Configure la texture partagée à partir du canvas 2D HTML
 */
const setupSharedCanvasTexture = (htmlCanvas: HTMLCanvasElement) => {
  if (!htmlCanvas) {
    console.warn('setupSharedCanvasTexture: htmlCanvas is null')
    return
  }
  
  // Utiliser loadedMeshes au lieu de currentMesh si disponible
  const targetMeshes = loadedMeshes.value.length > 0 ? loadedMeshes.value : (currentMesh ? [currentMesh] : [])
  
  if (targetMeshes.length === 0) {
    console.warn('setupSharedCanvasTexture: No meshes available')
    return
  }

  try {
    // Récupérer tous les matériaux des meshes
    const materials: THREE.Material[] = []
    let meshCount = 0
    
    targetMeshes.forEach((mesh) => {
      if (mesh instanceof THREE.Mesh) {
        meshCount++
        
        // Assurer les UVs
        if (mesh.geometry && !mesh.geometry.attributes.uv) {
          generateUVs(mesh.geometry)
        }
        
        if (Array.isArray(mesh.material)) {
          materials.push(...mesh.material)
        } else if (mesh.material) {
          materials.push(mesh.material)
        }
      } else if (mesh.traverse) {
        // Si c'est un groupe, traverser ses enfants
        mesh.traverse((child) => {
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
      }
    })
    
    console.log(`setupSharedCanvasTexture: Found ${meshCount} meshes, ${materials.length} materials`)
    
    // Si une texture existe déjà, la supprimer avant d'en créer une nouvelle
    if (canvasTexture) {
      canvasTexture.dispose()
      canvasTexture = null
    }
    
    // Créer et configurer la texture
    canvasTexture = setupCanvasTexture(htmlCanvas, materials)
    
    if (!canvasTexture) {
      console.error('setupSharedCanvasTexture: Failed to create texture')
      return
    }
    
    // Appliquer la texture directement sur tous les meshes dans loadedMeshes
    targetMeshes.forEach((mesh) => {
      if (mesh instanceof THREE.Mesh) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => {
            if (mat && mat instanceof THREE.MeshStandardMaterial) {
              mat.map = canvasTexture
              mat.transparent = true
              mat.opacity = 0.9
              mat.alphaTest = 0.01
              mat.needsUpdate = true
            }
          })
        } else if (mesh.material && mesh.material instanceof THREE.MeshStandardMaterial) {
          mesh.material.map = canvasTexture
          mesh.material.transparent = true
          mesh.material.opacity = 0.9
          mesh.material.alphaTest = 0.01
          mesh.material.needsUpdate = true
        }
      } else if (mesh.traverse) {
        // Si c'est un groupe, appliquer via traverse
        applyTextureToMesh(mesh, canvasTexture)
      }
    })
    
    console.log('setupSharedCanvasTexture: Texture applied successfully')
    
    emit('texture-ready', canvasTexture)
    
  } catch (error) {
    console.error('setupSharedCanvasTexture error:', error)
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

const applyTexture = (texture: THREE.Texture | null) => {
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
    
    if (currentMesh instanceof THREE.Mesh) {
      if (currentMesh.geometry) currentMesh.geometry.dispose()
      if (currentMesh.material) {
        if (Array.isArray(currentMesh.material)) {
          currentMesh.material.forEach((mat: THREE.Material) => mat.dispose())
        } else {
          currentMesh.material.dispose()
        }
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


// Méthode pour mettre à jour le mode placement
const setPlacementMode = (active: boolean, type: string) => {
  if (renderer && renderer.domElement) {
    if (active) {
      renderer.domElement.style.cursor = 'crosshair'
    } else {
      renderer.domElement.style.cursor = 'default'
    }
  }
}

// Méthode pour mettre à jour le mode drag
const setDragMode = (active: boolean) => {
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
const setResizing = (resizing: boolean, startPos: { x: number; y: number } | null, handleInfo: any) => {
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
const setDragState = (dragging: boolean) => {
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
const updateSelectedObjectCoords = (obj: any) => {
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
 * Calcule les coordonnées de tous les contrôles pour un objet Fabric.js
 * @param {fabric.Object} obj - L'objet Fabric.js
 * @param {boolean} skipSetCoords - Si true, ne pas appeler setCoords() pour éviter les boucles récursives
 * @returns {Object} - Objet contenant les coordonnées de tous les contrôles
 */
const calculateControlCoordinates = (obj: any, skipSetCoords = false): Record<string, { x: number; y: number }> => {
  if (!obj) return {}
  
  let coords = obj.oCoords
  
  // Si demandé, forcer le recalcul des coordonnées
  try {
    if (skipSetCoords && obj.calcCoords) {
      // calcCoords retourne les coordonnées mises à jour sans modifier l'objet
      const calculatedCoords = obj.calcCoords()
      if (calculatedCoords) {
        coords = calculatedCoords
      }
    }
  } catch (e) {
    console.warn('Erreur lors de calcCoords:', e)
    // Si calcCoords échoue, essayer oCoords
    coords = obj.oCoords || null
  }
  
  if (!coords || !coords.tl) return {}
  
  const controls: Record<string, { x: number; y: number }> = {}
  
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
const updateObjectsListFromCanvas = (objects: any[]) => {
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
    allObjectsList.value = objects
      .filter(obj => !obj.userData?.isWorkZoneIndicator)
      .map((obj, index) => {
        const objWidth = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
        const objHeight = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
        
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
 * Définit si le curseur survole le contrôle de rotation
 * @param {boolean} isHovering - true si on survole le contrôle de rotation
 */
const setRotationHandleHover = (isHovering: boolean) => {
  coordinatesDisplay.value.isOnRotationHandle = isHovering
}

/**
 * Met à jour l'état de débogage pour afficher le contrôle détecté
 * @param {Object|null} handleInfo - Informations sur le contrôle détecté ou null
 * @param {number|null} distance - Distance au contrôle (optionnel)
 * @param {number|null} x - Coordonnée X du contrôle (optionnel)
 * @param {number|null} y - Coordonnée Y du contrôle (optionnel)
 */
const setDetectedControl = (handleInfo: any, distance: number | null = null, x: number | null = null, y: number | null = null) => {
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
const patchMaterialForDecal = (material: any) => {
  if (material.userData.isPatched) return
  
  material.onBeforeCompile = (shader: THREE.Shader) => {
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
const startDecalRotation = async (objectProps: any, dataUrl: string) => {
  if (!dataUrl || !scene) return

  try {
    // 1. Charger la texture
    const textureLoader = new THREE.TextureLoader()
    const texture = await textureLoader.loadAsync(dataUrl)
    
    // 2. S'assurer que tous les matériaux sont patchés
    // Utiliser loadedMeshes si disponible, sinon fallback sur currentMesh
    const meshesToPatch: THREE.Mesh[] = loadedMeshes.value.length > 0 ? loadedMeshes.value : (currentMesh ? [] : [])
    
    // Si loadedMeshes est vide, utiliser currentMesh.traverse
    if (meshesToPatch.length === 0 && currentMesh) {
      currentMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshesToPatch.push(child)
        }
      })
    }
    
    // Patcher tous les matériaux des meshes
    let materialsPatched = false
    meshesToPatch.forEach((mesh) => {
      if (mesh instanceof THREE.Mesh && mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => {
            if (mat) {
              patchMaterialForDecal(mat)
              materialsPatched = true
              // Forcer la recompilation du shader
              mat.needsUpdate = true
            }
          })
        } else {
          patchMaterialForDecal(mesh.material)
          materialsPatched = true
          // Forcer la recompilation du shader
          mesh.material.needsUpdate = true
        }
      }
    })
    
    if (!materialsPatched) {
      console.warn('startDecalRotation: No materials found to patch')
      return
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

const updateDecalRotation = (absoluteAngle: number) => {
  // Mise à jour ultra-rapide via uniform (GPU)
  shaderUniforms.uDecalAngle.value = absoluteAngle * (Math.PI / 180)
}

const endDecalRotation = () => {
  // Cacher le decal
  shaderUniforms.uDecalVisible.value = 0
  shaderUniforms.uDecalMap.value = null
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
  // Rotation optimisée (Decal)
  startDecalRotation,
  updateDecalRotation,
  endDecalRotation,
  
  // Contrôles OrbitControls
  disableOrbitControls,
  enableOrbitControls,
  
  // Texture
  applyTexture,
  setupSharedCanvasTexture: (canvas: HTMLCanvasElement) => {
    if (canvas && currentMesh) {
      setupSharedCanvasTexture(canvas)
    }
  },
  updateTextureDirect, // Utilisé via prop dans FabricDesigner
  
  // Sélection et placement
  setPlacementMode,
  updateSelectedObjectCoords,
  updateObjectsListFromCanvas,
  
  // Drag
  setDragMode,
  setDragState,
  
  // Resize
  setResizing,
  
  // Rotation modèle et handles
  rotateModel,
  setRotationHandleHover,
  setDetectedControl,
  
  // Renderer (pour accéder au DOM)
  renderer: () => renderer
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

