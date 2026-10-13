'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useStudio } from './studio-context';
import { BL21_LAYERS, ECOLI_LAYERS, PICHIA_LAYERS, S288C_LAYERS, type AtlasLayer } from '@/lib/studio-model';

export interface CellToggles {
  membrana: boolean;
  nucleo: boolean;
  mitocondrias: boolean;
  flagelos: boolean;
  pared: boolean;
  citosol: boolean;
  membranaExterna: boolean;
}

const PART_COLOR: Record<string, number> = {
  promoter: 0x3fb950,
  rbs: 0x58a6ff,
  cds: 0xd29922,
  gene: 0xd29922,
  reporter: 0xbc8cff,
  terminator: 0xf85149,
};

function labelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#c9d1d9';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 40);
  }
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.6, 0.4, 1);
  return sprite;
}

interface SceneView {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  renderer: THREE.WebGLRenderer;
  dispose: () => void;
}

function WebGLFallback() {
  return (
    <p className="muted" style={{ padding: 12 }}>
      WebGL no está disponible en este navegador. Suele pasar en Windows cuando la aceleración gráfica está desactivada o la bloquea una política. El resto de SynBio Studio sigue usable; esta vista 3D no puede dibujar.
    </p>
  );
}

function webglSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl || !('getParameter' in gl)) return false;
    const lose = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function mount(host: HTMLDivElement): SceneView | null {
  if (!webglSupported()) return null;
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 640, host.clientHeight || 420);
    renderer.localClippingEnabled = true;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    const camera = new THREE.PerspectiveCamera(45, (host.clientWidth || 640) / (host.clientHeight || 420), 0.1, 100);
    camera.position.set(4, 2.4, 6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(4, 6, 3);
    scene.add(key);
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      try {
        controls.update();
        renderer?.render(scene, camera);
      } catch {
        cancelAnimationFrame(frame);
      }
    };
    loop();
    const resize = () => {
      const w = host.clientWidth || 640;
      const h = host.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer?.setSize(w, h);
    };
    window.addEventListener('resize', resize);
    const active = renderer;
    return {
      scene, camera, controls, renderer: active,
      dispose() {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', resize);
        controls.dispose();
        active.dispose();
        if (active.domElement.parentNode === host) host.removeChild(active.domElement);
      },
    };
  } catch {
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    }
    return null;
  }
}

export function ThreeConstruct() {
  const studio = useStudio();
  const host = useRef<HTMLDivElement>(null);
  const [missing, setMissing] = useState(false);
  const nodes = studio.construct.nodes;
  const edges = studio.construct.edges;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const view = mount(el);
    if (!view) {
      setMissing(true);
      return;
    }
    setMissing(false);
    const visible = nodes.filter(node => studio.group === 'todos' || node.type === studio.group);
    const placed = new Map<string, THREE.Vector3>();
    visible.forEach((node, index) => {
      const angle = (index / Math.max(visible.length, 1)) * Math.PI * 2;
      const radius = 2.2 * studio.separation;
      const position = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(index * 0.7) * 0.35 * studio.separation, Math.sin(angle) * radius);
      placed.set(node.id, position);
      const color = PART_COLOR[node.type] ?? 0x8b949e;
      const mesh = new THREE.Mesh(
        node.type === 'promoter' ? new THREE.ConeGeometry(0.18, 0.45, 5) : new THREE.BoxGeometry(0.38, 0.28, 0.28),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45 }),
      );
      mesh.position.copy(position);
      view.scene.add(mesh);
      if (studio.showLabels) {
        const sprite = labelSprite(node.name);
        sprite.position.copy(position).add(new THREE.Vector3(0, 0.45, 0));
        view.scene.add(sprite);
      }
    });
    for (const edge of edges) {
      const a = placed.get(edge.from);
      const b = placed.get(edge.to);
      if (!a || !b) continue;
      const color = edge.kind === 'repression' ? 0xf85149 : edge.kind === 'activation' ? 0x3fb950 : edge.kind === 'circular' ? 0x58a6ff : 0x8b949e;
      const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
      view.scene.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color })));
    }
    const orbit = 7;
    view.camera.position.set(Math.cos(studio.rotation) * orbit, 2.6, Math.sin(studio.rotation) * orbit);
    view.camera.lookAt(0, 0, 0);
    return () => view.dispose();
  }, [nodes, edges, studio.group, studio.separation, studio.showLabels, studio.rotation]);

  return <div ref={host} className="three-host">{missing && <WebGLFallback />}</div>;
}

