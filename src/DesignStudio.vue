<template>
  <div class="design-studio">
    <div class="studio-content">
      <div class="view-panel view-3d">
        <div class="panel-header">
          <h3>🎯 Vue 3D - Modèle</h3>
        </div>
        <div v-if="tempCanvasDataUrl" class="debug-rotation-preview">
          <div class="debug-header">Preview Shader</div>
          <img :src="tempCanvasDataUrl" alt="Debug Preview" />
        </div>
        <ThreeScene 
          ref="threeSceneRef"
          :texture="appliedTexture"
          :canvas2D="fabricCanvasElement"
          :enable-direct-edit="true"
          :drag-mode="dragMode"
          @texture-ready="onTextureReady"
          @3d-click="on3DClickForPlacement"
          @3d-click-outside="on3DClickOutside"
          @3d-rotation-click="on3DRotationClick"
          @3d-rotation-start="on3DRotationStart"
          @3d-rotation="on3DRotation"
          @3d-rotation-end="on3DRotationEnd"
          @3d-drag="on3DDrag"
          @3d-drag-start="on3DDragStart"
          @3d-drag-end="on3DDragEnd"
          @3d-scale="on3DScale"
          @3d-resize-start="on3DResizeStart"
          @3d-resize="on3DResize"
          @3d-resize-end="on3DResizeEnd"
          @3d-hover="on3DHover"
          @detect-resize-handle="onDetectResizeHandle"
        />
      </div>

      <div class="view-panel view-2d">
        <FabricDesigner
          ref="fabricDesignerRef"
          :canvas-width="500"
          :canvas-height="500"
          :update-texture-direct="() => threeSceneRef?.updateTextureDirect?.()"
          @canvas-ready="onFabricCanvasReady"
          @placement-mode-changed="onPlacementModeChanged"
          @object-selected="onObjectSelected"
          @object-deselected="onObjectDeselected"
          @move-object="onMoveObject"
          @objects-changed="updateAllObjectsList"
          @object-rotated="onObjectRotated"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import ThreeScene from './components/ThreeScene.vue'
import FabricDesigner from './components/FabricDesigner.vue'
import { useDesignStudio } from './composables/useDesignStudio'

const {
  threeSceneRef,
  fabricDesignerRef,
  appliedTexture,
  fabricCanvasElement,
  dragMode,
  tempCanvasDataUrl,
  onTextureReady,
  on3DClickForPlacement,
  on3DClickOutside,
  on3DRotationClick,
  on3DRotationStart,
  on3DRotation,
  on3DRotationEnd,
  on3DDrag,
  on3DDragStart,
  on3DDragEnd,
  on3DScale,
  on3DResizeStart,
  on3DResize,
  on3DResizeEnd,
  on3DHover,
  onDetectResizeHandle,
  onPlacementModeChanged,
  onObjectSelected,
  onObjectDeselected,
  onMoveObject,
  onObjectRotated,
  onFabricCanvasReady,
  updateAllObjectsList
} = useDesignStudio()

onMounted(() => {})
</script>

<style scoped>
.design-studio {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.studio-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  gap: 0;
}

.view-panel {
  position: relative;
  width: 100%;
  height: 50%;
  display: flex;
  flex-direction: column;
  border-bottom: 2px solid #e5e7eb;
}

.view-panel:last-child {
  border-bottom: none;
}

.view-3d {
  background: #1a1a1a;
  z-index: 1;
}

.view-2d {
  background: white;
  z-index: 1;
  overflow: hidden;
}

.view-panel .panel-header {
  flex-shrink: 0;
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.05);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.view-3d .panel-header {
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.view-panel .panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.view-3d .panel-header h3 {
  color: #fff;
}

.debug-rotation-preview {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: white;
  border: 2px solid #178efa;
  border-radius: 8px;
  padding: 10px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  z-index: 9999;
  max-width: 300px;
}

.debug-header {
  font-size: 12px;
  font-weight: bold;
  color: #333;
  margin-bottom: 5px;
  text-align: center;
  border-bottom: 1px solid #eee;
  padding-bottom: 5px;
}

.debug-rotation-preview img {
  max-width: 100%;
  height: auto;
  display: block;
  border: 1px solid #eee;
  background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), 
                    linear-gradient(-45deg, #ccc 25%, transparent 25%), 
                    linear-gradient(45deg, transparent 75%, #ccc 75%), 
                    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

@media (max-width: 1024px) {
  .studio-content {
    flex-direction: column;
  }
}
</style>
