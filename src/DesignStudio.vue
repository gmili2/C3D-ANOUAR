<!-- 
  DesignStudio.vue - Composant principal de l'application
  
  Ce composant coordonne l'interaction entre :
  - ThreeScene : Affiche le modèle 3D (OBJ) avec Three.js
  - FabricDesigner : Permet de créer des designs 2D sur un canvas avec Fabric.js
  
  Fonctionnalités principales :
  - Upload de modèles 3D (.obj)
  - Synchronisation en temps réel entre le canvas 2D et la texture 3D
  - Placement direct d'éléments sur le modèle 3D en cliquant
  - Déplacement d'objets en glissant sur le modèle 3D
  - Gestion des zones de travail (exclusion de zones haut/bas)
-->
<template>
  <div class="design-studio">
    <!-- En-tête avec les actions principales -->
    <div class="studio-header">
      <h1>Studio de Design 3D</h1>
      <div class="header-actions">
        <!-- Bouton pour uploader un fichier OBJ -->
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
        <!-- Bouton pour basculer entre vue 2D et 3D -->
        <button @click="toggleView" class="view-toggle-btn">
          {{ currentView === '3d' ? '🎨 Vue 2D' : '🎯 Vue 3D' }}
        </button>
      </div>
    </div>

    <div class="studio-content">
      <!-- Vue 3D - Prend 100% de l'écran quand active -->
      <!-- Utiliser v-show au lieu de v-if pour préserver les éléments -->
      <div v-show="currentView === '3d'" class="view-panel view-3d">
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
          :selected-object="selectedObject"
          @model-loaded="onModelLoaded"
          @model-error="onModelError"
          @texture-ready="onTextureReady"
          @3d-click="on3DClickForPlacement"
          @3d-drag="on3DDrag"
          @3d-drag-start="on3DDragStart"
          @3d-drag-end="on3DDragEnd"
          @3d-scale="on3DScale"
          @3d-resize-start="on3DResizeStart"
          @3d-resize="on3DResize"
          @3d-resize-end="on3DResizeEnd"
          @3d-hover="on3DHover"
        />
      </div>

      <!-- Vue 2D - Prend 100% de l'écran quand active -->
      <!-- Utiliser v-show au lieu de v-if pour préserver les éléments -->
      <div v-show="currentView === '2d'" class="view-panel view-2d">
        <div class="panel-header">
          <h3>Canvas de Design 2D</h3>
        </div>
        
        <!-- Contrôles de zone de travail -->
        <div class="work-zone-controls" v-if="hasModel">
          <div class="control-group">
            <label>Configuration de la zone personnalisable</label>
            
            <!-- Configuration par dimensions réelles -->
            <div class="config-section">
              <label class="slider-label">
                Hauteur totale du gobelet (cm):
                <input 
                  type="number" 
                  v-model.number="gobletHeightCm" 
                  min="1" 
                  max="50" 
                  step="0.5"
                  @input="updateWorkZones"
                />
                cm
              </label>
              <label class="slider-label">
                Zone personnalisable (cm):
                <input 
                  type="number" 
                  v-model.number="customizableHeightCm" 
                  min="1" 
                  max="50" 
                  step="0.5"
                  @input="updateWorkZones"
                />
                cm
              </label>
              <label class="slider-label">
                Position:
                <select v-model="customizablePosition" @change="updateWorkZones">
                  <option value="center">Centrée</option>
                  <option value="top">En haut</option>
                  <option value="bottom">En bas</option>
                </select>
              </label>
            </div>
            
            <!-- Affichage des zones calculées -->
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
              <strong>Zone active:</strong> {{ 100 - workZoneTop - workZoneBottom }}% 
              ({{ customizableHeightCm }} cm sur {{ gobletHeightCm }} cm)
              <br>
              <small>{{ workZoneTop }}% haut exclu, {{ workZoneBottom }}% bas exclu</small>
              <br>
              <small><strong>Canvas 2D:</strong> {{ canvasWidth }}x{{ canvasHeight }} pixels (correspond à {{ customizableHeightCm }} cm)</small>
            </div>
          </div>
        </div>
        
        <FabricDesigner
          ref="fabricDesignerRef"
          :canvas-width="canvasWidth"
          :canvas-height="canvasHeight"
          :work-zone-top="workZoneTop / 100"
          :work-zone-bottom="workZoneBottom / 100"
          @design-updated="onDesignUpdated"
          @canvas-ready="onFabricCanvasReady"
          @placement-mode-changed="onPlacementModeChanged"
          @object-selected="onObjectSelected"
          @object-deselected="onObjectDeselected"
          @move-object="onMoveObject"
          @objects-changed="updateAllObjectsList"
        />
      </div>
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
/**
 * SCRIPT SETUP - Configuration principale du composant
 * 
 * Ce composant utilise Vue 3 Composition API avec <script setup>
 * pour gérer l'état et la logique de l'application de design 3D.
 */

