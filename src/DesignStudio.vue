<template>
  <div class="design-studio">
    <div class="studio-header">
      <h1>Studio de Design 3D</h1>
      <div class="header-actions">
        <label for="obj-upload" class="upload-btn">
          <input
            id="obj-upload"
            type="file"
            accept=".obj"
            @change="handleFileUpload"
            style="display: none;"
          />
          📁 Uploader un modèle 3D (.obj)
        </label>
        <!-- <button @click="applyDesignToModel" class="apply-btn" :disabled="!hasModel || !hasDesign">
          ✨ Appliquer le design sur le modèle
        </button>
        <button @click="showMeshSelector = !showMeshSelector" class="mesh-selector-btn" :disabled="!hasModel">
          🧩 Pièces du modèle
        </button>
        <label class="toggle-realtime">
          <input type="checkbox" v-model="realTimeUpdateEnabled" />
          <span>Temps réel</span>
        </label> -->
      </div>
    </div>

    <div class="studio-content">
      <!-- Three.js Scene -->
      <div class="scene-panel" :class="{ 'full-width': !showDesigner }">
        <ThreeScene
          ref="threeSceneRef"
          :model-url="uploadedModel"
          :texture="appliedTexture"
          :canvas2D="fabricCanvasElement"
          :enable-direct-edit="true"
          :work-zone-top="workZoneTop / 100"
          :work-zone-bottom="workZoneBottom / 100"
          :placement-mode="placementMode"
          :placement-type="placementType"
          :drag-mode="dragMode"
          @model-loaded="onModelLoaded"
          @model-error="onModelError"
          @texture-ready="onTextureReady"
          @3d-click="on3DClickForPlacement"
          @3d-drag="on3DDrag"
          @3d-drag-start="on3DDragStart"
          @3d-drag-end="on3DDragEnd"
          @3d-scale="on3DScale"
        />
      </div>

      <!-- Fabric.js Designer -->
      <div v-if="showDesigner" class="designer-panel">
        <div class="panel-header">
          <h3>Canvas de Design 2D</h3>
          <button @click="toggleDesigner" class="toggle-btn">✕</button>
        </div>
        
        <!-- Contrôles de zone de travail -->
        <div class="work-zone-controls" v-if="hasModel">
          <div class="control-group">
            <label>Zone de travail verticale</label>
            <div class="slider-group">
              <label class="slider-label">
                Exclure haut:
                <input 
                  type="range" 
                  v-model.number="workZoneTop" 
                  min="0" 
                  max="50" 
                  step="1"
                  @input="onWorkZoneChanged"
                />
                {{ workZoneTop }}%
              </label>
              <label class="slider-label">
                Exclure bas:
                <input 
                  type="range" 
                  v-model.number="workZoneBottom" 
                  min="0" 
                  max="50" 
                  step="1"
                  @input="onWorkZoneChanged"
                />
                {{ workZoneBottom }}%
              </label>
            </div>
            <div class="zone-info">
              Zone active: {{ 100 - workZoneTop - workZoneBottom }}% ({{ workZoneTop }}% haut exclu, {{ workZoneBottom }}% bas exclu)
            </div>
          </div>
        </div>
        
        <FabricDesigner
          ref="fabricDesignerRef"
          :canvas-width="1200"
          :canvas-height="900"
          :work-zone-top="workZoneTop / 100"
          :work-zone-bottom="workZoneBottom / 100"
          @design-updated="onDesignUpdated"
          @canvas-ready="onFabricCanvasReady"
          @placement-mode-changed="onPlacementModeChanged"
          @object-selected="onObjectSelected"
          @object-deselected="onObjectDeselected"
          @move-object="onMoveObject"
        />
      </div>

      <!-- Toggle button for designer -->
      <button v-if="!showDesigner" @click="toggleDesigner" class="floating-btn">
        🎨 Ouvrir le designer
      </button>
    </div>

    <!-- Mesh Selector Panel -->
    <MeshSelector
      v-if="showMeshSelector"
      :show="showMeshSelector"
      :meshes="modelMeshes"
      @close="showMeshSelector = false"
      @select-mesh="onMeshSelected"
      @highlight-mesh="onMeshHighlighted"
      @edit-mesh="onMeshEdit"
    />

    <div v-if="errorMessage" class="error-message">
      ⚠️ {{ errorMessage }}
    </div>
    
    <!-- Indicateur de mode placement -->
    <div v-if="placementMode && placementType" class="placement-indicator">
      🎯 Mode placement actif: {{ placementType === 'circle' ? 'Cercle' : placementType === 'rectangle' ? 'Rectangle' : placementType === 'text' ? 'Texte' : 'Image' }} - Cliquez sur le modèle 3D pour placer
    </div>
    
    <!-- Indicateur de mode drag -->
    <div v-if="dragMode" class="drag-indicator">
      🖱️ Mode drag actif - Sélectionnez un élément sur le canvas 2D puis glissez-le sur le modèle 3D
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import ThreeScene from './components/ThreeScene.vue'
import FabricDesigner from './components/FabricDesigner.vue'
import MeshSelector from './components/MeshSelector.vue'
import * as THREE from 'three'

