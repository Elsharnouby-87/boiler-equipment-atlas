import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type BoilerTypeVariant = 'fireTube' | 'waterTube';

type Props = {
  variant: BoilerTypeVariant;
};

type OrbitState = {
  yaw: number;
  pitch: number;
  radius: number;
  target: THREE.Vector3;
};

function mat(color: THREE.ColorRepresentation, opacity = 1, metalness = 0.55, roughness = 0.4) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness,
    roughness,
    transparent: opacity < 1,
    opacity,
    clearcoat: metalness > 0.5 ? 0.08 : 0.02,
    clearcoatRoughness: 0.72,
  });
}

function cylX(radius: number, length: number, material: THREE.Material, segments = 40) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
  m.rotation.z = Math.PI / 2;
  return m;
}

function addSky(scene: THREE.Scene) {
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
}

export default function BoilerTypes3D({ variant }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    const mobileRender = window.matchMedia('(max-width: 700px)').matches || host.clientWidth <= 700;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07141f');
    scene.fog = new THREE.FogExp2('#07141f', 0.022);
    addSky(scene);

    const camera = new THREE.PerspectiveCamera(mobileRender ? 43 : 39, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({
      antialias: !mobileRender,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileRender ? 1.15 : 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.shadowMap.enabled = !mobileRender;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.userSelect = 'none';
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight('#b8e7fa', '#06111b', mobileRender ? 1.4 : 1.25));
    const light = new THREE.DirectionalLight('#ffffff', mobileRender ? 1.7 : 2.1);
    light.position.set(-7, 10, 8);
    light.castShadow = !mobileRender;
    scene.add(light);
    const rim = new THREE.DirectionalLight('#2fa8e4', 1.05);
    rim.position.set(8, 4, -8);
    scene.add(rim);
    const warm = new THREE.PointLight('#ff6f1a', mobileRender ? 2.1 : 2.8, 14);
    warm.position.set(-2, -1, 1);
    scene.add(warm);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(11.5, mobileRender ? 36 : 64),
      new THREE.MeshStandardMaterial({ color: '#0a1821', metalness: 0.15, roughness: 0.88 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3.12;
    ground.receiveShadow = !mobileRender;
    scene.add(ground);

    const grid = new THREE.GridHelper(22, 22, '#1c5a78', '#123348');
    grid.position.y = -3.1;
    (grid.material as THREE.Material).opacity = 0.20;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const root = new THREE.Group();
    scene.add(root);

    if (variant === 'fireTube') {
      const shell = cylX(2.05, 7.5, mat('#596b74', 0.24, 0.78, 0.34), mobileRender ? 40 : 56);
      shell.castShadow = !mobileRender;
      root.add(shell);

      [-2.8, 0, 2.8].forEach(x => {
        const ring = cylX(2.12, 0.08, mat('#8c989e', 0.88, 0.82, 0.28), 48);
        ring.position.x = x;
        root.add(ring);
      });

      const furnace = cylX(0.7, 6.1, mat('#923314', 0.82, 0.22, 0.45), 34);
      furnace.position.y = -0.72;
      root.add(furnace);

      const coords: [number, number][] = [];
      [-1.05, -0.55, 0, 0.55, 1.05].forEach(y => {
        [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25].forEach(z => {
          if (y < -0.45 && Math.abs(z) < 0.85) return;
          coords.push([y, z]);
        });
      });
      const tubeMaterial = mat('#aa845b', 1, 0.78, 0.32);
      coords.forEach(([y, z]) => {
        const tube = cylX(0.085, 6.0, tubeMaterial, mobileRender ? 10 : 16);
        tube.position.set(0, y + 0.2, z);
        root.add(tube);
      });

      [-3.25, 3.25].forEach(x => {
        const head = cylX(1.96, 0.42, mat('#44555e', 0.86, 0.82, 0.35), 44);
        head.position.x = x;
        root.add(head);
      });

      const burner = cylX(0.46, 0.95, mat('#6b7d85', 1, 0.82, 0.32), 28);
      burner.position.set(-4.0, -0.72, 0);
      root.add(burner);

      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 2.5, mobileRender ? 16 : 24),
        new THREE.MeshPhysicalMaterial({
          color: '#ff7a18',
          transparent: true,
          opacity: 0.82,
          emissive: '#ff4311',
          emissiveIntensity: 1.4,
          roughness: 0.28,
          metalness: 0,
        }),
      );
      flame.rotation.z = -Math.PI / 2;
      flame.position.set(-2.1, -0.72, 0);
      root.add(flame);

      const steamValve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.8, 20),
        mat('#9eadb4', 1, 0.82, 0.28),
      );
      steamValve.position.set(1.2, 2.35, 0);
      root.add(steamValve);

      [-2.45, 2.45].forEach(x => {
        const saddle = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, 0.38, 2.65),
          mat('#38474f', 1, 0.76, 0.44),
        );
        saddle.position.set(x, -2.38, 0);
        saddle.castShadow = !mobileRender;
        root.add(saddle);
      });
    } else {
      const steamDrum = cylX(0.76, 5.7, mat('#687b84', 0.97, 0.82, 0.32), 44);
      steamDrum.position.set(0, 2.35, 0);
      steamDrum.castShadow = !mobileRender;
      root.add(steamDrum);

      const leftDrum = cylX(0.55, 5.2, mat('#53666f', 0.97, 0.82, 0.34), 40);
      leftDrum.position.set(0, -2.0, -1.75);
      root.add(leftDrum);

      const rightDrum = cylX(0.55, 5.2, mat('#53666f', 0.97, 0.82, 0.34), 40);
      rightDrum.position.set(0, -2.0, 1.75);
      root.add(rightDrum);

      const tubeMaterial = mat('#78b3c9', 1, 0.68, 0.36);
      for (let i = -6; i <= 6; i += 1) {
        const x = i * 0.38;
        [-1, 1].forEach(side => {
          const zBottom = side * 1.75;
          const zTop = side * 0.32;
          const start = new THREE.Vector3(x, -1.72, zBottom);
          const end = new THREE.Vector3(x, 1.92, zTop);
          const mid = start.clone().add(end).multiplyScalar(0.5);
          const len = start.distanceTo(end);
          const tube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.055, 0.055, len, mobileRender ? 8 : 12),
            tubeMaterial,
          );
          tube.position.copy(mid);
          tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
          root.add(tube);
        });
      }

      const furnace = new THREE.Mesh(
        new THREE.BoxGeometry(4.7, 3.55, 2.2),
        new THREE.MeshPhysicalMaterial({
          color: '#ff5b18',
          transparent: true,
          opacity: 0.07,
          emissive: '#6b1603',
          emissiveIntensity: 0.7,
          roughness: 0.45,
        }),
      );
      furnace.position.y = -0.25;
      root.add(furnace);

      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 2.5, mobileRender ? 16 : 24),
        new THREE.MeshPhysicalMaterial({
          color: '#ff7a18',
          transparent: true,
          opacity: 0.8,
          emissive: '#ff4311',
          emissiveIntensity: 1.4,
          roughness: 0.28,
        }),
      );
      flame.position.set(0, -1.1, 0);
      root.add(flame);

      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 2.0, 28),
        mat('#465963', 1, 0.82, 0.35),
      );
      stack.position.set(2.5, 3.25, -1.8);
      root.add(stack);

      const upperHeader = new THREE.Mesh(
        new THREE.BoxGeometry(5.4, 0.28, 0.28),
        mat('#718792', 1, 0.76, 0.35),
      );
      upperHeader.position.set(0, 1.48, 0);
      root.add(upperHeader);
    }

    const orbit: OrbitState = {
      yaw: variant === 'fireTube' ? -0.78 : -0.68,
      pitch: variant === 'fireTube' ? 0.22 : 0.28,
      radius: mobileRender ? 17.5 : 15.5,
      target: new THREE.Vector3(0, 0.1, 0),
    };

    const updateCamera = () => {
      camera.position.set(
        orbit.target.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.radius,
        orbit.target.y + Math.sin(orbit.pitch) * orbit.radius,
        orbit.target.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.radius,
      );
      camera.lookAt(orbit.target);
    };
    updateCamera();

    const activePointers = new Map<number, { x: number; y: number }>();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let panMode = false;
    let pinchDistance = 0;
    let pinchCenter = { x: 0, y: 0 };

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
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
        if (pinchDistance > 0) orbit.radius = THREE.MathUtils.clamp(orbit.radius * (pinchDistance / Math.max(distance, 1)), 4, 32);
        const scale = Math.max(0.006, orbit.radius * 0.0008);
        orbit.target.x -= (center.x - pinchCenter.x) * scale;
        orbit.target.y += (center.y - pinchCenter.y) * scale;
        pinchDistance = distance;
        pinchCenter = center;
        updateCamera();
        return;
      }

      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (panMode) {
        const scale = Math.max(0.008, orbit.radius * 0.001);
        orbit.target.x -= dx * scale;
        orbit.target.y += dy * scale;
      } else {
        orbit.yaw -= dx * (mobileRender ? 0.0062 : 0.0052);
        orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * (mobileRender ? 0.0046 : 0.0038), -0.48, 0.78);
      }
      lastX = event.clientX;
      lastY = event.clientY;
      updateCamera();
    };

    const onPointerUp = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      dragging = activePointers.size > 0;
      pinchDistance = 0;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      orbit.radius = THREE.MathUtils.clamp(orbit.radius + event.deltaY * 0.018, 4, 32);
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
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let raf = 0;
    const animate = () => {
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach(m => m.dispose());
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [variant]);

  return <div ref={ref} className="three-host" aria-label={variant === 'fireTube' ? 'Interactive 3D fire-tube boiler' : 'Interactive 3D water-tube boiler'} />;
}
