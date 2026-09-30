import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const isMobile = matchMedia("(pointer:coarse)").matches || innerWidth < 861;

let quality = "auto";
let gameRunning = false;
let paused = false;
let cinematicRunning = false;
let currentMission = 0;
let missionTimer = 0;
let ambushStarted = false;
let ambushRemaining = 0;
let lastTime = performance.now();
let elapsed = 0;
let fpsAccumulator = 0;
let fpsFrames = 0;
let dynamicPixelRatio = Math.min(devicePixelRatio, isMobile ? 1.25 : 1.65);
let lastFootstep = 0;
let lastNoise = 0;
let musicDanger = 0;
let currentSurface = "ASFALTO MOJADO";

const renderer = new THREE.WebGLRenderer({
  canvas: $("game"),
  antialias: true,
  powerPreference: "high-performance",
  stencil: false
});
renderer.setPixelRatio(dynamicPixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x60746f);
scene.fog = new THREE.FogExp2(0x637873, 0.0075);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.06, 300);
camera.position.set(0, 3.2, 7);

const roomEnv = new RoomEnvironment();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
roomEnv.dispose();
pmrem.dispose();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.11, 0.45, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();

const COLLIDERS = [];
const WORLD_MESHES = [];
const PICKUPS = [];
const DOCUMENTS = [];
const INTERACTIVES = [];
const STEALTH_ZONES = [];
const ENEMIES = [];
const LOD_OBJECTS = [];
const DYNAMIC_PROPS = [];

const inventory = {
  cloth: 0,
  alcohol: 0,
  metal: 0,
  parts: 0,
  medkits: 0,
  blades: 1,
  ammoReserve: 18,
  notes: []
};

const player = {
  name: "Alex",
  group: null,
  pos: new THREE.Vector3(0, 0, 53),
  velocity: new THREE.Vector3(),
  yaw: Math.PI,
  cameraYaw: Math.PI,
  cameraPitch: -0.12,
  hp: 100,
  ammo: 8,
  magSize: 8,
  aiming: false,
  crouched: false,
  dodging: false,
  dodgeTime: 0,
  dodgeDir: new THREE.Vector3(),
  attackCooldown: 0,
  invuln: 0,
  bladeBoost: 0,
  noise: 0,
  grassHidden: false,
  alive: true
};

const input = {
  forward: 0,
  right: 0,
  lookX: 0,
  lookY: 0,
  sprint: false,
  attack: false
};

const DEFAULT_SETTINGS = {
  quality: "auto",
  fpsCap: isMobile ? 45 : 60,
  fov: 58,
  sensitivity: 1,
  invertY: false,
  aimAssist: true,
  autoCamera: true,
  haptics: true,
  touchScale: 1,
  drawDistance: 1,
  bindings: {
    forward: "KeyW",
    back: "KeyS",
    left: "KeyA",
    right: "KeyD",
    sprint: "ShiftLeft",
    crouch: "KeyC",
    dodge: "Space",
    interact: "KeyE",
    inventory: "Tab",
    heal: "KeyH",
    reload: "KeyR"
  }
};

function readSettings(){
  try{
    const raw=JSON.parse(localStorage.getItem("santaAuroraSettings")||"null");
    return {
      ...DEFAULT_SETTINGS,
      ...(raw||{}),
      bindings:{...DEFAULT_SETTINGS.bindings,...(raw?.bindings||{})}
    };
  }catch{
    return structuredClone(DEFAULT_SETTINGS);
  }
}
let settings=readSettings();
quality=settings.quality;
let pendingBinding=null;
let lastRenderedAt=0;
let autosaveClock=0;
let lodClock=0;
let lastZoneName="";
let gamepadPrev=[];
function haptic(pattern){ if(settings.haptics && navigator.vibrate) navigator.vibrate(pattern); }
function writeSettings(){
  localStorage.setItem("santaAuroraSettings",JSON.stringify(settings));
}

const MISSION_DATA = [
  {
    title: "Busca suministros en la farmacia.",
    hint: "Encuentra tela y alcohol entre los edificios de la Avenida Sur."
  },
  {
    title: "Fabrica un botiquín.",
    hint: "Abre la mochila y combina 1 tela + 1 alcohol."
  },
  {
    title: "Encuentra una batería para la radio.",
    hint: "La estación de tren inundada conserva equipo de emergencia."
  },
  {
    title: "Restaura la radio del refugio.",
    hint: "Lleva la batería al puesto improvisado junto al centro comercial."
  },
  {
    title: "Sobrevive al ataque.",
    hint: "Resiste mientras la radio transmite. Evita quedar rodeado."
  },
  {
    title: "Alcanza la salida norte.",
    hint: "La compuerta del parque se abrió. Sal de Santa Aurora."
  }
];

const ZONES = [
  {name:"CENTRO URBANO",x1:-16,x2:16,z1:8,z2:78},
  {name:"SUBURBIOS",x1:-78,x2:-16,z1:8,z2:78},
  {name:"HOSPITAL ABANDONADO",x1:-78,x2:-16,z1:-18,z2:8},
  {name:"ESTACIÓN DE TREN INUNDADA",x1:5,x2:34,z1:-46,z2:-10},
  {name:"BOSQUE DE LA PERIFERIA",x1:-78,x2:-18,z1:-78,z2:-18},
  {name:"CENTRO COMERCIAL",x1:-18,x2:18,z1:-78,z2:-36}
];

const noteCatalog = {
  "nota_1": {
    title: "Turno de noche",
    body: "Hospital Santa Aurora, archivo interno.\n\nLa lluvia empezó antes de que cortaran la energía. Elena dijo que la gente no corría de la tormenta, sino de algo que venía detrás. No sé qué vio. Dejé dos cajas de antibióticos en la farmacia del sur. Si alguien encuentra esto, úselas bien.\n\n— M. Ibarra, enfermero"
  },
  "nota_2": {
    title: "Mensaje de mantenimiento",
    body: "Estación Ribera, plataforma 2.\n\nLa batería auxiliar todavía funciona. El agua subió demasiado rápido y no pudimos sacar el generador. La radio de emergencias debería aceptar el módulo sin modificaciones.\n\nNo vuelvan por mí. Si la ciudad sigue transmitiendo, alguien sabrá que aún estamos aquí."
  },
  "nota_3": {
    title: "Grafiti transcrito",
    body: "NO FUE EL FIN DEL MUNDO.\nFUE EL FIN DE NUESTRA FORMA DE VIVIR.\n\nDebajo, alguien añadió con pintura verde:\n\nEntonces inventemos otra."
  }
};

function bootProgress(p, text) {
  $("bootBar").style.width = Math.round(p * 100) + "%";
  $("bootText").textContent = text;
}

function makeNoiseTexture(base, variation = 18, size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d");
  const rgb = new THREE.Color(base);
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);
  const img = x.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * variation;
    img.data[i] = clamp(r + n, 0, 255);
    img.data[i + 1] = clamp(g + n, 0, 255);
    img.data[i + 2] = clamp(b + n, 0, 255);
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

function makeCrackedTexture(base = "#555c59") {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0,0,512,512);
  for (let i=0;i<1800;i++){
    const v = 70 + Math.random()*70;
    x.fillStyle = "rgba(" + v + "," + v + "," + v + ",.08)";
    x.fillRect(Math.random()*512,Math.random()*512,1+Math.random()*2,1+Math.random()*2);
  }
  for(let i=0;i<24;i++){
    let px=Math.random()*512,py=Math.random()*512;
    x.strokeStyle="rgba(20,25,24,.30)";
    x.lineWidth=.6+Math.random()*1.5;
    x.beginPath();x.moveTo(px,py);
    for(let j=0;j<6;j++){
      px += (Math.random()-.5)*80;
      py += (Math.random()-.5)*80;
      x.lineTo(px,py);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  return t;
}

const textures = {
  asphalt: makeCrackedTexture("#3e4744"),
  concrete: makeCrackedTexture("#777e79"),
  wall: makeCrackedTexture("#85867c"),
  rust: makeNoiseTexture("#7a4e38", 30),
  bark: makeNoiseTexture("#594738", 26),
  moss: makeNoiseTexture("#586b4f", 25),
  fabric: makeNoiseTexture("#394c47", 16),
  water: makeNoiseTexture("#456c71", 20)
};

function stdMat(color, rough=0.75, metal=0.0, map=null) {
  return new THREE.MeshStandardMaterial({color, roughness:rough, metalness:metal, map});
}

const MAT = {
  asphalt: stdMat(0xffffff,.93,.02,textures.asphalt),
  sidewalk: stdMat(0xffffff,.90,.01,textures.concrete),
  concrete: stdMat(0xffffff,.85,.02,textures.concrete),
  wall: stdMat(0xffffff,.78,.01,textures.wall),
  moss: stdMat(0xffffff,.98,.0,textures.moss),
  metal: stdMat(0x565d5c,.45,.72),
  rust: stdMat(0xffffff,.72,.45,textures.rust),
  glass: new THREE.MeshPhysicalMaterial({color:0x99b5b0,roughness:.12,metalness:0,transmission:.12,transparent:true,opacity:.48}),
  fabric: stdMat(0xffffff,.96,.0,textures.fabric),
  dark: stdMat(0x151c1b,.7,.16),
  skin: stdMat(0xc99f7d,.72,.02),
  green: stdMat(0x556e54,.86,.0),
  leaf: stdMat(0x4f6c47,.95,.0),
  leafLight: stdMat(0x78906a,.94,.0),
  bark: stdMat(0xffffff,.98,.0,textures.bark)
};

function addWorldBox(x,y,z,w,h,d,mat=MAT.concrete, collidable=true, cast=true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  mesh.position.set(x,y,z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  scene.add(mesh);
  WORLD_MESHES.push(mesh);
  if(collidable){
    COLLIDERS.push({
      minX:x-w/2-.35,maxX:x+w/2+.35,
      minZ:z-d/2-.35,maxZ:z+d/2+.35,
      minY:y-h/2,maxY:y+h/2
    });
  }
  return mesh;
}

function addDebris(x,z,count=8) {
  for(let i=0;i<count;i++){
    const s=.2+Math.random()*.8;
    const m=new THREE.Mesh(
      new THREE.BoxGeometry(s,.1+Math.random()*.35,s*.8),
      Math.random()>.55?MAT.concrete:MAT.rust
    );
    m.position.set(x+(Math.random()-.5)*5,.08+Math.random()*.12,z+(Math.random()-.5)*5);
    m.rotation.set(Math.random()*.4,Math.random()*Math.PI,Math.random()*.35);
    m.castShadow=true;m.receiveShadow=true;scene.add(m);WORLD_MESHES.push(m);
  }
}

function addBuilding(x,z,w,d,h,style=0,broken=false) {
  const g=new THREE.Group();
  g.position.set(x,0,z);
  scene.add(g);

  const wallMat = style===1?MAT.wall:style===2?MAT.concrete:stdMat(0x737d76,.85,.02,textures.wall);
  const base=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wallMat);
  base.position.y=h/2;
  base.castShadow=true;base.receiveShadow=true;g.add(base);WORLD_MESHES.push(base);

  const frontZ=d/2+.01;
  const floors=Math.max(2,Math.floor(h/3));
  const cols=Math.max(2,Math.floor(w/3.4));
  for(let fy=0;fy<floors;fy++){
    for(let cx=0;cx<cols;cx++){
      if(broken && Math.random()<.28)continue;
      const ww=Math.min(1.65,w/(cols+1));
      const win=new THREE.Mesh(new THREE.PlaneGeometry(ww,1.2),MAT.glass);
      win.position.set(-w/2+(cx+1)*w/(cols+1),1.8+fy*2.7,frontZ);
      g.add(win);
    }
  }

  if(broken){
    const bite=new THREE.Mesh(
      new THREE.BoxGeometry(w*.34,h*.25,d*.22),
      MAT.dark
    );
    bite.position.set(w*.25,h*.78,d*.47);
    bite.rotation.z=.28;
    g.add(bite);
    addDebris(x+w*.25,z+d*.4,10);
  }

  COLLIDERS.push({minX:x-w/2-.4,maxX:x+w/2+.4,minZ:z-d/2-.4,maxZ:z+d/2+.4,minY:0,maxY:h});
  LOD_OBJECTS.push({obj:g,maxDistance:130});
  return g;
}

function addCar(x,z,ry=0,color=0x45515b,damaged=false) {
  const g=new THREE.Group();g.position.set(x,.35,z);g.rotation.y=ry;scene.add(g);
  const body=new THREE.Mesh(new THREE.BoxGeometry(2.25,.55,4.3),stdMat(color,.48,.38));
  body.position.y=.35;body.castShadow=true;g.add(body);WORLD_MESHES.push(body);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.8,.7,2.1),MAT.glass);
  cabin.position.set(0,.9,-.1);cabin.castShadow=true;g.add(cabin);
  for(const sx of [-.95,.95])for(const sz of [-1.45,1.45]){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,.24,12),MAT.dark);
    wheel.rotation.z=Math.PI/2;wheel.position.set(sx,.15,sz);g.add(wheel);
  }
  if(damaged){
    body.rotation.z=.05;body.rotation.x=.03;
    const rust=new THREE.Mesh(new THREE.PlaneGeometry(.7,.5),new THREE.MeshBasicMaterial({color:0x7f4d32,transparent:true,opacity:.7}));
    rust.position.set(0,.53,2.16);g.add(rust);
  }
  COLLIDERS.push({minX:x-1.6,maxX:x+1.6,minZ:z-2.6,maxZ:z+2.6,minY:0,maxY:1.5});
  LOD_OBJECTS.push({obj:g,maxDistance:90});
  return g;
}

