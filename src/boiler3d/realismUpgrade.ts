import * as THREE from 'three';
import { NORMAL_WATER_LEVEL, hollowCylinderX, roundedBox, pipeRoute, flangeAlong } from './industrialGeometry';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Components = Map<string, THREE.Group>;
const v = (x:number,y:number,z:number) => new THREE.Vector3(x,y,z);
const steel = (color = '#879599', roughness = 0.36, metalness = 0.86) => new THREE.MeshStandardMaterial({color, roughness, metalness});
const paint = (color:string) => new THREE.MeshPhysicalMaterial({color,roughness:0.58,metalness:0.04,clearcoat:0.14,clearcoatRoughness:0.55});

function tag(mesh: THREE.Object3D, group: THREE.Group, kind = 'utility', opacity = 1) {
  mesh.traverse(o => {o.userData.component=group.name;o.userData.kind=kind;o.userData.baseOpacity=opacity;});
  group.add(mesh);return mesh;
}
function meshAt(geometry:THREE.BufferGeometry,mat:THREE.Material,position:THREE.Vector3) {
  const mesh = new THREE.Mesh(geometry, mat);mesh.position.copy(position);return mesh;
}
function clear(group:THREE.Group) {
  const geometries=new Set<THREE.BufferGeometry>();
  group.traverse(o=>{if(o instanceof THREE.Mesh) geometries.add(o.geometry);});
  group.clear();geometries.forEach(g=>g.dispose());
}
function pipe(group:THREE.Group,points:[number,number,number][],radius:number,mat:THREE.Material,mobile:boolean) {
  return tag(pipeRoute(points,radius,mat,mobile),group);
}
function ring(group:THREE.Group,p:THREE.Vector3,outer:number,inner:number,axis:THREE.Vector3,mat:THREE.Material) {
  const m=meshAt(hollowCylinderX(outer,inner,0.07,40),mat,p);
  m.quaternion.setFromUnitVectors(v(1,0,0),axis.clone().normalize());tag(m,group);return m;
}
function valve(group:THREE.Group,p:THREE.Vector3,size:number,bodyMat:THREE.Material,trim:THREE.Material) {
  const body=meshAt(new THREE.SphereGeometry(size*0.18,16,12),bodyMat,p);body.scale.set(1,1.1,1.35);tag(body,group);
  const bonnet=meshAt(new THREE.CylinderGeometry(size*0.08,size*0.13,size*0.23,16),bodyMat,p.clone().add(v(0,size*0.19,0)));tag(bonnet,group);
  tag(meshAt(new THREE.CylinderGeometry(size*0.026,size*0.026,size*0.25,10),trim,p.clone().add(v(0,size*0.40,0))),group);
  const wheel=meshAt(new THREE.TorusGeometry(size*0.20,size*0.022,6,24),paint('#34424b'),p.clone().add(v(0,size*0.54,0)));wheel.rotation.x=Math.PI/2;tag(wheel,group);
  for (let i=0;i<3;i++) {
    const spoke=roundedBox(size*0.36,size*0.025,size*0.025,trim,0.005);spoke.position.copy(wheel.position);spoke.rotation.y=i*Math.PI/3;tag(spoke,group);
  }
}

