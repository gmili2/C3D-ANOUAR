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
import { ref, nextTick, onMounted } from 'vue'
import ThreeScene from './components/ThreeScene.vue'
import FabricDesigner from './components/FabricDesigner.vue'

const threeSceneRef = ref(null)
const fabricDesignerRef = ref(null)
const appliedTexture = ref(null)
const fabricCanvasElement = ref(null)
const placementMode = ref(false)
const placementType = ref(null)
const dragMode = ref(false)
const useDecalOptimization = ref(true)
const tempCanvasDataUrl = ref(null)
const isDragging = ref(false)
const isResizing = ref(false)
const isRotating = ref(false)
const resizeStartPos = ref({ x: 0, y: 0 })
const currentResizeHandle = ref(null)
const currentHoveredHandle = ref(null)
const dragOffset = ref({ x: 0, y: 0 })

let rotationInitialAngle = 0
let lastRotationAngle = 0
let skipped2DFrames = 0

const onTextureReady = (texture) => {
  appliedTexture.value = texture
}

const setDragModeInThreeScene = (enabled) => {
  if (threeSceneRef.value?.setDragMode) {
    threeSceneRef.value.setDragMode(enabled)
  }
}

const updateSelectedObjectCoordsInThreeScene = (object) => {
  if (threeSceneRef.value?.updateSelectedObjectCoords) {
    threeSceneRef.value.updateSelectedObjectCoords(object)
  }
}

const getActiveObject = () => {
  const canvas = fabricDesignerRef.value?.getCanvas()
  const activeObject = canvas?.getActiveObject()
  if (activeObject?.userData?.isWorkZoneIndicator) return null
  return activeObject
}

const on3DClickForPlacement = (clickData) => {
  if (clickData.canvasX == null || clickData.canvasY == null) return
  
  if (placementMode.value && placementType.value) {
    fabricDesignerRef.value?.placeElementAt?.(placementType.value, clickData.canvasX, clickData.canvasY)
    nextTick(updateAllObjectsList)
    return
  }
  
  if (clickData.checkForObject && fabricDesignerRef.value) {
    const canvas = fabricDesignerRef.value.getCanvas()
    if (!canvas) return
    
    const found = fabricDesignerRef.value.selectObjectAtPosition(clickData.canvasX, clickData.canvasY)
    
    if (found) {
      dragMode.value = true
      setDragModeInThreeScene(true)
    } else {
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      dragMode.value = false
      setDragModeInThreeScene(false)
      nextTick(updateAllObjectsList)
    }
    return
  }
  
  if (fabricDesignerRef.value?.selectObjectAtPosition) {
    const found = fabricDesignerRef.value.selectObjectAtPosition(clickData.canvasX, clickData.canvasY)
    dragMode.value = found
    setDragModeInThreeScene(found)
  }
}

const on3DRotationClick = (clickData) => {
  const activeObject = getActiveObject()
  if (!activeObject) return
  
  if (fabricDesignerRef.value?.activateRotationMode && clickData.mtrCoords) {
    fabricDesignerRef.value.activateRotationMode(activeObject, clickData.mtrCoords)
  }
}

const on3DRotationStart = (rotationData) => {
  const canvas = fabricDesignerRef.value?.getCanvas()
  const activeObject = getActiveObject()
  if (!canvas || !activeObject) return
  
  rotationInitialAngle = activeObject.angle || 0
  skipped2DFrames = 0
  isRotating.value = true
  
  if (rotationData?.mtrCoords && fabricDesignerRef.value?.activateRotationMode) {
    fabricDesignerRef.value.activateRotationMode(activeObject, rotationData.mtrCoords)
  }

  threeSceneRef.value?.disableOrbitControls?.()

  if (useDecalOptimization.value && threeSceneRef.value?.startDecalRotation) {
    const currentAngle = activeObject.angle || 0
    
    activeObject.set('angle', 0)
    activeObject.setCoords()
    
    const objWidth = activeObject.getScaledWidth()
    const objHeight = activeObject.getScaledHeight()
    
    const dataUrl = activeObject.toDataURL({
      format: 'png',
      multiplier: 4,
      enableRetinaScaling: true,
      withoutBorders: true,
      withoutControls: true
    })
    
    activeObject.set('angle', currentAngle)
    activeObject.setCoords()
    
    tempCanvasDataUrl.value = dataUrl
    
    const center = activeObject.getCenterPoint()
    
    threeSceneRef.value.startDecalRotation({
      left: center.x,
      top: center.y,
      width: objWidth,
      height: objHeight,
      angle: -currentAngle
    }, dataUrl)
    
    activeObject.set({ opacity: 0, hasControls: false, hasBorders: false })
    canvas.renderAll()
  }
}