function addTree(x,z,s=1) {
  const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(s);scene.add(g);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.22,.32,3.8,8),MAT.bark);trunk.position.y=1.9;trunk.castShadow=true;g.add(trunk);
  const canopy=new THREE.Group();canopy.position.y=4;
  for(let i=0;i<5;i++){
    const c=new THREE.Mesh(new THREE.IcosahedronGeometry(1.3+Math.random()*.6,1),i%2?MAT.leaf:MAT.leafLight);
    c.position.set((Math.random()-.5)*1.8,(Math.random()-.5)*1.4,(Math.random()-.5)*1.8);c.castShadow=true;canopy.add(c);
  }
  g.add(canopy);
  LOD_OBJECTS.push({obj:g,maxDistance:85});
  return g;
}

function addStreetLight(x,z,ry=0) {
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;scene.add(g);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,4.7,8),MAT.metal);pole.position.y=2.35;g.add(pole);
  const arm=new THREE.Mesh(new THREE.BoxGeometry(.9,.06,.06),MAT.metal);arm.position.set(.4,4.55,0);g.add(arm);
  const lamp=new THREE.PointLight(0xffd8a2,2.2,8,2);lamp.position.set(.78,4.42,0);g.add(lamp);
  return g;
}

function addGrassPatch(x,z,r=3,density=30) {
  const geo=new THREE.PlaneGeometry(.22,1.0);
  const mat=new THREE.MeshStandardMaterial({color:0x627d58,roughness:1,side:THREE.DoubleSide,alphaTest:.1});
  const inst=new THREE.InstancedMesh(geo,mat,density);
  const dummy=new THREE.Object3D();
  for(let i=0;i<density;i++){
    const a=Math.random()*Math.PI*2,rr=Math.sqrt(Math.random())*r;
    dummy.position.set(x+Math.cos(a)*rr,.48,z+Math.sin(a)*rr);
    dummy.rotation.y=Math.random()*Math.PI;
    const sc=.65+Math.random()*.8;dummy.scale.set(sc,sc,sc);dummy.updateMatrix();
    inst.setMatrixAt(i,dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate=true;scene.add(inst);
  STEALTH_ZONES.push({x,z,r});
  return inst;
}

function addPickup(type,x,z,label) {
  let color=0xa6b78c;
  if(type==="alcohol")color=0xa4c6d2;
  if(type==="metal")color=0xb38a64;
  if(type==="parts")color=0xd1c27d;
  if(type==="ammo")color=0x9a8870;
  if(type==="battery")color=0xd7a948;

  const g=new THREE.Group();g.position.set(x,.35,z);scene.add(g);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.45,.45,.45),stdMat(color,.45,.25));
  mesh.rotation.set(.2,.4,.1);mesh.castShadow=true;g.add(mesh);
  const glow=new THREE.PointLight(color,1.6,2.2,2);glow.position.y=.4;g.add(glow);
  const item={kind:"pickup",type,label:label||type,group:g,collected:false,baseY:.35};
  PICKUPS.push(item);INTERACTIVES.push(item);
  return item;
}

function addDocument(id,x,z) {
  const g=new THREE.Group();g.position.set(x,.12,z);scene.add(g);
  const paper=new THREE.Mesh(new THREE.PlaneGeometry(.48,.65),new THREE.MeshStandardMaterial({color:0xdfd7bf,roughness:.9,side:THREE.DoubleSide}));
  paper.rotation.x=-Math.PI/2;paper.rotation.z=.3;g.add(paper);
  const item={kind:"document",id,label:"Leer documento",group:g,collected:false};
  DOCUMENTS.push(item);INTERACTIVES.push(item);
  return item;
}

function addMissionObject(id,x,z,label) {
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  const table=new THREE.Mesh(new THREE.BoxGeometry(1.8,.9,.9),MAT.rust);table.position.y=.45;g.add(table);
  const radio=new THREE.Mesh(new THREE.BoxGeometry(.8,.38,.42),MAT.dark);radio.position.set(0,.98,0);g.add(radio);
  const ant=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,1.1,6),MAT.metal);ant.position.set(.28,1.65,0);ant.rotation.z=-.2;g.add(ant);
  const light=new THREE.PointLight(0xb7d99a,0,3,2);light.position.set(0,1.25,0);g.add(light);
  const item={kind:"mission",id,label,group:g,light,used:false};
  INTERACTIVES.push(item);
  return item;
}

let radioObject=null;
let exitGate=null;
let waterMesh=null;
let rainPoints=null;
let dustPoints=null;

function createWater(x,z,w,d) {
  const geo=new THREE.PlaneGeometry(w,d,48,48);
  const mat=new THREE.MeshPhysicalMaterial({
    color:0x3e6669,roughness:.18,metalness:.05,transparent:true,opacity:.72,
    transmission:.08,side:THREE.DoubleSide
  });
  const mesh=new THREE.Mesh(geo,mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.05,z);mesh.receiveShadow=true;scene.add(mesh);
  waterMesh=mesh;
  return mesh;
}

function createAtmosphere() {
  const count=isMobile?380:850;
  const geo=new THREE.BufferGeometry();
  const arr=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    arr[i*3]=(Math.random()-.5)*150;
    arr[i*3+1]=1+Math.random()*18;
    arr[i*3+2]=(Math.random()-.5)*150;
  }
  geo.setAttribute("position",new THREE.BufferAttribute(arr,3));
  const mat=new THREE.PointsMaterial({color:0xb9c7c0,size:.035,transparent:true,opacity:.38,depthWrite:false});
  dustPoints=new THREE.Points(geo,mat);scene.add(dustPoints);

  const rc=isMobile?650:1500;
  const rgeo=new THREE.BufferGeometry();const rarr=new Float32Array(rc*3);
  for(let i=0;i<rc;i++){
    rarr[i*3]=(Math.random()-.5)*130;rarr[i*3+1]=Math.random()*22;rarr[i*3+2]=(Math.random()-.5)*130;
  }
  rgeo.setAttribute("position",new THREE.BufferAttribute(rarr,3));
  const rmat=new THREE.PointsMaterial({color:0xb8d1d7,size:.035,transparent:true,opacity:0,depthWrite:false});
  rainPoints=new THREE.Points(rgeo,rmat);scene.add(rainPoints);
}

