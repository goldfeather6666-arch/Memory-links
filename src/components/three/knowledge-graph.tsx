'use client';

/**
 * knowledge-graph.tsx — interactive 3D memory graph.
 *
 * R3F Canvas + OrbitControls (rotate / zoom / damping). Nodes are rendered as
 * instanced icosahedra with per-category colors. Hover highlights a node
 * (raycast -> scale/color + drei Html label). Clicking selects a node and
 * emphasizes its relationships while dimming everything else. The camera
 * glides smoothly to the selected node. All GPU resources are disposed on
 * unmount.
 */

import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import * as THREE from 'three';
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  EDGES,
  NODES,
} from '../../lib/data/graph-data';

const NODE_COUNT = NODES.length;
const EDGE_COUNT = EDGES.length;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

function buildAdjacency() {
  const adj: number[][] = Array.from({ length: NODE_COUNT }, () => []);
  for (let i = 0; i < EDGE_COUNT; i++) {
    const edge = EDGES[i];
    adj[edge.source].push(i);
    adj[edge.target].push(i);
  }
  return adj;
}

const ADJACENCY = buildAdjacency();
const CATEGORY_COLORS: Record<string, Rgb> = Object.fromEntries(
  Object.entries(CATEGORY_COLOR).map(([k, v]) => [k, hexToRgb(v)]),
);

const DEFAULT_EDGE = hexToRgb('#5a6b8c');
const DIM_FACTOR = 0.14;

function InstancedNodes({
  selectedId,
  onSelect,
  hoveredId,
  onHovered,
}: {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  hoveredId: number | null;
  onHovered: (id: number | null) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const scales = useMemo(() => new Float32Array(NODE_COUNT), []);
  const positions = useMemo(
    () => NODES.map((n) => new THREE.Vector3(n.x, n.y, n.z)),
    [],
  );
  const baseColors = useMemo(
    () => NODES.map((n) => new THREE.Color(CATEGORY_COLORS[n.category].r, CATEGORY_COLORS[n.category].g, CATEGORY_COLORS[n.category].b)),
    [],
  );

  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    return { geometry, material };
  }, []);

  /* eslint-disable react-hooks/immutability -- imperative InstancedMesh setup; the compiler rule cannot track THREE.Object3D mutation. */
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < NODE_COUNT; i++) {
      const node = NODES[i];
      const scale = 0.07 + node.weight * 0.1;
      scales[i] = scale;
      dummy.position.set(node.x, node.y, node.z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, baseColors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [baseColors, scales]);
  /* eslint-enable react-hooks/immutability */

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const applyScales = (ids: Set<number>, factor: number) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (const i of ids) {
      dummy.position.copy(positions[i]);
      dummy.scale.setScalar(scales[i] * factor);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  const applyNodeDim = (selected: number | null) => {
    const mesh = meshRef.current;
    if (!mesh || !mesh.instanceColor) return;
    if (selected === null) {
      for (let i = 0; i < NODE_COUNT; i++) mesh.setColorAt(i, baseColors[i]);
    } else {
      const connected = new Set<number>();
      for (const e of ADJACENCY[selected]) {
        connected.add(EDGES[e].source);
        connected.add(EDGES[e].target);
      }
      for (let i = 0; i < NODE_COUNT; i++) {
        const isSelected = i === selected;
        const isConnected = connected.has(i);
        if (isSelected) {
          mesh.setColorAt(i, baseColors[i].clone().lerp(new THREE.Color('#ffffff'), 0.45));
        } else if (isConnected) {
          mesh.setColorAt(i, baseColors[i]);
        } else {
          mesh.setColorAt(i, baseColors[i].clone().multiplyScalar(DIM_FACTOR));
        }
      }
    }
    mesh.instanceColor.needsUpdate = true;
  };

  const applyHoverScale = (hovered: number | null) => {
    if (hovered === null) {
      applyScales(new Set(Array.from({ length: NODE_COUNT }, (_, i) => i)), 1);
      return;
    }
    applyScales(new Set([hovered]), 1.5);
  };

  useEffect(() => {
    applyHoverScale(hoveredId);
  }, [hoveredId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    applyNodeDim(selectedId);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, NODE_COUNT]}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (e.instanceId != null) onHovered(e.instanceId);
      }}
      onPointerOut={() => onHovered(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId == null) return;
        if (selectedId === e.instanceId) onSelect(null);
        else onSelect(e.instanceId);
      }}
    />
  );
}

