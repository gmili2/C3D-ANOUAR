import { createRouter, createWebHistory } from 'vue-router'
import DesignStudio from './DesignStudio.vue'

const routes = [
  {
    path: '/',
    name: 'DesignStudio',
    component: DesignStudio
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