function createWorld() {
  bootProgress(.12,"Construyendo Santa Aurora...");

  const ground=new THREE.Mesh(new THREE.PlaneGeometry(170,170),MAT.moss);
  ground.rotation.x=-Math.PI/2;ground.position.y=-.04;ground.receiveShadow=true;scene.add(ground);

  const road=addWorldBox(0,-.01,0,24,.05,160,MAT.asphalt,false,false);
  textures.asphalt.repeat.set(4,18);
  addWorldBox(-24,.02,0,22,.08,160,MAT.sidewalk,false,false);
  addWorldBox(24,.02,0,22,.08,160,MAT.sidewalk,false,false);

  addWorldBox(0,.02,54,150,.05,18,MAT.asphalt,false,false);
  addWorldBox(0,.02,-52,150,.05,18,MAT.asphalt,false,false);

  for(let z=-68;z<=68;z+=11){
    const stripe=new THREE.Mesh(new THREE.PlaneGeometry(.18,4),new THREE.MeshBasicMaterial({color:0xc2b89d,transparent:true,opacity:.38}));
    stripe.rotation.x=-Math.PI/2;stripe.position.set(0,.035,z);scene.add(stripe);
  }

  addBuilding(-30,40,18,16,14,0,true);
  addBuilding(31,39,20,17,18,1,true);
  addBuilding(-34,15,23,18,20,2,false);
  addBuilding(36,13,22,17,16,0,true);
  addBuilding(-36,-18,25,20,18,1,true);
  addBuilding(36,-18,24,18,22,2,true);
  addBuilding(-34,-48,22,17,15,0,false);
  addBuilding(34,-49,26,18,19,1,true);

  for(let x=-69;x<=69;x+=12){
    if(Math.abs(x)<18)continue;
    addBuilding(x,70,9,10,8+Math.random()*12,Math.floor(Math.random()*3),Math.random()>.5);
    addBuilding(x,-70,9,10,8+Math.random()*12,Math.floor(Math.random()*3),Math.random()>.5);
  }

  addCar(-5,44,.1,0x4a555d,true);
  addCar(6,30,-.45,0x624b43,true);
  addCar(-3,7,.8,0x3f5b50,false);
  addCar(5,-12,-.3,0x56585c,true);
  addCar(-6,-36,.5,0x5c493d,true);
  addCar(7,-58,-.6,0x3f4d56,true);

  for(let z=-60;z<=60;z+=18){
    addStreetLight(-8,z,0);addStreetLight(8,z,Math.PI);
  }

  const treeSpots=[
    [-16,48],[-20,35],[18,47],[20,27],[-17,8],[18,3],[-22,-14],[19,-20],
    [-19,-38],[18,-42],[-26,58],[28,58],[-30,-61],[30,-60]
  ];
  treeSpots.forEach((p,i)=>addTree(p[0],p[1],.8+(i%3)*.18));
  for(let i=0;i<24;i++)addTree((Math.random()<.5?-1:1)*(42+Math.random()*30),-65+Math.random()*130,.7+Math.random()*.8);

  addGrassPatch(-12,31,4,40);
  addGrassPatch(14,20,4.5,48);
  addGrassPatch(-14,-8,4.2,44);
  addGrassPatch(13,-32,5,56);
  addGrassPatch(-10,-55,4.2,46);

  createWater(18,-27,26,34);
  addWorldBox(18,-.35,-27,27,.7,35,MAT.concrete,false,false);

  const platform=addWorldBox(18,.35,-27,22,.65,5,MAT.concrete,true);
  addWorldBox(8,1.6,-27,.4,3.2,32,MAT.rust,true);
  addWorldBox(28,1.6,-27,.4,3.2,32,MAT.rust,true);
  addWorldBox(18,3.2,-42,20,.35,1.2,MAT.rust,false);
  addWorldBox(18,3.2,-12,20,.35,1.2,MAT.rust,false);

  addWorldBox(-28,.45,24,12,.9,7,MAT.wall,true);
  addWorldBox(-31,2.3,27,6,3.2,.4,MAT.glass,true);

  radioObject=addMissionObject("radio",-15,-45,"Reparar radio");
  exitGate=addMissionObject("exit",0,-68,"Salir de Santa Aurora");
  exitGate.group.visible=false;

  addPickup("cloth",-26,22,"Tela limpia");
  addPickup("alcohol",-31,18,"Alcohol médico");
  addPickup("metal",12,6,"Metal recuperable");
  addPickup("parts",-4,-18,"Componentes");
  addPickup("ammo",14,-34,"Munición");
  addPickup("battery",21,-30,"Batería de emergencia");
  addPickup("ammo",-12,-48,"Munición");

  addDocument("nota_1",-29,20);
  addDocument("nota_2",23,-37);
  addDocument("nota_3",-8,-55);

  addDebris(-4,34,12);addDebris(6,-18,10);addDebris(-13,-42,13);addDebris(18,-34,8);

  createAtmosphere();

  COLLIDERS.push({minX:-85,maxX:-78,minZ:-85,maxZ:85,minY:0,maxY:20});
  COLLIDERS.push({minX:78,maxX:85,minZ:-85,maxZ:85,minY:0,maxY:20});
  COLLIDERS.push({minX:-85,maxX:85,minZ:78,maxZ:85,minY:0,maxY:20});
  COLLIDERS.push({minX:-85,maxX:85,minZ:-85,maxZ:-78,minY:0,maxY:20});

  bootProgress(.38,"Poblando vegetación y zonas inundadas...");
}

function createPlayerModel() {
  const g=new THREE.Group();
  scene.add(g);

  const jacket=stdMat(0x3b5048,.86,.0,textures.fabric);
  const pants=stdMat(0x2f3434,.92,.0);
  const leather=stdMat(0x59483c,.65,.08);
  const skin=MAT.skin;

  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.32,.78,7,12),jacket);
  torso.position.y=1.22;torso.castShadow=true;g.add(torso);

  const pack=new THREE.Mesh(new THREE.BoxGeometry(.58,.72,.27),MAT.fabric);
  pack.position.set(0,1.25,.24);pack.castShadow=true;g.add(pack);

  const head=new THREE.Mesh(new THREE.SphereGeometry(.24,18,14),skin);
  head.position.y=1.94;head.castShadow=true;g.add(head);

  const hair=new THREE.Mesh(new THREE.SphereGeometry(.245,18,10,0,Math.PI*2,0,Math.PI*.62),stdMat(0x2a2521,.92,0));
  hair.position.y=2.04;hair.castShadow=true;g.add(hair);

  // Rostro creado con el mismo motor Three.js/WebGL; no usa un motor facial externo.
  const eyeWhite=stdMat(0xf0eee7,.45,0);
  const iris=stdMat(0x556c63,.35,.05);
  for(const ex of [-.085,.085]){
    const ew=new THREE.Mesh(new THREE.SphereGeometry(.035,10,8),eyeWhite);
    ew.scale.set(1.15,.72,.55);ew.position.set(ex,1.96,-.222);g.add(ew);
    const pupil=new THREE.Mesh(new THREE.SphereGeometry(.018,8,6),iris);
    pupil.scale.set(1,.9,.45);pupil.position.set(ex,1.96,-.247);g.add(pupil);
    const brow=new THREE.Mesh(new THREE.BoxGeometry(.085,.012,.012),stdMat(0x3a2c24,.9,0));
    brow.position.set(ex,2.015,-.244);brow.rotation.z=ex<0?.10:-.10;g.add(brow);
  }
  const nose=new THREE.Mesh(new THREE.ConeGeometry(.032,.10,8),skin);
  nose.rotation.x=-Math.PI/2;nose.position.set(0,1.91,-.255);g.add(nose);
  const mouth=new THREE.Mesh(new THREE.BoxGeometry(.10,.012,.012),stdMat(0x7e4d49,.75,0));
  mouth.position.set(0,1.84,-.245);g.add(mouth);

  const shoulderL=new THREE.Group(),shoulderR=new THREE.Group();
  shoulderL.position.set(-.36,1.55,0);shoulderR.position.set(.36,1.55,0);
  const armGeo=new THREE.CapsuleGeometry(.09,.55,5,8);
  const armL=new THREE.Mesh(armGeo,jacket);armL.position.y=-.3;armL.castShadow=true;shoulderL.add(armL);
  const armR=new THREE.Mesh(armGeo,jacket);armR.position.y=-.3;armR.castShadow=true;shoulderR.add(armR);
  g.add(shoulderL,shoulderR);

  const hipL=new THREE.Group(),hipR=new THREE.Group();
  hipL.position.set(-.16,.87,0);hipR.position.set(.16,.87,0);
  const legGeo=new THREE.CapsuleGeometry(.11,.72,5,8);
  const legL=new THREE.Mesh(legGeo,pants);legL.position.y=-.42;legL.castShadow=true;hipL.add(legL);
  const legR=new THREE.Mesh(legGeo,pants);legR.position.y=-.42;legR.castShadow=true;hipR.add(legR);
  g.add(hipL,hipR);

  const weapon=new THREE.Group();weapon.position.set(.28,1.3,-.28);
  const receiver=new THREE.Mesh(new THREE.BoxGeometry(.12,.13,.42),leather);receiver.position.z=-.12;weapon.add(receiver);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,.36,8),MAT.metal);barrel.rotation.x=Math.PI/2;barrel.position.z=-.45;weapon.add(barrel);
  g.add(weapon);

  g.userData={torso,head,shoulderL,shoulderR,hipL,hipR,weapon,baseY:0};
  player.group=g;
  player.pos.set(0,0,53);
  g.position.copy(player.pos);
  return g;
}

function makeHumanEnemy(x,z,patrol,color=0x5c5044) {
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  const bodyMat=stdMat(color,.82,.04,textures.fabric);
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.31,.72,6,10),bodyMat);torso.position.y=1.2;torso.castShadow=true;g.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.22,14,10),MAT.skin);head.position.y=1.88;head.castShadow=true;g.add(head);
  const faceEye=stdMat(0xd9ddd5,.45,0), faceIris=stdMat(0x3a4a43,.4,0);
  for(const ex of [-.075,.075]){
    const ew=new THREE.Mesh(new THREE.SphereGeometry(.029,8,6),faceEye);ew.scale.set(1.1,.7,.5);ew.position.set(ex,1.91,-.205);g.add(ew);
    const ep=new THREE.Mesh(new THREE.SphereGeometry(.014,7,5),faceIris);ep.position.set(ex,1.91,-.225);g.add(ep);
  }
  const enose=new THREE.Mesh(new THREE.ConeGeometry(.027,.085,7),MAT.skin);enose.rotation.x=-Math.PI/2;enose.position.set(0,1.86,-.235);g.add(enose);
  const emouth=new THREE.Mesh(new THREE.BoxGeometry(.082,.01,.01),stdMat(0x704944,.8,0));emouth.position.set(0,1.80,-.225);g.add(emouth);
  const armL=new THREE.Mesh(new THREE.CapsuleGeometry(.08,.48,4,7),bodyMat);armL.position.set(-.38,1.25,0);armL.rotation.z=.15;g.add(armL);
  const armR=armL.clone();armR.position.x=.38;armR.rotation.z=-.15;g.add(armR);
  const gun=new THREE.Group();gun.position.set(.28,1.3,-.25);
  const gb=new THREE.Mesh(new THREE.BoxGeometry(.10,.12,.40),MAT.dark);gun.add(gb);g.add(gun);
  const enemy={
    type:"human",group:g,pos:g.position,patrol,patrolIndex:0,state:"patrol",investigate:new THREE.Vector3(),
    hp:85,speed:2.1,runSpeed:4.2,vision:17,hearing:15,attackRange:12,attackCooldown:0,
    suspicion:0,lastSeen:0,alive:true,anim:Math.random()*10
  };
  ENEMIES.push(enemy);return enemy;
}