const applyRotationAroundCenter = (activeObject, newAngle) => {
  activeObject.setCoords()
  const centerBefore = activeObject.getCenterPoint()
  
  activeObject.set({ angle: newAngle })
  activeObject.setCoords()
  
  const centerAfter = activeObject.getCenterPoint()
  
  activeObject.set({
    left: (activeObject.left || 0) + centerBefore.x - centerAfter.x,
    top: (activeObject.top || 0) + centerBefore.y - centerAfter.y
  })
  activeObject.setCoords()
}

const on3DRotation = (rotationData) => {
  const canvas = fabricDesignerRef.value?.getCanvas()
  const activeObject = getActiveObject()
  if (!canvas || !activeObject) return
  
  const newAngle = rotationInitialAngle + rotationData.angle
  lastRotationAngle = newAngle
  
  if (useDecalOptimization.value && threeSceneRef.value?.updateDecalRotation) {
    threeSceneRef.value.updateDecalRotation(-newAngle)
    skipped2DFrames++
    return
  }
  
  applyRotationAroundCenter(activeObject, newAngle)
  canvas.renderAll()
  updateSelectedObjectCoordsInThreeScene(activeObject)
}

const on3DRotationEnd = () => {
  if (useDecalOptimization.value && threeSceneRef.value?.endDecalRotation) {
    threeSceneRef.value.endDecalRotation()
    tempCanvasDataUrl.value = null
  }

  threeSceneRef.value?.enableOrbitControls?.()

  const canvas = fabricDesignerRef.value?.getCanvas()
  const activeObject = getActiveObject()
  
  if (activeObject) {
    activeObject.set({ opacity: 1, hasControls: true, hasBorders: true })
    
    const finalAngle = lastRotationAngle || activeObject.angle
    applyRotationAroundCenter(activeObject, finalAngle)
    canvas.renderAll()
    updateSelectedObjectCoordsInThreeScene(activeObject)
  }
  
  rotationInitialAngle = 0
  lastRotationAngle = 0
  isRotating.value = false
  
  if (fabricDesignerRef.value) {
    const activeObj = getActiveObject()
    if (activeObj) {
      updateSelectedObjectCoordsInThreeScene(activeObj)
    }
  }
}

const onPlacementModeChanged = (modeData) => {
  placementMode.value = modeData.active
  placementType.value = modeData.type
  threeSceneRef.value?.setPlacementMode?.(modeData.active, modeData.type)
}

const onObjectSelected = (data) => {
  dragMode.value = true
  setDragModeInThreeScene(true)
  updateSelectedObjectCoordsInThreeScene(data.object)
  updateAllObjectsList()
}

const onObjectDeselected = () => {
  dragMode.value = false
  isDragging.value = false
  setDragModeInThreeScene(false)
  updateSelectedObjectCoordsInThreeScene(null)
  updateAllObjectsList()
}

const on3DClickOutside = () => {
  fabricDesignerRef.value?.deselectObject?.()
  dragMode.value = false
  isDragging.value = false
  setDragModeInThreeScene(false)
  updateSelectedObjectCoordsInThreeScene(null)
}

const updateAllObjectsList = () => {
  const canvas = fabricDesignerRef.value?.getCanvas()
  if (!canvas) return
  
  const objects = canvas.getObjects().filter(obj => !obj.userData?.isWorkZoneIndicator)
  threeSceneRef.value?.updateObjectsListFromCanvas?.(objects)
}

const onMoveObject = () => updateAllObjectsList()

const onObjectRotated = (data) => {
  if (data?.angle) {
    threeSceneRef.value?.rotateModel?.(data.angle)
  }
}

