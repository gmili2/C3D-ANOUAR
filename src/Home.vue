<template>
  <div id="home">
    <div id="toolbar">
      <button @click="addRectangle">Ajouter rectangle</button>
      <button @click="addCircle">Ajouter cercle</button>
      <button @click="addText">Ajouter texte</button>
      <button @click="clearCanvas">Tout effacer</button>
      <button @click="exportJSON">Exporter JSON</button>
      <button @click="importJSON">Importer JSON</button>
      <button @click="open3DView" class="view3d-btn">Vue 3D</button>
      <router-link to="/obj-viewer" class="view3d-btn">Visualiseur OBJ</router-link>
      <router-link to="/design-studio" class="view3d-btn">🎨 Design Studio</router-link>
    </div>
    <canvas ref="canvasElement" id="c" width="900" height="560"></canvas>

    <!-- Modal de dessin -->
    <div v-if="showDrawModal" class="modal-overlay" @click.self="closeDrawModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Dessiner dans le rectangle</h3>
          <button class="close-btn" @click="closeDrawModal">✕</button>
        </div>
        <div class="draw-toolbar">
          <div class="toolbar-section">
            <h4>Dessin libre:</h4>
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
          <div class="toolbar-section">
            <h4>Formes:</h4>
            <button @click="addTextToDrawCanvas">Texte</button>
            <button @click="addCircleToDrawCanvas">Cercle</button>
            <button @click="addRectToDrawCanvas">Rectangle</button>
            <button @click="addImageToDrawCanvas">Image</button>
          </div>
          <div class="toolbar-section">
            <button @click="toggleDrawMode">{{ isDrawMode ? 'Mode objet' : 'Mode dessin' }}</button>
            <button @click="clearDrawCanvas">Effacer</button>
            <button @click="applyDrawingToRect" class="apply-btn">Appliquer</button>
          </div>
        </div>
        <canvas ref="drawCanvasElement" id="drawCanvas" :width="drawCanvasWidth" :height="drawCanvasHeight"></canvas>
      </div>
    </div>

    <!-- Modal Vue 3D -->
    <div v-if="show3DModal" class="modal-overlay" @click.self="close3DModal">
      <div class="modal-content-3d">
        <div class="modal-header">
          <h3>Vue 3D - Cube Fabric.js</h3>
          <div class="modal-header-actions">
            <button @click="exportCubeOBJ" class="export-btn" :disabled="!cubeMesh">Télécharger OBJ</button>
            <button class="close-btn" @click="close3DModal">✕</button>
          </div>
        </div>
        <canvas ref="threeCanvasElement" id="threeCanvas"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { Canvas, Rect, Circle, Textbox, Point, Image as FabricImage, Pattern } from 'fabric'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'

const canvasElement = ref(null)
const drawCanvasElement = ref(null)
const threeCanvasElement = ref(null)
let canvas = null
let drawCanvas = null
let isPanning = false
let currentRect = null

// Three.js
let scene = null
let camera = null
let renderer = null
let meshes = []
let animationId = null
let handleResize = null
let orbitControls = null
let raycaster = null
let cubeMesh = null

const showDrawModal = ref(false)
const show3DModal = ref(false)
const drawColor = ref('#000000')
const drawWidth = ref(5)
const drawCanvasWidth = ref(400)
const drawCanvasHeight = ref(300)
const isDrawMode = ref(true)

onMounted(() => {
  canvas = new Canvas(canvasElement.value, {
    backgroundColor: '#f9fafb',
    selection: true
  })
  
  createDefaultCubeFaces()

  canvas.on('mouse:wheel', (opt) => {
    const delta = opt.e.deltaY
    let zoom = canvas.getZoom()
    zoom *= 0.999 ** delta
    zoom = Math.min(Math.max(zoom, 0.2), 4)
    const { offsetX, offsetY } = opt.e
    canvas.zoomToPoint({ x: offsetX, y: offsetY }, zoom)
    opt.e.preventDefault()
    opt.e.stopPropagation()
  })

  canvas.on('mouse:down', (opt) => {
    if (opt.e.code === 'Space' || opt.e.key === ' ') {
      isPanning = true
      canvas.setCursor('grab')
    }
  })

  canvas.on('mouse:move', (opt) => {
    if (isPanning && opt && opt.e) {
      const e = opt.e
      const delta = new Point(e.movementX, e.movementY)
      canvas.relativePan(delta)
    }
  })

  canvas.on('mouse:dblclick', (opt) => {
    const obj = opt.target
    if (obj && obj.type === 'rect') {
      openDrawModal(obj)
    }
  })

  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
  if (canvas) {
    canvas.dispose()
  }
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})

