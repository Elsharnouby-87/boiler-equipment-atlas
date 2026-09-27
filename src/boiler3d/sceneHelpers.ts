import * as THREE from 'three';

export type BoilerSurfaceKind = 'paintedSteel' | 'darkSteel' | 'stainless' | 'refractory' | 'concrete';

export function makeBoilerSurfaceTexture(kind: BoilerSurfaceKind, mobile = false) {
  const size = mobile ? 256 : 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const palette: Record<BoilerSurfaceKind, [string, string, string]> = {
    paintedSteel: ['#56666e', '#87959c', '#303b41'],
    darkSteel: ['#333f46', '#66747b', '#1b2429'],
    stainless: ['#8e9aa0', '#c4ced2', '#58646a'],
    refractory: ['#8b6e53', '#c5a47c', '#503d2d'],
    concrete: ['#596064', '#848a8d', '#353b3e'],
  };

  const [base, hi, lo] = palette[kind];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  if (kind === 'refractory') {
    const cellY = Math.max(26, Math.floor(size / 8));
    const cellX = Math.max(34, Math.floor(size / 6));
    ctx.lineWidth = Math.max(1, size / 220);
    for (let y = 0; y < size; y += cellY) {
      const offset = (Math.floor(y / cellY) % 2) * Math.floor(cellX / 2);
      for (let x = -offset; x < size; x += cellX) {
        ctx.strokeStyle = 'rgba(52,34,24,.32)';
        ctx.strokeRect(x, y, cellX - 2, cellY - 2);
        ctx.strokeStyle = 'rgba(232,211,182,.10)';
        ctx.strokeRect(x + 2, y + 2, cellX - 6, cellY - 6);
      }
    }
  }

  const speckles = mobile ? 900 : 3600;
  for (let i = 0; i < speckles; i += 1) {
    ctx.globalAlpha = Math.random() * 0.10 + 0.018;
    ctx.fillStyle = Math.random() > 0.56 ? hi : lo;
    const dot = Math.random() * (kind === 'refractory' ? 2.6 : 1.5) + 0.25;
    ctx.fillRect(Math.random() * size, Math.random() * size, dot, dot);
  }

  if (kind === 'paintedSteel' || kind === 'darkSteel' || kind === 'stainless') {
    ctx.globalAlpha = kind === 'stainless' ? 0.075 : 0.055;
    const scratches = mobile ? 18 : 42;
    for (let i = 0; i < scratches; i += 1) {
      const y = Math.random() * size;
      ctx.strokeStyle = i % 3 === 0 ? '#dce6e9' : '#12191d';
      ctx.lineWidth = Math.random() * 0.9 + 0.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + Math.random() * 6 - 3);
      ctx.stroke();
    }
  }

  if (kind === 'concrete') {
    ctx.globalAlpha = 0.08;
    const marks = mobile ? 20 : 50;
    for (let i = 0; i < marks; i += 1) {
      ctx.strokeStyle = Math.random() > 0.5 ? '#c4c8ca' : '#23292c';
      ctx.lineWidth = Math.random() * 1.1 + 0.25;
      ctx.beginPath();
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.random() * 32 - 16, y + Math.random() * 32 - 16);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'refractory' ? 2.1 : 4.0, kind === 'refractory' ? 2.8 : 4.0);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = mobile ? 2 : 6;
  return texture;
}


export function makeFlameEnvelopeGeometry(
  length: number,
  profile: Array<[number, number]>,
  radialSegments = 24,
) {
  const points = profile.map(([fraction, radius]) => new THREE.Vector2(radius, fraction * length));
  return new THREE.LatheGeometry(points, radialSegments, 0, Math.PI * 2);
}