function EdgeLines({ selectedId }: { selectedId: number | null }) {
  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(EDGE_COUNT * 6);
    const colors = new Float32Array(EDGE_COUNT * 6);

    for (let i = 0; i < EDGE_COUNT; i++) {
      const edge = EDGES[i];
      const a = NODES[edge.source];
      const b = NODES[edge.target];
      positions[i * 6] = a.x;
      positions[i * 6 + 1] = a.y;
      positions[i * 6 + 2] = a.z;
      positions[i * 6 + 3] = b.x;
      positions[i * 6 + 4] = b.y;
      positions[i * 6 + 5] = b.z;

      const intensity = 0.4 + edge.strength * 0.6;
      const c = DEFAULT_EDGE;
      colors[i * 6] = c.r * intensity;
      colors[i * 6 + 1] = c.g * intensity;
      colors[i * 6 + 2] = c.b * intensity;
      colors[i * 6 + 3] = c.r * intensity;
      colors[i * 6 + 4] = c.g * intensity;
      colors[i * 6 + 5] = c.b * intensity;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry, material };
  }, []);

  const applyHighlight = (selected: number | null) => {
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const colors = colorAttr.array as Float32Array;
    if (selected === null) {
      for (let i = 0; i < EDGE_COUNT; i++) {
        const edge = EDGES[i];
        const intensity = 0.4 + edge.strength * 0.6;
        const c = DEFAULT_EDGE;
        colors[i * 6] = c.r * intensity;
        colors[i * 6 + 1] = c.g * intensity;
        colors[i * 6 + 2] = c.b * intensity;
        colors[i * 6 + 3] = c.r * intensity;
        colors[i * 6 + 4] = c.g * intensity;
        colors[i * 6 + 5] = c.b * intensity;
      }
    } else {
      const connected = new Set<number>(ADJACENCY[selected]);
      for (let i = 0; i < EDGE_COUNT; i++) {
        const edge = EDGES[i];
        const isConnected = connected.has(i);
        if (isConnected) {
          const focus = hexToRgb('#b7aaff');
          colors[i * 6] = focus.r;
          colors[i * 6 + 1] = focus.g;
          colors[i * 6 + 2] = focus.b;
          colors[i * 6 + 3] = focus.r;
          colors[i * 6 + 4] = focus.g;
          colors[i * 6 + 5] = focus.b;
        } else {
          const intensity = 0.4 + edge.strength * 0.6;
          const c = DEFAULT_EDGE;
          colors[i * 6] = c.r * intensity * 0.12;
          colors[i * 6 + 1] = c.g * intensity * 0.12;
          colors[i * 6 + 2] = c.b * intensity * 0.12;
          colors[i * 6 + 3] = c.r * intensity * 0.12;
          colors[i * 6 + 4] = c.g * intensity * 0.12;
          colors[i * 6 + 5] = c.b * intensity * 0.12;
        }
      }
    }
    colorAttr.needsUpdate = true;
  };

  useEffect(() => {
    applyHighlight(selectedId);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return <lineSegments geometry={geometry} material={material} />;
}

function HoverLabel({ id }: { id: number }) {
  const node = NODES[id];
  if (!node) return null;
  return (
    <Html center position={[node.x, node.y + 0.45, node.z]} zIndexRange={[20, 0]} distanceFactor={6}>
      <div
        style={{
          background: 'rgba(16, 15, 26, 0.85)',
          border: '1px solid rgba(180, 160, 255, 0.3)',
          borderRadius: 8,
          padding: '6px 10px',
          color: '#f0edff',
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
          pointerEvents: 'none',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div>{node.label}</div>
        <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>
          {CATEGORY_LABEL[node.category]}
        </div>
      </div>
    </Html>
  );
}

function CameraRig({ selectedId }: { selectedId: number | null }) {
  const { camera } = useThree();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));
  const cameraRef = useRef(new THREE.Vector3(0, 0.6, 7.6));
  const initializedRef = useRef(false);

  useEffect(() => {
    if (selectedId == null) {
      targetRef.current.set(0, 0, 0);
      cameraRef.current.set(0, 0.6, 7.6);
      return;
    }
    const node = NODES[selectedId];
    targetRef.current.set(node.x, node.y, node.z);
    const offset = new THREE.Vector3(0, 0.6, 3.4);
    cameraRef.current.copy(targetRef.current).add(offset);
  }, [selectedId]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (!initializedRef.current) {
      controls.target.copy(targetRef.current);
      initializedRef.current = true;
    }
    controls.target.lerp(targetRef.current, 0.08);
    camera.position.lerp(cameraRef.current, 0.08);
    controls.update();
  });

  return <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.08} rotateSpeed={0.6} zoomSpeed={0.7} />;
}

export default function KnowledgeGraph() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  return (
    <Canvas
      camera={{ position: [0, 0.6, 7.6], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      style={{ width: '100%', height: '100%', display: 'block' }}
      onPointerMissed={() => setSelectedId(null)}
    >
      <InstancedNodes
        selectedId={selectedId}
        onSelect={setSelectedId}
        hoveredId={hoveredId}
        onHovered={setHoveredId}
      />
      <EdgeLines selectedId={selectedId} />
      {hoveredId != null && <HoverLabel id={hoveredId} />}
      <CameraRig selectedId={selectedId} />
    </Canvas>
  );
}
