<template>
  <div id="obj-viewer">
    <div class="viewer-header">
      <h2>Visualiseur OBJ avec Texture</h2>
      <router-link to="/" class="back-btn">← Retour</router-link>
    </div>
    <div class="viewer-container">
      <!-- Canvas 2D à gauche -->
      <div class="canvas-2d-panel">
        <div class="panel-header">
          <h3>Personnaliser (Temps réel)</h3>
        </div>
        <div class="upload-section">
          <label for="obj-file-input" class="upload-btn">
            <input
              id="obj-file-input"
              type="file"
              accept=".obj"
              @change="handleOBJUpload"
              style="display: none;"
            />
            Charger OBJ
          </label>
        </div>
        <div class="draw-toolbar-compact">
          <div class="toolbar-section-compact">
            <label>
              Couleur:
              <input type="color" v-model="drawColor" />
            </label>
            <label>
              Largeur:
              <input type="range" v-model.number="drawWidth" min="1" max="20" />
              {{ drawWidth }}px
            </label>
          </div>
          <div class="toolbar-section-compact">
            <button @click="addTextToCanvas" class="small-btn">Texte</button>
            <button @click="addCircleToCanvas" class="small-btn">Cercle</button>
            <button @click="addRectToCanvas" class="small-btn">Rectangle</button>
            <button @click="addImageToCanvas" class="small-btn">Image</button>
            <button @click="toggleDrawMode" class="small-btn">{{ isDrawMode ? 'Mode objet' : 'Mode dessin' }}</button>
            <button @click="clearCanvas" class="small-btn">Effacer</button>
          </div>
        </div>
        <canvas ref="customizeCanvasElement" id="customizeCanvas" width="512" height="512"></canvas>
      </div>
      
      <!-- Vue 3D à droite -->
      <div class="canvas-3d-panel">
        <canvas ref="threeCanvasElement" id="threeCanvas"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { Canvas, Rect, Circle, Textbox, Image as FabricImage } from 'fabric'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'

const customizeCanvasElement = ref(null)
const threeCanvasElement = ref(null)

let scene = null
let camera = null
let renderer = null
let orbitControls = null
let uploadedMesh = null
let customizeCanvas = null
let animationId = null
let handleResize = null
let realTimeUpdateTimeout = null

const drawColor = ref('#000000')
const drawWidth = ref(5)
const isDrawMode = ref(false)

onMounted(async () => {
  await nextTick()
  initThreeJS()
})

onUnmounted(() => {
  cleanup()
})

const cleanup = () => {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  if (renderer) {
    renderer.dispose()
    renderer = null
  }
  if (orbitControls) {
    orbitControls.dispose()
    orbitControls = null
  }
  if (uploadedMesh) {
    scene?.remove(uploadedMesh)
    uploadedMesh.geometry?.dispose()
    if (uploadedMesh.material) {
      if (Array.isArray(uploadedMesh.material)) {
        uploadedMesh.material.forEach(mat => mat.dispose())
      } else {
        uploadedMesh.material.dispose()
      }
    }
    uploadedMesh = null
  }
  if (customizeCanvas) {
    try {
      customizeCanvas.off()
      customizeCanvas.dispose()
    } catch (e) {
      console.warn('Erreur lors du dispose du canvas:', e)
    }
    customizeCanvas = null
  }
  if (realTimeUpdateTimeout) {
    clearTimeout(realTimeUpdateTimeout)
    realTimeUpdateTimeout = null
  }
  if (handleResize) {
    window.removeEventListener('resize', handleResize)
    handleResize = null
  }
  scene = null
  camera = null
}

const initThreeJS = () => {
  if (!threeCanvasElement.value) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a1a)
  
  const width = threeCanvasElement.value.clientWidth || 800
  const height = threeCanvasElement.value.clientHeight || 600
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
  camera.position.set(3, 3, 3)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({
    canvas: threeCanvasElement.value,
    antialias: true
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(window.devicePixelRatio)

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0)
  scene.add(ambientLight)
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(5, 5, 5)
  scene.add(directionalLight)

  orbitControls = new OrbitControls(camera, renderer.domElement)
  orbitControls.enableDamping = true
  orbitControls.dampingFactor = 0.05
  orbitControls.enableZoom = true
  orbitControls.enablePan = true
  orbitControls.autoRotate = false

  const animate = () => {
    animationId = requestAnimationFrame(animate)
    if (orbitControls) {
      orbitControls.update()
    }
    renderer.render(scene, camera)
  }
  
  animate()

  handleResize = () => {
    if (!threeCanvasElement.value || !renderer || !camera) return
    const newWidth = threeCanvasElement.value.clientWidth
    const newHeight = threeCanvasElement.value.clientHeight
    camera.aspect = newWidth / newHeight
    camera.updateProjectionMatrix()
    renderer.setSize(newWidth, newHeight)
  }
  
  window.addEventListener('resize', handleResize)
}

