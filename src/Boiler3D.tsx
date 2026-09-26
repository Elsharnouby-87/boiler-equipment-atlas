import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { CameraCommand, ContextMode, ViewMode } from './modelTypes';
import { addBoltRingX, addFlangeX, cylinderBetween, makeBoilerSurfaceTexture } from './boiler3d/sceneHelpers';

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

type OrbitState = {
  yaw: number;
  pitch: number;
  radius: number;
  target: THREE.Vector3;
};

type CameraPreset = {
  yaw: number;
  pitch: number;
  radius: number;
  target: [number, number, number];
};

type CameraTween = {
  startedAt: number;
  duration: number;
  from: CameraPreset;
  to: CameraPreset;
};

type SceneState = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  orbit: OrbitState;
  updateCamera: () => void;
  transitionCamera: (preset: CameraPreset, duration?: number) => void;
  root: THREE.Group;
  components: Map<string, THREE.Group>;
  labelGroup: THREE.Group;
  flowGroup: THREE.Group;
  highlight: THREE.Box3Helper;
  selectionGlow: THREE.PointLight;
  mobileRender: boolean;
};

const explodeOffsets: Record<string, THREE.Vector3> = {
  'Burner & Ignition': new THREE.Vector3(-2.0, 0, 0),
  'Front Smokebox': new THREE.Vector3(-1.15, 0, 0),
  'Furnace Tube': new THREE.Vector3(0, -0.55, -0.95),
  'Fire Tubes': new THREE.Vector3(0, 0.45, 0.95),
  'Tube Sheets': new THREE.Vector3(0.45, 0, 0.65),
  'Rear Smokebox': new THREE.Vector3(1.15, 0, 0),
  'Economizer': new THREE.Vector3(0.9, 0.45, 0),
  'Stack / Flue Outlet': new THREE.Vector3(0.9, 0.8, 0),
  'Safety Valve': new THREE.Vector3(0, 0.75, 0),
  'Steam Outlet': new THREE.Vector3(0.4, 0.6, 0),
  'Pressure Controls': new THREE.Vector3(-0.35, 0.5, 0),
  'Level Gauge': new THREE.Vector3(0, 0, 0.7),
  'Feedwater Inlet': new THREE.Vector3(0.55, 0, 0.5),
  'Blowdown Valve': new THREE.Vector3(0, -0.75, 0),
};

const cameraHints: Record<string, Partial<Pick<CameraPreset, 'yaw' | 'pitch'>>> = {
  'Burner & Ignition': { yaw: -Math.PI / 2, pitch: 0.06 },
  'Front Smokebox': { yaw: -Math.PI / 2, pitch: 0.10 },
  'Furnace Tube': { yaw: -0.82, pitch: 0.10 },
  'Fire Tubes': { yaw: -0.72, pitch: 0.14 },
  'Tube Sheets': { yaw: 1.22, pitch: 0.12 },
  'Boiler Shell': { yaw: -0.72, pitch: 0.18 },
  'Water Space': { yaw: -0.65, pitch: 0.12 },
  'Steam Space': { yaw: -0.65, pitch: 0.30 },
  'Level Gauge': { yaw: 0.05, pitch: 0.08 },
  'Level Sensors': { yaw: 0.08, pitch: 0.38 },
  'Pressure Controls': { yaw: -0.10, pitch: 0.40 },
  'Safety Valve': { yaw: 0.18, pitch: 0.44 },
  'Steam Outlet': { yaw: 0.40, pitch: 0.42 },
  'Feedwater Inlet': { yaw: 0.16, pitch: 0.08 },
  'Blowdown Valve': { yaw: 0.16, pitch: -0.16 },
  'Rear Smokebox': { yaw: Math.PI / 2, pitch: 0.12 },
  Economizer: { yaw: 1.08, pitch: 0.24 },
  'Stack / Flue Outlet': { yaw: 1.05, pitch: 0.40 },
};