import { ref, computed, nextTick, onMounted, watch } from 'vue'
import ThreeScene from './components/ThreeScene.vue'
import FabricDesigner from './components/FabricDesigner.vue'
import MeshSelector from './components/MeshSelector.vue'
import * as THREE from 'three'

// ===== RÉFÉRENCES AUX COMPOSANTS ENFANTS =====
// Références pour accéder aux méthodes exposées par les composants enfants
const threeSceneRef = ref(null)      // Référence au composant ThreeScene (affichage 3D)
const fabricDesignerRef = ref(null)  // Référence au composant FabricDesigner (canvas 2D)

// ===== ÉTAT DE L'APPLICATION =====
const uploadedModel = ref(null)              // Fichier OBJ uploadé par l'utilisateur
const appliedTexture = ref(null)            // Texture Three.js appliquée sur le modèle 3D
const showDesigner = ref(true)               // Afficher/masquer le panneau de design (déprécié, utiliser currentView)
const currentView = ref('3d')                // Vue actuelle: '2d' ou '3d'
const errorMessage = ref('')                 // Message d'erreur à afficher
const realTimeUpdateEnabled = ref(true)      // Activer/désactiver les mises à jour en temps réel
let updateTextureTimeout = null              // Timeout pour debounce les mises à jour de texture
const fabricCanvasElement = ref(null)        // Référence au canvas HTML Fabric.js (pour la texture partagée)
const showMeshSelector = ref(false)          // Afficher/masquer le sélecteur de meshes
const modelMeshes = ref([])                  // Liste de tous les meshes du modèle 3D
const selectedMesh = ref(null)               // Mesh actuellement sélectionné

// ===== CONFIGURATION DES ZONES DE TRAVAIL =====
// Ces valeurs définissent les zones du canvas où on ne peut pas placer d'éléments
// Utile pour exclure certaines parties du modèle (manches, col, etc.)

// Configuration pour personnaliser seulement une zone spécifique (ex: 8 cm)
const gobletHeightCm = ref(12)        // Hauteur totale du gobelet en cm (à ajuster selon votre modèle)
const customizableHeightCm = ref(8)   // Hauteur de la zone personnalisable en cm
const customizablePosition = ref('center') // Position: 'center', 'top', 'bottom'

// Calcul automatique des zones de travail basé sur les dimensions réelles
const calculateWorkZones = () => {
  const totalHeight = gobletHeightCm.value
  const customizableHeight = customizableHeightCm.value
  
  if (customizableHeight >= totalHeight) {
    // Si la zone personnalisable est plus grande que le gobelet, tout est personnalisable
    return { top: 0, bottom: 0 }
  }
  
  const excludedHeight = totalHeight - customizableHeight
  
  if (customizablePosition.value === 'center') {
    // Zone centrée : exclure équitablement le haut et le bas
    const topExcluded = excludedHeight / 2
    const bottomExcluded = excludedHeight / 2
    return {
      top: (topExcluded / totalHeight) * 100,
      bottom: (bottomExcluded / totalHeight) * 100
    }
  } else if (customizablePosition.value === 'top') {
    // Zone en haut : exclure seulement le bas
    return {
      top: 0,
      bottom: (excludedHeight / totalHeight) * 100
    }
  } else {
    // Zone en bas : exclure seulement le haut
    return {
      top: (excludedHeight / totalHeight) * 100,
      bottom: 0
    }
  }
}

const workZoneTop = ref(10)      // Pourcentage à exclure du haut (calculé automatiquement)
const workZoneBottom = ref(10)  // Pourcentage à exclure du bas (calculé automatiquement)

// Calculer la hauteur du canvas basée sur la zone personnalisable
// Le canvas doit avoir une hauteur proportionnelle à la zone personnalisable
const canvasHeight = computed(() => {
  // Hauteur de base du canvas (800x600)
  const baseHeight = 600
  const baseWidth = 800
  
  // Calculer le ratio de la zone personnalisable par rapport à la hauteur totale
  const customizableRatio = customizableHeightCm.value / gobletHeightCm.value
  
  // La hauteur du canvas correspond à la zone personnalisable
  // On garde une hauteur minimale pour que le canvas reste utilisable
  const minHeight = 200
  const calculatedHeight = Math.max(minHeight, baseHeight * customizableRatio)
  
  return Math.round(calculatedHeight)
})

// Largeur du canvas (peut être ajustée si nécessaire)
const canvasWidth = computed(() => {
  return 800 // Largeur fixe pour l'instant
})

