"use client";

/**
 * universe-3d.tsx — interactive 3D knowledge graph, built on the same R3F
 * pattern as knowledge-graph.tsx: instanced icosahedra colored by entity type,
 * line-segment edges, OrbitControls, hover labels and a camera rig that glides
 * to the selected node. GPU resources are disposed on unmount.
 */

import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CanvasMountGate } from "@/components/three/canvas-mount-gate";
import { useInView } from "@/lib/hooks/use-in-view";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import * as THREE from "three";
import {
  entityColor,
  relaxNodes,
  seedPositions,
  type GraphEdgeData,
  type GraphNodeData,
} from "./layout";

interface Universe3DProps {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

const DEFAULT_EDGE = hexToRgb("#5a6b8c");
const FOCUS_EDGE = hexToRgb("#b7aaff");
const DIM_FACTOR = 0.14;

interface InstancedNodesProps {
  nodeCount: number;
  positions: THREE.Vector3[];
  scales: Float32Array;
  colors: THREE.Color[];
  adjacency: number[][];
  selectedId: string | null;
  indexById: Map<string, number>;
  onSelect: (id: string | null) => void;
  hoveredId: string | null;
  onHovered: (id: string | null) => void;
}

function InstancedNodes({
  nodeCount,
  positions,
  scales,
  colors,
  adjacency,
  selectedId,
  indexById,
  onSelect,
  hoveredId,
  onHovered,
}: InstancedNodesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const selectedIndex = selectedId != null ? indexById.get(selectedId) ?? -1 : -1;

  const { geometry, material } = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const m = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    return { geometry: g, material: m };
  }, []);

  /* eslint-disable react-hooks/immutability -- imperative InstancedMesh setup. */
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < nodeCount; i++) {
      dummy.position.copy(positions[i]);
      dummy.scale.setScalar(scales[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [nodeCount, positions, scales, colors]);
  /* eslint-enable react-hooks/immutability */

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const applyNodeDim = (sel: number) => {
    const mesh = meshRef.current;
    if (!mesh || !mesh.instanceColor) return;
    if (sel === -1) {
      for (let i = 0; i < nodeCount; i++) mesh.setColorAt(i, colors[i]);
    } else {
      // Connected node indices for the selected node: for each edge incident
      // to the selection, mark the other endpoint.
      const connSet = new Set<number>();
      for (const edgeIdx of adjacency[sel] ?? []) {
        const [a, b] = edgeEndpoints[edgeIdx];
        connSet.add(a);
        connSet.add(b);
      }
      for (let i = 0; i < nodeCount; i++) {
        if (i === sel) {
          mesh.setColorAt(
            i,
            colors[i].clone().lerp(new THREE.Color("#ffffff"), 0.45),
          );
        } else if (connSet.has(i)) {
          mesh.setColorAt(i, colors[i]);
        } else {
          mesh.setColorAt(i, colors[i].clone().multiplyScalar(DIM_FACTOR));
        }
      }
    }
    mesh.instanceColor.needsUpdate = true;
  };

  const applyHoverScale = (hovered: string | null) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    if (hovered == null) {
      for (let i = 0; i < nodeCount; i++) {
        dummy.position.copy(positions[i]);
        dummy.scale.setScalar(scales[i]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
    } else {
      const idx = indexById.get(hovered);
      if (idx == null) return;
      for (let i = 0; i < nodeCount; i++) {
        const s = i === idx ? scales[i] * 1.5 : scales[i];
        dummy.position.copy(positions[i]);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  useEffect(() => {
    applyHoverScale(hoveredId);
  }, [hoveredId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    applyNodeDim(selectedIndex);
  }, [selectedIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePointerOver = (instanceId: number | undefined) => {
    if (instanceId == null) return;
    const id = [...indexById.keys()].find((k) => indexById.get(k) === instanceId);
    onHovered(id ?? null);
  };

  const handleClick = (instanceId: number | undefined) => {
    if (instanceId == null) return;
    const id = [...indexById.keys()].find((k) => indexById.get(k) === instanceId);
    if (id == null) return;
    onSelect(selectedId === id ? null : id);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, nodeCount]}
      onPointerOver={(e) => {
        e.stopPropagation();
        handlePointerOver(e.instanceId);
      }}
      onPointerOut={() => onHovered(null)}
      onClick={(e) => {
        e.stopPropagation();
        handleClick(e.instanceId);
      }}
    />
  );
}

/** Connected node indices (excluding self) for a given selected index. */
function connectedNodeIndices(selected: number): Set<number> {
  // This is replaced by the memoized adjacency map built in the parent. Kept
  // as a safety fallback that returns an empty set when no adjacency is given.
  return new Set<number>();
}

interface EdgeLinesProps {
  edges: GraphEdgeData[];
  positions: THREE.Vector3[];
  indexById: Map<string, number>;
  edgeEndpoints: number[][];
  adjacency: number[][];
  selectedId: string | null;
}

function EdgeLines({
  edges,
  positions,
  indexById,
  edgeEndpoints,
  adjacency,
  selectedId,
}: EdgeLinesProps) {
  const selectedIndex = selectedId != null ? indexById.get(selectedId) ?? -1 : -1;
  const edgeCount = edges.length;

  const { geometry, material } = useMemo(() => {
    const pos = new Float32Array(edgeCount * 6);
    const colors = new Float32Array(edgeCount * 6);
    for (let i = 0; i < edgeCount; i++) {
      const [ai, bi] = edgeEndpoints[i];
      const a = positions[ai];
      const b = positions[bi];
      pos[i * 6] = a.x;
      pos[i * 6 + 1] = a.y;
      pos[i * 6 + 2] = a.z;
      pos[i * 6 + 3] = b.x;
      pos[i * 6 + 4] = b.y;
      pos[i * 6 + 5] = b.z;
      const intensity = 0.4 + edges[i].strength * 0.6;
      for (let c = 0; c < 6; c += 3) {
        colors[i * 6 + c] = DEFAULT_EDGE.r * intensity;
        colors[i * 6 + c + 1] = DEFAULT_EDGE.g * intensity;
        colors[i * 6 + c + 2] = DEFAULT_EDGE.b * intensity;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const m = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: g, material: m };
  }, [edgeCount, edges, edgeEndpoints, positions]);

  const applyHighlight = (sel: number) => {
    const attr = geometry.getAttribute("color") as THREE.BufferAttribute;
    const colors = attr.array as Float32Array;
    if (sel === -1) {
      for (let i = 0; i < edgeCount; i++) {
        const intensity = 0.4 + edges[i].strength * 0.6;
        for (let c = 0; c < 6; c += 3) {
          colors[i * 6 + c] = DEFAULT_EDGE.r * intensity;
          colors[i * 6 + c + 1] = DEFAULT_EDGE.g * intensity;
          colors[i * 6 + c + 2] = DEFAULT_EDGE.b * intensity;
        }
      }
    } else {
      const connectedEdgeSet = new Set<number>(adjacency[sel] ?? []);
      for (let i = 0; i < edgeCount; i++) {
        if (connectedEdgeSet.has(i)) {
          for (let c = 0; c < 6; c += 3) {
            colors[i * 6 + c] = FOCUS_EDGE.r;
            colors[i * 6 + c + 1] = FOCUS_EDGE.g;
            colors[i * 6 + c + 2] = FOCUS_EDGE.b;
          }
        } else {
          const intensity = (0.4 + edges[i].strength * 0.6) * 0.12;
          for (let c = 0; c < 6; c += 3) {
            colors[i * 6 + c] = DEFAULT_EDGE.r * intensity;
            colors[i * 6 + c + 1] = DEFAULT_EDGE.g * intensity;
            colors[i * 6 + c + 2] = DEFAULT_EDGE.b * intensity;
          }
        }
      }
    }
    attr.needsUpdate = true;
  };

  useEffect(() => {
    applyHighlight(selectedIndex);
  }, [selectedIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return <lineSegments geometry={geometry} material={material} />;
}

function HoverLabel({ id, positions, indexById, nodeCount }: { id: string; positions: THREE.Vector3[]; indexById: Map<string, number>; nodeCount: number }) {
  void nodeCount;
  const idx = indexById.get(id);
  if (idx == null) return null;
  const p = positions[idx];
  return (
    <Html
      center
      position={[p.x, p.y + 0.45, p.z]}
      zIndexRange={[20, 0]}
      distanceFactor={6}
    >
      <div
        style={{
          background: "rgba(16, 15, 26, 0.85)",
          border: "1px solid rgba(180, 160, 255, 0.3)",
          borderRadius: 8,
          padding: "6px 10px",
          color: "#f0edff",
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: "nowrap",
          boxShadow: "0 4px 18px rgba(0,0,0,0.45)",
          pointerEvents: "none",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div>{id}</div>
      </div>
    </Html>
  );
}

function CameraRig({ selectedId, positions, indexById, resetSignal }: { selectedId: string | null; positions: THREE.Vector3[]; indexById: Map<string, number>; resetSignal: number }) {
  const { camera } = useThree();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));
  const cameraRef = useRef(new THREE.Vector3(0, 0.6, 7.6));
  const initializedRef = useRef(false);
  const transitionUntilRef = useRef(-Infinity);

  useEffect(() => {
    if (selectedId == null) {
      targetRef.current.set(0, 0, 0);
      cameraRef.current.set(0, 0.6, 7.6);
    } else {
      const idx = indexById.get(selectedId);
      const node = idx != null ? positions[idx] : null;
      if (node) {
        targetRef.current.set(node.x, node.y, node.z);
        cameraRef.current.copy(targetRef.current).add(new THREE.Vector3(0, 0.6, 3.4));
      }
    }
    transitionUntilRef.current = performance.now() + (selectedId == null ? 900 : 1100);
  }, [selectedId, positions, indexById]);

  useEffect(() => {
    if (resetSignal > 0) {
      targetRef.current.set(0, 0, 0);
      cameraRef.current.set(0, 0.6, 7.6);
      transitionUntilRef.current = performance.now() + 900;
      initializedRef.current = false;
    }
  }, [resetSignal]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (!initializedRef.current) {
      controls.target.copy(targetRef.current);
      initializedRef.current = true;
    }
    if (performance.now() < transitionUntilRef.current) {
      controls.target.lerp(targetRef.current, 0.08);
      camera.position.lerp(cameraRef.current, 0.08);
      controls.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      zoomSpeed={0.7}
    />
  );
}

export function Universe3D({ nodes, edges, selectedId, onSelect }: Universe3DProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { ref, inView } = useInView<HTMLDivElement>();

  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    nodes.forEach((n, i) => m.set(n.id, i));
    return m;
  }, [nodes]);

  const positions3 = useMemo(() => {
    const seed = seedPositions(nodes, 3);
    const relaxed = relaxNodes(nodes, edges, seed, 120);
    return nodes.map((n) => {
      const p = relaxed.get(n.id);
      return new THREE.Vector3(p?.x ?? 0, p?.y ?? 0, p?.z ?? 0);
    });
  }, [nodes, edges]);

  const scales = useMemo(() => {
    const arr = new Float32Array(nodes.length);
    nodes.forEach((n, i) => {
      arr[i] = 0.07 + n.weight * 0.1;
    });
    return arr;
  }, [nodes]);

  const colors = useMemo(() => {
    return nodes.map((n) => {
      const rgb = hexToRgb(entityColor(n.type));
      return new THREE.Color(rgb.r, rgb.g, rgb.b);
    });
  }, [nodes]);

  const edgeEndpoints = useMemo(() => {
    return edges.map((e) => {
      const a = indexById.get(e.source) ?? -1;
      const b = indexById.get(e.target) ?? -1;
      return [a, b] as [number, number];
    });
  }, [edges, indexById]);

  const adjacency = useMemo(() => {
    const adj: number[][] = Array.from({ length: nodes.length }, () => []);
    edges.forEach((e, i) => {
      const a = indexById.get(e.source);
      const b = indexById.get(e.target);
      if (a != null) adj[a].push(i);
      if (b != null) adj[b].push(i);
    });
    return adj;
  }, [edges, indexById, nodes.length]);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  };

  if (nodes.length === 0) return null;

  return (
    <div
      ref={(el) => {
        ref.current = el;
        containerRef.current = el;
      }}
      className="relative h-full min-h-[480px] w-full overflow-hidden rounded-2xl border border-soft-white/10 bg-midnight/40"
    >
      <CanvasMountGate>
        <Canvas
          frameloop={inView ? "always" : "never"}
          camera={{ position: [0, 0.6, 7.6], fov: 50 }}
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
          style={{ width: "100%", height: "100%", display: "block" }}
          onPointerMissed={() => onSelect(null)}
        >
          <InstancedNodes
            nodeCount={nodes.length}
            positions={positions3}
            scales={scales}
            colors={colors}
            adjacency={adjacency}
            selectedId={selectedId}
            indexById={indexById}
            onSelect={onSelect}
            hoveredId={hoveredId}
            onHovered={setHoveredId}
          />
          <EdgeLines
            edges={edges}
            positions={positions3}
            indexById={indexById}
            edgeEndpoints={edgeEndpoints}
            adjacency={adjacency}
            selectedId={selectedId}
          />
          {hoveredId && (
            <HoverLabel
              id={hoveredId}
              positions={positions3}
              indexById={indexById}
              nodeCount={nodes.length}
            />
          )}
          <CameraRig
            selectedId={selectedId}
            positions={positions3}
            indexById={indexById}
            resetSignal={resetSignal}
          />
        </Canvas>
      </CanvasMountGate>

      <div className="absolute right-3 top-3 flex gap-2">
        <button
          type="button"
          onClick={() => setResetSignal((s) => s + 1)}
          className="rounded-lg border border-soft-white/10 bg-midnight/80 px-3 py-1.5 text-xs font-medium text-soft-white backdrop-blur transition-colors hover:bg-soft-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
          aria-label="Reset camera"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded-lg border border-soft-white/10 bg-midnight/80 px-3 py-1.5 text-xs font-medium text-soft-white backdrop-blur transition-colors hover:bg-soft-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
          aria-label="Toggle fullscreen"
        >
          Fullscreen
        </button>
      </div>
    </div>
  );
}