const initCustomizeCanvas = async () => {
  if (!uploadedMesh) return
  
  await nextTick()
  
  if (customizeCanvasElement.value) {
    if (customizeCanvas) {
      try {
        customizeCanvas.dispose()
      } catch (e) {
        console.warn('Erreur lors du dispose du canvas:', e)
      }
      customizeCanvas = null
    }
    
    if (customizeCanvasElement.value.fabric) {
      try {
        const existingCanvas = customizeCanvasElement.value.fabric
        if (existingCanvas && typeof existingCanvas.dispose === 'function') {
          existingCanvas.dispose()
        }
        delete customizeCanvasElement.value.fabric
      } catch (e) {
        delete customizeCanvasElement.value.fabric
      }
    }
    
    try {
      customizeCanvas = new Canvas(customizeCanvasElement.value, {
        backgroundColor: '#ffffff',
        width: 512,
        height: 512
      })
      
      customizeCanvas.isDrawingMode = isDrawMode.value
      
      if (customizeCanvas.freeDrawingBrush) {
        customizeCanvas.freeDrawingBrush.width = drawWidth.value
        customizeCanvas.freeDrawingBrush.color = drawColor.value
      }
      
      // Écouter les modifications pour mise à jour en temps réel
      customizeCanvas.on('path:created', () => updateTextureRealTime())
      customizeCanvas.on('object:added', () => updateTextureRealTime())
      customizeCanvas.on('object:modified', () => updateTextureRealTime())
      customizeCanvas.on('object:removed', () => updateTextureRealTime())
      customizeCanvas.on('after:render', () => {
        if (realTimeUpdateTimeout) {
          clearTimeout(realTimeUpdateTimeout)
        }
        realTimeUpdateTimeout = setTimeout(() => {
          updateTextureRealTime()
        }, 200)
      })
    } catch (e) {
      console.error('Erreur lors de la création du canvas:', e)
    }
  }
}

const handleOBJUpload = async (event) => {
  const file = event.target.files?.[0]
  if (!file || !file.name.endsWith('.obj')) {
    alert('Veuillez sélectionner un fichier OBJ valide')
    return
  }
  
  if (!scene || !camera) {
    alert('La vue 3D doit être initialisée')
    return
  }
  
  try {
    const text = await file.text()
    
    if (uploadedMesh) {
      scene.remove(uploadedMesh)
      uploadedMesh.geometry.dispose()
      if (uploadedMesh.material) {
        if (Array.isArray(uploadedMesh.material)) {
          uploadedMesh.material.forEach(mat => mat.dispose())
        } else {
          uploadedMesh.material.dispose()
        }
      }
      uploadedMesh = null
    }
    
    const loader = new OBJLoader()
    const obj = loader.parse(text)
    
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = 4 / maxDim
    
    obj.position.sub(center)
    obj.scale.multiplyScalar(scale)
    
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!child.material) {
          child.material = new THREE.MeshPhongMaterial({
            color: 0x888888,
            side: THREE.DoubleSide
          })
        }
      }
    })
    
    scene.add(obj)
    uploadedMesh = obj
    
    await initCustomizeCanvas()
    
    const scaledMaxDim = maxDim * scale
    const distance = scaledMaxDim * 1.5
    camera.position.set(distance, distance, distance)
    camera.lookAt(0, 0, 0)
    
    if (orbitControls) {
      orbitControls.target.set(0, 0, 0)
      orbitControls.update()
    }
    
    event.target.value = ''
  } catch (error) {
    console.error('Erreur lors du chargement du OBJ:', error)
    alert('Erreur lors du chargement du fichier OBJ: ' + error.message)
  }
}

const updateTextureRealTime = async () => {
  if (!customizeCanvas || !uploadedMesh || !scene) return
  
  try {
    const canvasElement = customizeCanvas.getElement()
    if (!canvasElement || canvasElement.width === 0 || canvasElement.height === 0) return
    
    customizeCanvas.renderAll()
    
    await new Promise(resolve => requestAnimationFrame(resolve))
    
    const imageCanvas = document.createElement('canvas')
    imageCanvas.width = canvasElement.width
    imageCanvas.height = canvasElement.height
    const imageCtx = imageCanvas.getContext('2d')
    
    if (!imageCtx) return
    
    imageCtx.fillStyle = '#ffffff'
    imageCtx.fillRect(0, 0, imageCanvas.width, imageCanvas.height)
    imageCtx.drawImage(canvasElement, 0, 0)
    
    uploadedMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              if (mat.map) {
                mat.map.dispose()
              }
            })
          } else {
            if (child.material.map) {
              child.material.map.dispose()
            }
          }
        }
        
        const meshTexture = new THREE.CanvasTexture(imageCanvas)
        meshTexture.flipY = false
        meshTexture.needsUpdate = true
        meshTexture.format = THREE.RGBAFormat
        
        const newMaterial = new THREE.MeshPhongMaterial({
          map: meshTexture,
          side: THREE.DoubleSide
        })
        newMaterial.needsUpdate = true
        
        if (Array.isArray(child.material)) {
          child.material = child.material.map(() => {
            const matTexture = new THREE.CanvasTexture(imageCanvas)
            matTexture.flipY = false
            matTexture.needsUpdate = true
            matTexture.format = THREE.RGBAFormat
            return new THREE.MeshPhongMaterial({
              map: matTexture,
              side: THREE.DoubleSide
            })
          })
        } else {
          child.material = newMaterial
        }
        
        child.material.needsUpdate = true
      }
    })
    
    if (renderer && camera) {
      renderer.render(scene, camera)
    }
  } catch (error) {
    console.error('Erreur lors de la mise à jour en temps réel:', error)
  }
}

