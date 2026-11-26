// Low-compute, on-demand Three.js Isometric Seattle World Model
// Visualizes where SDCI housing permits are heaviest vs. where One Seattle Plan (2026) allows more density.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  PERMIT_POINTS,
  DENSITY_ZONES,
  LINK_1_LINE,
  LINK_2_LINE,
  SEATTLE_ROADS,
  SEATTLE_PARKS,
  STORY_STOPS,
  PLACES,
  SEATTLE_GEO_POLYGONS,
  classifyStatus,
  fmtNum
} from "./seattle-3d-data.js";

const LAT0 = 47.628;
const LNG0 = -122.332;
const SCALE_X = 230;
const SCALE_Z = 340;
const INK = 0x1d2b30;

function project(lat, lng) {
  return {
    x: (lng - LNG0) * SCALE_X,
    z: (LAT0 - lat) * SCALE_Z
  };
}

// Seattle hills for tactile topographic legibility
const HILLS = [
  { lat: 47.637, lng: -122.357, r: 4.5, h: 1.2 }, // Queen Anne
  { lat: 47.625, lng: -122.316, r: 5.1, h: 1.1 }, // Capitol Hill
  { lat: 47.609, lng: -122.323, r: 3.4, h: 0.9 }, // First Hill
  { lat: 47.568, lng: -122.309, r: 5.4, h: 1.0 }, // Beacon Hill
  { lat: 47.560, lng: -122.382, r: 5.7, h: 1.1 }, // West Seattle
  { lat: 47.648, lng: -122.398, r: 4.2, h: 1.0 }, // Magnolia
  { lat: 47.680, lng: -122.355, r: 5.1, h: 0.9 }  // Phinney Ridge
];

function hillHeight(lat, lng) {
  const p = project(lat, lng);
  let h = 0.65;
  for (const hill of HILLS) {
    const c = project(hill.lat, hill.lng);
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < hill.r) {
      const t = 1 - d / hill.r;
      h += hill.h * t * t * (3 - 2 * t);
    }
  }
  return h;
}

const host = document.getElementById("atlas-canvas-host");
const labelsLayer = document.getElementById("atlas-labels");
const hoverTip = document.getElementById("hover-tip");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x558899);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(host.clientWidth, host.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

// Dual camera: Orthographic Isometric default + Perspective toggle
let aspect = host.clientWidth / Math.max(1, host.clientHeight);
const frustumSize = 46;
const orthoCam = new THREE.OrthographicCamera(
  (-frustumSize * aspect) / 2,
  (frustumSize * aspect) / 2,
  frustumSize / 2,
  -frustumSize / 2,
  -140,
  320
);
const DEFAULT_TARGET = new THREE.Vector3(-4.5, 0.5, 1.5);
const DEFAULT_OFFSET = new THREE.Vector3(44, 36, 44);
orthoCam.position.copy(DEFAULT_TARGET).add(DEFAULT_OFFSET);
orthoCam.zoom = 1.02;
orthoCam.updateProjectionMatrix();

const perspCam = new THREE.PerspectiveCamera(35, aspect, 0.5, 420);
perspCam.position.copy(orthoCam.position);

let activeCamera = orthoCam;
let controls = null;
let isInitialized = false;
let renderRequested = false;
let animateTrains = false;
let animTarget = null;
let lastFrameTime = performance.now();
const tmpVec = new THREE.Vector3();

function setupControls(cam, targetVec) {
  if (controls) controls.dispose();
  controls = new OrbitControls(cam, renderer.domElement);
  controls.enableDamping = false; // Zero idle animation loop when user stops dragging
  controls.maxPolarAngle = Math.PI * 0.45;
  controls.minPolarAngle = 0.22;
  controls.minZoom = 0.55;
  controls.maxZoom = 4.6;
  controls.target.copy(targetVec);
  controls.addEventListener("change", requestRender);
  controls.update();
}
setupControls(activeCamera, DEFAULT_TARGET);

// Soft archival daylight
scene.add(new THREE.HemisphereLight(0xfffaf0, 0x7c97a1, 0.96));
const sun = new THREE.DirectionalLight(0xfff4df, 1.02);
sun.position.set(36, 60, 28);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -48;
sun.shadow.camera.right = 48;
sun.shadow.camera.top = 56;
sun.shadow.camera.bottom = -56;
sun.shadow.bias = -0.0005;
scene.add(sun);

// Stylized painted Puget Sound water canvas texture (inspired by Isometric Seattle)
function createWaterTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#558899";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 380; i++) {
    const x = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1) * 512;
    const y = Math.abs((Math.sin(i * 78.233) * 43758.5453) % 1) * 512;
    const w = 10 + (i % 15);
    ctx.fillStyle = i % 3 === 0 ? "rgba(155, 200, 214, 0.42)" : "rgba(38, 76, 90, 0.24)";
    ctx.fillRect(x, y, w, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}

const waterPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 260),
  new THREE.MeshBasicMaterial({ map: createWaterTexture() })
);
waterPlane.rotation.x = -Math.PI / 2;
scene.add(waterPlane);

