<template>
  <!-- Composant invisible qui gère la mise à jour des textures -->
</template>

<script setup>
import { onMounted, onUnmounted, watch } from 'vue'
import { useCanvasTextureStore } from '../composables/useCanvasTexture'

const props = defineProps({
  texture: {
    type: Object, // THREE.CanvasTexture
    default: null
  },
  renderer: {
    type: Object, // THREE.WebGLRenderer
    default: null
  },
  scene: {
    type: Object, // THREE.Scene
    default: null
  },
  camera: {
    type: Object, // THREE.Camera
    default: null
  }
})

const { render2D, resetTextureUpdate } = useCanvasTextureStore()

let isActive = false

const checkAndUpdateTexture = () => {
  if (!props.texture || !isActive) return

  // Vérifier le flag render2D
  if (render2D.value) {
    // Mettre à jour la texture
    props.texture.needsUpdate = true
    
    // Forcer un rendu si nécessaire (pour voir les changements immédiatement)
    if (props.renderer && props.scene && props.camera) {
      props.renderer.render(props.scene, props.camera)
    }

    // Réinitialiser le flag
    resetTextureUpdate()
  }
}

// Surveiller le flag render2D
watch(render2D, (newValue) => {
  if (newValue && props.texture) {
    checkAndUpdateTexture()
  }
})

onMounted(() => {
  isActive = true
  // Démarrer la surveillance
  const interval = setInterval(() => {
    checkAndUpdateTexture()
  }, 50) // Vérifier toutes les 50ms pour la réactivité

  // Stocker l'interval pour cleanup
  props._textureUpdateInterval = interval
})

onUnmounted(() => {
  isActive = false
  if (props._textureUpdateInterval) {
    clearInterval(props._textureUpdateInterval)
  }
})
</script>