const handleKeyDown = (e) => {
  if (e.code === 'Space') {
    isPanning = true
    if (canvas) {
      canvas.setCursor('grab')
    }
  }
}

const handleKeyUp = (e) => {
  if (e.code === 'Space') {
    isPanning = false
    if (canvas) {
      canvas.setCursor('default')
    }
  }
}

const createDefaultCubeFaces = () => {
  const faceColors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF']
  const faceNames = ['Face Avant', 'Face Arrière', 'Face Droite', 'Face Gauche', 'Face Haut', 'Face Bas']
  const positions = [
    { left: 50, top: 50 },
    { left: 250, top: 50 },
    { left: 450, top: 50 },
    { left: 650, top: 50 },
    { left: 250, top: 200 },
    { left: 250, top: 350 }
  ]
  
  for (let i = 0; i < 6; i++) {
    const rect = new Rect({
      left: positions[i].left,
      top: positions[i].top,
      width: 150,
      height: 150,
      fill: faceColors[i],
      rx: 4,
      ry: 4
    })
    
    rect.set('cubeFaceIndex', i)
    rect.set('cubeFaceName', faceNames[i])
    
    const text = new Textbox(faceNames[i], {
      left: positions[i].left + 75,
      top: positions[i].top + 75,
      fontSize: 14,
      fill: '#ffffff',
      originX: 'center',
      originY: 'center',
      selectable: false
    })
    text.set('cubeFaceText', true)
    
    canvas.add(rect)
    canvas.add(text)
  }
  
  canvas.renderAll()
}

const addRectangle = () => {
  const rect = new Rect({
    left: 100,
    top: 80,
    width: 150,
    height: 100,
    fill: '#4f46e5',
    rx: 8,
    ry: 8
  })
  canvas.add(rect)
  canvas.setActiveObject(rect)
}

const addCircle = () => {
  const circle = new Circle({
    left: 300,
    top: 120,
    radius: 60,
    fill: '#10b981'
  })
  canvas.add(circle)
  canvas.setActiveObject(circle)
}

const addText = () => {
  const text = new Textbox('Bonjour Fabric.js', {
    left: 120,
    top: 40,
    fontSize: 24,
    fill: '#111827'
  })
  canvas.add(text)
  canvas.setActiveObject(text)
}

const clearCanvas = () => {
  canvas.clear()
  canvas.setBackgroundColor('#f9fafb', canvas.renderAll.bind(canvas))
}

const exportJSON = () => {
  const json = canvas.toJSON()
  const pretty = JSON.stringify(json, null, 2)
  const blob = new Blob([pretty], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'canvas.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const importJSON = async () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      const data = JSON.parse(text)
      canvas.loadFromJSON(data, () => canvas.renderAll())
    } catch (e) {
      alert('JSON invalide')
    }
  }
  input.click()
}

