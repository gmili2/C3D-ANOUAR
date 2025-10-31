import { createRouter, createWebHistory } from 'vue-router'
import Home from './Home.vue'
import ObjViewer from './ObjViewer.vue'
import DesignStudio from './DesignStudio.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/obj-viewer',
    name: 'ObjViewer',
    component: ObjViewer
  },
  {
    path: '/design-studio',
    name: 'DesignStudio',
    component: DesignStudio
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

