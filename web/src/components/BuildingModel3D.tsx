import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { BlockId, FloorId } from '../data/buildingExplorer';

export type BuildingModel3DProps = {
  selectedBlock: BlockId;
  selectedFloor: FloorId;
  onSelectBlock: (block: BlockId) => void;
};

/* ------------------------------------------------------------------ */
/*  Site geometry (meters, Y-up, courtyard around the origin)          */
/* ------------------------------------------------------------------ */

type FaceDir = '+x' | '-x' | '+z' | '-z';

type BlockDef = {
  id: BlockId;
  w: number; // extent along x
  d: number; // extent along z
  cx: number;
  cz: number;
  /** Outer face fronting the street (colonnade, corner loggias, top-floor setback). */
  street: FaceDir;
};

const BLOCKS: BlockDef[] = [
  { id: 'A', w: 44, d: 17, cx: 2, cz: 24, street: '+z' },
  { id: 'B', w: 26, d: 15, cx: 8, cz: -20, street: '-z' },
  { id: 'C', w: 17, d: 40, cx: -24, cz: -4, street: '-x' },
];

const GROUND_H = 4.6;
const FLOOR_H = 3.2;
const TOP_FLOOR = 10;
const SETBACK = 2.2;
const ROOF_Y = GROUND_H + (TOP_FLOOR - 1) * FLOOR_H + FLOOR_H; // 36.6 — top of floor 10

const floorY = (f: number): number => (f <= 0 ? 0 : GROUND_H + (f - 1) * FLOOR_H);
const floorHeight = (f: number): number => (f === 0 ? GROUND_H : FLOOR_H);

/** Deterministic pseudo-random in [0,1) — the model must look identical every mount. */
const hash01 = (n: number): number => {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
};

type Footprint = { w: number; d: number; cx: number; cz: number };

/** Floor-10 footprint: set back 2.2 on the street face only. */
function topFootprint(b: BlockDef): Footprint {
  let { w, d, cx, cz } = b;
  if (b.street === '+z') { d -= SETBACK; cz -= SETBACK / 2; }
  else if (b.street === '-z') { d -= SETBACK; cz += SETBACK / 2; }
  else { w -= SETBACK; cx += SETBACK / 2; }
  return { w, d, cx, cz };
}

type FaceRect = {
  plane: number;
  nx: number;
  nz: number;
  /** Rotation about Y that turns a +z-facing plane toward this face's normal. */
  ry: number;
  latCenter: number;
  latLen: number;
  axis: 'x' | 'z';
};

function faceRect(b: BlockDef, dir: FaceDir, floor: number): FaceRect {
  const fp: Footprint = floor === TOP_FLOOR ? topFootprint(b) : b;
  const { w, d, cx, cz } = fp;
  switch (dir) {
    case '+z': return { plane: cz + d / 2, nx: 0, nz: 1, ry: 0, latCenter: cx, latLen: w, axis: 'x' };
    case '-z': return { plane: cz - d / 2, nx: 0, nz: -1, ry: Math.PI, latCenter: cx, latLen: w, axis: 'x' };
    case '+x': return { plane: cx + w / 2, nx: 1, nz: 0, ry: Math.PI / 2, latCenter: cz, latLen: d, axis: 'z' };
    case '-x': return { plane: cx - w / 2, nx: -1, nz: 0, ry: -Math.PI / 2, latCenter: cz, latLen: d, axis: 'z' };
  }
}

/** World (x,z) of a point on a face at lateral coordinate `lat`, pushed `off` along the outward normal. */
function onFace(r: FaceRect, lat: number, off: number): { x: number; z: number } {
  return r.axis === 'x'
    ? { x: lat, z: r.plane + r.nz * off }
    : { x: r.plane + r.nx * off, z: lat };
}

/** Window-bay lateral offsets (relative to face center) at a ~3.6 m rhythm. */
function bayOffsets(latLen: number): number[] {
  const usable = latLen - 5.4;
  const n = Math.max(1, Math.round(usable / 3.6));
  const spacing = usable / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(-usable / 2 + spacing * (i + 0.5));
  return out;
}

/* ------------------------------------------------------------------ */
/*  Instancing helper                                                  */
/* ------------------------------------------------------------------ */

class Bag {
  items: Array<{ m: THREE.Matrix4; c: THREE.Color | null }> = [];

  add(px: number, py: number, pz: number, sx: number, sy: number, sz: number, ry = 0, c: THREE.Color | null = null): void {
    this.addTilted(px, py, pz, sx, sy, sz, 0, ry, 0, c);
  }

  addTilted(
    px: number, py: number, pz: number,
    sx: number, sy: number, sz: number,
    ex: number, ey: number, ez: number,
    c: THREE.Color | null = null,
  ): void {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(px, py, pz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(ex, ey, ez)),
      new THREE.Vector3(sx, sy, sz),
    );
    this.items.push({ m, c });
  }

  build(geom: THREE.BufferGeometry, mat: THREE.Material, shadow = false): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geom, mat, this.items.length);
    this.items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      if (it.c) mesh.setColorAt(i, it.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false; // instances span the whole site; the default sphere would cull wrongly
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    return mesh;
  }
}

const col = (hex: number, scale = 1): THREE.Color => new THREE.Color(hex).multiplyScalar(scale);