// Seattle landmass polygons + optional HB 1110 Middle Housing tint
const landMeshes = [];
function createLandPolygon(coords, depth = 0.65, color = 0xf3ecde) {
  const shape = new THREE.Shape();
  coords.forEach(([lat, lng], i) => {
    const { x, z } = project(lat, lng);
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geom.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 24), new THREE.LineBasicMaterial({ color: INK })));
  landMeshes.push({ mesh, baseColor: color });
  return mesh;
}

scene.add(createLandPolygon(SEATTLE_GEO_POLYGONS.mainland, 0.65, 0xf3ecde));
scene.add(createLandPolygon(SEATTLE_GEO_POLYGONS.westSeattle, 0.65, 0xf3ecde));
scene.add(createLandPolygon(SEATTLE_GEO_POLYGONS.mercerIsland, 0.55, 0xe9e2d2));

// Inland water bodies (Lake Union + Ship Canal, Green Lake)
function createFlatPoly(coords, color, y, strokeColor = INK) {
  const shape = new THREE.Shape();
  coords.forEach(([lat, lng], i) => {
    const { x, z } = project(lat, lng);
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color }));
  mesh.position.y = y;
  if (strokeColor !== null) {
    mesh.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geom),
        new THREE.LineBasicMaterial({ color: strokeColor, transparent: true, opacity: 0.7 })
      )
    );
  }
  return mesh;
}

scene.add(createFlatPoly(SEATTLE_GEO_POLYGONS.lakeUnion, 0x5c91a3, 0.675));
scene.add(createFlatPoly(SEATTLE_GEO_POLYGONS.greenLake, 0x5c91a3, 0.675));

// Major Seattle green parks for clear neighborhood orientation
for (const park of SEATTLE_PARKS) {
  scene.add(createFlatPoly(park.coords, 0xc5d4bd, 0.69, 0x5d745a));
}

// Sculpted architectural contour hills
const hillMeshes = [];
for (const hill of HILLS) {
  const { x, z } = project(hill.lat, hill.lng);
  for (let step = 1; step <= 3; step++) {
    const radius = hill.r * (1 - step * 0.23);
    const hStep = 0.22;
    const g = new THREE.CylinderGeometry(radius * 0.9, radius, hStep, 18);
    const baseColor = step === 3 ? 0xe7decb : 0xede5d4;
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: baseColor }));
    m.position.set(x, 0.65 + (step - 0.5) * hStep, z);
    m.receiveShadow = true;
    m.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(g, 35),
        new THREE.LineBasicMaterial({ color: 0xa19887, transparent: true, opacity: 0.42 })
      )
    );
    scene.add(m);
    hillMeshes.push({ mesh: m, baseColor });
  }
}

// Major Seattle roads & bridges (I-5, SR-99, I-90, SR-520, West Seattle Bridge, Rainier Ave)
for (const road of SEATTLE_ROADS) {
  const pts = road.coords.map(([lat, lng]) => {
    const p = project(lat, lng);
    return new THREE.Vector3(p.x, hillHeight(lat, lng) + 0.08, p.z);
  });
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 48, road.width * 0.48, 4, false),
    new THREE.MeshBasicMaterial({ color: road.color })
  );
  scene.add(tube);
}

// Elliott Bay waterfront piers for unmistakable Downtown Seattle orientation
const pierGeom = new THREE.BoxGeometry(0.95, 0.12, 0.24);
const pierMat = new THREE.MeshLambertMaterial({ color: 0xded5c4 });
[47.601, 47.604, 47.607, 47.610, 47.613].forEach((lat, idx) => {
  const p = project(lat, -122.342 - idx * 0.0022);
  const pier = new THREE.Mesh(pierGeom, pierMat);
  pier.position.set(p.x - 0.35, 0.16, p.z);
  pier.rotation.y = 0.45;
  pier.add(new THREE.LineSegments(new THREE.EdgesGeometry(pierGeom), new THREE.LineBasicMaterial({ color: INK })));
  scene.add(pier);
});

// Low-compute InstancedMesh neighborhood fabric (1 draw call instead of 280+)
let seed = 42;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

const fabricEntries = [];
for (const zone of DENSITY_ZONES) {
  const base = project(zone.lat, zone.lng);
  const count = zone.tier === "Regional Center" ? 20 : 11;
  for (let i = 0; i < count; i++) {
    const ox = (rand() - 0.5) * zone.widthDegLng * SCALE_X * 1.1;
    const oz = (rand() - 0.5) * zone.heightDegLat * SCALE_Z * 1.1;
    const bw = 0.34 + rand() * 0.42;
    const bd = 0.34 + rand() * 0.42;
    const bh = 0.3 + rand() * (zone.id === "downtown" ? 1.7 : 0.65);
    const by = hillHeight(zone.lat - oz / SCALE_Z, zone.lng + ox / SCALE_X);
    fabricEntries.push({ x: base.x + ox, y: by + bh / 2 - 0.12, z: base.z + oz, bw, bh, bd });
  }
}

