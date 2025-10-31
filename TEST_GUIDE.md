# 🧪 Guide de Test - Synchronisation Canvas 2D ↔ 3D

## 📋 Prérequis

1. Serveur de développement lancé : `npm run dev`
2. Navigateur ouvert sur : `http://localhost:5173/design-studio`
3. Console développeur ouverte (F12)

## ✅ Tests à Effectuer

### Test 1 : Configuration Initiale
**Objectif** : Vérifier que le canvas et le modèle sont connectés

1. Uploader un fichier `.obj` via le bouton "📁 Uploader un modèle 3D (.obj)"
2. Vérifier dans la console :
   - `"Modèle 3D chargé avec succès"`
   - `"Canvas Fabric.js prêt"` ou `"Canvas ready"`
   - `"Texture partagée configurée avec succès"` OU `"CanvasTexture configurée avec succès"`

**✅ Succès si** : Pas d'erreurs dans la console

---

### Test 2 : Ajout de Texte
**Objectif** : Vérifier la mise à jour en temps réel du texte

1. Cliquer sur "Ajouter du texte"
2. Observer :
   - Le texte apparaît sur le canvas 2D
   - **ATTENTION** : Le texte doit apparaître sur le modèle 3D en moins de 200ms

**✅ Succès si** : Le texte est visible sur le modèle 3D immédiatement

**❌ Échec si** : Le texte n'apparaît pas sur le modèle 3D

---

### Test 3 : Ajout de Cercle
**Objectif** : Vérifier la mise à jour des formes

1. Cliquer sur "Cercle"
2. Observer :
   - Le cercle apparaît sur le canvas 2D
   - Le cercle apparaît sur le modèle 3D

**✅ Succès si** : Le cercle est visible sur le modèle 3D

---

### Test 4 : Ajout d'Image
**Objectif** : Vérifier que les images sont aussi synchronisées

1. Cliquer sur "Ajouter une image"
2. Sélectionner une image
3. Observer :
   - L'image apparaît sur le canvas 2D
   - L'image apparaît sur le modèle 3D

**✅ Succès si** : L'image est visible sur le modèle 3D

---

### Test 5 : Dessin Libre
**Objectif** : Vérifier la synchronisation en temps réel du dessin

1. S'assurer que "Mode dessin" est activé
2. Dessiner quelque chose sur le canvas 2D
3. Observer :
   - Le dessin apparaît en temps réel sur le canvas 2D
   - Le dessin apparaît sur le modèle 3D pendant que vous dessinez

**✅ Succès si** : Le dessin est visible en temps réel sur le modèle 3D

---

### Test 6 : Déplacement d'Objet
**Objectif** : Vérifier la mise à jour pendant le déplacement

1. Ajouter un rectangle sur le canvas
2. Le sélectionner et le déplacer avec la souris
3. Observer :
   - Pendant le déplacement, le rectangle bouge sur le canvas 2D
   - Le rectangle bouge aussi sur le modèle 3D en temps réel

**✅ Succès si** : Les deux vues sont synchronisées pendant le déplacement

---

### Test 7 : Modification de Propriétés
**Objectif** : Vérifier que les changements de couleur/taille sont reflétés

1. Sélectionner un objet sur le canvas 2D
2. Changer sa couleur via l'inspecteur Fabric.js (si disponible)
3. Ou changer la couleur du pinceau et ajouter un nouvel élément
4. Observer :
   - Les changements apparaissent sur le modèle 3D

**✅ Succès si** : Les modifications sont visibles en 3D

---

### Test 8 : Suppression d'Objet
**Objectif** : Vérifier que la suppression est reflétée

1. Sélectionner un objet
2. Appuyer sur `Suppr` ou `Delete`
3. Observer :
   - L'objet disparaît du canvas 2D
   - L'objet disparaît du modèle 3D

**✅ Succès si** : La suppression est synchronisée

---

### Test 9 : Mode Temps Réel On/Off
**Objectif** : Vérifier le toggle du mode temps réel

1. Décocher la case "Temps réel"
2. Ajouter un texte
3. Observer :
   - Le texte n'apparaît **PAS** automatiquement sur le modèle 3D
4. Cocher à nouveau "Temps réel"
5. Ajouter un autre texte
6. Observer :
   - Le texte apparaît automatiquement

**✅ Succès si** : Le toggle fonctionne correctement

---

### Test 10 : Performance (Dessin Intensif)
**Objectif** : Vérifier que le système ne lag pas

1. Dessiner rapidement et beaucoup sur le canvas 2D
2. Observer :
   - Le modèle 3D se met à jour sans lag excessif
   - Pas d'erreurs dans la console

**✅ Succès si** : Pas de lag important (petit délai de 100-200ms acceptable)

---

## 🔍 Vérifications dans la Console

Ouvrez la console (F12) et vérifiez ces messages :

### Messages Attendus (Normaux)
```
✅ "Canvas Fabric.js prêt"
✅ "Modèle 3D chargé avec succès"
✅ "Texture partagée configurée avec succès"
✅ "CanvasTexture configurée avec succès"
✅ "Texture mise à jour en temps réel" (quand vous modifiez)
```

### Messages d'Erreur (À Investiguer)
```
❌ "Canvas HTML ou mesh manquant pour la texture partagée"
❌ "Impossible de créer la texture depuis le canvas"
❌ "Aucun mesh pour appliquer la texture"
❌ "Texture invalide"
```

---

## 🐛 Dépannage

### Problème : Rien n'apparaît sur le modèle 3D

1. **Vérifier que le modèle est chargé**
   - Console doit afficher "Modèle 3D chargé avec succès"

2. **Vérifier que le canvas est connecté**
   - Console doit afficher "Canvas Fabric.js prêt"
   - Console doit afficher "Texture partagée configurée"

3. **Vérifier les UVs**
   - Les UVs sont générés automatiquement, mais vérifiez la console pour "Génération des UVs"

4. **Vérifier le mode temps réel**
   - La case "Temps réel" doit être cochée

### Problème : Le modèle 3D est tout noir

- Le modèle n'a peut-être pas de coordonnées UV
- Les UVs sont générés automatiquement, mais peut-être incorrectement
- Essayez de charger un autre fichier OBJ

### Problème : Lag important

- C'est normal d'avoir un petit délai (100-200ms) pour les mises à jour
- Si c'est plus long, vérifiez la taille du canvas (800x600 par défaut)
- Réduisez la taille du canvas si nécessaire

---

## 📊 Checklist Complète

- [ ] Le modèle 3D se charge correctement
- [ ] Le canvas 2D est initialisé
- [ ] La texture partagée est configurée (messages dans console)
- [ ] L'ajout de texte fonctionne en temps réel
- [ ] L'ajout de cercle fonctionne en temps réel
- [ ] L'ajout de rectangle fonctionne en temps réel
- [ ] L'ajout d'image fonctionne en temps réel
- [ ] Le dessin libre fonctionne en temps réel
- [ ] Le déplacement d'objet fonctionne en temps réel
- [ ] La suppression d'objet fonctionne
- [ ] Le toggle "Temps réel" fonctionne
- [ ] Pas d'erreurs dans la console
- [ ] Performance acceptable

---

## 🎯 Résultat Attendu Final

Quand tout fonctionne :
- ✅ Toute modification du canvas 2D apparaît **automatiquement** sur le modèle 3D
- ✅ Pas besoin de cliquer sur "Appliquer"
- ✅ Les mises à jour sont en temps réel (100-200ms de délai acceptable)
- ✅ Aucune action manuelle nécessaire