// Calculer les zones initiales
const updateWorkZones = () => {
  const zones = calculateWorkZones()
  workZoneTop.value = Math.round(zones.top)
  workZoneBottom.value = Math.round(zones.bottom)
}

// Initialiser les zones
updateWorkZones()

// Watch pour mettre à jour automatiquement les zones quand les paramètres changent
watch([gobletHeightCm, customizableHeightCm, customizablePosition], () => {
  updateWorkZones()
})

// ===== MODES D'INTERACTION =====
const placementMode = ref(false)  // Mode de placement actif (clic sur 3D pour placer)
const placementType = ref(null)   // Type d'élément à placer: 'circle', 'rectangle', 'text', 'image'
const dragMode = ref(false)       // Mode drag actif pour déplacer un objet sélectionné
const isDragging = ref(false)    // Indique si on est en train de glisser un objet

// ===== COMPUTED PROPERTIES (Propriétés calculées) =====
/**
 * Vérifie si un modèle 3D est chargé
 */
const hasModel = computed(() => uploadedModel.value !== null)

let highlightedMeshIndex = ref(-1)  // Index du mesh actuellement mis en évidence

/**
 * Vérifie si le canvas 2D contient des objets (design)
 */
const hasDesign = computed(() => {
  if (!fabricDesignerRef.value || !fabricDesignerRef.value.getCanvas) return false
  const canvas = fabricDesignerRef.value.getCanvas()
  return canvas && canvas.getObjects().length > 0
})

// ===== GESTION DE L'UPLOAD DE FICHIERS =====
/**
 * Gère l'upload d'un fichier OBJ
 * Valide le format et réinitialise la texture si nécessaire
 * 
 * @param {Event} event - Événement de changement de fichier
 */
const handleFileUpload = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  // Validation : vérifier que c'est bien un fichier .obj
  if (!file.name.toLowerCase().endsWith('.obj')) {
    errorMessage.value = 'Veuillez sélectionner un fichier .obj'
    setTimeout(() => {
      errorMessage.value = ''
    }, 3000)
    return
  }

  errorMessage.value = ''
  uploadedModel.value = file

  // Réinitialiser la texture appliquée quand un nouveau modèle est chargé
  // pour éviter les conflits de textures
  if (appliedTexture.value) {
    appliedTexture.value.dispose()
    appliedTexture.value = null
  }
}

// ===== GESTION DU CHARGEMENT DU MODÈLE 3D =====
/**
 * Callback appelé quand un modèle 3D est chargé avec succès
 * 
 * Cette fonction :
 * 1. Extrait tous les meshes du modèle
 * 2. Vérifie la présence de coordonnées UV (nécessaires pour les textures)
 * 3. Configure la texture partagée entre le canvas 2D et le modèle 3D
 * 
 * @param {THREE.Object3D} mesh - Le modèle 3D chargé (groupe de meshes)
 */
const onModelLoaded = async (mesh) => {
  console.log('Modèle 3D chargé avec succès', mesh)
  errorMessage.value = ''
  
  // Extraire tous les meshes individuels du modèle pour l'inspection/édition
  extractModelMeshes(mesh)
  
  // Vérifier si les meshes ont des coordonnées UV
  // Les UVs sont nécessaires pour mapper la texture 2D sur la surface 3D
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
    // Les UVs seront générées automatiquement dans ThreeScene
  }
  
  // Attendre que le canvas Fabric.js soit prêt (rendu Vue)
  await nextTick()
  
  // Récupérer le canvas HTML depuis Fabric.js pour créer la texture partagée
  if (fabricDesignerRef.value) {
    const fabricCanvas = fabricDesignerRef.value.getCanvas()
    if (fabricCanvas) {
      const htmlCanvas = fabricCanvas.getElement()
      if (htmlCanvas) {
        fabricCanvasElement.value = htmlCanvas
        
        // Attendre un peu pour que les UVs soient générées si nécessaire
        await nextTick()
        
        // Configurer la texture partagée dans ThreeScene
        // Cette texture lie le canvas 2D au modèle 3D pour un rendu en temps réel
        if (threeSceneRef.value && threeSceneRef.value.setupSharedCanvasTexture) {
          threeSceneRef.value.setupSharedCanvasTexture(htmlCanvas)
        }
      }
    }
  }
  
  // Mettre à jour la liste de tous les objets
  updateAllObjectsList()
}

/**
 * Extrait tous les meshes individuels d'un modèle 3D
 * 
 * Parcourt récursivement l'objet 3D et collecte tous les meshes
 * avec leurs informations (nom, nombre de vertices, présence d'UVs, matériau)
 * 
 * @param {THREE.Object3D} obj - Le modèle 3D à analyser
 */
