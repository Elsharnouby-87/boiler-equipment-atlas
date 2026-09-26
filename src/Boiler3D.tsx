import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraCommand, ContextMode, ViewMode } from './modelTypes';

type Props = {
  mode: ViewMode;
  selected: string;
  labels: boolean;
  flow: boolean;
  explode: boolean;
  contextMode: ContextMode;
  cameraCommand: CameraCommand;
  onSelect: (name: string) => void;
};

type SceneState = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  root: THREE.Group;
  components: Map<string, THREE.Group>;
  labelGroup: THREE.Group;
  flowGroup: THREE.Group;
};

const explodeOffsets: Record<string, THREE.Vector3> = {
  'Burner & Ignition': new THREE.Vector3(-1.8, 0, 0),
  'Front Smokebox': new THREE.Vector3(-0.9, 0, 0),
  'Rear Smokebox': new THREE.Vector3(0.9, 0, 0),
  'Stack / Flue Outlet': new THREE.Vector3(0.8, 0.8, 0),
  'Safety Valve': new THREE.Vector3(0, 0.75, 0),
  'Steam Outlet': new THREE.Vector3(0.4, 0.6, 0),
  'Pressure Controls': new THREE.Vector3(-0.35, 0.5, 0),
  'Level Gauge': new THREE.Vector3(0, 0, 0.7),
  'Feedwater Inlet': new THREE.Vector3(0.55, 0, 0.5),
  'Blowdown Valve': new THREE.Vector3(0, -0.75, 0),
};

function material(
  color: THREE.ColorRepresentation,
  metalness = 0.55,
  roughness = 0.42,
  opacity = 1,
  emissive?: THREE.ColorRepresentation,
) {
  const m = new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    transparent: opacity < 1,
    opacity,
    emissive: emissive ?? 0x000000,
    emissiveIntensity: emissive ? 0.5 : 0,
  });
  return m;
}

function tagMaterial(mesh: THREE.Mesh, baseOpacity: number, kind: 'shell' | 'internal' | 'fluid' | 'utility' = 'internal') {
  mesh.userData.baseOpacity = baseOpacity;
  mesh.userData.kind = kind;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach(mat => {
    mat.transparent = baseOpacity < 1;
    mat.opacity = baseOpacity;
  });
}

function cylinderX(radius: number, length: number, mat: THREE.Material, segments = 48) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), mat);
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function cylinderY(radius: number, height: number, mat: THREE.Material, segments = 32) {
  return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), mat);
}

function box(x: number, y: number, z: number, mat: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat);
}

function makeLabel(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(3,17,28,.90)';
  ctx.strokeStyle = 'rgba(78,190,247,.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(4, 4, 504, 88, 16);
  ctx.fill();
  ctx.stroke();
  ctx.font = '700 28px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e9f5fb';
  ctx.fillText(text, 256, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(2.5, 0.47, 1);
  sprite.renderOrder = 20;
  sprite.userData.labelTexture = texture;
  return sprite;
}

function addValve(group: THREE.Group, position: THREE.Vector3, scale = 1) {
  const stemMat = material('#aeb9bf', 0.8, 0.28);
  const bodyMat = material('#5f6f78', 0.78, 0.34);
  const body = cylinderY(0.16 * scale, 0.35 * scale, bodyMat, 20);
  body.position.copy(position);
  tagMaterial(body, 1, 'utility');
  group.add(body);

  const stem = cylinderY(0.055 * scale, 0.42 * scale, stemMat, 14);
  stem.position.set(position.x, position.y + 0.34 * scale, position.z);
  tagMaterial(stem, 1, 'utility');
  group.add(stem);

  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.22 * scale, 0.035 * scale, 10, 28),
    material('#d9a45e', 0.75, 0.3),
  );
  wheel.rotation.x = Math.PI / 2;
  wheel.position.set(position.x, position.y + 0.55 * scale, position.z);
  tagMaterial(wheel, 1, 'utility');
  group.add(wheel);
}