const fabricInstanced = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial({ color: 0xe6decb }),
  fabricEntries.length
);
fabricInstanced.receiveShadow = true;
const dummy = new THREE.Object3D();
fabricEntries.forEach((f, idx) => {
  dummy.position.set(f.x, f.y, f.z);
  dummy.scale.set(f.bw, f.bh, f.bd);
  dummy.updateMatrix();
  fabricInstanced.setMatrixAt(idx, dummy.matrix);
});
fabricInstanced.instanceMatrix.needsUpdate = true;
scene.add(fabricInstanced);

// Iconic Seattle landmarks (Space Needle, Columbia Center, Great Wheel)
function addInkMesh(geom, color, parent, pos) {
  const m = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ color }));
  m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = true;
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 24), new THREE.LineBasicMaterial({ color: INK })));
  parent.add(m);
  return m;
}

// Space Needle
const snPos = project(47.6205, -122.3493);
const snGroup = new THREE.Group();
snGroup.position.set(snPos.x, hillHeight(47.6205, -122.3493), snPos.z);
addInkMesh(new THREE.CylinderGeometry(0.15, 0.34, 2.2, 6), 0xfaf7f2, snGroup, [0, 1.1, 0]);
addInkMesh(new THREE.CylinderGeometry(0.27, 0.14, 1.7, 6), 0xfaf7f2, snGroup, [0, 3.0, 0]);
addInkMesh(new THREE.CylinderGeometry(0.76, 0.56, 0.28, 12), 0xf2eee4, snGroup, [0, 3.95, 0]);
addInkMesh(new THREE.CylinderGeometry(0.03, 0.08, 1.0, 6), 0x1d2b30, snGroup, [0, 4.55, 0]);
scene.add(snGroup);

// Columbia Center
const ccPos = project(47.6046, -122.3306);
const ccGroup = new THREE.Group();
ccGroup.position.set(ccPos.x, hillHeight(47.6046, -122.3306), ccPos.z);
addInkMesh(new THREE.BoxGeometry(0.84, 5.3, 0.84), 0x3b4952, ccGroup, [0, 2.65, 0]);
addInkMesh(new THREE.BoxGeometry(0.54, 1.2, 0.64), 0x3b4952, ccGroup, [0.1, 5.8, 0]);
scene.add(ccGroup);

// Seattle Great Wheel (Pier 57)
const gwPos = project(47.6062, -122.3425);
const wheelRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.62, 0.06, 6, 16),
  new THREE.MeshBasicMaterial({ color: 0xfaf7f2 })
);
wheelRing.position.set(gwPos.x - 0.55, 0.9, gwPos.z);
wheelRing.rotation.y = 0.45;
wheelRing.add(new THREE.LineSegments(new THREE.EdgesGeometry(wheelRing.geometry), new THREE.LineBasicMaterial({ color: INK })));
scene.add(wheelRing);

// Link Light Rail 1 & 2 Line elevated ribbons + optional trains
const trainTracks = [];
function buildLinkLine(stations, color) {
  const pts = stations.map((s) => {
    const p = project(s.lat, s.lng);
    return new THREE.Vector3(p.x, hillHeight(s.lat, s.lng) + 0.34, p.z);
  });
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 96, 0.11, 6, false),
    new THREE.MeshLambertMaterial({ color })
  );
  scene.add(tube);

  stations.forEach((s) => {
    const p = project(s.lat, s.lng);
    const st = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.15, 10),
      new THREE.MeshBasicMaterial({ color: 0xfaf7f2 })
    );
    st.position.set(p.x, hillHeight(s.lat, s.lng) + 0.4, p.z);
    st.add(new THREE.LineSegments(new THREE.EdgesGeometry(st.geometry), new THREE.LineBasicMaterial({ color: INK })));
    scene.add(st);
  });
  return curve;
}

const curve1 = buildLinkLine(LINK_1_LINE, 0x1b4d3e);
const curve2 = buildLinkLine(LINK_2_LINE, 0x234e70);

for (let i = 0; i < 4; i++) {
  const g = new THREE.BoxGeometry(0.26, 0.22, 0.72);
  const car = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x289976 }));
  car.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: INK })));
  scene.add(car);
  const curve = i < 3 ? curve1 : curve2;
  const t = i * 0.27;
  const pos = curve.getPointAt(t);
  const next = curve.getPointAt((t + 0.01) % 1);
  car.position.copy(pos);
  car.position.y += 0.15;
  car.lookAt(next.x, next.y + 0.15, next.z);
  trainTracks.push({ mesh: car, curve, t, speed: i < 3 ? 0.018 : 0.035 });
}

// Interactive data groups
const permitsGroup = new THREE.Group();
const zoningGroup = new THREE.Group();
const infillGroup = new THREE.Group();
scene.add(permitsGroup, zoningGroup, infillGroup);

const STAGE_COLORS = {
  issued: 0x1b4d3e,
  review: 0xc46c19,
  ready: 0x234e70
};

const OPPORTUNITY_COLORS = {
  high: { fill: 0xb23225, edge: 0x8f2419 },
  medium: { fill: 0x234e70, edge: 0x1a3b54 },
  active: { fill: 0x1b4d3e, edge: 0x13382d }
};