const openDrawModal = async (rect) => {
  currentRect = rect
  drawCanvasWidth.value = rect.width * (rect.scaleX || 1)
  drawCanvasHeight.value = rect.height * (rect.scaleY || 1)
  
  if (drawCanvas) {
    try {
      drawCanvas.dispose()
    } catch (e) {
      console.warn('Erreur lors du dispose du canvas:', e)
    }
    drawCanvas = null
  }
  
  showDrawModal.value = true
  await nextTick()
  
  if (drawCanvasElement.value) {
    if (drawCanvasElement.value.fabric) {
      try {
        const existingCanvas = drawCanvasElement.value.fabric
        if (existingCanvas && typeof existingCanvas.dispose === 'function') {
          existingCanvas.dispose()
        }
        delete drawCanvasElement.value.fabric
      } catch (e) {
        delete drawCanvasElement.value.fabric
      }
    }
    
    try {
      drawCanvas = new Canvas(drawCanvasElement.value, {
        backgroundColor: '#ffffff'
      })
      drawCanvas.isDrawingMode = isDrawMode.value
      
      if (drawCanvas.freeDrawingBrush) {
        drawCanvas.freeDrawingBrush.width = drawWidth.value
        drawCanvas.freeDrawingBrush.color = drawColor.value
      }

      if (rect.drawCanvasJSON) {
        drawCanvas.loadFromJSON(rect.drawCanvasJSON, () => {
          drawCanvas.renderAll()
          drawCanvas.isDrawingMode = isDrawMode.value
        })
      } else {
        let imageToLoad = rect.drawCanvasData
        if (!imageToLoad && rect.fill && typeof rect.fill === 'string' && rect.fill.startsWith('data:')) {
          imageToLoad = rect.fill
        }
        
        if (imageToLoad) {
          FabricImage.fromURL(imageToLoad)
            .then((fabricImg) => {
              drawCanvas.set('backgroundImage', fabricImg)
              drawCanvas.renderAll()
            })
            .catch((error) => {
              console.error('Erreur lors du chargement de l\'image:', error)
            })
        }
      }
    } catch (e) {
      console.error('Erreur lors de la création du canvas:', e)
    }
  }
}

watch(drawColor, (newColor) => {
  if (drawCanvas && drawCanvas.freeDrawingBrush) {
    drawCanvas.freeDrawingBrush.color = newColor
  }
})

watch(drawWidth, (newWidth) => {
  if (drawCanvas && drawCanvas.freeDrawingBrush) {
    drawCanvas.freeDrawingBrush.width = newWidth
  }
})

const closeDrawModal = () => {
  showDrawModal.value = false
  
  if (drawCanvas) {
    try {
      drawCanvas.dispose()
    } catch (e) {
      console.warn('Erreur lors du dispose:', e)
    }
    drawCanvas = null
  }
  
  if (drawCanvasElement.value) {
    if (drawCanvasElement.value.fabric) {
      delete drawCanvasElement.value.fabric
    }
    const ctx = drawCanvasElement.value.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, drawCanvasElement.value.width, drawCanvasElement.value.height)
    }
  }
  
  currentRect = null
}

const clearDrawCanvas = () => {
  if (drawCanvas) {
    drawCanvas.clear()
    drawCanvas.setBackgroundColor('#ffffff', () => {
      drawCanvas.renderAll()
    })
    drawCanvas.isDrawingMode = isDrawMode.value
  }
}

const toggleDrawMode = () => {
  if (!drawCanvas) return
  isDrawMode.value = !isDrawMode.value
  drawCanvas.isDrawingMode = isDrawMode.value
}

const addTextToDrawCanvas = () => {
  if (!drawCanvas) return
  const text = new Textbox('Nouveau texte', {
    left: drawCanvasWidth.value / 2 - 50,
    top: drawCanvasHeight.value / 2 - 15,
    fontSize: 20,
    fill: drawColor.value
  })
  drawCanvas.add(text)
  drawCanvas.setActiveObject(text)
  drawCanvas.isDrawingMode = false
  isDrawMode.value = false
}

const addCircleToDrawCanvas = () => {
  if (!drawCanvas) return
  const circle = new Circle({
    left: drawCanvasWidth.value / 2 - 30,
    top: drawCanvasHeight.value / 2 - 30,
    radius: 30,
    fill: drawColor.value
  })
  drawCanvas.add(circle)
  drawCanvas.setActiveObject(circle)
  drawCanvas.isDrawingMode = false
  isDrawMode.value = false
}

const addRectToDrawCanvas = () => {
  if (!drawCanvas) return
  const rect = new Rect({
    left: drawCanvasWidth.value / 2 - 50,
    top: drawCanvasHeight.value / 2 - 30,
    width: 100,
    height: 60,
    fill: drawColor.value,
    rx: 4,
    ry: 4
  })
  drawCanvas.add(rect)
  drawCanvas.setActiveObject(rect)
  drawCanvas.isDrawingMode = false
  isDrawMode.value = false
}