export function upgradeBoilerConstruction(components:Components,mobile:boolean) {
  const trim=steel('#9ba7a9',0.31), dark=steel('#414c52',0.54,0.55), gasket=steel('#242b2f',0.91,0);
  const shell=components.get('Boiler Shell')!;
  const skin=shell.children[0] as THREE.Mesh;
  skin.geometry.dispose();skin.geometry=hollowCylinderX(2.35,2.25,8.10,mobile?64:96);skin.rotation.set(0,0,0);
  skin.userData.sectionable=true;
  for (const y of [-2.30,2.30]) {
    const edge=roundedBox(8.10,0.10,0.025,trim,0.006);edge.position.set(0,y,0);tag(edge,shell);edge.userData.cutEdge=true;
  }
  // Narrow fabrication seams replace the old solid annular disks.
  for (const obj of shell.children.slice(1,6)) {
    const mesh=obj as THREE.Mesh;const old=mesh.geometry as THREE.CylinderGeometry;
    mesh.geometry=hollowCylinderX(old.parameters.radiusTop,2.345,old.parameters.height,64);old.dispose();mesh.rotation.set(0,0,0);mesh.userData.sectionable=true;
  }
  for (const obj of shell.children) {
    if (!(obj instanceof THREE.Mesh) || !(obj.geometry instanceof THREE.CylinderGeometry)) continue;
    const p=obj.geometry.parameters;
    if (p.radiusTop<2.4 || p.height>0.25) continue;
    // A saddle supports the lower arc; it does not wrap the entire vessel.
    const shape=new THREE.Shape();shape.absarc(0,0,2.46,Math.PI,Math.PI*2,false);
    shape.absarc(0,0,2.345,Math.PI*2,Math.PI,true);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:0.26,bevelEnabled:false,curveSegments:20});
    geometry.translate(0,0,-0.13);geometry.rotateY(Math.PI/2);
    obj.geometry.dispose();obj.geometry=geometry;obj.rotation.set(0,0,0);
  }
  // Longitudinal skid, saddle stiffeners and anchoring hardware.
  for (const z of [-1.32,1.32]) {
    const rail=roundedBox(10.9,0.20,0.22,dark);rail.position.set(-0.7,-2.98,z);tag(rail,shell);
    for (const x of [-2.6,2.6]) {
      const rib=roundedBox(0.10,0.60,0.72,dark);rib.position.set(x,-2.64,z*0.84);tag(rib,shell);
    }
  }
  for (const x of [-2.6,2.6]) for (const z of [-1.43,1.43]) {
    const foot=roundedBox(0.38,0.09,0.38,dark,0.012);foot.position.set(x,-3.125,z);tag(foot,shell);
    tag(meshAt(new THREE.CylinderGeometry(0.055,0.055,0.18,6),trim,v(x,-2.99,z)),shell);
    ring(shell,v(x,-3.055,z),0.11,0.052,v(0,1,0),trim);
  }
  // Small jacket clips and handhole covers make the pressure boundary readable.
  for (const x of [-2.15,0.45,2.65]) {
    const cover=meshAt(new THREE.SphereGeometry(0.21,20,12),dark,v(x,-1.40,1.84));cover.scale.set(1.35,0.72,0.25);tag(cover,shell);
    const bridge=roundedBox(0.44,0.075,0.055,trim);bridge.position.set(x,-1.4,1.91);tag(bridge,shell);
    tag(meshAt(new THREE.CylinderGeometry(0.036,0.036,0.10,6),trim,v(x,-1.4,1.98)),shell);
  }
  // Layered nozzle reinforcement -> neck -> bolted fitting. No safety inlet stop valve.
  for (const [component,x,z,r] of [['Safety Valve',0.25,0.25,0.16],['Steam Outlet',1.45,-0.30,0.22],['Pressure Controls',-1.25,-0.45,0.06],['Pressure Controls',-0.75,-0.45,0.06]] as const) {
    const group=components.get(component)!;const y=Math.sqrt(2.35**2-z**2);
    const pad=meshAt(new THREE.CylinderGeometry(r*1.8,r*1.9,0.045,28),trim,v(x,y,z));tag(pad,group);
    flangeAlong(group,v(x,y+0.18,z),v(0,1,0),r*1.7,r*0.88,trim,group.name,6);
  }

  for (const name of ['Front Smokebox','Rear Smokebox']) {
    const group=components.get(name)!;const body=group.children[0] as THREE.Mesh;
    const old=body.geometry as THREE.CylinderGeometry;body.geometry=hollowCylinderX(old.parameters.radiusTop,old.parameters.radiusTop-0.08,old.parameters.height,64);old.dispose();body.rotation.set(0,0,0);body.userData.sectionable=true;
    const door=group.children[1] as THREE.Mesh;door.userData.sectionable=true;
    const doorRing=group.children[2] as THREE.Mesh;const p=(doorRing.geometry as THREE.CylinderGeometry).parameters;
    doorRing.geometry.dispose();doorRing.geometry=hollowCylinderX(p.radiusTop+0.18,p.radiusTop,0.07,64);doorRing.rotation.set(0,0,0);doorRing.userData.sectionable=true;
    doorRing.userData.kind='shell';
    const front=name==='Front Smokebox';const x=front?-4.36:4.38;
    // Door hinge barrels and evenly spaced clamping dogs.
    for (const y of [-0.82,0.82]) {
      const pin=meshAt(new THREE.CylinderGeometry(0.068,0.068,0.38,12),trim,v(x,y,front?2.06:-2.02));tag(pin,group);
    }
    for (let i=0;i<8;i++) {
      const a=i*Math.PI/4;const dog=roundedBox(0.16,0.26,0.10,trim);dog.position.set(x,Math.sin(a)*1.92,Math.cos(a)*1.92);dog.rotation.x=-a;tag(dog,group);
    }
  }
  // A real refractory lip and burner flange bore; existing pilot, register,
  // motor, volute, fuel guns, scanner and ignition hardware are all retained.
  const burner=components.get('Burner & Ignition')!;
  flangeAlong(burner,v(-4.50,-0.82,0),v(1,0,0),0.68,0.46,trim,burner.name,12);
  const mount=roundedBox(1.50,0.13,1.20,dark);mount.position.set(-5.58,-1.84,0);tag(mount,burner);
  for (const z of [-0.42,0.42]) {
    const support=roundedBox(0.12,1.20,0.14,dark);support.position.set(-5.65,-2.50,z);tag(support,burner);
    const foot=roundedBox(0.32,0.14,0.30,dark);foot.position.set(-5.65,-3.10,z);tag(foot,burner);
  }
  // Add connected flexible/conduit hints on the machinery, not decorative wires.
  pipe(burner,[[-5.26,0.10,-0.54],[-5.26,-1.65,-0.76],[-6.32,-1.65,-0.76],[-6.32,-0.28,-0.60]],0.020,gasket,mobile);

  // Level glass uses exactly the same normal-water-level datum as the inventory.
  const gauge=components.get('Level Gauge')!;clear(gauge);
  const glassMat=new THREE.MeshPhysicalMaterial({color:'#d4e1e1',roughness:0.13,metalness:0,transparent:true,opacity:0.16,depthWrite:false});
  const fillMat=new THREE.MeshStandardMaterial({color:'#587e88',roughness:0.30,metalness:0,transparent:true,opacity:0.80});
  const lower=-0.40,upper=1.94;
  for (const x of [-2.48,-2.08]) {
    for (const y of [lower,upper]) {
      const shellZ=Math.sqrt(2.35**2-y**2)-0.04;
      pipe(gauge,[[x,y,shellZ],[x,y,2.68]],0.06,trim,mobile);
      flangeAlong(gauge,v(x,y,shellZ+0.14),v(0,0,1),0.125,0.055,trim,gauge.name,6);
      valve(gauge,v(x,y,2.59),0.55,dark,trim);
    }
    const glass=meshAt(new THREE.CylinderGeometry(0.067,0.067,upper-lower,20),glassMat,v(x,(upper+lower)/2,2.68));tag(glass,gauge,'utility',0.16);
    const water=meshAt(new THREE.CylinderGeometry(0.052,0.052,NORMAL_WATER_LEVEL-lower,16),fillMat,v(x,(NORMAL_WATER_LEVEL+lower)/2,2.68));tag(water,gauge,'utility',0.80);
    water.userData.gaugeWaterLevel=NORMAL_WATER_LEVEL;
    for (const dx of [-0.09,0.09]) {
      const guard=roundedBox(0.022,2.56,0.05,dark);guard.position.set(x+dx,0.77,2.72);tag(guard,gauge);
    }
    for(let i=0;i<12;i++) {
      const tick=roundedBox(i%3===0?0.10:0.055,0.012,0.012,trim,0.002);tick.position.set(x-0.12,lower+0.1+i*0.195,2.74);tag(tick,gauge);
    }
    pipe(gauge,[[x,lower-0.06,2.68],[x,-0.97,2.68],[x,-0.97,2.94]],0.027,dark,mobile);
    valve(gauge,v(x,-0.75,2.68),0.38,dark,trim);
  }

  const feed=components.get('Feedwater Inlet')!;
  flangeAlong(feed,v(2.15,0.75,2.37),v(0,0,1),0.27,0.135,trim,feed.name,8);
  flangeAlong(feed,v(2.15,0.75,3.0),v(0,0,1),0.23,0.13,trim,feed.name,8);
  flangeAlong(feed,v(2.15,0.75,3.76),v(0,0,1),0.23,0.13,trim,feed.name,8);
  // Economizer water outlet joins the boiler feed train. The inlet is a marked
  // external-system boundary on the opposite side of the heat exchanger.
  pipe(feed,[[5.08,2.58,0.98],[5.80,2.58,0.98],[5.80,0.75,3.78],[2.15,0.75,3.78]],0.12,steel('#657984',0.47,0.50),mobile);
  const pipeSupport=roundedBox(0.16,0.90,0.18,dark);pipeSupport.position.set(4.95,-0.15,3.78);tag(pipeSupport,feed);

  const steam=components.get('Steam Outlet')!;
  // Replace the square top elbow with a radiused outlet and a boundary flange.
  const square=steam.children.find(o=>o instanceof THREE.Mesh && Math.abs(o.position.y-3.88)<0.02);
  if(square) {steam.remove(square);(square as THREE.Mesh).geometry.dispose();}
  pipe(steam,[[1.45,3.50,-0.30],[1.45,4.00,-0.30],[2.30,4.00,-0.30]],0.18,trim,mobile);
  flangeAlong(steam,v(2.30,4.00,-0.30),v(1,0,0),0.31,0.18,trim,steam.name,8);
  const relief=components.get('Safety Valve')!;
  // Existing outlet ring was oriented horizontally; flange is perpendicular
  // to the horizontal discharge and continues into a supported safe vent route.
  const wrongRing=relief.children.find(o=>o instanceof THREE.Mesh && o.geometry instanceof THREE.TorusGeometry);
  if(wrongRing){relief.remove(wrongRing);(wrongRing as THREE.Mesh).geometry.dispose();}
  flangeAlong(relief,v(0.25,3,1.05),v(0,0,1),0.20,0.105,trim,relief.name,6);
  pipe(relief,[[0.25,3,1.05],[0.25,3,1.52],[0.25,4.65,1.52]],0.11,trim,mobile);
  ring(relief,v(0.25,4.65,1.52),0.132,0.104,v(0,1,0),trim);
  const lever=roundedBox(0.38,0.035,0.06,trim);lever.position.set(0.35,3.63,0.25);tag(lever,relief);

  // Blowdown stays above the floor, drops from the bottom nozzle, then turns
  // toward a flanged system boundary. Two series devices remain distinguishable.
  const blowdown=components.get('Blowdown Valve')!;clear(blowdown);
  pipe(blowdown,[[0.10,-2.25,0.35],[0.10,-2.69,0.35],[0.10,-2.69,2.98]],0.13,trim,mobile);
  for(const z of [1.0,1.87]) {valve(blowdown,v(0.10,-2.69,z),0.65,dark,trim);flangeAlong(blowdown,v(0.10,-2.69,z-0.19),v(0,0,1),0.205,0.12,trim,blowdown.name,6);}
  flangeAlong(blowdown,v(0.10,-2.69,2.98),v(0,0,1),0.22,0.12,trim,blowdown.name,8);

  const economizer=components.get('Economizer')!;
  flangeAlong(economizer,v(4.48,2.55,-1.60),v(0,0,1),0.23,0.105,trim,economizer.name,8);
  // Remove the symbolic straight tube rows. One connected serpentine circuit
  // makes the two headers and finned water-side heat-transfer surface legible.
  const tubes=economizer.children.filter(o=>o instanceof THREE.Mesh && o.userData.kind==='internal');
  for(const t of tubes){economizer.remove(t);(t as THREE.Mesh).geometry.dispose();}
  const finMat=steel('#657984',0.51,0.72);const finGeometry=new THREE.CylinderGeometry(0.135,0.135,0.012,12);
  const positions:THREE.Vector3[]=[];
  for (let row=0;row<6;row++) {
    const y=1.48+row*0.18;
    pipe(economizer,[[4.48,y,-0.98],[4.48,y,0.80],[5.08,y,0.80],[5.08,y,0.98]],0.055,trim,mobile);
    for(let i=0;i<(mobile?9:18);i++) positions.push(v(4.48,y,-0.75+i*1.50/((mobile?9:18)-1)));
  }
  const fins=new THREE.InstancedMesh(finGeometry,finMat,positions.length);const dummy=new THREE.Object3D();
  positions.forEach((p,i)=>{dummy.position.copy(p);dummy.rotation.x=Math.PI/2;dummy.updateMatrix();fins.setMatrixAt(i,dummy.matrix);});tag(fins,economizer,'internal');
  // The existing side access panel is a removable skin in the section view.
  economizer.children[1].userData.sectionable=true;
  economizer.children[1].userData.kind='shell';
  for(const x of [4.02,5.54]) for(const z of [-1.04,1.04]) {
    const post=roundedBox(0.11,4.20,0.11,dark);post.position.set(x,-0.94,z);tag(post,economizer);
    const foot=roundedBox(0.34,0.16,0.34,dark);foot.position.set(x,-3.09,z);tag(foot,economizer);
  }
  const flange=roundedBox(1.78,0.06,2.52,trim);flange.position.set(4.78,2.98,0);tag(flange,economizer);
  // Stack is an open flue, never a solid capped cylinder.
  const stack=components.get('Stack / Flue Outlet')!;
  const riser=stack.children[1] as THREE.Mesh;riser.geometry.dispose();riser.geometry=hollowCylinderX(0.50,0.455,2.75,48);riser.rotation.set(0,0,Math.PI/2);
  flangeAlong(stack,v(4.78,3.42,0),v(0,1,0),0.64,0.455,trim,stack.name,12);

  components.forEach(group=>group.traverse(o=>{
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow=!mobile && o.userData.kind!=='fluid' && !(o.material instanceof THREE.ShaderMaterial);
    o.receiveShadow=!mobile;
  }));
}