function cellMaterial(color: string, opacity: number, clip: THREE.Plane | null, glow = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    roughness: 0.45,
    emissive: new THREE.Color(color),
    emissiveIntensity: glow,
    side: THREE.DoubleSide,
    clippingPlanes: clip ? [clip] : [],
  });
}

export function ThreeCell({ onSelect, toggles, induction = 0.35, surface = false }: { onSelect: (layer: AtlasLayer) => void; toggles?: CellToggles; induction?: number; surface?: boolean }) {
  const studio = useStudio();
  const host = useRef<HTMLDivElement>(null);
  const [missing, setMissing] = useState(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const layers = studio.organism === 'bl21' ? BL21_LAYERS : studio.organism === 's288c' ? S288C_LAYERS : studio.organism === 'pichia' ? PICHIA_LAYERS : ECOLI_LAYERS;
  const show = toggles ?? { membrana: true, nucleo: true, mitocondrias: true, flagelos: true, pared: true, citosol: true, membranaExterna: true };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const view = mount(el);
    if (!view) {
      setMissing(true);
      return;
    }
    setMissing(false);
    const bacterium = studio.organism === 'ecoli' || studio.organism === 'bl21';
    const clip = studio.cut && !surface ? new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0) : null;
    const explode = studio.explode / 28;
    const shown = studio.isolate ? layers.filter(layer => layer.group === studio.isolate) : layers;
    const phenotype = studio.circuit?.transcriptionUnits.flatMap(unit => unit.parts).find(part => part.type === 'reporter')?.name;
    const cyto = phenotype === 'RFP' ? '#f85149' : phenotype === 'GFP' || phenotype === 'gfp' ? '#3fb950' : '#6ea8fe';
    const glow = 0.15 + induction * 0.8;

    if (bacterium) {
      if (show.membranaExterna || show.pared) {
        const shell = new THREE.Mesh(new THREE.SphereGeometry(1.7, 48, 32), cellMaterial('#c47b3a', studio.cut ? 0.28 : 0.45, clip, 0.05));
        shell.scale.set(1.7, 0.72, 0.72);
        view.scene.add(shell);
      }
      if (show.citosol || show.membrana) {
        const inner = new THREE.Mesh(new THREE.SphereGeometry(1.15, 40, 24), cellMaterial(cyto, 0.55, clip, glow));
        inner.scale.set(1.7, 0.72, 0.72);
        view.scene.add(inner);
      }
      if (studio.organism === 'bl21' && show.flagelos) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(2.4, 0.05, 0),
          new THREE.Vector3(3.2, 0.45, 0.2),
          new THREE.Vector3(4.0, -0.15, 0.45),
          new THREE.Vector3(4.8, 0.25, -0.1),
        ]);
        view.scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.035, 6, false), cellMaterial('#e6edf3', 0.95, null)));
      }
    } else {
      if (show.pared) view.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.55, 48, 32), cellMaterial('#b08968', studio.cut ? 0.22 : 0.4, clip, 0.04)));
      if (show.membrana || show.citosol) view.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.35, 40, 24), cellMaterial(cyto, 0.35, clip, glow)));
    }
    const particleCount = Math.round(4 + induction * 10);
    for (let i = 0; i < particleCount; i++) {
      const speck = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), cellMaterial(cyto, 0.9, clip, glow));
      const angle = (i / particleCount) * Math.PI * 2;
      speck.position.set(Math.cos(angle) * 0.45, Math.sin(angle * 2) * 0.2, Math.sin(angle) * 0.3);
      view.scene.add(speck);
    }

    for (const layer of shown) {
      if (layer.id === 'om' || layer.id === 'peri' || layer.id === 'im' || layer.id === 'cyto' || layer.id === 'wall' || layer.id === 'pm' || layer.id === 'surf') continue;
      if (layer.id === 'flag') continue;
      if ((layer.id === 'nuc') && !show.nucleo) continue;
      if (layer.id === 'mit' && !show.mitocondrias) continue;
      const offset = new THREE.Vector3(layer.x, layer.y, layer.z).multiplyScalar(0.04 * (1 + explode));
      let mesh: THREE.Mesh;
      if (layer.id === 'nuc') {
        mesh = new THREE.Mesh(
          studio.organism === 'ecoli' ? new THREE.SphereGeometry(0.45, 24, 16) : new THREE.SphereGeometry(0.42, 24, 16),
          cellMaterial(layer.color, 0.9, clip),
        );
        if (studio.organism === 'ecoli') mesh.scale.set(1.4, 0.7, 0.7);
      } else if (layer.id === 'vac') {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 16), cellMaterial(layer.color, 0.75, clip));
      } else if (layer.id === 'mit') {
        mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.28, 4, 10), cellMaterial(layer.color, 0.95, clip));
      } else if (layer.id === 'er') {
        mesh = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 24), cellMaterial(layer.color, 0.85, clip));
      } else {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), cellMaterial(layer.color, 1, clip));
      }
      mesh.position.copy(offset);
      mesh.userData.layer = layer;
      view.scene.add(mesh);
      if (studio.showLabels) {
        const sprite = labelSprite(layer.name);
        sprite.position.copy(offset).add(new THREE.Vector3(0, 0.35, 0));
        sprite.scale.set(1.2, 0.3, 1);
        view.scene.add(sprite);
      }
    }

    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onClick = (event: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(pointer, view.camera);
      const hit = ray.intersectObjects(view.scene.children, false).find(item => item.object.userData.layer);
      if (hit) selectRef.current(hit.object.userData.layer as AtlasLayer);
    };
    el.addEventListener('click', onClick);
    const distance = 6 / studio.zoom;
    view.camera.position.set(distance * 0.8, distance * 0.35, distance);
    view.camera.lookAt(0, 0, 0);
    return () => {
      el.removeEventListener('click', onClick);
      view.dispose();
    };
  }, [layers, studio.organism, studio.cut, studio.explode, studio.isolate, studio.zoom, studio.showLabels, studio.circuit, show, induction, surface]);

  return <div ref={host} className="three-host">{missing && <WebGLFallback />}</div>;
}

export function Quadrant3D() {
  const host = useRef<HTMLDivElement>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const view = mount(el);
    if (!view) {
      setMissing(true);
      return;
    }
    const spots = [
      { geo: new THREE.SphereGeometry(0.28, 20, 16), color: 0xf0883e, at: [-0.8, 0.2, 0] },
      { geo: new THREE.SphereGeometry(0.18, 16, 12), color: 0xf0883e, at: [0.2, 0.6, 0.4] },
      { geo: new THREE.BoxGeometry(0.45, 0.3, 0.3), color: 0x58a6ff, at: [0.7, -0.2, -0.2] },
      { geo: new THREE.BoxGeometry(0.28, 0.28, 0.5), color: 0x1f6feb, at: [-0.2, -0.45, 0.5] },
    ];
    for (const spot of spots) {
      const mesh = new THREE.Mesh(spot.geo, new THREE.MeshStandardMaterial({ color: spot.color, roughness: 0.4 }));
      mesh.position.set(spot.at[0], spot.at[1], spot.at[2]);
      view.scene.add(mesh);
    }
    view.camera.position.set(2.4, 1.4, 2.8);
    return () => view.dispose();
  }, []);
  return <div ref={host} className="three-host short">{missing && <WebGLFallback />}</div>;
}
