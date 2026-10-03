import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const NORMAL_WATER_LEVEL = 1.68;

export function getFireTubeCoordinates(): [number, number][] {
  const coordinates: [number, number][] = [];
  for (const y of [-1.35, -0.9, -0.45, 0, 0.45, 0.9, 1.35]) {
    for (const z of [-1.45, -0.95, -0.45, 0.45, 0.95, 1.45]) {
      // Tube OD, furnace OD and fitting clearance define the lower exclusion.
      if (Math.hypot(y + 1.0, z) >= 0.97 && Math.hypot(y * 0.92, z) < 1.95) coordinates.push([y, z]);
    }
  }
  return coordinates;
}

export function disposeSceneResources(scene: THREE.Scene, extraTextures: THREE.Texture[] = [], extraMaterials: THREE.Material[] = []) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>(extraMaterials);
  const textures = new Set<THREE.Texture>(extraTextures);
  scene.traverse(object => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
    } else if (object instanceof THREE.Sprite) materials.add(object.material);
  });
  materials.forEach(material => {
    Object.entries(material).forEach(([key, value]) => {
      if (key !== 'envMap' && value instanceof THREE.Texture) textures.add(value);
    });
  });
  geometries.forEach(geometry => geometry.dispose());
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
}

// The through-bore is actual geometry, including the inner wall and end faces.
export function hollowCylinderX(outer: number, inner: number, length: number, segments = 64) {
  // Cylindrical walls use analytic smooth normals rather than faceted extrude
  // side normals. End annuli retain hard edges at the pressure-wall interface.
  const outside = new THREE.CylinderGeometry(outer,outer,length,segments,1,true);
  const inside = new THREE.CylinderGeometry(inner,inner,length,segments,1,true);
  const normals=inside.getAttribute('normal');
  for(let i=0;i<normals.count;i++) normals.setXYZ(i,-normals.getX(i),-normals.getY(i),-normals.getZ(i));
  const indices=inside.index!;
  for(let i=0;i<indices.count;i+=3) {const second=indices.getX(i+1);indices.setX(i+1,indices.getX(i+2));indices.setX(i+2,second);}
  outside.rotateZ(Math.PI/2);inside.rotateZ(Math.PI/2);
  const front=new THREE.RingGeometry(inner,outer,segments);front.rotateY(-Math.PI/2);front.translate(-length/2,0,0);
  const rear=new THREE.RingGeometry(inner,outer,segments);rear.rotateY(Math.PI/2);rear.translate(length/2,0,0);
  const parts=[outside,inside,front,rear];
  const geometry=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());
  return geometry;
}

export function perforatedTubeSheet(coords: [number, number][], thickness = 0.16, segments = 48) {
  // XY before rotation becomes ZY in the boiler. Tube locations are [y,z].
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 2.22, 0, Math.PI * 2, false);
  const furnace = new THREE.Path();
  furnace.absarc(0, -0.82, 0.83, 0, Math.PI * 2, true);
  shape.holes.push(furnace);
  coords.forEach(([y, z]) => {
    const hole = new THREE.Path();
    hole.absarc(-z, y + 0.18, 0.108, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  });
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: segments / 4, steps: 1 });
  geometry.translate(0, 0, -thickness / 2);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

export function roundedBox(x: number, y: number, z: number, material: THREE.Material, radius = 0.025) {
  return new THREE.Mesh(new RoundedBoxGeometry(x, y, z, 2, Math.min(radius, x / 4, y / 4, z / 4)), material);
}

export function roundedPipePath(points: [number, number, number][], radius: number) {
  // Straight runs with a finite-radius quadratic elbow at each corner.
  const vectors = points.map(p => new THREE.Vector3(...p));
  const path = new THREE.CurvePath<THREE.Vector3>();
  let cursor = vectors[0];
  for (let i = 1; i < vectors.length - 1; i++) {
    const corner = vectors[i];
    const before = vectors[i - 1].clone().sub(corner);
    const after = vectors[i + 1].clone().sub(corner);
    const r = Math.min(radius * 2.8, before.length() * 0.35, after.length() * 0.35);
    const entry = corner.clone().add(before.normalize().multiplyScalar(r));
    const exit = corner.clone().add(after.normalize().multiplyScalar(r));
    path.add(new THREE.LineCurve3(cursor, entry));
    path.add(new THREE.QuadraticBezierCurve3(entry, corner, exit));
    cursor = exit;
  }
  path.add(new THREE.LineCurve3(cursor, vectors[vectors.length - 1]));
  return path;
}