export default function Boiler3D({ mode, selected, labels, flow, explode, contextMode, cameraCommand, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SceneState | null>(null);
  const modeRef = useRef(mode);
  const selectedRef = useRef(selected);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#06111b');

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    camera.position.set(10.6, 5.7, 11.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.localClippingEnabled = true;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 4;
    controls.maxDistance = 32;
    controls.target.set(0, 0.2, 0);

    scene.add(new THREE.HemisphereLight('#a9d9ef', '#06111b', 1.2));
    const key = new THREE.DirectionalLight('#cfeeff', 2.4);
    key.position.set(-7, 10, 9);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#2fa8e4', 1.2);
    rim.position.set(8, 4, -9);
    scene.add(rim);
    const fireLight = new THREE.PointLight('#ff6b1a', 3.2, 14, 2);
    fireLight.position.set(-2.4, -0.7, 0);
    scene.add(fireLight);

    const grid = new THREE.GridHelper(30, 30, '#1c5a78', '#123348');
    grid.position.y = -3.15;
    (grid.material as THREE.Material).opacity = 0.27;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const root = new THREE.Group();
    root.rotation.y = -0.12;
    scene.add(root);

    const components = new Map<string, THREE.Group>();
    const labelGroup = new THREE.Group();
    const flowGroup = new THREE.Group();
    root.add(labelGroup, flowGroup);

    const component = (name: string) => {
      const g = new THREE.Group();
      g.name = name;
      g.userData.component = name;
      g.userData.basePosition = g.position.clone();
      root.add(g);
      components.set(name, g);
      return g;
    };
    const mark = (mesh: THREE.Object3D, name: string) => {
      mesh.userData.component = name;
    };
    const addLabel = (name: string, pos: THREE.Vector3) => {
      const s = makeLabel(name);
      s.position.copy(pos);
      s.userData.component = name;
      labelGroup.add(s);
    };

    // BOILER SHELL
    {
      const name = 'Boiler Shell';
      const g = component(name);
      const shell = cylinderX(2.35, 8.1, material('#536774', 0.78, 0.32));
      shell.castShadow = true;
      shell.receiveShadow = true;
      tagMaterial(shell, 1, 'shell');
      mark(shell, name);
      g.add(shell);

      [-3.2, 3.2].forEach(x => {
        const ring = cylinderX(2.43, 0.10, material('#8fa0a8', 0.86, 0.24), 64);
        ring.position.x = x;
        tagMaterial(ring, 1, 'shell');
        mark(ring, name);
        g.add(ring);
      });

      [-2.6, 2.6].forEach(x => {
        const saddle = box(1.15, 0.45, 3.0, material('#394850', 0.8, 0.42));
        saddle.position.set(x, -2.62, 0);
        saddle.castShadow = true;
        tagMaterial(saddle, 1, 'utility');
        mark(saddle, name);
        g.add(saddle);
      });
      addLabel(name, new THREE.Vector3(0, 2.9, -1.7));
    }

    // WATER + STEAM SPACES
    {
      const name = 'Water Space';
      const g = component(name);
      const water = box(7.35, 2.3, 3.85, material('#1d9bd1', 0.08, 0.2, 0.12));
      water.position.y = -0.75;
      tagMaterial(water, 0.12, 'fluid');
      mark(water, name);
      g.add(water);
      addLabel(name, new THREE.Vector3(0.8, -1.75, 2.0));
    }
    {
      const name = 'Steam Space';
      const g = component(name);
      const steam = box(7.2, 1.05, 3.75, material('#d9f4ff', 0.02, 0.18, 0.085));
      steam.position.y = 1.35;
      tagMaterial(steam, 0.085, 'fluid');
      mark(steam, name);
      g.add(steam);
      addLabel(name, new THREE.Vector3(0.6, 1.75, 2.05));
    }

    // FURNACE
    {
      const name = 'Furnace Tube';
      const g = component(name);
      const furnace = cylinderX(0.82, 6.7, material('#2b3338', 0.82, 0.38));
      furnace.position.y = -0.82;
      tagMaterial(furnace, 1, 'internal');
      mark(furnace, name);
      g.add(furnace);

      const inner = cylinderX(0.68, 6.45, material('#8d2b10', 0.2, 0.5, 0.26, '#ff4e13'));
      inner.position.y = -0.82;
      tagMaterial(inner, 0.26, 'internal');
      mark(inner, name);
      g.add(inner);
      addLabel(name, new THREE.Vector3(0.2, -0.85, 1.2));
    }

    // FIRE TUBES
    {
      const name = 'Fire Tubes';
      const g = component(name);
      const coords: [number, number][] = [];
      [-1.35, -0.9, -0.45, 0, 0.45, 0.9, 1.35].forEach(y => {
        [-1.45, -0.95, -0.45, 0.45, 0.95, 1.45].forEach(z => {
          if (y < -0.45 && Math.abs(z) < 0.95) return;
          if (Math.hypot(y * 0.92, z) < 1.95) coords.push([y, z]);
        });
      });
      coords.forEach(([y, z]) => {
        const t = cylinderX(0.105, 6.72, material('#9b7b56', 0.78, 0.34));
        t.position.set(0, y + 0.18, z);
        tagMaterial(t, 1, 'internal');
        mark(t, name);
        g.add(t);
      });
      addLabel(name, new THREE.Vector3(0.2, 0.55, -2.15));
    }

    // TUBE SHEETS
    {
      const name = 'Tube Sheets';
      const g = component(name);
      [-3.46, 3.46].forEach(x => {
        const sheet = cylinderX(2.16, 0.16, material('#6e7d83', 0.86, 0.3), 56);
        sheet.position.x = x;
        tagMaterial(sheet, 0.72, 'internal');
        mark(sheet, name);
        g.add(sheet);
      });
      addLabel(name, new THREE.Vector3(3.5, 1.8, 1.7));
    }

    // FRONT SMOKEBOX + BURNER
    {
      const name = 'Front Smokebox';
      const g = component(name);
      const smoke = cylinderX(2.2, 0.65, material('#3c4c55', 0.8, 0.38));
      smoke.position.x = -3.82;
      tagMaterial(smoke, 0.92, 'shell');
      mark(smoke, name);
      g.add(smoke);
      const door = cylinderX(2.05, 0.12, material('#596c75', 0.84, 0.3));
      door.position.x = -4.18;
      tagMaterial(door, 1, 'shell');
      mark(door, name);
      g.add(door);
      addLabel(name, new THREE.Vector3(-4.0, 2.45, 0));
    }
    {
      const name = 'Burner & Ignition';
      const g = component(name);
      const body = cylinderX(0.58, 1.0, material('#4f626d', 0.82, 0.34));
      body.position.set(-4.68, -0.82, 0);
      tagMaterial(body, 1, 'utility');
      mark(body, name);
      g.add(body);

      const throat = cylinderX(0.42, 0.5, material('#8c9394', 0.65, 0.38));
      throat.position.set(-4.05, -0.82, 0);
      tagMaterial(throat, 1, 'utility');
      mark(throat, name);
      g.add(throat);

      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.46, 2.9, 26, 1, true),
        material('#ff7a18', 0.02, 0.2, 0.83, '#ff4311'),
      );
      flame.rotation.z = -Math.PI / 2;
      flame.position.set(-2.45, -0.82, 0);
      tagMaterial(flame, 0.83, 'internal');
      mark(flame, name);
      g.add(flame);

      const scanner = box(0.35, 0.24, 0.28, material('#c7aa5c', 0.72, 0.28));
      scanner.position.set(-4.38, -0.18, 0.42);
      tagMaterial(scanner, 1, 'utility');
      mark(scanner, name);
      g.add(scanner);
      addLabel(name, new THREE.Vector3(-4.7, 0.35, 1.1));
    }

    // REAR SMOKEBOX
    {
      const name = 'Rear Smokebox';
      const g = component(name);
      const smoke = cylinderX(2.18, 0.7, material('#3d4d55', 0.8, 0.38));
      smoke.position.x = 3.82;
      tagMaterial(smoke, 0.92, 'shell');
      mark(smoke, name);
      g.add(smoke);
      addLabel(name, new THREE.Vector3(4.0, 2.35, 0));
    }

    // STACK
    {
      const name = 'Stack / Flue Outlet';
      const g = component(name);
      const riser = cylinderY(0.48, 2.6, material('#485b65', 0.8, 0.35), 28);
      riser.position.set(3.05, 3.15, 0);
      tagMaterial(riser, 1, 'utility');
      mark(riser, name);
      g.add(riser);
      const base = box(1.05, 0.75, 1.2, material('#43545d', 0.8, 0.38));
      base.position.set(3.05, 2.05, 0);
      tagMaterial(base, 1, 'utility');
      mark(base, name);
      g.add(base);
      addLabel(name, new THREE.Vector3(3.1, 4.7, 0));
    }

    // SAFETY VALVE
    {
      const name = 'Safety Valve';
      const g = component(name);
      const pipe = cylinderY(0.16, 0.52, material('#a4b2b8', 0.86, 0.25));
      pipe.position.set(0.25, 2.55, 0.25);
      tagMaterial(pipe, 1, 'utility');
      mark(pipe, name);
      g.add(pipe);
      addValve(g, new THREE.Vector3(0.25, 2.95, 0.25), 0.95);
      g.traverse(o => { if (o instanceof THREE.Mesh) mark(o, name); });
      addLabel(name, new THREE.Vector3(0.25, 3.85, 0.25));
    }

    // STEAM OUTLET
    {
      const name = 'Steam Outlet';
      const g = component(name);
      const vertical = cylinderY(0.22, 0.85, material('#94a6af', 0.85, 0.27));
      vertical.position.set(1.45, 2.65, -0.3);
      tagMaterial(vertical, 1, 'utility');
      mark(vertical, name);
      g.add(vertical);
      addValve(g, new THREE.Vector3(1.45, 3.0, -0.3), 0.85);
      g.traverse(o => { if (o instanceof THREE.Mesh) mark(o, name); });
      addLabel(name, new THREE.Vector3(1.55, 3.9, -0.35));
    }

    // PRESSURE CONTROLS
    {
      const name = 'Pressure Controls';
      const g = component(name);
      [-1.25, -0.75].forEach((x, i) => {
        const stem = cylinderY(0.06, 0.35, material('#9aa9b0', 0.8, 0.3));
        stem.position.set(x, 2.5, -0.45);
        tagMaterial(stem, 1, 'utility');
        mark(stem, name);
        g.add(stem);
        const sensor = box(0.34, 0.44, 0.28, material(i ? '#52738a' : '#6c7880', 0.55, 0.45));
        sensor.position.set(x, 2.88, -0.45);
        tagMaterial(sensor, 1, 'utility');
        mark(sensor, name);
        g.add(sensor);
      });
      const gauge = cylinderX(0.34, 0.15, material('#d1d9dd', 0.45, 0.4), 32);
      gauge.position.set(-1.75, 2.75, -0.5);
      gauge.rotation.y = Math.PI / 2;
      tagMaterial(gauge, 1, 'utility');
      mark(gauge, name);
      g.add(gauge);
      addLabel(name, new THREE.Vector3(-1.2, 3.55, -0.45));
    }

    // LEVEL GAUGE
    {
      const name = 'Level Gauge';
      const g = component(name);
      const glass = cylinderY(0.09, 1.9, material('#67d7ff', 0.08, 0.12, 0.55));
      glass.position.set(-2.25, 0.5, 2.48);
      tagMaterial(glass, 0.55, 'utility');
      mark(glass, name);
      g.add(glass);
      [-0.45, 1.45].forEach(y => {
        const conn = cylinderY(0.15, 0.28, material('#8b999f', 0.8, 0.3));
        conn.position.set(-2.25, y, 2.48);
        tagMaterial(conn, 1, 'utility');
        mark(conn, name);
        g.add(conn);
      });
      addLabel(name, new THREE.Vector3(-2.3, 2.0, 2.65));
    }

    // FEEDWATER
    {
      const name = 'Feedwater Inlet';
      const g = component(name);
      const inlet = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.35, 24), material('#5baecf', 0.72, 0.32));
      inlet.rotation.x = Math.PI / 2;
      inlet.position.set(2.15, 0.75, 2.65);
      tagMaterial(inlet, 1, 'utility');
      mark(inlet, name);
      g.add(inlet);
      addValve(g, new THREE.Vector3(2.15, 0.75, 3.15), 0.68);
      g.traverse(o => { if (o instanceof THREE.Mesh) mark(o, name); });
      addLabel(name, new THREE.Vector3(2.15, 1.65, 3.1));
    }

    // BLOWDOWN
    {
      const name = 'Blowdown Valve';
      const g = component(name);
      const down = cylinderY(0.14, 1.0, material('#8f9ba0', 0.82, 0.3));
      down.position.set(0.1, -2.75, 0.35);
      tagMaterial(down, 1, 'utility');
      mark(down, name);
      g.add(down);
      addValve(g, new THREE.Vector3(0.1, -3.3, 0.35), 0.72);
      g.traverse(o => { if (o instanceof THREE.Mesh) mark(o, name); });
      addLabel(name, new THREE.Vector3(0.1, -3.85, 0.4));
    }

    // LEVEL SENSORS
    {
      const name = 'Level Sensors';
      const g = component(name);
      [-0.25, 0.15].forEach((dx, i) => {
        const probe = cylinderY(0.055, 0.85 + i * 0.18, material('#c5b05f', 0.72, 0.3));
        probe.position.set(-0.15 + dx, 2.3, 1.0);
        tagMaterial(probe, 1, 'utility');
        mark(probe, name);
        g.add(probe);
        const head = box(0.24, 0.22, 0.24, material('#586e79', 0.6, 0.42));
        head.position.set(-0.15 + dx, 2.75, 1.0);
        tagMaterial(head, 1, 'utility');
        mark(head, name);
        g.add(head);
      });
      addLabel(name, new THREE.Vector3(-0.15, 3.35, 1.1));
    }

    // Flow particles: hot gas + water/steam indication
    const hotMat = material('#ff8c38', 0.0, 0.2, 0.85, '#ff4e13');
    const blueMat = material('#53c8f5', 0.0, 0.2, 0.72, '#1aa6e1');
    for (let i = 0; i < 24; i += 1) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), hotMat.clone());
      p.userData.phase = i / 24;
      p.userData.flowType = 'gas';
      flowGroup.add(p);
    }
    for (let i = 0; i < 16; i += 1) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), blueMat.clone());
      p.userData.phase = i / 16;
      p.userData.flowType = 'water';
      flowGroup.add(p);
    }
    flowGroup.visible = false;

    const fitObject = (object: THREE.Object3D, multiplier = 1.75) => {
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) return;
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = Math.max(4.2, maxDim * multiplier);
      camera.position.set(center.x + distance * 0.72, center.y + distance * 0.42, center.z + distance * 0.82);
      controls.target.copy(center);
      controls.update();
    };

    const onPointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(root.children, true);
      let fallback: string | undefined;
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        let componentName: string | undefined;
        while (obj && obj !== root) {
          if (obj.userData.component) {
            componentName = obj.userData.component as string;
            break;
          }
          obj = obj.parent;
        }
        if (!componentName) continue;
        if (!fallback) fallback = componentName;
        if (componentName === 'Boiler Shell' && modeRef.current !== 'normal') continue;
        onSelect(componentName);
        return;
      }
      if (fallback) onSelect(fallback);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const t = clock.getElapsedTime();
      flowGroup.children.forEach((child) => {
        const phase = (child.userData.phase as number) ?? 0;
        if (child.userData.flowType === 'gas') {
          const u = (phase + t * 0.12) % 1;
          child.position.set(-3.25 + u * 6.5, -0.82 + Math.sin((u + phase) * Math.PI * 2) * 0.08, Math.sin((u * 4 + phase) * Math.PI) * 0.28);
        } else {
          const u = (phase + t * 0.07) % 1;
          child.position.set(-2.8 + Math.sin((phase + t * 0.03) * 5) * 2.3, -1.7 + u * 3.3, 1.55 + Math.cos(phase * 10) * 0.28);
        }
      });
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    stateRef.current = { scene, camera, renderer, controls, root, components, labelGroup, flowGroup };
    fitObject(root, 1.35);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      controls.dispose();
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => m.dispose());
        }
        if (obj instanceof THREE.Sprite) {
          const sm = obj.material as THREE.SpriteMaterial;
          sm.map?.dispose();
          sm.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, [onSelect]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;

    state.labelGroup.visible = labels;
    state.flowGroup.visible = flow;

    state.components.forEach((group, name) => {
      const base = (group.userData.basePosition as THREE.Vector3 | undefined) ?? new THREE.Vector3();
      const offset = explode ? (explodeOffsets[name] ?? new THREE.Vector3()) : new THREE.Vector3();
      group.position.copy(base).add(offset);

      const contextFactor = contextMode === 'full' || name === selected
        ? 1
        : contextMode === 'focus'
          ? 0.22
          : 0.035;

      group.traverse(obj => {
        if (!(obj instanceof THREE.Mesh)) return;
        const kind = (obj.userData.kind as string | undefined) ?? 'internal';
        const baseOpacity = (obj.userData.baseOpacity as number | undefined) ?? 1;
        let modeFactor = 1;
        if (kind === 'shell') {
          if (mode === 'cutaway') modeFactor = 0.18;
          if (mode === 'xray') modeFactor = 0.08;
        } else if (kind === 'internal' && mode === 'xray') {
          modeFactor = 0.58;
        } else if (kind === 'utility' && mode === 'xray') {
          modeFactor = 0.72;
        }
        const opacity = Math.max(0.015, baseOpacity * modeFactor * contextFactor);
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => {
          mat.opacity = opacity;
          mat.transparent = opacity < 0.98;
          mat.depthWrite = opacity > 0.25;
          mat.needsUpdate = true;
        });
      });
    });

    state.labelGroup.children.forEach(label => {
      const componentName = label.userData.component as string | undefined;
      label.visible = labels && (contextMode === 'full' || componentName === selected || contextMode === 'focus');
      if (label instanceof THREE.Sprite) {
        label.material.opacity = componentName === selected ? 1 : contextMode === 'full' ? 0.82 : 0.34;
      }
    });
  }, [mode, selected, labels, flow, explode, contextMode]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state || cameraCommand.id === 0) return;

    const fit = (object: THREE.Object3D, multiplier = 1.7) => {
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) return;
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = Math.max(3.8, maxDim * multiplier);
      state.camera.position.set(center.x + distance * 0.72, center.y + distance * 0.42, center.z + distance * 0.82);
      state.controls.target.copy(center);
      state.controls.update();
    };

    if (cameraCommand.action === 'fitBoiler' || cameraCommand.action === 'reset') {
      fit(state.root, 1.35);
    } else if (cameraCommand.action === 'fitComponent') {
      const object = state.components.get(cameraCommand.component ?? selectedRef.current);
      if (object) fit(object, 2.4);
    } else if (cameraCommand.action === 'zoomIn') {
      const direction = state.camera.position.clone().sub(state.controls.target);
      state.camera.position.copy(state.controls.target.clone().add(direction.multiplyScalar(0.82)));
    } else if (cameraCommand.action === 'zoomOut') {
      const direction = state.camera.position.clone().sub(state.controls.target);
      state.camera.position.copy(state.controls.target.clone().add(direction.multiplyScalar(1.22)));
    }
  }, [cameraCommand]);

  return <div ref={hostRef} className="three-host" aria-label="Interactive 3D industrial steam boiler" />;
}
