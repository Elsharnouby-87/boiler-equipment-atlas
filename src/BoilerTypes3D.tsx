import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type BoilerTypeVariant = 'fireTube' | 'waterTube';

type Props = {
  variant: BoilerTypeVariant;
};

function mat(color: THREE.ColorRepresentation, opacity = 1, metalness = 0.55) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness: 0.4,
    transparent: opacity < 1,
    opacity,
  });
}

function cylX(radius: number, length: number, material: THREE.Material, segments = 40) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
  m.rotation.z = Math.PI / 2;
  return m;
}

export default function BoilerTypes3D({ variant }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#06111b');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;

    scene.add(new THREE.HemisphereLight('#b8e7fa', '#06111b', 1.25));
    const light = new THREE.DirectionalLight('#ffffff', 2.1);
    light.position.set(-7, 10, 8);
    scene.add(light);
    const warm = new THREE.PointLight('#ff6f1a', 2.8, 14);
    warm.position.set(-2, -1, 1);
    scene.add(warm);

    const grid = new THREE.GridHelper(22, 22, '#1c5a78', '#123348');
    grid.position.y = -3.1;
    (grid.material as THREE.Material).opacity = 0.24;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const root = new THREE.Group();
    scene.add(root);

    if (variant === 'fireTube') {
      const shell = cylX(2.05, 7.5, mat('#546873', 0.22, 0.78), 56);
      root.add(shell);

      const furnace = cylX(0.7, 6.1, mat('#923314', 0.8, 0.22), 34);
      furnace.position.y = -0.72;
      root.add(furnace);

      const coords: [number, number][] = [];
      [-1.05, -0.55, 0, 0.55, 1.05].forEach(y => {
        [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25].forEach(z => {
          if (y < -0.45 && Math.abs(z) < 0.85) return;
          coords.push([y, z]);
        });
      });
      coords.forEach(([y, z]) => {
        const tube = cylX(0.085, 6.0, mat('#b18a5e', 1, 0.78), 18);
        tube.position.set(0, y + 0.2, z);
        root.add(tube);
      });

      [-3.25, 3.25].forEach(x => {
        const head = cylX(1.96, 0.42, mat('#44555e', 0.82, 0.82), 44);
        head.position.x = x;
        root.add(head);
      });

      const burner = cylX(0.46, 0.95, mat('#6b7d85', 1, 0.82), 28);
      burner.position.set(-4.0, -0.72, 0);
      root.add(burner);

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.5, 24), mat('#ff7a18', 0.82, 0.05));
      flame.rotation.z = -Math.PI / 2;
      flame.position.set(-2.1, -0.72, 0);
      root.add(flame);

      const steamValve = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 20), mat('#9eadb4', 1, 0.82));
      steamValve.position.set(1.2, 2.35, 0);
      root.add(steamValve);

      camera.position.set(9.3, 5.0, 10.0);
      controls.target.set(0, 0, 0);
    } else {
      // Water-tube training geometry: steam drum, two lower water drums and tube banks around a central furnace.
      const steamDrum = cylX(0.76, 5.7, mat('#687b84', 0.96, 0.82), 44);
      steamDrum.position.set(0, 2.35, 0);
      root.add(steamDrum);

      const leftDrum = cylX(0.55, 5.2, mat('#53666f', 0.96, 0.82), 40);
      leftDrum.position.set(0, -2.0, -1.75);
      root.add(leftDrum);

      const rightDrum = cylX(0.55, 5.2, mat('#53666f', 0.96, 0.82), 40);
      rightDrum.position.set(0, -2.0, 1.75);
      root.add(rightDrum);

      const tubeMaterial = mat('#78b3c9', 1, 0.68);
      for (let i = -6; i <= 6; i += 1) {
        const x = i * 0.38;
        [-1, 1].forEach(side => {
          const zBottom = side * 1.75;
          const zTop = side * 0.32;
          const start = new THREE.Vector3(x, -1.72, zBottom);
          const end = new THREE.Vector3(x, 1.92, zTop);
          const mid = start.clone().add(end).multiplyScalar(0.5);
          const len = start.distanceTo(end);
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, len, 12), tubeMaterial.clone());
          tube.position.copy(mid);
          tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
          root.add(tube);
        });
      }

      const furnace = new THREE.Mesh(new THREE.BoxGeometry(4.7, 3.55, 2.2), mat('#ff5b18', 0.08, 0.05));
      furnace.position.y = -0.25;
      root.add(furnace);

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.5, 24), mat('#ff7a18', 0.8, 0.05));
      flame.position.set(0, -1.1, 0);
      root.add(flame);

      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.0, 28), mat('#465963', 1, 0.82));
      stack.position.set(2.5, 3.25, -1.8);
      root.add(stack);

      camera.position.set(8.4, 5.6, 10.5);
      controls.target.set(0, 0, 0);
    }

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
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
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
