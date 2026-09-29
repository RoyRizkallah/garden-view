/**
 * The landing page's night sequence, driven entirely by one number: the scroll progress `p` of
 * the prologue (0–1). The same `p` always produces the same frame, so scrolling back plays the
 * film in reverse.
 *
 * Geometry is the real building (/plans/massing.json — storey plates, balcony recesses, glazing
 * runs, block outlines and the ground-floor gardens measured from the as-built sheets); only the
 * storey heights are assumed, as in the 3D explorer. The towers around it are anonymous context
 * boxes for the skyline, deliberately plain.
 *
 * Timeline (see Prologue.tsx for the matching captions and film cuts):
 *   0.10–0.34  the model rises storey by storey under a high aerial camera
 *   0.34–0.55  the camera circles the blocks; each one's windows light as it is named
 *   0.55–0.66  the camera sinks into the courtyard garden (then cuts to the garden film)
 *   0.84–1.00  a wide night shot, every window lit
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

type Ring = Array<[number, number]>;
type Level = {
  floor: number;
  ring: Ring;
  band: Ring | null;
  windows: Array<[number, number, number, number, number, number]>;
  voids?: Ring[];
  terraces?: Ring[];
  gardens?: Ring[];
};
type Massing = {
  center: [number, number];
  parcel: Ring;
  open: Ring[];
  levels: Level[];
  blocks: Array<{ id: 'A' | 'B' | 'C'; ring: Ring; x: number; y: number }>;
};

export type BlockId = 'A' | 'B' | 'C';
export type PrologueScene = {
  /** Draw the frame for scroll progress `p`; `time` (seconds) adds a slow idle drift. */
  frame(p: number, time: number): void;
  resize(width: number, height: number): void;
  /** Screen position (CSS px) of a block's crown, for the HTML labels. */
  project(block: BlockId): { x: number; y: number; visible: boolean };
  dispose(): void;
};

/* ---------- storeys: the model's assumption, as in the explorer ---------- */
const GROUND_H = 4.6;
const FLOOR_H = 3.2;
const PARAPET_H = 1.05;
const TOP = 10;
const floorY = (f: number) => (f <= 0 ? 0 : GROUND_H + (f - 1) * FLOOR_H);
const floorH = (f: number) => (f === 0 ? GROUND_H : FLOOR_H);
const ROOF_Y = floorY(TOP) + floorH(TOP);

/* ---------- easing ---------- */
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash01 = (n: number) => {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
};

/* ---------- plan → world ---------- */
function ringShape(ring: Ring, cx: number, cy: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = ring.length - 1; i >= 0; i--) {
    const x = ring[i][0] - cx;
    const y = ring[i][1] - cy;
    if (i === ring.length - 1) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}
/** A ring extruded upward from y0 (plan y maps to world -z after the rotation). */
function extrude(ring: Ring, cx: number, cy: number, y0: number, h: number, holes: Ring[] = []) {
  const shape = ringShape(ring, cx, cy);
  for (const hole of holes) shape.holes.push(new THREE.Path(ringShape(hole, cx, cy).getPoints()));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}
function flat(ring: Ring, cx: number, cy: number, y: number) {
  const g = new THREE.ShapeGeometry(ringShape(ring, cx, cy));
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}
function distToRing(px: number, py: number, ring: Ring): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi;
    const dy = yj - yi;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : clamp01(((px - xi) * dx + (py - yi) * dy) / l2);
    best = Math.min(best, Math.hypot(px - (xi + t * dx), py - (yi + t * dy)));
  }
  return inside ? 0 : best;
}
function centroid(ring: Ring): [number, number] {
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  return [x / ring.length, y / ring.length];
}

/* ---------- camera keys: [p, yaw, pitch, distance, target y, target x, target z] ---------- */
type Key = [number, number, number, number, number, number, number];

