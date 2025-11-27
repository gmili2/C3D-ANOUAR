# Exemple d'utilisation de TresCanvas

Ce guide montre comment utiliser TresCanvas de TresJS dans votre projet Vue 3.

## Installation

Les packages sont déjà ajoutés dans `package.json` :
- `@tresjs/core`: ^4.3.6
- `@tresjs/cientos`: ^4.3.1

Pour installer les dépendances :
```bash
npm install
```

## Exemple de base

Un exemple complet est disponible dans `src/components/TresCanvasExample.vue`.

Pour voir l'exemple en action, accédez à : `http://localhost:5173/tres-example`

## Structure d'un composant TresCanvas

```vue
<template>
  <TresCanvas clear-color="#82DBC5" window-size>
    <!-- Caméra -->
    <TresPerspectiveCamera :position="[3, 3, 3]" />
    
    <!-- Lumières -->
    <TresAmbientLight :intensity="0.5" />
    
    <!-- Objets 3D -->
    <TresMesh :position="[0, 0, 0]">
      <TresBoxGeometry :args="[1, 1, 1]" />
      <TresMeshStandardMaterial color="#4ECDC4" />
    </TresMesh>
  </TresCanvas>
</template>

<script setup>
import {
  TresCanvas,
  TresPerspectiveCamera,
  TresAmbientLight,
  TresMesh,
  TresBoxGeometry,
  TresMeshStandardMaterial
} from '@tresjs/core'
</script>
```

## Composants disponibles

### Géométries
- `TresBoxGeometry` - Cube
- `TresSphereGeometry` - Sphère
- `TresCylinderGeometry` - Cylindre
- `TresPlaneGeometry` - Plan
- `TresTorusGeometry` - Tore
- Et plus...

### Matériaux
- `TresMeshBasicMaterial` - Matériau basique
- `TresMeshStandardMaterial` - Matériau standard (avec ombres)
- `TresMeshPhongMaterial` - Matériau Phong
- Et plus...

### Lumières
- `TresAmbientLight` - Lumière ambiante
- `TresDirectionalLight` - Lumière directionnelle
- `TresPointLight` - Lumière ponctuelle
- `TresSpotLight` - Projecteur

### Contrôles (depuis @tresjs/cientos)
- `OrbitControls` - Contrôles orbitaux de caméra
- `TransformControls` - Contrôles de transformation
- Et plus...

## Documentation

Pour plus d'informations, consultez la documentation officielle :
- https://docs.tresjs.org/

