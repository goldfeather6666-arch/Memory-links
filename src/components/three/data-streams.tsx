'use client';

/**
 * data-streams.tsx — procedural R3F scene for the Digital Universe section.
 *
 * Animated, converging data streams (shader lines) flow into a central glowing
 * core while low-poly "source glyphs" float around them. Everything is
 * generated at runtime from a seed — no GLB/GLTF/texture assets.
 */

import { Canvas, useFrame } from '@react-three/fiber';
import { CanvasMountGate } from './canvas-mount-gate';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useInView } from '../../lib/hooks/use-in-view';

type Vec3 = [number, number, number];

const STREAM_COUNT = 26;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStreams(): Vec3[][] {
  const rng = mulberry32(0x51e3d);
  const streams: Vec3[][] = [];
  for (let i = 0; i < STREAM_COUNT; i++) {
    const angle = rng() * Math.PI * 2;
    const tilt = (rng() * 2 - 1) * 1.15;
    const r = 4.0 + rng() * 1.4;
    const sx = Math.cos(angle) * r * Math.cos(tilt);
    const sy = Math.sin(tilt) * r;
    const sz = Math.sin(angle) * r * Math.cos(tilt);
    const mx = sx * 0.45 + (rng() - 0.5) * 0.9;
    const my = sy * 0.45 + (rng() - 0.5) * 0.9;
    const mz = sz * 0.45 + (rng() - 0.5) * 0.9;
    streams.push([
      [sx, sy, sz],
      [mx, my, mz],
      [0, 0, 0],
    ]);
  }
  return streams;
}

const STREAMS = buildStreams();

const STREAM_VERT = /* glsl */ `
attribute float aProgress;
varying float vProgress;
void main() {
  vProgress = aProgress;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const STREAM_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uBaseColor;
uniform vec3 uBrightColor;
uniform float uOpacity;
varying float vProgress;
void main() {
  float pulse = fract(vProgress - uTime * 0.22);
  float band = pow(clamp(1.0 - abs(pulse - 0.5) * 2.0, 0.0, 1.0), 8.0);
  vec3 col = mix(uBaseColor, uBrightColor, vProgress * 0.8 + band);
  float alpha = (0.16 + band * 0.9) * uOpacity;
  gl_FragColor = vec4(col + uBrightColor * band * 0.8, alpha);
}
`;