const extractModelMeshes = (obj) => {
  modelMeshes.value = []
  let index = 0
  
  // Parcourir récursivement tous les enfants du modèle
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geometry = child.geometry
      // Compter les vertices (points 3D)
      const vertexCount = geometry.attributes.position ? geometry.attributes.position.count : 0
      // Vérifier la présence de coordonnées UV
      const hasUVs = geometry.attributes.uv ? true : false
      
      // Stocker les informations du mesh
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

// ===== GESTION DES INTERACTIONS 3D =====
/**
 * Gère le clic sur le modèle 3D pour placer un élément directement
 * 
 * Quand l'utilisateur clique sur le modèle 3D en mode placement,
 * les coordonnées 3D sont converties en coordonnées 2D du canvas
 * et l'élément est placé à cette position.
 * 
 * @param {Object} clickData - Données du clic contenant canvasX, canvasY, etc.
 */
const on3DClickForPlacement = (clickData) => {
  // Vérifier que le clic est dans la zone active (pas null)
  // Les clics hors zone retournent null
  if (clickData.canvasX === undefined || clickData.canvasY === undefined || 
      clickData.canvasX === null || clickData.canvasY === null) {
    console.warn('⚠️ Clic hors zone de travail')
    return
  }
  
  // Si on est en mode placement, placer un nouvel élément
  if (placementMode.value && placementType.value) {
    console.log('🎯 Placement direct sur modèle 3D:', {
      type: placementType.value,
      position: clickData.canvasX + ', ' + clickData.canvasY
    })
    
    // Placer l'élément sur le canvas 2D à la position correspondante du clic 3D
    if (fabricDesignerRef.value && fabricDesignerRef.value.placeElementAt) {
      fabricDesignerRef.value.placeElementAt(placementType.value, clickData.canvasX, clickData.canvasY)
      // Le mode placement sera désactivé automatiquement par placeElementAt
    }
    return
  }
  
  // Sinon, sélectionner l'objet à cette position sur le modèle 3D
  console.log('🖱️ Clic sur modèle 3D - Tentative de sélection:', {
    canvasX: clickData.canvasX,
    canvasY: clickData.canvasY,
    hasFabricDesigner: !!fabricDesignerRef.value,
    hasSelectMethod: !!(fabricDesignerRef.value && fabricDesignerRef.value.selectObjectAtPosition)
  })
  
  if (fabricDesignerRef.value && fabricDesignerRef.value.selectObjectAtPosition) {
    // Vérifier d'abord s'il y a des objets sur le canvas
    const canvas = fabricDesignerRef.value.getCanvas()
    if (canvas) {
      const objects = canvas.getObjects().filter(obj => !obj.userData?.isWorkZoneIndicator)
      console.log('📦 Objets sur le canvas:', objects.length, objects.map(obj => ({
        type: obj.type,
        left: obj.left,
        top: obj.top,
        width: obj.width,
        height: obj.height
      })))
    }
    
    const found = fabricDesignerRef.value.selectObjectAtPosition(clickData.canvasX, clickData.canvasY)
    if (found) {
      console.log('✅ Objet sélectionné depuis le modèle 3D à la position:', {
        x: clickData.canvasX,
        y: clickData.canvasY
      })
      // Activer le mode drag après sélection pour pouvoir déplacer immédiatement
      dragMode.value = true
      if (threeSceneRef.value && threeSceneRef.value.setDragMode) {
        threeSceneRef.value.setDragMode(true)
      }
    } else {
      console.log('ℹ️ Aucun objet trouvé à cette position sur le modèle 3D:', {
        x: clickData.canvasX,
        y: clickData.canvasY
      })
      // Désactiver le mode drag si aucun objet n'est trouvé
      dragMode.value = false
      if (threeSceneRef.value && threeSceneRef.value.setDragMode) {
        threeSceneRef.value.setDragMode(false)
      }
    }
  } else {
    console.warn('⚠️ FabricDesigner ou méthode selectObjectAtPosition non disponible')
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

// Variable pour stocker l'objet sélectionné
const selectedObject = ref(null)

const onObjectSelected = (data) => {
  console.log('Objet sélectionné dans Fabric:', data)
  selectedObject.value = data.object
  dragMode.value = true
  
  // Activer le mode drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragMode) {
    threeSceneRef.value.setDragMode(true)
  }
  
  // Mettre à jour les coordonnées de l'objet sélectionné dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.updateSelectedObjectCoords) {
    threeSceneRef.value.updateSelectedObjectCoords(data.object)
  }
  
  // Mettre à jour la liste de tous les objets
  updateAllObjectsList()
}

const onObjectDeselected = () => {
  console.log('Objet désélectionné dans Fabric')
  selectedObject.value = null
  dragMode.value = false
  isDragging.value = false
  
  // Désactiver le mode drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragMode) {
    threeSceneRef.value.setDragMode(false)
  }
  
  // Masquer les coordonnées de l'objet sélectionné
  if (threeSceneRef.value && threeSceneRef.value.updateSelectedObjectCoords) {
    threeSceneRef.value.updateSelectedObjectCoords(null)
  }
  
  // Mettre à jour la liste de tous les objets
  updateAllObjectsList()
}