function makeCreature(x,z,patrol) {
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  const hide=stdMat(0x59645b,.92,.0);
  const body=new THREE.Mesh(new THREE.SphereGeometry(.55,12,8),hide);body.scale.set(1.25,.6,1.7);body.position.y=.65;body.castShadow=true;g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.36,12,8),hide);head.position.set(0,.74,-.82);head.scale.set(.95,.82,1.2);head.castShadow=true;g.add(head);
  const jaw=new THREE.Mesh(new THREE.BoxGeometry(.35,.12,.28),stdMat(0x302f2b,.88,0));jaw.position.set(0,.58,-1.08);g.add(jaw);
  const limbs=[];
  for(const sx of [-.42,.42])for(const sz of [-.42,.48]){
    const limb=new THREE.Mesh(new THREE.CapsuleGeometry(.055,.58,4,6),hide);
    limb.position.set(sx,.32,sz);limb.rotation.z=sx<0?.25:-.25;g.add(limb);limbs.push(limb);
  }
  const eyeMat=new THREE.MeshBasicMaterial({color:0xc9d18d});
  for(const ex of [-.11,.11]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.028,6,5),eyeMat);eye.position.set(ex,.82,-1.12);g.add(eye);
  }
  const enemy={
    type:"creature",group:g,pos:g.position,patrol,patrolIndex:0,state:"patrol",investigate:new THREE.Vector3(),
    hp:120,speed:1.8,runSpeed:5.7,vision:12,hearing:22,attackRange:1.8,attackCooldown:0,
    suspicion:0,lastSeen:0,alive:true,anim:Math.random()*10,limbs
  };
  ENEMIES.push(enemy);return enemy;
}

function spawnInitialEnemies() {
  makeHumanEnemy(-7,17,[new THREE.Vector3(-7,0,17),new THREE.Vector3(7,0,20),new THREE.Vector3(10,0,9)]);
  makeHumanEnemy(-12,-4,[new THREE.Vector3(-12,0,-4),new THREE.Vector3(-5,0,-15),new THREE.Vector3(-17,0,-18)],0x4f5f55);
  makeCreature(19,-17,[new THREE.Vector3(19,0,-17),new THREE.Vector3(13,0,-25),new THREE.Vector3(22,0,-34)]);
  makeCreature(-16,-34,[new THREE.Vector3(-16,0,-34),new THREE.Vector3(-8,0,-43),new THREE.Vector3(-20,0,-47)]);
  bootProgress(.58,"Activando inteligencia enemiga...");
}

function spawnAmbush() {
  if(ambushStarted)return;
  ambushStarted=true;
  ambushRemaining=45;
  makeHumanEnemy(-4,-40,[new THREE.Vector3(-4,0,-40),new THREE.Vector3(-10,0,-46)],0x665044);
  makeHumanEnemy(5,-48,[new THREE.Vector3(5,0,-48),new THREE.Vector3(-3,0,-52)],0x485a52);
  makeCreature(-22,-44,[new THREE.Vector3(-22,0,-44),new THREE.Vector3(-14,0,-45)]);
  makeCreature(-8,-58,[new THREE.Vector3(-8,0,-58),new THREE.Vector3(-15,0,-50)]);
  toast("La transmisión atrajo movimiento. Aguanta 45 segundos.");
}

function lineOfSight(from,to) {
  const dir=new THREE.Vector3().subVectors(to,from);
  const dist=dir.length();dir.normalize();
  raycaster.set(from,dir);raycaster.far=dist;
  const hits=raycaster.intersectObjects(WORLD_MESHES,false);
  return hits.length===0;
}

function emitNoise(radius) {
  player.noise=Math.max(player.noise,radius);
  lastNoise=performance.now();
  const ring=$("noiseRing");
  ring.style.opacity="1";
  const s=clamp(radius/12,.5,1.8);
  ring.style.transform="translateX(-50%) scale("+s+")";
  setTimeout(()=>ring.style.opacity="0",120);

  ENEMIES.forEach(e=>{
    if(!e.alive)return;
    const d=e.pos.distanceTo(player.pos);
    if(d<Math.min(radius,e.hearing)){
      e.state="investigate";
      e.investigate.copy(player.pos);
      e.suspicion=Math.max(e.suspicion,.45);
    }
  });
}

function createAudio() {
  let ctx=null,windGain=null,dangerGain=null,windSrc=null;
  const api={};

  api.start=()=>{
    if(ctx)return;
    ctx=new (window.AudioContext||window.webkitAudioContext)();

    const makeNoiseBuffer=(seconds=2)=>{
      const b=ctx.createBuffer(1,ctx.sampleRate*seconds,ctx.sampleRate);
      const d=b.getChannelData(0);
      for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1);
      return b;
    };

    windSrc=ctx.createBufferSource();windSrc.buffer=makeNoiseBuffer(3);windSrc.loop=true;
    const filt=ctx.createBiquadFilter();filt.type="lowpass";filt.frequency.value=520;
    windGain=ctx.createGain();windGain.gain.value=.025;
    windSrc.connect(filt).connect(windGain).connect(ctx.destination);windSrc.start();

    const osc=ctx.createOscillator();osc.type="sine";osc.frequency.value=52;
    const osc2=ctx.createOscillator();osc2.type="triangle";osc2.frequency.value=78;
    dangerGain=ctx.createGain();dangerGain.gain.value=.0001;
    osc.connect(dangerGain).connect(ctx.destination);osc2.connect(dangerGain);osc.start();osc2.start();
  };

  api.setDanger=v=>{
    if(!ctx||!dangerGain)return;
    dangerGain.gain.setTargetAtTime(.002+v*.018,ctx.currentTime,.35);
  };

  api.pulse=(freq=180,d=.05,vol=.035,type="square")=>{
    if(!ctx)return;
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+d);
    o.connect(g).connect(ctx.destination);o.start();o.stop(ctx.currentTime+d);
  };

  api.noise=(d=.06,vol=.05,cut=1400)=>{
    if(!ctx)return;
    const b=ctx.createBuffer(1,ctx.sampleRate*d,ctx.sampleRate);
    const data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
    const s=ctx.createBufferSource();s.buffer=b;
    const f=ctx.createBiquadFilter();f.type="lowpass";f.frequency.value=cut;
    const g=ctx.createGain();g.gain.value=vol;s.connect(f).connect(g).connect(ctx.destination);s.start();
  };

  return api;
}

const audio=createAudio();

function createLighting() {
  scene.add(new THREE.HemisphereLight(0xc4d5cf,0x35433b,1.7));
  const sun=new THREE.DirectionalLight(0xffe7cb,2.7);
  sun.position.set(-26,34,18);sun.castShadow=true;
  sun.shadow.mapSize.set(isMobile?1024:2048,isMobile?1024:2048);
  sun.shadow.camera.left=-60;sun.shadow.camera.right=60;sun.shadow.camera.top=60;sun.shadow.camera.bottom=-60;sun.shadow.camera.far=100;
  scene.add(sun);
  const cool=new THREE.DirectionalLight(0x8fbad0,.45);cool.position.set(20,12,-20);scene.add(cool);
}

function getZoneName(pos=player.pos){
  const z=ZONES.find(v=>pos.x>=v.x1&&pos.x<=v.x2&&pos.z>=v.z1&&pos.z<=v.z2);
  return z?.name||"PERIFERIA DE SANTA AURORA";
}
function updateZone(){
  const name=getZoneName();
  if(name!==lastZoneName){
    lastZoneName=name;
    if(gameRunning)toast(name,1800);
  }
}
function updateLOD(){
  const factor=settings.drawDistance;
  for(const item of LOD_OBJECTS){
    const d=item.obj.position.distanceTo(player.pos);
    item.obj.visible=d<item.maxDistance*factor;
  }
}
function makeSave(){
  return {
    version:2,
    savedAt:Date.now(),
    player:{
      name:player.name,
      pos:{x:player.pos.x,y:player.pos.y,z:player.pos.z},
      hp:player.hp,
      ammo:player.ammo
    },
    inventory:{...inventory,notes:[...inventory.notes]},
    mission:currentMission,
    pickups:PICKUPS.map(p=>!!p.collected),
    documents:DOCUMENTS.map(d=>!!d.collected),
    radioUsed:!!radioObject?.used,
    settings
  };
}
function saveProgress(showToast=false){
  if(!gameRunning)return;
  localStorage.setItem("santaAuroraSave",JSON.stringify(makeSave()));
  if(showToast)toast("Partida guardada.");
  updateContinueButton();
}
function readSave(){
  try{return JSON.parse(localStorage.getItem("santaAuroraSave")||"null");}catch{return null}
}
function applySave(data){
  if(!data)return false;
  Object.assign(inventory,data.inventory||{});
  inventory.notes=Array.isArray(data.inventory?.notes)?data.inventory.notes:[];
  player.name=data.player?.name||"Alex";
  player.hp=clamp(Number(data.player?.hp)||100,1,100);
  player.ammo=clamp(Number(data.player?.ammo)||8,0,player.magSize);
  if(data.player?.pos)player.pos.set(data.player.pos.x||0,data.player.pos.y||0,data.player.pos.z||53);
  player.group.position.copy(player.pos);
  currentMission=clamp(Number(data.mission)||0,0,MISSION_DATA.length-1);
  (data.pickups||[]).forEach((v,i)=>{ if(PICKUPS[i]&&v){PICKUPS[i].collected=true;PICKUPS[i].group.visible=false;} });
  (data.documents||[]).forEach((v,i)=>{ if(DOCUMENTS[i]&&v){DOCUMENTS[i].collected=true;DOCUMENTS[i].group.visible=false;} });
  if(data.radioUsed&&radioObject){radioObject.used=true;radioObject.light.intensity=2.8;}
  updateInventoryUI();updateHealthUI();setMission(currentMission);
  return true;
}
function updateContinueButton(){
  $("continueGame").classList.toggle("hidden",!readSave());
}
function resumeSavedGame(){
  const data=readSave();if(!data)return;
  audio.start();
  applySave(data);
  $("mainMenu").classList.add("hidden");
  $("hud").classList.remove("hidden");
  gameRunning=true;paused=false;cinematicRunning=false;
  if(isMobile)$("touchUI").classList.remove("hidden");
  else{$("desktopHelp").classList.remove("hidden");requestLock();}
  toast("Partida restaurada.");
}
function updateContextButtons(){
  if(!isMobile)return;
  $("btnReload").classList.toggle("hidden",!(player.ammo<player.magSize&&inventory.ammoReserve>0));
  $("btnHeal").classList.toggle("hidden",!(inventory.medkits>0&&player.hp<100));
}
function setMission(index) {
  currentMission=index;
  const data=MISSION_DATA[index];
  if(data){
    $("objectiveText").textContent=data.title;
    $("objectiveHint").textContent=data.hint;
  }
  if(index===4)spawnAmbush();
  if(index===5 && exitGate){
    exitGate.group.visible=true;
    exitGate.light.intensity=2.5;
  }
}

