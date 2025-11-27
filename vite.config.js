import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { templateCompilerOptions } from '@tresjs/core'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          ...templateCompilerOptions,
          isCustomElement: (tag) => tag.startsWith('tres-'),
        }
      }
    })
  ],
  
  // Base path pour permettre l'ouverture directe du fichier (chemins relatifs)
  // Utilisez './' pour ouvrir directement index.html, ou '/' pour un serveur
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  
  // Optimisations pour la production
  build: {
    // Minification optimisée
    minify: 'esbuild', // Plus rapide que terser
    
    // Code splitting optimisé
    rollupOptions: {
      output: {
        // Séparer les vendors (Three.js, Fabric.js) pour meilleur cache
        manualChunks: {
          'three': ['three'],
          'fabric': ['fabric'],
          'vue-vendor': ['vue', 'vue-router']
        },
        // Optimiser les noms de fichiers pour le cache
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
      }
    },
    
    // Augmenter la taille limite des chunks (Three.js est volumineux)
    chunkSizeWarningLimit: 1000,
    
    // Optimisations de performance
    target: 'esnext', // Utiliser les dernières fonctionnalités JS
    sourcemap: false, // Pas de source maps en production (gain de taille)
    
    // Compression des assets
    assetsInlineLimit: 4096, // Inline les petits assets (< 4KB)
  },
  
  // Optimisations pour le développement aussi
  optimizeDeps: {
    include: ['three', 'fabric', 'vue', 'vue-router'],
    exclude: []
  }
})

