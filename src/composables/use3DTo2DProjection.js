import * as THREE from 'three'

export const getUVFromIntersection = (intersection) => {
  if (!intersection || !intersection.face || !intersection.uv) {
    return null
  }
  return {
    u: intersection.uv.x,
    v: intersection.uv.y
  }
}

export const UVToCanvasCoords = (uv, canvasWidth, canvasHeight) => {
  if (!uv || uv.u === undefined || uv.v === undefined) {
    return { x: 0, y: 0 }
  }

  return {
    x: uv.u * canvasWidth,
    y: canvasHeight - uv.v * canvasHeight
  }
}

export const project3DClickToCanvas = (intersection, canvasWidth, canvasHeight) => {
  const uv = getUVFromIntersection(intersection)
  if (!uv) {
    return null
  }
  return UVToCanvasCoords(uv, canvasWidth, canvasHeight)
}
