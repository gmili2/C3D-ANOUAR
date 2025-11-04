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
 * Convertit des coordonnées UV en coordonnées canvas 2D avec zone de travail
 * @param {Object} uv - { u, v } coordonnées UV (0-1)
 * @param {number} canvasWidth - Largeur du canvas
 * @param {number} canvasHeight - Hauteur du canvas
 * @param {number} workZoneTop - Pourcentage à exclure du haut (0-1)
 * @param {number} workZoneBottom - Pourcentage à exclure du bas (0-1)
 * @returns {Object} - { x, y } coordonnées canvas
 */
export const UVToCanvasCoords = (uv, canvasWidth, canvasHeight, workZoneTop = 0, workZoneBottom = 0) => {
  if (!uv || uv.u === undefined || uv.v === undefined) {
    return { x: 0, y: 0 }
  }

  // Calculer la zone active (entre workZoneTop et 1 - workZoneBottom)
  const activeZoneTop = workZoneTop
  const activeZoneBottom = 1 - workZoneBottom
  const activeZoneHeight = activeZoneBottom - activeZoneTop

  // Si le point UV est en dehors de la zone active, ne pas le projeter
  if (uv.v < activeZoneTop || uv.v > activeZoneBottom) {
    return null // Point hors zone
  }

  // Normaliser V dans la zone active (0-1 dans la zone active devient 0-1 sur le canvas)
  const normalizedV = (uv.v - activeZoneTop) / activeZoneHeight

  // Convertir UV (0-1) en coordonnées canvas
  // Les UVs sont déjà inversées dans la génération, donc on ne les inverse plus ici
  return {
    x: uv.u * canvasWidth,
    y: normalizedV * canvasHeight
  }
}

/**
 * Convertit un clic sur le modèle 3D en coordonnées canvas 2D avec zone de travail
 * @param {THREE.Intersection} intersection - L'intersection du raycast
 * @param {number} canvasWidth - Largeur du canvas 2D
 * @param {number} canvasHeight - Hauteur du canvas 2D
 * @param {number} workZoneTop - Pourcentage à exclure du haut (0-1)
 * @param {number} workZoneBottom - Pourcentage à exclure du bas (0-1)
 * @returns {Object|null} - { x, y } coordonnées canvas ou null
 */
export const project3DClickToCanvas = (intersection, canvasWidth, canvasHeight, workZoneTop = 0, workZoneBottom = 0) => {
  const uv = getUVFromIntersection(intersection)
  if (!uv) {
    console.warn('Impossible d\'obtenir les UVs de l\'intersection')
    return null
  }

  return UVToCanvasCoords(uv, canvasWidth, canvasHeight, workZoneTop, workZoneBottom)
}