const onDetectResizeHandle = (data) => {
  const activeObject = getActiveObject()
  if (!activeObject || !fabricDesignerRef.value?.detectResizeHandle) return
  
  const handleInfo = fabricDesignerRef.value.detectResizeHandle(activeObject, data.canvasX, data.canvasY)
  
  if (handleInfo) {
    data.result.isResize = true
    data.result.handleInfo = handleInfo
  }
}

const getObjectDimensions = (obj) => {
  const width = (obj.width || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleX || 1)
  const height = (obj.height || (obj.radius ? obj.radius * 2 : 50)) * (obj.scaleY || 1)
  return { width, height }
}

const getObjectTopLeft = (obj) => {
  const { width, height } = getObjectDimensions(obj)
  const originX = obj.originX || 'left'
  const originY = obj.originY || 'top'
  
  let left = obj.left || 0
  let top = obj.top || 0
  
  if (originX === 'center') left -= width / 2
  else if (originX === 'right') left -= width
  
  if (originY === 'center') top -= height / 2
  else if (originY === 'bottom') top -= height
  
  return { left, top }
}

const on3DDragStart = (clickData) => {
  if (!dragMode.value || clickData.canvasX == null || clickData.canvasY == null) return
  
  isDragging.value = true
  isResizing.value = false
  
  const activeObject = getActiveObject()
  if (activeObject) {
    const { left, top } = getObjectTopLeft(activeObject)
    dragOffset.value = {
      x: clickData.canvasX - left,
      y: clickData.canvasY - top
    }
  }
  
  threeSceneRef.value?.setDragState?.(true)
}

const on3DDrag = (clickData) => {
  if (!dragMode.value || !isDragging.value || isResizing.value) return
  if (clickData.canvasX == null || clickData.canvasY == null) return
  
  const targetX = clickData.canvasX - dragOffset.value.x
  const targetY = clickData.canvasY - dragOffset.value.y
  
  fabricDesignerRef.value?.moveSelectedObject?.(targetX, targetY)
}

const setCursor = (cursor) => {
  const element = threeSceneRef.value?.renderer?.()?.domElement
  if (element) {
    element.style.setProperty('cursor', cursor, 'important')
  }
}

const getControlPosition = (activeObject, handleInfo) => {
  const { width, height } = getObjectDimensions(activeObject)
  const objLeft = activeObject.left || 0
  const objTop = activeObject.top || 0
  const objRight = objLeft + width
  const objBottom = objTop + height
  
  if (handleInfo.isRotation) {
    activeObject.setCoords?.()
    const coords = activeObject.oCoords || activeObject.calcCoords()
    if (coords?.tl && coords?.tr) {
      const centerTopX = (coords.tl.x + coords.tr.x) / 2
      const centerTopY = (coords.tl.y + coords.tr.y) / 2
      const dx = coords.tr.x - coords.tl.x
      const dy = coords.tr.y - coords.tl.y
      const length = Math.sqrt(dx * dx + dy * dy)
      
      if (Math.abs(dy) < 0.01) {
        return { x: centerTopX, y: centerTopY - 30 }
      }
      return {
        x: centerTopX + (dy / length) * 30,
        y: centerTopY - (dx / length) * 30
      }
    }
    return { x: 0, y: 0 }
  }
  
  const corners = {
    tl: { x: objLeft, y: objTop },
    tr: { x: objRight, y: objTop },
    bl: { x: objLeft, y: objBottom },
    br: { x: objRight, y: objBottom }
  }
  
  const edges = {
    left: { x: objLeft, y: (objTop + objBottom) / 2 },
    right: { x: objRight, y: (objTop + objBottom) / 2 },
    top: { x: (objLeft + objRight) / 2, y: objTop },
    bottom: { x: (objLeft + objRight) / 2, y: objBottom }
  }
  
  if (handleInfo.corner) return corners[handleInfo.corner] || { x: 0, y: 0 }
  if (handleInfo.edge) return edges[handleInfo.edge] || { x: 0, y: 0 }
  return { x: 0, y: 0 }
}