let permitPickables = [];
const zonePickables = [];

function renderPermitTowers(points) {
  while (permitsGroup.children.length) {
    permitsGroup.remove(permitsGroup.children[0]);
  }
  permitPickables = [];

  for (const p of points) {
    const pos = project(p.lat, p.lng);
    const baseY = hillHeight(p.lat, p.lng);
    const h = Math.max(0.65, Math.min(8.6, 0.5 + Math.pow(Math.max(1, p.units), 0.65) * 0.095));
    const w = Math.max(0.32, Math.min(0.92, 0.3 + Math.sqrt(Math.max(1, p.units)) * 0.02));
    const geom = new THREE.BoxGeometry(w, h, w);
    const mat = new THREE.MeshLambertMaterial({ color: STAGE_COLORS[p.stage] || STAGE_COLORS.review });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(pos.x, baseY + h / 2, pos.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type: "permit", data: p, baseColor: STAGE_COLORS[p.stage] || STAGE_COLORS.review };
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: INK })));
    permitsGroup.add(mesh);
    permitPickables.push(mesh);
  }
}

renderPermitTowers(PERMIT_POINTS);

// One Seattle Plan 2026 density envelopes + simulated infill towers
const infillTowers = [];
for (const z of DENSITY_ZONES) {
  const pos = project(z.lat, z.lng);
  const baseY = hillHeight(z.lat, z.lng);
  const envW = z.widthDegLng * SCALE_X;
  const envD = z.heightDegLat * SCALE_Z;
  const envH = Math.max(1.4, (z.maxHeightFt / 480) * 9.8);
  const palette = OPPORTUNITY_COLORS[z.opportunityTier];

  const geom = new THREE.BoxGeometry(envW, envH, envD);
  const mat = new THREE.MeshLambertMaterial({
    color: palette.fill,
    transparent: true,
    opacity: z.opportunityTier === "high" ? 0.22 : 0.15,
    depthWrite: false
  });
  const box = new THREE.Mesh(geom, mat);
  box.position.set(pos.x, baseY + envH / 2, pos.z);
  box.userData = { type: "zone", data: z, baseColor: palette.fill };
  box.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geom),
      new THREE.LineBasicMaterial({ color: palette.edge, transparent: true, opacity: 0.78 })
    )
  );
  zoningGroup.add(box);
  zonePickables.push(box);

  // Simulated infill towers inside remaining untapped headroom
  const gapRatio = z.gapUnits / z.theoreticalCapacity;
  const towerCount = Math.min(18, Math.max(4, Math.round(z.gapUnits / 1350)));
  for (let i = 0; i < towerCount; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const ix = pos.x + ((col - 1.5) / 4.2) * envW + (rand() - 0.5) * 0.45;
    const iz = pos.z + ((row - 1.2) / 3.8) * envD + (rand() - 0.5) * 0.45;
    const targetH = Math.max(0.8, envH * (0.48 + rand() * 0.42) * Math.max(0.45, gapRatio));
    const g = new THREE.BoxGeometry(0.4, 1, 0.4);
    g.translate(0, 0.5, 0);
    const tMesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xe9b796 }));
    tMesh.position.set(ix, baseY, iz);
    tMesh.castShadow = true;
    tMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: INK })));
    infillGroup.add(tMesh);
    infillTowers.push({ mesh: tMesh, targetH });
  }
}

// Collision-aware 3D labels (purpose-driven subtitles update with lens!)
const labelItems = [
  { id: "downtown", text: "Downtown / SLU", lat: 47.618, lng: -122.337, y: 10.6, priority: 1, zoneId: "downtown" },
  { id: "u-district", text: "U-District", lat: 47.661, lng: -122.313, y: 7.7, priority: 1, zoneId: "u-district" },
  { id: "northgate", text: "Northgate", lat: 47.706, lng: -122.325, y: 6.4, priority: 1, zoneId: "northgate" },
  { id: "ballard", text: "Ballard", lat: 47.669, lng: -122.382, y: 4.5, priority: 2, zoneId: "ballard" },
  { id: "rainier", text: "Rainier Valley", lat: 47.551, lng: -122.284, y: 3.8, priority: 2, zoneId: "columbia-othello" },
  { id: "west-seattle", text: "West Seattle", lat: 47.562, lng: -122.386, y: 3.9, priority: 2, zoneId: "west-seattle-jct" },
  { id: "ne-130th", text: "NE 130th Link", lat: 47.724, lng: -122.322, y: 4.2, priority: 3, zoneId: "ne-130th" },
  { id: "cap-hill", text: "Capitol Hill", lat: 47.619, lng: -122.318, y: 8.3, priority: 3, zoneId: "first-capitol-hill" },
  { id: "mt-baker", text: "Mt Baker", lat: 47.581, lng: -122.301, y: 4.0, priority: 4, zoneId: "mt-baker" },
  { id: "space-needle", text: "Space Needle", lat: 47.6205, lng: -122.3493, y: 6.2, priority: 5, kind: "landmark" },
  { id: "puget", text: "Puget Sound", lat: 47.605, lng: -122.408, y: 0.4, priority: 1, kind: "water" },
  { id: "lake-wa", text: "Lake Washington", lat: 47.630, lng: -122.246, y: 0.4, priority: 1, kind: "water" }
].map((item) => {
  const el = document.createElement("div");
  el.className = "world-label" + (item.kind ? ` ${item.kind}` : "");
  const titleSpan = document.createElement("span");
  titleSpan.textContent = item.text;
  el.appendChild(titleSpan);
  let subSpan = null;
  if (item.zoneId) {
    subSpan = document.createElement("span");
    subSpan.className = "sub";
    el.appendChild(subSpan);
  }
  labelsLayer.appendChild(el);
  const p = project(item.lat, item.lng);
  return { ...item, el, subSpan, vec: new THREE.Vector3(p.x, item.y, p.z) };
});

