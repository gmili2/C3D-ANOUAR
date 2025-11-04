import { ref } from 'vue'
import * as THREE from 'three'

// Store simple pour la synchronisation
const render2D = ref(false)

export const useCanvasTextureStore = () => {
  const requestTextureUpdate = () => {
    render2D.value = true
  }

  const resetTextureUpdate = () => {
    render2D.value = false
  }

  return {
    render2D,
    requestTextureUpdate,
    resetTextureUpdate
  }
}

/**
 * Configure une CanvasTexture à partir d'un canvas HTML
 * @param {HTMLCanvasElement} canvas - Le canvas HTML 2D
 * @param {THREE.Material|THREE.Material[]} materials - Les matériaux Three.js à mettre à jour
 * @returns {THREE.CanvasTexture} La texture créée
 */
export const setupCanvasTexture = (canvas, materials) => {
  if (!canvas) {
    throw new Error('Canvas HTML requis pour créer la texture')
  }

  // Créer la texture à partir du canvas
  const texture = new THREE.CanvasTexture(canvas)
  
  // Configuration optimale pour les textures canvas
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false // Pas de mipmaps pour les canvas (performance)
  texture.flipY = false
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.format = THREE.RGBAFormat
  texture.needsUpdate = true

  // Appliquer la texture sur les matériaux
  const materialsArray = Array.isArray(materials) ? materials : [materials]
  
  materialsArray.forEach(material => {
    if (material) {
      // Si le matériau existe déjà, on met juste à jour la map
      if (material instanceof THREE.MeshStandardMaterial || 
          material instanceof THREE.MeshPhongMaterial ||
          material instanceof THREE.MeshBasicMaterial) {
        material.map = texture
        material.needsUpdate = true
      }
    }
  })

  console.log('CanvasTexture configurée avec succès', {
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    materialsCount: materialsArray.length
  })

  return texture
}

/**
 * Met à jour une texture CanvasTexture
 * @param {THREE.CanvasTexture} texture - La texture à mettre à jour
 */
export const updateTexture = (texture) => {
  if (!texture || !(texture instanceof THREE.CanvasTexture)) {
    console.warn('Texture invalide pour la mise à jour')
    return
  }

  texture.needsUpdate = true
}

/**
 * Applique la texture sur un mesh Three.js
 * @param {THREE.Object3D} mesh - Le mesh ou objet 3D
 * @param {THREE.CanvasTexture} texture - La texture à appliquer
 */
export const applyTextureToMesh = (mesh, texture) => {
  if (!mesh || !texture) return

  mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (Array.isArray(child.material)) {
        child.material.forEach(mat => {
          if (mat instanceof THREE.MeshStandardMaterial || 
              mat instanceof THREE.MeshPhongMaterial ||
              mat instanceof THREE.MeshBasicMaterial) {
            mat.map = texture
            mat.needsUpdate = true
          } else {
            // Créer un nouveau matériau si nécessaire
            child.material = new THREE.MeshStandardMaterial({
              map: texture,
              side: THREE.DoubleSide
            })
          }
        })
      } else {
        if (child.material instanceof THREE.MeshStandardMaterial || 
            child.material instanceof THREE.MeshPhongMaterial ||
            child.material instanceof THREE.MeshBasicMaterial) {
          child.material.map = texture
          child.material.needsUpdate = true
        } else {
          child.material = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide
          })
        }
      }
    }
  })
}