function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0b1510');
  grad.addColorStop(0.42, '#152419');
  grad.addColorStop(0.62, '#243224');
  grad.addColorStop(0.74, '#4a4630'); // the last of the dusk on the horizon
  grad.addColorStop(0.8, '#2a3226');
  grad.addColorStop(1, '#101a14');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Sparse lit windows for the anonymous towers around the site. */
function towerTexture(seed: number, cols: number, rows: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = cols * 8;
  c.height = rows * 8;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0a0f0c';
  g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const h = hash01(seed * 13.1 + x * 7.7 + y * 3.3);
      if (h > 0.9) g.fillStyle = h > 0.97 ? '#f2d49a' : '#a78a55';
      else g.fillStyle = '#17201b';
      g.fillRect(x * 8 + 2, y * 8 + 2, 4, 5);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

export async function createPrologueScene(
  canvas: HTMLCanvasElement,
  options: { lowPower: boolean },
): Promise<PrologueScene> {
  const { lowPower } = options;
  const res = await fetch('/plans/massing.json');
  if (!res.ok) throw new Error(`massing ${res.status}`);
  const m = (await res.json()) as Massing;
  const [cx, cy] = m.center;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog('#17241b', 170, 520);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 1500);

  /* ---------- light: blue hour ---------- */
  scene.add(new THREE.HemisphereLight('#b3ab99', '#2a2418', 1.15));
  const dusk = new THREE.DirectionalLight('#ffd49c', 1.9);
  dusk.position.set(-120, 70, 60);
  dusk.castShadow = !lowPower;
  dusk.shadow.mapSize.set(2048, 2048);
  Object.assign(dusk.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 20, far: 320 });
  dusk.shadow.bias = -0.0005;
  scene.add(dusk);
  const fill = new THREE.DirectionalLight('#9fb7c8', 0.35);
  fill.position.set(80, 40, -60);
  scene.add(fill);

  /* ---------- ground, site and gardens ---------- */
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(600, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#141e18', roughness: 1 }),
  );
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  scene.add(ground);
  const paving = new THREE.Mesh(flat(m.parcel, cx, cy, -0.03), new THREE.MeshStandardMaterial({ color: '#27322b', roughness: 1 }));
  paving.receiveShadow = true;
  scene.add(paving);
  for (const o of m.open) {
    const mesh = new THREE.Mesh(flat(o, cx, cy, -0.02), new THREE.MeshStandardMaterial({ color: '#313b33', roughness: 1 }));
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const gardenMat = new THREE.MeshStandardMaterial({ color: '#35502f', roughness: 1, emissive: '#4f7a3c', emissiveIntensity: 0 });
  const treeMat = new THREE.MeshStandardMaterial({ color: '#3f5c37', roughness: 0.95, emissive: '#6b8f4c', emissiveIntensity: 0 });
  const treeGeo = new THREE.IcosahedronGeometry(1, 1);
  const groundLevel = m.levels.find((l) => l.floor === 0);
  const gardenCentres: THREE.Vector3[] = [];
  for (const g of groundLevel?.gardens ?? []) {
    const mesh = new THREE.Mesh(flat(g, cx, cy, 0.02), gardenMat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    const [gx, gy] = centroid(g);
    gardenCentres.push(new THREE.Vector3(gx - cx, 0, -(gy - cy)));
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Mesh(treeGeo, treeMat);
      const r = 1.1 + hash01(i * 3.1 + gx) * 1.2;
      t.scale.set(r, r * 1.2, r);
      t.position.set(gx - cx + (hash01(i * 5.7 + gy) - 0.5) * 7, r + 1.4, -(gy - cy) + (hash01(i * 2.3 + gx) - 0.5) * 6);
      t.castShadow = !lowPower;
      scene.add(t);
    }
  }
  // path lights in the gardens: tiny warm points that the bloom turns into lamps
  const lampGeo = new THREE.SphereGeometry(0.18, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: '#ffd59a', toneMapped: false });
  for (const [i, c] of gardenCentres.entries()) {
    for (let k = 0; k < 4; k++) {
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(c.x + (hash01(i * 9.1 + k) - 0.5) * 9, 0.9, c.z + (hash01(i * 4.7 + k * 2.1) - 0.5) * 7);
      scene.add(lamp);
    }
  }

  /* ---------- skyline context: plain towers, never the subject ---------- */
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + hash01(i * 1.7) * 0.3;
    const r = 215 + hash01(i * 2.9) * 120;
    const w = 14 + hash01(i * 4.1) * 16;
    const d = 14 + hash01(i * 5.3) * 14;
    const h = 40 + hash01(i * 6.7) * (i % 3 === 0 ? 130 : 60);
    const tex = towerTexture(i + 1, Math.round(w / 2.2), Math.round(h / 3.2));
    const mat = new THREE.MeshStandardMaterial({ color: '#0e1511', roughness: 0.6, metalness: 0.2, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.9, map: tex });
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    tower.position.set(Math.sin(a) * r, h / 2, Math.cos(a) * r);
    tower.rotation.y = hash01(i * 8.8) * 0.6;
    scene.add(tower);
  }

  /* ---------- the building, one group per storey so it can rise ---------- */
  const glassGeo = new THREE.PlaneGeometry(1, 1);
  const dummy = new THREE.Object3D();
  const stoneMat = (f: number) =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#e6dcc6').offsetHSL(0, 0, (hash01(f * 7.7) - 0.5) * 0.03),
      roughness: 0.9,
      // a little warm light of its own, so the shaded faces stay stone rather than going green
      emissive: '#3b3226',
      emissiveIntensity: 0.45,
    });
  const bandMat = new THREE.MeshStandardMaterial({ color: '#d2c5a6', roughness: 0.85, emissive: '#3b3226', emissiveIntensity: 0.35 });
  const terraceMat = new THREE.MeshStandardMaterial({ color: '#3d5a35', roughness: 1 });

  type Storey = { floor: number; group: THREE.Group; glass: THREE.InstancedMesh; block: Array<BlockId | null>; seed: number[] };
  const storeys: Storey[] = m.levels.map((lv) => {
    const h = floorH(lv.floor);
    const group = new THREE.Group();
    group.position.y = floorY(lv.floor);
    const stone = stoneMat(lv.floor);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !lowPower;
      mesh.receiveShadow = !lowPower;
      group.add(mesh);
    };
    const voids = lv.voids ?? [];
    if (voids.length) {
      add(extrude(lv.ring, cx, cy, 0, PARAPET_H), stone);
      add(extrude(lv.ring, cx, cy, PARAPET_H, h - PARAPET_H - 0.2, voids), stone);
    } else {
      add(extrude(lv.ring, cx, cy, 0, h - 0.2), stone);
    }
    if (lv.band) add(extrude(lv.band, cx, cy, h - 0.2, 0.24), bandMat);
    for (const t of lv.terraces ?? []) add(flat(t, cx, cy, 0.04), terraceMat);

    const runs = lv.windows.filter((r) => Math.hypot(r[2] - r[0], r[3] - r[1]) >= 0.5);
    const glass = new THREE.InstancedMesh(glassGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), runs.length);
    const winH = Math.min(2.1, h - 1.4);
    const sill = lv.floor === 0 ? 1.1 : 0.95;
    const block: Array<BlockId | null> = [];
    const seed: number[] = [];
    runs.forEach((r, i) => {
      const ax = r[0] - cx;
      const az = -(r[1] - cy);
      const bx = r[2] - cx;
      const bz = -(r[3] - cy);
      const nx = r[4];
      const nz = -r[5];
      dummy.position.set((ax + bx) / 2 + nx * 0.06, sill + winH / 2, (az + bz) / 2 + nz * 0.06);
      dummy.rotation.set(0, Math.atan2(nx, nz), 0);
      dummy.scale.set(Math.hypot(bx - ax, bz - az) - 0.08, winH, 1);
      dummy.updateMatrix();
      glass.setMatrixAt(i, dummy.matrix);
      let best = 9;
      let id: BlockId | null = null;
      for (const b of m.blocks) {
        const d = distToRing((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, b.ring);
        if (d < best) {
          best = d;
          id = b.id;
        }
      }
      block.push(id);
      seed.push(hash01(lv.floor * 91.7 + i * 12.9));
    });
    glass.setColorAt(0, new THREE.Color());
    group.add(glass);
    scene.add(group);
    return { floor: lv.floor, group, glass, block, seed };
  });

  // roof deck and parapet on the top storey's outline
  const top = m.levels.find((l) => l.floor === TOP);
  const roof = new THREE.Group();
  if (top) {
    roof.add(new THREE.Mesh(flat(top.ring, cx, cy, ROOF_Y + 0.02), new THREE.MeshStandardMaterial({ color: '#a39a86', roughness: 1 })));
    if (top.band) roof.add(new THREE.Mesh(extrude(top.band, cx, cy, ROOF_Y, 0.9, [top.ring]), bandMat));
  }
  scene.add(roof);

  /* ---------- post: bloom turns lit glass into light ---------- */
  // Bloom runs everywhere — without it lit glass reads as flat paint — but phones and weak GPUs
  // compute it at a third of the frame instead of half, and skip the shadows above.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.55, 0.78);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const bloomScale = lowPower ? 3 : 2;

  /* ---------- where the camera goes ---------- */
  const blockWorld = (id: BlockId) => {
    const b = m.blocks.find((x) => x.id === id)!;
    return new THREE.Vector3(b.x - cx, 0, -(b.y - cy));
  };
  const yawTo = (v: THREE.Vector3) => Math.atan2(v.x, v.z);
  const A = blockWorld('A');
  const B = blockWorld('B');
  const Cb = blockWorld('C');
  const court = gardenCentres.reduce((best, c) => (c.length() < best.length() ? c : best), gardenCentres[0] ?? new THREE.Vector3());
  // unwrap yaws so the orbit only ever travels one way: A → C → B
  const yA = yawTo(A);
  let yC = yawTo(Cb);
  while (yC < yA) yC += Math.PI * 2;
  let yB = yawTo(B);
  while (yB < yC) yB += Math.PI * 2;
  const KEYS: Key[] = [
    [0.08, yA - 0.7, 0.9, 260, 6, 0, 0],
    [0.3, yA - 0.35, 0.45, 150, 14, 0, 0],
    [0.38, yA, 0.3, 112, 16, A.x * 0.45, A.z * 0.45],
    [0.45, yC, 0.3, 112, 16, Cb.x * 0.45, Cb.z * 0.45],
    [0.52, yB, 0.32, 112, 16, B.x * 0.45, B.z * 0.45],
    // up and over into a site-plan view: both gardens glowing between the three blocks
    [0.6, yB + 0.6, 1.42, 175, 0, court.x * 0.5, court.z * 0.5],
    [0.67, yB + 0.8, 1.53, 140, 0, court.x * 0.5, court.z * 0.5],
    [0.8, yB + 1.6, 0.3, 185, 13, 0, 0],
    [0.9, yB + 1.8, 0.26, 165, 14, 0, 0],
    [1.0, yB + 2.0, 0.22, 150, 15, 0, 0],
  ];
  const cam = { yaw: 0, pitch: 0, dist: 0, ty: 0, tx: 0, tz: 0 };
  function cameraAt(p: number) {
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1][0]) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = smooth(a[0], b[0], p);
    cam.yaw = a[1] + (b[1] - a[1]) * t;
    cam.pitch = a[2] + (b[2] - a[2]) * t;
    cam.dist = a[3] + (b[3] - a[3]) * t;
    cam.ty = a[4] + (b[4] - a[4]) * t;
    cam.tx = a[5] + (b[5] - a[5]) * t;
    cam.tz = a[6] + (b[6] - a[6]) * t;
  }

  /* ---------- windows: recoloured only when the lighting state changes ---------- */
  const WARM = new THREE.Color('#ffd79a');
  const GOLD = new THREE.Color('#c9a769');
  const DARK = new THREE.Color('#1c2822');
  const col = new THREE.Color();
  let lastKey = '';
  function paint(lit: number, focus: BlockId | null, focusAmt: number, glow: number) {
    const key = `${lit.toFixed(3)}|${focus}|${focusAmt.toFixed(2)}|${glow.toFixed(2)}`;
    if (key === lastKey) return;
    lastKey = key;
    for (const s of storeys) {
      for (let i = 0; i < s.seed.length; i++) {
        const seed = s.seed[i];
        const isFocus = focus !== null && s.block[i] === focus;
        let on = seed < lit ? 1 : 0;
        if (isFocus) on = Math.max(on, focusAmt);
        if (on > 0) {
          col.copy(GOLD).lerp(WARM, 0.45 + seed * 0.4).multiplyScalar(0.55 + on * (isFocus ? 1.05 : 0.6 + glow * 0.5));
        } else {
          col.copy(DARK).offsetHSL(0, 0, (seed - 0.5) * 0.03);
        }
        if (focus !== null && !isFocus && on > 0) col.multiplyScalar(1 - focusAmt * 0.55);
        s.glass.setColorAt(i, col);
      }
      if (s.glass.instanceColor) s.glass.instanceColor.needsUpdate = true;
    }
  }

  let width = 1;
  let height = 1;
  const v3 = new THREE.Vector3();

  return {
    frame(p, time) {
      // the building rises: storey f grows between build = f and f + 1
      const build = smooth(0.12, 0.33, p) * (TOP + 1);
      for (const s of storeys) {
        const g = clamp01(build - s.floor);
        s.group.visible = g > 0.001;
        s.group.scale.y = Math.max(g, 0.001);
      }
      roof.visible = build >= TOP + 1 - 1e-3;

      // lighting: a first scatter of lit homes, then each block as it is named, then all of them
      const lit = 0.06 + smooth(0.28, 0.34, p) * 0.3 + smooth(0.82, 0.95, p) * 0.52;
      let focus: BlockId | null = null;
      let focusAmt = 0;
      const windows: Array<[BlockId, number, number]> = [
        ['A', 0.35, 0.42],
        ['C', 0.42, 0.49],
        ['B', 0.49, 0.56],
      ];
      for (const [id, a, b] of windows) {
        const amt = smooth(a, a + 0.02, p) * (1 - smooth(b - 0.015, b, p));
        if (amt > focusAmt) {
          focus = id;
          focusAmt = amt;
        }
      }
      paint(lit, focusAmt > 0.01 ? focus : null, focusAmt, smooth(0.84, 0.96, p));

      const garden = smooth(0.55, 0.62, p);
      gardenMat.emissiveIntensity = garden * 0.75;
      treeMat.emissiveIntensity = garden * 0.45;
      bloom.strength = 0.5 + smooth(0.82, 0.95, p) * 0.15;

      cameraAt(p);
      const yaw = cam.yaw + Math.sin(time * 0.12) * 0.025;
      const pitch = cam.pitch + Math.sin(time * 0.09) * 0.01;
      // a narrow frame (a phone held upright) has to stand further back to keep the building in it
      const fit = camera.aspect < 1 ? Math.min(1.9, 1 / Math.max(camera.aspect, 0.5)) : 1;
      const d = cam.dist * fit;
      camera.position.set(
        cam.tx + Math.sin(yaw) * Math.cos(pitch) * d,
        cam.ty + Math.sin(pitch) * d,
        cam.tz + Math.cos(yaw) * Math.cos(pitch) * d,
      );
      camera.lookAt(cam.tx, cam.ty, cam.tz);

      composer.render();
    },
    resize(w, h) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.resolution.set(w / bloomScale, h / bloomScale);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    project(block) {
      const b = blockWorld(block);
      v3.set(b.x, ROOF_Y + 4, b.z).project(camera);
      return { x: (v3.x * 0.5 + 0.5) * width, y: (-v3.y * 0.5 + 0.5) * height, visible: v3.z < 1 };
    },
    dispose() {
      composer.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    },
  };
}
