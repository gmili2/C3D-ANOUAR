<template>
  <div class="three-scene-container">
    <canvas ref="canvasElement" class="three-canvas"></canvas>
    <!-- TextureUpdater invisible pour surveiller les mises à jour -->
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

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { setupCanvasTexture, applyTextureToMesh, useCanvasTextureStore } from '../composables/useCanvasTexture'
import { project3DClickToCanvas } from '../composables/use3DTo2DProjection'
import TextureUpdater from './TextureUpdater.vue'

const props = defineProps({
  modelUrl: {
    type: String,
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
  }
})

const emit = defineEmits(['model-loaded', 'model-error', 'texture-ready', '3d-click', 'meshes-extracted'])

let allMeshes = []
let activeMesh = null
let highlightedMesh = null

const canvasElement = ref(null)
const textureUpdaterRef = ref(null)

let scene = null
let camera = null
let renderer = null
let controls = null
let currentMesh = null
let animationId = null
let handleResize = null
let canvasTexture = null // Texture partagée du canvas 2D

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

// Watch pour le canvas 2D
watch(() => props.canvas2D, (newCanvas) => {
  if (newCanvas && currentMesh) {
    setupSharedCanvasTexture(newCanvas)
  }
})

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

const initScene = () => {
  if (!canvasElement.value) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a1a)

  const width = canvasElement.value.clientWidth || 800
  const height = canvasElement.value.clientHeight || 600

  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
  camera.position.set(0, 0, 5)

  renderer = new THREE.WebGLRenderer({
    canvas: canvasElement.value,
    antialias: true
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(window.devicePixelRatio)

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6)
  directionalLight.position.set(5, 5, 5)
  scene.add(directionalLight)

  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4)
  directionalLight2.position.set(-5, -5, -5)
  scene.add(directionalLight2)

  // Controls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.enableZoom = true
  controls.enablePan = true

  // Animation loop avec mise à jour de texture
  const { render2D, resetTextureUpdate } = useCanvasTextureStore()
  
  const animate = () => {
    animationId = requestAnimationFrame(animate)
    
    // Vérifier et mettre à jour la texture si nécessaire
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

let raycaster3D = null

const setupClickHandler = () => {
  if (!renderer || !canvasElement.value || raycaster3D) return
  
  raycaster3D = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  
  const onCanvasClick = (event) => {
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
        // Convertir le clic 3D en coordonnées canvas 2D
        const canvasCoords = project3DClickToCanvas(
          intersection,
          props.canvas2D.width || 800,
          props.canvas2D.height || 600
        )
        
        if (canvasCoords) {
          emit('3d-click', {
            intersection,
            canvasX: canvasCoords.x,
            canvasY: canvasCoords.y,
            uv: intersection.uv,
            mesh: clickedMesh
          })
          
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
              const newCanvasCoords = project3DClickToCanvas(
                newIntersects[0],
                props.canvas2D.width || 800,
                props.canvas2D.height || 600
              )
              if (newCanvasCoords) {
                emit('3d-click', {
                  intersection: newIntersects[0],
                  canvasX: newCanvasCoords.x,
                  canvasY: newCanvasCoords.y,
                  uv: newIntersects[0].uv,
                  mesh: clickedMesh
                })
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
  
  renderer.domElement.addEventListener('click', onCanvasClick)
  
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

    // Calculate bounding box and center the model
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)

    // Scale to fit in view
    const scale = 3 / maxDim
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

    // Adjust camera
    const scaledMaxDim = maxDim * scale
    const distance = scaledMaxDim * 2
    camera.position.set(distance, distance, distance)
    camera.lookAt(0, 0, 0)
    
    if (controls) {
      controls.target.set(0, 0, 0)
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
      texture: !!canvasTexture,
      textureImage: !!canvasTexture.image,
      materialCount: materials.length
    })
  } catch (error) {
    console.error('Erreur lors de la configuration de la texture partagée:', error)
  }
}

/**
 * Génère des UVs pour une géométrie avec projection cylindrique améliorée
 */
const generateUVs = (geometry) => {
  const positions = geometry.attributes.position
  const uvs = []
  
  if (!positions) return
  
  // Calculer la bounding box pour normaliser
  const box = new THREE.Box3().setFromBufferAttribute(positions)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  
  // Déterminer la meilleure projection selon la forme
  const isCylindrical = size.y > size.x * 0.8 && size.y > size.z * 0.8 // Forme verticale
  const isWide = size.x > size.y * 1.5 || size.z > size.y * 1.5
  
  if (isCylindrical) {
    // Projection cylindrique pour objets verticaux (bocal, etc.)
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) - center.x
      const y = positions.getY(i) - center.y
      const z = positions.getZ(i) - center.z
      
      // Angle autour de l'axe Y (azimuth)
      const angle = Math.atan2(z, x)
      const u = (angle / (2 * Math.PI)) + 0.5
      
      // Hauteur normalisée selon Y
      const v = (y + size.y / 2) / size.y
      
      uvs.push(Math.max(0, Math.min(1, u)))
      uvs.push(Math.max(0, Math.min(1, v)))
    }
  } else if (isWide) {
    // Projection plane pour objets plats (XZ plane)
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) - center.x
      const z = positions.getZ(i) - center.z
      
      const u = (x + size.x / 2) / size.x
      const v = (z + size.z / 2) / size.z
      
      uvs.push(Math.max(0, Math.min(1, u)))
      uvs.push(Math.max(0, Math.min(1, v)))
    }
  } else {
    // Projection sphérique pour objets arrondis
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) - center.x
      const y = positions.getY(i) - center.y
      const z = positions.getZ(i) - center.z
      
      // Normaliser pour la sphère
      const length = Math.sqrt(x * x + y * y + z * z)
      if (length > 0) {
        const nx = x / length
        const ny = y / length
        const nz = z / length
        
        // Coordonnées UV sphériques
        const u = (Math.atan2(nz, nx) / (2 * Math.PI)) + 0.5
        const v = (Math.asin(ny) / Math.PI) + 0.5
        
        uvs.push(Math.max(0, Math.min(1, u)))
        uvs.push(Math.max(0, Math.min(1, v)))
      } else {
        uvs.push(0.5, 0.5)
      }
    }
  }
  
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  console.log('✅ UVs générées avec projection adaptée', {
    type: isCylindrical ? 'cylindrique' : isWide ? 'plane' : 'sphérique',
    vertexCount: positions.count
  })
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
  getAllMeshes: () => allMeshes
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
</style>