function toast(text,duration=3600) {
  const el=$("storyToast");
  el.textContent=text;el.classList.remove("hidden");
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.classList.add("hidden"),duration);
}

function updateInventoryUI() {
  $("clothCount").textContent=inventory.cloth;
  $("alcoholCount").textContent=inventory.alcohol;
  $("metalCount").textContent=inventory.metal;
  $("partsCount").textContent=inventory.parts;
  $("medkits").textContent=inventory.medkits;
  $("blades").textContent=inventory.blades;
  $("ammo").textContent=player.ammo;
  $("weaponAmmo").textContent=player.ammo+" / "+inventory.ammoReserve;
  $("craftMedkit").disabled=!(inventory.cloth>=1&&inventory.alcohol>=1);
  $("craftBlade").disabled=!(inventory.metal>=1&&inventory.parts>=1);

  const notes=$("notesList");
  updateContextButtons();

  if(inventory.notes.length===0){
    notes.innerHTML="<p>Todavía no has encontrado documentos.</p>";
  }else{
    notes.innerHTML=inventory.notes.map(id=>{
      const n=noteCatalog[id];
      return '<div class="note-entry"><b>'+n.title+'</b><span>Documento recuperado</span></div>';
    }).join("");
  }
}

function openInventory() {
  if(!gameRunning)return;
  paused=true;$("inventoryPanel").classList.remove("hidden");
  if(document.pointerLockElement)document.exitPointerLock();
  updateInventoryUI();
}
function closeInventory() {
  $("inventoryPanel").classList.add("hidden");
  paused=false;
  if(!isMobile && gameRunning)requestLock();
}

function showDocument(id) {
  const n=noteCatalog[id];if(!n)return;
  $("documentTitle").textContent=n.title;
  $("documentBody").textContent=n.body;
  $("documentModal").classList.remove("hidden");
  paused=true;
  if(document.pointerLockElement)document.exitPointerLock();
}

function hideDocument() {
  $("documentModal").classList.add("hidden");
  paused=false;
  if(!isMobile&&gameRunning)requestLock();
}

function craftMedkit() {
  if(inventory.cloth<1||inventory.alcohol<1)return;
  inventory.cloth--;inventory.alcohol--;inventory.medkits++;
  updateInventoryUI();audio.pulse(360,.08,.04,"sine");haptic(25);saveProgress(false);
  toast("Fabricaste un botiquín.");
  if(currentMission===1)setMission(2);
}
function craftBlade() {
  if(inventory.metal<1||inventory.parts<1)return;
  inventory.metal--;inventory.parts--;inventory.blades++;
  player.bladeBoost=Math.max(player.bladeBoost,60);
  updateInventoryUI();audio.pulse(280,.08,.04,"triangle");
  toast("Reforzaste tu cuchilla.");
}
function useMedkit() {
  if(inventory.medkits<=0||player.hp>=100)return;
  inventory.medkits--;player.hp=Math.min(100,player.hp+55);updateInventoryUI();updateHealthUI();
  audio.pulse(470,.1,.03,"sine");haptic([20,20,20]);toast("Te curaste.");
}

function updateHealthUI() {
  $("healthText").textContent=Math.round(player.hp);
  $("healthFill").style.width=player.hp+"%";
  $("bloodVignette").style.opacity=String(clamp((45-player.hp)/65,0,.45));
}

function damagePlayer(amount,sourcePos=null) {
  if(player.invuln>0||!player.alive)return;
  player.hp=Math.max(0,player.hp-amount);updateHealthUI();
  player.invuln=.25;
  $("damageFlash").style.opacity="1";setTimeout(()=>$("damageFlash").style.opacity="0",90);
  audio.noise(.05,.08,500);haptic([35,25,20]);
  if(sourcePos){
    const dir=new THREE.Vector3().subVectors(player.pos,sourcePos).normalize();
    player.velocity.addScaledVector(dir,2.2);
  }
  if(player.hp<=0)playerDeath();
}
function playerDeath() {
  player.alive=false;paused=true;
  toast("Caíste en Santa Aurora.");
  setTimeout(()=>{
    player.hp=100;player.alive=true;paused=false;player.pos.set(0,0,53);player.velocity.set(0,0,0);player.group.position.copy(player.pos);updateHealthUI();
    if(!isMobile)requestLock();
  },2200);
}

function isInsideGrass(pos) {
  return STEALTH_ZONES.some(z=>Math.hypot(pos.x-z.x,pos.z-z.z)<z.r);
}

function collidesAt(x,z) {
  for(const c of COLLIDERS){
    if(x>c.minX&&x<c.maxX&&z>c.minZ&&z<c.maxZ)return true;
  }
  return false;
}

function updatePlayer(dt) {
  if(!gameRunning||paused||cinematicRunning||!player.alive)return;

  player.attackCooldown=Math.max(0,player.attackCooldown-dt);
  player.invuln=Math.max(0,player.invuln-dt);
  player.bladeBoost=Math.max(0,player.bladeBoost-dt);

  const forward=new THREE.Vector3(Math.sin(player.cameraYaw),0,Math.cos(player.cameraYaw));
  const right=new THREE.Vector3(forward.z,0,-forward.x);

  let move=new THREE.Vector3();
  if(input.forward)move.addScaledVector(forward,input.forward);
  if(input.right)move.addScaledVector(right,input.right);
  if(move.lengthSq()>1)move.normalize();

  player.grassHidden=isInsideGrass(player.pos) && player.crouched;
  $("stance").textContent=player.crouched?"AGACHADO":"DE PIE";

  if(player.dodging){
    player.dodgeTime-=dt;
    const speed=10.5;
    const nx=player.pos.x+player.dodgeDir.x*speed*dt;
    const nz=player.pos.z+player.dodgeDir.z*speed*dt;
    if(!collidesAt(nx,player.pos.z))player.pos.x=nx;
    if(!collidesAt(player.pos.x,nz))player.pos.z=nz;
    if(player.dodgeTime<=0)player.dodging=false;
  }else{
    const speed=player.crouched?2.15:(input.sprint?5.6:3.55);
    const desired=move.multiplyScalar(speed);
    player.velocity.x=THREE.MathUtils.damp(player.velocity.x,desired.x,12,dt);
    player.velocity.z=THREE.MathUtils.damp(player.velocity.z,desired.z,12,dt);

    const nx=player.pos.x+player.velocity.x*dt;
    const nz=player.pos.z+player.velocity.z*dt;
    if(!collidesAt(nx,player.pos.z))player.pos.x=nx;else player.velocity.x=0;
    if(!collidesAt(player.pos.x,nz))player.pos.z=nz;else player.velocity.z=0;
  }

  const speed2=Math.hypot(player.velocity.x,player.velocity.z);
  if(speed2>.25){
    const targetYaw=Math.atan2(player.velocity.x,player.velocity.z);
    player.yaw=lerpAngle(player.yaw,targetYaw,1-Math.pow(.0005,dt));
    player.group.rotation.y=player.yaw;
  }else if(player.aiming){
    player.yaw=lerpAngle(player.yaw,player.cameraYaw,1-Math.pow(.0005,dt));
    player.group.rotation.y=player.yaw;
  }

  player.group.position.lerp(player.pos,.42);
  const crouchY=player.crouched?-.36:0;
  player.group.position.y=lerp(player.group.position.y,crouchY,.18);

  const anim=player.group.userData;
  elapsed+=dt;
  const runFactor=clamp(speed2/5.6,0,1);
  const swing=Math.sin(elapsed*(4+runFactor*7))*runFactor;
  anim.hipL.rotation.x=swing*.72;
  anim.hipR.rotation.x=-swing*.72;
  anim.shoulderL.rotation.x=-swing*.52;
  anim.shoulderR.rotation.x=swing*.52;

  if(player.aiming){
    anim.weapon.rotation.x=lerp(anim.weapon.rotation.x,-.05,.18);
    anim.weapon.rotation.y=lerp(anim.weapon.rotation.y,.03,.18);
  }else{
    anim.weapon.rotation.x=lerp(anim.weapon.rotation.x,.12,.12);
  }

  currentSurface=(player.pos.x>5&&player.pos.x<31&&player.pos.z>-44&&player.pos.z<-10)?"AGUA / CONCRETO":"ASFALTO MOJADO";
  $("surfaceLabel").textContent=currentSurface;

  if(speed2>.4 && performance.now()-lastFootstep>(input.sprint?260:player.crouched?720:430)){
    lastFootstep=performance.now();
    audio.noise(.025,player.crouched?.012:.024,currentSurface.startsWith("AGUA")?900:500);
  }

  if(speed2>.7){
    const noiseRadius=player.crouched?2.8:(input.sprint?11:5);
    if(performance.now()-lastNoise>420){
      emitNoise(noiseRadius);
      lastNoise=performance.now();
    }
  }
}

function updateCamera(dt) {
  if(cinematicRunning)return;

  const aimBlend=player.aiming?1:0;
  const distance=lerp(4.8,2.25,aimBlend);
  const shoulder=lerp(.55,.82,aimBlend);
  const height=player.crouched?1.35:1.72;

  const target=player.pos.clone().add(new THREE.Vector3(0,height,0));
  const back=new THREE.Vector3(
    Math.sin(player.cameraYaw)*distance*Math.cos(player.cameraPitch),
    -Math.sin(player.cameraPitch)*distance,
    Math.cos(player.cameraYaw)*distance*Math.cos(player.cameraPitch)
  );
  const side=new THREE.Vector3(Math.cos(player.cameraYaw),0,-Math.sin(player.cameraYaw)).multiplyScalar(shoulder);
  const desired=target.clone().sub(back).add(side);

  const dir=new THREE.Vector3().subVectors(desired,target);
  const dist=dir.length();dir.normalize();
  raycaster.set(target,dir);raycaster.far=dist;
  const hits=raycaster.intersectObjects(WORLD_MESHES,false);
  let final=desired;
  if(hits.length){
    final=hits[0].point.clone().addScaledVector(dir,-.25);
  }

  camera.position.lerp(final,1-Math.pow(.00008,dt));
  camera.lookAt(target.clone().add(new THREE.Vector3(
    Math.sin(player.cameraYaw)*8*Math.cos(player.cameraPitch),
    Math.sin(-player.cameraPitch)*8,
    Math.cos(player.cameraYaw)*8*Math.cos(player.cameraPitch)
  )));
  const normalFov=settings.fov;
  camera.fov=lerp(camera.fov,player.aiming?Math.max(42,normalFov-10):normalFov,.14);
  camera.updateProjectionMatrix();

  $("crosshair").classList.toggle("hidden",!player.aiming);
}

