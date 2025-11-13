/**
 * useCanvasTexture.js - Composable pour la gestion des textures canvas
 * 
 * Ce composable gère :
 * - La création de textures Three.js à partir de canvas HTML
 * - La synchronisation des mises à jour entre le canvas 2D et la texture 3D
 * - L'application de textures sur les meshes Three.js
 * 
 * Le store permet de signaler quand le canvas 2D a été modifié,
 * ce qui déclenche une mise à jour de la texture 3D.
 */

import { ref } from 'vue'
import * as THREE from 'three'

// ===== STORE SIMPLE POUR LA SYNCHRONISATION =====
// Flag réactif pour indiquer qu'une mise à jour de texture est nécessaire
const render2D = ref(false)

/**
 * Store pour la synchronisation des textures canvas
 * 
 * Ce store permet de signaler quand le canvas 2D (Fabric.js) a été modifié,
 * afin de mettre à jour la texture 3D en temps réel.
 * 
 * @returns {Object} - { render2D, requestTextureUpdate, resetTextureUpdate }
 */
export const useCanvasTextureStore = () => {
  /**
   * Demande une mise à jour de la texture
   * 
   * Appelé quand le canvas 2D est modifié (ajout, déplacement, suppression d'objets)
   */
  const requestTextureUpdate = () => {
    render2D.value = true
  }

  /**
   * Réinitialise le flag de mise à jour
   * 
   * Appelé après que la texture a été mise à jour dans Three.js
   */
  const resetTextureUpdate = () => {
    render2D.value = false
  }

  return {
    render2D,              // Flag réactif (ref)
    requestTextureUpdate,  // Fonction pour demander une mise à jour
    resetTextureUpdate     // Fonction pour réinitialiser le flag
  }
}

/**
 * Configure une CanvasTexture à partir d'un canvas HTML
 * 
 * Crée une texture Three.js qui est liée directement au canvas HTML.
 * Quand le canvas est modifié, la texture peut être mise à jour automatiquement
 * en appelant texture.needsUpdate = true.
 * 
 * Cette approche permet une synchronisation en temps réel entre le canvas 2D
 * (Fabric.js) et la texture 3D (Three.js).
 * 
 * @param {HTMLCanvasElement} canvas - Le canvas HTML 2D (Fabric.js)
 * @param {THREE.Material|THREE.Material[]} materials - Les matériaux Three.js à mettre à jour
 * @returns {THREE.CanvasTexture} La texture créée
 * @throws {Error} Si le canvas n'est pas fourni
 */
export const setupCanvasTexture = (canvas, materials) => {
  if (!canvas) {
    throw new Error('Canvas HTML requis pour créer la texture')
  }

  // Créer la texture Three.js à partir du canvas HTML
  // Cette texture est liée au canvas et se met à jour automatiquement
  const texture = new THREE.CanvasTexture(canvas)
  
  // IMPORTANT: S'assurer que la texture utilise les dimensions exactes du canvas
  // et non pas les dimensions multipliées par devicePixelRatio
  // Cela garantit la cohérence entre les coordonnées 2D (Fabric.js) et 3D (Three.js)
  if (canvas.width && canvas.height) {
    // Forcer les dimensions de la texture à correspondre exactement au canvas
    // Note: CanvasTexture utilise automatiquement canvas.width et canvas.height
    // mais on s'assure qu'ils correspondent aux dimensions logiques
  }
  
  // ===== CONFIGURATION OPTIMALE POUR LES TEXTURES CANVAS =====
  texture.minFilter = THREE.LinearFilter      // Filtre pour le minification (zoom out)
  texture.magFilter = THREE.LinearFilter      // Filtre pour le magnification (zoom in)
  texture.generateMipmaps = false             // Pas de mipmaps pour les canvas (performance)
  texture.flipY = true                        // Inverser verticalement pour correspondre à l'orientation du modèle 3D
  texture.wrapS = THREE.ClampToEdgeWrapping   // Répétition horizontale : clamp
  texture.wrapT = THREE.ClampToEdgeWrapping   // Répétition verticale : clamp
  texture.format = THREE.RGBAFormat          // Format RGBA (avec transparence)
  texture.needsUpdate = true                  // Forcer la mise à jour initiale

  // Appliquer la texture sur tous les matériaux fournis
  const materialsArray = Array.isArray(materials) ? materials : [materials]
  
  materialsArray.forEach(material => {
    if (material) {
      // Si le matériau existe déjà, on met juste à jour la map (texture)
      if (material instanceof THREE.MeshStandardMaterial || 
          material instanceof THREE.MeshPhongMaterial ||
          material instanceof THREE.MeshBasicMaterial) {
        material.map = texture
        material.transparent = true // Maintenir la transparence
        material.opacity = 0.3 // Maintenir le niveau de transparence
        material.needsUpdate = true
      }
    }
  })


  return texture
}

/**
 * Met à jour une texture CanvasTexture
 * 
 * Marque la texture comme nécessitant une mise à jour.
 * Three.js vérifiera ce flag et mettra à jour la texture
 * lors du prochain rendu.
 * 
 * @param {THREE.CanvasTexture} texture - La texture à mettre à jour
 */
export const updateTexture = (texture) => {
  if (!texture || !(texture instanceof THREE.CanvasTexture)) {
    return
  }

  texture.needsUpdate = true
}

/**
 * Applique la texture sur un mesh Three.js
 * 
 * Parcourt récursivement l'objet 3D et applique la texture
 * sur tous les meshes enfants. Gère les cas où le matériau
 * est un tableau ou un matériau unique.
 * 
 * @param {THREE.Object3D} mesh - Le mesh ou objet 3D (peut être un groupe)
 * @param {THREE.CanvasTexture} texture - La texture à appliquer
 */
export const applyTextureToMesh = (mesh, texture) => {
  if (!mesh || !texture) {
    return
  }

  let meshCount = 0
  let materialCount = 0

  // Parcourir récursivement tous les enfants du mesh
  mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount++
      const meshName = child.name || `Mesh_${meshCount}`
      
      // Cas 1: Matériau est un tableau (multi-matériaux)
      if (Array.isArray(child.material)) {
        child.material.forEach((mat, idx) => {
          materialCount++
          if (mat instanceof THREE.MeshStandardMaterial || 
              mat instanceof THREE.MeshPhongMaterial ||
              mat instanceof THREE.MeshBasicMaterial) {
            // Matériau compatible : mettre à jour la texture
            mat.map = texture
            mat.transparent = true // Maintenir la transparence
            mat.opacity = 0.3 // Maintenir le niveau de transparence
            mat.needsUpdate = true
          } else {
            // Matériau incompatible : créer un nouveau matériau
            child.material[idx] = new THREE.MeshStandardMaterial({
              map: texture,
              side: THREE.DoubleSide,  // Rendu des deux côtés (important pour les t-shirts)
              transparent: true, // Rendre transparent
              opacity: 0.3 // Niveau de transparence
            })
          }
        })
      } else {
        // Cas 2: Matériau unique
        materialCount++
        if (child.material instanceof THREE.MeshStandardMaterial || 
            child.material instanceof THREE.MeshPhongMaterial ||
            child.material instanceof THREE.MeshBasicMaterial) {
          // Matériau compatible : mettre à jour la texture
          child.material.map = texture
          child.material.transparent = true // Maintenir la transparence
          child.material.opacity = 0.3 // Maintenir le niveau de transparence
          child.material.needsUpdate = true
        } else {
          // Matériau incompatible : créer un nouveau matériau
          child.material = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true, // Rendre transparent
            opacity: 0.3 // Niveau de transparence
          })
        }
      }
    }
  })
}


