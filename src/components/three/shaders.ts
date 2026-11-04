/**
 * MNEMOSYNE — procedural GLSL + THREE.ShaderMaterial helpers.
 *
 * All visual materials are generated here (no textures / GLB / GLTF).
 * This module is the single source of shading logic for the whole app.
 */
import * as THREE from 'three'

/** Deterministic PRNG so layouts are stable across renders. */
export function makeRandom(seed = 1): () => number {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/* ------------------------------------------------------------------ *
 * (a) Soft circular point-sprite glow falloff
 * ------------------------------------------------------------------ */

export const POINT_GLOW_VERTEX = `
  uniform float uSize;
  varying float vDist;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float pointSize = uSize * (300.0 / max(0.1, -mvPosition.z));
    gl_PointSize = pointSize;
    gl_Position = projectionMatrix * mvPosition;
    vDist = length(mvPosition.xyz);
  }
`

export const POINT_GLOW_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vDist;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float falloff = smoothstep(0.5, 0.02, d);
    falloff = pow(falloff, 1.8);
    float a = falloff * uIntensity;
    vec3 col = uColor * a;
    gl_FragColor = vec4(col, a);
  }
`

export interface PointGlowParams {
  color?: string | number
  intensity?: number
  size?: number
}

export function createPointGlowMaterial(params: PointGlowParams = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(params.color ?? '#8ab4ff') },
      uIntensity: { value: params.intensity ?? 1 },
      uSize: { value: params.size ?? 1 },
    },
    vertexShader: POINT_GLOW_VERTEX,
    fragmentShader: POINT_GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

/* ------------------------------------------------------------------ *
 * (b) Node glow fresnel / rim
 * ------------------------------------------------------------------ */

export const NODE_GLOW_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

export const NODE_GLOW_FRAGMENT = `
  uniform vec3 uBase;
  uniform vec3 uRim;
  uniform float uPower;
  uniform float uRimStrength;
  uniform float uAlpha;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
    rim = pow(rim, uPower);
    float breathe = 1.0 + 0.06 * sin(uTime * 1.6 + rim * 6.0);
    vec3 col = mix(uBase, uRim, rim) * breathe;
    float a = (uAlpha + rim * uRimStrength) * breathe;
    gl_FragColor = vec4(col, a);
  }
`

export interface NodeGlowParams {
  base?: string | number
  rim?: string | number
  power?: number
  rimStrength?: number
  alpha?: number
}

export function createNodeGlowMaterial(params: NodeGlowParams = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Color(params.base ?? '#2a6bd4') },
      uRim: { value: new THREE.Color(params.rim ?? '#9fd0ff') },
      uPower: { value: params.power ?? 2.5 },
      uRimStrength: { value: params.rimStrength ?? 0.85 },
      uAlpha: { value: params.alpha ?? 0.35 },
      uTime: { value: 0 },
    },
    vertexShader: NODE_GLOW_VERTEX,
    fragmentShader: NODE_GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

/* ------------------------------------------------------------------ *
 * (c) Flowing connection line shader (animated head + body)
 * ------------------------------------------------------------------ */

export const LINE_FLOW_VERTEX = `
  attribute float aProgress;
  uniform float uTime;
  uniform float uSpeed;
  varying float vProgress;
  varying float vFlow;
  void main() {
    vProgress = aProgress;
    vFlow = fract(aProgress - uTime * uSpeed);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`

export const LINE_FLOW_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uHead;
  uniform float uFade;
  varying float vProgress;
  varying float vFlow;
  void main() {
    float head = smoothstep(uHead, uHead - uFade, vFlow);
    float body = smoothstep(0.0, 0.16, vFlow);
    float a = max(body * 0.28, head);
    a *= smoothstep(0.0, 0.08, vProgress) * smoothstep(1.0, 0.92, vProgress);
    gl_FragColor = vec4(uColor, a);
  }
`

export interface FlowLineParams {
  color?: string | number
  speed?: number
  head?: number
  fade?: number
}

export function createFlowLineMaterial(params: FlowLineParams = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(params.color ?? '#7fb0ff') },
      uSpeed: { value: params.speed ?? 0.12 },
      uHead: { value: params.head ?? 0.08 },
      uFade: { value: params.fade ?? 0.06 },
      uTime: { value: 0 },
    },
    vertexShader: LINE_FLOW_VERTEX,
    fragmentShader: LINE_FLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

/**
 * Build a LineSegments geometry connecting nearby nodes. Each segment gets a
 * `aProgress` attribute (0 at one endpoint, 1 at the other) used by the
 * flow shader.
 */
export function createConnectionLineGeometry(
  nodes: THREE.Vector3[],
  options: { maxLinks?: number; range?: number; seed?: number } = {},
): THREE.BufferGeometry {
  const { maxLinks = 3, range = 5 } = options
  const positions: number[] = []
  const progresses: number[] = []

  for (let i = 0; i < nodes.length; i++) {
    let links = 0
    for (let j = i + 1; j < nodes.length && links < maxLinks; j++) {
      if (nodes[i].distanceTo(nodes[j]) <= range) {
        positions.push(nodes[i].x, nodes[i].y, nodes[i].z)
        progresses.push(0, 1)
        positions.push(nodes[j].x, nodes[j].y, nodes[j].z)
        links++
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aProgress', new THREE.Float32BufferAttribute(progresses, 1))
  return geometry
}

/** Dispose geometry + every material on an object (incl. arrays). */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const anyO = o as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }
    if (anyO.geometry) anyO.geometry.dispose()
    const material = anyO.material
    if (Array.isArray(material)) {
      for (const m of material) m.dispose()
    } else if (material) {
      material.dispose()
    }
  })
}

/** Place `count` seeded positions inside a soft spherical volume. */
export function createNodeField(count: number, options: { radius?: number; seed?: number; yScale?: number } = {}): THREE.Vector3[] {
  const { radius = 8, seed = 11, yScale = 0.7 } = options
  const rand = makeRandom(seed)
  const out: THREE.Vector3[] = []
  for (let i = 0; i < count; i++) {
    const r = radius * (0.35 + rand() * 0.65)
    const theta = rand() * Math.PI * 2
    const phi = Math.acos(2 * rand() - 1)
    out.push(
      new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi) * yScale,
        r * Math.sin(phi) * Math.sin(theta),
      ),
    )
  }
  return out
}