function nearestInteractive(max=2.3) {
  let best=null,bestD=max;
  for(const item of INTERACTIVES){
    if(item.collected||item.used||!item.group.visible)continue;
    const d=item.group.position.distanceTo(player.pos);
    if(d<bestD){best=item;bestD=d}
  }
  return best;
}
function updateInteractionPrompt() {
  if(!gameRunning||paused)return;
  const item=nearestInteractive();
  if(item){
    $("interactionPrompt").classList.remove("hidden");
    $("interactionText").textContent=item.label||"Interactuar";
    $("interactionKey").textContent=isMobile?"USAR":"E";
  }else{
    $("interactionPrompt").classList.add("hidden");
  }
}

function interact() {
  if(paused||!gameRunning)return;
  const item=nearestInteractive();
  if(!item)return;

  if(item.kind==="pickup"){
    item.collected=true;item.group.visible=false;
    if(item.type==="cloth")inventory.cloth++;
    if(item.type==="alcohol")inventory.alcohol++;
    if(item.type==="metal")inventory.metal++;
    if(item.type==="parts")inventory.parts++;
    if(item.type==="ammo"){inventory.ammoReserve+=8;toast("Encontraste munición.");}
    if(item.type==="battery"){
      item.battery=true;inventory.battery=1;toast("Batería de emergencia recuperada.");
      if(currentMission===2)setMission(3);
    }
    updateInventoryUI();audio.pulse(520,.08,.03,"sine");haptic(20);saveProgress(false);
    if(currentMission===0 && inventory.cloth>=1 && inventory.alcohol>=1){
      setMission(1);toast("Tienes material suficiente para un botiquín.");
    }
  }

  if(item.kind==="document"){
    item.collected=true;
    inventory.notes.push(item.id);updateInventoryUI();
    showDocument(item.id);
  }

  if(item.kind==="mission" && item.id==="radio"){
    if(currentMission===3 && inventory.battery){
      item.used=true;item.light.intensity=2.8;inventory.battery=0;
      setMission(4);audio.pulse(230,.18,.05,"sine");audio.pulse(460,.08,.02,"square");saveProgress(false);
    }else if(currentMission<3){
      toast("La radio no tiene energía.");
    }
  }

  if(item.kind==="mission" && item.id==="exit" && currentMission===5){
    completeMission();
  }
}

function performDodge() {
  if(player.dodging||paused||!gameRunning)return;
  const f=new THREE.Vector3(Math.sin(player.cameraYaw),0,Math.cos(player.cameraYaw));
  const r=new THREE.Vector3(f.z,0,-f.x);
  const dir=new THREE.Vector3();
  if(Math.abs(input.forward)+Math.abs(input.right)>.1){
    dir.addScaledVector(f,input.forward).addScaledVector(r,input.right).normalize();
  }else dir.copy(f);
  player.dodging=true;player.dodgeTime=.36;player.dodgeDir.copy(dir);player.invuln=.28;
  audio.noise(.035,.025,600);haptic(18);
}

function setAim(v) {
  player.aiming=v;
}

function meleeAttack() {
  if(player.attackCooldown>0)return;
  player.attackCooldown=.62;
  emitNoise(8);
  audio.noise(.055,.065,700);
  haptic(25);
  let best=null,bestD=2.25;
  const f=new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw));
  for(const e of ENEMIES){
    if(!e.alive)continue;
    const delta=new THREE.Vector3().subVectors(e.pos,player.pos);
    const d=delta.length();
    if(d<bestD && delta.normalize().dot(f)>.15){best=e;bestD=d}
  }
  if(best){
    const dmg=player.bladeBoost>0?72:42;
    damageEnemy(best,dmg,player.pos);
    audio.pulse(190,.05,.05,"square");
  }
  const a=player.group.userData.shoulderR;
  a.rotation.x=-1.2;
  setTimeout(()=>{a.rotation.x=0},160);
}

function rangedAttack() {
  if(player.attackCooldown>0||player.ammo<=0)return;
  player.attackCooldown=.25;
  player.ammo--;updateInventoryUI();emitNoise(18);
  audio.noise(.08,.12,1200);audio.pulse(105,.05,.03,"sawtooth");haptic(30);

  const center=new THREE.Vector2(0,0);
  raycaster.setFromCamera(center,camera);
  raycaster.far=45;
  let target=null,targetDist=Infinity;
  for(const e of ENEMIES){
    if(!e.alive)continue;
    const to=e.pos.clone().add(new THREE.Vector3(0,1.0,0));
    const d=to.distanceTo(camera.position);
    if(d>45)continue;
    const dir=to.clone().sub(camera.position).normalize();
    const dot=dir.dot(raycaster.ray.direction);
    const threshold=settings.aimAssist?(isMobile?.972:.982):.990;
    if(dot>threshold && d<targetDist && lineOfSight(camera.position,to)){target=e;targetDist=d}
  }
  if(target)damageEnemy(target,48,camera.position);

  if(player.ammo===0 && inventory.ammoReserve>0)toast("Cargador vacío. Toca munición para recargar.");
}

function attack() {
  if(player.aiming)rangedAttack();else meleeAttack();
}

function reloadWeapon() {
  if(player.ammo>=player.magSize||inventory.ammoReserve<=0)return;
  const need=player.magSize-player.ammo;
  const take=Math.min(need,inventory.ammoReserve);
  inventory.ammoReserve-=take;player.ammo+=take;updateInventoryUI();
  audio.pulse(240,.05,.025,"square");
}

function damageEnemy(enemy,amount,origin) {
  if(!enemy.alive)return;
  enemy.hp-=amount;
  enemy.state="chase";enemy.lastSeen=performance.now()/1000;
  if(origin)enemy.investigate.copy(origin);
  if(enemy.hp<=0){
    enemy.alive=false;enemy.group.visible=false;
    audio.pulse(620,.07,.04,"sine");
    toast(enemy.type==="human"?"Amenaza neutralizada.":"La criatura cayó.");
  }else{
    const flash=new THREE.PointLight(0xe6b96c,2.5,3,2);flash.position.copy(enemy.pos).add(new THREE.Vector3(0,1,0));scene.add(flash);setTimeout(()=>scene.remove(flash),90);
  }
}

function enemyCanSeePlayer(e) {
  if(!player.alive)return false;
  const to=player.pos.clone().sub(e.pos);
  const d=to.length();
  let visibility=e.vision;
  if(player.crouched)visibility*=.72;
  if(player.grassHidden)visibility*=.38;
  if(input.sprint)visibility*=1.12;
  if(d>visibility)return false;
  const forward=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),e.group.rotation.y);
  if(to.normalize().dot(forward)<-.25 && d>4)return false;
  return lineOfSight(e.pos.clone().add(new THREE.Vector3(0,1,0)),player.pos.clone().add(new THREE.Vector3(0,1.1,0)));
}

function moveEnemyToward(e,target,speed,dt) {
  const dir=target.clone().sub(e.pos);dir.y=0;
  const d=dir.length();
  if(d<.15)return d;
  dir.normalize();
  const nx=e.pos.x+dir.x*speed*dt,nz=e.pos.z+dir.z*speed*dt;
  if(!collidesAt(nx,e.pos.z))e.pos.x=nx;
  if(!collidesAt(e.pos.x,nz))e.pos.z=nz;
  e.group.rotation.y=lerpAngle(e.group.rotation.y,Math.atan2(dir.x,dir.z),1-Math.pow(.001,dt));
  return d;
}

function updateEnemies(dt) {
  let maxSuspicion=0;
  for(const e of ENEMIES){
    if(!e.alive)continue;
    e.attackCooldown=Math.max(0,e.attackCooldown-dt);
    e.anim+=dt*(e.state==="chase"?8:4);

    const sees=enemyCanSeePlayer(e);
    const dToPlayer=e.pos.distanceTo(player.pos);

    if(sees){
      e.suspicion=Math.min(1,e.suspicion+dt*(dToPlayer<7?1.5:.8));
      e.lastSeen=performance.now()/1000;
      e.investigate.copy(player.pos);
      if(e.suspicion>.55)e.state="chase";
    }else{
      e.suspicion=Math.max(0,e.suspicion-dt*.16);
      if(e.state==="chase" && performance.now()/1000-e.lastSeen>4.5)e.state="investigate";
    }

    if(e.state==="patrol"){
      const p=e.patrol[e.patrolIndex];
      const d=moveEnemyToward(e,p,e.speed,dt);
      if(d<.6)e.patrolIndex=(e.patrolIndex+1)%e.patrol.length;
    }

    if(e.state==="investigate"){
      const d=moveEnemyToward(e,e.investigate,e.speed*1.15,dt);
      if(d<.8 && e.suspicion<.2)e.state="patrol";
    }

    if(e.state==="chase"){
      if(e.type==="human"){
        if(dToPlayer>e.attackRange*.72){
          moveEnemyToward(e,player.pos,e.runSpeed,dt);
        }else if(e.attackCooldown<=0 && sees){
          e.attackCooldown=1.2+Math.random()*.55;
          audio.noise(.06,.06,1100);
          if(Math.random()<clamp(.78-dToPlayer*.035,.28,.72)){
            damagePlayer(17,e.pos);
          }
          emitNoise(16);
        }
      }else{
        if(dToPlayer>e.attackRange){
          moveEnemyToward(e,player.pos,e.runSpeed,dt);
        }else if(e.attackCooldown<=0){
          e.attackCooldown=.95;
          damagePlayer(23,e.pos);
          audio.noise(.055,.08,420);
        }
      }
    }

    if(e.type==="human"){
      e.group.position.y=Math.sin(e.anim)*.015;
    }else{
      e.group.position.y=Math.abs(Math.sin(e.anim))* .04;
      if(e.limbs)e.limbs.forEach((l,i)=>l.rotation.x=Math.sin(e.anim+i)*.45);
    }

    maxSuspicion=Math.max(maxSuspicion,e.suspicion);
  }

  $("awareness").classList.toggle("hidden",maxSuspicion<.06);
  $("awarenessFill").style.width=Math.round(maxSuspicion*100)+"%";
  musicDanger=THREE.MathUtils.damp(musicDanger,maxSuspicion,3.2,dt);
  audio.setDanger(musicDanger);
}

