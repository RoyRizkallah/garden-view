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
import { compileInBackground } from './compileInBackground';

export type BuildingModel3DProps = {
  selectedBlock: BlockId;
  selectedFloor: FloorId;
  onSelectBlock: (block: BlockId) => void;
};

/* ------------------------------------------------------------------ */
/*  The building, as built                                             */
/* ------------------------------------------------------------------ */

/**
 * None of this massing is modelled by hand. `scripts/build_massing.py` reads the same
 * as-built sheets the floor plans come from and writes one small file holding each
 * level's real floor plate, the glazing that sits on its outer wall, the level 9
 * terraces, the ground-floor gardens, the open ground the blocks wrap around, and the
 * three blocks' own outlines (the union of the residences the sheets place in each).
 *
 * Storey heights are the one thing the drawings cannot give — all fourteen are plan
 * views — so the floor-to-floor figures below remain the model's stated assumption.
 * Every outline, window and terrace on screen is measured.
 */

/** Plan metres, exactly as drawn: x right, y up on the sheet. */
type Ring = Array<[number, number]>;

type MassingLevel = {
  id: string;
  floor: number;
  ring: Ring;
  /** The slab edge, standing a little proud of the wall it caps. */
  band: Ring | null;
  areaSqm: number;
  /** Facade glazing, [x1, y1, x2, y2, nx, ny] — already on the wall line, normal pointing out. */
  windows: Array<[number, number, number, number, number, number]>;
  /** Balcony and terrace recesses cut into the storey above parapet height. */
  voids?: Ring[];
  terraces?: Ring[];
  gardens?: Ring[];
};

type Massing = {
  bbox: [number, number, number, number];
  center: [number, number];
  parcel: Ring;
  open: Ring[];
  levels: MassingLevel[];
  blocks: Array<{ id: BlockId; ring: Ring; x: number; y: number; areaSqm: number }>;
};

const MASSING_URL = '/plans/massing.json';

/** Floor-to-floor heights: the model's assumption, not a measurement (see above). */
/** Balcony parapets, and the height the storey stays solid to. */
const PARAPET_H = 1.05;
const GROUND_H = 4.6;
const FLOOR_H = 3.2;
const TOP_FLOOR = 10;
const ROOF_Y = GROUND_H + (TOP_FLOOR - 1) * FLOOR_H + FLOOR_H; // 36.6 — top of floor 10

const floorY = (f: number): number => (f <= 0 ? 0 : GROUND_H + (f - 1) * FLOOR_H);
const floorHeight = (f: number): number => (f === 0 ? GROUND_H : FLOOR_H);

/** Deterministic pseudo-random in [0,1) — the model must look identical every mount. */
const hash01 = (n: number): number => {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
};

/**
 * Sheet coordinates to world: the plan's y runs up the page, the scene's z runs toward
 * the viewer, and the building is centred on the origin. A THREE.Shape built from
 * (x, y) is extruded along +z and then laid down with rotateX(-90°), which maps the
 * shape's y onto world -z — so the shape is built in plan coordinates directly and the
 * ring is reversed to keep the faces pointing out of the building after that flip.
 */
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

/** A ring extruded from y0 upward, standing in the world; `holes` are voids through it. */
function extrudeRing(ring: Ring, cx: number, cy: number, y0: number, height: number, holes?: Ring[]): THREE.BufferGeometry {
  const shape = ringShape(ring, cx, cy);
  for (const hole of holes ?? []) {
    shape.holes.push(new THREE.Path(ringShape(hole, cx, cy).getPoints()));
  }
  const geom = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, y0, 0);
  return geom;
}

/** Flat cap of a ring, lying at height y. */
function flatRing(ring: Ring, cx: number, cy: number, y: number): THREE.BufferGeometry {
  const geom = new THREE.ShapeGeometry(ringShape(ring, cx, cy));
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, y, 0);
  return geom;
}

/** Distance from a plan point to a ring — 0 anywhere inside it. */
function distToRing(px: number, py: number, ring: Ring): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi;
    const dy = yj - yi;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - xi) * dx + (py - yi) * dy) / len2));
    best = Math.min(best, Math.hypot(px - (xi + t * dx), py - (yi + t * dy)));
  }
  return inside ? 0 : best;
}