const getCursorForHandle = (handleInfo) => {
  if (handleInfo.corner) {
    return (handleInfo.corner === 'tl' || handleInfo.corner === 'br') ? 'nwse-resize' : 'nesw-resize'
  }
  if (handleInfo.edge) {
    return (handleInfo.edge === 'left' || handleInfo.edge === 'right') ? 'ew-resize' : 'ns-resize'
  }
  if (handleInfo.isRotation) return 'grab'
  return 'move'
}

const on3DHover = (hoverData) => {
  const activeObject = getActiveObject()
  
  if (!activeObject || !dragMode.value) {
    currentHoveredHandle.value = null
    threeSceneRef.value?.setRotationHandleHover?.(false)
    setCursor(dragMode.value ? 'move' : 'default')
    return
  }
  
  if (!fabricDesignerRef.value?.detectResizeHandle) return
  
  const handleInfo = fabricDesignerRef.value.detectResizeHandle(activeObject, hoverData.canvasX, hoverData.canvasY)
  
  if (handleInfo) {
    const controlPos = getControlPosition(activeObject, handleInfo)
    const distance = Math.sqrt(
      Math.pow(hoverData.canvasX - controlPos.x, 2) + 
      Math.pow(hoverData.canvasY - controlPos.y, 2)
    )
    
    threeSceneRef.value?.setDetectedControl?.(handleInfo, distance, controlPos.x, controlPos.y)
    
    if (!currentHoveredHandle.value || currentHoveredHandle.value.handle !== handleInfo.handle) {
      currentHoveredHandle.value = handleInfo
    }
    
    if (!isDragging.value && !isRotating.value) {
      setCursor(getCursorForHandle(handleInfo))
      threeSceneRef.value?.setRotationHandleHover?.(handleInfo.isRotation || false)
    }
  } else {
    if (currentHoveredHandle.value) {
      currentHoveredHandle.value = null
    }
    threeSceneRef.value?.setDetectedControl?.(null)
    threeSceneRef.value?.setRotationHandleHover?.(false)
    setCursor('move')
  }
}

const on3DResizeStart = (resizeData) => {
  isResizing.value = true
  isDragging.value = false
  resizeStartPos.value = { x: resizeData.canvasX, y: resizeData.canvasY }
  currentResizeHandle.value = resizeData.handleInfo
}

const on3DResize = (resizeData) => {
  if (!dragMode.value || !isResizing.value) return
  if (resizeData.canvasX == null || resizeData.canvasY == null) return
  
  fabricDesignerRef.value?.resizeSelectedObjectFromHandle?.(
    resizeData.canvasX,
    resizeData.canvasY,
    resizeData.startX,
    resizeData.startY,
    resizeData.handleInfo
  )
}

const on3DResizeEnd = () => {
  const activeObject = getActiveObject()
  if (activeObject) {
    fabricDesignerRef.value?.resetResizeData?.(activeObject)
  }
  
  fabricDesignerRef.value?.resetResizeHover?.()
  currentHoveredHandle.value = null
  
  isResizing.value = false
  resizeStartPos.value = { x: 0, y: 0 }
  currentResizeHandle.value = null
  
  threeSceneRef.value?.setResizing?.(false, null, null)
  threeSceneRef.value?.setDragState?.(false)
  setCursor(dragMode.value ? 'move' : 'default')
}

const on3DDragEnd = () => {
  isDragging.value = false
  dragOffset.value = { x: 0, y: 0 }
  
  fabricDesignerRef.value?.resetResizeHover?.()
  currentHoveredHandle.value = null
  
  threeSceneRef.value?.setDragState?.(false)
  setCursor(dragMode.value ? 'move' : 'default')
}

const on3DScale = (scaleData) => {
  if (!dragMode.value) return
  
  const canvas = fabricDesignerRef.value?.getCanvas()
  if (!canvas?.getActiveObject()) return
  
  fabricDesignerRef.value?.scaleSelectedObject?.(scaleData.scaleFactor)
}

const onFabricCanvasReady = (htmlCanvas) => {
  fabricCanvasElement.value = htmlCanvas
  threeSceneRef.value?.setupSharedCanvasTexture?.(htmlCanvas)
  updateAllObjectsList()
}

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
