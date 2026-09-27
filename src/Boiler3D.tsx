import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { CameraCommand, ContextMode, ViewMode } from './modelTypes';
import { addBoltRingX, addFlangeX, cylinderBetween, makeBlowerVoluteGeometry, makeBoilerSurfaceTexture, makeFlameEnvelopeGeometry, makeFlameMaterial } from './boiler3d/sceneHelpers';

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
  burnerKey: THREE.PointLight;
  burnerFill: THREE.PointLight;
  burnerRim: THREE.PointLight;
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
  'Burner & Ignition': { yaw: -1.30, pitch: 0.08 },
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
  ctx.fillStyle = 'rgba(6,28,44,.82)';
  ctx.strokeStyle = 'rgba(104,211,255,.92)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(4, 4, 504, 88, 16);
  ctx.fill();
  ctx.stroke();
  ctx.font = '700 28px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f8fdff';
  ctx.fillText(text, 256, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  }));
  sprite.scale.set(2.5, 0.47, 1);
  sprite.renderOrder = 20;
  sprite.userData.labelTexture = texture;
  return sprite;
}

function makeDetailLabel(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 420;
  canvas.height = 76;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8,30,46,.86)';
  ctx.strokeStyle = 'rgba(255,160,64,.94)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(4, 4, 412, 68, 12);
  ctx.fill();
  ctx.stroke();
  ctx.font = '700 23px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff9f2';
  ctx.fillText(text, 210, 39);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  }));
  sprite.scale.set(1.75, 0.32, 1);
  sprite.renderOrder = 24;
  sprite.userData.labelTexture = texture;
  sprite.userData.detailLabel = true;
  return sprite;
}