const addImageToDrawCanvas = () => {
  if (!drawCanvas) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const fabricImg = new FabricImage(img, {
          left: drawCanvasWidth.value / 2 - img.width / 4,
          top: drawCanvasHeight.value / 2 - img.height / 4,
          scaleX: 0.5,
          scaleY: 0.5
        })
        drawCanvas.add(fabricImg)
        drawCanvas.setActiveObject(fabricImg)
        drawCanvas.isDrawingMode = false
        isDrawMode.value = false
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }
  input.click()
}

const applyDrawingToRect = async () => {
  if (!drawCanvas || !currentRect) return

  const canvasJSON = drawCanvas.toJSON()
  currentRect.set('drawCanvasJSON', canvasJSON)

  const dataURL = drawCanvas.toDataURL({
    format: 'png',
    quality: 1,
    multiplier: 1
  })

  currentRect.set('drawCanvasData', dataURL)
  
  const img = new Image()
  img.onload = () => {
    try {
      const pattern = new Pattern({
        source: img,
        repeat: 'no-repeat'
      })
      
      currentRect.set('fill', pattern)
      canvas.requestRenderAll()
      
      if (show3DModal.value) {
        setTimeout(() => {
          updateCubeTextures()
        }, 200)
      }
      
      closeDrawModal()
    } catch (error) {
      console.error('Erreur lors de l\'application du pattern:', error)
      currentRect.set('fill', dataURL)
      canvas.requestRenderAll()
      closeDrawModal()
    }
  }
  img.onerror = () => {
    console.error('Erreur lors du chargement de l\'image')
    currentRect.set('fill', dataURL)
    canvas.requestRenderAll()
    closeDrawModal()
  }
  img.src = dataURL
}

const open3DView = async () => {
  show3DModal.value = true
  await nextTick()
  initThreeJS()
}

const close3DModal = () => {
  show3DModal.value = false
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  if (renderer) {
    renderer.dispose()
    renderer = null
  }
  meshes.forEach(meshData => {
    if (meshData.texture) {
      meshData.texture.dispose()
    }
    if (meshData.mesh) {
      scene.remove(meshData.mesh)
      meshData.mesh.geometry.dispose()
      meshData.mesh.material.dispose()
    }
  })
  meshes = []
  if (handleResize) {
    window.removeEventListener('resize', handleResize)
    handleResize = null
  }
  if (orbitControls) {
    orbitControls.dispose()
    orbitControls = null
  }
  if (cubeMesh) {
    cubeMesh = null
  }
  if (raycaster) {
    raycaster = null
  }
  if (window.cleanup3DClickHandlers) {
    window.cleanup3DClickHandlers()
    delete window.cleanup3DClickHandlers
  }
  if (canvas) {
    canvas.off('after:render', updateCubeTextures)
  }
  if (updateTextureTimeout) {
    clearTimeout(updateTextureTimeout)
    updateTextureTimeout = null
  }
  scene = null
  camera = null
}