const ZONE_MAP = new Map(DENSITY_ZONES.map((z) => [z.id, z]));

let currentMode = "gap";
let buildoutFraction = 0.35;
let currentSort = "gap";
const totalGapUnits = DENSITY_ZONES.reduce((sum, z) => sum + z.gapUnits, 0);

function updateLabelSubtitles() {
  for (const item of labelItems) {
    if (!item.subSpan) continue;
    const z = ZONE_MAP.get(item.zoneId);
    if (!z) continue;
    item.el.classList.toggle("mode-permits", currentMode === "permits");
    if (currentMode === "permits") {
      item.subSpan.textContent = `${fmtNum(z.activeUnits)} active units`;
    } else if (currentMode === "zoning") {
      item.subSpan.textContent = `${z.maxHeightFt} ft cap · ${z.untappedPct}% open`;
    } else {
      item.subSpan.textContent = `+${fmtNum(z.gapUnits)} room to grow`;
    }
  }
}

function applyState() {
  permitsGroup.visible = currentMode === "permits" || currentMode === "gap";
  zoningGroup.visible = currentMode === "zoning" || currentMode === "gap";
  infillGroup.visible = currentMode === "gap" && buildoutFraction > 0.01;

  // In pure "Where Housing Could Grow" mode, emphasize envelopes slightly more clearly
  for (const zMesh of zonePickables) {
    const tier = zMesh.userData.data.opportunityTier;
    zMesh.material.opacity =
      currentMode === "zoning"
        ? tier === "high" ? 0.34 : 0.22
        : tier === "high" ? 0.2 : 0.14;
  }

  document.getElementById("buildout-box").style.display = currentMode === "gap" ? "block" : "none";
  document.getElementById("active-lens-tag").textContent =
    currentMode === "permits" ? "PERMITS NOW" : currentMode === "zoning" ? "CAPACITY" : "COMPARE";

  for (const t of infillTowers) {
    t.mesh.scale.y = Math.max(0.01, t.targetH * buildoutFraction);
  }
  document.getElementById("buildout-pct").textContent = `${Math.round(buildoutFraction * 100)}%`;
  document.getElementById("buildout-units").textContent = `+${fmtNum(Math.round(totalGapUnits * buildoutFraction))} units`;

  updateLabelSubtitles();
  requestRender();
}

// HB 1110 Middle Housing floor toggle
document.getElementById("toggle-hb1110").addEventListener("change", (e) => {
  const on = e.target.checked;
  for (const entry of landMeshes) {
    entry.mesh.material.color.setHex(on ? 0xf2dfc8 : entry.baseColor);
  }
  for (const entry of hillMeshes) {
    entry.mesh.material.color.setHex(on ? 0xecd5b9 : entry.baseColor);
  }
  requestRender();
});

// Lens buttons
document.querySelectorAll("[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-mode]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    currentMode = btn.dataset.mode;
    applyState();
  });
});

document.getElementById("buildout-slider").addEventListener("input", (e) => {
  buildoutFraction = Number(e.target.value) / 100;
  applyState();
});

// Guided Story Tour
const storyTabs = document.getElementById("story-tabs");
const storyCallout = document.getElementById("story-callout");

function flyToLatLng(lat, lng, zoom = 2.0) {
  const c = project(lat, lng);
  const dist = zoom > 1.5 ? 24 : 44;
  animTarget = {
    target: new THREE.Vector3(c.x - (zoom > 1.5 ? 1.5 : 4.5), 1.0, c.z),
    pos: new THREE.Vector3(c.x + dist, dist * 0.82, c.z + dist),
    zoom
  };
  requestRender();
}

STORY_STOPS.forEach((stop) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "story-btn";
  b.textContent = stop.badge;
  b.addEventListener("click", () => {
    storyTabs.querySelectorAll(".story-btn").forEach((el) => el.classList.remove("is-active"));
    b.classList.add("is-active");
    storyCallout.innerHTML = `<strong>${stop.title}</strong>${stop.summary}`;

    currentMode = stop.mode;
    if (typeof stop.buildout === "number") {
      buildoutFraction = stop.buildout;
      document.getElementById("buildout-slider").value = String(Math.round(stop.buildout * 100));
    }
    document.querySelectorAll("[data-mode]").forEach((m) => {
      m.classList.toggle("is-active", m.dataset.mode === currentMode);
    });
    applyState();
    flyToLatLng(stop.lat, stop.lng, stop.zoom);
  });
  storyTabs.appendChild(b);
});

