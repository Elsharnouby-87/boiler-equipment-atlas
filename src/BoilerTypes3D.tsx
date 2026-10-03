import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { hollowCylinderX, makeStudioEnvironment, roundedBox, pipeRoute, flangeAlong, geometryBounds, fitDistance, disposeSceneResources } from './boiler3d/industrialGeometry';
import { makeFlameEnvelopeGeometry, makeFlameMaterial } from './boiler3d/sceneHelpers';
import { batchStaticConstruction } from './boiler3d/realismUpgrade';

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
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    const mobileRender = window.matchMedia('(max-width: 700px)').matches || host.clientWidth <= 700;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07141f');
    scene.fog = new THREE.FogExp2('#07141f', 0.022);
    addSky(scene);

    const camera = new THREE.PerspectiveCamera(mobileRender ? 43 : 39, 1, 0.1, 100);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !mobileRender, alpha: false, powerPreference: 'high-performance' });
    } catch {
      disposeSceneResources(scene);
      setUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileRender ? 1.15 : 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.10;
    renderer.localClippingEnabled = true;
    const studio = makeStudioEnvironment(renderer);
    scene.environment = studio.texture;scene.environmentIntensity = 0.65;
    renderer.shadowMap.enabled = !mobileRender;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.userSelect = 'none';
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight('#b8e7fa', '#06111b', mobileRender ? 1.4 : 1.25));
    const light = new THREE.DirectionalLight('#ffffff', mobileRender ? 1.7 : 2.1);
    light.position.set(-7, 10, 8);
    light.castShadow = !mobileRender;
    light.shadow.mapSize.set(1024,1024);
    Object.assign(light.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:1,far:35});
    light.shadow.normalBias=0.025; light.shadow.bias=-0.0002;
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

    const grid = new THREE.GridHelper(22, 22, '#44535c', '#354650');
    grid.position.y = -3.1;
    (grid.material as THREE.Material).opacity = 0.08;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const root = new THREE.Group();root.name='Boiler Type';
    const flames: THREE.ShaderMaterial[] = [];
    scene.add(root);

    if (variant === 'fireTube') {
      const shellMaterial=mat('#a1acae',1,0.08,0.58);
      shellMaterial.side=THREE.DoubleSide; shellMaterial.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,0,-1),0)];
      const shell = new THREE.Mesh(hollowCylinderX(2.05,1.97,7.5,64),shellMaterial);
      shell.castShadow = !mobileRender;
      root.add(shell);

      [-2.8, 0, 2.8].forEach(x => {
        const ringMat=mat('#8c989e',1,0.82,0.28);ringMat.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,0,-1),0)];
        const ring = new THREE.Mesh(hollowCylinderX(2.08,2.045,0.05,48),ringMat);
        ring.position.x = x;
        root.add(ring);
      });

      const furnaceMat=mat('#5e5148',1,0.44,0.72);furnaceMat.side=THREE.DoubleSide;furnaceMat.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,0,-1),0)];
      const furnace = new THREE.Mesh(hollowCylinderX(0.70,0.62,6.1,40),furnaceMat);
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
        const tube = new THREE.Mesh(hollowCylinderX(0.085,0.067,6.40,mobileRender?10:16),tubeMaterial);
        tube.position.set(0, y + 0.2, z);
        root.add(tube);
      });

      [-3.25, 3.25].forEach(x => {
        const headMat=mat('#44555e',1,0.12,0.56);headMat.side=THREE.DoubleSide;headMat.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,0,-1),0)];
        const head = new THREE.Mesh(hollowCylinderX(1.96,1.85,0.42,48),headMat);
        head.position.x = x;
        root.add(head);
      });

      const burner = cylX(0.46, 0.95, mat('#6b7d85', 1, 0.82, 0.32), 28);
      burner.position.set(-4.0, -0.72, 0);
      root.add(burner);

      const flameMaterial=makeFlameMaterial('#ffc677','#e65b27',0.66,4.3);flames.push(flameMaterial);
      const flame = new THREE.Mesh(makeFlameEnvelopeGeometry(3.30,[[0,.07],[.15,.26],[.40,.44],[.67,.31],[1,.015]],24),flameMaterial);
      flame.rotation.z=-Math.PI/2;flame.position.set(-3.05,-.72,0);root.add(flame);
      // Jacket edge and corrugations provide the same fabrication language as the master model.
      for(let i=0;i<9;i++) {
        const corrugation=new THREE.Mesh(new THREE.TorusGeometry(.70,.025,6,32),tubeMaterial);
        corrugation.rotation.y=Math.PI/2;corrugation.position.set(-2.8+i*.7,-.72,0);root.add(corrugation);
      }
      const burnerTrim=mat('#9da9ab',1,.86,.35);
      flangeAlong(root,new THREE.Vector3(-3.76,-.72,0),new THREE.Vector3(1,0,0),.58,.34,burnerTrim,'Boiler Type',10);
      const motor=cylX(.25,.64,mat('#293b44',1,.18,.57),24);motor.position.set(-4.65,-.72,.35);root.add(motor);

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

      const tubeMaterial = mat('#829b9f', 1, 0.78, 0.43);
      for (let i = -6; i <= 6; i += 1) {
        const x = i * 0.38;
        [-1, 1].forEach(side => {
          const zBottom = side * 1.75;
          const zTop = side * 0.32;
          const tube = pipeRoute([[x,-1.72,zBottom],[x,-1.10,zBottom],[x,1.38,zTop],[x,1.92,zTop]],0.065,tubeMaterial,mobileRender);
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

      const flameMaterial=makeFlameMaterial('#ffda87','#e45b27',.66,6.2);flames.push(flameMaterial);
      const flame = new THREE.Mesh(makeFlameEnvelopeGeometry(3.80,[[0,.08],[.12,.31],[.36,.54],[.65,.42],[1,.015]],24),flameMaterial);
      flame.rotation.z=-Math.PI/2;flame.position.set(-2.60,-.90,0);root.add(flame);
      const burner=cylX(.40,.82,mat('#a95828',1,.08,.59),28);burner.position.set(-2.95,-.90,0);root.add(burner);
      const burnerTrim=mat('#a5b0b3',1,.85,.34);
      flangeAlong(root,new THREE.Vector3(-2.52,-.90,0),new THREE.Vector3(1,0,0),.56,.34,burnerTrim,'Boiler Type',10);
      // Retained A-type drum arrangement with sectioned casing and lower collectors.
      const casingMat=mat('#576b77',1,.08,.66);
      const back=roundedBox(5.85,4.20,.09,casingMat);back.position.set(0,.1,-2.12);root.add(back);
      const roof=roundedBox(5.85,.10,4.20,casingMat);roof.position.set(0,2.22,0);root.add(roof);
      const trimMat=mat('#8d9c9f',1,.84,.38);
      for(const x of [-2.45,2.45]) {
        const beam=roundedBox(.20,.18,4.10,trimMat);beam.position.set(x,-2.76,0);root.add(beam);
        for(const z of [-1.75,1.75]) {const post=roundedBox(.16,.35,.22,trimMat);post.position.set(x,-2.56,z);root.add(post);}
      }
      const flue=roundedBox(.70,1.10,.76,casingMat);flue.position.set(2.48,2.36,-1.8);root.add(flue);

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

    if (variant === 'waterTube') {
      const trim=mat('#a2aeb0',1,.85,.34);
      for(const [y,z,r,len] of [[2.35,0,.76,5.7],[-2,-1.75,.55,5.2],[-2,1.75,.55,5.2]]) {
        for(const x of [-len/2,len/2]) {
          const cap=new THREE.Mesh(new THREE.SphereGeometry(r,24,14),trim);cap.scale.set(.24,1,1);cap.position.set(x,y,z);root.add(cap);
          flangeAlong(root,new THREE.Vector3(x+(x<0?-.13:.13),y,z),new THREE.Vector3(1,0,0),r*.50,r*.23,trim,'Boiler Type',8);
        }
        for(const x of [-len*.34,len*.34]) {const ring=new THREE.Mesh(new THREE.TorusGeometry(r+.009,.016,6,32),trim);ring.rotation.y=Math.PI/2;ring.position.set(x,y,z);root.add(ring);}
      }
      const steam=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.74,20),trim);steam.position.set(.70,3.25,0);root.add(steam);
    }
    batchStaticConstruction(new Map([['Boiler Type',root]]));

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
      orbit.radius=fitDistance(geometryBounds(root),camera,orbit.yaw,orbit.pitch,1.18);updateCamera();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let raf = 0;
    const clock=new THREE.Clock();
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = () => {
      if(document.hidden){raf=requestAnimationFrame(animate);return;}
      flames.forEach(m=>m.uniforms.uTime.value=reducedMotion?0:clock.getElapsedTime());
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
      disposeSceneResources(scene);
      studio.dispose();renderer.dispose();renderer.forceContextLoss();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [variant]);

  return <div ref={ref} className="three-host" aria-label={variant === 'fireTube' ? 'Interactive 3D fire-tube boiler' : 'Interactive 3D water-tube boiler'}>{unavailable && <div className="webgl-unavailable" role="status"><strong>3D view unavailable</strong><p>Enable WebGL or use a browser with hardware acceleration. The type comparison remains available.</p></div>}</div>;
}