/**
 * Met à jour la liste de tous les objets dans ThreeScene
 */
const updateAllObjectsList = () => {
  if (!fabricDesignerRef.value || !fabricDesignerRef.value.getCanvas) return
  
  const canvas = fabricDesignerRef.value.getCanvas()
  if (!canvas) return
  
  const objects = canvas.getObjects().filter(obj => !obj.userData?.isWorkZoneIndicator)
  
  // Mettre à jour la liste dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.updateObjectsListFromCanvas) {
    threeSceneRef.value.updateObjectsListFromCanvas(objects)
  }
}

const onMoveObject = (data) => {
  // Cette fonction peut être utilisée pour des actions supplémentaires
  console.log('Objet déplacé:', data)
}

// Variables pour le redimensionnement
const isResizing = ref(false)
const resizeStartPos = ref({ x: 0, y: 0 })
const currentResizeHandle = ref(null)

// Variables pour le drag - stocker le décalage initial entre le clic et l'objet
const dragStartPos = ref({ x: 0, y: 0 })
const dragOffset = ref({ x: 0, y: 0 })

const on3DDragStart = (clickData) => {
  if (!dragMode.value) return
  
  // Vérifier que les coordonnées sont valides
  if (clickData.canvasX === undefined || clickData.canvasY === undefined || 
      clickData.canvasX === null || clickData.canvasY === null) {
    return
  }
  
  // Vérifier si on est près d'un bord pour redimensionner
  if (fabricDesignerRef.value && fabricDesignerRef.value.getCanvas) {
    const canvas = fabricDesignerRef.value.getCanvas()
    const activeObject = canvas?.getActiveObject()
    
    if (activeObject && fabricDesignerRef.value.detectResizeHandle) {
      const handleInfo = fabricDesignerRef.value.detectResizeHandle(
        activeObject,
        clickData.canvasX,
        clickData.canvasY
      )
      
      if (handleInfo) {
        // Commencer le redimensionnement
        isResizing.value = true
        isDragging.value = false // Désactiver le drag
        resizeStartPos.value = { x: clickData.canvasX, y: clickData.canvasY }
        currentResizeHandle.value = handleInfo
        
        // Notifier ThreeScene qu'on est en mode resize
        if (threeSceneRef.value && threeSceneRef.value.setResizing) {
          threeSceneRef.value.setResizing(true, {
            x: clickData.canvasX,
            y: clickData.canvasY
          }, handleInfo)
        }
        
        // Activer le flag de drag dans ThreeScene pour que onMouseMove fonctionne
        if (threeSceneRef.value && threeSceneRef.value.setDragState) {
          threeSceneRef.value.setDragState(true)
        }
        
        console.log('📏 Début du redimensionnement sur 3D:', handleInfo)
        return
      }
    }
  }
  
  // Sinon, c'est un déplacement normal
  isDragging.value = true
  isResizing.value = false
  
  // Calculer le décalage entre le point de clic et la position actuelle de l'objet
  if (fabricDesignerRef.value && fabricDesignerRef.value.getCanvas) {
    const canvas = fabricDesignerRef.value.getCanvas()
    const activeObject = canvas?.getActiveObject()
    
    if (activeObject) {
      // Obtenir les dimensions de l'objet (avec le scale appliqué)
      const objWidth = (activeObject.width || (activeObject.radius ? activeObject.radius * 2 : 50)) * (activeObject.scaleX || 1)
      const objHeight = (activeObject.height || (activeObject.radius ? activeObject.radius * 2 : 50)) * (activeObject.scaleY || 1)
      
      // Obtenir l'origine de l'objet
      const originX = activeObject.originX || 'left'
      const originY = activeObject.originY || 'top'
      
      // Calculer la position du coin haut-gauche de l'objet
      let objLeft = activeObject.left || 0
      let objTop = activeObject.top || 0
      
      if (originX === 'center') {
        objLeft = objLeft - objWidth / 2
      } else if (originX === 'right') {
        objLeft = objLeft - objWidth
      }
      
      if (originY === 'center') {
        objTop = objTop - objHeight / 2
      } else if (originY === 'bottom') {
        objTop = objTop - objHeight
      }
      
      // Calculer le décalage entre le point de clic et le coin haut-gauche de l'objet
      dragOffset.value = {
        x: clickData.canvasX - objLeft,
        y: clickData.canvasY - objTop
      }
      
      dragStartPos.value = { x: clickData.canvasX, y: clickData.canvasY }
    }
  }
  
  // Activer le flag de drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragState) {
    threeSceneRef.value.setDragState(true)
  }
  
  console.log('🎯 Début du drag sur 3D:', clickData, 'Offset:', dragOffset.value)
}