const toggleDrawMode = () => {
  isDrawMode.value = !isDrawMode.value
  if (customizeCanvas) {
    customizeCanvas.isDrawingMode = isDrawMode.value
  }
}

const addTextToCanvas = () => {
  if (!customizeCanvas) return
  const text = new Textbox('Texte', {
    left: 256,
    top: 256,
    fontSize: 30,
    fill: drawColor.value,
    originX: 'center',
    originY: 'center'
  })
  customizeCanvas.add(text)
  customizeCanvas.setActiveObject(text)
}

const addCircleToCanvas = () => {
  if (!customizeCanvas) return
  const circle = new Circle({
    left: 256,
    top: 256,
    radius: 50,
    fill: drawColor.value,
    originX: 'center',
    originY: 'center'
  })
  customizeCanvas.add(circle)
  customizeCanvas.setActiveObject(circle)
}

const addRectToCanvas = () => {
  if (!customizeCanvas) return
  const rect = new Rect({
    left: 206,
    top: 206,
    width: 100,
    height: 100,
    fill: drawColor.value,
    originX: 'center',
    originY: 'center'
  })
  customizeCanvas.add(rect)
  customizeCanvas.setActiveObject(rect)
}

const addImageToCanvas = () => {
  if (!customizeCanvas) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const img = await FabricImage.fromURL(URL.createObjectURL(file))
      img.set({
        left: 256,
        top: 256,
        originX: 'center',
        originY: 'center',
        scaleX: Math.min(200 / img.width, 200 / img.height),
        scaleY: Math.min(200 / img.width, 200 / img.height)
      })
      customizeCanvas.add(img)
      customizeCanvas.setActiveObject(img)
    } catch (error) {
      console.error('Erreur lors du chargement de l\'image:', error)
      alert('Erreur lors du chargement de l\'image')
    }
  }
  input.click()
}

const clearCanvas = () => {
  if (customizeCanvas) {
    customizeCanvas.clear()
    customizeCanvas.backgroundColor = '#ffffff'
    customizeCanvas.renderAll()
  }
}

watch(drawColor, (newColor) => {
  if (customizeCanvas && customizeCanvas.freeDrawingBrush) {
    customizeCanvas.freeDrawingBrush.color = newColor
  }
})

watch(drawWidth, (newWidth) => {
  if (customizeCanvas && customizeCanvas.freeDrawingBrush) {
    customizeCanvas.freeDrawingBrush.width = newWidth
  }
})
</script>

<style scoped>
#obj-viewer {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  background: white;
  border-bottom: 1px solid #ddd;
}

.viewer-header h2 {
  margin: 0;
  font-size: 20px;
  color: #333;
}

.back-btn {
  padding: 8px 16px;
  background: #6b7280;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 14px;
}

.back-btn:hover {
  background: #4b5563;
}

.viewer-container {
  display: flex;
  gap: 20px;
  flex: 1;
  overflow: hidden;
  padding: 20px;
  min-height: 0;
}

.canvas-2d-panel {
  flex: 0 0 600px;
  display: flex;
  flex-direction: column;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 15px;
  background: white;
  overflow-y: auto;
}

.canvas-3d-panel {
  flex: 1;
  display: flex;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  background: #1a1a1a;
  min-width: 0;
}

.canvas-3d-panel canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.panel-header {
  margin-bottom: 15px;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.upload-section {
  margin-bottom: 15px;
}

.upload-btn {
  display: inline-block;
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.upload-btn:hover {
  background: #2563eb;
}

.draw-toolbar-compact {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 15px;
}

.toolbar-section-compact {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 8px;
  background: #f9f9f9;
  border-radius: 4px;
  border: 1px solid #eee;
}

.toolbar-section-compact label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.small-btn {
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 3px;
  cursor: pointer;
}

.small-btn:hover {
  background: #f0f0f0;
}

#customizeCanvas {
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
}
</style>