const threeSceneRef = ref(null)
const fabricDesignerRef = ref(null)

const uploadedModel = ref(null)
const appliedTexture = ref(null)
const showDesigner = ref(true)
const errorMessage = ref('')
const realTimeUpdateEnabled = ref(true)
let updateTextureTimeout = null
const fabricCanvasElement = ref(null) // Référence au canvas HTML Fabric.js
const showMeshSelector = ref(false)
const modelMeshes = ref([])
const selectedMesh = ref(null)
const workZoneTop = ref(10) // Pourcentage à exclure du haut (défaut 10%)
const workZoneBottom = ref(10) // Pourcentage à exclure du bas (défaut 10%)
const placementMode = ref(false) // Mode de placement actif
const placementType = ref(null) // Type d'élément à placer: 'circle', 'rectangle', 'text', 'image'
const dragMode = ref(false) // Mode drag actif pour déplacer un objet
const isDragging = ref(false) // Indique si on est en train de glisser

const hasModel = computed(() => uploadedModel.value !== null)
let highlightedMeshIndex = ref(-1)
const hasDesign = computed(() => {
  if (!fabricDesignerRef.value || !fabricDesignerRef.value.getCanvas) return false
  const canvas = fabricDesignerRef.value.getCanvas()
  return canvas && canvas.getObjects().length > 0
})

const handleFileUpload = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  if (!file.name.toLowerCase().endsWith('.obj')) {
    errorMessage.value = 'Veuillez sélectionner un fichier .obj'
    setTimeout(() => {
      errorMessage.value = ''
    }, 3000)
    return
  }

  errorMessage.value = ''
  uploadedModel.value = file

  // Reset applied texture when new model is loaded
  if (appliedTexture.value) {
    appliedTexture.value.dispose()
    appliedTexture.value = null
  }
}

const onModelLoaded = async (mesh) => {
  console.log('Modèle 3D chargé avec succès', mesh)
  errorMessage.value = ''
  
  // Extraire tous les meshes du modèle
  extractModelMeshes(mesh)
  
  // Vérifier si les meshes ont des UVs
  let hasUVs = true
  mesh.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      if (!child.geometry.attributes.uv) {
        hasUVs = false
      }
    }
  })
  
  if (!hasUVs) {
    console.log('ℹ️ Le modèle n\'a pas de coordonnées UV. Les UVs seront générées automatiquement.')
    // Ne pas afficher d'erreur, juste informer dans la console
  }
  
  // Attendre que le canvas Fabric.js soit prêt
  await nextTick()
  
  // Récupérer le canvas HTML depuis Fabric.js
  if (fabricDesignerRef.value) {
    const fabricCanvas = fabricDesignerRef.value.getCanvas()
    if (fabricCanvas) {
      const htmlCanvas = fabricCanvas.getElement()
      if (htmlCanvas) {
        fabricCanvasElement.value = htmlCanvas
        
        // Attendre un peu pour que les UVs soient générées si nécessaire
        await nextTick()
        
        // Configurer la texture partagée dans ThreeScene
        if (threeSceneRef.value && threeSceneRef.value.setupSharedCanvasTexture) {
          threeSceneRef.value.setupSharedCanvasTexture(htmlCanvas)
        }
      }
    }
  }
}

const extractModelMeshes = (obj) => {
  modelMeshes.value = []
  let index = 0
  
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geometry = child.geometry
      const vertexCount = geometry.attributes.position ? geometry.attributes.position.count : 0
      const hasUVs = geometry.attributes.uv ? true : false
      
      modelMeshes.value.push({
        index: index++,
        mesh: child,
        name: child.name || `Mesh_${index}`,
        vertexCount: vertexCount,
        hasUVs: hasUVs,
        material: child.material
      })
    }
  })
  
  console.log(`✅ ${modelMeshes.value.length} pièce(s) trouvée(s) dans le modèle:`, modelMeshes.value.map(m => ({
    name: m.name,
    vertices: m.vertexCount,
    hasUVs: m.hasUVs
  })))
}

