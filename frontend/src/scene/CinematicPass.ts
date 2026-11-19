import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

/**
 * 电影感后处理：暗角 + 细颗粒 + 轻微色散 + 极轻的对比/饱和微调。
 * 放在 OutputPass 之后，作用于已经色调映射过的 sRGB 画面。
 */
export const createCinematicPass = (
  resolution: THREE.Vector2,
  options: { vignette?: number; grain?: number; aberration?: number } = {},
) => {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uResolution: { value: resolution.clone() },
      uVignette: { value: options.vignette ?? 0.55 },
      uGrain: { value: options.grain ?? 0.045 },
      uAberration: { value: options.aberration ?? 0.0016 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform vec2 uResolution;
      uniform float uVignette;
      uniform float uGrain;
      uniform float uAberration;
      varying vec2 vUv;

      float hash(vec2 p) {
        p = fract(p * vec2(443.897, 441.423));
        p += dot(p, p + 19.19);
        return fract((p.x + p.y) * p.x);
      }

      void main() {
        vec2 uv = vUv;
        vec2 centered = uv - 0.5;
        float r2 = dot(centered, centered);

        // 轻微横向色散，越靠边越明显
        vec2 offset = centered * uAberration * (0.4 + r2 * 2.2);
        vec3 color;
        color.r = texture2D(tDiffuse, uv + offset).r;
        color.g = texture2D(tDiffuse, uv).g;
        color.b = texture2D(tDiffuse, uv - offset).b;

        // 暗角：中心保持，边缘压暗
        float vignette = smoothstep(0.92, 0.12, r2 * 1.35);
        color *= mix(1.0, vignette, uVignette);

        // 细颗粒（逐帧变化，避免色带）
        float grain = hash(uv * uResolution + fract(uTime) * 137.0) - 0.5;
        color += grain * uGrain * (0.65 + 0.35 * (1.0 - r2));

        // 极轻的对比与饱和，让画面更“通透”
        color = (color - 0.5) * 1.035 + 0.5;
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(luma), color, 1.06);

        gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
      }
    `,
  })

  return pass
}