function ringCentroid(ring: Ring): [number, number] {
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  return [x / ring.length, y / ring.length];
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
    // Bloom on a full-bleed canvas at DPR 2 is the single biggest GPU cost, and past
    // ~1200 CSS px wide the extra device pixels are not visible at viewing distance —
    // so the ratio is capped at 1.5 there, 2 on narrower (denser-looking) canvases.
    const pixelRatioFor = (cssWidth: number): number =>
      Math.min(window.devicePixelRatio, cssWidth > 1200 ? 1.5 : 2);
    // No canvas MSAA: every frame goes through the composer, so anti-aliasing is
    // done by the multisampled render target below instead.
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(pixelRatioFor(container.clientWidth));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Nothing that casts a shadow moves once the building is up (selection only recolours glass and
    // shows outlines), so the soft shadow map is drawn when the model changes, not on every frame.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    // The per-program compile check blocks the main thread on the GPU driver (seconds on some
    // machines) and only produces developer diagnostics.
    renderer.debug.checkShaderErrors = import.meta.env.DEV;
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
    scene.environmentIntensity = 0.3;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 900);
    camera.position.set(62, 44, 72);

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
    controls.target.set(0, 14, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 32;
    controls.maxDistance = 165;
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
    // the moment anyone touches the model, it is theirs
    controls.addEventListener('start', () => {
      flyTo = null;
    });

    /* ---------- cinematic intro glide ---------- */
    const CAM_START = new THREE.Vector3(128, 92, 148);
    const CAM_END = new THREE.Vector3(62, 44, 72);
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
      invalidate();
    };
    // Any press or wheel fast-forwards the glide. Capture phase so OrbitControls
    // (listening on the canvas, an inner element) sees the same event with controls
    // re-enabled — for wheel that means it zooms instead of scrolling the page.
    container.addEventListener('pointerdown', endGlide, true);
    container.addEventListener('wheel', endGlide, { capture: true, passive: true });

    const SITE_CENTER = new THREE.Vector3(0, 14, 0);
    // Where the camera is easing to after a block was picked: there is no point lighting
    // Block A if the viewer is looking at the other side of the building.
    let flyTo: THREE.Vector3 | null = null;
    const desiredTarget = new THREE.Vector3(0, 14, 0);

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
    // Low ambient: the storeys need a lit side and a shadow side to read as a building
    // rather than a white model.
    scene.add(new THREE.HemisphereLight(0x33586a, 0x1d2519, 0.55));
    // A dim cool fill opposite the sun so the shadow side keeps its detail.
    const fill = new THREE.DirectionalLight(0x7fa8c0, 0.5);
    fill.position.set(70, 34, -46);
    scene.add(fill);

    const sun = new THREE.DirectionalLight(0xffd9b4, 2.4);
    sun.position.set(-70, 60, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -48;
    sun.shadow.camera.right = 48;
    sun.shadow.camera.top = 48;
    sun.shadow.camera.bottom = -48;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    scene.add(sun.target);

    // Uplights standing clear of the real footprint, washing the stone from the grounds.
    for (const [lx, ly, lz] of [[0, 1.6, 30], [-28, 1.2, 6], [28, 1.2, -8]] as const) {
      const up = new THREE.PointLight(0xc9a769, 14, 30, 2);
      up.position.set(lx, ly, lz);
      scene.add(up);
    }

    /* ---------- shared geometries & materials ---------- */
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const unitPlane = new THREE.PlaneGeometry(1, 1);
    const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14);
    const unitSphere = new THREE.SphereGeometry(1, 14, 10);
    const unitCone = new THREE.ConeGeometry(1, 1, 10);

    /**
     * Procedural surfaces. Flat colour reads as a study model however good the massing
     * is, so the stone gets a grain and a faint course line, and the glass gets the
     * gradient every window has — sky at the top, room at the bottom.
     */
    const makeTexture = (w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (ctx) paint(ctx);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };

    const stoneTex = makeTexture(256, 256, (ctx) => {
      ctx.fillStyle = '#c6bda8';
      ctx.fillRect(0, 0, 256, 256);
      // grain
      for (let i = 0; i < 5200; i++) {
        const v = hash01(i * 1.7);
        const g = Math.round(150 + 70 * hash01(i * 3.1));
        ctx.fillStyle = `rgba(${g + 14},${g + 8},${Math.round(g * 0.93)},${0.04 + 0.12 * v})`;
        const r = 0.6 + 2.6 * hash01(i * 5.3);
        ctx.fillRect(hash01(i * 7.9) * 256, hash01(i * 11.3) * 256, r, r * 0.8);
      }
      // no drawn courses: the extruded walls take their UVs from the plan, so any line
      // drawn here would run down the facade instead of across it
    });
    stoneTex.wrapS = THREE.RepeatWrapping;
    stoneTex.wrapT = THREE.RepeatWrapping;
    stoneTex.repeat.set(0.42, 0.42);

    const glassTex = makeTexture(4, 64, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, '#ffffff'); // the sky the pane catches
      g.addColorStop(0.34, '#cfd8dc');
      g.addColorStop(0.62, '#8b9aa2');
      g.addColorStop(1, '#6d7d86');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4, 64);
    });

    const matLimestone = new THREE.MeshStandardMaterial({ color: 0xcdc6b4, roughness: 0.94, map: stoneTex });
    const matSpandrel = new THREE.MeshStandardMaterial({ color: 0xbfb8a5, roughness: 0.9, map: stoneTex });
    const matFrame = new THREE.MeshStandardMaterial({ color: 0x8e9088, roughness: 0.55, metalness: 0.25 });
    const matRail = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.6 });
    const matSlab = new THREE.MeshStandardMaterial({ color: 0xcdc0a0, roughness: 0.95 });
    const matColumn = new THREE.MeshStandardMaterial({ color: 0xcfc2a0, roughness: 0.85 });
    const matDarkVoid = new THREE.MeshStandardMaterial({ color: 0x10181c, roughness: 0.5 });
    const matWindow = new THREE.MeshBasicMaterial({ color: 0xffffff, map: glassTex }); // per-instance colors carry the glow
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

    /* ---------- the building, from the as-built sheets ---------- */
    // Nothing here is invented: the plates, the glazing, the terraces and the block
    // outlines are all read from massing.json, which is generated from the same
    // fourteen sheets the floor plans are drawn from.
    type BlockMeta = { id: BlockId; ring: Ring; center: THREE.Vector3 };
    const metaByBlock = {} as Record<BlockId, BlockMeta>;
    const hitMeshes: THREE.Mesh[] = [];
    const outlineByBlock = {} as Record<BlockId, THREE.LineSegments>;
    const pinByBlock = {} as Record<BlockId, HTMLDivElement>;
    const buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    let originX = 0;
    let originY = 0;
    const levelByFloor = new Map<number, MassingLevel>();

    // The facade glass is one instanced mesh; selection repaints it rather than
    // rebuilding anything, so highlighting a block or a floor costs one buffer upload.
    let facadeMesh: THREE.InstancedMesh | null = null;
    const winOf: Array<{ block: BlockId | null; floor: number; seed: number }> = [];

    /**
     * A window's colour. Dusk lighting: a little under half the flats are lit, a few of
     * those read as TV-blue. `emphasis` is what makes a selection legible — the chosen
     * block keeps its warmth while the rest of the complex falls back to cool glass, and
     * the chosen floor's band of windows lifts to gold.
     */
    const facadeColor = (seed: number, emphasis: 'normal' | 'dim' | 'floor'): THREE.Color => {
      if (emphasis === 'floor') return col(0xc9a769, 1.15 + 0.45 * hash01(seed + 3.3));
      const lit = hash01(seed) < 0.45;
      if (emphasis === 'dim') {
        // still reads as glass, but it stops competing with the selected block
        return lit ? col(0x53656b, 0.8 + 0.3 * hash01(seed + 1.9)) : col(0x40525a, 0.85);
      }
      if (!lit) return col(0x4a5f68, 0.85 + 0.4 * hash01(seed + 5.31));
      if (hash01(seed + 41.77) < 0.07) return col(0x9fc4d8, 0.3 + 0.12 * hash01(seed + 8.81));
      return col(0xf2c176, (0.62 + 0.5 * hash01(seed + 17.17)) * 1.28);
    };

    /** Repaint the facade for the current block/floor selection. */
    const paintFacade = (): void => {
      if (!facadeMesh) return;
      const selBlock = state.block;
      const selFloor = state.floor;
      const floorLit = typeof selFloor === 'number' && selFloor >= 0 && selFloor <= TOP_FLOOR;
      for (let i = 0; i < winOf.length; i++) {
        const w = winOf[i];
        const mine = w.block === selBlock;
        const emphasis = mine && floorLit && w.floor === selFloor ? 'floor' : mine ? 'normal' : 'dim';
        facadeMesh.setColorAt(i, facadeColor(w.seed, emphasis));
      }
      if (facadeMesh.instanceColor) facadeMesh.instanceColor.needsUpdate = true;
    };

    const buildComplex = (m: Massing): void => {
      originX = m.center[0];
      originY = m.center[1];
      const toWorldX = (x: number): number => x - originX;
      const toWorldZ = (y: number): number => -(y - originY);

      // Bags for the building's own instances — the site and city bags are already
      // sealed into their meshes by the time the sheets land.
      const glassBag = new Bag();
      const revealBag = new Bag();
      const mullionBag = new Bag();
      const leafBag = new Bag();
      const trunkBag2 = new Bag();

      for (const lv of m.levels) {
        levelByFloor.set(lv.floor, lv);
        const y0 = floorY(lv.floor);
        const h = floorHeight(lv.floor);

        // A touch of tone per storey: eleven identical greys read as a study model.
        const stone = matLimestone.clone();
        stone.map = stoneTex;
        stone.color.multiplyScalar(0.94 + 0.1 * hash01(lv.floor * 6.7 + 2.1));
        // The storey. Where the sheet draws balconies the floor plate still runs out to
        // the parapet, so the mass is solid to parapet height and recessed above it —
        // which is exactly what a balcony looks like from the street.
        const voids = lv.voids ?? [];
        if (voids.length > 0) {
          const base = new THREE.Mesh(extrudeRing(lv.ring, originX, originY, y0, PARAPET_H), stone);
          base.castShadow = true;
          base.receiveShadow = true;
          buildingGroup.add(base);
          const upper = new THREE.Mesh(
            extrudeRing(lv.ring, originX, originY, y0 + PARAPET_H, h - PARAPET_H, voids),
            stone,
          );
          upper.castShadow = true;
          upper.receiveShadow = true;
          buildingGroup.add(upper);
          // the soffit over each recess, so the opening reads as depth rather than a hole
          for (const v of voids) {
            const soffit = new THREE.Mesh(flatRing(v, originX, originY, y0 + h - 0.01), matSpandrel);
            soffit.receiveShadow = true;
            buildingGroup.add(soffit);
          }
        } else {
          const mass = new THREE.Mesh(extrudeRing(lv.ring, originX, originY, y0, h), stone);
          mass.castShadow = true;
          mass.receiveShadow = true;
          buildingGroup.add(mass);
        }

        // the slab edge that caps it — the shadow line that reads as a storey
        if (lv.band) {
          const band = new THREE.Mesh(extrudeRing(lv.band, originX, originY, y0 + h - 0.2, 0.24), matSpandrel);
          band.castShadow = true;
          band.receiveShadow = true;
          buildingGroup.add(band);
        }

        // measured glazing: one run of glass per line the sheet draws on the outer wall
        const winH = Math.min(2.15, h - 1.35);
        const sill = y0 + (lv.floor === 0 ? 1.05 : 0.95);
            for (let wi = 0; wi < lv.windows.length; wi++) {
          const run = lv.windows[wi];
          const ax = toWorldX(run[0]);
          const az = toWorldZ(run[1]);
          const bx = toWorldX(run[2]);
          const bz = toWorldZ(run[3]);
          const len = Math.hypot(bx - ax, bz - az);
          if (len < 0.5) continue;
          const nx = run[4];
          const nz = -run[5]; // the sheet's outward normal, mapped into the scene
          const mx = (ax + bx) / 2;
          const mz = (az + bz) / 2;
          const ry = Math.atan2(nx, nz);
          const seed = lv.floor * 97.3 + wi * 13.7;
          // which block the window belongs to: the nearest of the three residence outlines
          let block: BlockId | null = null;
          let best = 9;
          for (const b of m.blocks) {
            const d = distToRing((run[0] + run[2]) / 2, (run[1] + run[3]) / 2, b.ring);
            if (d < best) {
              best = d;
              block = b.id;
            }
          }
          winOf.push({ block, floor: lv.floor, seed });
          const outGlass = 0.07;
          const outReveal = 0.02;
          const cy2 = sill + winH / 2;
          // a dark reveal a little larger than the glass reads as the opening's depth
          revealBag.add(mx + nx * outReveal, cy2, mz + nz * outReveal, len + 0.12, winH + 0.14, 0.06, ry);
          glassBag.add(mx + nx * outGlass, cy2, mz + nz * outGlass, len - 0.06, winH, 1, ry, facadeColor(seed, 'normal'));
          // divide a wide run the way the real frames do, so it reads as windows and not glass wall
          const bays = Math.floor(len / 1.6);
          const ux = (bx - ax) / len;
          const uz = (bz - az) / len;
          for (let k = 1; k < bays; k++) {
            const t = (k / bays - 0.5) * len;
            mullionBag.add(mx + ux * t + nx * (outGlass + 0.01), cy2, mz + uz * t + nz * (outGlass + 0.01), 0.07, winH, 0.07, ry);
          }
        }

        // level 9's terraces and the ground-floor gardens, planted
        for (const t of lv.terraces ?? []) {
          const deck = new THREE.Mesh(flatRing(t, originX, originY, y0 + 0.06), matSlab);
          deck.receiveShadow = true;
          buildingGroup.add(deck);
          const tc = ringCentroid(t);
          for (let i = 0; i < 3; i++) {
            const px = toWorldX(tc[0]) + (hash01(i * 4.1 + lv.floor) - 0.5) * 2.4;
            const pz = toWorldZ(tc[1]) + (hash01(i * 7.9 + lv.floor) - 0.5) * 2.4;
            const r = 0.5 + 0.35 * hash01(i * 2.3 + tc[0]);
            leafBag.add(px, y0 + 0.5 + r * 0.5, pz, r * 1.5, r, r * 1.5, 0, col(0x3f6b3c, 0.7 + 0.4 * hash01(i + tc[0])));
          }
        }
        for (const g of lv.gardens ?? []) {
          const lawn = new THREE.Mesh(
            flatRing(g, originX, originY, 0.08),
            new THREE.MeshStandardMaterial({ color: 0x3d5c36, roughness: 1 }),
          );
          lawn.receiveShadow = true;
          buildingGroup.add(lawn);
          const gc = ringCentroid(g);
          for (let i = 0; i < 4; i++) {
            const px = toWorldX(gc[0]) + (hash01(i * 3.3 + gc[0]) - 0.5) * 5;
            const pz = toWorldZ(gc[1]) + (hash01(i * 6.1 + gc[1]) - 0.5) * 5;
            const r = 0.7 + 0.5 * hash01(i * 1.7 + gc[0]);
            trunkBag2.add(px, 0.9, pz, 0.11, 1.8, 0.11, 0, col(0x4a3a2a));
            leafBag.add(px, 1.8 + r * 0.7, pz, r * 1.6, r * 1.3, r * 1.6, 0, col(0x39602f, 0.75 + 0.4 * hash01(i + gc[1])));
          }
        }
      }

      // the crown: roof deck and a parapet standing on the top plate's own outline
      const top = m.levels[m.levels.length - 1];
      if (top) {
        const roof = new THREE.Mesh(flatRing(top.ring, originX, originY, ROOF_Y + 0.01), matSlab);
        roof.receiveShadow = true;
        buildingGroup.add(roof);
        if (top.band) {
          const parapet = new THREE.Mesh(
            extrudeRing(top.band, originX, originY, ROOF_Y, 0.95, [top.ring]),
            matSpandrel,
          );
          parapet.castShadow = true;
          buildingGroup.add(parapet);
        }
      }

      // paving and planting on the open ground the blocks wrap around
      const groundRing = m.levels.find((lv) => lv.floor === 0)?.ring;
      for (const ring of m.open) {
        const paving = new THREE.Mesh(
          flatRing(ring, originX, originY, 0.02),
          new THREE.MeshStandardMaterial({ color: 0xb9b1a0, roughness: 0.95 }),
        );
        paving.receiveShadow = true;
        buildingGroup.add(paving);
        // courtyard trees, scattered deterministically wherever the ground is genuinely open
        const xs = ring.map((p) => p[0]);
        const ys = ring.map((p) => p[1]);
        const rx0 = Math.min(...xs);
        const rx1 = Math.max(...xs);
        const ry0 = Math.min(...ys);
        const ry1 = Math.max(...ys);
        let placed = 0;
        for (let i = 0; i < 320 && placed < 26; i++) {
          const px = rx0 + (rx1 - rx0) * hash01(i * 1.37 + 0.11);
          const py = ry0 + (ry1 - ry0) * hash01(i * 2.71 + 5.3);
          if (distToRing(px, py, ring) > 0) continue; // outside the open ground
          if (groundRing && distToRing(px, py, groundRing) < 2.6) continue; // hard against a facade
          placed++;
          const wx = toWorldX(px);
          const wz = toWorldZ(py);
          const r = 1.1 + 0.7 * hash01(i * 5.9);
          trunkBag2.add(wx, 1.15, wz, 0.14, 2.3, 0.14, 0, col(0x4a3a2a, 0.8 + 0.4 * hash01(i)));
          leafBag.add(wx, 2.3 + r * 0.75, wz, r * 1.7, r * 1.35, r * 1.7, 0, col(0x35592d, 0.7 + 0.5 * hash01(i * 3.1)));
        }
      }

      facadeMesh = glassBag.build(unitPlane, matWindow);
      buildingGroup.add(facadeMesh);
      buildingGroup.add(revealBag.build(unitBox, matFrame));
      buildingGroup.add(mullionBag.build(unitBox, matFrame));
      buildingGroup.add(leafBag.build(unitSphere, matGreen, true));
      buildingGroup.add(trunkBag2.build(unitCyl, matTrunk, true));

      /* ---------- blocks: outline, hit volume and pin, on the real wings ---------- */
      for (const b of m.blocks) {
        const center = new THREE.Vector3(toWorldX(b.x), ROOF_Y * 0.45, toWorldZ(b.y));
        metaByBlock[b.id] = { id: b.id, ring: b.ring, center };

        const volume = extrudeRing(b.ring, originX, originY, 0, ROOF_Y);
        const hit = new THREE.Mesh(volume, new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData.block = b.id;
        buildingGroup.add(hit);
        hitMeshes.push(hit);

        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(volume, 25),
          new THREE.LineBasicMaterial({ color: col(0xc9a769, 1.4), transparent: true, opacity: 0.3, depthWrite: false }),
        );
        outline.renderOrder = 4;
        outline.visible = false;
        buildingGroup.add(outline);
        outlineByBlock[b.id] = outline;

        const pin = document.createElement('div');
        pin.className = 'bm3d-pin';
        pin.textContent = b.id;
        pin.addEventListener('pointerdown', (e) => e.stopPropagation());
        pin.addEventListener('click', (e) => {
          e.stopPropagation();
          propsRef.current.onSelectBlock(b.id);
        });
        pin.addEventListener(
          'wheel',
          (e) => {
            // the pin sits over the canvas: let the wheel keep zooming the model
            e.preventDefault();
            e.stopPropagation();
            renderer.domElement.dispatchEvent(new WheelEvent('wheel', e));
          },
          { passive: false },
        );
        const pinObj = new CSS2DObject(pin);
        pinObj.position.set(center.x, ROOF_Y + 5.4, center.z);
        scene.add(pinObj);
        pinByBlock[b.id] = pin;
      }

      // re-apply whatever the page had already selected while the sheets were loading
      setSelection(state.block, state.floor);
      invalidate();
    };

    const massingAbort = new AbortController();
    fetch(MASSING_URL, { signal: massingAbort.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Massing>) : null))
      .then(async (m) => {
        if (!m || disposed) return;
        buildComplex(m);
        renderer.shadowMap.needsUpdate = true;
        // compile the building's shaders in the background (KHR_parallel_shader_compile) so the
        // first frame that shows it doesn't freeze the page while the driver compiles them
        compiling = true;
        await compileInBackground(renderer, scene, camera);
        compiling = false;
        if (disposed) return;
        renderer.shadowMap.needsUpdate = true;
        invalidate();
      })
      .catch(() => {
        // an aborted or failed load leaves the site and sky standing; the page's own
        // block and floor lists remain the authoritative way to browse the building
      });

    /* ---------- ground and street ---------- */
    // The paving, gardens and planting that belong to the parcel are placed from the
    // sheets in buildComplex(); only the ground the drawings say nothing about is here.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x131a15, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // The street the parcel fronts. The sheets stop at the property line, so this is
    // context, not a survey — kept plain for that reason.
    const street = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 15),
      new THREE.MeshStandardMaterial({ color: 0x1a201e, roughness: 1 }),
    );
    street.rotation.x = -Math.PI / 2;
    street.position.set(0, 0.012, 42);
    street.receiveShadow = true;
    scene.add(street);

    // Kerb lamps: the bulbs sit just over the bloom threshold so they flare gently.
    for (let i = -4; i <= 4; i++) {
      const x = i * 15;
      railBag.add(x, 2.4, 35.4, 0.16, 4.8, 0.16, 0, col(0x4a4e52));
      bulbBag.add(x, 5.02, 35.4, 0.34, 0.34, 0.34);
      const lamp = new THREE.PointLight(0xffcf9a, 8, 20, 2);
      lamp.position.set(x, 5, 35.4);
      scene.add(lamp);
    }

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

    /* ---------- selection band: the chosen floor of the chosen block ---------- */
    // The band follows the block's own outline at that storey's height, so it sits on
    // the real wing rather than around a bounding box.
    const bandGroup = new THREE.Group();
    // ×1.6 lifts the gold over the bloom threshold so the selection band genuinely glows.
    const bandMat = new THREE.MeshBasicMaterial({ color: col(0xc9a769, 1.6), transparent: true, opacity: 0.26, depthWrite: false });
    const bandEdgeMat = new THREE.LineBasicMaterial({ color: col(0xc9a769, 1.6), transparent: true, opacity: 0.9, depthWrite: false });
    let bandMesh: THREE.Mesh | null = null;
    let bandEdges: THREE.LineSegments | null = null;
    bandGroup.visible = false;
    scene.add(bandGroup);

    const clearBand = (): void => {
      if (bandMesh) {
        bandGroup.remove(bandMesh);
        bandMesh.geometry.dispose();
        bandMesh = null;
      }
      if (bandEdges) {
        bandGroup.remove(bandEdges);
        bandEdges.geometry.dispose();
        bandEdges = null;
      }
    };

    /* ---------- selection / hover state ---------- */
    const state: { block: BlockId; floor: FloorId; hover: BlockId | null } = {
      block: propsRef.current.selectedBlock,
      floor: propsRef.current.selectedFloor,
      hover: null,
    };

    const updateOutlines = (): void => {
      for (const id of Object.keys(outlineByBlock) as BlockId[]) {
        const line = outlineByBlock[id];
        const mat = line.material as THREE.LineBasicMaterial;
        const sel = state.block === id;
        line.visible = sel || state.hover === id;
        mat.opacity = sel ? 0.8 : 0.3;
      }
      invalidate();
    };

    const updateBand = (): void => {
      clearBand();
      const f = state.floor;
      let y0: number;
      let h: number;
      let outline: Ring | undefined;
      if (typeof f === 'number' && f >= 0 && f <= TOP_FLOOR) {
        const lvl = levelByFloor.get(f);
        // the storey's own outline, stepped just clear of the wall so the band reads
        // from outside; which block it belongs to is said by the facade lighting
        outline = lvl?.band ?? lvl?.ring;
        y0 = floorY(f);
        h = floorHeight(f);
        bandMat.opacity = 0.3;
        bandEdgeMat.opacity = 1;
      } else if (f === 'roof') {
        const top = levelByFloor.get(TOP_FLOOR);
        outline = top?.band ?? top?.ring;
        y0 = ROOF_Y;
        h = 1.15;
        bandMat.opacity = 0.12;
        bandEdgeMat.opacity = 0.5;
      } else {
        bandGroup.visible = false; // basements are not part of the massing
        return;
      }
      if (!outline) {
        bandGroup.visible = false; // the sheets have not landed yet
        return;
      }
      const geom = extrudeRing(outline, originX, originY, y0 + 0.06, Math.max(0.4, h - 0.12));
      bandMesh = new THREE.Mesh(geom, bandMat);
      bandMesh.renderOrder = 5;
      bandEdges = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), bandEdgeMat);
      bandEdges.renderOrder = 6;
      bandGroup.add(bandMesh);
      bandGroup.add(bandEdges);
      bandGroup.visible = true;
    };

    const setSelection = (block: BlockId, floor: FloorId): void => {
      const blockChanged = state.block !== block || flyTo !== null;
      state.block = block;
      state.floor = floor;
      for (const id of Object.keys(pinByBlock) as BlockId[]) {
        pinByBlock[id].classList.toggle('is-active', id === block);
      }
      updateOutlines();
      updateBand();
      paintFacade(); // the rest of the complex steps back so the selection reads
      // Glide partway toward the block so the whole complex stays framed, and ride up to
      // the chosen storey — picking floor 9 should feel like looking at floor 9.
      const meta = metaByBlock[block];
      if (meta) desiredTarget.lerpVectors(SITE_CENTER, meta.center, 0.45);
      if (meta && blockChanged && !gliding) {
        // swing round to the side the block actually faces, keeping height and distance
        const dir = new THREE.Vector3(meta.center.x - SITE_CENTER.x, 0, meta.center.z - SITE_CENTER.z);
        if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
        dir.normalize();
        const off = camera.position.clone().sub(controls.target);
        const horizontal = Math.hypot(off.x, off.z);
        flyTo = new THREE.Vector3(
          desiredTarget.x + dir.x * horizontal,
          camera.position.y,
          desiredTarget.z + dir.z * horizontal,
        );
        controls.autoRotate = false;
      }
      if (typeof floor === 'number' && floor >= 0 && floor <= TOP_FLOOR) {
        desiredTarget.y = floorY(floor) + floorHeight(floor) / 2 + 1.5;
      } else if (floor === 'roof') {
        desiredTarget.y = ROOF_Y;
      } else {
        desiredTarget.y = SITE_CENTER.y; // basements: back to the whole building
      }
      invalidate();
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

    /* ---------- frame loop: render on demand ---------- */
    // Nothing in the scene is time-animated (stars, window glow and the light pools
    // are static), so a frame is only worth drawing when the camera or the
    // selection/hover state changed:
    //  - full rate while the intro glide, a drag, damping momentum or the target lerp
    //    is in motion (OrbitControls dispatches 'change' from update() while it still
    //    moves the camera, which re-arms the loop through invalidate());
    //  - the ambient auto-rotate (until the first interaction) at a capped ~24 fps,
    //    passing the frame delta to update() so the angular speed stays unchanged;
    //  - nothing at all when idle, when the tab is hidden or the canvas is off-screen.
    const AMBIENT_FRAME_MS = 1000 / 24;
    let raf = 0;
    let ambientTimer = 0;
    let pending = false; // something asked for a frame
    let inTick = false;
    let lastTick = 0; // 0 = no reference frame (first frame, or just resumed)
    let hidden = document.hidden;
    let offscreen = false;
    let disposed = false;

    /** while the building's shaders compile in the background, the last frame stays on screen */
    let compiling = false;
    const tick = (now: number): void => {
      raf = 0;
      if (ambientTimer !== 0) {
        clearTimeout(ambientTimer);
        ambientTimer = 0;
      }
      pending = false;
      inTick = true;
      const dt = lastTick === 0 ? 1 / 60 : Math.min((now - lastTick) / 1000, 0.1);
      lastTick = now;

      if (gliding) {
        if (glideT0 === null) glideT0 = now;
        const t = Math.min((now - glideT0) / GLIDE_MS, 1);
        const s = t * t * (3 - 2 * t); // smoothstep
        camera.position.lerpVectors(CAM_START, CAM_END, s);
        if (t >= 1) endGlide();
      }
      const targetMoving = controls.target.distanceToSquared(desiredTarget) > 1e-6;
      if (targetMoving) controls.target.lerp(desiredTarget, 0.04);
      if (flyTo) {
        camera.position.lerp(flyTo, 0.045);
        if (camera.position.distanceToSquared(flyTo) < 0.25) flyTo = null;
      }
      controls.update(dt); // fires 'change' -> invalidate() while there is still motion
      if (!compiling) {
        composer.render();
        labelRenderer.render(scene, camera);
      }

      if (gliding || targetMoving || flyTo !== null || (pending && !controls.autoRotate)) {
        // autoRotate is switched off by the first 'start', so a pending frame with it
        // still on can only be the ambient orbit — everything else runs at full rate.
        inTick = false;
        schedule();
      } else if (controls.autoRotate) {
        ambientTimer = window.setTimeout(() => {
          ambientTimer = 0;
          schedule();
        }, AMBIENT_FRAME_MS);
      }
      inTick = false;
    };
    const schedule = (): void => {
      if (raf !== 0 || hidden || offscreen || disposed) return;
      raf = requestAnimationFrame(tick);
    };
    const invalidate = (): void => {
      pending = true;
      if (!inTick) schedule();
    };
    controls.addEventListener('change', invalidate);

    const syncPause = (): void => {
      if (hidden || offscreen) {
        if (raf !== 0) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        if (ambientTimer !== 0) {
          clearTimeout(ambientTimer);
          ambientTimer = 0;
        }
      } else {
        lastTick = 0; // the pause must not count as elapsed auto-rotate time
        invalidate();
      }
    };
    const onVisibility = (): void => {
      hidden = document.hidden;
      syncPause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (!last) return;
      offscreen = !last.isIntersecting;
      syncPause();
    });
    io.observe(container);

    /* ---------- resize ---------- */
    const resize = (): void => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // DPR can change after mount (browser zoom, moving to a HiDPI monitor)
      const pr = pixelRatioFor(w);
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h);
      composer.setPixelRatio(pr);
      composer.setSize(w, h); // hands each pass the device-pixel size; UnrealBloomPass halves it internally
      // Budget: past ~2.2 MP of canvas, run bloom at a third instead of a half —
      // setSize halves its input, so 2/3 of the device size lands at 1/3 resolution.
      if ((w * pr * h * pr) / 1e6 > 2.2) bloomPass.setSize((w * pr * 2) / 3, (h * pr * 2) / 3);
      labelRenderer.setSize(w, h);
      invalidate();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    invalidate(); // first frame even if the container has no size yet

    /* ---------- teardown (StrictMode-proof) ---------- */
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      if (ambientTimer !== 0) clearTimeout(ambientTimer);
      massingAbort.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      io.disconnect();
      controls.removeEventListener('change', invalidate);
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