const createCanvasTexture = async (rect) => {
  const tempCanvas = document.createElement('canvas')
  const rectWidth = Math.max(Math.round(rect.width * (rect.scaleX || 1)), 100)
  const rectHeight = Math.max(Math.round(rect.height * (rect.scaleY || 1)), 100)
  tempCanvas.width = rectWidth
  tempCanvas.height = rectHeight
  
  const tempCtx = tempCanvas.getContext('2d')
  if (!tempCtx) {
    return null
  }
  
  tempCtx.fillStyle = '#ffffff'
  tempCtx.fillRect(0, 0, rectWidth, rectHeight)
  
  if (rect.drawCanvasJSON) {
    return new Promise((resolve) => {
      const drawCanvas = new Canvas(tempCanvas, {
        backgroundColor: '#ffffff',
        width: rectWidth,
        height: rectHeight,
        renderOnAddRemove: true
      })
      
      drawCanvas.loadFromJSON(rect.drawCanvasJSON, () => {
        drawCanvas.renderAll()
        
        setTimeout(() => {
          try {
            const canvasElement = drawCanvas.getElement()
            
            if (canvasElement && canvasElement.width > 0 && canvasElement.height > 0) {
              const imageCanvas = document.createElement('canvas')
              imageCanvas.width = canvasElement.width
              imageCanvas.height = canvasElement.height
              const imageCtx = imageCanvas.getContext('2d')
              
              if (imageCtx) {
                drawCanvas.renderAll()
                
                requestAnimationFrame(() => {
                  imageCtx.fillStyle = '#ffffff'
                  imageCtx.fillRect(0, 0, imageCanvas.width, imageCanvas.height)
                  imageCtx.drawImage(canvasElement, 0, 0)
                  
                  const texture = new THREE.CanvasTexture(imageCanvas)
                  texture.flipY = false
                  texture.needsUpdate = true
                  texture.format = THREE.RGBAFormat
                  
                  if (texture.image && texture.image.width > 0 && texture.image.height > 0) {
                    drawCanvas.dispose()
                    resolve(texture)
                  } else {
                    drawCanvas.dispose()
                    const texture = new THREE.CanvasTexture(tempCanvas)
                    texture.flipY = false
                    texture.needsUpdate = true
                    resolve(texture)
                  }
                })
              } else {
                drawCanvas.dispose()
                const texture = new THREE.CanvasTexture(tempCanvas)
                texture.flipY = false
                texture.needsUpdate = true
                resolve(texture)
              }
            } else {
              drawCanvas.dispose()
              const texture = new THREE.CanvasTexture(tempCanvas)
              texture.flipY = false
              texture.needsUpdate = true
              resolve(texture)
            }
          } catch (error) {
            drawCanvas.dispose()
            const texture = new THREE.CanvasTexture(tempCanvas)
            texture.flipY = false
            texture.needsUpdate = true
            resolve(texture)
          }
        }, 200)
      }, (error) => {
        drawCanvas.dispose()
        const texture = new THREE.CanvasTexture(tempCanvas)
        texture.flipY = false
        texture.needsUpdate = true
        resolve(texture)
      })
    })
  }
  
  if (rect.drawCanvasData || (rect.fill && typeof rect.fill === 'string' && rect.fill.startsWith('data:'))) {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        tempCtx.fillStyle = '#ffffff'
        tempCtx.fillRect(0, 0, rectWidth, rectHeight)
        tempCtx.drawImage(img, 0, 0, rectWidth, rectHeight)
        const texture = new THREE.CanvasTexture(tempCanvas)
        texture.flipY = false
        texture.needsUpdate = true
        resolve(texture)
      }
      img.onerror = () => {
        const texture = new THREE.CanvasTexture(tempCanvas)
        texture.flipY = false
        texture.needsUpdate = true
        resolve(texture)
      }
      const imageSrc = rect.drawCanvasData || rect.fill
      img.src = imageSrc
    })
  }
  
  tempCtx.strokeStyle = '#cccccc'
  tempCtx.lineWidth = 2
  tempCtx.strokeRect(5, 5, rectWidth - 10, rectHeight - 10)
  tempCtx.fillStyle = '#666666'
  tempCtx.font = '16px Arial'
  tempCtx.textAlign = 'center'
  tempCtx.fillText('Canvas vide', rectWidth / 2, rectHeight / 2)
  
  const texture = new THREE.CanvasTexture(tempCanvas)
  texture.flipY = false
  texture.needsUpdate = true
  return texture
}

