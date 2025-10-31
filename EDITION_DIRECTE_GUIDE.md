# 🎯 Guide - Édition Directe sur Modèle 3D

## ✨ Nouvelle Fonctionnalité : Cliquer sur le Modèle 3D pour Dessiner

Vous pouvez maintenant **cliquer directement sur le modèle 3D** et vos modifications apparaissent automatiquement à la position cliquée sur le canvas 2D !

## 🚀 Comment Utiliser

### 1. **Prérequis**
- Le modèle 3D doit être chargé
- Le canvas 2D doit être initialisé
- La texture partagée doit être configurée

### 2. **Mode d'Édition Direct**

#### **Option A : Ajouter un Point/Cercle**
1. **Désactiver** le mode dessin (bouton "Mode dessin" doit afficher "Mode objet")
2. **Cliquer** sur n'importe quelle partie du modèle 3D
3. ✅ Un petit cercle apparaît à la position cliquée sur le canvas 2D
4. ✅ Le cercle apparaît aussi sur le modèle 3D en temps réel !

#### **Option B : Dessiner en Mode Dessin**
1. **Activer** le mode dessin (bouton "Mode dessin")
2. **Cliquer** sur le modèle 3D pour continuer votre dessin
3. ✅ Le dessin continue à la position cliquée

## 🎨 Fonctionnalités

### Ce qui se passe quand vous cliquez :
1. **Détection 3D** : Le système détecte où vous avez cliqué sur le modèle 3D
2. **Projection UV** : Convertit le point 3D en coordonnées UV du modèle
3. **Mapping Canvas** : Projette les coordonnées UV sur le canvas 2D
4. **Ajout Automatique** : Ajoute un cercle (ou continue le dessin) à cette position
5. **Mise à jour Temps Réel** : La texture est mise à jour automatiquement

## 📍 Positions Exactes

- Les coordonnées sont calculées à partir des **UVs du modèle**
- Si le modèle n'a pas d'UVs, ils sont générés automatiquement
- La projection se fait avec un mapping planaire simple

## ⚙️ Configuration

Dans `ThreeScene.vue`, la prop `enableDirectEdit` contrôle cette fonctionnalité :
```vue
<ThreeScene :enable-direct-edit="true" />
```

## 🐛 Dépannage

### Le clic ne fait rien ?
1. Vérifiez que le modèle est chargé
2. Vérifiez dans la console : `"Clic sur modèle 3D détecté"`
3. Vérifiez que `canvas2D` est bien connecté

### Les coordonnées sont incorrectes ?
- Les UVs peuvent ne pas correspondre exactement à la texture
- C'est normal si le modèle a un mapping UV complexe
- La projection est approximative pour les modèles sans UVs

### Mode dessin ne fonctionne pas ?
- Le mode dessin nécessite des interactions supplémentaires
- Pour l'instant, utilisez le mode objet (ajout de cercles)

## 💡 Cas d'Usage

### ✅ Exemple 1 : Marquer un Point Spécifique
1. Cliquez sur le nez du modèle 3D
2. Un cercle apparaît à cette position sur le canvas
3. Vous pouvez ensuite le modifier (couleur, taille, etc.)

### ✅ Exemple 2 : Décorer Rapidement
1. Cliquez plusieurs fois sur différentes parties du modèle
2. Des cercles apparaissent aux positions cliquées
3. Changez leur couleur pour créer un motif

### ✅ Exemple 3 : Précision avec Canvas 2D
1. Utilisez le canvas 2D pour le placement précis
2. Utilisez le clic 3D pour des ajouts rapides
3. Combinez les deux méthodes !

## 🔧 Améliorations Futures Possibles

- Support pour dessin libre en cliquant sur le 3D
- Support pour déplacer des objets existants via clic 3D
- Indicateur visuel montrant où vous allez cliquer
- Calibration UV pour meilleure précision