function makeAirDetailLabel(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 420;
  canvas.height = 76;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(5,35,50,.90)';
  ctx.strokeStyle = 'rgba(92,220,255,.96)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(4, 4, 412, 68, 12);
  ctx.fill();
  ctx.stroke();
  ctx.font = '700 22px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e9fbff';
  ctx.fillText(text, 210, 39);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  }));
  sprite.scale.set(1.62, 0.30, 1);
  sprite.renderOrder = 25;
  sprite.userData.labelTexture = texture;
  sprite.userData.detailLabel = true;
  sprite.userData.airSystemLabel = true;
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
  const labelsRef = useRef(labels);
  const contextModeRef = useRef(contextMode);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { labelsRef.current = labels; }, [labels]);
  useEffect(() => { contextModeRef.current = contextMode; }, [contextMode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a2234');
    scene.fog = new THREE.Fog('#0a2234', 18, 46);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(70, 20, 10),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: 'varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'varying vec3 vPos; void main(){ float h=normalize(vPos).y*0.5+0.5; vec3 low=vec3(0.035,0.085,0.125); vec3 mid=vec3(0.070,0.165,0.235); vec3 high=vec3(0.12,0.27,0.36); vec3 col=mix(low,mid,smoothstep(0.12,0.58,h)); col=mix(col,high,smoothstep(0.58,1.0,h)); gl_FragColor=vec4(col,1.0); }',
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
    renderer.toneMappingExposure = 1.70;
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

    const ambient = new THREE.AmbientLight('#a9dcff', mobileRender ? 1.10 : 1.20);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight('#b8e5ff', '#102332', mobileRender ? 1.28 : 1.35);
    hemi.position.set(0, 12, 0);
    scene.add(hemi);

    const key = new THREE.DirectionalLight('#ffffff', mobileRender ? 2.05 : 2.35);
    key.position.set(-7, 10, 9);
    key.castShadow = !mobileRender;
    scene.add(key);

    const fill = new THREE.DirectionalLight('#8ed2ff', mobileRender ? 1.00 : 1.28);
    fill.position.set(8, 5, 7);
    scene.add(fill);

    const rim = new THREE.DirectionalLight('#58bfff', mobileRender ? 0.85 : 1.10);
    rim.position.set(8, 6, -9);
    scene.add(rim);

    const topLight = new THREE.PointLight('#c8eaff', mobileRender ? 0.78 : 1.12, 28, 2);
    topLight.position.set(0, 6.0, 0);
    scene.add(topLight);

    const frontLift = new THREE.PointLight('#d7efff', mobileRender ? 0.58 : 0.85, 22, 2);
    frontLift.position.set(-6.5, 2.5, 6.5);
    scene.add(frontLift);

    const fireLight = new THREE.PointLight('#ff7624', mobileRender ? 2.65 : 3.25, 14, 2);
    fireLight.position.set(-2.4, -0.7, 0);
    scene.add(fireLight);

    const burnerKey = new THREE.PointLight('#cdeeff', mobileRender ? 2.4 : 3.0, 8.5, 2);
    burnerKey.position.set(-5.2, 0.65, 2.35);
    burnerKey.visible = false;
    scene.add(burnerKey);

    const burnerFill = new THREE.PointLight('#ffb66e', mobileRender ? 1.2 : 1.7, 6.0, 2);
    burnerFill.position.set(-4.15, -0.55, 1.45);
    burnerFill.visible = false;
    scene.add(burnerFill);

    const burnerRim = new THREE.PointLight('#68ddff', mobileRender ? 0.95 : 1.35, 5.4, 2);
    burnerRim.position.set(-5.80, 0.15, -1.15);
    burnerRim.visible = false;
    scene.add(burnerRim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(12.8, mobileRender ? 40 : 72),
      new THREE.MeshStandardMaterial({ color: '#17313e', map: concreteTex, metalness: 0.08, roughness: 0.82 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3.17;
    ground.receiveShadow = !mobileRender;
    scene.add(ground);

    const grid = new THREE.GridHelper(30, 30, '#2c789c', '#1b4b66');
    grid.position.y = -3.145;
    (grid.material as THREE.Material).opacity = 0.28;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const root = new THREE.Group();
    root.rotation.y = -0.12;
    scene.add(root);

    const components = new Map<string, THREE.Group>();
    const labelGroup = new THREE.Group();
    const flowGroup = new THREE.Group();
    const flameLayers: THREE.Mesh[] = [];
    const pilotFlameLayers: THREE.Mesh[] = [];
    const flameLights: THREE.PointLight[] = [];
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
    const labelPriority: Record<string, number> = {
      'Furnace Tube': 4,
      'Burner & Ignition': 4,
      'Front Smokebox': 4,
      'Rear Smokebox': 4,
      'Stack / Flue Outlet': 4,
      'Economizer': 3,
      'Boiler Shell': 3,
      'Fire Tubes': 3,
      'Tube Sheets': 3,
      'Steam Outlet': 2,
      'Safety Valve': 2,
      'Feedwater Inlet': 2,
      'Level Gauge': 2,
      'Pressure Controls': 1,
      'Level Sensors': 1,
      'Steam Space': 1,
      'Water Space': 1,
      'Blowdown Valve': 1,
    };

    const addLabel = (name: string, pos: THREE.Vector3) => {
      const s = makeLabel(name);
      s.position.copy(pos);
      s.userData.baseLabelScale = s.scale.clone();
      s.userData.component = name;
      s.userData.labelPriority = labelPriority[name] ?? 1;
      labelGroup.add(s);
      return s;
    };
    const addDetailLabel = (text: string, componentName: string, pos: THREE.Vector3) => {
      const s = makeDetailLabel(text);
      s.position.copy(pos);
      s.scale.set(mobileRender ? 1.08 : 1.30, mobileRender ? 0.205 : 0.245, 1);
      s.userData.baseLabelScale = s.scale.clone();
      s.userData.component = componentName;
      labelGroup.add(s);
      return s;
    };

    const addAirDetailLabel = (text: string, componentName: string, pos: THREE.Vector3) => {
      const s = makeAirDetailLabel(text);
      s.position.copy(pos);
      s.scale.set(mobileRender ? 1.00 : 1.22, mobileRender ? 0.19 : 0.225, 1);
      s.userData.baseLabelScale = s.scale.clone();
      s.userData.component = componentName;
      labelGroup.add(s);
      return s;
    };

    const fireTubeCoords: [number, number][] = [];
    [-1.35, -0.9, -0.45, 0, 0.45, 0.9, 1.35].forEach(y => {
      [-1.45, -0.95, -0.45, 0.45, 0.95, 1.45].forEach(z => {
        if (y < -0.45 && Math.abs(z) < 0.95) return;
        if (Math.hypot(y * 0.92, z) < 1.95) fireTubeCoords.push([y, z]);
      });
    });

    // The master model is a schematic three-pass fire-tube arrangement.
    // Pass 1 is the furnace.  The lower fire-tube bank returns gas to the
    // front (Pass 2), while the upper bank carries gas back to the rear
    // (Pass 3) before the economizer and stack.
    const pass2TubeCoords = fireTubeCoords.filter(([y]) => y <= 0);
    const pass3TubeCoords = fireTubeCoords.filter(([y]) => y > 0);

    // BOILER SHELL
    {
      const name = 'Boiler Shell';
      const g = component(name);
      const shellMat = material('#7c8e96', 0.78, 0.31, 1, undefined, paintedSteelTex);
      const seamMat = material('#b3c1c8', 0.86, 0.23, 1, undefined, stainlessTex);
      const supportMat = material('#52646e', 0.80, 0.40, 1, undefined, darkSteelTex);

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

        const baseplate = box(1.45, 0.12, 3.25, material('#40535d', 0.80, 0.43, 1, undefined, darkSteelTex));
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
      const furnaceMat = material('#46545c', 0.84, 0.31, 1, undefined, darkSteelTex);
      const furnace = cylinderX(0.82, 6.7, furnaceMat, mobileRender ? 36 : 52);
      furnace.position.y = -0.82;
      tagMaterial(furnace, 1, 'internal');
      mark(furnace, name);
      g.add(furnace);

      // Corrugation rings give the furnace a more realistic pressure-vessel reading.
      const corrugationMat = material('#64727a', 0.86, 0.27, 1, undefined, darkSteelTex);
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
      addDetailLabel('PASS 1 · FRONT → REAR', name, new THREE.Vector3(0.15, -1.56, 1.42));
    }

    // FIRE TUBES — explicit 2nd and 3rd gas passes
    {
      const name = 'Fire Tubes';
      const g = component(name);
      const pass2Mat = material('#9b6f4d', 0.84, 0.30, 1, '#5e2110', darkSteelTex);
      const pass3Mat = material('#6f8790', 0.86, 0.29, 1, '#17394a', darkSteelTex);

      pass2TubeCoords.forEach(([y, z]) => {
        const t = cylinderX(0.105, 6.72, pass2Mat, mobileRender ? 10 : 16);
        t.position.set(0, y + 0.18, z);
        t.userData.gasPass = 2;
        tagMaterial(t, 1, 'internal');
        mark(t, name);
        g.add(t);
      });

      pass3TubeCoords.forEach(([y, z]) => {
        const t = cylinderX(0.105, 6.72, pass3Mat, mobileRender ? 10 : 16);
        t.position.set(0, y + 0.18, z);
        t.userData.gasPass = 3;
        tagMaterial(t, 1, 'internal');
        mark(t, name);
        g.add(t);
      });

      addLabel(name, new THREE.Vector3(0.2, 0.55, -2.15));
      addDetailLabel('PASS 2 · REAR → FRONT', name, new THREE.Vector3(0.10, -0.05, -2.16));
      addDetailLabel('PASS 3 · FRONT → REAR', name, new THREE.Vector3(0.10, 1.34, -2.16));
    }

    // TUBE SHEETS
    {
      const name = 'Tube Sheets';
      const g = component(name);
      const sheetMat = material('#748188', 0.88, 0.29, 1, undefined, stainlessTex);
      const pass2RimMat = material('#c18a5f', 0.80, 0.24, 1, undefined, stainlessTex);
      const pass3RimMat = material('#86a3ad', 0.82, 0.24, 1, undefined, stainlessTex);
      const tubeEndGeometry = new THREE.TorusGeometry(0.118, 0.016, 7, mobileRender ? 12 : 18);

      [-3.46, 3.46].forEach(x => {
        const sheet = cylinderX(2.16, 0.16, sheetMat, mobileRender ? 44 : 60);
        sheet.position.x = x;
        tagMaterial(sheet, 0.78, 'internal');
        mark(sheet, name);
        g.add(sheet);

        fireTubeCoords.forEach(([y,z]) => {
          const rim = new THREE.Mesh(tubeEndGeometry, y <= 0 ? pass2RimMat : pass3RimMat);
          rim.rotation.y = Math.PI / 2;
          rim.position.set(x + (x < 0 ? -0.09 : 0.09), y + 0.18, z);
          rim.userData.gasPass = y <= 0 ? 2 : 3;
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
      const casingMat = material('#5f737e', 0.80, 0.32, 1, undefined, darkSteelTex);
      const doorMat = material('#7d9099', 0.84, 0.27, 1, undefined, paintedSteelTex);
      const trimMat = material('#bac5ca', 0.88, 0.22, 1, undefined, stainlessTex);

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

      // Schematic front turnaround divider: Pass 2 gas arrives in the lower
      // chamber, turns around the divider and enters the upper Pass 3 bank.
      const frontTurnaroundPlate = box(0.30, 0.10, 2.95, material('#8b969b', 0.82, 0.32, 1, undefined, stainlessTex));
      frontTurnaroundPlate.position.set(-3.78, 0.64, 0.18);
      tagMaterial(frontTurnaroundPlate, 1, 'utility');
      mark(frontTurnaroundPlate, name);
      g.add(frontTurnaroundPlate);

      const frontGuide = box(0.30, 1.20, 0.10, material('#6c7d84', 0.78, 0.36, 1, undefined, darkSteelTex));
      frontGuide.position.set(-3.78, 1.18, -1.28);
      tagMaterial(frontGuide, 1, 'utility');
      mark(frontGuide, name);
      g.add(frontGuide);

      // Burner mounting flange and refractory throat / quarl.
      addFlangeX(g, -4.34, -0.82, 0, 0.76, 0.45, 0.12, trimMat, name);
      addBoltRingX(g, -4.42, 0.62, mobileRender ? 8 : 12, trimMat, name, 0.040, -0.82, 0);
      const throatMat = material('#9a7658', 0.05, 0.92, 1, undefined, refractoryTex);
      const throatLining = new THREE.Mesh(
        new THREE.CylinderGeometry(0.54, 0.68, 0.78, mobileRender ? 24 : 36, 1, true),
        throatMat,
      );
      throatLining.rotation.z = Math.PI / 2;
      throatLining.position.set(-3.95, -0.82, 0);
      tagMaterial(throatLining, 1, 'utility');
      mark(throatLining, name);
      g.add(throatLining);

      const throatCollar = cylinderX(0.72, 0.10, trimMat, 36);
      throatCollar.position.set(-4.31, -0.82, 0);
      tagMaterial(throatCollar, 1, 'utility');
      mark(throatCollar, name);
      g.add(throatCollar);

      addLabel(name, new THREE.Vector3(-4.0, 2.45, 0));
    }
    {
      const name = 'Burner & Ignition';
      const g = component(name);

      const paintedMat = material('#88a0ab', 0.72, 0.28, 1, undefined, paintedSteelTex);
      const darkMat = material('#5d7079', 0.74, 0.32, 1, undefined, darkSteelTex);
      const trimMat = material('#d0d9dd', 0.88, 0.20, 1, undefined, stainlessTex);
      const brassMat = material('#c89549', 0.68, 0.28);
      const pilotPipeMat = material('#e0bb61', 0.70, 0.25);
      const mainFuelMat = material('#a9633e', 0.72, 0.32);
      const ceramicMat = material('#f0ead8', 0.04, 0.58);
      const cableMat = material('#39464d', 0.22, 0.58);

      // -------------------------------------------------------------------
      // Main burner body / windbox.  The main axis points directly into
      // the refractory throat and furnace, making the relationship obvious.
      // -------------------------------------------------------------------
      const windbox = cylinderX(0.66, 1.18, paintedMat, mobileRender ? 30 : 46);
      windbox.position.set(-4.92, -0.82, 0);
      windbox.castShadow = !mobileRender;
      tagMaterial(windbox, 1, 'utility');
      mark(windbox, name);
      g.add(windbox);

      const windboxRear = cylinderX(0.72, 0.12, trimMat, mobileRender ? 28 : 42);
      windboxRear.position.set(-5.55, -0.82, 0);
      tagMaterial(windboxRear, 1, 'utility');
      mark(windboxRear, name);
      g.add(windboxRear);

      const windboxFront = cylinderX(0.73, 0.12, trimMat, mobileRender ? 28 : 42);
      windboxFront.position.set(-4.32, -0.82, 0);
      tagMaterial(windboxFront, 1, 'utility');
      mark(windboxFront, name);
      g.add(windboxFront);

      // Observation / inspection window on burner housing.
      const sightHousing = cylinderBetween(
        new THREE.Vector3(-4.72, -0.28, 0.48),
        new THREE.Vector3(-4.57, -0.10, 0.68),
        0.105,
        darkMat,
        14,
      );
      tagMaterial(sightHousing, 1, 'utility');
      mark(sightHousing, name);
      g.add(sightHousing);
      const sightGlass = new THREE.Mesh(
        new THREE.SphereGeometry(0.10, mobileRender ? 12 : 18, 8),
        new THREE.MeshPhysicalMaterial({
          color: '#79dfff',
          roughness: 0.05,
          metalness: 0,
          transparent: true,
          opacity: 0.68,
          transmission: mobileRender ? 0 : 0.32,
        }),
      );
      sightGlass.position.set(-4.53, -0.06, 0.72);
      sightGlass.userData.component = name;
      sightGlass.userData.kind = 'utility';
      sightGlass.userData.baseOpacity = 0.68;
      g.add(sightGlass);

      // -------------------------------------------------------------------
      // Air register: ring + visible swirl vanes immediately before throat.
      // -------------------------------------------------------------------
      const registerRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.54, 0.055, 10, mobileRender ? 28 : 44),
        trimMat,
      );
      registerRing.rotation.y = Math.PI / 2;
      registerRing.position.set(-4.25, -0.82, 0);
      tagMaterial(registerRing, 1, 'utility');
      mark(registerRing, name);
      g.add(registerRing);

      const registerHub = cylinderX(0.14, 0.18, brassMat, 20);
      registerHub.position.set(-4.20, -0.82, 0);
      tagMaterial(registerHub, 1, 'utility');
      mark(registerHub, name);
      g.add(registerHub);

      const registerInnerRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.31, 0.026, 8, mobileRender ? 22 : 34),
        darkMat,
      );
      registerInnerRing.rotation.y = Math.PI / 2;
      registerInnerRing.position.set(-4.205, -0.82, 0);
      tagMaterial(registerInnerRing, 1, 'utility');
      mark(registerInnerRing, name);
      g.add(registerInnerRing);

      const vaneCount = mobileRender ? 8 : 12;
      for (let i = 0; i < vaneCount; i += 1) {
        const angle = (i / vaneCount) * Math.PI * 2;
        const end = new THREE.Vector3(
          -4.20,
          -0.82 + Math.sin(angle) * 0.34,
          Math.cos(angle) * 0.34,
        );
        const spoke = cylinderBetween(
          new THREE.Vector3(-4.20, -0.82, 0),
          end,
          0.020,
          trimMat,
          8,
        );
        tagMaterial(spoke, 1, 'utility');
        mark(spoke, name);
        g.add(spoke);

        const vane = box(0.17, 0.052, 0.24, trimMat);
        vane.position.copy(end);
        vane.rotation.x = -angle + 0.48;
        vane.rotation.z = 0.18;
        tagMaterial(vane, 1, 'utility');
        mark(vane, name);
        g.add(vane);
      }

      // Short burner throat sleeve from register into front refractory.
      const throatSleeve = cylinderX(0.42, 0.62, trimMat, 30);
      throatSleeve.position.set(-4.00, -0.82, 0);
      tagMaterial(throatSleeve, 1, 'utility');
      mark(throatSleeve, name);
      g.add(throatSleeve);

      // -------------------------------------------------------------------
      // Combustion-air package — compact direct-drive centrifugal blower.
      // Geometry is intentionally schematic, but the visual language follows
      // real industrial burner packages: TEFC motor -> coupling -> impeller /
      // volute -> tangential discharge -> windbox / air register.
      // -------------------------------------------------------------------
      const motorMat = material('#344750', 0.76, 0.36, 1, undefined, darkSteelTex);
      const motorEdgeMat = material('#607782', 0.82, 0.27, 1, undefined, paintedSteelTex);
      const blowerMat = material('#55737f', 0.74, 0.30, 1, undefined, paintedSteelTex);
      const blowerEdgeMat = material('#91a7af', 0.84, 0.23, 1, undefined, stainlessTex);
      const couplingGuardMat = material('#425862', 0.74, 0.38, 0.94, undefined, darkSteelTex);
      const blowerX = -5.74;
      const blowerY = -0.17;
      const blowerZ = 0.52;
      const motorX = -6.63;
      const motorY = -0.12;
      const motorZ = 0.52;

      // Compact downstream plenum.  It is deliberately smaller than the fan
      // so the air path reads as: scroll casing -> tangential discharge ->
      // transition -> windbox instead of one large anonymous black block.
      const airPlenum = box(0.58, 0.68, 0.76, darkMat);
      airPlenum.position.set(-5.11, -0.57, 0.10);
      tagMaterial(airPlenum, 1, 'utility');
      mark(airPlenum, name);
      g.add(airPlenum);

      const airDuct = box(0.44, 0.56, 0.66, paintedMat);
      airDuct.position.set(-4.82, -0.75, 0.07);
      airDuct.rotation.z = -0.10;
      tagMaterial(airDuct, 1, 'utility');
      mark(airDuct, name);
      g.add(airDuct);

      // Centrifugal scroll casing.  The new profile is intentionally
      // asymmetric with an obvious discharge tongue, so it reads as a volute
      // from both oblique and side views instead of a thick circular plate.
      const blowerScroll = new THREE.Mesh(
        makeBlowerVoluteGeometry(mobileRender ? 0.26 : 0.30, mobileRender),
        blowerMat,
      );
      blowerScroll.rotation.y = Math.PI / 2;
      blowerScroll.position.set(blowerX, blowerY, blowerZ);
      blowerScroll.castShadow = !mobileRender;
      blowerScroll.receiveShadow = !mobileRender;
      tagMaterial(blowerScroll, 1, 'utility');
      mark(blowerScroll, name);
      g.add(blowerScroll);

      // Inlet eye / bellmouth.  Slightly smaller than the previous version so
      // the scroll body remains visible around it.
      const blowerInletRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.255, 0.032, mobileRender ? 8 : 10, mobileRender ? 24 : 38),
        blowerEdgeMat,
      );
      blowerInletRim.rotation.y = Math.PI / 2;
      blowerInletRim.position.set(blowerX + 0.17, blowerY + 0.02, blowerZ + 0.02);
      tagMaterial(blowerInletRim, 1, 'utility');
      mark(blowerInletRim, name);
      g.add(blowerInletRim);

      const inletBell = cylinderX(0.220, 0.090, blowerEdgeMat, mobileRender ? 24 : 36);
      inletBell.position.set(blowerX + 0.21, blowerY + 0.02, blowerZ + 0.02);
      tagMaterial(inletBell, 1, 'utility');
      mark(inletBell, name);
      g.add(inletBell);

      const inletDark = cylinderX(0.175, 0.105, material('#13242d', 0.18, 0.62), mobileRender ? 20 : 32);
      inletDark.position.set(blowerX + 0.215, blowerY + 0.02, blowerZ + 0.02);
      tagMaterial(inletDark, 1, 'utility');
      mark(inletDark, name);
      g.add(inletDark);

      // Static impeller hint for the geometry-approval pass.
      const impellerHub = cylinderX(0.065, 0.11, trimMat, 18);
      impellerHub.position.set(blowerX + 0.22, blowerY + 0.02, blowerZ + 0.02);
      tagMaterial(impellerHub, 1, 'utility');
      mark(impellerHub, name);
      g.add(impellerHub);

      const impellerBladeCount = mobileRender ? 6 : 9;
      for (let i = 0; i < impellerBladeCount; i += 1) {
        const angle = (i / impellerBladeCount) * Math.PI * 2;
        const blade = box(0.044, 0.045, 0.155, blowerEdgeMat);
        blade.position.set(
          blowerX + 0.225,
          blowerY + 0.02 + Math.sin(angle) * 0.128,
          blowerZ + 0.02 + Math.cos(angle) * 0.128,
        );
        blade.rotation.x = -angle + 0.62;
        blade.rotation.z = 0.08;
        tagMaterial(blade, 1, 'utility');
        mark(blade, name);
        g.add(blade);
      }

      // Highly legible upper/inner tangential discharge.  Two short sections
      // form a visible elbow/transition down toward the burner windbox.
      const blowerOutlet = box(0.42, 0.25, 0.34, blowerMat);
      blowerOutlet.position.set(-5.49, 0.10, 0.09);
      tagMaterial(blowerOutlet, 1, 'utility');
      mark(blowerOutlet, name);
      g.add(blowerOutlet);

      const outletFlange = box(0.07, 0.31, 0.40, blowerEdgeMat);
      outletFlange.position.set(-5.27, 0.10, 0.09);
      tagMaterial(outletFlange, 1, 'utility');
      mark(outletFlange, name);
      g.add(outletFlange);

      const transitionUpper = box(0.44, 0.24, 0.36, paintedMat);
      transitionUpper.position.set(-5.09, -0.02, 0.09);
      transitionUpper.rotation.z = -0.34;
      tagMaterial(transitionUpper, 1, 'utility');
      mark(transitionUpper, name);
      g.add(transitionUpper);

      const transitionLower = box(0.36, 0.28, 0.46, paintedMat);
      transitionLower.position.set(-5.02, -0.31, 0.10);
      transitionLower.rotation.z = -0.12;
      tagMaterial(transitionLower, 1, 'utility');
      mark(transitionLower, name);
      g.add(transitionLower);

      // Direct-drive shaft and coupling are deliberately exposed by increasing
      // the motor/fan spacing.  The guard is compact enough that both hubs are
      // still visually understandable.
      const driveShaft = cylinderX(0.040, 0.34, trimMat, 14);
      driveShaft.position.set(-6.05, motorY, motorZ);
      tagMaterial(driveShaft, 1, 'utility');
      mark(driveShaft, name);
      g.add(driveShaft);

      const couplingHubA = cylinderX(0.095, 0.095, blowerEdgeMat, 18);
      couplingHubA.position.set(-5.92, motorY, motorZ);
      tagMaterial(couplingHubA, 1, 'utility');
      mark(couplingHubA, name);
      g.add(couplingHubA);

      const couplingHubB = cylinderX(0.095, 0.095, blowerEdgeMat, 18);
      couplingHubB.position.set(-6.18, motorY, motorZ);
      tagMaterial(couplingHubB, 1, 'utility');
      mark(couplingHubB, name);
      g.add(couplingHubB);

      const couplingGuard = cylinderX(0.135, 0.30, couplingGuardMat, mobileRender ? 18 : 28);
      couplingGuard.position.set(-6.05, motorY, motorZ);
      tagMaterial(couplingGuard, 0.90, 'utility');
      mark(couplingGuard, name);
      g.add(couplingGuard);

      // TEFC-style drive motor.  Retain the successful motor design, but move
      // it slightly rearward so the coupling and fan inlet are no longer visually fused.
      const motor = cylinderX(0.27, 0.82, motorMat, mobileRender ? 24 : 36);
      motor.position.set(motorX, motorY, motorZ);
      motor.castShadow = !mobileRender;
      tagMaterial(motor, 1, 'utility');
      mark(motor, name);
      g.add(motor);

      const motorFrontBell = cylinderX(0.30, 0.11, motorEdgeMat, mobileRender ? 22 : 32);
      motorFrontBell.position.set(-6.18, motorY, motorZ);
      tagMaterial(motorFrontBell, 1, 'utility');
      mark(motorFrontBell, name);
      g.add(motorFrontBell);

      const motorRearBell = cylinderX(0.30, 0.11, motorEdgeMat, mobileRender ? 22 : 32);
      motorRearBell.position.set(-7.08, motorY, motorZ);
      tagMaterial(motorRearBell, 1, 'utility');
      mark(motorRearBell, name);
      g.add(motorRearBell);

      const motorFinCount = mobileRender ? 6 : 10;
      for (let i = 0; i < motorFinCount; i += 1) {
        const angle = (i / motorFinCount) * Math.PI * 2;
        const fin = box(0.66, 0.024, 0.076, motorEdgeMat);
        fin.position.set(
          motorX,
          motorY + Math.sin(angle) * 0.284,
          motorZ + Math.cos(angle) * 0.284,
        );
        fin.rotation.x = -angle;
        tagMaterial(fin, 1, 'utility');
        mark(fin, name);
        g.add(fin);
      }

      const terminalBox = box(0.29, 0.19, 0.27, motorEdgeMat);
      terminalBox.position.set(motorX + 0.02, motorY + 0.34, motorZ);
      tagMaterial(terminalBox, 1, 'utility');
      mark(terminalBox, name);
      g.add(terminalBox);

      const terminalLid = box(0.33, 0.040, 0.31, trimMat);
      terminalLid.position.set(motorX + 0.02, motorY + 0.455, motorZ);
      tagMaterial(terminalLid, 1, 'utility');
      mark(terminalLid, name);
      g.add(terminalLid);

      const cableGland = cylinderBetween(
        new THREE.Vector3(motorX + 0.02, motorY + 0.34, motorZ + 0.15),
        new THREE.Vector3(motorX + 0.02, motorY + 0.34, motorZ + 0.29),
        0.038,
        trimMat,
        10,
      );
      tagMaterial(cableGland, 1, 'utility');
      mark(cableGland, name);
      g.add(cableGland);

      // Open rear cooling-fan guard.
      const motorFanGuardRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.305, 0.029, 8, mobileRender ? 22 : 36),
        motorEdgeMat,
      );
      motorFanGuardRing.rotation.y = Math.PI / 2;
      motorFanGuardRing.position.set(-7.17, motorY, motorZ);
      tagMaterial(motorFanGuardRing, 1, 'utility');
      mark(motorFanGuardRing, name);
      g.add(motorFanGuardRing);

      const guardHub = cylinderX(0.064, 0.085, trimMat, 14);
      guardHub.position.set(-7.17, motorY, motorZ);
      tagMaterial(guardHub, 1, 'utility');
      mark(guardHub, name);
      g.add(guardHub);

      const guardSpokes = mobileRender ? 5 : 7;
      for (let i = 0; i < guardSpokes; i += 1) {
        const angle = (i / guardSpokes) * Math.PI * 2;
        const spoke = cylinderBetween(
          new THREE.Vector3(-7.17, motorY, motorZ),
          new THREE.Vector3(
            -7.17,
            motorY + Math.sin(angle) * 0.264,
            motorZ + Math.cos(angle) * 0.264,
          ),
          0.012,
          motorEdgeMat,
          7,
        );
        tagMaterial(spoke, 1, 'utility');
        mark(spoke, name);
        g.add(spoke);
      }

      // Lightweight skid: two narrow rails and two cross-ties instead of one
      // thick slab, so the support no longer competes with the machinery.
      [-0.20, 0.20].forEach(zOffset => {
        const rail = box(1.42, 0.050, 0.12, darkMat);
        rail.position.set(motorX, -0.47, motorZ + zOffset);
        tagMaterial(rail, 1, 'utility');
        mark(rail, name);
        g.add(rail);
      });

      [-6.90, -6.36].forEach(x => {
        const tie = box(0.12, 0.045, 0.55, motorEdgeMat);
        tie.position.set(x, -0.445, motorZ);
        tagMaterial(tie, 1, 'utility');
        mark(tie, name);
        g.add(tie);
      });

      [-6.84, -6.43].forEach(x => {
        [-0.17, 0.17].forEach(zOffset => {
          const foot = box(0.18, 0.085, 0.18, motorEdgeMat);
          foot.position.set(x, -0.385, motorZ + zOffset);
          tagMaterial(foot, 1, 'utility');
          mark(foot, name);
          g.add(foot);
        });
      });

      // Small blower pedestal ties the scroll into the skid without creating a
      // large dark block under the fan.
      const blowerPedestal = box(0.26, 0.16, 0.42, motorEdgeMat);
      blowerPedestal.position.set(blowerX, -0.66, blowerZ);
      tagMaterial(blowerPedestal, 1, 'utility');
      mark(blowerPedestal, name);
      g.add(blowerPedestal);

      const blowerPad = box(0.40, 0.045, 0.52, darkMat);
      blowerPad.position.set(blowerX, -0.755, blowerZ);
      tagMaterial(blowerPad, 1, 'utility');
      mark(blowerPad, name);
      g.add(blowerPad);

      // -------------------------------------------------------------------
      // Main fuel gun and nozzle.
      // -------------------------------------------------------------------
      const mainFuelLineA = cylinderBetween(
        new THREE.Vector3(-6.32, -1.06, 0.58),
        new THREE.Vector3(-5.55, -1.02, 0.48),
        0.052,
        mainFuelMat,
        12,
      );
      const mainFuelLineB = cylinderBetween(
        new THREE.Vector3(-5.55, -1.02, 0.48),
        new THREE.Vector3(-4.92, -0.96, 0.22),
        0.052,
        mainFuelMat,
        12,
      );
      [mainFuelLineA, mainFuelLineB].forEach(pipe => {
        tagMaterial(pipe, 1, 'utility');
        mark(pipe, name);
        g.add(pipe);
      });

      const mainSolenoid = box(0.30, 0.36, 0.28, material('#3d5a68', 0.62, 0.44, 1, undefined, paintedSteelTex));
      mainSolenoid.position.set(-5.55, -1.01, 0.48);
      tagMaterial(mainSolenoid, 1, 'utility');
      mark(mainSolenoid, name);
      g.add(mainSolenoid);

      const fuelGun = cylinderX(0.065, 1.55, trimMat, 16);
      fuelGun.position.set(-4.42, -0.82, 0);
      tagMaterial(fuelGun, 1, 'utility');
      mark(fuelGun, name);
      g.add(fuelGun);

      const nozzleBody = cylinderX(0.12, 0.20, brassMat, 18);
      nozzleBody.position.set(-3.63, -0.82, 0);
      tagMaterial(nozzleBody, 1, 'utility');
      mark(nozzleBody, name);
      g.add(nozzleBody);

      const nozzleTip = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.28, 16),
        brassMat,
      );
      nozzleTip.rotation.z = -Math.PI / 2;
      nozzleTip.position.set(-3.49, -0.82, 0);
      tagMaterial(nozzleTip, 1, 'utility');
      mark(nozzleTip, name);
      g.add(nozzleTip);

      // -------------------------------------------------------------------
      // Dedicated pilot burner and pilot gas train.
      // -------------------------------------------------------------------
      const pilotTube = cylinderBetween(
        new THREE.Vector3(-5.42, -0.42, 0.48),
        new THREE.Vector3(-3.76, -0.58, 0.24),
        0.042,
        pilotPipeMat,
        12,
      );
      tagMaterial(pilotTube, 1, 'utility');
      mark(pilotTube, name);
      g.add(pilotTube);

      const pilotBody = cylinderBetween(
        new THREE.Vector3(-4.35, -0.56, 0.26),
        new THREE.Vector3(-3.74, -0.60, 0.22),
        0.070,
        brassMat,
        14,
      );
      tagMaterial(pilotBody, 1, 'utility');
      mark(pilotBody, name);
      g.add(pilotBody);

      const pilotTip = new THREE.Mesh(
        new THREE.ConeGeometry(0.085, 0.26, 14),
        pilotPipeMat,
      );
      pilotTip.rotation.z = -Math.PI / 2;
      pilotTip.position.set(-3.63, -0.61, 0.21);
      tagMaterial(pilotTip, 1, 'utility');
      mark(pilotTip, name);
      g.add(pilotTip);

      const pilotGasA = cylinderBetween(
        new THREE.Vector3(-6.18, -0.50, 0.72),
        new THREE.Vector3(-5.72, -0.46, 0.62),
        0.036,
        pilotPipeMat,
        10,
      );
      const pilotGasB = cylinderBetween(
        new THREE.Vector3(-5.72, -0.46, 0.62),
        new THREE.Vector3(-5.40, -0.42, 0.48),
        0.036,
        pilotPipeMat,
        10,
      );
      [pilotGasA, pilotGasB].forEach(pipe => {
        tagMaterial(pipe, 1, 'utility');
        mark(pipe, name);
        g.add(pipe);
      });

      const pilotSolenoid = box(0.22, 0.28, 0.22, material('#3d5a68', 0.62, 0.44, 1, undefined, paintedSteelTex));
      pilotSolenoid.position.set(-5.72, -0.46, 0.62);
      tagMaterial(pilotSolenoid, 1, 'utility');
      mark(pilotSolenoid, name);
      g.add(pilotSolenoid);

      // Small pilot flame: independent layered blue-root / pale-tip flame.
      const pilotOuterMat = makeFlameMaterial('#3f8cff', '#ffd894', 0.70, 12.4);
      const pilotOuter = new THREE.Mesh(
        makeFlameEnvelopeGeometry(
          0.66,
          [[0, 0.035], [0.16, 0.095], [0.42, 0.12], [0.72, 0.075], [1, 0.012]],
          mobileRender ? 12 : 18,
        ),
        pilotOuterMat,
      );
      pilotOuter.rotation.z = -Math.PI / 2;
      pilotOuter.position.set(-3.60, -0.61, 0.21);
      pilotOuter.userData.baseScale = new THREE.Vector3(1, 1, 1);
      pilotOuter.userData.phase = 1.7;
      tagMaterial(pilotOuter, 0.70, 'internal');
      mark(pilotOuter, name);
      g.add(pilotOuter);
      pilotFlameLayers.push(pilotOuter);

      const pilotCoreMat = makeFlameMaterial('#b8e6ff', '#fff0b7', 0.72, 14.1);
      const pilotCore = new THREE.Mesh(
        makeFlameEnvelopeGeometry(
          0.42,
          [[0, 0.022], [0.2, 0.055], [0.48, 0.07], [0.78, 0.04], [1, 0.008]],
          mobileRender ? 10 : 14,
        ),
        pilotCoreMat,
      );
      pilotCore.rotation.z = -Math.PI / 2;
      pilotCore.position.set(-3.59, -0.61, 0.21);
      pilotCore.userData.baseScale = new THREE.Vector3(1, 1, 1);
      pilotCore.userData.phase = 3.2;
      tagMaterial(pilotCore, 0.72, 'internal');
      mark(pilotCore, name);
      g.add(pilotCore);
      pilotFlameLayers.push(pilotCore);

      // -------------------------------------------------------------------
      // Ignition transformer, ceramic electrode and high-voltage cable.
      // -------------------------------------------------------------------
      const ignitionTransformer = box(0.48, 0.34, 0.40, material('#374952', 0.68, 0.42, 1, undefined, paintedSteelTex));
      ignitionTransformer.position.set(-5.36, -0.05, -0.58);
      tagMaterial(ignitionTransformer, 1, 'utility');
      mark(ignitionTransformer, name);
      g.add(ignitionTransformer);

      const transformerCap = box(0.34, 0.08, 0.30, trimMat);
      transformerCap.position.set(-5.36, 0.16, -0.58);
      tagMaterial(transformerCap, 1, 'utility');
      mark(transformerCap, name);
      g.add(transformerCap);

      const electrodeStarts = [
        new THREE.Vector3(-4.78, -0.34, -0.27),
        new THREE.Vector3(-4.78, -0.28, -0.43),
      ];
      const electrodeEnds = [
        new THREE.Vector3(-3.68, -0.68, -0.07),
        new THREE.Vector3(-3.70, -0.62, -0.20),
      ];
      electrodeStarts.forEach((start, i) => {
        const ceramicHolder = cylinderBetween(
          start,
          start.clone().lerp(electrodeEnds[i], 0.34),
          0.050,
          ceramicMat,
          12,
        );
        tagMaterial(ceramicHolder, 1, 'utility');
        mark(ceramicHolder, name);
        g.add(ceramicHolder);

        const electrode = cylinderBetween(
          start.clone().lerp(electrodeEnds[i], 0.30),
          electrodeEnds[i],
          0.017,
          trimMat,
          10,
        );
        tagMaterial(electrode, 1, 'utility');
        mark(electrode, name);
        g.add(electrode);
      });

      const sparkGap = cylinderBetween(
        electrodeEnds[0],
        electrodeEnds[1],
        0.010,
        new THREE.MeshBasicMaterial({ color: '#b9e6ff', transparent: true, opacity: 0.88 }),
        7,
      );
      sparkGap.userData.component = name;
      sparkGap.userData.kind = 'utility';
      sparkGap.userData.baseOpacity = 0.88;
      g.add(sparkGap);

      const hvCable = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(-5.28, 0.10, -0.48),
            new THREE.Vector3(-5.02, -0.02, -0.44),
            new THREE.Vector3(-4.82, -0.20, -0.38),
            new THREE.Vector3(-4.68, -0.32, -0.30),
          ]),
          mobileRender ? 18 : 32,
          0.022,
          7,
          false,
        ),
        cableMat,
      );
      tagMaterial(hvCable, 1, 'utility');
      mark(hvCable, name);
      g.add(hvCable);

      // -------------------------------------------------------------------
      // Flame scanner / UV-photo sensor with an aiming tube through the door.
      // -------------------------------------------------------------------
      const scannerTube = cylinderBetween(
        new THREE.Vector3(-4.84, -0.10, 0.52),
        new THREE.Vector3(-4.18, -0.48, 0.30),
        0.060,
        darkMat,
        14,
      );
      tagMaterial(scannerTube, 1, 'utility');
      mark(scannerTube, name);
      g.add(scannerTube);

      const scanner = cylinderBetween(
        new THREE.Vector3(-5.16, 0.02, 0.70),
        new THREE.Vector3(-4.82, -0.08, 0.58),
        0.135,
        material('#b69149', 0.72, 0.28),
        18,
      );
      tagMaterial(scanner, 1, 'utility');
      mark(scanner, name);
      g.add(scanner);

      const scannerRearCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, mobileRender ? 12 : 18, 8),
        darkMat,
      );
      scannerRearCap.position.set(-5.18, 0.03, 0.71);
      tagMaterial(scannerRearCap, 1, 'utility');
      mark(scannerRearCap, name);
      g.add(scannerRearCap);

      const scannerLens = new THREE.Mesh(
        new THREE.SphereGeometry(0.095, mobileRender ? 12 : 18, 8),
        new THREE.MeshPhysicalMaterial({
          color: '#64d5ff',
          roughness: 0.04,
          metalness: 0,
          transmission: mobileRender ? 0 : 0.28,
          transparent: true,
          opacity: 0.78,
          emissive: '#2b8dc1',
          emissiveIntensity: 0.35,
        }),
      );
      scannerLens.position.set(-4.76, -0.10, 0.56);
      scannerLens.userData.component = name;
      scannerLens.userData.kind = 'utility';
      scannerLens.userData.baseOpacity = 0.76;
      g.add(scannerLens);

      // -------------------------------------------------------------------
      // Layered industrial flame.  The geometry uses irregular radial
      // envelopes plus lightweight shader turbulence rather than a solid cone.
      // -------------------------------------------------------------------
      const flameRootX = -3.43;
      const addFlameLayer = (
        length: number,
        profile: Array<[number, number]>,
        low: string,
        high: string,
        opacity: number,
        seed: number,
        yOffset = 0,
        zOffset = 0,
        radialSegments = mobileRender ? 18 : 34,
      ) => {
        const mesh = new THREE.Mesh(
          makeFlameEnvelopeGeometry(length, profile, radialSegments),
          makeFlameMaterial(low, high, opacity, seed),
        );
        mesh.rotation.z = -Math.PI / 2;
        mesh.position.set(flameRootX, -0.82 + yOffset, zOffset);
        mesh.userData.baseScale = new THREE.Vector3(1, 1, 1);
        mesh.userData.phase = seed * 0.37;
        tagMaterial(mesh, opacity, 'internal');
        mark(mesh, name);
        g.add(mesh);
        flameLayers.push(mesh);
        return mesh;
      };

      addFlameLayer(
        5.05,
        [[0, 0.11], [0.08, 0.40], [0.20, 0.61], [0.38, 0.70], [0.56, 0.58], [0.73, 0.43], [0.90, 0.22], [1, 0.018]],
        '#ff8a28',
        '#ff4218',
        mobileRender ? 0.21 : 0.25,
        2.2,
        0.02,
        0.00,
        mobileRender ? 14 : 24,
      );

      addFlameLayer(
        4.48,
        [[0, 0.10], [0.08, 0.31], [0.21, 0.52], [0.40, 0.58], [0.58, 0.48], [0.76, 0.32], [0.92, 0.15], [1, 0.014]],
        '#ffd85a',
        '#ff731c',
        mobileRender ? 0.52 : 0.62,
        4.8,
        -0.015,
        -0.015,
      );

      addFlameLayer(
        2.78,
        [[0, 0.065], [0.10, 0.19], [0.30, 0.31], [0.52, 0.29], [0.74, 0.19], [0.92, 0.08], [1, 0.010]],
        '#fff9d8',
        '#ffc34a',
        mobileRender ? 0.62 : 0.72,
        7.1,
        0.005,
        0.018,
        mobileRender ? 14 : 22,
      );

      addFlameLayer(
        1.08,
        [[0, 0.035], [0.10, 0.11], [0.30, 0.21], [0.55, 0.18], [0.80, 0.09], [1, 0.008]],
        '#fffdf0',
        '#ffe073',
        mobileRender ? 0.72 : 0.82,
        9.6,
        0,
        0,
        mobileRender ? 12 : 18,
      );

      const rootLight = new THREE.PointLight('#ffd26a', mobileRender ? 1.15 : 1.75, 4.2, 2);
      rootLight.position.set(-3.15, -0.82, 0);
      rootLight.userData.baseIntensity = rootLight.intensity;
      g.add(rootLight);
      flameLights.push(rootLight);

      const bodyLight = new THREE.PointLight('#ff6b22', mobileRender ? 0.55 : 0.85, 5.8, 2);
      bodyLight.position.set(-1.95, -0.82, 0);
      bodyLight.userData.baseIntensity = bodyLight.intensity;
      g.add(bodyLight);
      flameLights.push(bodyLight);

      const burnerMajorLabel = addLabel(
        name,
        mobileRender
          ? new THREE.Vector3(-3.86, 1.28, 1.20)
          : new THREE.Vector3(-4.82, 1.28, 1.20),
      );
      burnerMajorLabel.scale.set(mobileRender ? 1.72 : 1.95, mobileRender ? 0.33 : 0.37, 1);
      burnerMajorLabel.userData.baseLabelScale = burnerMajorLabel.scale.clone();
      addDetailLabel(
        'FLAME SCANNER',
        name,
        mobileRender
          ? new THREE.Vector3(-4.18, 0.82, 0.94)
          : new THREE.Vector3(-4.82, 0.92, 1.02),
      );
      addAirDetailLabel(
        'DRIVE MOTOR',
        name,
        mobileRender
          ? new THREE.Vector3(-5.82, 0.44, 0.82)
          : new THREE.Vector3(-6.62, 0.62, 0.92),
      );
      addAirDetailLabel(
        'COMBUSTION AIR BLOWER',
        name,
        mobileRender
          ? new THREE.Vector3(-5.18, 0.22, -0.88)
          : new THREE.Vector3(-5.72, 0.62, -0.92),
      );
      addAirDetailLabel(
        'BLOWER DISCHARGE',
        name,
        mobileRender
          ? new THREE.Vector3(-4.72, -0.16, -0.96)
          : new THREE.Vector3(-5.08, -0.08, -1.10),
      );
      addAirDetailLabel('AIR REGISTER', name, new THREE.Vector3(-4.22, 0.28, -1.02));
      addDetailLabel('PILOT BURNER', name, new THREE.Vector3(-3.46, -0.02, 1.08));
      addDetailLabel('IGNITION ELECTRODE', name, new THREE.Vector3(-4.28, -0.62, -1.04));
      addDetailLabel('MAIN FUEL NOZZLE', name, new THREE.Vector3(-3.46, -1.50, -0.58));
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

      // Rear chamber performs two jobs in the schematic three-pass model:
      // it turns furnace gas into Pass 2 and later collects Pass 3 for exit.
      const rearTurnaroundPlate = box(0.30, 0.10, 3.00, material('#8b969b', 0.82, 0.32, 1, undefined, stainlessTex));
      rearTurnaroundPlate.position.set(3.78, 0.62, -0.10);
      tagMaterial(rearTurnaroundPlate, 1, 'utility');
      mark(rearTurnaroundPlate, name);
      g.add(rearTurnaroundPlate);

      const rearOutletGuide = box(0.32, 1.18, 0.10, material('#6c7d84', 0.78, 0.36, 1, undefined, darkSteelTex));
      rearOutletGuide.position.set(3.80, 1.22, 1.26);
      tagMaterial(rearOutletGuide, 1, 'utility');
      mark(rearOutletGuide, name);
      g.add(rearOutletGuide);

      addLabel(name, new THREE.Vector3(4.15, 2.45, 0));
      addDetailLabel('1→2 TURNAROUND / 3→OUTLET', name, new THREE.Vector3(4.10, 1.10, -1.65));
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

    // Flow particles: explicit three-pass flue-gas path plus boiler water and
    // a dedicated burner learning overlay.
    const hotMat = material('#ff8c38', 0.0, 0.2, 0.90, '#ff4e13');
    const pass2GasMat = material('#ffb15c', 0.0, 0.22, 0.86, '#d95b1a');
    const pass3GasMat = material('#ffd184', 0.0, 0.25, 0.82, '#b86f2a');
    const outletGasMat = material('#ffe5b3', 0.0, 0.28, 0.76, '#9f7445');
    const blueMat = material('#53c8f5', 0.0, 0.2, 0.72, '#1aa6e1');
    const burnerAirMat = new THREE.MeshBasicMaterial({
      color: '#66dcff',
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
    });
    const burnerFuelMat = new THREE.MeshBasicMaterial({
      color: '#ffb35c',
      transparent: true,
      opacity: 0.94,
      depthTest: false,
      depthWrite: false,
    });
    const hotGeometry = new THREE.SphereGeometry(0.055, mobileRender ? 6 : 8, mobileRender ? 6 : 8);
    const waterGeometry = new THREE.SphereGeometry(0.05, mobileRender ? 6 : 8, mobileRender ? 6 : 8);
    const burnerFlowGeometry = new THREE.SphereGeometry(mobileRender ? 0.060 : 0.078, mobileRender ? 5 : 8, mobileRender ? 5 : 8);
    const gasPassCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.42, -0.82, 0.00),
      new THREE.Vector3(-1.20, -0.82, 0.00),
      new THREE.Vector3(1.55, -0.82, 0.00),
      new THREE.Vector3(3.34, -0.82, 0.00),
      new THREE.Vector3(3.70, -0.35, 0.15),
      new THREE.Vector3(3.35, 0.10, 0.55),
      new THREE.Vector3(1.10, 0.05, 0.55),
      new THREE.Vector3(-1.40, 0.05, 0.55),
      new THREE.Vector3(-3.36, 0.05, 0.55),
      new THREE.Vector3(-3.72, 0.62, 0.25),
      new THREE.Vector3(-3.34, 1.22, -0.48),
      new THREE.Vector3(-1.10, 1.22, -0.48),
      new THREE.Vector3(1.45, 1.22, -0.48),
      new THREE.Vector3(3.40, 1.22, -0.48),
      new THREE.Vector3(4.12, 1.46, -0.18),
      new THREE.Vector3(4.55, 2.05, 0.00),
      new THREE.Vector3(4.78, 2.72, 0.00),
      new THREE.Vector3(4.78, 3.55, 0.00),
      new THREE.Vector3(4.78, 4.75, 0.00),
      new THREE.Vector3(4.78, 6.00, 0.00),
    ], false, 'centripetal', 0.35);

    const hotCount = mobileRender ? 18 : 30;
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
    const burnerAirCurve = new THREE.CatmullRomCurve3([
      // Ambient approach to the axial inlet eye.
      new THREE.Vector3(-5.02, 0.28, 1.22),
      new THREE.Vector3(-5.30, 0.10, 0.90),
      new THREE.Vector3(-5.50, -0.08, 0.64),
      new THREE.Vector3(-5.54, -0.15, 0.54),
      // Impeller / volute sweep toward the tangential discharge.
      new THREE.Vector3(-5.66, -0.10, 0.42),
      new THREE.Vector3(-5.73, 0.02, 0.25),
      new THREE.Vector3(-5.58, 0.10, 0.12),
      new THREE.Vector3(-5.32, 0.06, 0.09),
      // Transition duct -> windbox -> register -> burner throat.
      new THREE.Vector3(-5.10, -0.12, 0.09),
      new THREE.Vector3(-5.03, -0.42, 0.08),
      new THREE.Vector3(-4.96, -0.70, 0.05),
      new THREE.Vector3(-4.65, -0.82, 0.03),
      new THREE.Vector3(-4.28, -0.82, 0.01),
      new THREE.Vector3(-3.92, -0.82, 0.00),
    ], false, 'centripetal', 0.28);

    const burnerAirCount = mobileRender ? 11 : 18;
    for (let i = 0; i < burnerAirCount; i += 1) {
      const p = new THREE.Mesh(burnerFlowGeometry, burnerAirMat);
      p.userData.phase = i / burnerAirCount;
      p.userData.flowType = 'burnerAir';
      p.visible = false;
      p.renderOrder = 80;
      flowGroup.add(p);
    }
    const burnerFuelCount = mobileRender ? 5 : 9;
    for (let i = 0; i < burnerFuelCount; i += 1) {
      const p = new THREE.Mesh(burnerFlowGeometry, burnerFuelMat);
      p.userData.phase = i / burnerFuelCount;
      p.userData.flowType = 'burnerFuel';
      p.userData.fuelPath = i % 3 === 0 ? 'pilot' : 'main';
      p.visible = false;
      p.renderOrder = 80;
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

      // Label LOD / decluttering:
      // near = show the normal full anatomy;
      // medium = keep selected + important systems;
      // far = keep selected + only the five major boiler landmarks.
      // This avoids the old failure mode where every label grew into the same
      // small screen area and became unreadable.
      const selectedNow = selectedRef.current;
      const contextNow = contextModeRef.current;
      const labelsOn = labelsRef.current;
      const farZoom = orbit.radius >= 22;
      const mediumZoom = !farZoom && orbit.radius >= 17;

      labelGroup.children.forEach(label => {
        if (!(label instanceof THREE.Sprite)) return;

        const componentName = label.userData.component as string | undefined;
        const detailLabel = Boolean(label.userData.detailLabel);
        const priority = (label.userData.labelPriority as number | undefined) ?? 1;
        const burnerTopicOnly = selectedNow === 'Burner & Ignition' && contextNow !== 'full';

        let visible = false;
        if (labelsOn) {
          if (burnerTopicOnly) {
            visible = componentName === 'Burner & Ignition';
          } else if (detailLabel) {
            visible = componentName === selectedNow && contextNow !== 'full';
          } else {
            visible = contextNow === 'full' || componentName === selectedNow || contextNow === 'focus';
          }
        }

        if (visible && contextNow === 'full' && componentName !== selectedNow) {
          if (farZoom) visible = priority >= 4;
          else if (mediumZoom) visible = priority >= 3;
        }

        label.visible = visible;

        const base = label.userData.baseLabelScale as THREE.Vector3 | undefined;
        if (base) {
          const scaleBoost = farZoom ? 1.14 : mediumZoom ? 1.07 : 1;
          label.scale.set(base.x * scaleBoost, base.y * scaleBoost, base.z);
        }

        label.material.opacity = !visible
          ? 0
          : componentName === selectedNow
            ? 1
            : farZoom
              ? 0.95
              : mediumZoom
                ? 0.90
                : contextNow === 'full'
                  ? 0.82
                  : 0.34;
      });

      flameLayers.forEach((mesh, index) => {
        const mat = mesh.material as THREE.ShaderMaterial;
        if (mat.uniforms.uTime) mat.uniforms.uTime.value = t;
        const phase = (mesh.userData.phase as number) ?? index;
        const widthPulse = 1 + Math.sin(t * (5.7 + index * 0.65) + phase) * (mobileRender ? 0.018 : 0.030);
        const lengthPulse = 1 + Math.sin(t * (4.2 + index * 0.52) + phase * 1.3) * (mobileRender ? 0.014 : 0.024);
        mesh.scale.set(widthPulse, lengthPulse, 1 / Math.max(0.96, widthPulse * 0.98));
      });
      pilotFlameLayers.forEach((mesh, index) => {
        const mat = mesh.material as THREE.ShaderMaterial;
        if (mat.uniforms.uTime) mat.uniforms.uTime.value = t * 1.12;
        const phase = (mesh.userData.phase as number) ?? index;
        const widthPulse = 1 + Math.sin(t * (8.4 + index) + phase) * (mobileRender ? 0.020 : 0.034);
        const lengthPulse = 1 + Math.sin(t * (7.1 + index * 0.7) + phase * 1.4) * (mobileRender ? 0.018 : 0.030);
        mesh.scale.set(widthPulse, lengthPulse, 1);
      });
      flameLights.forEach((light, index) => {
        const base = (light.userData.baseIntensity as number) ?? light.intensity;
        light.intensity = base * (1 + Math.sin(t * (7.0 + index * 1.4) + index) * 0.07);
      });

      if (flowGroup.visible && (!mobileRender || now - lastFrame > 24)) {
        flowGroup.children.forEach((child) => {
          if (!child.visible) return;
          const phase = (child.userData.phase as number) ?? 0;
          const flowType = child.userData.flowType as string | undefined;
          if (flowType === 'gas') {
            const u = (phase + t * 0.055) % 1;
            const point = gasPassCurve.getPointAt(u);
            child.position.copy(point);
            child.position.y += Math.sin((u * 10 + phase) * Math.PI * 2) * 0.035;
            child.position.z += Math.cos((u * 8 + phase) * Math.PI * 2) * 0.045;

            const gasMesh = child as THREE.Mesh;
            if (u < 0.23) gasMesh.material = hotMat;
            else if (u < 0.50) gasMesh.material = pass2GasMat;
            else if (u < 0.77) gasMesh.material = pass3GasMat;
            else gasMesh.material = outletGasMat;
          } else if (flowType === 'water') {
            const u = (phase + t * 0.07) % 1;
            child.position.set(-2.8 + Math.sin((phase + t * 0.03) * 5) * 2.3, -1.7 + u * 3.3, 1.55 + Math.cos(phase * 10) * 0.28);
          } else if (flowType === 'burnerAir') {
            const u = (phase + t * 0.135) % 1;
            const point = burnerAirCurve.getPointAt(u);
            child.position.copy(point);

            // Give the air stream a subtle coherent corkscrew as it passes the
            // impeller/volute and then straighten it through the register.
            const swirl = u > 0.18 && u < 0.58 ? 1 : u >= 0.58 ? 0.28 : 0.45;
            child.position.y += Math.sin((u * 12 + phase) * Math.PI * 2) * 0.030 * swirl;
            child.position.z += Math.cos((u * 12 + phase) * Math.PI * 2) * 0.038 * swirl;

            const airMesh = child as THREE.Mesh;
            const pulse = 0.88 + 0.24 * Math.sin((u * 8 + phase) * Math.PI * 2);
            airMesh.scale.setScalar(pulse);
          } else if (flowType === 'burnerFuel') {
            const u = (phase + t * 0.15) % 1;
            const pilot = child.userData.fuelPath === 'pilot';
            child.position.set(
              THREE.MathUtils.lerp(pilot ? -6.12 : -6.28, pilot ? -3.62 : -3.48, u),
              THREE.MathUtils.lerp(pilot ? -0.50 : -1.06, pilot ? -0.61 : -0.82, u) + Math.sin((u + phase) * Math.PI) * 0.035,
              THREE.MathUtils.lerp(pilot ? 0.72 : 0.58, pilot ? 0.21 : 0.0, u),
            );
          }
        });
        lastFrame = now;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    renderer.compile(scene, camera);
    stateRef.current = { scene, camera, renderer, orbit, updateCamera, transitionCamera, root, components, labelGroup, flowGroup, highlight, selectionGlow, burnerKey, burnerFill, burnerRim, mobileRender };
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

    const burnerFlowMode = flow && selected === 'Burner & Ignition';
    const combustionFlowComponents = new Set([
      'Furnace Tube',
      'Fire Tubes',
      'Front Smokebox',
      'Rear Smokebox',
      'Economizer',
      'Stack / Flue Outlet',
    ]);
    const waterFlowComponents = new Set([
      'Water Space',
      'Steam Space',
      'Feedwater Inlet',
      'Steam Outlet',
      'Level Gauge',
      'Level Sensors',
    ]);
    const combustionFlowMode = flow && combustionFlowComponents.has(selected);
    const waterFlowMode = flow && waterFlowComponents.has(selected);

    state.flowGroup.children.forEach(child => {
      const flowType = child.userData.flowType as string | undefined;
      child.visible = burnerFlowMode
        ? flowType === 'burnerAir' || flowType === 'burnerFuel'
        : combustionFlowMode
          ? flowType === 'gas'
          : waterFlowMode
            ? flowType === 'water'
            : flowType === 'gas' || flowType === 'water';
    });

    state.components.forEach((group, name) => {
      const base = (group.userData.basePosition as THREE.Vector3 | undefined) ?? new THREE.Vector3();
      const offset = explode ? (explodeOffsets[name] ?? new THREE.Vector3()) : new THREE.Vector3();
      const targetPosition = base.clone().add(offset);
      group.userData.targetPosition = targetPosition;

      let contextFactor = contextMode === 'full' || name === selected
        ? 1
        : contextMode === 'focus'
          ? 0.22
          : 0.035;

      // Burner hero view: keep only the throat/furnace as readable supporting context.
      if (selected === 'Burner & Ignition' && contextMode === 'focus') {
        if (name === 'Front Smokebox') contextFactor = 0.18;
        else if (name === 'Furnace Tube') contextFactor = 0.20;
        else if (name !== 'Burner & Ignition') contextFactor = 0.055;
      }
      if (selected === 'Burner & Ignition' && contextMode === 'isolate') {
        if (name === 'Front Smokebox') contextFactor = 0.075;
        else if (name === 'Furnace Tube') contextFactor = 0.11;
        else if (name !== 'Burner & Ignition') contextFactor = 0.015;
      }
      if (contextMode === 'focus' && selected === 'Front Smokebox') {
        if (name === 'Burner & Ignition') contextFactor = 0.48;
        if (name === 'Tube Sheets' || name === 'Furnace Tube') contextFactor = 0.38;
      }

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
          if (mat instanceof THREE.ShaderMaterial && mat.uniforms.uContextOpacity) {
            mat.uniforms.uContextOpacity.value = THREE.MathUtils.clamp(opacity / Math.max(baseOpacity, 0.001), 0.02, 1);
            mat.transparent = true;
            mat.depthWrite = false;
            mat.clippingPlanes = null;
            mat.needsUpdate = true;
            return;
          }
          mat.opacity = opacity;
          mat.transparent = opacity < 0.98;
          mat.depthWrite = opacity > 0.55;
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
      const detailLabel = Boolean(label.userData.detailLabel);
      const burnerTopicOnly = selected === 'Burner & Ignition' && contextMode !== 'full';
      if (burnerTopicOnly) {
        label.visible = labels && componentName === 'Burner & Ignition';
      } else {
        label.visible = detailLabel
          ? labels && componentName === selected && contextMode !== 'full'
          : labels && (contextMode === 'full' || componentName === selected || contextMode === 'focus');
      }
      if (label instanceof THREE.Sprite) {
        label.material.opacity = !label.visible
          ? 0
          : detailLabel
            ? 0.96
            : componentName === selected
              ? 1
              : contextMode === 'full'
                ? 0.82
                : 0.34;
      }
    });

    const burnerStudy = selected === 'Burner & Ignition' || selected === 'Front Smokebox';
    state.burnerKey.visible = burnerStudy;
    state.burnerFill.visible = burnerStudy;
    state.burnerRim.visible = burnerStudy;

    // Presentation lighting: cool definition on the blower/motor and a warm
    // lift toward the flame, with a stronger cyan cue when combustion-air flow is shown.
    if (burnerStudy) {
      state.burnerKey.intensity = state.mobileRender ? 2.55 : 3.25;
      state.burnerFill.intensity = state.mobileRender ? 1.15 : 1.65;
      state.burnerRim.intensity = burnerFlowMode
        ? (state.mobileRender ? 1.25 : 1.75)
        : (state.mobileRender ? 0.90 : 1.30);
    }

    const selectedGroup = state.components.get(selected);
    if (selectedGroup) {
      const bounds = new THREE.Box3().setFromObject(selectedGroup);
      state.highlight.box.copy(bounds);
      // Keep the helper available for debugging, but do not show bounding boxes in learning views.
      state.highlight.visible = false;
      state.selectionGlow.position.copy(bounds.getCenter(new THREE.Vector3()));
      if (selected === 'Burner & Ignition') {
        state.selectionGlow.color.set('#67dcff');
        state.selectionGlow.intensity = state.mobileRender ? 0.50 : 0.78;
      } else {
        state.selectionGlow.color.set('#ff8a32');
        state.selectionGlow.intensity = state.mobileRender ? 0.45 : 0.80;
      }
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
      if (componentName === 'Burner & Ignition') {
        const canvasAspect = state.renderer.domElement.clientWidth / Math.max(1, state.renderer.domElement.clientHeight);
        const mobileLandscape = state.mobileRender && canvasAspect > 1.45;
        const burnerPreset: CameraPreset = state.mobileRender
          ? mobileLandscape
            ? { yaw: -0.50, pitch: 0.085, radius: 7.55, target: [-3.42, -0.62, 0.02] }
            : { yaw: -0.44, pitch: 0.105, radius: 11.35, target: [-3.38, -0.62, 0.02] }
          : { yaw: -0.52, pitch: 0.095, radius: 8.95, target: [-3.48, -0.62, 0.02] };
        state.transitionCamera(burnerPreset, 820);
      } else {
        const object = state.components.get(componentName);
        const preset = object ? presetFor(object, state.mobileRender ? 2.55 : 2.25) : null;
        if (preset) {
          const hint = cameraHints[componentName];
          state.transitionCamera({ ...preset, ...hint }, 650);
        }
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
