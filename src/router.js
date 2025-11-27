import { createRouter, createWebHistory } from 'vue-router'
import DesignStudio from './DesignStudio.vue'
import TresCanvasExample from './components/TresCanvasExample.vue'

const routes = [
  {
    path: '/',
    name: 'DesignStudio',
    component: DesignStudio
  },
  {
    path: '/tres-example',
    name: 'TresCanvasExample',
    component: TresCanvasExample
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

