# Configuration OrbitControls - Guide d'utilisation

## Vue d'ensemble

Ce guide explique comment configurer les paramètres de la caméra et des contrôles OrbitControls dans `ThreeScene.vue`.

## Paramètres disponibles

### 1. **minDistance** et **maxDistance**

Contrôlent la distance de zoom de la caméra par rapport au modèle 3D.

```javascript
const cameraMinDistance = ref(37); // Distance minimale (zoom max)
const cameraMaxDistance = ref(50); // Distance maximale (zoom min)
```

- **minDistance** : La caméra ne peut pas s'approcher plus près que cette valeur
- **maxDistance** : La caméra ne peut pas s'éloigner plus loin que cette valeur
- **Unités** : Unités Three.js (généralement en mètres)

### 2. **minPolarAngle** et **maxPolarAngle**

Contrôlent l'angle vertical de rotation de la caméra.

```javascript
const cameraMinPolarAngle = ref(1.37); // ~78.5° en radians
const cameraMaxPolarAngle = ref(1.57); // ~90° en radians
```

- **Angle polaire** : 0 = vue du dessus, π/2 (1.57) = vue horizontale, π = vue du dessous
- **Unités** : Radians
- **Conversion** : Degrés × (π/180) = Radians

#### Exemples d'angles polaires :

- `0` rad = 0° (vue du dessus)
- `π/4` (0.785) rad ≈ 45° (vue diagonale haute)
- `π/2` (1.57) rad = 90° (vue horizontale)
- `3π/4` (2.356) rad ≈ 135° (vue diagonale basse)
- `π` (3.14) rad = 180° (vue du dessous)

### 3. **position**

Position initiale de la caméra dans l'espace 3D.

```javascript
camera.position.set(0, 16, 29);
```

- **x** : Position horizontale (gauche/droite)
- **y** : Position verticale (haut/bas)
- **z** : Profondeur (avant/arrière)

### 4. **target**

Point vers lequel la caméra regarde.

```javascript
const cameraTarget = ref({ x: 0, y: 9, z: 0 });
```

- Le modèle 3D est généralement centré à l'origine (0, 0, 0)
- Ajuster le target permet de regarder un point spécifique du modèle

### 5. **enableZoom**

Active ou désactive le zoom avec la molette de la souris.

```vue
:enable-zoom="true"
```

## Configuration complète

Voici un exemple de configuration complète dans `ThreeScene.vue` :

```javascript
// Dans la section <script setup>
const cameraDamping = ref(0.05);
const cameraTarget = ref({ x: 0, y: 9, z: 0 });
const cameraMinDistance = ref(37);
const cameraMaxDistance = ref(50);
const cameraMinPolarAngle = ref(1.37); // ~78.5°
const cameraMaxPolarAngle = ref(1.57); // ~90°
const orbitControlsEnabled = ref(true);

// Dans onTresReady
camera.position.set(0, 16, 29);
```

```vue
<!-- Dans le template -->
<OrbitControls
  :damping-factor="cameraDamping"
  :target="[cameraTarget.x, cameraTarget.y, cameraTarget.z]"
  :min-distance="cameraMinDistance"
  :max-distance="cameraMaxDistance"
  :min-polar-angle="cameraMinPolarAngle"
  :max-polar-angle="cameraMaxPolarAngle"
  :enable-pan="false"
  :enable-rotate="orbitControlsEnabled"
  :enable-zoom="true"
/>
```

## Cas d'usage courants

### Vue horizontale uniquement (pas de rotation verticale)

```javascript
const cameraMinPolarAngle = ref(Math.PI / 2); // 90°
const cameraMaxPolarAngle = ref(Math.PI / 2); // 90°
```

### Vue libre (rotation complète)

```javascript
const cameraMinPolarAngle = ref(0); // 0°
const cameraMaxPolarAngle = ref(Math.PI); // 180°
```

### Zoom fixe (pas de zoom)

```javascript
const cameraMinDistance = ref(40)
const cameraMaxDistance = ref(40)
// OU
:enable-zoom="false"
```

### Vue de dessus uniquement

```javascript
const cameraMinPolarAngle = ref(0);
const cameraMaxPolarAngle = ref(0);
camera.position.set(0, 50, 0); // Caméra au-dessus
```

## Conseils

1. **Tester les valeurs** : Ajustez progressivement les valeurs pour trouver la vue idéale
2. **Cohérence** : Assurez-vous que `minDistance < maxDistance` et `minPolarAngle < maxPolarAngle`
3. **Position initiale** : La position de la caméra doit être dans la plage `[minDistance, maxDistance]`
4. **Damping** : Une valeur de damping entre 0.05 et 0.1 donne un mouvement fluide

## Débogage

Si la caméra ne se comporte pas comme prévu :

1. Vérifiez que `enable-zoom` et `enable-rotate` sont à `true`
2. Vérifiez que la position initiale est dans la plage de distance autorisée
3. Vérifiez que les angles polaires sont en radians, pas en degrés
4. Consultez la console pour les erreurs Three.js

## Ressources

- [Documentation Three.js OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls)
- [Documentation TresJS](https://tresjs.org/)