const initThreeJS = async () => {
  if (!threeCanvasElement.value || !canvasElement.value) return

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

  const rects = canvas.getObjects()
    .filter(obj => obj.type === 'rect' && obj.cubeFaceIndex !== undefined)
    .sort((a, b) => a.cubeFaceIndex - b.cubeFaceIndex)
  
  console.log(`Création d'un cube avec ${rects.length} faces`)
  
  const faceTextures = []
  for (let i = 0; i < 6; i++) {
    const rect = rects.find(r => r.cubeFaceIndex === i)
    if (rect) {
      const texture = await createCanvasTexture(rect)
      faceTextures[i] = texture
      console.log(`Texture pour face ${i} créée`)
    } else {
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = 150
      tempCanvas.height = 150
      const tempCtx = tempCanvas.getContext('2d')
      tempCtx.fillStyle = '#888888'
      tempCtx.fillRect(0, 0, 150, 150)
      const texture = new THREE.CanvasTexture(tempCanvas)
      texture.flipY = false
      texture.needsUpdate = true
      faceTextures[i] = texture
    }
  }
  
  const cubeSize = 2
  const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize)
  
  const materials = faceTextures.map(texture => {
    return new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide
    })
  })
  
  const cube = new THREE.Mesh(geometry, materials)
  scene.add(cube)
  
  cubeMesh = cube
  meshes.push({ mesh: cube, texture: null, rect: null, isCube: true })
  
  console.log('Cube créé avec succès')
  
  raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  
  let mouseDownTime = 0
  let mouseDownPos = { x: 0, y: 0 }
  let isDragging = false
  
  const onMouseDown = (event) => {
    if (!cubeMesh || !camera || !renderer) return
    mouseDownTime = Date.now()
    mouseDownPos.x = event.clientX
    mouseDownPos.y = event.clientY
    isDragging = false
  }
  
  const onMouseMove = (event) => {
    const dx = Math.abs(event.clientX - mouseDownPos.x)
    const dy = Math.abs(event.clientY - mouseDownPos.y)
    if (dx > 3 || dy > 3) {
      isDragging = true
    }
  }
  
  const onCanvasClick = (event) => {
    if (!cubeMesh || !camera || !renderer || isDragging) return
    
    const timeDiff = Date.now() - mouseDownTime
    if (timeDiff > 300) return
    
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    raycaster.setFromCamera(mouse, camera)
    
    const intersects = raycaster.intersectObject(cubeMesh, true)
    
    if (intersects.length > 0) {
      const intersection = intersects[0]
      
      let faceIndex = 0
      
      if (intersection.face && intersection.face.materialIndex !== undefined) {
        faceIndex = intersection.face.materialIndex
      } else {
        faceIndex = Math.floor(intersection.faceIndex / 2)
      }
      
      faceIndex = Math.max(0, Math.min(5, faceIndex))
      
      console.log(`Face ${faceIndex} cliquée`)
      
      const rects = canvas.getObjects()
        .filter(obj => obj.type === 'rect' && obj.cubeFaceIndex !== undefined)
        .sort((a, b) => a.cubeFaceIndex - b.cubeFaceIndex)
      
      const rect = rects.find(r => r.cubeFaceIndex === faceIndex)
      
      if (rect) {
        openDrawModal(rect)
      }
    }
  }
  
  renderer.domElement.addEventListener('mousedown', onMouseDown)
  renderer.domElement.addEventListener('mousemove', onMouseMove)
  renderer.domElement.addEventListener('click', onCanvasClick)
  
  window.cleanup3DClickHandlers = () => {
    renderer.domElement.removeEventListener('mousedown', onMouseDown)
    renderer.domElement.removeEventListener('mousemove', onMouseMove)
    renderer.domElement.removeEventListener('click', onCanvasClick)
  }

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0)
  scene.add(ambientLight)

  orbitControls = new OrbitControls(camera, renderer.domElement)
  orbitControls.enableDamping = true
  orbitControls.dampingFactor = 0.05
  orbitControls.enableZoom = true
  orbitControls.enablePan = false
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
  
  if (canvas) {
    canvas.on('after:render', () => {
      if (updateTextureTimeout) {
        clearTimeout(updateTextureTimeout)
      }
      updateTextureTimeout = setTimeout(() => {
        updateCubeTextures()
      }, 300)
    })
  }
}