// Top Seattle Centers Ranked List
const hubList = document.getElementById("hub-list");
function renderHubList() {
  const sorted = [...DENSITY_ZONES]
    .sort((a, b) => (currentSort === "gap" ? b.gapUnits - a.gapUnits : b.activeUnits - a.activeUnits))
    .slice(0, 6);

  hubList.innerHTML = "";
  for (const z of sorted) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hub-item";
    const metricText =
      currentSort === "gap"
        ? `+${fmtNum(z.gapUnits)} room`
        : `${fmtNum(z.activeUnits)} active`;
    btn.innerHTML = `
      <div class="hub-top">
        <span class="hub-name">${z.name}</span>
        <span class="hub-metric ${currentSort === "gap" ? "is-gap" : "is-active"}">${metricText}</span>
      </div>
      <div class="hub-bar-track"><div class="hub-bar-fill" style="width:${z.utilizationPct}%"></div></div>
      <div class="hub-meta">
        <span>${z.maxHeightFt} ft cap (${z.tier})</span>
        <span>${z.utilizationPct}% permitted</span>
      </div>
    `;
    btn.addEventListener("click", () => {
      flyToLatLng(z.lat, z.lng, 2.25);
      showDetail({ type: "zone", data: z });
      history.replaceState(null, "", `#${z.id}`);
    });
    hubList.appendChild(btn);
  }
}

document.querySelectorAll("[data-sort]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-sort]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    currentSort = btn.dataset.sort;
    renderHubList();
  });
});
renderHubList();

// Places bar + deep link hash
const placesBar = document.getElementById("places-bar");
PLACES.forEach((place, idx) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "place-btn" + (idx === 0 ? " is-active" : "");
  b.textContent = place.label;
  b.addEventListener("click", () => {
    placesBar.querySelectorAll(".place-btn").forEach((el) => el.classList.remove("is-active"));
    b.classList.add("is-active");
    if (place.id === "overview") {
      resetView();
    } else {
      flyToLatLng(place.lat, place.lng, place.zoom);
    }
    history.replaceState(null, "", `#${place.id}`);
  });
  placesBar.appendChild(b);
});

function resetView() {
  animTarget = {
    target: DEFAULT_TARGET.clone(),
    pos: DEFAULT_TARGET.clone().add(DEFAULT_OFFSET),
    zoom: 1.02
  };
  requestRender();
}
document.getElementById("reset-view-btn").addEventListener("click", resetView);

// Camera projection toggle
document.querySelectorAll("[data-cam]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-cam]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const prevPos = activeCamera.position.clone();
    const prevTarget = controls.target.clone();
    activeCamera = btn.dataset.cam === "iso" ? orthoCam : perspCam;
    activeCamera.position.copy(prevPos);
    setupControls(activeCamera, prevTarget);
    requestRender();
  });
});

// Rail collapse/reopen (great for mobile or full-canvas inspection)
const railEl = document.getElementById("atlas-rail");
const toggleRailBtn = document.getElementById("toggle-rail-btn");
const reopenRailBtn = document.getElementById("reopen-rail-btn");

function setRailCollapsed(collapsed) {
  railEl.classList.toggle("is-collapsed", collapsed);
  toggleRailBtn.textContent = collapsed ? "Show Guide" : "Hide Guide";
  reopenRailBtn.hidden = !collapsed;
  requestRender();
}
toggleRailBtn.addEventListener("click", () => setRailCollapsed(!railEl.classList.contains("is-collapsed")));
reopenRailBtn.addEventListener("click", () => setRailCollapsed(false));

// Start collapsed on narrow mobile screens so user sees the 3D map immediately
if (window.innerWidth <= 680) {
  setRailCollapsed(true);
}

// Optional Link train animation toggle (OFF by default -> 0% idle GPU!)
const perfStatus = document.getElementById("perf-status");
document.getElementById("toggle-trains").addEventListener("change", (e) => {
  animateTrains = e.target.checked;
  perfStatus.textContent = animateTrains ? "Live train motion" : "0% idle GPU";
  if (animateTrains) requestRender();
});