const CORE_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vPos;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const CORE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPos;
void main() {
  vec3 viewDir = normalize(-vPos);
  float fres = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.5);
  float pulse = 0.8 + 0.2 * sin(uTime * 1.8);
  vec3 col = uColor * (0.35 + fres * 2.4) * pulse;
  gl_FragColor = vec4(col, 0.95);
}
`;

const STREAM_MATERIAL = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uTime: { value: 0 },
    uBaseColor: { value: new THREE.Color('#7c92ff') },
    uBrightColor: { value: new THREE.Color('#cfe0ff') },
    uOpacity: { value: 0.9 },
  },
  vertexShader: STREAM_VERT,
  fragmentShader: STREAM_FRAG,
});

const CORE_MATERIAL = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uColor: { value: new THREE.Color('#8b7bff') },
    uTime: { value: 0 },
  },
  vertexShader: CORE_VERT,
  fragmentShader: CORE_FRAG,
});

function PulseLines() {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const progress: number[] = [];

    for (const s of STREAMS) {
      const segLens: number[] = [];
      let cumulative = 0;
      for (let i = 0; i < s.length - 1; i++) {
        const dx = s[i + 1][0] - s[i][0];
        const dy = s[i + 1][1] - s[i][1];
        const dz = s[i + 1][2] - s[i][2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        segLens.push(len);
        cumulative += len;
      }
      let acc = 0;
      for (let i = 0; i < s.length - 1; i++) {
        const a = s[i];
        const b = s[i + 1];
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
        const p0 = cumulative === 0 ? 0 : acc / cumulative;
        const p1 = cumulative === 0 ? 1 : (acc + segLens[i]) / cumulative;
        progress.push(p0, p1);
        acc += segLens[i];
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aProgress', new THREE.Float32BufferAttribute(progress, 1));

    return geometry;
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  useFrame(({ clock }) => {
    STREAM_MATERIAL.uniforms.uTime.value = clock.elapsedTime;
  });

  return <lineSegments geometry={geometry} material={STREAM_MATERIAL} />;
}

function GlowingCore() {
  const geometry = useMemo(() => new THREE.SphereGeometry(0.55, 48, 48), []);

  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  useFrame(({ clock }) => {
    CORE_MATERIAL.uniforms.uTime.value = clock.elapsedTime;
  });

  return <mesh geometry={geometry} material={CORE_MATERIAL} />;
}

function DustField() {
  const { geometry, material } = useMemo(() => {
    const count = 500;
    const positions = new Float32Array(count * 3);
    const rng = mulberry32(0x9a11);
    for (let i = 0; i < count; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      const r = 5.5 + rng() * 3.5;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: '#9aa7d8',
      size: 0.035,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true,
      depthWrite: false,
    });
    return { geometry, material };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return <points geometry={geometry} material={material} />;
}

type GlyphType =
  | 'chat'
  | 'document'
  | 'note'
  | 'project'
  | 'flask'
  | 'decision'
  | 'plug';

const GLYPH_COLORS: Record<GlyphType, string> = {
  chat: '#8B5CF6',
  document: '#E3C98D',
  note: '#38BDF8',
  project: '#7C6FF0',
  flask: '#94A3B8',
  decision: '#C7B9FF',
  plug: '#F5F1EA',
};

function Glyph({ type }: { type: GlyphType }) {
  const color = GLYPH_COLORS[type];
  return (
    <group>
      {/* chat bubble */}
      {type === 'chat' && (
        <group>
          <mesh>
            <sphereGeometry args={[0.16, 16, 12]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh position={[0.08, -0.12, 0]}>
            <octahedronGeometry args={[0.08]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </group>
      )}
      {/* document */}
      {type === 'document' && (
        <mesh rotation={[0.4, 0.6, 0]}>
          <boxGeometry args={[0.1, 0.26, 0.18]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
      {/* note cube */}
      {type === 'note' && (
        <mesh>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
      {/* project cube (slightly larger, chamfered feel) */}
      {type === 'project' && (
        <mesh rotation={[0.5, 0.2, 0]}>
          <boxGeometry args={[0.26, 0.26, 0.26]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
      {/* research flask */}
      {type === 'flask' && (
        <group>
          <mesh position={[0, -0.1, 0]}>
            <cylinderGeometry args={[0.12, 0.16, 0.24, 12]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh position={[0, 0.14, 0]}>
            <cylinderGeometry args={[0.04, 0.05, 0.14, 8]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </group>
      )}
      {/* decision node */}
      {type === 'decision' && (
        <mesh>
          <octahedronGeometry args={[0.18]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
      {/* integration plug */}
      {type === 'plug' && (
        <group>
          <mesh>
            <cylinderGeometry args={[0.08, 0.08, 0.2, 10]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh position={[0, 0.14, 0]}>
            <boxGeometry args={[0.14, 0.06, 0.14]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </group>
      )}
    </group>
  );
}

const GLYPH_TYPES: GlyphType[] = [
  'chat',
  'document',
  'note',
  'project',
  'flask',
  'decision',
  'plug',
];

function FloatingGlyphs() {
  const groupRef = useRef<THREE.Group>(null);

  const anchors = useMemo(() => {
    const rng = mulberry32(0xbeef);
    return GLYPH_TYPES.map(() => {
      const angle = rng() * Math.PI * 2;
      const r = 3.6 + rng() * 1.1;
      return {
        x: Math.cos(angle) * r,
        z: Math.sin(angle) * r,
        y: (rng() - 0.5) * 1.4,
        ry: rng() * Math.PI * 2,
      };
    });
  }, []);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.05;
  });

  return (
    <group ref={groupRef}>
      {GLYPH_TYPES.map((type, i) => (
        <group key={type} position={[anchors[i].x, anchors[i].y, anchors[i].z]} rotation={[0, anchors[i].ry, 0]}>
          <Glyph type={type} />
        </group>
      ))}
    </group>
  );
}

function SceneContent() {
  const pivotRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (pivotRef.current) pivotRef.current.rotation.y += delta * 0.03;
  });

  return (
    <group ref={pivotRef}>
      <PulseLines />
      <DustField />
      <GlowingCore />
      <FloatingGlyphs />
    </group>
  );
}

export default function DataStreams() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      <CanvasMountGate>
      <Canvas
        camera={{ position: [0, 0.4, 9.2], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        frameloop={inView ? 'always' : 'never'}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <SceneContent />
      </Canvas>
      </CanvasMountGate>
    </div>
  );
}