export function pipeRoute(points: [number, number, number][], radius: number, material: THREE.Material, mobile = false) {
  const path = roundedPipePath(points, radius);
  return new THREE.Mesh(new THREE.TubeGeometry(path, mobile ? 44 : 80, radius, mobile ? 10 : 16, false), material);
}

export function flangeAlong(
  group: THREE.Group, center: THREE.Vector3, direction: THREE.Vector3, radius: number,
  bore: number, mat: THREE.Material, name: string, boltCount = 8,
) {
  const assembly = new THREE.Group();
  const flange = new THREE.Mesh(hollowCylinderX(radius, bore, 0.07, 40), mat);
  flange.userData.kind = 'utility';
  assembly.add(flange);
  const boltGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.10, 6);
  const bolts = new THREE.InstancedMesh(boltGeo, mat, boltCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < boltCount; i++) {
    const a = i * Math.PI * 2 / boltCount;
    dummy.position.set(0.015, Math.sin(a) * radius * 0.78, Math.cos(a) * radius * 0.78);
    dummy.rotation.set(0, 0, Math.PI / 2); dummy.updateMatrix();
    bolts.setMatrixAt(i, dummy.matrix);
  }
  assembly.add(bolts);
  assembly.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.clone().normalize());
  assembly.position.copy(center);
  assembly.traverse(o => { o.userData.component = name; o.userData.kind = 'utility'; o.userData.baseOpacity = 1; });
  group.add(assembly);
  return assembly;
}

export function makeStudioEnvironment(renderer: THREE.WebGLRenderer) {
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  return target;
}

export function makeInstrumentDial() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e8e5db'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#26343b'; ctx.lineWidth = 2;
  for (let i = 0; i <= 40; i++) {
    const a = (Math.PI * 0.75) + i / 40 * Math.PI * 1.5;
    const r = i % 5 === 0 ? 82 : 91;
    ctx.beginPath();ctx.moveTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
    ctx.lineTo(128 + Math.cos(a) * 106, 128 + Math.sin(a) * 106); ctx.stroke();
  }
  ctx.fillStyle = '#26343b'; ctx.textAlign = 'center';
  ctx.font = 'bold 19px Arial';ctx.fillText('PRESSURE',128,99);
  ctx.font = '14px Arial';ctx.fillText('TRAINING',128,179);
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

export function geometryBounds(object: THREE.Object3D) {
  object.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  const temp = new THREE.Box3();
  const instanceMatrix = new THREE.Matrix4();
  object.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o.userData.kind === 'fluid' || o.userData.presentationOnly || o.userData.flameStage) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (!o.geometry.boundingBox) return;
    if (o instanceof THREE.InstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, instanceMatrix);
        temp.copy(o.geometry.boundingBox).applyMatrix4(instanceMatrix).applyMatrix4(o.matrixWorld);
        bounds.union(temp);
      }
    } else bounds.union(temp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return bounds;
}

export function fitDistance(bounds: THREE.Box3, camera: THREE.PerspectiveCamera, yaw: number, pitch: number, padding = 1.15, target?: THREE.Vector3) {
  const center = target ?? bounds.getCenter(new THREE.Vector3());
  const outward = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const up = new THREE.Vector3().crossVectors(outward, right).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanH = tanV * camera.aspect;
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const d = new THREE.Vector3(x,y,z).sub(center);
    distance = Math.max(distance, d.dot(outward) + Math.abs(d.dot(right)) / tanH * padding, d.dot(outward) + Math.abs(d.dot(up)) / tanV * padding);
  }
  return THREE.MathUtils.clamp(distance, 2.0, 48);
}
