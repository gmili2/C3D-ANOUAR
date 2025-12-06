import { ref } from 'vue'
import * as THREE from 'three'

const render2D = ref(false)

let textureUpdateScheduled = false
let rafId = null

let immediateMode = false

export const useCanvasTextureStore = () => {
  const requestTextureUpdate = () => {
    if (textureUpdateScheduled && !immediateMode) return
    
    textureUpdateScheduled = true
    
    if (rafId) cancelAnimationFrame(rafId)
    
    rafId = requestAnimationFrame(() => {
      render2D.value = true
      textureUpdateScheduled = false
      immediateMode = false
      rafId = null
    })
  }

  const requestTextureUpdateImmediate = () => {
    immediateMode = true
    if (rafId) cancelAnimationFrame(rafId)
    render2D.value = true
    textureUpdateScheduled = false
    rafId = null
  }

  const resetTextureUpdate = () => {
    render2D.value = false
    textureUpdateScheduled = false
    immediateMode = false
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  return {
    render2D,
    requestTextureUpdate,
    requestTextureUpdateImmediate,
    resetTextureUpdate
  }
}

export const setupCanvasTexture = (canvas, materials) => {
  if (!canvas) {
    throw new Error('Canvas HTML requis pour créer la texture')
  }

  const texture = new THREE.CanvasTexture(canvas)
  
  if (canvas.width && canvas.height) {
  }
  
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.flipY = true
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.format = THREE.RGBAFormat
  texture.needsUpdate = true

  const materialsArray = Array.isArray(materials) ? materials : [materials]
  
  materialsArray.forEach(material => {
    if (material) {
      if (material instanceof THREE.MeshStandardMaterial || 
          material instanceof THREE.MeshPhongMaterial ||
          material instanceof THREE.MeshBasicMaterial) {
        material.map = texture
        material.transparent = true
        material.opacity = 0.9
        material.alphaTest = 0.01
        material.needsUpdate = true
      }
    }
  })

  return texture
}

export const updateTexture = (texture) => {
  if (!texture || !(texture instanceof THREE.CanvasTexture)) {
    return
  }

  texture.needsUpdate = true
}

export const applyTextureToMesh = (mesh, texture) => {
  if (!mesh || !texture) {
    return
  }

  let meshCount = 0
  let materialCount = 0

  mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount++
      const meshName = child.name || `Mesh_${meshCount}`
      
      if (Array.isArray(child.material)) {
        child.material.forEach((mat, idx) => {
          materialCount++
          if (mat instanceof THREE.MeshStandardMaterial || 
              mat instanceof THREE.MeshPhongMaterial ||
              mat instanceof THREE.MeshBasicMaterial) {
            mat.map = texture
            mat.transparent = true
            mat.opacity = 0.9
            mat.alphaTest = 0.01
            mat.needsUpdate = true
          } else {
            child.material[idx] = new THREE.MeshStandardMaterial({
              map: texture,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.9,
              alphaTest: 0.01
            })
          }
        })
      } else {
        materialCount++
        if (child.material instanceof THREE.MeshStandardMaterial || 
            child.material instanceof THREE.MeshPhongMaterial ||
            child.material instanceof THREE.MeshBasicMaterial) {
          child.material.map = texture
          child.material.transparent = true
          child.material.opacity = 0.9
          child.material.alphaTest = 0.01
          child.material.needsUpdate = true
        } else {
          child.material = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            alphaTest: 0.01
          })
        }
      }
    }
  })
}

