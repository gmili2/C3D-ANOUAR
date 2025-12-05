import { BackSide, FrontSide, ShaderMaterial, Texture } from 'three';

export function useShaderMaterial() {
    const shouldClip = true;

    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const fragmentShader = `
        uniform sampler2D texMap;
        uniform float opacity;
        uniform bool shouldClip;
        varying vec2 vUv;
    
        void main() {
            if (shouldClip && (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0) ) {
                discard;
            }
        
            vec4 texColor = texture( texMap, vUv );
            texColor.a *= opacity;
            gl_FragColor = texColor;
        }
    `;

    const innerShaderMaterial = new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        side: BackSide,
        uniforms: {
            texMap: { value: new Texture() },
            opacity: { value: 0.2 },
            shouldClip: { value: shouldClip.value }
        }
    });

    const outerShaderMaterial = new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        side: FrontSide,
        uniforms: {
            texMap: { value: new Texture() },
            opacity: { value: 1 },
            shouldClip: { value: shouldClip.value }
        }
    });

    return { innerShaderMaterial, outerShaderMaterial };
}