const onMeshSelected = ({ index, mesh }) => {
  if (index === -1) {
    selectedMesh.value = null
    // Sélectionner tous les meshes
    if (threeSceneRef.value && threeSceneRef.value.highlightAllMeshes) {
      threeSceneRef.value.highlightAllMeshes()
    }
  } else {
    selectedMesh.value = mesh
    // Highlight le mesh sélectionné
    if (threeSceneRef.value && threeSceneRef.value.highlightMesh) {
      threeSceneRef.value.highlightMesh(mesh)
    }
  }
}

const onMeshHighlighted = ({ index, mesh }) => {
  // Toggle highlight
  const isCurrentlyHighlighted = highlightedMeshIndex.value === index
  highlightedMeshIndex.value = isCurrentlyHighlighted ? -1 : index
  
  // Highlight/unhighlight
  if (threeSceneRef.value && threeSceneRef.value.highlightMesh) {
    threeSceneRef.value.highlightMesh(mesh, !isCurrentlyHighlighted)
  }
}

const onMeshEdit = ({ index, mesh }) => {
  selectedMesh.value = mesh
  // Configurer l'édition pour ce mesh spécifique
  if (threeSceneRef.value && threeSceneRef.value.setActiveMesh) {
    threeSceneRef.value.setActiveMesh(mesh)
  }
  console.log(`Édition activée pour: ${mesh.name || `Mesh ${index + 1}`}`)
}

const onTextureReady = (texture) => {
  console.log('Texture partagée prête', texture)
  appliedTexture.value = texture
}

const on3DClickForPlacement = (clickData) => {
  // Si on n'est pas en mode placement, ignorer
  if (!placementMode.value || !placementType.value) {
    return
  }
  
  // Vérifier que le clic est dans la zone active (pas null)
  if (clickData.canvasX === undefined || clickData.canvasY === undefined || clickData.canvasX === null || clickData.canvasY === null) {
    console.warn('⚠️ Clic hors zone de travail, élément non placé')
    return
  }
  
  console.log('🎯 Placement direct sur modèle 3D:', {
    type: placementType.value,
    position: clickData.canvasX + ', ' + clickData.canvasY
  })
  
  // Placer l'élément sur le canvas 2D à la position du clic
  if (fabricDesignerRef.value && fabricDesignerRef.value.placeElementAt) {
    fabricDesignerRef.value.placeElementAt(placementType.value, clickData.canvasX, clickData.canvasY)
    // Le mode placement sera désactivé automatiquement par placeElementAt
  }
}

const onModelError = (error) => {
  console.error('Erreur lors du chargement du modèle:', error)
  errorMessage.value = `Erreur lors du chargement: ${error.message}`
  uploadedModel.value = null
  workZoneTop.value = 10
  workZoneBottom.value = 10
}

const onWorkZoneChanged = () => {
  // Notifier ThreeScene et FabricDesigner du changement
  if (threeSceneRef.value && threeSceneRef.value.updateWorkZone) {
    threeSceneRef.value.updateWorkZone(workZoneTop.value / 100, workZoneBottom.value / 100)
  }
  console.log('Zone de travail mise à jour:', {
    top: workZoneTop.value + '%',
    bottom: workZoneBottom.value + '%',
    active: (100 - workZoneTop.value - workZoneBottom.value) + '%'
  })
}

const onPlacementModeChanged = (modeData) => {
  placementMode.value = modeData.active
  placementType.value = modeData.type
  console.log('Mode placement changé:', modeData)
  
  // Mettre à jour le curseur du modèle 3D si nécessaire
  if (threeSceneRef.value && threeSceneRef.value.setPlacementMode) {
    threeSceneRef.value.setPlacementMode(modeData.active, modeData.type)
  }
}

const onObjectSelected = (data) => {
  console.log('Objet sélectionné dans Fabric:', data)
  dragMode.value = true
  
  // Activer le mode drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragMode) {
    threeSceneRef.value.setDragMode(true)
  }
}

const onObjectDeselected = () => {
  console.log('Objet désélectionné dans Fabric')
  dragMode.value = false
  isDragging.value = false
  
  // Désactiver le mode drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragMode) {
    threeSceneRef.value.setDragMode(false)
  }
}

const onMoveObject = (data) => {
  // Cette fonction peut être utilisée pour des actions supplémentaires
  console.log('Objet déplacé:', data)
}

const on3DDragStart = (clickData) => {
  if (!dragMode.value) return
  isDragging.value = true
  console.log('🎯 Début du drag sur 3D:', clickData)
}

