import { ref, nextTick } from 'vue'

export function useDesignStudio() {
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



  const setDragModeInThreeScene = (enabled) => {
    threeSceneRef.value?.setDragMode?.(enabled)
  }

  const updateSelectedObjectCoordsInThreeScene = (object) => {
    threeSceneRef.value?.updateSelectedObjectCoords?.(object)
  }

  const getActiveObject = () => {
    const canvas = fabricDesignerRef.value?.getCanvas()
    const activeObject = canvas?.getActiveObject()
    if (activeObject?.userData?.isWorkZoneIndicator) return null
    return activeObject
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

  const setCursor = (cursor) => {
    const element = threeSceneRef.value?.renderer?.()?.domElement
    if (element) {
      element.style.setProperty('cursor', cursor, 'important')
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



  const onTextureReady = (texture) => {
    appliedTexture.value = texture
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

  const on3DClickOutside = () => {
    fabricDesignerRef.value?.deselectObject?.()
    dragMode.value = false
    isDragging.value = false
    setDragModeInThreeScene(false)
    updateSelectedObjectCoordsInThreeScene(null)
  }

  const onPlacementModeChanged = (modeData) => {
    placementMode.value = modeData.active
    placementType.value = modeData.type

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



    if (useDecalOptimization.value && threeSceneRef.value?.startDecalRotation) {
      const currentAngle = activeObject.angle || 0
      
      activeObject.set('angle', 0)
      activeObject.setCoords()
      
      const rect = activeObject.getBoundingRect()
      const objWidth = rect.width
      const objHeight = rect.height
      
      const dataUrl = activeObject.toDataURL({
        format: 'png',
        multiplier: 4,
        enableRetinaScaling: false,
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
        angle: -currentAngle,
        multiplier: 4
      }, dataUrl)
      
      activeObject.set({ opacity: 0, hasControls: false, hasBorders: false })
      canvas.renderAll()
    }
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
    
    const activeObj = getActiveObject()
    if (activeObj) {
      updateSelectedObjectCoordsInThreeScene(activeObj)
    }
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

  const onObjectRotated = (data) => {
    if (data?.angle) {

    }
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
    

  }

  const on3DDrag = (clickData) => {
    if (!dragMode.value || !isDragging.value || isResizing.value) return
    if (clickData.canvasX == null || clickData.canvasY == null) return
    
    const targetX = clickData.canvasX - dragOffset.value.x
    const targetY = clickData.canvasY - dragOffset.value.y
    
    fabricDesignerRef.value?.moveSelectedObject?.(targetX, targetY)
  }

  const on3DDragEnd = () => {
    isDragging.value = false
    dragOffset.value = { x: 0, y: 0 }
    
    fabricDesignerRef.value?.resetResizeHover?.()
    currentHoveredHandle.value = null
    

    setCursor(dragMode.value ? 'move' : 'default')
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
    

    setCursor(dragMode.value ? 'move' : 'default')
  }



  const on3DHover = (hoverData) => {
    const activeObject = getActiveObject()
    
    if (!activeObject || !dragMode.value) {
      currentHoveredHandle.value = null

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
      

      
      if (!currentHoveredHandle.value || currentHoveredHandle.value.handle !== handleInfo.handle) {
        currentHoveredHandle.value = handleInfo
      }
      
      if (!isDragging.value && !isRotating.value) {
        setCursor(getCursorForHandle(handleInfo))

      }
    } else {
      if (currentHoveredHandle.value) {
        currentHoveredHandle.value = null
      }

      setCursor('move')
    }
  }





  const updateAllObjectsList = () => {
    const canvas = fabricDesignerRef.value?.getCanvas()
    if (!canvas) return
    
    const objects = canvas.getObjects().filter(obj => !obj.userData?.isWorkZoneIndicator)

  }

  const onMoveObject = () => updateAllObjectsList()

  const onFabricCanvasReady = (htmlCanvas) => {
    fabricCanvasElement.value = htmlCanvas

    updateAllObjectsList()
  }



  return {

    threeSceneRef,
    fabricDesignerRef,
    appliedTexture,
    fabricCanvasElement,
    placementMode,
    placementType,
    dragMode,
    tempCanvasDataUrl,
    isDragging,
    isResizing,
    isRotating,


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
  }
}