export function makeFlameMaterial(
  low: THREE.ColorRepresentation,
  high: THREE.ColorRepresentation,
  opacity: number,
  seed: number,
) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLow: { value: new THREE.Color(low) },
      uHigh: { value: new THREE.Color(high) },
      uOpacity: { value: opacity },
      uContextOpacity: { value: 1 },
      uSeed: { value: seed },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uSeed;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float axial = clamp(uv.y, 0.0, 1.0);
        float tip = pow(axial, 1.45);
        float rootLock = smoothstep(0.0, 0.12, axial);
        float sway =
          sin(uTime * 4.4 + p.y * 2.0 + uSeed) * 0.055 +
          sin(uTime * 7.7 + p.y * 4.8 + uSeed * 1.7) * 0.024 +
          sin(uTime * 11.2 + p.y * 7.1 + uSeed * 2.3) * 0.010;
        p.x += sway * rootLock * (0.18 + tip * 1.15);
        p.z += cos(uTime * 4.0 + p.y * 2.6 + uSeed) * 0.040 * rootLock * (0.12 + tip);
        p.y += (
          sin(vUv.x * 12.566 + uTime * 5.2 + uSeed) * 0.085 +
          sin(vUv.x * 25.132 - uTime * 7.1 + uSeed * 1.9) * 0.035
        ) * smoothstep(0.58, 1.0, axial);
        p.x *= 0.97 + sin(uTime * 6.1 + p.y * 3.6 + uSeed) * 0.032 * axial;
        p.z *= 0.98 + cos(uTime * 6.8 + p.y * 3.2 + uSeed) * 0.028 * axial;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uLow;
      uniform vec3 uHigh;
      uniform float uOpacity;
      uniform float uContextOpacity;
      uniform float uSeed;
      varying vec2 vUv;
      void main() {
        float bandA = 0.5 + 0.5 * sin(vUv.y * 35.0 - uTime * 8.4 + sin(vUv.x * 21.0 + uSeed));
        float bandB = 0.5 + 0.5 * sin(vUv.y * 17.0 - uTime * 5.6 + cos(vUv.x * 29.0 + uSeed * 1.9));
        float turbulence = mix(bandA, bandB, 0.44);
        float rootFade = smoothstep(0.0, 0.055, vUv.y);
        float tipFade = 1.0 - smoothstep(0.72, 1.0, vUv.y);
        float edgeLife = rootFade * max(0.035, tipFade);
        float tipFlicker = 0.82 + 0.18 * sin(uTime * 11.5 + uSeed * 4.0 + vUv.y * 10.0);
        float alpha = (0.24 + turbulence * 0.56) * edgeLife * uOpacity * uContextOpacity;
        alpha *= mix(1.0, tipFlicker, smoothstep(0.48, 1.0, vUv.y));
        vec3 col = mix(uLow, uHigh, smoothstep(0.04, 0.9, vUv.y));
        col *= 0.84 + turbulence * 0.34;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
}

export function makeBlowerVoluteGeometry(
  depth = 0.30,
  mobile = false,
) {
  // Schematic industrial centrifugal-fan scroll casing with a deliberately
  // asymmetric "snail" silhouette and a tangential discharge tongue.
  // The profile lives in local XY and is extruded along +Z; Boiler3D rotates
  // the finished solid so the extrusion axis becomes the fan shaft axis.
  const shape = new THREE.Shape();
  shape.moveTo(-0.43, -0.34);
  shape.bezierCurveTo(-0.57, -0.16, -0.58, 0.12, -0.46, 0.33);
  shape.bezierCurveTo(-0.32, 0.50, -0.08, 0.58, 0.17, 0.53);
  shape.bezierCurveTo(0.31, 0.50, 0.40, 0.44, 0.47, 0.36);

  // Integrated tangential outlet tongue — this is what makes the casing
  // immediately read as a centrifugal blower rather than a thick circular plate.
  shape.lineTo(0.72, 0.36);
  shape.lineTo(0.72, 0.10);
  shape.lineTo(0.49, 0.10);

  shape.bezierCurveTo(0.53, -0.08, 0.48, -0.25, 0.34, -0.36);
  shape.bezierCurveTo(0.14, -0.51, -0.20, -0.50, -0.43, -0.34);
  shape.closePath();

  const inlet = new THREE.Path();
  inlet.absarc(-0.03, 0.02, 0.245, 0, Math.PI * 2, false);
  shape.holes.push(inlet);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: mobile ? 1 : 2,
    bevelSize: 0.026,
    bevelThickness: 0.022,
    curveSegments: mobile ? 12 : 22,
    steps: 1,
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

export function cylinderBetween(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  segments = 14,
) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  return mesh;
}

export function addBoltRingX(
  group: THREE.Group,
  x: number,
  radius: number,
  count: number,
  boltMaterial: THREE.Material,
  componentName: string,
  boltRadius = 0.055,
  centerY = 0,
  centerZ = 0,
) {
  const geometry = new THREE.CylinderGeometry(boltRadius, boltRadius, 0.10, 10);
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const bolt = new THREE.Mesh(geometry, boltMaterial);
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(x, centerY + Math.sin(angle) * radius, centerZ + Math.cos(angle) * radius);
    bolt.userData.component = componentName;
    bolt.userData.kind = 'utility';
    bolt.userData.baseOpacity = 1;
    group.add(bolt);
  }
}

export function addFlangeX(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  outerRadius: number,
  innerRadius: number,
  thickness: number,
  flangeMaterial: THREE.Material,
  componentName: string,
) {
  const flange = new THREE.Mesh(
    new THREE.CylinderGeometry(outerRadius, outerRadius, thickness, 36),
    flangeMaterial,
  );
  flange.rotation.z = Math.PI / 2;
  flange.position.set(x, y, z);
  flange.userData.component = componentName;
  flange.userData.kind = 'utility';
  flange.userData.baseOpacity = 1;
  group.add(flange);

  const bore = new THREE.Mesh(
    new THREE.CylinderGeometry(innerRadius, innerRadius, thickness + 0.012, 28),
    new THREE.MeshBasicMaterial({ color: '#08121a' }),
  );
  bore.rotation.z = Math.PI / 2;
  bore.position.set(x, y, z);
  bore.userData.component = componentName;
  bore.userData.kind = 'utility';
  bore.userData.baseOpacity = 1;
  group.add(bore);
}