function windowColor(seed: number): THREE.Color {
  // ~45% lit: enough dark windows that the limestone facade stays readable and
  // each lit window reads individually instead of the block melting into one glow.
  if (hash01(seed) < 0.45) {
    // ~7% of lit windows flicker a cool dim TV-blue — kept BELOW the bloom
    // threshold so they read as screen-light, not lamp-light.
    if (hash01(seed + 41.77) < 0.07) {
      return col(0x9fc4d8, 0.3 + 0.12 * hash01(seed + 8.81));
    }
    // Warm lit — boosted just past the bloom threshold for a halo, not a flare.
    return col(0xf2c176, (0.62 + 0.5 * hash01(seed + 17.17)) * 1.28);
  }
  return col(0x22313a, 0.75 + 0.5 * hash01(seed + 5.31)); // unlit, cool glass
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type Api = {
  setSelection: (block: BlockId, floor: FloorId) => void;
  dispose: () => void;
};

export default function BuildingModel3D(props: BuildingModel3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const apiRef = useRef<Api | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* ---------- renderer / scene / camera ---------- */
    // No canvas MSAA: every frame goes through the composer, so anti-aliasing is
    // done by the multisampled render target below instead.
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0e1a16, 1);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    container.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.inset = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    // Contain the per-pin z-indexes CSS2DRenderer assigns so they never rise above page overlays.
    labelRenderer.domElement.style.zIndex = '1';
    // The pins duplicate the block cards' function for mouse users; the accessible control
    // is the card list, so the whole overlay stays out of the accessibility tree.
    labelRenderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(labelRenderer.domElement);

    const scene = new THREE.Scene();
    // fog starts beyond the whole complex so the facades stay crisp at the default framing
    scene.fog = new THREE.Fog(0x0e1a16, 130, 330);

    // Image-based ambience: a neutral studio environment puts a subtle sheen on
    // stone, frames and glazing so the PBR materials stop looking flat.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    // Keep the render target: the GPU texture belongs to it, so only its dispose() frees it.
    const envRT = pmrem.fromScene(roomEnv);
    pmrem.dispose();
    roomEnv.dispose();
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.22;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 900);
    camera.position.set(96, 60, 108);

    /* ---------- post-processing: RenderPass -> UnrealBloomPass -> OutputPass ---------- */
    // OutputPass applies the renderer's ACES tone mapping + sRGB conversion at the
    // end of the chain (the renderer skips both when rendering into the composer's
    // render targets), so toneMapping/toneMappingExposure above still hold.
    // A 4x multisampled HDR target so thin rails/frames/outlines stay anti-aliased
    // through the composer (resize() sizes it; samples survive setSize and clone).
    const composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }),
    );
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, container.clientWidth) / 2, Math.max(1, container.clientHeight) / 2),
      0.38, // strength — subtle and premium, never soupy
      0.28, // radius
      // Threshold is Rec.709 luminance in LINEAR space: lit windows land at ~0.46–0.83,
      // the gold band at ~0.66, lamp bulbs ~0.73; sunlit limestone peaks near 0.25.
      0.62,
    );
    composer.addPass(bloomPass);
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(4, 13, 2);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 35;
    controls.maxDistance = 175;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = 1.42;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    const stopAutoRotate = () => {
      controls.autoRotate = false;
      controls.removeEventListener('start', stopAutoRotate);
    };
    controls.addEventListener('start', stopAutoRotate);

    /* ---------- cinematic intro glide ---------- */
    const CAM_START = new THREE.Vector3(175, 118, 192);
    const CAM_END = new THREE.Vector3(96, 60, 108);
    const GLIDE_MS = 2600;
    let glideT0: number | null = null; // stamped on the first tick so a load hitch doesn't eat the glide
    const ORBIT_MAX_DISTANCE = controls.maxDistance;
    let gliding = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (gliding) {
      camera.position.copy(CAM_START);
      controls.enabled = false;
      // controls.update() clamps to maxDistance even while disabled; without this the
      // far start point is pulled in every frame and the glide never actually travels.
      controls.maxDistance = CAM_START.distanceTo(controls.target) + 1;
    }
    const endGlide = (): void => {
      if (!gliding) return;
      gliding = false;
      camera.position.copy(CAM_END);
      controls.maxDistance = ORBIT_MAX_DISTANCE;
      controls.enabled = true;
    };
    // Any press or wheel fast-forwards the glide. Capture phase so OrbitControls
    // (listening on the canvas, an inner element) sees the same event with controls
    // re-enabled — for wheel that means it zooms instead of scrolling the page.
    container.addEventListener('pointerdown', endGlide, true);
    container.addEventListener('wheel', endGlide, { capture: true, passive: true });

    const SITE_CENTER = new THREE.Vector3(0, 12, 3);
    const desiredTarget = new THREE.Vector3(4, 13, 2);

    /* ---------- sky ---------- */
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 2;
    skyCanvas.height = 512;
    const skyCtx = skyCanvas.getContext('2d');
    if (skyCtx) {
      const g = skyCtx.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0.0, '#070c10');
      g.addColorStop(0.34, '#16262e');
      g.addColorStop(0.47, '#2e4438');
      g.addColorStop(0.52, '#4a3d26'); // warm dusk band at the horizon
      g.addColorStop(0.6, '#18231d');
      g.addColorStop(1.0, '#0c100e');
      skyCtx.fillStyle = g;
      skyCtx.fillRect(0, 0, 2, 512);
    }
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
    );
    scene.add(sky);

    // Stars — deterministic scatter on the dome's upper region (elevation > ~12°,
    // so they never sit behind the buildings). Background sparkle, not a planetarium.
    const STAR_COUNT = 320;
    const STAR_R = 370;
    const starPos = new Float32Array(STAR_COUNT * 3);
    const starCol = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const az = hash01(i * 12.93 + 4.14) * Math.PI * 2;
      const el = (12 + 76 * hash01(i * 3.71 + 1.13)) * (Math.PI / 180);
      starPos[i * 3] = STAR_R * Math.cos(el) * Math.cos(az);
      starPos[i * 3 + 1] = STAR_R * Math.sin(el);
      starPos[i * 3 + 2] = STAR_R * Math.cos(el) * Math.sin(az);
      const bright = 0.45 + 0.5 * hash01(i * 7.77 + 2.2);
      const warm = 0.78 + 0.17 * hash01(i * 5.51 + 9.9); // <1 keeps the tint blue-white
      starCol[i * 3] = bright * warm;
      starCol[i * 3 + 1] = bright * (warm + 0.05);
      starCol[i * 3 + 2] = bright;
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeom.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    const stars = new THREE.Points(
      starGeom,
      new THREE.PointsMaterial({
        size: 1.1,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        fog: false,
      }),
    );
    scene.add(stars);

    /* ---------- lights ---------- */
    scene.add(new THREE.HemisphereLight(0x2e4a55, 0x232c1f, 1.25));

    const sun = new THREE.DirectionalLight(0xffb469, 1.8);
    sun.position.set(-70, 60, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    scene.add(sun.target);

    for (const [lx, ly, lz] of [[4, 1.6, 2], [-10, 1.2, 9], [14, 1.2, -7]] as const) {
      const up = new THREE.PointLight(0xc9a769, 14, 26, 2);
      up.position.set(lx, ly, lz);
      scene.add(up);
    }

    /* ---------- shared geometries & materials ---------- */
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const unitPlane = new THREE.PlaneGeometry(1, 1);
    const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14);
    const unitSphere = new THREE.SphereGeometry(1, 14, 10);
    const unitCone = new THREE.ConeGeometry(1, 1, 10);

    const matLimestone = new THREE.MeshStandardMaterial({ color: 0xd8c9a3, roughness: 0.92 });
    const matSpandrel = new THREE.MeshStandardMaterial({ color: 0xe8ddc2, roughness: 0.9 });
    const matFrame = new THREE.MeshStandardMaterial({ color: 0x3a4448, roughness: 0.7 });
    const matGlazing = new THREE.MeshStandardMaterial({ color: 0x141c20, roughness: 0.25, metalness: 0.55 });
    const matRail = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.6 });
    const matSlab = new THREE.MeshStandardMaterial({ color: 0xe3d6b4, roughness: 0.95 });
    const matColumn = new THREE.MeshStandardMaterial({ color: 0xcfc2a0, roughness: 0.85 });
    const matDarkVoid = new THREE.MeshStandardMaterial({ color: 0x10181c, roughness: 0.5 });
    const matWindow = new THREE.MeshBasicMaterial({ color: 0xffffff }); // per-instance colors carry the glow
    const matGreen = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }); // per-instance greens
    const matTrunk = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }); // per-instance browns
    const matCone = new THREE.MeshStandardMaterial({ color: 0x2e4630, roughness: 1 });
    const matBulb = new THREE.MeshBasicMaterial({ color: 0xffd9a2 });
    const matCity = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });

    /* ---------- instance bags ---------- */
    const windowBag = new Bag(); // all glowing/dark glass planes across the whole scene
    const frameBag = new Bag();
    const spandrelBag = new Bag(); // floor bands + cornices + parapets
    const slabBag = new Bag(); // balcony/terrace slabs + planter boxes
    const railBag = new Bag(); // rails + posts + lamp poles
    const columnBag = new Bag();
    const voidBag = new Bag(); // recessed-loggia shadow planes
    const greenBag = new Bag(); // every soft planting sphere on the site
    const trunkBag = new Bag();
    const coneBag = new Bag(); // loggia palm fronds
    const bulbBag = new Bag();
    const cityBag = new Bag();

    /* ---------- block massing + facades ---------- */
    type BlockMeta = { def: BlockDef; top: Footprint; center: THREE.Vector3 };
    const metaByBlock = {} as Record<BlockId, BlockMeta>;
    const hitMeshes: THREE.Mesh[] = [];
    const outlineByBlock = {} as Record<BlockId, THREE.LineSegments>;
    const pinByBlock = {} as Record<BlockId, HTMLDivElement>;

    const addMassing = (fp: Footprint, y0: number, y1: number, material: THREE.Material): THREE.Mesh => {
      const m = new THREE.Mesh(unitBox, material);
      m.scale.set(fp.w, y1 - y0, fp.d);
      m.position.set(fp.cx, (y0 + y1) / 2, fp.cz);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    };

    const DIRS: FaceDir[] = ['+x', '-x', '+z', '-z'];

    BLOCKS.forEach((b, bi) => {
      const top = topFootprint(b);
      metaByBlock[b.id] = { def: b, top, center: new THREE.Vector3(b.cx, 12, b.cz) };

      // Ground box recessed 0.8 on the street face (real colonnade depth), full mid box, set-back top box.
      const gfp: Footprint = { w: b.w, d: b.d, cx: b.cx, cz: b.cz };
      if (b.street === '+z') { gfp.d -= 0.8; gfp.cz -= 0.4; }
      else if (b.street === '-z') { gfp.d -= 0.8; gfp.cz += 0.4; }
      else { gfp.w -= 0.8; gfp.cx += 0.4; }
      addMassing(gfp, 0, GROUND_H, matLimestone);
      addMassing(b, GROUND_H, floorY(TOP_FLOOR), matLimestone);
      addMassing(top, floorY(TOP_FLOOR), ROOF_Y, matLimestone);

      // Ground-floor street glazing wall, recessed 0.8 behind the colonnade.
      const streetRect = faceRect(b, b.street, 0);
      {
        const p = onFace(streetRect, streetRect.latCenter, -0.75);
        const wall = new THREE.Mesh(unitBox, matGlazing);
        wall.scale.set(streetRect.latLen - 1.0, 4.15, 0.14);
        if (streetRect.axis === 'z') wall.rotation.y = Math.PI / 2;
        wall.position.set(p.x, 2.2, p.z);
        scene.add(wall);
        // Warm lobby glow just in front of the glazing surface (-0.68) to avoid z-fighting.
        for (const t of [-streetRect.latLen / 5, streetRect.latLen / 5]) {
          const q = onFace(streetRect, streetRect.latCenter + t, -0.6);
          windowBag.add(q.x, 2.15, q.z, 2.6, 3.5, 1, streetRect.ry, col(0xf2c176, 1.5)); // linear lum ≈ 0.87, over the bloom threshold
        }
      }

      // Colonnade along the street face — round stone columns on the original facade line.
      {
        const L = streetRect.latLen;
        const n = Math.round((L - 4) / 4);
        const spacing = (L - 4) / n;
        for (let i = 0; i <= n; i++) {
          const lat = streetRect.latCenter - (L - 4) / 2 + spacing * i;
          const p = onFace(streetRect, lat, 0);
          columnBag.add(p.x, GROUND_H / 2, p.z, 0.3, GROUND_H, 0.3);
        }
      }

      // Spandrel bands at every floor line, wrapping the block 0.06 proud.
      for (let f = 1; f <= TOP_FLOOR; f++) {
        spandrelBag.add(b.cx, floorY(f), b.cz, b.w + 0.12, 0.65, b.d + 0.12);
      }

      // Cornice slab over floor 10, projecting past the setback face, then the parapet.
      spandrelBag.add(top.cx, ROOF_Y + 0.175, top.cz, top.w + 0.9, 0.35, top.d + 0.9);
      spandrelBag.add(top.cx, ROOF_Y + 0.65, top.cz + top.d / 2 - 0.02, top.w + 0.1, 0.6, 0.24);
      spandrelBag.add(top.cx, ROOF_Y + 0.65, top.cz - top.d / 2 + 0.02, top.w + 0.1, 0.6, 0.24);
      spandrelBag.add(top.cx + top.w / 2 - 0.02, ROOF_Y + 0.65, top.cz, 0.24, 0.6, top.d + 0.1);
      spandrelBag.add(top.cx - top.w / 2 + 0.02, ROOF_Y + 0.65, top.cz, 0.24, 0.6, top.d + 0.1);

      // Rooftop planting along the parapet.
      {
        const ix = top.w / 2 - 0.55;
        const iz = top.d / 2 - 0.55;
        const edges: Array<[number, number, number, number]> = [
          [top.cx - ix, top.cz - iz, top.cx + ix, top.cz - iz],
          [top.cx - ix, top.cz + iz, top.cx + ix, top.cz + iz],
          [top.cx - ix, top.cz - iz, top.cx - ix, top.cz + iz],
          [top.cx + ix, top.cz - iz, top.cx + ix, top.cz + iz],
        ];
        edges.forEach(([x1, z1, x2, z2], ei) => {
          const len = Math.hypot(x2 - x1, z2 - z1);
          const n = Math.max(2, Math.round(len / 1.7));
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            const r = 0.2 + 0.2 * hash01(bi * 31.7 + ei * 7.9 + i * 1.3);
            greenBag.add(
              x1 + (x2 - x1) * t, ROOF_Y + 0.72, z1 + (z2 - z1) * t,
              r * 1.35, r, r * 1.35, 0,
              col(0x3e5a34, 0.85 + 0.4 * hash01(bi + ei * 3.1 + i * 0.7)),
            );
          }
        });
        // A second row along the setback terrace edge on the street side.
        const tr = faceRect(b, b.street, 0);
        const n = Math.max(2, Math.round((tr.latLen - 2) / 1.6));
        for (let i = 0; i <= n; i++) {
          const lat = tr.latCenter - (tr.latLen - 2) / 2 + ((tr.latLen - 2) / n) * i;
          const p = onFace(tr, lat, -0.55);
          const r = 0.2 + 0.18 * hash01(bi * 57.3 + i * 2.9);
          greenBag.add(p.x, floorY(TOP_FLOOR) + 0.26, p.z, r * 1.3, r, r * 1.3, 0, col(0x3e5a34, 0.9 + 0.3 * hash01(bi + i)));
        }
      }

      // ---- facade bays: windows, terraces, recessed loggias ----
      DIRS.forEach((dir, di) => {
        for (let f = 0; f <= TOP_FLOOR; f++) {
          if (f === 0 && dir === b.street) continue; // colonnade instead
          const rect = faceRect(b, dir, f);
          const offsets = bayOffsets(rect.latLen);
          const loggiaFace = f >= 1 && f <= 9 &&
            ((b.id === 'C' && dir === '-x') || (b.id === 'B' && dir === '-z'));

          offsets.forEach((rel, bay) => {
            const lat = rect.latCenter + rel;
            const seed = bi * 91.31 + di * 7.3 + f * 13.7 + bay * 1.77;

            if (loggiaFace && bay % 2 === 0) {
              // Recessed loggia: dark shadow plane + rail, occasionally a small palm.
              const pv = onFace(rect, lat, 0.05);
              voidBag.add(pv.x, floorY(f) + 1.6, pv.z, 2.7, 2.5, 1, rect.ry);
              const pr = onFace(rect, lat, 0.16);
              railBag.add(pr.x, floorY(f) + 1.15, pr.z, 2.5, 0.045, 0.045, rect.ry);
              for (const e of [-1.2, 1.2]) {
                const pp = onFace(rect, lat + e, 0.16);
                railBag.add(pp.x, floorY(f) + 0.78, pp.z, 0.05, 0.85, 0.05, rect.ry);
              }
              if (hash01(seed + 3.3) < 0.38) {
                const side = hash01(seed + 9.1) < 0.5 ? -0.8 : 0.8;
                const pt = onFace(rect, lat + side, 0.14);
                trunkBag.add(pt.x, floorY(f) + 0.72, pt.z, 0.06, 0.75, 0.06, 0, col(0x3a3227));
                coneBag.addTilted(pt.x, floorY(f) + 1.45, pt.z, 0.45, 0.95, 0.45, 0.35, rect.ry, 0.1);
                coneBag.addTilted(pt.x, floorY(f) + 1.35, pt.z, 0.42, 0.85, 0.42, -0.28, rect.ry, -0.32);
              }
              return;
            }

            // Standard bay: dark frame + glowing/dark glass. The glass must sit proud of
            // both the massing surface (offset 0) and the frame's front cap (+0.02) —
            // anything deeper is swallowed by the opaque limestone box.
            const winW = f === 0 ? 2.25 : 1.9;
            const winH = f === 0 ? 3.3 : 2.05;
            const cy = f === 0 ? 2.25 : floorY(f) + 0.85 + winH / 2;
            const pf = onFace(rect, lat, -0.11);
            frameBag.add(pf.x, cy, pf.z, winW + 0.22, winH + 0.22, 0.26, rect.ry);
            const pg = onFace(rect, lat, 0.035);
            windowBag.add(pg.x, cy, pg.z, winW, winH, 1, rect.ry, windowColor(seed));

            // Deep planted terraces on Block A's south face, floors 2–8, alternating bays.
            if (b.id === 'A' && dir === '+z' && f >= 2 && f <= 8 && bay % 2 === 1) {
              const ps = onFace(rect, lat, 1.0);
              slabBag.add(ps.x, floorY(f) - 0.09, ps.z, 3.3, 0.22, 2.3, rect.ry);
              const pb = onFace(rect, lat, 1.9);
              slabBag.add(pb.x, floorY(f) + 0.23, pb.z, 3.0, 0.42, 0.42, rect.ry);
              const nGreens = hash01(seed + 21.3) < 0.5 ? 2 : 3;
              const spots = nGreens === 2 ? [-0.6, 0.65] : [-0.95, 0, 0.95];
              spots.forEach((gx, gi) => {
                const pgr = onFace(rect, lat + gx, 1.9);
                const r = 0.24 + 0.12 * hash01(seed + gi * 4.7);
                greenBag.add(pgr.x, floorY(f) + 0.56, pgr.z, r, r * 0.85, r, 0, col(0x56704a, 0.85 + 0.4 * hash01(seed + gi)));
              });
            }
          });
        }
      });

      // ---- corner loggias at the two outer street corners, floors 1–9 ----
      {
        const sr = faceRect(b, b.street, 1);
        const corners: Array<{ px: number; pz: number; sx: number; sz: number }> = [];
        if (sr.axis === 'x') {
          // Street face runs along x; corners at both x ends.
          corners.push({ px: b.cx - b.w / 2, pz: sr.plane, sx: -1, sz: sr.nz });
          corners.push({ px: b.cx + b.w / 2, pz: sr.plane, sx: 1, sz: sr.nz });
        } else {
          corners.push({ px: sr.plane, pz: b.cz - b.d / 2, sx: sr.nx, sz: -1 });
          corners.push({ px: sr.plane, pz: b.cz + b.d / 2, sx: sr.nx, sz: 1 });
        }
        for (const c of corners) {
          // Dark glass void filling the hollowed corner, floors 1–9.
          const dv = new THREE.Mesh(unitBox, matDarkVoid);
          dv.scale.set(2.8, floorY(TOP_FLOOR) - GROUND_H, 2.8);
          dv.position.set(c.px - c.sx * 1.35, (GROUND_H + floorY(TOP_FLOOR)) / 2, c.pz - c.sz * 1.35);
          scene.add(dv);

          for (let f = 1; f <= 9; f++) {
            const slabY = floorY(f) - 0.07;
            // L-shaped wrap slab: one leg along each face.
            slabBag.add(c.px - c.sx * 0.95, slabY, c.pz + c.sz * 0.275, 3.6, 0.18, 1.15);
            slabBag.add(c.px + c.sx * 0.275, slabY, c.pz - c.sz * 0.95, 1.15, 0.18, 3.6);
            const st = floorY(f) + 0.02;
            for (const hh of [0.38, 0.68, 0.98]) {
              railBag.add(c.px - c.sx * 0.95, st + hh, c.pz + c.sz * 0.78, 3.6, 0.045, 0.045);
              railBag.add(c.px + c.sx * 0.78, st + hh, c.pz - c.sz * 0.95, 0.045, 0.045, 3.6);
            }
            railBag.add(c.px + c.sx * 0.78, st + 0.53, c.pz + c.sz * 0.78, 0.055, 1.05, 0.055);
            railBag.add(c.px - c.sx * 2.72, st + 0.53, c.pz + c.sz * 0.78, 0.055, 1.05, 0.055);
            railBag.add(c.px + c.sx * 0.78, st + 0.53, c.pz - c.sz * 2.72, 0.055, 1.05, 0.055);
          }
        }
      }

      // ---- invisible-but-raycastable hit volume ----
      const hit = new THREE.Mesh(
        unitBox,
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
      );
      hit.scale.set(b.w + 0.4, 38, b.d + 0.4);
      hit.position.set(b.cx, 19, b.cz);
      hit.userData.block = b.id;
      scene.add(hit);
      hitMeshes.push(hit);

      // ---- gold massing outline (selection / hover) ----
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w + 0.25, 36.9, b.d + 0.25)),
        new THREE.LineBasicMaterial({ color: 0xc9a769, transparent: true, opacity: 0.85 }),
      );
      outline.position.set(b.cx, 18.45, b.cz);
      outline.visible = false;
      scene.add(outline);
      outlineByBlock[b.id] = outline;

      // ---- CSS2D block pin ----
      const pin = document.createElement('div');
      pin.className = 'bm3d-pin';
      pin.dataset.block = b.id;
      pin.textContent = b.id;
      pin.style.pointerEvents = 'auto';
      pin.style.cursor = 'pointer';
      const swallow = (e: Event) => e.stopPropagation();
      pin.addEventListener('pointerdown', swallow);
      pin.addEventListener('pointerup', swallow);
      pin.addEventListener('click', () => propsRef.current.onSelectBlock(b.id));
      // Zooming shouldn't die (and scroll the page) just because the cursor crossed a pin.
      pin.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          renderer.domElement.dispatchEvent(new WheelEvent('wheel', e));
        },
        { passive: false },
      );
      const pinObj = new CSS2DObject(pin);
      pinObj.position.set(b.cx, ROOF_Y + 0.95 + 4.5, b.cz);
      scene.add(pinObj);
      pinByBlock[b.id] = pin;
    });

    /* ---------- ground, courtyard, streets ---------- */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x131a15, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const flat = (w: number, d: number, x: number, y: number, z: number, color: number, rough = 0.95): void => {
      const m = new THREE.Mesh(unitPlane, new THREE.MeshStandardMaterial({ color, roughness: rough }));
      m.rotation.x = -Math.PI / 2;
      m.scale.set(w, d, 1);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      scene.add(m);
    };

    // Courtyard paving + lawns.
    flat(36, 27, 3, 0.02, 1.5, 0xcfc7b4);
    flat(10, 7, -7, 0.05, 7, 0x42603a, 1);
    flat(9, 6.5, 13, 0.05, -3, 0x42603a, 1);

    // Raised planters (stone edge + soft ground-cover mounds).
    const planter = (x: number, z: number, w: number, d: number, seed: number): void => {
      slabBag.add(x, 0.25, z, w, 0.5, d, 0, col(0xb6a988));
      const n = Math.max(2, Math.round(Math.max(w, d) / 1.2));
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1) - 0.5;
        const gx = w > d ? x + t * (w - 1) : x + (hash01(seed + i) - 0.5) * (w - 0.9);
        const gz = w > d ? z + (hash01(seed + i + 3.1) - 0.5) * (d - 0.9) : z + t * (d - 1);
        const r = 0.32 + 0.2 * hash01(seed + i * 1.9);
        greenBag.add(gx, 0.55, gz, r * 1.25, r, r * 1.25, 0, col(0x56704a, 0.85 + 0.35 * hash01(seed + i * 0.6)));
      }
    };
    planter(-8, 14.2, 4.2, 1.5, 1.1);
    planter(-14.2, 4, 1.5, 4.5, 2.2);
    planter(10, -11.4, 4.5, 1.5, 3.3);
    planter(18, 8, 1.6, 3.6, 4.4);

    // The sculptural olive at the courtyard's heart.
    {
      const ring = new THREE.Mesh(unitCyl, matSlab);
      ring.scale.set(2.4, 0.5, 2.4);
      ring.position.set(4, 0.25, 2);
      ring.castShadow = true;
      ring.receiveShadow = true;
      scene.add(ring);
      const soil = new THREE.Mesh(unitCyl, new THREE.MeshStandardMaterial({ color: 0x2a2a1e, roughness: 1 }));
      soil.scale.set(2.25, 0.09, 2.25);
      soil.position.set(4, 0.52, 2);
      scene.add(soil);
      trunkBag.addTilted(4, 1.9, 2, 0.32, 3.0, 0.32, 0, 0, 0.11, col(0x211d18));
      trunkBag.addTilted(4.3, 1.8, 2.15, 0.22, 2.8, 0.22, -0.13, 0, -0.09, col(0x211d18, 1.1));
      greenBag.add(4, 4.35, 2, 2.2, 1.75, 2.2, 0, col(0x6b7d5a));
      greenBag.add(2.9, 3.9, 2.7, 1.6, 1.3, 1.6, 0, col(0x6b7d5a, 0.92));
      greenBag.add(5.2, 4.0, 1.3, 1.7, 1.35, 1.7, 0, col(0x6b7d5a, 1.06));
      greenBag.add(4.4, 5.0, 2.5, 1.35, 1.1, 1.35, 0, col(0x6b7d5a, 0.85));
    }

    // Courtyard glow anchors — additive light pools under the planters and the
    // olive, warm spill for the bloom pass to catch.
    {
      const glowGeom = new THREE.CircleGeometry(1, 24);
      const glowMat = new THREE.MeshBasicMaterial({
        color: col(0xc9a769, 1.3),
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pools: Array<[number, number, number]> = [
        [4, 2, 3.4], // olive
        [-8, 14.2, 2.6],
        [-14.2, 4, 2.6],
        [10, -11.4, 2.6],
        [18, 8, 2.2],
      ];
      for (const [gx, gz, gr] of pools) {
        const pool = new THREE.Mesh(glowGeom, glowMat);
        pool.rotation.x = -Math.PI / 2;
        pool.scale.set(gr, gr, 1);
        pool.position.set(gx, 0.06, gz); // a hair above the lawn planes (0.05) — coplanar would flicker
        scene.add(pool);
      }
    }

    // Streets south (z > 33) and west (x < -33): sidewalks, asphalt, trees, lamps.
    flat(92, 1.9, 2, 0.045, 33.45, 0x8d897c);
    flat(92, 7.2, 2, 0.03, 38.1, 0x3d4143, 0.98);
    flat(92, 2.0, 2, 0.045, 42.7, 0x8d897c);
    flat(1.9, 96, -33.45, 0.047, -3, 0x8d897c);
    flat(7.2, 96, -38.1, 0.032, -3, 0x3d4143, 0.98);
    flat(2.0, 96, -42.7, 0.047, -3, 0x8d897c);

    const streetTree = (x: number, z: number, seed: number): void => {
      trunkBag.add(x, 1.2, z, 0.08, 2.4, 0.08, 0, col(0x2a251c));
      const r = 0.9 + 0.5 * hash01(seed);
      greenBag.add(x, 2.55 + 0.3 * hash01(seed + 1.3), z, r * 1.15, r, r * 1.15, 0, col(0x55703f, 0.85 + 0.35 * hash01(seed + 2.6)));
    };
    for (let i = 0; i < 9; i++) streetTree(-18 + i * 7.5, 33.5, i * 1.7);
    for (let i = 0; i < 9; i++) streetTree(-33.6, -36 + i * 7.5, 40 + i * 2.3);

    const lamp = (x: number, z: number): void => {
      railBag.add(x, 2.5, z, 0.09, 5, 0.09, 0, col(0x23262b));
      bulbBag.add(x, 4.95, z, 0.16, 0.16, 0.16);
    };
    lamp(-30, 34.1);
    lamp(-4, 34.1);
    lamp(22, 34.1);
    lamp(42, 34.1);
    lamp(-34.1, -28);
    lamp(-34.1, 10);

    /* ---------- background city: a distant skyline, deep in the fog ---------- */
    // Kept on the far side of the site from the default camera (+x,+z) and at
    // 130–190 m out, so it silhouettes behind the building rather than crowding it.
    const CITY: Array<[number, number, number, number, number]> = [
      [-150, -70, 22, 38, 18],
      [-165, 10, 18, 26, 20],
      [-120, -130, 24, 46, 20],
      [-60, -160, 20, 34, 18],
      [10, -175, 26, 52, 22],
      [70, -150, 20, 30, 18],
      [-175, 60, 20, 30, 18],
      [-95, -175, 18, 40, 18],
      [120, -170, 22, 36, 20],
    ];
    CITY.forEach(([x, z, w, h, d], ci) => {
      cityBag.add(x, h / 2, z, w, h, d, 0, col(0x141c1e, 0.8 + 0.5 * hash01(ci * 3.7)));
      // A few sparse lit windows on the face turned toward the site.
      const toX = Math.abs(x) > Math.abs(z);
      const ry = toX ? (x > 0 ? -Math.PI / 2 : Math.PI / 2) : (z > 0 ? Math.PI : 0);
      const n = 4 + Math.floor(4 * hash01(ci * 9.3));
      for (let i = 0; i < n; i++) {
        const lat = (hash01(ci * 5.1 + i * 1.7) - 0.5) * ((toX ? d : w) - 2.5);
        const wy = 2 + hash01(ci * 2.9 + i * 3.3) * (h - 4);
        const wx = toX ? x - Math.sign(x) * (w / 2 + 0.05) : x + lat;
        const wz = toX ? z + lat : z - Math.sign(z) * (d / 2 + 0.05);
        const warm = hash01(ci + i * 7.7) < 0.55;
        windowBag.add(wx, wy, wz, 0.9, 1.3, 1, ry, warm ? col(0xc98b4a, 0.55) : col(0x3d5058, 0.7));
      }
    });

    // The curved blue-glass tower silhouette behind Block B.
    {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(11, 11, 80, 28, 1, true, -2.35, Math.PI * 1.15),
        new THREE.MeshStandardMaterial({ color: 0x16303c, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide }),
      );
      // Far enough back that fog softens it into context; the window strips stay
      // dim so they never read as bright stripes cutting through the frame.
      tower.position.set(58, 40, -128);
      scene.add(tower);
      for (let i = 0; i < 4; i++) {
        const a = -0.45 + (i - 1.5) * 0.3;
        windowBag.add(58 + Math.sin(a) * 11.3, 41, -128 + Math.cos(a) * 11.3, 0.35, 58, 1, a, col(0x2e5a66, 0.42));
      }
    }

    /* ---------- build all instanced meshes ---------- */
    scene.add(windowBag.build(unitPlane, matWindow));
    scene.add(frameBag.build(unitBox, matFrame));
    scene.add(spandrelBag.build(unitBox, matSpandrel, true));
    scene.add(slabBag.build(unitBox, matSlab, true));
    scene.add(railBag.build(unitBox, matRail));
    scene.add(columnBag.build(unitCyl, matColumn, true));
    scene.add(voidBag.build(unitPlane, matDarkVoid));
    scene.add(greenBag.build(unitSphere, matGreen, true));
    scene.add(trunkBag.build(unitCyl, matTrunk, true));
    scene.add(coneBag.build(unitCone, matCone));
    scene.add(bulbBag.build(unitSphere, matBulb));
    scene.add(cityBag.build(unitBox, matCity));

    /* ---------- selection band (selected floor on selected block) ---------- */
    const bandGroup = new THREE.Group();
    // ×1.6 lifts the gold over the bloom threshold so the selection band genuinely glows.
    const bandMat = new THREE.MeshBasicMaterial({ color: col(0xc9a769, 1.6), transparent: true, opacity: 0.3, depthWrite: false });
    const bandEdgeMat = new THREE.LineBasicMaterial({ color: col(0xc9a769, 1.6), transparent: true, opacity: 0.9, depthWrite: false });
    const bandMesh = new THREE.Mesh(unitBox, bandMat);
    bandMesh.renderOrder = 5;
    const bandEdges = new THREE.LineSegments(new THREE.EdgesGeometry(unitBox), bandEdgeMat);
    bandEdges.renderOrder = 6;
    bandGroup.add(bandMesh);
    bandGroup.add(bandEdges);
    bandGroup.visible = false;
    scene.add(bandGroup);

    /* ---------- selection / hover state ---------- */
    const state: { block: BlockId; floor: FloorId; hover: BlockId | null } = {
      block: propsRef.current.selectedBlock,
      floor: propsRef.current.selectedFloor,
      hover: null,
    };

    const updateOutlines = (): void => {
      for (const b of BLOCKS) {
        const line = outlineByBlock[b.id];
        const mat = line.material as THREE.LineBasicMaterial;
        const sel = state.block === b.id;
        line.visible = sel || state.hover === b.id;
        mat.opacity = sel ? 0.85 : 0.28;
      }
    };

    const updateBand = (): void => {
      const meta = metaByBlock[state.block];
      const f = state.floor;
      if (typeof f === 'number' && f >= 0 && f <= TOP_FLOOR) {
        const fp = f === TOP_FLOOR ? meta.top : meta.def;
        const h = floorHeight(f);
        bandGroup.scale.set(fp.w + 0.8, h, fp.d + 0.8);
        bandGroup.position.set(fp.cx, floorY(f) + h / 2, fp.cz);
        bandMat.opacity = 0.3;
        bandEdgeMat.opacity = 0.9;
        bandGroup.visible = true;
      } else if (f === 'roof') {
        const fp = meta.top;
        bandGroup.scale.set(fp.w + 0.8, 1.15, fp.d + 0.8);
        bandGroup.position.set(fp.cx, ROOF_Y + 0.58, fp.cz);
        bandMat.opacity = 0.22;
        bandEdgeMat.opacity = 0.5;
        bandGroup.visible = true;
      } else {
        bandGroup.visible = false; // basements
      }
    };

    const setSelection = (block: BlockId, floor: FloorId): void => {
      state.block = block;
      state.floor = floor;
      for (const b of BLOCKS) pinByBlock[b.id].classList.toggle('is-active', b.id === block);
      updateOutlines();
      updateBand();
      // glide partway toward the block so the whole complex stays framed — lerped each frame
      desiredTarget.lerpVectors(SITE_CENTER, metaByBlock[block].center, 0.45);
    };

    /* ---------- pointer interaction ---------- */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let downValid = false;

    const pick = (clientX: number, clientY: number): BlockId | null => {
      const r = container.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);
      const first = hits.length > 0 ? hits[0] : undefined;
      return first ? (first.object.userData.block as BlockId) : null;
    };

    const onPointerDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      downValid = true;
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent): void => {
      const over = pick(e.clientX, e.clientY);
      if (over !== state.hover) {
        state.hover = over;
        updateOutlines();
      }
      container.style.cursor = over ? 'pointer' : 'grab';
    };
    const onPointerUp = (e: PointerEvent): void => {
      if (!downValid || e.button !== 0) return;
      downValid = false;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) >= 6) return; // it was a drag, not a click
      const picked = pick(e.clientX, e.clientY);
      if (picked) propsRef.current.onSelectBlock(picked);
    };
    const onPointerLeave = (): void => {
      downValid = false;
      if (state.hover !== null) {
        state.hover = null;
        updateOutlines();
      }
      container.style.cursor = 'grab';
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointerleave', onPointerLeave);

    /* ---------- resize ---------- */
    const resize = (): void => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // DPR can change after mount (browser zoom, moving to a HiDPI monitor)
      const pr = Math.min(window.devicePixelRatio, 2);
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h);
      composer.setPixelRatio(pr);
      composer.setSize(w, h); // hands each pass the device-pixel size; UnrealBloomPass halves it internally
      // Budget: past ~2.2 MP of canvas, run bloom at a third instead of a half —
      // setSize halves its input, so 2/3 of the device size lands at 1/3 resolution.
      if ((w * pr * h * pr) / 1e6 > 2.2) bloomPass.setSize((w * pr * 2) / 3, (h * pr * 2) / 3);
      labelRenderer.setSize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    /* ---------- frame loop ---------- */
    let raf = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      if (gliding) {
        const now = performance.now();
        if (glideT0 === null) glideT0 = now;
        const t = Math.min((now - glideT0) / GLIDE_MS, 1);
        const s = t * t * (3 - 2 * t); // smoothstep
        camera.position.lerpVectors(CAM_START, CAM_END, s);
        if (t >= 1) endGlide();
      }
      controls.target.lerp(desiredTarget, 0.04);
      controls.update();
      composer.render();
      labelRenderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    /* ---------- teardown (StrictMode-proof) ---------- */
    let disposed = false;
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener('pointerdown', endGlide, true);
      container.removeEventListener('wheel', endGlide, { capture: true });
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointerleave', onPointerLeave);
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments || o instanceof THREE.Points) {
          if (o instanceof THREE.InstancedMesh) o.dispose();
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            const mm = m as THREE.Material & { map?: THREE.Texture | null };
            if (mm.map) mm.map.dispose();
            mm.dispose();
          }
        }
      });
      scene.clear();
      sun.dispose(); // frees the 2048² shadow render target
      envRT.dispose(); // scene.environment isn't reached by the traverse above
      bloomPass.dispose();
      outputPass.dispose();
      composer.dispose(); // frees the composer's HalfFloat read/write targets
      renderer.dispose();
      renderer.forceContextLoss(); // release the GL context immediately, not at GC time
      container.style.cursor = '';
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
    };

    apiRef.current = { setSelection, dispose };
    setSelection(propsRef.current.selectedBlock, propsRef.current.selectedFloor);

    return () => {
      apiRef.current = null;
      dispose();
    };
  }, []);

  const { selectedBlock, selectedFloor } = props;
  useEffect(() => {
    apiRef.current?.setSelection(selectedBlock, selectedFloor);
  }, [selectedBlock, selectedFloor]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Interactive 3D model of the Garden View residence"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'grab' }}
    />
  );
}