function updateMission(dt) {
  if(currentMission===0){
    if(inventory.cloth>=1&&inventory.alcohol>=1)setMission(1);
  }
  if(currentMission===4 && ambushStarted){
    ambushRemaining=Math.max(0,ambushRemaining-dt);
    $("objectiveHint").textContent="Tiempo restante: "+Math.ceil(ambushRemaining)+" s";
    if(ambushRemaining<=0){
      setMission(5);toast("La señal salió al aire. La compuerta norte está abierta.");
    }
  }
  if(currentMission===5 && player.pos.z<-64 && Math.abs(player.pos.x)<9){
    completeMission();
  }
}

function completeMission() {
  if(!gameRunning)return;
  gameRunning=false;paused=true;
  $("missionComplete").classList.remove("hidden");
  if(document.pointerLockElement)document.exitPointerLock();
  audio.setDanger(0);
}

function updateWorld(dt) {
  if(waterMesh){
    waterMesh.material.opacity=.68+Math.sin(performance.now()*.0007)*.025;
    waterMesh.position.y=.045+Math.sin(performance.now()*.001)*.015;
  }
  if(dustPoints){
    dustPoints.rotation.y+=dt*.008;
    const p=dustPoints.geometry.attributes.position.array;
    for(let i=1;i<p.length;i+=3){
      p[i]+=Math.sin(elapsed*.7+i)*.0007;
    }
    dustPoints.geometry.attributes.position.needsUpdate=true;
  }
  if(rainPoints){
    const target=currentMission>=2?.42:0;
    rainPoints.material.opacity=THREE.MathUtils.damp(rainPoints.material.opacity,target,2,dt);
    const p=rainPoints.geometry.attributes.position.array;
    for(let i=1;i<p.length;i+=3){
      p[i]-=dt*(12+(i%7));
      if(p[i]<0)p[i]=18+Math.random()*5;
    }
    rainPoints.geometry.attributes.position.needsUpdate=true;
  }
  PICKUPS.forEach((it,i)=>{
    if(it.collected)return;
    it.group.position.y=it.baseY+Math.sin(elapsed*2+i)*.06;
    it.group.rotation.y+=dt*.5;
  });

  scene.fog.density=THREE.MathUtils.damp(scene.fog.density,currentMission>=2?.0105:.0075,.55,dt);
}

function startCinematic() {
  cinematicRunning=true;
  $("cinematic").classList.remove("hidden");
  $("cinematic-title").classList?.remove("hidden");
  const start=performance.now();
  const duration=7600;
  const waypoints=[
    new THREE.Vector3(0,16,72),
    new THREE.Vector3(-28,10,34),
    new THREE.Vector3(10,7,-3),
    new THREE.Vector3(20,6,-29),
    new THREE.Vector3(0,4,50)
  ];
  const subtitles=[
    [700,"Once meses después de la caída, Santa Aurora todavía respira."],
    [2900,"Las calles guardan comida, recuerdos... y gente dispuesta a matar por ambos."],
    [5200,"Alex sólo necesita una radio. Lo difícil será llegar a ella."]
  ];
  let shown=new Set();

  const tick=()=>{
    if(!cinematicRunning)return;
    const t=clamp((performance.now()-start)/duration,0,1);
    const f=t*(waypoints.length-1);
    const i=Math.min(waypoints.length-2,Math.floor(f));
    const lt=f-i;
    camera.position.lerpVectors(waypoints[i],waypoints[i+1],lt);
    camera.lookAt(new THREE.Vector3(0,1.5,15-55*t));
    subtitles.forEach((s,idx)=>{
      if(!shown.has(idx) && performance.now()-start>s[0]){
        shown.add(idx);$("subtitle").textContent=s[1];
      }
    });
    composer.render();
    if(t<1)requestAnimationFrame(tick);else endCinematic();
  };
  tick();
}

function endCinematic() {
  cinematicRunning=false;
  $("cinematic").classList.add("hidden");
  $("subtitle").textContent="";
  gameRunning=true;paused=false;
  $("hud").classList.remove("hidden");
  if(isMobile)$("touchUI").classList.remove("hidden");
  else{
    $("desktopHelp").classList.remove("hidden");
    requestLock();
  }
  setMission(0);updateInventoryUI();updateHealthUI();
  toast("Santa Aurora. Avenida Sur.");
}

function setupControls() {
  const keys={};

  const bindingActionForCode=code=>{
    for(const [action,key] of Object.entries(settings.bindings))if(key===code)return action;
    return null;
  };

  addEventListener("keydown",e=>{
    if(pendingBinding){
      e.preventDefault();
      settings.bindings[pendingBinding]=e.code;
      pendingBinding=null;
      writeSettings();
      refreshBindingUI();
      $("bindingHint").textContent="Control reasignado.";
      return;
    }

    if(e.code==="Escape"){
      e.preventDefault();
      if(!$("settingsPanel").classList.contains("hidden")){ closeSettingsPanel(); return; }
      if(!$("inventoryPanel").classList.contains("hidden")){ closeInventory(); return; }
      togglePauseMenu();
      return;
    }

    keys[e.code]=true;
    const action=bindingActionForCode(e.code);
    if(action==="crouch")player.crouched=!player.crouched;
    if(action==="dodge"){e.preventDefault();performDodge();}
    if(action==="interact")interact();
    if(action==="inventory"){e.preventDefault();openInventory();}
    if(action==="heal")useMedkit();
    if(action==="reload")reloadWeapon();
  });

  addEventListener("keyup",e=>keys[e.code]=false);

  input.updateKeyboard=()=>{
    input.forward=(keys[settings.bindings.forward]?1:0)-(keys[settings.bindings.back]?1:0);
    input.right=(keys[settings.bindings.right]?1:0)-(keys[settings.bindings.left]?1:0);
    input.sprint=!!keys[settings.bindings.sprint];
  };

  renderer.domElement.addEventListener("mousedown",e=>{
    if(!gameRunning||paused)return;
    if(e.button===0)attack();
    if(e.button===2)setAim(true);
  });
  addEventListener("mouseup",e=>{if(e.button===2)setAim(false)});
  addEventListener("contextmenu",e=>e.preventDefault());
  addEventListener("wheel",e=>{
    if(!gameRunning||paused)return;
    if(e.deltaY>0)reloadWeapon();
  },{passive:true});

  addEventListener("mousemove",e=>{
    if(document.pointerLockElement!==renderer.domElement||paused)return;
    const sens=.0025*settings.sensitivity;
    player.cameraYaw-=e.movementX*sens;
    const inv=settings.invertY?-1:1;
    player.cameraPitch=clamp(player.cameraPitch-e.movementY*.0019*settings.sensitivity*inv,-.62,.48);
  });

  document.addEventListener("pointerlockchange",()=>{
    if(!isMobile && gameRunning && !paused && !cinematicRunning && document.pointerLockElement!==renderer.domElement){
      paused=true;
      $("pauseMenu").classList.remove("hidden");
    }else if(document.pointerLockElement===renderer.domElement){
      if($("pauseMenu").classList.contains("hidden")&&$("settingsPanel").classList.contains("hidden"))paused=false;
    }
  });

  renderer.domElement.addEventListener("click",()=>{
    if(!isMobile&&gameRunning&&paused&&!cinematicRunning&&$("pauseMenu").classList.contains("hidden")&&$("settingsPanel").classList.contains("hidden")){
      requestLock();
    }
  });

  let moveId=null,lookId=null,lastLook={x:0,y:0};
  const stick=$("moveStick"),knob=$("moveKnob"),look=$("lookZone");

  stick.addEventListener("touchstart",e=>{moveId=e.changedTouches[0].identifier},{passive:false});
  stick.addEventListener("touchmove",e=>{
    e.preventDefault();
    const t=[...e.changedTouches].find(v=>v.identifier===moveId);if(!t)return;
    const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    let dx=t.clientX-cx,dy=t.clientY-cy;const max=42,len=Math.hypot(dx,dy);
    if(len>max){dx=dx/len*max;dy=dy/len*max}
    input.right=dx/max;input.forward=-dy/max;
    input.sprint=len>max*.82&&!player.crouched;
    knob.style.transform="translate("+dx+"px,"+dy+"px)";
  },{passive:false});
  const clearMove=()=>{input.right=0;input.forward=0;input.sprint=false;knob.style.transform="translate(0,0)"};
  stick.addEventListener("touchend",clearMove,{passive:false});
  stick.addEventListener("touchcancel",clearMove,{passive:false});

  look.addEventListener("touchstart",e=>{
    const t=e.changedTouches[0];lookId=t.identifier;lastLook={x:t.clientX,y:t.clientY}
  },{passive:false});
  look.addEventListener("touchmove",e=>{
    e.preventDefault();
    const t=[...e.changedTouches].find(v=>v.identifier===lookId);if(!t)return;
    const dx=t.clientX-lastLook.x,dy=t.clientY-lastLook.y;lastLook={x:t.clientX,y:t.clientY};
    const sens=.0044*settings.sensitivity,inv=settings.invertY?-1:1;
    player.cameraYaw-=dx*sens;
    player.cameraPitch=clamp(player.cameraPitch-dy*.0036*settings.sensitivity*inv,-.62,.48);
  },{passive:false});

  $("btnAttack").addEventListener("touchstart",e=>{e.preventDefault();attack()},{passive:false});
  $("btnAim").addEventListener("touchstart",e=>{e.preventDefault();setAim(true)},{passive:false});
  $("btnAim").addEventListener("touchend",e=>{e.preventDefault();setAim(false)},{passive:false});
  $("btnDodge").addEventListener("touchstart",e=>{e.preventDefault();performDodge()},{passive:false});
  $("btnInteract").addEventListener("touchstart",e=>{e.preventDefault();interact()},{passive:false});
  $("btnCrouch").addEventListener("touchstart",e=>{e.preventDefault();player.crouched=!player.crouched},{passive:false});
  $("btnInventory").addEventListener("touchstart",e=>{e.preventDefault();openInventory()},{passive:false});
  $("btnReload").addEventListener("touchstart",e=>{e.preventDefault();reloadWeapon()},{passive:false});
  $("btnHeal").addEventListener("touchstart",e=>{e.preventDefault();useMedkit()},{passive:false});
}