// Optional Live SDCI API Loader (direct CORS call to data.seattle.gov)
const liveBtn = document.getElementById("load-live-permits-btn");
const liveNote = document.getElementById("live-sync-note");
liveBtn.addEventListener("click", async () => {
  liveBtn.disabled = true;
  liveBtn.textContent = "Loading live SDCI permits...";
  try {
    const query = new URLSearchParams({
      $select: "permitnum,latitude,longitude,housingunitsadded,statuscurrent,permitclass,originalzip,originaladdress1,description,link",
      $where: "housingunitsadded > 8 AND latitude IS NOT NULL AND longitude IS NOT NULL AND statuscurrent IN('Issued','Phase Issued','Reviews In Process','Corrections Required','Additional Info Requested','Ready for Issuance')",
      $order: "housingunitsadded DESC",
      $limit: "350"
    });
    const res = await fetch(`https://data.seattle.gov/resource/76t5-zqzr.json?${query.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const mapped = rows
      .filter((r) => Number(r.latitude) > 47.48 && Number(r.latitude) < 47.75 && Number(r.longitude) < -122.22 && Number(r.longitude) > -122.45)
      .map((r) => ({
        permitnum: r.permitnum,
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        units: Number(r.housingunitsadded || 0),
        status: r.statuscurrent || "Active",
        stage: classifyStatus(r.statuscurrent || ""),
        permitclass: r.permitclass || "Multifamily",
        zip: r.originalzip || "Seattle",
        address: r.originaladdress1 || "Seattle site",
        description: r.description || `${r.permitclass || "Housing"} permit (${r.housingunitsadded} units).`,
        link: r.link?.url || `https://services.seattle.gov/portal/customize/LinkToRecord.aspx?altId=${encodeURIComponent(r.permitnum)}`
      }));
    if (mapped.length > 50) {
      renderPermitTowers(mapped);
      liveNote.textContent = `Loaded ${fmtNum(mapped.length)} live active housing sites directly from data.seattle.gov.`;
      liveBtn.textContent = `Live SDCI Loaded (${mapped.length} sites)`;
      requestRender();
    } else {
      throw new Error("Insufficient geo rows returned");
    }
  } catch (err) {
    liveNote.textContent = `Live API unavailable right now (${err.message}); showing verified 120-site baseline.`;
    liveBtn.textContent = "Retry Live SDCI Load";
    liveBtn.disabled = false;
  }
});

// Raycasting: click to inspect + hover tooltip
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPt = null;
let hoveredMesh = null;

function pickAtEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, activeCamera);

  const targets = [];
  if (permitsGroup.visible) targets.push(...permitPickables);
  if (zoningGroup.visible) targets.push(...zonePickables);
  const hits = raycaster.intersectObjects(targets, false);
  if (!hits.length) return null;
  const permitHit = hits.find((h) => h.object.userData.type === "permit");
  return permitHit || hits[0];
}

renderer.domElement.addEventListener("pointermove", (e) => {
  if (e.buttons > 0) {
    hoverTip.hidden = true;
    return;
  }
  const hit = pickAtEvent(e);
  if (!hit) {
    renderer.domElement.style.cursor = "grab";
    hoverTip.hidden = true;
    if (hoveredMesh) {
      hoveredMesh = null;
    }
    return;
  }
  renderer.domElement.style.cursor = "pointer";
  hoveredMesh = hit.object;
  const { type, data } = hit.object.userData;
  if (type === "permit") {
    hoverTip.innerHTML = `<strong>${data.permitnum}</strong> (${fmtNum(data.units)} units)<br>${data.status} · Click to inspect`;
  } else {
    hoverTip.innerHTML = `<strong>${data.name}</strong> (${data.maxHeightFt} ft cap)<br>+${fmtNum(data.gapUnits)} untapped units · Click details`;
  }
  hoverTip.style.left = `${Math.min(window.innerWidth - 250, e.clientX + 14)}px`;
  hoverTip.style.top = `${Math.max(60, e.clientY - 12)}px`;
  hoverTip.hidden = false;
});

renderer.domElement.addEventListener("pointerleave", () => {
  hoverTip.hidden = true;
});

renderer.domElement.addEventListener("pointerdown", (e) => {
  downPt = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downPt || Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y) > 5) return;
  const hit = pickAtEvent(e);
  if (hit) showDetail(hit.object.userData);
});

const detailCard = document.getElementById("detail-card");
document.getElementById("detail-close").addEventListener("click", () => {
  detailCard.hidden = true;
});

function showDetail({ type, data }) {
  const titleEl = document.getElementById("detail-title");
  const gridEl = document.getElementById("detail-grid");
  const descEl = document.getElementById("detail-desc");
  const linkEl = document.getElementById("detail-link");

  if (type === "permit") {
    titleEl.textContent = `${data.permitnum} (${fmtNum(data.units)} units)`;
    gridEl.innerHTML = `
      <div><span>Status</span><strong>${data.status}</strong></div>
      <div><span>Class</span><strong>${data.permitclass}</strong></div>
      <div><span>Address</span><strong>${data.address}</strong></div>
      <div><span>ZIP Code</span><strong>${data.zip}</strong></div>
    `;
    descEl.textContent = data.description;
    linkEl.href = data.link;
    linkEl.style.display = "inline";
  } else {
    titleEl.textContent = data.name;
    gridEl.innerHTML = `
      <div><span>2026 Designation</span><strong>${data.tier}</strong></div>
      <div><span>Max Height / FAR</span><strong>${data.maxHeightFt} ft (${data.maxFar})</strong></div>
      <div><span>Active Pipeline</span><strong>${fmtNum(data.activeUnits)} units</strong></div>
      <div><span>Untapped Headroom</span><strong>+${fmtNum(data.gapUnits)} (${data.untappedPct}%)</strong></div>
    `;
    descEl.textContent = `${data.zoningCode}. Transit: ${data.transitNote}. ${data.highlight}`;
    linkEl.style.display = "none";
  }
  detailCard.hidden = false;
}

