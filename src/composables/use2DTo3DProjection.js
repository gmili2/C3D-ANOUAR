import * as THREE from 'three'

/**
 * Calcule la position 3D et la normale à partir de coordonnées UV sur un Mesh
 * @param {THREE.Mesh} mesh - Le mesh sur lequel projeter
 * @param {number} u - Coordonnée U (0-1)
 * @param {number} v - Coordonnée V (0-1)
 * @returns {Object|null} - { position: THREE.Vector3, normal: THREE.Vector3 } ou null si non trouvé
 */
export const get3DPositionFromUV = (mesh, u, v) => {
    if (!mesh || !mesh.geometry) return null

    const geometry = mesh.geometry
    const positionAttribute = geometry.attributes.position
    const uvAttribute = geometry.attributes.uv
    const normalAttribute = geometry.attributes.normal
    const indexAttribute = geometry.index

    if (!uvAttribute) return null

    // Variables pour stocker les sommets du triangle trouvé
    const p1 = new THREE.Vector3()
    const p2 = new THREE.Vector3()
    const p3 = new THREE.Vector3()

    const uv1 = new THREE.Vector2()
    const uv2 = new THREE.Vector2()
    const uv3 = new THREE.Vector2()

    const n1 = new THREE.Vector3()
    const n2 = new THREE.Vector3()
    const n3 = new THREE.Vector3()

    // Nombre de triangles
    const triangleCount = indexAttribute ? indexAttribute.count / 3 : positionAttribute.count / 3

    // Parcourir tous les triangles
    for (let i = 0; i < triangleCount; i++) {
        let i1, i2, i3

        if (indexAttribute) {
            i1 = indexAttribute.getX(i * 3)
            i2 = indexAttribute.getX(i * 3 + 1)
            i3 = indexAttribute.getX(i * 3 + 2)
        } else {
            i1 = i * 3
            i2 = i * 3 + 1
            i3 = i * 3 + 2
        }

        // Récupérer les UVs du triangle
        uv1.fromBufferAttribute(uvAttribute, i1)
        uv2.fromBufferAttribute(uvAttribute, i2)
        uv3.fromBufferAttribute(uvAttribute, i3)

        // Vérifier si le point (u, v) est dans ce triangle 2D (dans l'espace UV)
        // Utilisation des coordonnées barycentriques
        const area = 0.5 * ((uv2.x - uv1.x) * (uv3.y - uv1.y) - (uv3.x - uv1.x) * (uv2.y - uv1.y))
        const sign = Math.sign(area)

        const s = (uv1.y * uv3.x - uv1.x * uv3.y + (uv3.y - uv1.y) * u + (uv1.x - uv3.x) * v) * sign
        const t = (uv1.x * uv2.y - uv1.y * uv2.x + (uv1.y - uv2.y) * u + (uv2.x - uv1.x) * v) * sign

        const alpha = s / (2 * area * sign)
        const beta = t / (2 * area * sign)
        const gamma = 1 - alpha - beta

        // Si le point est dans le triangle (avec une petite tolérance)
        if (alpha >= 0 && beta >= 0 && gamma >= 0) {
            // Récupérer les positions 3D
            p1.fromBufferAttribute(positionAttribute, i1)
            p2.fromBufferAttribute(positionAttribute, i2)
            p3.fromBufferAttribute(positionAttribute, i3)

            // Interpoler la position 3D
            const position = new THREE.Vector3()
            position.addScaledVector(p1, alpha)
            position.addScaledVector(p2, beta)
            position.addScaledVector(p3, gamma)

            // Appliquer la transformation locale vers monde du mesh
            position.applyMatrix4(mesh.matrixWorld)

            // Calculer la normale interpolée
            const normal = new THREE.Vector3()
            if (normalAttribute) {
                n1.fromBufferAttribute(normalAttribute, i1)
                n2.fromBufferAttribute(normalAttribute, i2)
                n3.fromBufferAttribute(normalAttribute, i3)

                normal.addScaledVector(n1, alpha)
                normal.addScaledVector(n2, beta)
                normal.addScaledVector(n3, gamma)
            } else {
                // Si pas de normales, calculer la normale de la face
                const vA = new THREE.Vector3().subVectors(p2, p1)
                const vB = new THREE.Vector3().subVectors(p3, p1)
                normal.crossVectors(vA, vB)
            }

            normal.normalize()
            // Appliquer la rotation du mesh à la normale
            normal.transformDirection(mesh.matrixWorld)

            return { position, normal }
        }
    }

    return null
}