function updateGamepad(dt){
  const gp=navigator.getGamepads?.()[0];
  if(!gp||paused||!gameRunning)return;

  const dz=v=>Math.abs(v)<.16?0:v;
  const lx=dz(gp.axes[0]||0),ly=dz(gp.axes[1]||0);
  const rx=dz(gp.axes[2]||0),ry=dz(gp.axes[3]||0);

  if(Math.abs(lx)+Math.abs(ly)>.05){
    input.right=lx;input.forward=-ly;
    input.sprint=!!gp.buttons[10]?.pressed || Math.hypot(lx,ly)>.92;
  }

  const sens=1.9*settings.sensitivity*dt;
  player.cameraYaw-=rx*sens;
  player.cameraPitch=clamp(player.cameraPitch-ry*sens*(settings.invertY?-1:1),-.62,.48);

  const pressed=i=>!!gp.buttons[i]?.pressed;
  const edge=i=>pressed(i)&&!gamepadPrev[i];

  setAim(pressed(6));
  if(edge(7))attack();
  if(edge(0))performDodge();
  if(edge(1))player.crouched=!player.crouched;
  if(edge(2))interact();
  if(edge(3))openInventory();
  if(edge(4))useMedkit();
  if(edge(5))reloadWeapon();

  gamepadPrev=gp.buttons.map(b=>b.pressed);
}

function keyLabel(code){
  return code.replace(/^Key/,"").replace(/^Digit/,"").replace("Left","").replace("Right","").replace("Control","CTRL").replace("Shift","SHIFT").replace("Space","SPACE").toUpperCase();
}
function refreshBindingUI(){
  document.querySelectorAll(".binding").forEach(btn=>{
    const action=btn.dataset.action;
    btn.querySelector("b").textContent=keyLabel(settings.bindings[action]||"");
  });
}
function populateSettings(){
  $("settingQuality").value=settings.quality;
  $("settingFps").value=String(settings.fpsCap);
  $("settingFov").value=String(settings.fov);
  $("settingDraw").value=String(Math.round(settings.drawDistance*100));
  $("settingSensitivity").value=String(Math.round(settings.sensitivity*100));
  $("settingInvertY").checked=settings.invertY;
  $("settingAimAssist").checked=settings.aimAssist;
  $("settingAutoCamera").checked=settings.autoCamera;
  $("settingHaptics").checked=settings.haptics;
  $("settingTouchScale").value=String(Math.round(settings.touchScale*100));
  $("fovValue").textContent=settings.fov;
  $("drawValue").textContent=Math.round(settings.drawDistance*100);
  $("sensValue").textContent=Math.round(settings.sensitivity*100);
  $("touchValue").textContent=Math.round(settings.touchScale*100);
  refreshBindingUI();
}
function openSettingsPanel(){
  paused=true;
  populateSettings();
  $("settingsPanel").classList.remove("hidden");
  $("pauseMenu").classList.add("hidden");
  if(document.pointerLockElement)document.exitPointerLock();
}
function closeSettingsPanel(){
  $("settingsPanel").classList.add("hidden");
  if(gameRunning){
    paused=false;
    if(!isMobile)requestLock();
  }
}
function togglePauseMenu(force){
  if(!gameRunning)return;
  const shouldOpen=force!==undefined?force:$("pauseMenu").classList.contains("hidden");
  $("pauseMenu").classList.toggle("hidden",!shouldOpen);
  paused=shouldOpen;
  if(shouldOpen&&document.pointerLockElement)document.exitPointerLock();
  if(!shouldOpen&&!isMobile)requestLock();
}
function setupUI() {
  document.querySelectorAll(".quality").forEach(btn=>{
    btn.onclick=()=>{
      settings.quality=btn.dataset.quality==="balanced"?"medium":btn.dataset.quality==="battery"?"low":btn.dataset.quality;
      quality=settings.quality;
      document.querySelectorAll(".quality").forEach(b=>b.classList.toggle("active",b===btn));
      writeSettings();applyQuality();
    };
  });

  $("startGame").onclick=()=>{
    player.name=$("playerName").value.trim()||"Alex";
    audio.start();
    localStorage.removeItem("santaAuroraSave");
    $("mainMenu").classList.add("hidden");
    startCinematic();
  };
  $("continueGame").onclick=resumeSavedGame;
  $("openSettings").onclick=openSettingsPanel;
  $("pauseSettings").onclick=openSettingsPanel;
  $("closeSettings").onclick=closeSettingsPanel;
  $("resumeGame").onclick=()=>togglePauseMenu(false);
  $("saveGameButton").onclick=()=>saveProgress(true);
  $("returnMenu").onclick=()=>{saveProgress(false);location.reload();};

  $("skipCinematic").onclick=endCinematic;
  $("closeInventory").onclick=closeInventory;
  $("craftMedkit").onclick=craftMedkit;
  $("craftBlade").onclick=craftBlade;
  $("closeDocument").onclick=hideDocument;
  $("replayButton").onclick=()=>{localStorage.removeItem("santaAuroraSave");location.reload();};

  const bindSetting=(id,key,transform=v=>v)=>{
    const el=$(id);
    el.addEventListener("input",()=>{
      settings[key]=transform(el.type==="checkbox"?el.checked:el.value);
      quality=settings.quality;
      writeSettings();populateSettings();applyQuality();
    });
  };
  bindSetting("settingQuality","quality",String);
  bindSetting("settingFps","fpsCap",Number);
  bindSetting("settingFov","fov",Number);
  bindSetting("settingDraw","drawDistance",v=>Number(v)/100);
  bindSetting("settingSensitivity","sensitivity",v=>Number(v)/100);
  bindSetting("settingInvertY","invertY",Boolean);
  bindSetting("settingAimAssist","aimAssist",Boolean);
  bindSetting("settingAutoCamera","autoCamera",Boolean);
  bindSetting("settingHaptics","haptics",Boolean);
  bindSetting("settingTouchScale","touchScale",v=>Number(v)/100);

  document.querySelectorAll(".binding").forEach(btn=>{
    btn.onclick=()=>{
      pendingBinding=btn.dataset.action;
      $("bindingHint").textContent="Presiona una tecla para "+btn.querySelector("span").textContent.toLowerCase()+"…";
    };
  });

  populateSettings();
  updateContinueButton();
}

function applyQuality() {
  quality=settings.quality;
  const auto=isMobile?"medium":"high";
  const q=quality==="auto"?auto:quality;

  const profile={
    low:{pixel:isMobile?.68:.82,shadows:false,bloom:0,particles:.35,far:120},
    medium:{pixel:isMobile?.90:1.12,shadows:true,bloom:.045,particles:.60,far:170},
    high:{pixel:isMobile?1.12:1.45,shadows:true,bloom:.085,particles:.82,far:220},
    ultra:{pixel:isMobile?1.28:Math.min(devicePixelRatio,1.85),shadows:true,bloom:.12,particles:1,far:280}
  }[q];

  renderer.shadowMap.enabled=profile.shadows;
  bloom.strength=profile.bloom;
  dynamicPixelRatio=Math.min(devicePixelRatio,profile.pixel);
  camera.far=profile.far*settings.drawDistance;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(dynamicPixelRatio);
  renderer.setSize(innerWidth,innerHeight,false);
  composer.setSize(innerWidth,innerHeight);

  if(dustPoints)dustPoints.visible=profile.particles>.25;
  if(rainPoints)rainPoints.visible=profile.particles>.25;
  document.documentElement.style.setProperty("--touch-scale",String(settings.touchScale));
  if(isMobile)$("touchUI").style.transform="scale("+settings.touchScale+")";
}

function dynamicResolution(dt) {
  fpsAccumulator+=dt;fpsFrames++;
  if(fpsAccumulator<2)return;
  const fps=fpsFrames/fpsAccumulator;
  fpsAccumulator=0;fpsFrames=0;
  if(settings.quality!=="auto")return;

  const target=settings.fpsCap;
  const min=isMobile?.62:.72,max=isMobile?1.18:1.55;
  if(fps<target*.78 && dynamicPixelRatio>min)dynamicPixelRatio=Math.max(min,dynamicPixelRatio-.08);
  if(fps>target*.95 && dynamicPixelRatio<max)dynamicPixelRatio=Math.min(max,dynamicPixelRatio+.04);

  renderer.setPixelRatio(dynamicPixelRatio);
  renderer.setSize(innerWidth,innerHeight,false);
  composer.setSize(innerWidth,innerHeight);
}

function init() {
  createLighting();
  createWorld();
  createPlayerModel();
  spawnInitialEnemies();
  setupControls();
  setupUI();
  updateInventoryUI();
  applyQuality();
  updateContinueButton();
  populateSettings();

  bootProgress(.78,"Preparando controles táctiles y audio...");
  setTimeout(()=>bootProgress(.94,"Cargando capítulo..."),180);
  setTimeout(()=>{
    bootProgress(1,"Listo");
    setTimeout(()=>{
      $("boot").style.opacity="0";
      setTimeout(()=>{
        $("boot").remove();
        $("mainMenu").classList.remove("hidden");
      },420);
    },260);
  },420);
}

function gameLoop(now) {
  requestAnimationFrame(gameLoop);

  const interval=1000/Math.max(30,settings.fpsCap||60);
  if(now-lastRenderedAt<interval-1)return;
  lastRenderedAt=now;

  const dt=Math.min(.04,(now-lastTime)/1000);lastTime=now;
  if(input.updateKeyboard)input.updateKeyboard();
  updateGamepad(dt);

  if(!paused || cinematicRunning){
    updatePlayer(dt);
    updateCamera(dt);
    updateEnemies(dt);
    updateWorld(dt);
    updateMission(dt);
    updateInteractionPrompt();
    updateZone();
    updateContextButtons();
    dynamicResolution(dt);
    if(player.noise>0)player.noise=Math.max(0,player.noise-dt*8);

    lodClock+=dt;
    if(lodClock>.45){lodClock=0;updateLOD();}
    autosaveClock+=dt;
    if(gameRunning&&autosaveClock>12){autosaveClock=0;saveProgress(false);}
  }

  composer.render();
}

addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight,false);composer.setSize(innerWidth,innerHeight);
});

init();
requestAnimationFrame(gameLoop);


addEventListener("beforeunload",()=>{ if(gameRunning) saveProgress(false); });
