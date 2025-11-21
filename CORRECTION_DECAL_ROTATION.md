# Correction du Problème de Rotation du Decal

## 🐛 Problèmes Identifiés

1. **L'objet dans tempCanvas n'a pas la même rotation** que l'objet original
2. **Le Decal n'est pas positionné exactement** au même endroit que l'élément

## ✅ Solution

### Fichier: `src/DesignStudio.vue`

### Ligne 757-768: Ajouter la rotation

**AVANT** (code actuel):

```javascript
// Charger et dessiner l'image
const img = new Image()
img.onload = () => {
  ctx.save()
  ctx.translate(centerX, centerY)

  // Dessiner l'image centrée
  const imgWidth = objWidth * zoom
  const imgHeight = objHeight * zoom
  ctx.drawImage(img, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight)

  ctx.restore()
```

**APRÈS** (code corrigé):

```javascript
// Charger et dessiner l'image
const img = new Image()
const currentAngle = activeObject.angle || 0  // ✅ NOUVEAU: Récupérer l'angle

img.onload = () => {
  ctx.save()
  ctx.translate(centerX, centerY)

  // ✅ NOUVEAU: Appliquer la rotation de l'objet
  ctx.rotate(currentAngle * Math.PI / 180)

  // Dessiner l'image centrée (elle sera automatiquement tournée)
  const imgWidth = objWidth * zoom
  const imgHeight = objHeight * zoom
  ctx.drawImage(img, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight)

  ctx.restore()
```

### Ligne 776-810: Dessiner les contrôles avec rotation

**AVANT** (code actuel):

```javascript
const drawControlsAndFinish = () => {
  const halfWidth = (objWidth * zoom) / 2
  const halfHeight = (objHeight * zoom) / 2
  const cornerSize = 12
  const mtrSize = 12

  // Style des contrôles
  ctx.strokeStyle = '#178efa'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = 2

  // Coins
  const corners = [
    { x: centerX - halfWidth, y: centerY - halfHeight }, // tl
    { x: centerX + halfWidth, y: centerY - halfHeight }, // tr
    { x: centerX - halfWidth, y: centerY + halfHeight }, // bl
    { x: centerX + halfWidth, y: centerY + halfHeight }  // br
  ]

  corners.forEach(corner => {
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#178efa'
    ctx.fillRect(corner.x - cornerSize / 2, corner.y - cornerSize / 2, cornerSize, cornerSize)
    ctx.strokeRect(corner.x - cornerSize / 2, corner.y - cornerSize / 2, cornerSize, cornerSize)
  })

  // MTR (cercle)
  const mtrY = centerY - halfHeight - mtrOffset
  ctx.beginPath()
  ctx.arc(centerX, mtrY, mtrSize / 2, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#178efa'
  ctx.stroke()
```

**APRÈS** (code corrigé):

```javascript
const drawControlsAndFinish = () => {
  const halfWidth = (objWidth * zoom) / 2
  const halfHeight = (objHeight * zoom) / 2
  const cornerSize = 12
  const mtrSize = 12

  // Style des contrôles
  ctx.strokeStyle = '#178efa'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = 2

  // ✅ NOUVEAU: Appliquer la même rotation pour les contrôles
  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.rotate(currentAngle * Math.PI / 180)

  // Coins (positions relatives au centre, seront tournées automatiquement)
  const corners = [
    { x: -halfWidth, y: -halfHeight }, // tl
    { x: halfWidth, y: -halfHeight },  // tr
    { x: -halfWidth, y: halfHeight },  // bl
    { x: halfWidth, y: halfHeight }    // br
  ]

  corners.forEach(corner => {
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#178efa'
    ctx.fillRect(corner.x - cornerSize / 2, corner.y - cornerSize / 2, cornerSize, cornerSize)
    ctx.strokeRect(corner.x - cornerSize / 2, corner.y - cornerSize / 2, cornerSize, cornerSize)
  })

  // MTR (cercle) - position relative
  const mtrY = -halfHeight - mtrOffset
  ctx.beginPath()
  ctx.arc(0, mtrY, mtrSize / 2, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#178efa'
  ctx.stroke()

  // Ligne mtr - position relative
  ctx.beginPath()
  ctx.moveTo(0, -halfHeight)
  ctx.lineTo(0, mtrY + mtrSize / 2)
  ctx.strokeStyle = '#178efa'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.restore()  // ✅ NOUVEAU: Restaurer l'état
```

## 📊 Explication

### Pourquoi ça ne fonctionnait pas ?

1. **L'objet était dessiné sans rotation** dans le tempCanvas
2. **Les contrôles étaient dessinés en coordonnées absolues** au lieu de relatives

### Comment ça fonctionne maintenant ?

1. **On récupère l'angle actuel** de l'objet: `currentAngle = activeObject.angle`
2. **On applique la rotation** avant de dessiner: `ctx.rotate(currentAngle * Math.PI / 180)`
3. **On dessine les contrôles en coordonnées relatives** au centre
4. **Tout tourne ensemble** automatiquement !

### Résultat

```
AVANT:
Objet tourné de 45° → tempCanvas: objet à 0° ❌

APRÈS:
Objet tourné de 45° → tempCanvas: objet à 45° ✅
```

## 🧪 Test

1. Créez un rectangle
2. Tournez-le de 45° manuellement
3. Commencez une rotation 3D
4. Vérifiez que le Decal a la même orientation que l'objet ✅
