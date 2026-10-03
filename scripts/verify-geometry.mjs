import assert from 'node:assert/strict';
import * as THREE from 'three';
import { hollowCylinderX, perforatedTubeSheet, getFireTubeCoordinates, NORMAL_WATER_LEVEL, fitDistance } from '../src/boiler3d/industrialGeometry.ts';

const coords = getFireTubeCoordinates();
assert(coords.length > 20, 'The tube bank must retain a substantial heat-transfer surface.');
for (const [y,z] of coords) {
  assert(Math.hypot(y+1,z) > .82+.105, 'A fire tube intersects the furnace wall.');
  assert(y+.18+.105 < NORMAL_WATER_LEVEL, 'A heated fire tube is above normal water level.');
  assert(Math.hypot(y+.18,z)+.108 < 2.22, 'A tube bore breaks through the tube-sheet edge.');
}
const material = new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const sheet = new THREE.Mesh(perforatedTubeSheet(coords), material);
sheet.updateMatrixWorld();
const ray = new THREE.Raycaster();
const through = (mesh,y,z) => {
  ray.set(new THREE.Vector3(-6,y,z),new THREE.Vector3(1,0,0));
  return ray.intersectObject(mesh).length;
};
for (const [y,z] of coords) assert.equal(through(sheet,y+.18,z),0,'A tube-sheet bore is blocked by a face.');
assert.equal(through(sheet,-.82,0),0,'The furnace opening is blocked.');
assert(through(sheet,2.05,0)>0,'The sheet has lost its solid pressure-boundary area.');
const pipe = new THREE.Mesh(hollowCylinderX(.5,.4,2),material);
pipe.updateMatrixWorld();
assert.equal(through(pipe,0,0),0,'The hollow cylinder is capped.');
assert(through(pipe,.45,0)>0,'The cylinder wall is missing.');

const bounds = new THREE.Box3(new THREE.Vector3(-7,-3,-2.5),new THREE.Vector3(6,6.3,4));
const center = bounds.getCenter(new THREE.Vector3());
for (const [width,height] of [[1440,900],[1366,768],[768,1024],[1024,768],[390,844],[390,360]]) {
  for (const [yaw,pitch] of [[-.82,.26],[-1.30,.08],[1.08,.24]]) {
    const camera = new THREE.PerspectiveCamera(42,width/height,.1,120);
    const radius=fitDistance(bounds,camera,yaw,pitch,1.12,center);
    camera.position.copy(center).add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(radius));
    camera.lookAt(center);camera.updateMatrixWorld();
    for(const x of [bounds.min.x,bounds.max.x]) for(const y of [bounds.min.y,bounds.max.y]) for(const z of [bounds.min.z,bounds.max.z]) {
      const p = new THREE.Vector3(x,y,z).project(camera);
      assert(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1,`Camera clips the equipment at ${width} × ${height}.`);
    }
  }
}
sheet.geometry.dispose();pipe.geometry.dispose();material.dispose();
console.log(`Geometry QA passed: ${coords.length} submerged tubes, furnace clearance, ${coords.length+1} open sheet bores, hollow walls and 18 viewport/orientation fits.`);