const on3DDrag = (clickData) => {
  if (!dragMode.value || !isDragging.value) return
  
  // Vérifier que le clic est dans la zone active
  if (clickData.canvasX === undefined || clickData.canvasY === undefined || 
      clickData.canvasX === null || clickData.canvasY === null) {
    return
  }
  
  // Déplacer l'objet sélectionné
  if (fabricDesignerRef.value && fabricDesignerRef.value.moveSelectedObject) {
    fabricDesignerRef.value.moveSelectedObject(clickData.canvasX, clickData.canvasY)
  }
}

const on3DDragEnd = () => {
  isDragging.value = false
  console.log('🎯 Fin du drag sur 3D')
}

const on3DScale = (scaleData) => {
  if (!dragMode.value) return
  
  // Redimensionner l'objet sélectionné
  if (fabricDesignerRef.value && fabricDesignerRef.value.scaleSelectedObject) {
    fabricDesignerRef.value.scaleSelectedObject(scaleData.scaleFactor)
    console.log('📏 Redimensionnement:', scaleData.scaleFactor)
  }
}

const onDesignUpdated = () => {
  // Avec le nouveau système, la mise à jour est automatique via le store
  // On garde l'ancien système en fallback si nécessaire
  if (!realTimeUpdateEnabled.value && hasModel.value) {
    updateTextureRealTime()
  }
}

const onFabricCanvasReady = (htmlCanvas) => {
  console.log('Canvas Fabric.js prêt', htmlCanvas)
  fabricCanvasElement.value = htmlCanvas
  
  // Si le modèle est déjà chargé, configurer la texture partagée
  if (hasModel.value && threeSceneRef.value && threeSceneRef.value.setupSharedCanvasTexture) {
    threeSceneRef.value.setupSharedCanvasTexture(htmlCanvas)
  }
}

const updateTextureRealTime = () => {
  // Debounce updates to avoid too frequent texture updates
  if (updateTextureTimeout) {
    clearTimeout(updateTextureTimeout)
  }
  
  updateTextureTimeout = setTimeout(() => {
    if (!fabricDesignerRef.value || !threeSceneRef.value || !hasModel.value) return
    
    const canvasTexture = fabricDesignerRef.value.getCanvasAsTexture()
    if (!canvasTexture) {
      console.warn('Impossible de créer la texture depuis le canvas')
      return
    }
    
    try {
      // Dispose old texture if exists
      if (appliedTexture.value) {
        appliedTexture.value.dispose()
      }

      // Create Three.js texture from canvas
      const texture = new THREE.CanvasTexture(canvasTexture)
      texture.flipY = false
      texture.needsUpdate = true
      texture.format = THREE.RGBAFormat
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter

      // Apply texture
      appliedTexture.value = texture
      
      // Also use the method from ThreeScene component
      if (threeSceneRef.value.applyTexture) {
        threeSceneRef.value.applyTexture(texture)
      }
      
      console.log('Texture mise à jour en temps réel')
    } catch (error) {
      console.error('Erreur lors de la mise à jour en temps réel:', error)
    }
  }, 200) // Debounce de 200ms pour laisser le temps au canvas de se rendre
}

const toggleDesigner = () => {
  showDesigner.value = !showDesigner.value
}

const applyDesignToModel = async () => {
  if (!fabricDesignerRef.value || !threeSceneRef.value) {
    errorMessage.value = 'Composants non initialisés'
    return
  }

  const canvasTexture = fabricDesignerRef.value.getCanvasAsTexture()
  if (!canvasTexture) {
    errorMessage.value = 'Impossible de créer la texture depuis le canvas'
    return
  }

  try {
    // Dispose old texture if exists
    if (appliedTexture.value) {
      appliedTexture.value.dispose()
    }

    // Create Three.js texture from canvas
    const texture = new THREE.CanvasTexture(canvasTexture)
    texture.flipY = false
    texture.needsUpdate = true
    texture.format = THREE.RGBAFormat

    // Apply texture
    appliedTexture.value = texture
    
    // Also use the method from ThreeScene component
    if (threeSceneRef.value.applyTexture) {
      await nextTick()
      threeSceneRef.value.applyTexture(texture)
    }

    console.log('Design appliqué avec succès sur le modèle 3D')
    errorMessage.value = ''
  } catch (error) {
    console.error('Erreur lors de l\'application du design:', error)
    errorMessage.value = `Erreur: ${error.message}`
  }
}
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
  position: relative;
  overflow: hidden;
}

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
</style>