function material(
  color: THREE.ColorRepresentation,
  metalness = 0.55,
  roughness = 0.42,
  opacity = 1,
  emissive?: THREE.ColorRepresentation,
  map?: THREE.Texture,
) {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    map,
    metalness,
    roughness,
    transparent: opacity < 1,
    opacity,
    emissive: emissive ?? 0x000000,
    emissiveIntensity: emissive ? 0.5 : 0,
    clearcoat: metalness > 0.45 ? 0.08 : 0.02,
    clearcoatRoughness: 0.72,
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
    scene.background = new THREE.Color('#07141f');
    scene.fog = new THREE.FogExp2('#07141f', 0.021);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(70, 20, 10),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: 'varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'varying vec3 vPos; void main(){ float h=normalize(vPos).y*0.5+0.5; vec3 low=vec3(0.02,0.045,0.065); vec3 mid=vec3(0.045,0.11,0.16); vec3 high=vec3(0.08,0.18,0.25); vec3 col=mix(low,mid,smoothstep(0.12,0.58,h)); col=mix(col,high,smoothstep(0.58,1.0,h)); gl_FragColor=vec4(col,1.0); }',
      }),
    );
    scene.add(sky);

    const mobileRender = window.matchMedia('(max-width: 700px)').matches || host.clientWidth <= 700;
    const camera = new THREE.PerspectiveCamera(mobileRender ? 42 : 38, 1, 0.1, 120);

    const renderer = new THREE.WebGLRenderer({
      antialias: !mobileRender,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileRender ? 1.15 : 1.7));
    renderer.shadowMap.enabled = !mobileRender;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    renderer.localClippingEnabled = true;
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.userSelect = 'none';
    host.appendChild(renderer.domElement);

    const paintedSteelTex = makeBoilerSurfaceTexture('paintedSteel', mobileRender);
    const darkSteelTex = makeBoilerSurfaceTexture('darkSteel', mobileRender);
    const stainlessTex = makeBoilerSurfaceTexture('stainless', mobileRender);
    const refractoryTex = makeBoilerSurfaceTexture('refractory', mobileRender);
    const concreteTex = makeBoilerSurfaceTexture('concrete', mobileRender);
    const generatedTextures = [paintedSteelTex, darkSteelTex, stainlessTex, refractoryTex, concreteTex];

    const orbit: OrbitState = {
      yaw: -0.76,
      pitch: 0.18,
      radius: mobileRender ? 18.5 : 17,
      target: new THREE.Vector3(0, 0.15, 0),
    };
    let cameraTween: CameraTween | null = null;

    const updateCamera = () => {
      camera.position.set(
        orbit.target.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.radius,
        orbit.target.y + Math.sin(orbit.pitch) * orbit.radius,
        orbit.target.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.radius,
      );
      camera.lookAt(orbit.target);
    };

    const transitionCamera = (preset: CameraPreset, duration = 720) => {
      cameraTween = {
        startedAt: performance.now(),
        duration,
        from: {
          yaw: orbit.yaw,
          pitch: orbit.pitch,
          radius: orbit.radius,
          target: [orbit.target.x, orbit.target.y, orbit.target.z],
        },
        to: preset,
      };
    };
    updateCamera();

    scene.add(new THREE.HemisphereLight('#a9d9ef', '#06111b', mobileRender ? 1.35 : 1.2));
    const key = new THREE.DirectionalLight('#cfeeff', mobileRender ? 1.9 : 2.4);
    key.position.set(-7, 10, 9);
    key.castShadow = !mobileRender;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#2fa8e4', 1.2);
    rim.position.set(8, 4, -9);
    scene.add(rim);
    const fireLight = new THREE.PointLight('#ff6b1a', 3.2, 14, 2);
    fireLight.position.set(-2.4, -0.7, 0);
    scene.add(fireLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(12.8, mobileRender ? 40 : 72),
      new THREE.MeshStandardMaterial({ color: '#0b1820', map: concreteTex, metalness: 0.08, roughness: 0.88 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3.17;
    ground.receiveShadow = !mobileRender;
    scene.add(ground);

    const grid = new THREE.GridHelper(30, 30, '#1c5a78', '#123348');
    grid.position.y = -3.145;
    (grid.material as THREE.Material).opacity = 0.20;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const root = new THREE.Group();
    root.rotation.y = -0.12;
    scene.add(root);

    const components = new Map<string, THREE.Group>();
    const labelGroup = new THREE.Group();
    const flowGroup = new THREE.Group();
    let flameOuter: THREE.Mesh | null = null;
    let flameCoreMesh: THREE.Mesh | null = null;
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

    const fireTubeCoords: [number, number][] = [];
    [-1.35, -0.9, -0.45, 0, 0.45, 0.9, 1.35].forEach(y => {
      [-1.45, -0.95, -0.45, 0.45, 0.95, 1.45].forEach(z => {
        if (y < -0.45 && Math.abs(z) < 0.95) return;
        if (Math.hypot(y * 0.92, z) < 1.95) fireTubeCoords.push([y, z]);
      });
    });

    // BOILER SHELL
    {
      const name = 'Boiler Shell';
      const g = component(name);
      const shellMat = material('#65747b', 0.80, 0.34, 1, undefined, paintedSteelTex);
      const seamMat = material('#9aa6ac', 0.88, 0.26, 1, undefined, stainlessTex);
      const supportMat = material('#394850', 0.82, 0.44, 1, undefined, darkSteelTex);

      const shell = cylinderX(2.35, 8.1, shellMat, mobileRender ? 44 : 72);
      shell.castShadow = !mobileRender;
      shell.receiveShadow = !mobileRender;
      tagMaterial(shell, 1, 'shell');
      mark(shell, name);
      g.add(shell);

      [-3.55, -1.82, 0, 1.82, 3.55].forEach((x, index) => {
        const ring = cylinderX(index === 0 || index === 4 ? 2.43 : 2.39, index === 0 || index === 4 ? 0.10 : 0.045, seamMat, 64);
        ring.position.x = x;
        tagMaterial(ring, 1, 'shell');
        mark(ring, name);
        g.add(ring);
      });

      // Top manway / inspection cover.
      const manwayBase = box(0.92, 0.12, 0.70, seamMat);
      manwayBase.position.set(-0.65, 2.32, -0.50);
      manwayBase.rotation.z = -0.02;
      tagMaterial(manwayBase, 1, 'utility');
      mark(manwayBase, name);
      g.add(manwayBase);

      const manwayCover = box(0.76, 0.12, 0.56, shellMat.clone());
      manwayCover.position.set(-0.65, 2.43, -0.50);
      tagMaterial(manwayCover, 1, 'utility');
      mark(manwayCover, name);
      g.add(manwayCover);

      [
        [-0.98, 2.49, -0.73], [-0.98, 2.49, -0.27],
        [-0.32, 2.49, -0.73], [-0.32, 2.49, -0.27],
      ].forEach(([x,y,z]) => {
        const bolt = cylinderY(0.045, 0.08, seamMat, 10);
        bolt.position.set(x,y,z);
        tagMaterial(bolt, 1, 'utility');
        mark(bolt, name);
        g.add(bolt);
      });

      // Manufacturer/name plate.
      const plate = box(0.78, 0.44, 0.035, material('#9eb0b8', 0.82, 0.24, 1, undefined, stainlessTex));
      plate.position.set(-0.15, 0.45, 2.34);
      tagMaterial(plate, 1, 'utility');
      mark(plate, name);
      g.add(plate);

      // Saddles, cradle rings and baseplates.
      [-2.6, 2.6].forEach(x => {
        const cradle = cylinderX(2.43, 0.18, supportMat, mobileRender ? 36 : 56);
        cradle.position.x = x;
        tagMaterial(cradle, 1, 'utility');
        mark(cradle, name);
        g.add(cradle);

        const pedestal = box(1.10, 0.58, 2.85, supportMat);
        pedestal.position.set(x, -2.70, 0);
        pedestal.castShadow = !mobileRender;
        tagMaterial(pedestal, 1, 'utility');
        mark(pedestal, name);
        g.add(pedestal);

        const baseplate = box(1.45, 0.12, 3.25, material('#2b373d', 0.82, 0.48, 1, undefined, darkSteelTex));
        baseplate.position.set(x, -3.05, 0);
        tagMaterial(baseplate, 1, 'utility');
        mark(baseplate, name);
        g.add(baseplate);
      });
      addLabel(name, new THREE.Vector3(0, 2.9, -1.7));
    }

    // WATER + STEAM SPACES
    {
      const name = 'Water Space';
      const g = component(name);
      const waterMat = material('#1d9bd1', 0.06, 0.18, 0.115);
      waterMat.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.62)];
      const water = cylinderX(2.16, 7.45, waterMat, mobileRender ? 40 : 56);
      tagMaterial(water, 0.115, 'fluid');
      mark(water, name);
      g.add(water);

      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(7.10, 3.45),
        new THREE.MeshPhysicalMaterial({
          color: '#56c8f5',
          metalness: 0.02,
          roughness: 0.15,
          transparent: true,
          opacity: 0.22,
          clearcoat: 0.2,
          clearcoatRoughness: 0.18,
          side: THREE.DoubleSide,
        }),
      );
      surface.rotation.x = -Math.PI / 2;
      surface.position.y = 0.62;
      tagMaterial(surface, 0.22, 'fluid');
      mark(surface, name);
      g.add(surface);
      addLabel(name, new THREE.Vector3(0.8, -1.75, 2.0));
    }
    {
      const name = 'Steam Space';
      const g = component(name);
      const steamMat = material('#d9f4ff', 0.01, 0.15, 0.07);
      steamMat.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.62)];
      const steam = cylinderX(2.15, 7.4, steamMat, mobileRender ? 40 : 56);
      tagMaterial(steam, 0.07, 'fluid');
      mark(steam, name);
      g.add(steam);
      addLabel(name, new THREE.Vector3(0.6, 1.75, 2.05));
    }

    // FURNACE
    {
      const name = 'Furnace Tube';
      const g = component(name);
      const furnaceMat = material('#2f383d', 0.86, 0.34, 1, undefined, darkSteelTex);
      const furnace = cylinderX(0.82, 6.7, furnaceMat, mobileRender ? 36 : 52);
      furnace.position.y = -0.82;
      tagMaterial(furnace, 1, 'internal');
      mark(furnace, name);
      g.add(furnace);

      // Corrugation rings give the furnace a more realistic pressure-vessel reading.
      const corrugationMat = material('#485259', 0.88, 0.30, 1, undefined, darkSteelTex);
      const corrugationCount = mobileRender ? 7 : 11;
      for (let i = 0; i < corrugationCount; i += 1) {
        const x = -2.85 + i * (5.70 / Math.max(1, corrugationCount - 1));
        const ring = cylinderX(0.855, 0.055, corrugationMat, mobileRender ? 28 : 40);
        ring.position.set(x, -0.82, 0);
        tagMaterial(ring, 1, 'internal');
        mark(ring, name);
        g.add(ring);
      }

      const inner = cylinderX(0.68, 6.45, material('#8d2b10', 0.15, 0.55, 0.22, '#ff4e13'));
      inner.position.y = -0.82;
      tagMaterial(inner, 0.22, 'internal');
      mark(inner, name);
      g.add(inner);
      addLabel(name, new THREE.Vector3(0.2, -0.85, 1.2));
    }

    // FIRE TUBES
    {
      const name = 'Fire Tubes';
      const g = component(name);
      const tubeMat = material('#7f6e58', 0.88, 0.30, 1, undefined, darkSteelTex);
      fireTubeCoords.forEach(([y, z]) => {
        const t = cylinderX(0.105, 6.72, tubeMat, mobileRender ? 10 : 16);
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
      const sheetMat = material('#748188', 0.88, 0.29, 1, undefined, stainlessTex);
      const endRimMat = material('#a38e72', 0.82, 0.25, 1, undefined, stainlessTex);
      const tubeEndGeometry = new THREE.TorusGeometry(0.118, 0.016, 7, mobileRender ? 12 : 18);

      [-3.46, 3.46].forEach(x => {
        const sheet = cylinderX(2.16, 0.16, sheetMat, mobileRender ? 44 : 60);
        sheet.position.x = x;
        tagMaterial(sheet, 0.78, 'internal');
        mark(sheet, name);
        g.add(sheet);

        fireTubeCoords.forEach(([y,z]) => {
          const rim = new THREE.Mesh(tubeEndGeometry, endRimMat);
          rim.rotation.y = Math.PI / 2;
          rim.position.set(x + (x < 0 ? -0.09 : 0.09), y + 0.18, z);
          tagMaterial(rim, 1, 'internal');
          mark(rim, name);
          g.add(rim);
        });
      });
      addLabel(name, new THREE.Vector3(3.5, 1.8, 1.7));
    }

    // FRONT SMOKEBOX + BURNER
    {
      const name = 'Front Smokebox';
      const g = component(name);
      const casingMat = material('#46575f', 0.82, 0.36, 1, undefined, darkSteelTex);
      const doorMat = material('#66757c', 0.86, 0.30, 1, undefined, paintedSteelTex);
      const trimMat = material('#a0aaae', 0.90, 0.24, 1, undefined, stainlessTex);

      const smoke = cylinderX(2.20, 0.66, casingMat, mobileRender ? 40 : 60);
      smoke.position.x = -3.82;
      smoke.castShadow = !mobileRender;
      tagMaterial(smoke, 0.96, 'shell');
      mark(smoke, name);
      g.add(smoke);

      const door = cylinderX(2.06, 0.14, doorMat, mobileRender ? 44 : 64);
      door.position.x = -4.20;
      tagMaterial(door, 1, 'shell');
      mark(door, name);
      g.add(door);

      const doorRing = cylinderX(1.93, 0.07, trimMat, 60);
      doorRing.position.x = -4.30;
      tagMaterial(doorRing, 1, 'utility');
      mark(doorRing, name);
      g.add(doorRing);
      addBoltRingX(g, -4.36, 1.73, mobileRender ? 14 : 20, trimMat, name, 0.052);

      // Hinges and dog-latch details.
      [-0.82, 0.82].forEach(y => {
        const hinge = box(0.36, 0.28, 0.32, casingMat);
        hinge.position.set(-4.28, y, 2.02);
        tagMaterial(hinge, 1, 'utility');
        mark(hinge, name);
        g.add(hinge);
      });
      const latchBar = box(0.16, 1.28, 0.12, trimMat);
      latchBar.position.set(-4.34, 0.52, -1.78);
      latchBar.rotation.x = -0.18;
      tagMaterial(latchBar, 1, 'utility');
      mark(latchBar, name);
      g.add(latchBar);

      // Burner mounting flange and refractory throat.
      addFlangeX(g, -4.34, -0.82, 0, 0.76, 0.45, 0.12, trimMat, name);
      addBoltRingX(g, -4.42, 0.62, mobileRender ? 8 : 12, trimMat, name, 0.040, -0.82, 0);
      const throatLining = cylinderX(0.63, 0.24, material('#9a7658', 0.05, 0.92, 1, undefined, refractoryTex), 32);
      throatLining.position.set(-4.09, -0.82, 0);
      tagMaterial(throatLining, 1, 'utility');
      mark(throatLining, name);
      g.add(throatLining);

      addLabel(name, new THREE.Vector3(-4.0, 2.45, 0));
    }
    {
      const name = 'Burner & Ignition';
      const g = component(name);
      const steelMat = material('#556872', 0.84, 0.32, 1, undefined, paintedSteelTex);
      const darkMat = material('#2e3a40', 0.86, 0.36, 1, undefined, darkSteelTex);
      const trimMat = material('#a5b0b5', 0.90, 0.24, 1, undefined, stainlessTex);
      const copperMat = material('#8a532f', 0.78, 0.34);
      const ceramicMat = material('#ddd9c8', 0.05, 0.62);
      const flameMat = new THREE.MeshPhysicalMaterial({
        color: '#ff7a18',
        transparent: true,
        opacity: 0.72,
        emissive: '#ff3d09',
        emissiveIntensity: mobileRender ? 1.1 : 1.7,
        metalness: 0,
        roughness: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const flameCoreMat = new THREE.MeshBasicMaterial({
        color: '#ffd36b',
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const body = cylinderX(0.60, 1.05, steelMat, mobileRender ? 30 : 44);
      body.position.set(-4.83, -0.82, 0);
      body.castShadow = !mobileRender;
      tagMaterial(body, 1, 'utility');
      mark(body, name);
      g.add(body);

      const throat = cylinderX(0.43, 0.58, trimMat, 32);
      throat.position.set(-4.10, -0.82, 0);
      tagMaterial(throat, 1, 'utility');
      mark(throat, name);
      g.add(throat);

      const register = new THREE.Mesh(
        new THREE.TorusGeometry(0.52, 0.055, 10, mobileRender ? 28 : 42),
        trimMat,
      );
      register.rotation.y = Math.PI / 2;
      register.position.set(-4.38, -0.82, 0);
      tagMaterial(register, 1, 'utility');
      mark(register, name);
      g.add(register);

      // Blower scroll / air box and drive motor.
      const airBox = box(0.86, 0.96, 1.05, darkMat);
      airBox.position.set(-5.48, -0.82, 0.18);
      tagMaterial(airBox, 1, 'utility');
      mark(airBox, name);
      g.add(airBox);

      const blower = new THREE.Mesh(
        new THREE.TorusGeometry(0.48, 0.16, 12, mobileRender ? 28 : 40, Math.PI * 1.72),
        steelMat,
      );
      blower.rotation.y = Math.PI / 2;
      blower.rotation.x = 0.25;
      blower.position.set(-5.62, -0.20, 0.48);
      tagMaterial(blower, 1, 'utility');
      mark(blower, name);
      g.add(blower);

      const motor = cylinderX(0.26, 0.72, darkMat, 24);
      motor.position.set(-6.00, -0.20, 0.48);
      tagMaterial(motor, 1, 'utility');
      mark(motor, name);
      g.add(motor);

      const motorEnd = cylinderX(0.31, 0.12, trimMat, 24);
      motorEnd.position.set(-6.38, -0.20, 0.48);
      tagMaterial(motorEnd, 1, 'utility');
      mark(motorEnd, name);
      g.add(motorEnd);

      // Fuel piping into the burner gun.
      const fuelA = cylinderBetween(new THREE.Vector3(-6.05, -1.62, 1.05), new THREE.Vector3(-5.25, -1.25, 0.72), 0.055, copperMat, 12);
      const fuelB = cylinderBetween(new THREE.Vector3(-5.25, -1.25, 0.72), new THREE.Vector3(-4.62, -0.92, 0.24), 0.055, copperMat, 12);
      [fuelA, fuelB].forEach(pipe => {
        tagMaterial(pipe, 1, 'utility');
        mark(pipe, name);
        g.add(pipe);
      });

      const nozzle = cylinderX(0.075, 0.66, trimMat, 16);
      nozzle.position.set(-4.22, -0.82, 0);
      tagMaterial(nozzle, 1, 'utility');
      mark(nozzle, name);
      g.add(nozzle);

      // Ignition electrode and ceramic holder.
      const igniter = cylinderBetween(new THREE.Vector3(-4.78, -0.22, 0.40), new THREE.Vector3(-4.02, -0.66, 0.14), 0.022, trimMat, 10);
      tagMaterial(igniter, 1, 'utility');
      mark(igniter, name);
      g.add(igniter);
      const ceramic = cylinderBetween(new THREE.Vector3(-4.84, -0.18, 0.43), new THREE.Vector3(-4.55, -0.35, 0.33), 0.055, ceramicMat, 12);
      tagMaterial(ceramic, 1, 'utility');
      mark(ceramic, name);
      g.add(ceramic);

      // Flame scanner with lens.
      const scanner = box(0.36, 0.24, 0.30, material('#c3a45e', 0.70, 0.30));
      scanner.position.set(-4.52, -0.18, 0.46);
      tagMaterial(scanner, 1, 'utility');
      mark(scanner, name);
      g.add(scanner);
      const scannerLens = new THREE.Mesh(
        new THREE.CircleGeometry(0.075, 18),
        new THREE.MeshPhysicalMaterial({ color: '#6dd8ff', roughness: 0.05, metalness: 0, transmission: mobileRender ? 0 : 0.25, transparent: true, opacity: 0.72 }),
      );
      scannerLens.rotation.y = Math.PI / 2;
      scannerLens.position.set(-4.325, -0.18, 0.46);
      scannerLens.userData.component = name;
      scannerLens.userData.kind = 'utility';
      scannerLens.userData.baseOpacity = 0.72;
      g.add(scannerLens);

      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.48, 3.15, mobileRender ? 18 : 30, 1, true),
        flameMat,
      );
      flame.rotation.z = -Math.PI / 2;
      flame.position.set(-2.42, -0.82, 0);
      tagMaterial(flame, 0.72, 'internal');
      mark(flame, name);
      g.add(flame);
      flameOuter = flame;

      const flameCore = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 1.75, mobileRender ? 14 : 22, 1, true),
        flameCoreMat,
      );
      flameCore.rotation.z = -Math.PI / 2;
      flameCore.position.set(-3.05, -0.82, 0);
      flameCore.userData.component = name;
      flameCore.userData.kind = 'internal';
      flameCore.userData.baseOpacity = 0.65;
      g.add(flameCore);
      flameCoreMesh = flameCore;

      addLabel(name, new THREE.Vector3(-5.0, 0.45, 1.15));
    }

    // REAR SMOKEBOX
    {
      const name = 'Rear Smokebox';
      const g = component(name);
      const casingMat = material('#46575f', 0.82, 0.36, 1, undefined, darkSteelTex);
      const doorMat = material('#63737a', 0.84, 0.31, 1, undefined, paintedSteelTex);
      const trimMat = material('#9da8ad', 0.89, 0.24, 1, undefined, stainlessTex);

      const smoke = cylinderX(2.18, 0.72, casingMat, mobileRender ? 40 : 60);
      smoke.position.x = 3.84;
      tagMaterial(smoke, 0.96, 'shell');
      mark(smoke, name);
      g.add(smoke);

      const door = cylinderX(2.02, 0.13, doorMat, mobileRender ? 44 : 64);
      door.position.x = 4.23;
      tagMaterial(door, 1, 'shell');
      mark(door, name);
      g.add(door);

      const doorRing = cylinderX(1.90, 0.07, trimMat, 60);
      doorRing.position.x = 4.32;
      tagMaterial(doorRing, 1, 'utility');
      mark(doorRing, name);
      g.add(doorRing);
      addBoltRingX(g, 4.38, 1.70, mobileRender ? 14 : 20, trimMat, name, 0.052);

      [-0.82, 0.82].forEach(y => {
        const hinge = box(0.34, 0.28, 0.30, casingMat);
        hinge.position.set(4.30, y, -2.0);
        tagMaterial(hinge, 1, 'utility');
        mark(hinge, name);
        g.add(hinge);
      });

      addLabel(name, new THREE.Vector3(4.15, 2.45, 0));
    }

    // ECONOMIZER
    {
      const name = 'Economizer';
      const g = component(name);
      const casingMat = material('#405762', 0.70, 0.42, 0.34, undefined, paintedSteelTex);
      const tubeMat = material('#7495a1', 0.82, 0.30, 1, undefined, stainlessTex);
      const headerMat = material('#556d77', 0.84, 0.31, 1, undefined, darkSteelTex);

      const casing = box(1.68, 1.82, 2.42, casingMat);
      casing.position.set(4.78, 2.08, 0);
      tagMaterial(casing, 0.34, 'shell');
      mark(casing, name);
      g.add(casing);

      const accessPanel = box(0.04, 1.18, 1.72, material('#596c75', 0.78, 0.39, 1, undefined, paintedSteelTex));
      accessPanel.position.set(3.92, 2.05, 0);
      tagMaterial(accessPanel, 1, 'utility');
      mark(accessPanel, name);
      g.add(accessPanel);

      const tubeRows = mobileRender ? 5 : 7;
      for (let row = 0; row < tubeRows; row += 1) {
        const y = 1.48 + row * (0.98 / Math.max(1, tubeRows - 1));
        [-0.28, 0.28].forEach(dx => {
          const tube = cylinderBetween(
            new THREE.Vector3(4.78 + dx, y, -0.88),
            new THREE.Vector3(4.78 + dx, y, 0.88),
            0.055,
            tubeMat,
            mobileRender ? 9 : 12,
          );
          tagMaterial(tube, 1, 'internal');
          mark(tube, name);
          g.add(tube);
        });
      }

      const leftHeader = cylinderY(0.12, 1.25, headerMat, 18);
      leftHeader.position.set(4.48, 2.00, -0.98);
      tagMaterial(leftHeader, 1, 'utility');
      mark(leftHeader, name);
      g.add(leftHeader);
      const rightHeader = cylinderY(0.12, 1.25, headerMat, 18);
      rightHeader.position.set(5.08, 2.00, 0.98);
      tagMaterial(rightHeader, 1, 'utility');
      mark(rightHeader, name);
      g.add(rightHeader);

      const feedIn = cylinderBetween(new THREE.Vector3(4.48, 2.55, -0.98), new THREE.Vector3(4.48, 2.55, -1.60), 0.105, material('#56b9df', 0.72, 0.28), 16);
      tagMaterial(feedIn, 1, 'utility');
      mark(feedIn, name);
      g.add(feedIn);

      const duct = box(1.18, 0.62, 1.20, material('#475a63', 0.82, 0.36, 1, undefined, darkSteelTex));
      duct.position.set(4.10, 1.30, 0);
      tagMaterial(duct, 1, 'utility');
      mark(duct, name);
      g.add(duct);

      addLabel(name, new THREE.Vector3(4.85, 3.35, 1.15));
    }

    // STACK
    {
      const name = 'Stack / Flue Outlet';
      const g = component(name);
      const stackMat = material('#4d5f67', 0.82, 0.34, 1, undefined, darkSteelTex);
      const trimMat = material('#849197', 0.86, 0.28, 1, undefined, stainlessTex);

      const base = box(1.14, 0.78, 1.22, stackMat);
      base.position.set(4.78, 3.18, 0);
      tagMaterial(base, 1, 'utility');
      mark(base, name);
      g.add(base);

      const riser = cylinderY(0.50, 2.75, stackMat, mobileRender ? 26 : 36);
      riser.position.set(4.78, 4.72, 0);
      tagMaterial(riser, 1, 'utility');
      mark(riser, name);
      g.add(riser);

      const baseFlange = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.045, 9, 30), trimMat);
      baseFlange.rotation.x = Math.PI / 2;
      baseFlange.position.set(4.78, 3.40, 0);
      tagMaterial(baseFlange, 1, 'utility');
      mark(baseFlange, name);
      g.add(baseFlange);

      const topRim = new THREE.Mesh(new THREE.TorusGeometry(0.51, 0.035, 8, 28), trimMat);
      topRim.rotation.x = Math.PI / 2;
      topRim.position.set(4.78, 6.10, 0);
      tagMaterial(topRim, 1, 'utility');
      mark(topRim, name);
      g.add(topRim);

      addLabel(name, new THREE.Vector3(4.85, 6.45, 0));
    }

    // SAFETY VALVE
    {
      const name = 'Safety Valve';
      const g = component(name);
      const steelMat = material('#9aa8ae', 0.90, 0.24, 1, undefined, stainlessTex);
      const bodyMat = material('#65757c', 0.82, 0.32, 1, undefined, paintedSteelTex);

      const nozzle = cylinderY(0.16, 0.48, steelMat, 20);
      nozzle.position.set(0.25, 2.56, 0.25);
      tagMaterial(nozzle, 1, 'utility');
      mark(nozzle, name);
      g.add(nozzle);

      const lowerBody = new THREE.Mesh(new THREE.SphereGeometry(0.24, mobileRender ? 16 : 24, mobileRender ? 10 : 16), bodyMat);
      lowerBody.scale.set(0.88, 1.0, 0.88);
      lowerBody.position.set(0.25, 2.91, 0.25);
      tagMaterial(lowerBody, 1, 'utility');
      mark(lowerBody, name);
      g.add(lowerBody);

      const bonnet = cylinderY(0.16, 0.55, steelMat, 20);
      bonnet.position.set(0.25, 3.28, 0.25);
      tagMaterial(bonnet, 1, 'utility');
      mark(bonnet, name);
      g.add(bonnet);

      const cap = cylinderY(0.205, 0.10, bodyMat, 20);
      cap.position.set(0.25, 3.59, 0.25);
      tagMaterial(cap, 1, 'utility');
      mark(cap, name);
      g.add(cap);

      const outlet = cylinderBetween(
        new THREE.Vector3(0.25, 3.00, 0.42),
        new THREE.Vector3(0.25, 3.00, 1.06),
        0.11,
        steelMat,
        16,
      );
      tagMaterial(outlet, 1, 'utility');
      mark(outlet, name);
      g.add(outlet);

      const outletFlange = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.027, 8, 24), steelMat);
      outletFlange.rotation.x = Math.PI / 2;
      outletFlange.position.set(0.25, 3.00, 1.07);
      tagMaterial(outletFlange, 1, 'utility');
      mark(outletFlange, name);
      g.add(outletFlange);

      addLabel(name, new THREE.Vector3(0.25, 3.95, 0.25));
    }

    // STEAM OUTLET
    {
      const name = 'Steam Outlet';
      const g = component(name);
      const pipeMat = material('#9aa8ae', 0.90, 0.25, 1, undefined, stainlessTex);
      const valveMat = material('#60727b', 0.82, 0.32, 1, undefined, paintedSteelTex);

      const vertical = cylinderY(0.22, 0.92, pipeMat, 24);
      vertical.position.set(1.45, 2.70, -0.30);
      tagMaterial(vertical, 1, 'utility');
      mark(vertical, name);
      g.add(vertical);

      const lowerFlange = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.040, 9, 28), pipeMat);
      lowerFlange.rotation.x = Math.PI / 2;
      lowerFlange.position.set(1.45, 2.28, -0.30);
      tagMaterial(lowerFlange, 1, 'utility');
      mark(lowerFlange, name);
      g.add(lowerFlange);

      addValve(g, new THREE.Vector3(1.45, 3.03, -0.30), 0.88);

      const topSpool = cylinderY(0.20, 0.62, pipeMat, 22);
      topSpool.position.set(1.45, 3.62, -0.30);
      tagMaterial(topSpool, 1, 'utility');
      mark(topSpool, name);
      g.add(topSpool);

      const outletElbowA = cylinderBetween(
        new THREE.Vector3(1.45, 3.88, -0.30),
        new THREE.Vector3(1.95, 3.88, -0.30),
        0.18,
        pipeMat,
        18,
      );
      tagMaterial(outletElbowA, 1, 'utility');
      mark(outletElbowA, name);
      g.add(outletElbowA);

      const valveBody = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), valveMat);
      valveBody.position.set(1.45, 3.03, -0.30);
      tagMaterial(valveBody, 1, 'utility');
      mark(valveBody, name);
      g.add(valveBody);

      g.traverse(o => { if (o instanceof THREE.Mesh) mark(o, name); });
      addLabel(name, new THREE.Vector3(1.62, 4.45, -0.35));
    }

    // PRESSURE CONTROLS
    {
      const name = 'Pressure Controls';
      const g = component(name);
      const pipeMat = material('#9aa8ae', 0.88, 0.27, 1, undefined, stainlessTex);
      const enclosureMat = material('#526c79', 0.54, 0.44, 1, undefined, paintedSteelTex);
      const bezelMat = material('#273238', 0.80, 0.32, 1, undefined, darkSteelTex);

      [-1.25, -0.75].forEach((x, i) => {
        const stem = cylinderY(0.06, 0.40, pipeMat, 14);
        stem.position.set(x, 2.52, -0.45);
        tagMaterial(stem, 1, 'utility');
        mark(stem, name);
        g.add(stem);

        const sensor = box(0.36, 0.46, 0.30, enclosureMat);
        sensor.position.set(x, 2.92, -0.45);
        tagMaterial(sensor, 1, 'utility');
        mark(sensor, name);
        g.add(sensor);

        const capillary = cylinderBetween(
          new THREE.Vector3(x, 2.72, -0.45),
          new THREE.Vector3(x + (i === 0 ? -0.15 : 0.15), 2.35, -0.20),
          0.018,
          pipeMat,
          8,
        );
        tagMaterial(capillary, 1, 'utility');
        mark(capillary, name);
        g.add(capillary);
      });

      const gaugeBody = cylinderX(0.36, 0.16, bezelMat, 36);
      gaugeBody.position.set(-1.78, 2.82, -0.52);
      tagMaterial(gaugeBody, 1, 'utility');
      mark(gaugeBody, name);
      g.add(gaugeBody);

      const dial = new THREE.Mesh(
        new THREE.CircleGeometry(0.30, mobileRender ? 24 : 36),
        new THREE.MeshBasicMaterial({ color: '#eef2f2', side: THREE.DoubleSide }),
      );
      dial.rotation.y = Math.PI / 2;
      dial.position.set(-1.875, 2.82, -0.52);
      dial.userData.component = name;
      dial.userData.kind = 'utility';
      dial.userData.baseOpacity = 1;
      g.add(dial);

      const needle = box(0.015, 0.18, 0.018, material('#bb3a2f', 0.20, 0.45));
      needle.position.set(-1.890, 2.88, -0.52);
      needle.rotation.x = -0.55;
      tagMaterial(needle, 1, 'utility');
      mark(needle, name);
      g.add(needle);

      addLabel(name, new THREE.Vector3(-1.22, 3.65, -0.45));
    }

    // LEVEL GAUGE
    {
      const name = 'Level Gauge';
      const g = component(name);
      const metalMat = material('#8f9ca2', 0.86, 0.28, 1, undefined, stainlessTex);
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: '#7ddcff',
        roughness: 0.08,
        metalness: 0,
        transparent: true,
        opacity: 0.50,
        transmission: mobileRender ? 0 : 0.35,
        thickness: 0.12,
        clearcoat: 0.10,
      });
      const guardMat = material('#515f66', 0.78, 0.36, 1, undefined, darkSteelTex);

      // The project source describes at least two level glasses; show a twin external arrangement.
      [-2.48, -2.08].forEach((x, index) => {
        const glass = cylinderY(0.075, 1.82, glassMat.clone(), 18);
        glass.position.set(x, 0.52, 2.50);
        tagMaterial(glass, 0.50, 'utility');
        mark(glass, name);
        g.add(glass);

        [-0.40, 1.44].forEach(y => {
          const cock = cylinderY(0.13, 0.28, metalMat, 16);
          cock.position.set(x, y, 2.50);
          tagMaterial(cock, 1, 'utility');
          mark(cock, name);
          g.add(cock);

          const connector = cylinderBetween(
            new THREE.Vector3(x, y, 2.43),
            new THREE.Vector3(x, y, 2.18),
            0.055,
            metalMat,
            10,
          );
          tagMaterial(connector, 1, 'utility');
          mark(connector, name);
          g.add(connector);
        });

        [-0.12, 0.12].forEach(dx => {
          const guard = cylinderY(0.020, 1.95, guardMat, 8);
          guard.position.set(x + dx, 0.52, 2.57);
          tagMaterial(guard, 1, 'utility');
          mark(guard, name);
          g.add(guard);
        });

        const drain = cylinderBetween(
          new THREE.Vector3(x, -0.53, 2.50),
          new THREE.Vector3(x, -0.86, 2.72 + index * 0.05),
          0.035,
          metalMat,
          9,
        );
        tagMaterial(drain, 1, 'utility');
        mark(drain, name);
        g.add(drain);
      });

      addLabel(name, new THREE.Vector3(-2.30, 2.05, 2.72));
    }

    // FEEDWATER
    {
      const name = 'Feedwater Inlet';
      const g = component(name);
      const waterPipeMat = material('#5baecf', 0.72, 0.30, 1, undefined, paintedSteelTex);
      const steelMat = material('#85959d', 0.86, 0.28, 1, undefined, stainlessTex);
      const valveBodyMat = material('#5b6e77', 0.80, 0.34, 1, undefined, darkSteelTex);

      const inlet = cylinderBetween(
        new THREE.Vector3(2.15, 0.75, 2.18),
        new THREE.Vector3(2.15, 0.75, 3.78),
        0.15,
        waterPipeMat,
        20,
      );
      tagMaterial(inlet, 1, 'utility');
      mark(inlet, name);
      g.add(inlet);

      addValve(g, new THREE.Vector3(2.15, 0.75, 3.12), 0.68);

      // Non-return/check valve body.
      const checkBody = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), valveBodyMat);
      checkBody.scale.set(0.95, 0.80, 1.25);
      checkBody.position.set(2.15, 0.75, 3.53);
      tagMaterial(checkBody, 1, 'utility');
      mark(checkBody, name);
      g.add(checkBody);

      const checkBand = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.035, 8, 22), steelMat);
      checkBand.position.set(2.15, 0.75, 3.53);
      tagMaterial(checkBand, 1, 'utility');
      mark(checkBand, name);
      g.add(checkBand);

      // Y-strainer branch.
      const strainerBranch = cylinderBetween(
        new THREE.Vector3(2.15, 0.75, 3.70),
        new THREE.Vector3(2.52, 0.38, 3.95),
        0.10,
        valveBodyMat,
        16,
      );
      tagMaterial(strainerBranch, 1, 'utility');
      mark(strainerBranch, name);
      g.add(strainerBranch);

      const strainerCap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), steelMat);
      strainerCap.position.set(2.53, 0.37, 3.96);
      tagMaterial(strainerCap, 1, 'utility');
      mark(strainerCap, name);
      g.add(strainerCap);

      g.traverse(o => { if (o instanceof THREE.Mesh) mark(o, name); });
      addLabel(name, new THREE.Vector3(2.25, 1.65, 3.45));
    }

    // BLOWDOWN
    {
      const name = 'Blowdown Valve';
      const g = component(name);
      const pipeMat = material('#87959c', 0.86, 0.29, 1, undefined, stainlessTex);
      const darkMat = material('#51646d', 0.80, 0.36, 1, undefined, darkSteelTex);

      const down = cylinderY(0.14, 1.10, pipeMat, 18);
      down.position.set(0.10, -2.76, 0.35);
      tagMaterial(down, 1, 'utility');
      mark(down, name);
      g.add(down);

      const elbow = cylinderBetween(
        new THREE.Vector3(0.10, -3.20, 0.35),
        new THREE.Vector3(0.80, -3.20, 0.35),
        0.13,
        pipeMat,
        16,
      );
      tagMaterial(elbow, 1, 'utility');
      mark(elbow, name);
      g.add(elbow);

      addValve(g, new THREE.Vector3(0.42, -3.20, 0.35), 0.68);

      const secondBody = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 10), darkMat);
      secondBody.position.set(0.86, -3.20, 0.35);
      tagMaterial(secondBody, 1, 'utility');
      mark(secondBody, name);
      g.add(secondBody);

      const discharge = cylinderBetween(
        new THREE.Vector3(0.90, -3.20, 0.35),
        new THREE.Vector3(1.45, -3.20, 0.35),
        0.12,
        pipeMat,
        16,
      );
      tagMaterial(discharge, 1, 'utility');
      mark(discharge, name);
      g.add(discharge);

      g.traverse(o => { if (o instanceof THREE.Mesh) mark(o, name); });
      addLabel(name, new THREE.Vector3(0.45, -3.85, 0.45));
    }

    // LEVEL SENSORS
    {
      const name = 'Level Sensors';
      const g = component(name);
      const probeMat = material('#c4aa58', 0.72, 0.30);
      const headMat = material('#586e79', 0.62, 0.40, 1, undefined, paintedSteelTex);
      const ceramicMat = material('#ddd9c8', 0.05, 0.62);

      [-0.42, -0.02, 0.38].forEach((dx, i) => {
        const probeLength = 0.82 + i * 0.14;
        const probe = cylinderY(0.045, probeLength, probeMat, 12);
        probe.position.set(-0.12 + dx, 2.22, 1.02);
        tagMaterial(probe, 1, 'utility');
        mark(probe, name);
        g.add(probe);

        const insulator = cylinderY(0.085, 0.18, ceramicMat, 14);
        insulator.position.set(-0.12 + dx, 2.66, 1.02);
        tagMaterial(insulator, 1, 'utility');
        mark(insulator, name);
        g.add(insulator);

        const head = box(0.24, 0.22, 0.24, headMat);
        head.position.set(-0.12 + dx, 2.83, 1.02);
        tagMaterial(head, 1, 'utility');
        mark(head, name);
        g.add(head);
      });

      const junction = box(1.30, 0.18, 0.34, headMat);
      junction.position.set(-0.12, 3.04, 1.02);
      tagMaterial(junction, 1, 'utility');
      mark(junction, name);
      g.add(junction);

      addLabel(name, new THREE.Vector3(-0.15, 3.55, 1.15));
    }

    // Flow particles: hot gas + water/steam indication
    const hotMat = material('#ff8c38', 0.0, 0.2, 0.85, '#ff4e13');
    const blueMat = material('#53c8f5', 0.0, 0.2, 0.72, '#1aa6e1');
    const hotGeometry = new THREE.SphereGeometry(0.055, mobileRender ? 6 : 8, mobileRender ? 6 : 8);
    const waterGeometry = new THREE.SphereGeometry(0.05, mobileRender ? 6 : 8, mobileRender ? 6 : 8);
    const hotCount = mobileRender ? 14 : 24;
    const waterCount = mobileRender ? 10 : 16;
    for (let i = 0; i < hotCount; i += 1) {
      const p = new THREE.Mesh(hotGeometry, hotMat);
      p.userData.phase = i / hotCount;
      p.userData.flowType = 'gas';
      flowGroup.add(p);
    }
    for (let i = 0; i < waterCount; i += 1) {
      const p = new THREE.Mesh(waterGeometry, blueMat);
      p.userData.phase = i / waterCount;
      p.userData.flowType = 'water';
      flowGroup.add(p);
    }
    flowGroup.visible = false;

    const highlight = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#ff9a3d'));
    const highlightMaterials = Array.isArray(highlight.material) ? highlight.material : [highlight.material];
    highlightMaterials.forEach(mat => {
      mat.transparent = true;
      mat.opacity = mobileRender ? 0.22 : 0.32;
      mat.depthTest = false;
    });
    highlight.renderOrder = 60;
    highlight.visible = false;
    scene.add(highlight);

    const selectionGlow = new THREE.PointLight('#ff8a32', mobileRender ? 0.45 : 0.8, mobileRender ? 5.5 : 7.5, 2);
    selectionGlow.visible = false;
    scene.add(selectionGlow);

    const presetForObject = (object: THREE.Object3D, multiplier = 1.65): CameraPreset | null => {
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) return null;
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      return {
        yaw: orbit.yaw,
        pitch: THREE.MathUtils.clamp(orbit.pitch, -0.36, 0.58),
        radius: THREE.MathUtils.clamp(Math.max(3.9, maxDim * multiplier * (mobileRender ? 1.12 : 1)), 3.4, 34),
        target: [center.x, center.y, center.z],
      };
    };

    const fitObject = (object: THREE.Object3D, multiplier = 1.65, duration = 720) => {
      const preset = presetForObject(object, multiplier);
      if (preset) transitionCamera(preset, duration);
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const activePointers = new Map<number, { x: number; y: number }>();
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let panMode = false;
    let pinchDistance = 0;
    let pinchCenter = { x: 0, y: 0 };
    let lastTapAt = 0;

    const pickComponent = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
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
        return componentName;
      }
      return fallback;
    };

    const onPointerDown = (event: PointerEvent) => {
      cameraTween = null;
      dragging = true;
      moved = false;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      panMode = event.button === 2 || event.shiftKey;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);

      if (activePointers.size === 2) {
        const pts = [...activePointers.values()];
        pinchDistance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        pinchCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || !activePointers.has(event.pointerId)) return;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (activePointers.size >= 2) {
        const pts = [...activePointers.values()].slice(0, 2);
        const distance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        if (pinchDistance > 0) {
          orbit.radius = THREE.MathUtils.clamp(orbit.radius * (pinchDistance / Math.max(distance, 1)), 3.4, 34);
        }
        const panScale = Math.max(0.006, orbit.radius * 0.00075);
        orbit.target.x -= (center.x - pinchCenter.x) * panScale;
        orbit.target.y += (center.y - pinchCenter.y) * panScale;
        pinchDistance = distance;
        pinchCenter = center;
        moved = true;
        updateCamera();
        return;
      }

      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;

      if (panMode) {
        const panScale = Math.max(0.008, orbit.radius * 0.00105);
        orbit.target.x -= dx * panScale;
        orbit.target.y += dy * panScale;
      } else {
        orbit.yaw -= dx * (mobileRender ? 0.0062 : 0.0052);
        orbit.pitch = THREE.MathUtils.clamp(
          orbit.pitch + dy * (mobileRender ? 0.0046 : 0.0038),
          -0.48,
          0.78,
        );
      }

      lastX = event.clientX;
      lastY = event.clientY;
      updateCamera();
    };

    const onPointerUp = (event: PointerEvent) => {
      const wasMoved = moved;
      activePointers.delete(event.pointerId);
      dragging = activePointers.size > 0;
      pinchDistance = 0;

      if (!wasMoved) {
        const name = pickComponent(event.clientX, event.clientY);
        if (name) {
          const now = performance.now();
          onSelect(name);
          if (event.pointerType === 'touch' && now - lastTapAt < 320) {
            const object = components.get(name);
            if (object) fitObject(object, 2.05, 520);
          }
          lastTapAt = now;
        }
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      cameraTween = null;
      orbit.radius = THREE.MathUtils.clamp(orbit.radius + event.deltaY * 0.018, 3.4, 34);
      updateCamera();
    };

    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

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
    let lastFrame = performance.now();
    const animate = () => {
      const now = performance.now();
      const t = clock.getElapsedTime();

      if (cameraTween) {
        const raw = THREE.MathUtils.clamp((now - cameraTween.startedAt) / cameraTween.duration, 0, 1);
        const eased = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
        orbit.yaw = THREE.MathUtils.lerp(cameraTween.from.yaw, cameraTween.to.yaw, eased);
        orbit.pitch = THREE.MathUtils.lerp(cameraTween.from.pitch, cameraTween.to.pitch, eased);
        orbit.radius = THREE.MathUtils.lerp(cameraTween.from.radius, cameraTween.to.radius, eased);
        orbit.target.set(
          THREE.MathUtils.lerp(cameraTween.from.target[0], cameraTween.to.target[0], eased),
          THREE.MathUtils.lerp(cameraTween.from.target[1], cameraTween.to.target[1], eased),
          THREE.MathUtils.lerp(cameraTween.from.target[2], cameraTween.to.target[2], eased),
        );
        updateCamera();
        if (raw >= 1) cameraTween = null;
      }

      components.forEach(group => {
        const target = group.userData.targetPosition as THREE.Vector3 | undefined;
        if (target) group.position.lerp(target, mobileRender ? 0.16 : 0.11);
      });

      if (flameOuter) {
        const pulse = 1 + Math.sin(t * 9.2) * (mobileRender ? 0.018 : 0.028);
        flameOuter.scale.set(1, pulse, pulse);
      }
      if (flameCoreMesh) {
        const corePulse = 1 + Math.sin(t * 11.4 + 0.8) * (mobileRender ? 0.015 : 0.024);
        flameCoreMesh.scale.set(1, corePulse, corePulse);
      }

      if (flowGroup.visible && (!mobileRender || now - lastFrame > 24)) {
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
        lastFrame = now;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    renderer.compile(scene, camera);
    stateRef.current = { scene, camera, renderer, orbit, updateCamera, transitionCamera, root, components, labelGroup, flowGroup, highlight, selectionGlow, mobileRender };
    fitObject(root, mobileRender ? 1.62 : 1.4, 0);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
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
      generatedTextures.forEach(texture => texture.dispose());
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
      const targetPosition = base.clone().add(offset);
      group.userData.targetPosition = targetPosition;

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
          if (mode === 'cutaway') modeFactor = 0.48;
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
          mat.clippingPlanes = kind === 'shell' && mode === 'cutaway'
            ? [new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.04)]
            : null;
          mat.clipShadows = true;
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

    const selectedGroup = state.components.get(selected);
    if (selectedGroup) {
      const bounds = new THREE.Box3().setFromObject(selectedGroup);
      state.highlight.box.copy(bounds);
      state.highlight.visible = !bounds.isEmpty();
      state.selectionGlow.position.copy(bounds.getCenter(new THREE.Vector3()));
      state.selectionGlow.visible = contextMode !== 'full' || selected !== 'Boiler Shell';
    } else {
      state.highlight.visible = false;
      state.selectionGlow.visible = false;
    }
  }, [mode, selected, labels, flow, explode, contextMode]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state || cameraCommand.id === 0) return;

    const presetFor = (object: THREE.Object3D, multiplier = 1.7): CameraPreset | null => {
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) return null;
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      return {
        yaw: state.orbit.yaw,
        pitch: THREE.MathUtils.clamp(state.orbit.pitch, -0.36, 0.58),
        radius: THREE.MathUtils.clamp(Math.max(3.8, maxDim * multiplier * (state.mobileRender ? 1.12 : 1)), 3.4, 34),
        target: [center.x, center.y, center.z],
      };
    };

    if (cameraCommand.action === 'fitBoiler' || cameraCommand.action === 'reset') {
      const preset = presetFor(state.root, state.mobileRender ? 1.62 : 1.4);
      if (preset) state.transitionCamera({ ...preset, yaw: -0.76, pitch: 0.18 }, 760);
    } else if (cameraCommand.action === 'fitComponent') {
      const componentName = cameraCommand.component ?? selectedRef.current;
      const object = state.components.get(componentName);
      const preset = object ? presetFor(object, state.mobileRender ? 2.55 : 2.25) : null;
      if (preset) {
        const hint = cameraHints[componentName];
        state.transitionCamera({ ...preset, ...hint }, 650);
      }
    } else if (cameraCommand.action === 'zoomIn') {
      state.transitionCamera({
        yaw: state.orbit.yaw,
        pitch: state.orbit.pitch,
        radius: THREE.MathUtils.clamp(state.orbit.radius * 0.82, 3.4, 34),
        target: [state.orbit.target.x, state.orbit.target.y, state.orbit.target.z],
      }, 300);
    } else if (cameraCommand.action === 'zoomOut') {
      state.transitionCamera({
        yaw: state.orbit.yaw,
        pitch: state.orbit.pitch,
        radius: THREE.MathUtils.clamp(state.orbit.radius * 1.22, 3.4, 34),
        target: [state.orbit.target.x, state.orbit.target.y, state.orbit.target.z],
      }, 300);
    }
  }, [cameraCommand]);

  return <div ref={hostRef} className="three-host" aria-label="Interactive 3D industrial steam boiler" />;
}
