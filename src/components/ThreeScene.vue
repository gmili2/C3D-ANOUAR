<template>
 <div class="three-scene-container">
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
    :camera="camera"
  />
</div>

</template>

<script setup lang="ts">

import { ref, shallowRef, watch, nextTick, markRaw, type PropType } from 'vue'
import * as THREE from 'three'
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { setupCanvasTexture, applyTextureToMesh } from '../composables/useCanvasTexture'
import { project3DClickToCanvas } from '../composables/use3DTo2DProjection'
import { useShaderMaterial } from '../composables/useShaderMaterial'
import TextureUpdater from './TextureUpdater.vue'
import { TresCanvas } from '@tresjs/core'

const props = defineProps({
  texture: {
    type: Object as PropType<THREE.Texture | null>,
    default: null
  },
  canvas2D: {
    type: Object as PropType<HTMLCanvasElement | null>,
    default: null
  },
})

const emit = defineEmits<{
  (e: 'texture-ready', texture: THREE.CanvasTexture): void
  (e: '3d-click', data: any): void
  (e: '3d-click-outside', data: any): void
  (e: '3d-drag', data: { canvasX: number; canvasY: number }): void
  (e: '3d-drag-start', data: { canvasX: number; canvasY: number }): void
  (e: '3d-drag-end'): void
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
let canvasTexture: THREE.CanvasTexture | null = null
const tresCanvasRef = ref<any>(null)
const textureUpdaterRef = ref<any>(null)
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let controls: ThreeOrbitControls | null = null
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
let isUpdatingSelectedObject = false
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

watch(() => props.canvas2D, (newCanvas) => {
  if (newCanvas && currentMesh) {
    setupSharedCanvasTexture(newCanvas)
  }
}, { deep: true })

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

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
    directionalLight.position.set(5, 10, 7.5)
    scene.add(directionalLight)

    initSceneAfterTresReady()
  })
}

const initSceneAfterTresReady = () => {
  if (!scene || !camera || !renderer) return

  if (props.canvas2D) setupSharedCanvasTexture(props.canvas2D)
  loadModel("https://3d-back-wobz-v2.sh2.hidora.net/downloadSvg?filename=2025/04/24/680a5a7c34e69_2025_03_10_67cee4edc0a55_2024_02_23_65d8b8086988e_22022_05_30_6294959dca46a_12-18_(2).obj")

  nextTick(() => {
    if (renderer?.domElement) {
      console.log('Setting up click handler, renderer:', renderer)
      setupClickHandler()
    } else {
      console.warn('Cannot setup click handler:', {
        renderer: !!renderer,
        domElement: !!renderer?.domElement
      })
    }
  })
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
  
  const getCanvasCoords = (event: MouseEvent) => {
    if (!props.canvas2D || !raycaster3D || !mouse || !renderer || !camera) return null
    
    const canvas = renderer.domElement
    const rect = canvas.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    raycaster3D.setFromCamera(mouse, camera)
    
    let intersects: THREE.Intersection[] = []
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
          isOnSeam: intersection.uv.x < 0.01 || intersection.uv.x > 0.99
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
}

  
  if (!renderer || !renderer.domElement) {
    console.error('setupClickHandler: renderer.domElement not available')
    return
  }
  
  const canvas = renderer.domElement
  console.log('Attaching event listeners to canvas:', canvas)
  
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseup', onMouseUp)
  canvas.addEventListener('click', onCanvasClick)
}

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

const setupSharedCanvasTexture = (htmlCanvas: HTMLCanvasElement) => {
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
    const materials: THREE.Material[] = []
    let meshCount = 0
    
    targetMeshes.forEach((mesh) => {
      if (mesh instanceof THREE.Mesh) {
        meshCount++
    
        if (Array.isArray(mesh.material)) {
          materials.push(...mesh.material)
        } else if (mesh.material) {
          materials.push(mesh.material)
        }
      } else if (mesh.traverse) {
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            meshCount++
            
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
        applyTextureToMesh(mesh, canvasTexture)
      }
    })
    
    console.log('setupSharedCanvasTexture: Texture applied successfully')
    
    emit('texture-ready', canvasTexture)
    
  } catch (error) {
    console.error('setupSharedCanvasTexture error:', error)
  }
}

const applyTexture = (texture: THREE.Texture | null) => {
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
      
      if (Array.isArray(child.material)) {
        child.material.forEach((mat, idx) => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhongMaterial) {
            mat.map = texture

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

const updateSelectedObjectCoords = (obj: any) => {
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

const calculateControlCoordinates = (obj: any, skipSetCoords = false): Record<string, { x: number; y: number }> => {
  if (!obj) return {}
  
  let coords = obj.oCoords
  
  try {
    if (skipSetCoords && obj.calcCoords) {
      const calculatedCoords = obj.calcCoords()
      if (calculatedCoords) {
        coords = calculatedCoords
      }
    }
  } catch (e) {
    console.warn('Erreur lors de calcCoords:', e)
    coords = obj.oCoords || null
  }
  
  if (!coords || !coords.tl) return {}
  
  const controls: Record<string, { x: number; y: number }> = {}
  
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

const patchMaterialForDecal = (material: any) => {
  if (material.userData.isPatched) return
  
  material.onBeforeCompile = (shader: THREE.Shader) => {
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

const startDecalRotation = async (objectProps: any, dataUrl: string) => {
  if (!dataUrl || !scene) return

  try {
    const textureLoader = new THREE.TextureLoader()
    const texture = await textureLoader.loadAsync(dataUrl)
    
    const meshesToPatch: THREE.Mesh[] = loadedMeshes.value.length > 0 ? loadedMeshes.value : (currentMesh ? [] : [])
    
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
    
    const multiplier = objectProps.multiplier || 1
    const realWidth = texture.image.width / multiplier
    const realHeight = texture.image.height / multiplier
    
    const scaleU = realWidth / canvasWidth
    const scaleV = realHeight / canvasHeight
    
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
  shaderUniforms.uDecalAngle.value = absoluteAngle * (Math.PI / 180)
}

const endDecalRotation = () => {
  shaderUniforms.uDecalVisible.value = 0
  shaderUniforms.uDecalMap.value = null
}

defineExpose({
  startDecalRotation,
  updateDecalRotation,
  endDecalRotation,
  updateSelectedObjectCoords,
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

.add-rectangle-btn {
  position: absolute;
  bottom: 30px;
  right: 30px;
  z-index: 999;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 50px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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

.add-rectangle-btn.active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
  animation: pulse 2s ease-in-out infinite;
}

.add-rectangle-btn.active:hover {
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.6);
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
  transition: all 0.3s ease;
}

.coordinates-display.on-seam {
  background: rgba(200, 0, 0, 0.9) !important;
  border: 2px solid #ff0000;
  color: #fff;
  box-shadow: 0 4px 16px rgba(255, 0, 0, 0.5);
}

.coordinates-display.on-seam .coord-title {
  color: #fff;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
}

.coordinates-display.on-rotation {
  background: rgba(255, 165, 0, 0.9) !important;
  border: 2px solid #ff8c00;
  color: #fff;
  box-shadow: 0 4px 16px rgba(255, 165, 0, 0.5);
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

.canvas-objects-list {
  position: absolute;
  top: 20px;
  left: 360px;
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
