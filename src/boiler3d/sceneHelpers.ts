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
) {
  const geometry = new THREE.CylinderGeometry(boltRadius, boltRadius, 0.10, 10);
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const bolt = new THREE.Mesh(geometry, boltMaterial);
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(x, Math.sin(angle) * radius, Math.cos(angle) * radius);
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