export function normalizeComponentMaterials(components:Components) {
  // The same material may be used on a door skin and its hinge. They must not
  // share clipping/ghost state, while repeated hardware still shares one material.
  components.forEach(group=>{
    const cache=new Map<string,THREE.Material>();
    group.traverse(o=>{
      if (!(o instanceof THREE.Mesh)) return;
      const materials=Array.isArray(o.material)?o.material:[o.material];
      const owned=materials.map(m=>{
        const key=`${m.uuid}:${o.userData.kind}:${o.userData.baseOpacity}:${!!o.userData.furnaceWall}:${!!o.userData.sectionable}`;
        if(!cache.has(key)) { const owned=m.clone(); owned.side=m instanceof THREE.ShaderMaterial ? THREE.FrontSide : THREE.DoubleSide; cache.set(key,owned); } return cache.get(key)!;
      });
      o.material=Array.isArray(o.material)?owned:owned[0];
      o.userData.physicalClipping=owned[0].clippingPlanes?.map(p=>p.clone()) ?? [];
    });
  });
}

export function batchStaticConstruction(components:Components) {
  components.forEach(group=>{
    group.updateWorldMatrix(true,true);
    const inverse=group.matrixWorld.clone().invert();
    const batches=new Map<string,THREE.Mesh[]>();
    group.traverse(o=>{
      if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material) || o.material instanceof THREE.ShaderMaterial || o.userData.kind==='fluid' || o.userData.cutEdge) return;
      const key=`${o.material.uuid}:${o.userData.kind}:${o.userData.baseOpacity}:${!!o.userData.sectionable}:${!!o.userData.furnaceWall}`;
      if(!batches.has(key))batches.set(key,[]);batches.get(key)!.push(o);
    });
    batches.forEach(meshes=>{
      if(meshes.length<3)return;
      const geometries=meshes.map(m=>{
        const clone=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();
        clone.applyMatrix4(inverse.clone().multiply(m.matrixWorld));return clone;
      });
      const geometry=mergeGeometries(geometries);
      geometries.forEach(g=>g.dispose());if(!geometry)return;
      const merged=new THREE.Mesh(geometry,meshes[0].material);
      merged.userData={...meshes[0].userData};merged.castShadow=meshes[0].castShadow;merged.receiveShadow=meshes[0].receiveShadow;
      // Source geometries can be shared by other meshes; dispose once only
      // after gathering them so retained instanced geometry is not destroyed.
      const retained=new Set<THREE.BufferGeometry>();
      group.traverse(o=>{if(o instanceof THREE.InstancedMesh)retained.add(o.geometry);});
      const originals=new Set(meshes.map(m=>m.geometry));
      meshes.forEach(m=>m.removeFromParent());group.add(merged);
      originals.forEach(g=>{if(!retained.has(g))g.dispose();});
    });
  });
}