/**
 * Gère le glissement (drag) sur le modèle 3D pour déplacer un objet 2D
 * 
 * Quand l'utilisateur glisse sur le modèle 3D avec un objet sélectionné,
 * l'objet est déplacé sur le canvas 2D en suivant la position du curseur 3D.
 * 
 * @param {Object} clickData - Données du clic contenant canvasX, canvasY
 */
const on3DDrag = (clickData) => {
  if (!dragMode.value || !isDragging.value || isResizing.value) return
  
  // Vérifier que le clic est dans la zone active
  if (clickData.canvasX === undefined || clickData.canvasY === undefined || 
      clickData.canvasX === null || clickData.canvasY === null) {
    return
  }
  
  // Calculer la position de l'objet en soustrayant le décalage initial
  const targetX = clickData.canvasX - dragOffset.value.x
  const targetY = clickData.canvasY - dragOffset.value.y
  
  // Déplacer l'objet sélectionné sur le canvas 2D
  if (fabricDesignerRef.value && fabricDesignerRef.value.moveSelectedObject) {
    fabricDesignerRef.value.moveSelectedObject(targetX, targetY)
  }
}

// Variable pour stocker le handle survolé actuellement
const currentHoveredHandle = ref(null)

/**
 * Gère le survol du modèle 3D pour détecter les bords de redimensionnement
 * 
 * @param {Object} hoverData - Données contenant canvasX, canvasY
 */
const on3DHover = (hoverData) => {
  if (!fabricDesignerRef.value) return
  
  const canvas = fabricDesignerRef.value.getCanvas()
  const activeObject = canvas?.getActiveObject()
  
  // Si aucun objet n'est sélectionné ou si dragMode n'est pas actif, réinitialiser
  if (!activeObject || !dragMode.value) {
    // Réinitialiser le style
    if (fabricDesignerRef.value.resetResizeHover) {
      fabricDesignerRef.value.resetResizeHover()
    }
    currentHoveredHandle.value = null
    
      // Remettre le curseur par défaut (move pour déplacement)
      if (threeSceneRef.value && threeSceneRef.value.renderer) {
        const element = threeSceneRef.value.renderer.domElement
        const defaultCursor = dragMode.value ? 'move' : 'default'
        element.style.setProperty('cursor', defaultCursor, 'important')
      }
    return
  }
  
  // Vérifier si on est près d'un bord pour changer le curseur et le style
  if (fabricDesignerRef.value.detectResizeHandle) {
    const handleInfo = fabricDesignerRef.value.detectResizeHandle(
      activeObject,
      hoverData.canvasX,
      hoverData.canvasY
    )
    
    if (handleInfo) {
      // Si c'est un nouveau handle, mettre à jour le style
      if (!currentHoveredHandle.value || 
          currentHoveredHandle.value.handle !== handleInfo.handle) {
        currentHoveredHandle.value = handleInfo
        
        // Mettre en évidence le handle
        if (fabricDesignerRef.value.highlightResizeHandle) {
          fabricDesignerRef.value.highlightResizeHandle(activeObject, handleInfo)
        }
      }
      
      // Changer le curseur selon le type de handle
      if (threeSceneRef.value && threeSceneRef.value.renderer) {
        let cursor = 'move' // Par défaut, curseur de déplacement
        
        if (handleInfo.corner) {
          // Curseur diagonal pour les coins
          // tl (top-left) = nw-resize (nord-ouest)
          // tr (top-right) = ne-resize (nord-est)
          // bl (bottom-left) = nesw-resize (sud-ouest, mais on utilise nwse pour l'inverse)
          // br (bottom-right) = se-resize (sud-est, mais on utilise nwse pour l'inverse)
          if (handleInfo.corner === 'tl') {
            cursor = 'nw-resize' // Nord-ouest
          } else if (handleInfo.corner === 'tr') {
            cursor = 'ne-resize' // Nord-est
          } else if (handleInfo.corner === 'bl') {
            cursor = 'nesw-resize' // Sud-ouest (diagonale /)
          } else if (handleInfo.corner === 'br') {
            cursor = 'nwse-resize' // Sud-est (diagonale \)
          }
        } else if (handleInfo.edge) {
          // Curseur pour les bords
          if (handleInfo.edge === 'left') {
            cursor = 'w-resize' // Ouest (gauche)
          } else if (handleInfo.edge === 'right') {
            cursor = 'e-resize' // Est (droite)
          } else if (handleInfo.edge === 'top') {
            cursor = 'n-resize' // Nord (haut)
          } else if (handleInfo.edge === 'bottom') {
            cursor = 'ns-resize' // Vertical (nord-sud) pour le bas aussi
          }
        }
        
        // Appliquer le curseur
        if (threeSceneRef.value.renderer && threeSceneRef.value.renderer.domElement) {
          const element = threeSceneRef.value.renderer.domElement
          
          // Utiliser setProperty pour forcer l'application
          element.style.setProperty('cursor', cursor, 'important')
          
          // Fallback si setProperty ne fonctionne pas
          if (element.style.cursor !== cursor) {
            element.style.cursor = cursor
          }
          
          console.log('🎯 Curseur changé:', cursor, 'pour handle:', handleInfo.handle || handleInfo.corner || handleInfo.edge, handleInfo)
        }
      }
    } else {
      // Plus de handle survolé, réinitialiser le style
      if (currentHoveredHandle.value) {
        currentHoveredHandle.value = null
        if (fabricDesignerRef.value && fabricDesignerRef.value.resetResizeHover) {
          fabricDesignerRef.value.resetResizeHover()
        }
      }
      
      if (threeSceneRef.value && threeSceneRef.value.renderer) {
        const element = threeSceneRef.value.renderer.domElement
        element.style.setProperty('cursor', 'move', 'important')
      }
    }
  }
}

