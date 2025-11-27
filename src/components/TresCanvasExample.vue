<template>
  <div class="tres-canvas-example">
    <div class="header-nav">
      <router-link to="/" class="back-link">← Retour au Studio</router-link>
      <h2>Exemple TresCanvas</h2>
    </div>
    
    <!-- TresCanvas avec une scène 3D simple -->
    <TresCanvas
      ref="tresCanvasRef"
      clear-color="#82DBC5"
      window-size
    >
      <!-- Caméra -->
      <TresPerspectiveCamera
        :position="[3, 3, 3]"
        :fov="45"
        :look-at="[0, 0, 0]"
      />
      
      <!-- Lumières -->
      <TresAmbientLight :intensity="0.5" />
      <TresDirectionalLight
        :position="[10, 10, 5]"
        :intensity="1"
      />
      
      <!-- Contrôles de caméra -->
      <OrbitControls />
      
      <!-- Objets 3D -->
      
      <!-- Cube avec rotation -->
      <TresMesh
        :position="[-2, 0, 0]"
        :rotation="[rotation, rotation * 0.5, 0]"
      >
        <TresBoxGeometry :args="[1, 1, 1]" />
        <TresMeshStandardMaterial color="#4ECDC4" />
      </TresMesh>
      
      <!-- Sphère -->
      <TresMesh :position="[0, 0, 0]">
        <TresSphereGeometry :args="[1, 32, 32]" />
        <TresMeshStandardMaterial color="#FF6B6B" />
      </TresMesh>
      
      <!-- Cylindre -->
      <TresMesh
        :position="[2, 0, 0]"
        :rotation="[0, rotation, 0]"
      >
        <TresCylinderGeometry :args="[0.8, 0.8, 1.5, 32]" />
        <TresMeshStandardMaterial color="#FFE66D" />
      </TresMesh>
      
      <!-- Plan -->
      <TresMesh
        :rotation="[-Math.PI / 2, 0, 0]"
        :position="[0, -1, 0]"
      >
        <TresPlaneGeometry :args="[10, 10]" />
        <TresMeshStandardMaterial color="#95E1D3" />
      </TresMesh>
      
      <!-- Grille helper -->
      <TresGridHelper :args="[10, 10]" />
    </TresCanvas>
    
    <!-- Contrôles UI -->
    <div class="controls">
      <button @click="toggleRotation">
        {{ isRotating ? 'Arrêter' : 'Démarrer' }} la rotation
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'

// Références
const tresCanvasRef = ref(null)
const rotation = ref(0)
const isRotating = ref(true)

let animationFrameId = null

// Animation de rotation
const animate = () => {
  if (isRotating.value) {
    rotation.value += 0.01
  }
  animationFrameId = requestAnimationFrame(animate)
}

const toggleRotation = () => {
  isRotating.value = !isRotating.value
}

onMounted(() => {
  animate()
})

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
})
</script>

<style scoped>
.tres-canvas-example {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f0f0f0;
}

.header-nav h2 {
  margin: 0;
}

.back-link {
  padding: 0.5rem 1rem;
  background: #6c757d;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 0.9rem;
  transition: background 0.2s;
}

.back-link:hover {
  background: #5a6268;
}

.tres-canvas-example h2 {
  padding: 1rem;
  margin: 0;
  background: #f0f0f0;
}

.controls {
  padding: 1rem;
  background: #f0f0f0;
}

.controls button {
  padding: 0.5rem 1rem;
  background: #4ECDC4;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.controls button:hover {
  background: #45b8b0;
}
</style>

