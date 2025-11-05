/**
 * use3DTo2DProjection.js - Composable pour la projection 3D vers 2D
 * 
 * Ce composable gère la conversion des coordonnées 3D (clics sur le modèle)
 * vers des coordonnées 2D (position sur le canvas Fabric.js).
 * 
 * Il utilise les coordonnées UV (coordonnées de texture) du modèle 3D
 * pour mapper un point sur la surface 3D vers une position sur le canvas 2D.
 */

import * as THREE from 'three'

/**
 * Convertit un point d'intersection 3D en coordonnées UV du modèle
 * 
 * Quand on clique sur le modèle 3D, Three.js calcule l'intersection
 * et fournit les coordonnées UV du point d'intersection.
 * Les UVs sont des coordonnées normalisées (0-1) qui définissent
 * comment la texture 2D est mappée sur la surface 3D.
 * 
 * @param {THREE.Intersection} intersection - L'intersection du raycast
 * @returns {Object|null} - { u, v } coordonnées UV (0-1) ou null si impossible
 */
export const getUVFromIntersection = (intersection) => {
  if (!intersection || !intersection.face || !intersection.uv) {
    return null
  }

  // Three.js fournit directement les UVs à l'intersection
  // uv.x et uv.y sont des valeurs entre 0 et 1
  return {
    u: intersection.uv.x,
    v: intersection.uv.y
  }
}

/**
 * Convertit des coordonnées UV en coordonnées canvas 2D avec zone de travail
 * 
 * Cette fonction prend les coordonnées UV (0-1) et les convertit en pixels
 * sur le canvas, en tenant compte des zones exclues (haut/bas).
 * 
 * Les zones de travail permettent d'exclure certaines parties du modèle
 * (par exemple les manches ou le col d'un t-shirt) où on ne peut pas placer
 * d'éléments.
 * 
 * @param {Object} uv - { u, v } coordonnées UV (0-1)
 * @param {number} canvasWidth - Largeur du canvas en pixels
 * @param {number} canvasHeight - Hauteur du canvas en pixels
 * @param {number} workZoneTop - Pourcentage à exclure du haut (0-1, ex: 0.1 = 10%)
 * @param {number} workZoneBottom - Pourcentage à exclure du bas (0-1, ex: 0.1 = 10%)
 * @returns {Object|null} - { x, y } coordonnées canvas en pixels ou null si hors zone
 */
export const UVToCanvasCoords = (uv, canvasWidth, canvasHeight, workZoneTop = 0, workZoneBottom = 0) => {
  if (!uv || uv.u === undefined || uv.v === undefined) {
    return { x: 0, y: 0 }
  }

  // Calculer la zone active (entre workZoneTop et 1 - workZoneBottom)
  // Exemple: si workZoneTop = 0.1 et workZoneBottom = 0.1
  // La zone active est entre 0.1 et 0.9 (80% du canvas)
  const activeZoneTop = workZoneTop
  const activeZoneBottom = 1 - workZoneBottom
  const activeZoneHeight = activeZoneBottom - activeZoneTop

  // Si le point UV est en dehors de la zone active, ne pas le projeter
  if (uv.v < activeZoneTop || uv.v > activeZoneBottom) {
    return null // Point hors zone - ne peut pas placer d'élément ici
  }

  // Normaliser V dans la zone active
  // La coordonnée V dans la zone active (0.1-0.9) est convertie en 0-1
  const normalizedV = (uv.v - activeZoneTop) / activeZoneHeight

  // Convertir UV (0-1) en coordonnées canvas (pixels)
  // U est directement converti en X (horizontal)
  // V normalisé est converti en Y (vertical)
  // Les UVs sont déjà inversées dans la génération, donc on ne les inverse plus ici
  return {
    x: uv.u * canvasWidth,
    y: normalizedV * canvasHeight
  }
}

/**
 * Convertit un clic sur le modèle 3D en coordonnées canvas 2D avec zone de travail
 * 
 * Fonction principale qui combine getUVFromIntersection et UVToCanvasCoords
 * pour convertir directement un clic 3D en position 2D sur le canvas.
 * 
 * Flux :
 * 1. Extraire les UVs de l'intersection 3D
 * 2. Convertir les UVs en coordonnées canvas 2D
 * 3. Vérifier que le point est dans la zone active
 * 
 * @param {THREE.Intersection} intersection - L'intersection du raycast (clic 3D)
 * @param {number} canvasWidth - Largeur du canvas 2D en pixels
 * @param {number} canvasHeight - Hauteur du canvas 2D en pixels
 * @param {number} workZoneTop - Pourcentage à exclure du haut (0-1)
 * @param {number} workZoneBottom - Pourcentage à exclure du bas (0-1)
 * @returns {Object|null} - { x, y } coordonnées canvas en pixels ou null si hors zone/invalide
 */
export const project3DClickToCanvas = (intersection, canvasWidth, canvasHeight, workZoneTop = 0, workZoneBottom = 0) => {
  // Étape 1: Extraire les coordonnées UV de l'intersection
  const uv = getUVFromIntersection(intersection)
  if (!uv) {
    console.warn('Impossible d\'obtenir les UVs de l\'intersection')
    return null
  }

  // Étape 2: Convertir les UVs en coordonnées canvas 2D
  return UVToCanvasCoords(uv, canvasWidth, canvasHeight, workZoneTop, workZoneBottom)
}