/**
 * Gère le début du redimensionnement depuis le modèle 3D
 * 
 * @param {Object} resizeData - Données contenant canvasX, canvasY, handleInfo
 */
const on3DResizeStart = (resizeData) => {
  isResizing.value = true
  resizeStartPos.value = { x: resizeData.canvasX, y: resizeData.canvasY }
  currentResizeHandle.value = resizeData.handleInfo
  console.log('📏 Début du redimensionnement depuis 3D:', resizeData)
}

/**
 * Gère le redimensionnement en cours depuis le modèle 3D
 * 
 * @param {Object} resizeData - Données contenant canvasX, canvasY, startX, startY, handleInfo
 */
const on3DResize = (resizeData) => {
  if (!dragMode.value || !isResizing.value) return
  
  // Vérifier que les coordonnées sont valides
  if (resizeData.canvasX === undefined || resizeData.canvasY === undefined || 
      resizeData.canvasX === null || resizeData.canvasY === null) {
    return
  }
  
  // Redimensionner l'objet sélectionné
  if (fabricDesignerRef.value && fabricDesignerRef.value.resizeSelectedObjectFromHandle) {
    fabricDesignerRef.value.resizeSelectedObjectFromHandle(
      resizeData.canvasX,
      resizeData.canvasY,
      resizeData.startX,
      resizeData.startY,
      resizeData.handleInfo
    )
  }
}

/**
 * Gère la fin du redimensionnement depuis le modèle 3D
 */
const on3DResizeEnd = () => {
  // Réinitialiser les données de resize dans le canvas
  if (fabricDesignerRef.value && fabricDesignerRef.value.getCanvas) {
    const canvas = fabricDesignerRef.value.getCanvas()
    const activeObject = canvas?.getActiveObject()
    if (activeObject && fabricDesignerRef.value.resetResizeData) {
      fabricDesignerRef.value.resetResizeData(activeObject)
    }
  }
  
  // Réinitialiser le style de hover
  if (fabricDesignerRef.value && fabricDesignerRef.value.resetResizeHover) {
    fabricDesignerRef.value.resetResizeHover()
  }
  currentHoveredHandle.value = null
  
  isResizing.value = false
  resizeStartPos.value = { x: 0, y: 0 }
  currentResizeHandle.value = null
  
  // Désactiver le mode resize dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setResizing) {
    threeSceneRef.value.setResizing(false, null, null)
  }
  
  // Désactiver le drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragState) {
    threeSceneRef.value.setDragState(false)
  }
  
  // Remettre le curseur normal (move pour déplacement)
  if (threeSceneRef.value && threeSceneRef.value.renderer) {
    const element = threeSceneRef.value.renderer.domElement
    const defaultCursor = dragMode.value ? 'move' : 'default'
    element.style.setProperty('cursor', defaultCursor, 'important')
  }
  
  console.log('📏 Fin du redimensionnement depuis 3D')
}

/**
 * Gère la fin du glissement sur le modèle 3D
 */