// Keyboard shortcuts (inspired by Isometric Seattle)
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "r" || e.key === "R") resetView();
  if (e.key === "Escape") detailCard.hidden = true;
  if (e.key === "1") document.querySelector('[data-mode="gap"]').click();
  if (e.key === "2") document.querySelector('[data-mode="permits"]').click();
  if (e.key === "3") document.querySelector('[data-mode="zoning"]').click();
});

// Resize handling
window.addEventListener("resize", () => {
  const w = host.clientWidth;
  const h = Math.max(1, host.clientHeight);
  aspect = w / h;
  orthoCam.left = (-frustumSize * aspect) / 2;
  orthoCam.right = (frustumSize * aspect) / 2;
  orthoCam.top = frustumSize / 2;
  orthoCam.bottom = -frustumSize / 2;
  orthoCam.updateProjectionMatrix();
  perspCam.aspect = aspect;
  perspCam.updateProjectionMatrix();
  renderer.setSize(w, h);
  requestRender();
});

// Collision-aware label projection (keeps canvas legible and clear of the left rail)
function updateLabels() {
  const w = host.clientWidth;
  const h = host.clientHeight;
  const railVisible = !railEl.classList.contains("is-collapsed") && window.innerWidth > 680;
  const leftEdge = railVisible ? 356 : 16;
  const rightEdge = window.innerWidth > 960 ? w - 258 : w - 16;
  const placedRects = [];

  const sortedLabels = [...labelItems].sort((a, b) => a.priority - b.priority);
  for (const item of sortedLabels) {
    tmpVec.copy(item.vec).project(activeCamera);
    const sx = (tmpVec.x * 0.5 + 0.5) * w;
    const sy = (-tmpVec.y * 0.5 + 0.5) * h;

    const bw = item.kind === "water" ? 115 : 172;
    const bh = item.subSpan ? 42 : 24;
    const inBounds =
      tmpVec.z < 1 &&
      sx - bw / 2 >= leftEdge &&
      sx + bw / 2 <= rightEdge &&
      sy - bh / 2 >= 18 &&
      sy + bh / 2 <= h - 74;

    if (!inBounds) {
      item.el.style.display = "none";
      continue;
    }

    const box = { l: sx - bw / 2, r: sx + bw / 2, t: sy - bh / 2, b: sy + bh / 2 };

    const collides =
      item.kind !== "water" &&
      placedRects.some((r) => !(box.r < r.l || box.l > r.r || box.b < r.t || box.t > r.b));

    if (collides) {
      item.el.style.display = "none";
      continue;
    }

    if (item.kind !== "water") placedRects.push(box);
    item.el.style.display = "block";
    item.el.style.left = `${sx}px`;
    item.el.style.top = `${sy}px`;
  }
}

// On-demand render scheduler (0% GPU when idle!)
function renderFrame(now) {
  renderRequested = false;
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  let keepGoing = false;

  if (animTarget) {
    controls.target.lerp(animTarget.target, 0.14);
    activeCamera.position.lerp(animTarget.pos, 0.14);
    if (activeCamera === orthoCam) {
      orthoCam.zoom += (animTarget.zoom - orthoCam.zoom) * 0.14;
      orthoCam.updateProjectionMatrix();
    }
    if (
      controls.target.distanceTo(animTarget.target) < 0.08 &&
      activeCamera.position.distanceTo(animTarget.pos) < 0.16 &&
      (activeCamera !== orthoCam || Math.abs(orthoCam.zoom - animTarget.zoom) < 0.02)
    ) {
      animTarget = null;
    } else {
      keepGoing = true;
    }
  }

  if (animateTrains) {
    for (const tr of trainTracks) {
      tr.t = (tr.t + dt * tr.speed) % 1;
      const pos = tr.curve.getPointAt(tr.t);
      const next = tr.curve.getPointAt((tr.t + 0.01) % 1);
      tr.mesh.position.copy(pos);
      tr.mesh.position.y += 0.15;
      tr.mesh.lookAt(next.x, next.y + 0.15, next.z);
    }
    keepGoing = true;
  }

  controls.update();
  renderer.render(scene, activeCamera);
  updateLabels();

  if (keepGoing) {
    requestRender();
  }
}

function requestRender() {
  if (!isInitialized) return;
  if (!renderRequested) {
    renderRequested = true;
    lastFrameTime = performance.now();
    requestAnimationFrame(renderFrame);
  }
}

// Handle deep-link URL hash on initial load (e.g. #northgate, #u-district)
isInitialized = true;
const initHash = location.hash.replace("#", "");
if (initHash) {
  const matchedZone = ZONE_MAP.get(initHash);
  const matchedPlace = PLACES.find((p) => p.id === initHash);
  if (matchedZone) {
    flyToLatLng(matchedZone.lat, matchedZone.lng, 2.25);
    showDetail({ type: "zone", data: matchedZone });
  } else if (matchedPlace && matchedPlace.id !== "overview") {
    flyToLatLng(matchedPlace.lat, matchedPlace.lng, matchedPlace.zoom);
  }
}

applyState();
