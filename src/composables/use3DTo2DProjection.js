import * as THREE from 'three'

/**
 * Convertit un point d'intersection 3D en coordonnées UV du modèle
 * @param {THREE.Intersection} intersection - L'intersection du raycast
 * @returns {Object|null} - { u, v } ou null si impossible
 */
export const getUVFromIntersection = (intersection) => {
  if (!intersection || !intersection.face || !intersection.uv) {
    return null
  }

  // Three.js fournit directement les UVs à l'intersection
  return {
    u: intersection.uv.x,
    v: intersection.uv.y
  }
}

/**
 * Convertit des coordonnées UV en coordonnées canvas 2D
 * @param {Object} uv - { u, v } coordonnées UV (0-1)
 * @param {number} canvasWidth - Largeur du canvas
 * @param {number} canvasHeight - Hauteur du canvas
 * @returns {Object} - { x, y } coordonnées canvas
 */
export const UVToCanvasCoords = (uv, canvasWidth, canvasHeight) => {
  if (!uv || uv.u === undefined || uv.v === undefined) {
    return { x: 0, y: 0 }
  }

  // Convertir UV (0-1) en coordonnées canvas
  // V inversé car les UVs et le canvas ont des origines différentes
  return {
    x: uv.u * canvasWidth,
    y: (1 - uv.v) * canvasHeight // Inverser V pour correspondre au canvas
  }
}

/**
 * Convertit un clic sur le modèle 3D en coordonnées canvas 2D
 * @param {THREE.Intersection} intersection - L'intersection du raycast
 * @param {number} canvasWidth - Largeur du canvas 2D
 * @param {number} canvasHeight - Hauteur du canvas 2D
 * @returns {Object|null} - { x, y } coordonnées canvas ou null
 */
export const project3DClickToCanvas = (intersection, canvasWidth, canvasHeight) => {
  const uv = getUVFromIntersection(intersection)
  if (!uv) {
    console.warn('Impossible d\'obtenir les UVs de l\'intersection')
    return null
  }

  return UVToCanvasCoords(uv, canvasWidth, canvasHeight)
}