const on3DDragEnd = () => {
  isDragging.value = false
  
  // Réinitialiser le décalage
  dragOffset.value = { x: 0, y: 0 }
  dragStartPos.value = { x: 0, y: 0 }
  
  // Réinitialiser le style de hover
  if (fabricDesignerRef.value && fabricDesignerRef.value.resetResizeHover) {
    fabricDesignerRef.value.resetResizeHover()
  }
  currentHoveredHandle.value = null
  
  // Désactiver le drag dans ThreeScene
  if (threeSceneRef.value && threeSceneRef.value.setDragState) {
    threeSceneRef.value.setDragState(false)
  }
  
  // Remettre le curseur normal (move pour déplacement)
  if (threeSceneRef.value && threeSceneRef.value.renderer) {
    const element = threeSceneRef.value.renderer.domElement
    const defaultCursor = dragMode.value ? 'move' : 'default'
    element.style.setProperty('cursor', defaultCursor, 'important')
  }
  
  console.log('🎯 Fin du drag sur 3D')
}

/**
 * Gère le redimensionnement d'un objet avec la molette de la souris
 * 
 * Quand l'utilisateur utilise la molette sur le modèle 3D avec un objet sélectionné,
 * l'objet est redimensionné proportionnellement.
 * 
 * @param {Object} scaleData - Données contenant le facteur de redimensionnement
 */
const on3DScale = (scaleData) => {
  // Vérifier qu'un objet est sélectionné (dragMode actif signifie qu'un objet est sélectionné)
  if (!dragMode.value) return
  
  // Vérifier qu'il y a bien un objet sélectionné dans le canvas
  if (!fabricDesignerRef.value) return
  
  const canvas = fabricDesignerRef.value.getCanvas()
  if (!canvas || !canvas.getActiveObject()) {
    console.warn('⚠️ Aucun objet sélectionné pour le redimensionnement')
    return
  }
  
  // Redimensionner l'objet sélectionné sur le canvas 2D
  if (fabricDesignerRef.value.scaleSelectedObject) {
    fabricDesignerRef.value.scaleSelectedObject(scaleData.scaleFactor)
    console.log('📏 Redimensionnement depuis 3D:', {
      scaleFactor: scaleData.scaleFactor,
      objectType: canvas.getActiveObject()?.type
    })
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
  
  // Mettre à jour la liste de tous les objets
  updateAllObjectsList()
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

// ===== GESTION DE LA NAVIGATION ENTRE VUES =====
/**
 * Bascule entre la vue 2D et la vue 3D
 * Chaque vue prend 100% de l'écran quand elle est active
 */
const toggleView = () => {
  currentView.value = currentView.value === '3d' ? '2d' : '3d'
  // Maintenir la compatibilité avec showDesigner
  showDesigner.value = currentView.value === '2d'
}

const toggleDesigner = () => {
  // Si on toggle le designer, on passe en vue 2D
  if (!showDesigner.value) {
    currentView.value = '2d'
  }
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

// ===== CHARGEMENT PAR DÉFAUT DU MODÈLE =====
/**
 * Charge le modèle par défaut au montage du composant
 */
onMounted(async () => {
  try {
    // Charger le fichier downloadSvg3.obj par défaut
    // Utiliser un import dynamique avec Vite pour charger le fichier
    const objUrl = new URL('./downloadSvg3.obj', import.meta.url)
    
    const response = await fetch(objUrl)
    if (!response.ok) {
      console.warn('Impossible de charger le modèle par défaut depuis downloadSvg3.obj')
      return
    }
    
    const blob = await response.blob()
    const file = new File([blob], 'downloadSvg3.obj', { type: 'model/obj' })
    
    // Attendre un peu pour que les composants soient prêts
    await nextTick()
    
    uploadedModel.value = file
    console.log('✅ Modèle par défaut chargé: downloadSvg3.obj')
  } catch (error) {
    console.warn('⚠️ Impossible de charger le modèle par défaut:', error)
    // Ne pas afficher d'erreur à l'utilisateur, juste un log
  }
})
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

.view-toggle-btn {
  padding: 8px 16px;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
  margin-left: 10px;
}

.view-toggle-btn:hover {
  background: #059669;
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

/* ===== VUES EN PLEIN ÉCRAN ===== */
.view-panel {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  transition: opacity 0.3s ease, visibility 0.3s ease;
}

/* Cacher la vue inactive avec v-show */
/* Note: v-show utilise display: none, donc les éléments restent dans le DOM */

.view-3d {
  background: #1a1a1a;
  z-index: 1;
}

.view-2d {
  background: white;
  z-index: 2;
  overflow: hidden;
}

.view-2d .panel-header {
  flex-shrink: 0;
}

.view-2d .work-zone-controls {
  flex-shrink: 0;
}

.view-2d .fabric-designer-container {
  flex: 1;
  overflow: auto;
}

/* Anciens styles pour compatibilité */
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
  height: 100%;
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

