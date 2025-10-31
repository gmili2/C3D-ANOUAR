<template>
  <div v-if="show" class="mesh-selector-panel">
    <div class="panel-header">
      <h3>Pièces du Modèle 3D</h3>
      <button @click="close" class="close-btn">✕</button>
    </div>
    <div class="mesh-list">
      <div
        v-for="(meshInfo, index) in meshes"
        :key="index"
        class="mesh-item"
        :class="{ active: selectedMeshIndex === index }"
        @click="selectMesh(index)"
      >
        <div class="mesh-info">
          <span class="mesh-name">{{ meshInfo.name || `Pièce ${index + 1}` }}</span>
          <span class="mesh-details">{{ meshInfo.vertexCount }} sommets</span>
        </div>
        <div class="mesh-actions">
          <button @click.stop="highlightMesh(index)" class="highlight-btn">
            {{ highlightedMeshIndex === index ? '✨' : '🔍' }}
          </button>
          <button @click.stop="editMesh(index)" class="edit-btn">
            ✏️ Éditer
          </button>
        </div>
      </div>
    </div>
    <div class="panel-footer">
      <button @click="selectAll" class="btn-secondary">Sélectionner tout</button>
      <button @click="clearSelection" class="btn-secondary">Effacer</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  meshes: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'select-mesh', 'highlight-mesh', 'edit-mesh'])

const selectedMeshIndex = ref(-1)
const highlightedMeshIndex = ref(-1)

const selectMesh = (index) => {
  selectedMeshIndex.value = index
  emit('select-mesh', { index, mesh: props.meshes[index]?.mesh })
}

const highlightMesh = (index) => {
  highlightedMeshIndex.value = highlightedMeshIndex.value === index ? -1 : index
  emit('highlight-mesh', { index, mesh: props.meshes[index]?.mesh })
}

const editMesh = (index) => {
  selectMesh(index)
  emit('edit-mesh', { index, mesh: props.meshes[index]?.mesh })
}

const selectAll = () => {
  emit('select-mesh', { index: -1, mesh: null }) // -1 = tout
}

const clearSelection = () => {
  selectedMeshIndex.value = -1
  highlightedMeshIndex.value = -1
  emit('select-mesh', { index: -1, mesh: null })
}

const close = () => {
  emit('close')
}

watch(() => props.show, (newVal) => {
  if (!newVal) {
    selectedMeshIndex.value = -1
    highlightedMeshIndex.value = -1
  }
})
</script>

<style scoped>
.mesh-selector-panel {
  position: fixed;
  top: 80px;
  right: 20px;
  width: 320px;
  max-height: 600px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 15px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f9fafb;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #1f2937;
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: #e5e7eb;
}

.mesh-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.mesh-item {
  padding: 12px;
  margin-bottom: 8px;
  border: 2px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mesh-item:hover {
  border-color: #4f46e5;
  background: #f5f5ff;
}

.mesh-item.active {
  border-color: #4f46e5;
  background: #eef2ff;
}

.mesh-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.mesh-name {
  font-weight: 600;
  color: #1f2937;
  font-size: 14px;
}

.mesh-details {
  font-size: 12px;
  color: #6b7280;
}

.mesh-actions {
  display: flex;
  gap: 6px;
}

.highlight-btn,
.edit-btn {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.highlight-btn:hover,
.edit-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.edit-btn {
  background: #4f46e5;
  color: white;
  border-color: #4338ca;
}

.edit-btn:hover {
  background: #4338ca;
}

.panel-footer {
  padding: 15px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 10px;
  background: #f9fafb;
}

.btn-secondary {
  flex: 1;
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}
</style>