let updateTextureTimeout = null
const updateCubeTextures = async () => {
  if (!scene || meshes.length === 0 || !cubeMesh) return
  
  const cubeMeshData = meshes.find(m => m.isCube)
  if (!cubeMeshData || !cubeMeshData.mesh) return
  
  const rects = canvas.getObjects()
    .filter(obj => obj.type === 'rect' && obj.cubeFaceIndex !== undefined)
    .sort((a, b) => a.cubeFaceIndex - b.cubeFaceIndex)
  
  for (let i = 0; i < 6; i++) {
    const rect = rects.find(r => r.cubeFaceIndex === i)
    if (rect && cubeMeshData.mesh.material && cubeMeshData.mesh.material[i]) {
      try {
        const newTexture = await createCanvasTexture(rect)
        if (newTexture && newTexture.image) {
          if (cubeMeshData.mesh.material[i].map) {
            cubeMeshData.mesh.material[i].map.dispose()
          }
          cubeMeshData.mesh.material[i].map = newTexture
          cubeMeshData.mesh.material[i].needsUpdate = true
          newTexture.needsUpdate = true
          console.log(`Face ${i} mise à jour avec succès`)
        } else {
          console.warn(`Impossible de créer la texture pour la face ${i}`)
        }
      } catch (error) {
        console.error(`Erreur lors de la mise à jour de la face ${i}:`, error)
      }
    }
  }
}

const exportCubeOBJ = () => {
  if (!cubeMesh || !scene) {
    alert('Aucun cube à exporter')
    return
  }
  
  try {
    const exporter = new OBJExporter()
    const objString = exporter.parse(cubeMesh)
    
    const objBlob = new Blob([objString], { type: 'text/plain' })
    const objUrl = URL.createObjectURL(objBlob)
    const objLink = document.createElement('a')
    objLink.href = objUrl
    objLink.download = 'cube.obj'
    document.body.appendChild(objLink)
    objLink.click()
    objLink.remove()
    URL.revokeObjectURL(objUrl)
    
    console.log('Cube exporté en OBJ avec succès')
  } catch (error) {
    console.error('Erreur lors de l\'export OBJ:', error)
    alert('Erreur lors de l\'export du cube en OBJ')
  }
}

</script>

<style scoped>
#home {
  margin: 0;
  font-family: sans-serif;
}

#toolbar {
  padding: 10px;
  border-bottom: 1px solid #ddd;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

#c {
  border: 1px solid #ccc;
  display: block;
  margin: 10px auto;
}

button {
  margin-right: 8px;
  padding: 6px 12px;
  cursor: pointer;
  border: 1px solid #ccc;
  background: white;
  border-radius: 4px;
}

button:hover {
  background: #f0f0f0;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  padding: 20px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.modal-header h3 {
  margin: 0;
}

.modal-header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.export-btn {
  background: #10b981;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.export-btn:hover {
  background: #059669;
}

.export-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
  opacity: 0.6;
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  line-height: 30px;
}

.close-btn:hover {
  background: #f0f0f0;
  border-radius: 50%;
}

.draw-toolbar {
  display: flex;
  gap: 15px;
  align-items: flex-start;
  margin-bottom: 15px;
  flex-wrap: wrap;
  border-bottom: 1px solid #eee;
  padding-bottom: 15px;
}

.toolbar-section {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 8px;
  background: #f9f9f9;
  border-radius: 4px;
}

.toolbar-section h4 {
  margin: 0 8px 0 0;
  font-size: 12px;
  color: #666;
  font-weight: normal;
}

.draw-toolbar label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.draw-toolbar input[type="color"] {
  width: 50px;
  height: 30px;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
}

.draw-toolbar input[type="range"] {
  width: 100px;
}

.apply-btn {
  background: #4f46e5;
  color: white;
  border: none;
  margin-left: auto;
}

.apply-btn:hover {
  background: #4338ca;
}

#drawCanvas {
  border: 1px solid #ccc;
  cursor: crosshair;
  border-radius: 4px;
}

.view3d-btn {
  background: #10b981;
  color: white;
  border: none;
  margin-left: auto;
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 4px;
  display: inline-block;
}

.view3d-btn:hover {
  background: #059669;
}

.modal-content-3d {
  background: white;
  border-radius: 8px;
  padding: 20px;
  max-width: 95vw;
  max-height: 95vh;
  display: flex;
  flex-direction: column;
  width: 90vw;
  height: 90vh;
}

#threeCanvas {
  width: 100%;
  height: 100%;
  border: 1px solid #ccc;
  border-radius: 4px;
  flex: 1;
  min-height: 500px;
}
</style>
