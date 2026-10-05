/**
 * The studio as a 3D low-poly diorama, rendered with three.js.
 *
 * Everything is built from a handful of shared primitives (scaled unit boxes,
 * cylinders, cones) with cached materials, so a full campus stays cheap enough
 * for phones. People are simple rigs (torso, head, two-part arms and legs) posed
 * by the same gesture logic as the 2D scene; speech bubbles are HTML overlays.
 */
import * as THREE from 'three';
import { OFFICES } from '../core/data';
import { yearOf } from '../core/time';
import type { GameState, Staff } from '../core/types';
import { CAT_ID, CODE, DESK_WOOD, LINES, SIP_TIME, daylight, eraFor, gestureFor, lookFor, pickLine } from './office-common';
import type { Daylight, Era, Gesture, Look, Mode } from './office-common';
import type { OfficeView } from './office-view';

const CELL_X = 2.3;
const CELL_Z = 2.6;
const WALL_H = 2.7;
const MAX_COLS = 4;
const WALK_SPEED = 1.15; // metres per second
const HALF_PI = Math.PI / 2;

// ---------------------------------------------------------------------------
// Shared geometry & materials
// ---------------------------------------------------------------------------

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const CONE = new THREE.ConeGeometry(0.5, 1, 10);
const SPHERE = new THREE.SphereGeometry(0.5, 12, 10);

const materials = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, rough = 0.8, emissive = '#000000', metal = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${rough}|${emissive}|${metal}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive });
    materials.set(key, m);
  }
  return m;
}

interface PartOpts {
  shadow?: boolean;
  material?: THREE.Material;
  geo?: THREE.BufferGeometry;
}

/** Adds a scaled primitive (a unit box by default) to `parent`. */
function part(parent: THREE.Object3D, w: number, h: number, d: number, color: string, x: number, y: number, z: number, o: PartOpts = {}): THREE.Mesh {
  const m = new THREE.Mesh(o.geo ?? BOX, o.material ?? mat(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = !!o.shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function group(parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** A soft round glow, used for screen light at night and the zone aura. */
let glowTexture: THREE.CanvasTexture | null = null;
function glow(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

function glowSprite(color: string, size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  s.scale.set(size, size, 1);
  return s;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

interface Pose {
  torsoX: number;
  torsoZ: number;
  headX: number;
  headY: number;
  lUpX: number;
  lUpZ: number;
  lFoX: number;
  rUpX: number;
  rUpZ: number;
  rFoX: number;
  yaw: number;
}

const ZERO_POSE: Pose = { torsoX: 0, torsoZ: 0, headX: 0, headY: 0, lUpX: 0, lUpZ: 0, lFoX: 0, rUpX: 0, rUpZ: 0, rFoX: 0, yaw: 0 };

interface Rig {
  id: number;
  name: string;
  look: Look;
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  lUp: THREE.Group;
  lFo: THREE.Group;
  rUp: THREE.Group;
  rFo: THREE.Group;
  lHip: THREE.Group;
  lKnee: THREE.Group;
  rHip: THREE.Group;
  rKnee: THREE.Group;
  handMug: THREE.Mesh;
  /** Flame sprites around the body, shown while in the zone. */
  fire: Flame[];
  fireGroup: THREE.Group;
  aura: THREE.Sprite;
  pose: Pose;
}

const BACKDROP_DAY = new THREE.Color('#e6d8bd');
const BACKDROP_NIGHT = new THREE.Color('#5a4e42');

const PANTS = ['#2a2f45', '#3a3a44', '#4a3a2a', '#1f3a4a'];

/** One flickering tongue of flame: it rises, shrinks and fades, then starts over. */
interface Flame {
  sprite: THREE.Sprite;
  base: THREE.Vector3;
  size: number;
  speed: number;
  phase: number;
  rise: number;
}

/** A teardrop flame: white-hot core fading through yellow and orange to transparent red. */
let flameTexture: THREE.CanvasTexture | null = null;
function flame(): THREE.CanvasTexture {
  if (flameTexture) return flameTexture;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(32, 86);
  g.scale(1, 1.9);
  const grad = g.createRadialGradient(0, 4, 0, 0, 0, 30);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(0.22, 'rgba(255,236,140,0.95)');
  grad.addColorStop(0.5, 'rgba(255,150,40,0.75)');
  grad.addColorStop(0.8, 'rgba(230,60,10,0.35)');
  grad.addColorStop(1, 'rgba(200,30,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, 30, 0, Math.PI * 2);
  g.fill();
  flameTexture = new THREE.CanvasTexture(c);
  flameTexture.colorSpace = THREE.SRGBColorSpace;
  return flameTexture;
}

/** Flames hugging the shoulders, arms and head (in torso space), plus a tall crown of fire. */
function buildFire(torso: THREE.Group): { group: THREE.Group; flames: Flame[] } {
  const group = new THREE.Group();
  torso.add(group);
  const flames: Flame[] = [];
  const add = (x: number, y: number, z: number, size: number, rise: number) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: flame(), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }),
    );
    sprite.renderOrder = 20;
    group.add(sprite);
    flames.push({ sprite, base: new THREE.Vector3(x, y, z), size, speed: 1.3 + Math.random() * 1.2, phase: Math.random(), rise });
  };
  // A ring of flames around the body...
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    add(Math.cos(a) * 0.34, 0.1 + (i % 3) * 0.22, 0.08 + Math.sin(a) * 0.14, 0.7 + (i % 2) * 0.25, 0.7);
  }
  // ...a crown of fire on the head, and one tall plume.
  for (let i = 0; i < 7; i++) add((i - 3) * 0.09, 0.95, 0.04, 0.85 + (i % 2) * 0.3, 0.9);
  add(0, 1.1, 0.05, 1.4, 1.1);
  group.visible = false;
  return { group, flames };
}

function buildRig(s: Staff): Rig {
  const look = lookFor(s);
  const pants = PANTS[Math.floor(look.phase * PANTS.length)];
  const root = new THREE.Group();
  root.userData.id = s.id;

  // Legs: hip and knee joints so the same rig can sit or walk.
  const leg = (x: number) => {
    const hip = group(root, x, 0.55, 0);
    part(hip, 0.16, 0.46, 0.17, pants, 0, -0.23, 0, { shadow: true });
    const knee = group(hip, 0, -0.46, 0);
    part(knee, 0.15, 0.44, 0.16, pants, 0, -0.22, 0, { shadow: true });
    part(knee, 0.16, 0.08, 0.26, '#22222c', 0, -0.46, -0.05);
    return { hip, knee };
  };
  const l = leg(-0.11);
  const r = leg(0.11);

  const torso = group(root, 0, 0.55, 0);
  part(torso, 0.46, 0.52, 0.26, look.shirt, 0, 0.27, 0, { shadow: true });
  part(torso, 0.46, 0.08, 0.26, shadeHex(look.shirt, -0.25), 0, 0.03, 0);
  part(torso, 0.12, 0.08, 0.12, look.skin, 0, 0.56, 0);

  const head = group(torso, 0, 0.58, 0);
  part(head, 0.32, 0.32, 0.32, look.skin, 0, 0.16, 0, { shadow: true });
  // Eyes on the front (the side facing the monitor), visible when they turn.
  part(head, 0.05, 0.06, 0.01, '#15131f', -0.08, 0.18, -0.161);
  part(head, 0.05, 0.06, 0.01, '#15131f', 0.08, 0.18, -0.161);
  switch (look.style) {
    case 0: // short
      part(head, 0.34, 0.1, 0.34, look.hair, 0, 0.33, 0);
      part(head, 0.34, 0.18, 0.06, look.hair, 0, 0.24, 0.15);
      break;
    case 1: // long
      part(head, 0.35, 0.1, 0.35, look.hair, 0, 0.33, 0);
      part(head, 0.35, 0.42, 0.07, look.hair, 0, 0.1, 0.16);
      part(head, 0.06, 0.3, 0.3, look.hair, -0.17, 0.16, 0.02);
      part(head, 0.06, 0.3, 0.3, look.hair, 0.17, 0.16, 0.02);
      break;
    case 2: // bun
      part(head, 0.34, 0.1, 0.34, look.hair, 0, 0.33, 0);
      part(head, 0.34, 0.16, 0.06, look.hair, 0, 0.24, 0.15);
      part(head, 0.14, 0.14, 0.14, look.hair, 0, 0.42, 0.08);
      break;
    default: // headphones
      part(head, 0.33, 0.07, 0.33, look.hair, 0, 0.33, 0);
      part(head, 0.38, 0.04, 0.06, '#15131f', 0, 0.38, 0);
      part(head, 0.05, 0.14, 0.12, '#15131f', -0.18, 0.18, 0);
      part(head, 0.05, 0.14, 0.12, '#15131f', 0.18, 0.18, 0);
  }

  const { group: fireGroup, flames: fire } = buildFire(torso);

  const arm = (x: number) => {
    const up = group(torso, x, 0.47, 0);
    part(up, 0.11, 0.28, 0.12, look.shirt, 0, -0.14, 0, { shadow: true });
    const fo = group(up, 0, -0.28, 0);
    part(fo, 0.1, 0.26, 0.1, look.shirt, 0, -0.13, 0);
    part(fo, 0.1, 0.08, 0.1, look.skin, 0, -0.29, 0);
    return { up, fo };
  };
  const la = arm(-0.29);
  const ra = arm(0.29);
  const handMug = part(ra.fo, 0.09, 0.11, 0.09, '#e8e8f0', 0, -0.3, -0.07, { geo: CYL });
  handMug.visible = false;

  // Behind the person (towards the monitor) so their body occludes it.
  const aura = glowSprite('#ffb84a', 1.5);
  aura.position.set(0, 1.0, -0.4);
  root.add(aura);

  return { id: s.id, name: s.name, look, root, torso, head, lUp: la.up, lFo: la.fo, rUp: ra.up, rFo: ra.fo, lHip: l.hip, lKnee: l.knee, rHip: r.hip, rKnee: r.knee, handMug, fire, fireGroup, aura, pose: { ...ZERO_POSE } };
}

/** Base pose for a gesture (angles in radians; arms hang down at 0, point forward at π/2). */
function poseFor(g: Gesture): Pose {
  const typing = { lUpX: 0.35, lUpZ: 0, lFoX: 1.2, rUpX: 0.35, rUpZ: 0, rFoX: 1.2 };
  switch (g) {
    case 'lean':
      return { ...ZERO_POSE, ...typing, torsoX: -0.32, lUpX: 0.6, rUpX: 0.6, lFoX: 0.95, rFoX: 0.95 };
    case 'think':
      return { ...ZERO_POSE, ...typing, torsoX: -0.05, headY: -0.15, headX: 0.1, rUpX: 2.7, rUpZ: -0.55, rFoX: 1.6 };
    case 'point':
      return { ...ZERO_POSE, ...typing, torsoX: -0.12, rUpX: 1.95, rUpZ: 0, rFoX: 0.1 };
    case 'sip':
      return { ...ZERO_POSE, ...typing, rUpX: 0.55, rUpZ: -0.25, rFoX: 2.25, headX: -0.15 };
    case 'look':
      return { ...ZERO_POSE, ...typing };
    case 'stretch':
      return { ...ZERO_POSE, torsoX: 0.15, lUpX: 3.0, lUpZ: -0.15, lFoX: 0, rUpX: 3.0, rUpZ: 0.15, rFoX: 0 };
    case 'relax':
    case 'swivel':
      return { ...ZERO_POSE, torsoX: 0.2, headX: -0.15, lUpX: 2.6, lUpZ: -0.9, lFoX: 2.2, rUpX: 2.6, rUpZ: 0.9, rFoX: 2.2 };
    default:
      return { ...ZERO_POSE, ...typing, torsoX: -0.08 };
  }
}

function applyPose(r: Rig, p: Pose, extra: Partial<Pose> = {}) {
  const v = (k: keyof Pose) => p[k] + (extra[k] ?? 0);
  r.torso.rotation.set(v('torsoX'), 0, v('torsoZ'));
  r.head.rotation.set(v('headX'), v('headY'), 0);
  r.lUp.rotation.set(v('lUpX'), 0, v('lUpZ'));
  r.lFo.rotation.set(v('lFoX'), 0, 0);
  r.rUp.rotation.set(v('rUpX'), 0, v('rUpZ'));
  r.rFo.rotation.set(v('rFoX'), 0, 0);
}

function sitLegs(r: Rig) {
  r.root.position.y = 0;
  r.lHip.rotation.set(HALF_PI, 0, 0);
  r.rHip.rotation.set(HALF_PI, 0, 0);
  r.lKnee.rotation.set(-HALF_PI, 0, 0);
  r.rKnee.rotation.set(-HALF_PI, 0, 0);
}

function shadeHex(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  const t = f < 0 ? 0 : 1;
  c.r += (t - c.r) * Math.abs(f);
  c.g += (t - c.g) * Math.abs(f);
  c.b += (t - c.b) * Math.abs(f);
  return `#${c.getHexString()}`;
}

// ---------------------------------------------------------------------------
// Desks
// ---------------------------------------------------------------------------

interface Desk {
  group: THREE.Group;
  screenCanvas: HTMLCanvasElement;
  screenTex: THREE.CanvasTexture;
  screenGlow: THREE.Sprite;
  deskMug: THREE.Mesh;
  note: THREE.Mesh;
  chair: THREE.Group;
  lampGlow?: THREE.Sprite;
  /** World position of the chair (where the person sits). */
  seat: THREE.Vector3;
}

interface Walk {
  stage: 'out' | 'sip' | 'back';
  t: number;
  slot: number;
  path: THREE.Vector3[];
  length: number;
}

interface CatState {
  x: number;
  dir: 1 | -1;
  mode: 'walk' | 'sit' | 'sleep';
  t: number;
  target: number;
}

interface Overlay {
  el: HTMLDivElement;
  age: number;
  life: number;
}

export class Office3D implements OfficeView {
  readonly el: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  private overlay: HTMLDivElement;
  private world = new THREE.Group();
  private layoutKey = '';
  private width = 0;
  private height = 0;
  private insets = { top: 0, bottom: 0 };
  private roomBox = { minX: -5, maxX: 5, minY: -5, maxY: 5 };
  private lastT = 0;
  private clock = 0;
  private screenTimer = 0;
  private skyTimer = 0;

  // Lights
  private sun = new THREE.DirectionalLight('#ffffff', 2);
  private hemi = new THREE.HemisphereLight('#fff1d8', '#5a4a3a', 0.8);
  private lamps: THREE.PointLight[] = [];
  private backdrop = new THREE.Color();
  private zoneLight = new THREE.PointLight('#ff9a3a', 0, 5, 1.4);

  // Layout
  private roomW = 6;
  private roomD = 6;
  private era: Era = 'crt-mono';
  private desks: Desk[] = [];
  private rigs = new Map<number, Rig>();
  private walks = new Map<number, Walk>();
  private machine = new THREE.Vector3();
  private skyCanvas = document.createElement('canvas');
  private skyTex: THREE.CanvasTexture;
  private level = 0;

  // Cat
  private cat = new THREE.Group();
  private catParts: { body: THREE.Mesh; head: THREE.Group; tail: THREE.Group; legs: THREE.Mesh[] } | null = null;
  private catState: CatState = { x: 0, dir: 1, mode: 'sleep', t: 0, target: 0 };

  // Particles
  private particles: { pos: THREE.Vector3; vel: THREE.Vector3; life: number; max: number; color: THREE.Color }[] = [];
  private points: THREE.Points;
  private pointsGeo = new THREE.BufferGeometry();

  // Speech bubbles & labels
  private bubbles = new Map<number, Overlay>();
  private zoneLabels = new Map<number, HTMLDivElement>();
  private zoneStart = new Map<number, number>();
  private staffIds: number[] = [];
  private raycaster = new THREE.Raycaster();
  /** Called if the browser drops the WebGL context (e.g. low memory), so the app can fall back to 2D. */
  onLost: (() => void) | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.el = document.createElement('div');
    this.el.className = 'office office3d';
    this.el.setAttribute('role', 'img');
    renderer.domElement.className = 'office3d-canvas';
    this.el.appendChild(renderer.domElement);
    this.overlay = document.createElement('div');
    this.overlay.className = 'office3d-overlay';
    this.el.appendChild(this.overlay);

    this.scene.add(this.world);
    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target, this.zoneLight);

    this.skyCanvas.width = 256;
    this.skyCanvas.height = 96;
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;

    this.pointsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(300 * 3), 3));
    this.pointsGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(300 * 3), 3));
    this.points = new THREE.Points(
      this.pointsGeo,
      new THREE.PointsMaterial({ size: 9, map: glow(), sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.buildCat();
    renderer.domElement.addEventListener('click', (e) => this.onTap(e));
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.onLost?.();
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  celebrate(staffId: number) {
    this.zoneStart.set(staffId, this.lastT / 1000);
    const w = this.walks.get(staffId);
    if (w && w.stage !== 'back') {
      w.t = w.stage === 'out' ? Math.max(0, w.length / WALK_SPEED - w.t) : 0;
      w.stage = 'back';
    }
    this.say(staffId, '🔥', 2.5);
  }

  say(staffId: number, text: string, life = 2.4) {
    this.bubbles.get(staffId)?.el.remove();
    const el = document.createElement('div');
    el.className = 'bubble3d';
    el.textContent = text;
    this.overlay.appendChild(el);
    this.bubbles.set(staffId, { el, age: 0, life });
  }

  cheer(lines: string[]) {
    this.staffIds.forEach((id, i) => {
      this.say(id, pickLine(lines), 2.8);
      this.bubbles.get(id)!.age = -i * 0.15;
    });
  }

  draw(state: GameState, t: number, running: boolean) {
    const dt = Math.min(0.1, (t - (this.lastT || t)) / 1000);
    this.lastT = t;
    const time = t / 1000;
    if (running) this.clock += dt;
    const tick = running ? dt : 0;
    const gt = this.clock;

    this.era = eraFor(yearOf(state.week));
    const capacity = OFFICES[state.officeLevel].capacity;
    const deskCount = Math.max(capacity, state.staff.length);
    const key = `${state.officeLevel}|${deskCount}|${this.era}|${state.staff.map((s) => s.id).join(',')}`;
    if (key !== this.layoutKey) this.rebuild(state, deskCount, key);
    this.resize();

    const act = state.activity;
    const mode: Mode = !act ? 'idle' : act.kind === 'game' && act.phase >= 3 ? 'polish' : 'work';
    const animating = running && mode !== 'idle';
    this.staffIds = state.staff.map((s) => s.id);

    const light = daylight(gt);
    this.updateLighting(light, time);
    this.skyTimer -= dt;
    if (this.skyTimer <= 0) {
      this.drawSky(light, time);
      this.skyTimer = 0.25;
    }

    // People, breaks and screens
    this.screenTimer -= dt;
    const refreshScreens = this.screenTimer <= 0;
    if (refreshScreens) this.screenTimer = 0.08;
    let zoneRig: Rig | null = null;
    const zoners: Rig[] = [];
    state.staff.forEach((s, i) => {
      const rig = this.rigs.get(s.id);
      const desk = this.desks[i];
      if (!rig || !desk) return;
      const inZone = !!s.zone && act?.kind === 'game' && mode === 'work';
      const walk = this.updateWalk(rig, desk, mode, inZone, tick, state.staff.length);
      desk.deskMug.visible = !walk;
      desk.note.visible = !!walk;
      if (walk) {
        this.poseWalker(rig, walk, time);
      } else {
        this.poseSeated(rig, desk, mode, animating, inZone, gt);
        if (inZone) {
          zoners.push(rig);
          zoneRig ??= rig;
        }
        if (animating) this.emitWork(desk, inZone, mode, dt);
        this.maybeChatter(s, mode, inZone, tick, state.staff.length);
      }
      const away = !!walk;
      if (refreshScreens) this.drawScreen(desk, s, away ? 'idle' : mode, animating && !away, inZone && !away, time, rig.look);
      const screenColor = inZone ? '#ffb84a' : away || mode === 'idle' ? '#23877d' : mode === 'polish' ? '#6dffb8' : '#5ab0ff';
      (desk.screenGlow.material as THREE.SpriteMaterial).color.set(screenColor);
      (desk.screenGlow.material as THREE.SpriteMaterial).opacity = 0.12 + light.dark * 1.1;
      rig.aura.visible = inZone && !walk;
      if (rig.aura.visible) {
        (rig.aura.material as THREE.SpriteMaterial).opacity = 0.3 + Math.sin(time * 7 + rig.look.phase * 6) * 0.1;
      }
      rig.fireGroup.visible = inZone && !walk;
      if (rig.fireGroup.visible) this.animateFire(rig, time);
    });
    // Empty desks: dark screens.
    for (let i = state.staff.length; i < this.desks.length; i++) {
      if (refreshScreens) this.drawScreen(this.desks[i], undefined, 'idle', false, false, time, null);
      (this.desks[i].screenGlow.material as THREE.SpriteMaterial).opacity = 0;
    }
    if (zoneRig) {
      (zoneRig as Rig).root.getWorldPosition(this.zoneLight.position);
      this.zoneLight.position.y += 1.4;
      this.zoneLight.intensity = 5 + Math.sin(time * 17) * 1.2 + Math.sin(time * 7.3) * 0.8;
    } else {
      this.zoneLight.intensity = 0;
    }

    this.updateCat(tick, time);
    this.updateParticles(dt);
    this.renderer.render(this.scene, this.camera);
    this.updateOverlays(zoners, tick, time);

    const onBreak = state.staff.filter((s) => this.walks.has(s.id)).map((s) => s.name);
    const inZoneNames = zoners.map((r) => r.name);
    this.el.setAttribute(
      'aria-label',
      `${OFFICES[state.officeLevel].name} in 3D with ${state.staff.length} ${state.staff.length === 1 ? 'person' : 'people'} ${mode === 'idle' ? 'relaxing' : 'working'}${inZoneNames.length ? `. In the zone: ${inZoneNames.join(', ')}` : ''}${onBreak.length ? `. On a coffee break: ${onBreak.join(', ')}` : ''}.`,
    );
  }

  // -------------------------------------------------------------------------
  // Building the office
  // -------------------------------------------------------------------------

  private rebuild(state: GameState, deskCount: number, key: string) {
    this.layoutKey = key;
    this.world.clear();
    for (const d of this.desks) {
      d.screenTex.dispose();
      (d.screenGlow.material as THREE.Material).dispose();
      (d.lampGlow?.material as THREE.Material | undefined)?.dispose();
    }
    for (const r of this.rigs.values()) {
      (r.aura.material as THREE.Material).dispose();
      r.fire.forEach((f) => (f.sprite.material as THREE.Material).dispose());
    }
    this.desks = [];
    this.rigs.clear();
    this.walks.clear();
    for (const l of this.lamps) this.scene.remove(l);
    this.lamps = [];

    this.level = state.officeLevel;
    const cols = Math.min(deskCount, MAX_COLS);
    const rows = Math.ceil(deskCount / cols);
    this.roomW = Math.max(5.2, cols * CELL_X + 2.4);
    this.roomD = rows * CELL_Z + 2.2;
    const W = this.roomW;
    const D = this.roomD;

    this.buildRoom(W, D);

    // Desks in a grid, centred, with an aisle along the right wall to the coffee machine.
    const x0 = -W / 2 + 1.1 + CELL_X / 2 + (W - 2.4 - cols * CELL_X) / 2;
    const z0 = -D / 2 + 1.1;
    for (let i = 0; i < deskCount; i++) {
      const x = x0 + (i % cols) * CELL_X - 0.35;
      const z = z0 + Math.floor(i / cols) * CELL_Z;
      const s = state.staff[i];
      this.desks.push(this.buildDesk(x, z, s));
      if (s) {
        const rig = buildRig(s);
        rig.root.position.copy(this.desks[i].seat);
        sitLegs(rig);
        this.world.add(rig.root);
        this.rigs.set(s.id, rig);
      }
    }

    // Coffee corner against the back wall, top right.
    this.machine.set(W / 2 - 0.55, 0, -D / 2 + 0.35);
    part(this.world, 0.9, 0.9, 0.5, shadeHex(DESK_WOOD[Math.min(this.level, 3)], -0.1), this.machine.x, 0.45, this.machine.z, { shadow: true });
    part(this.world, 0.4, 0.5, 0.35, '#3a3a48', this.machine.x, 1.15, this.machine.z, { shadow: true });
    part(this.world, 0.4, 0.06, 0.35, '#22222c', this.machine.x, 1.43, this.machine.z);
    part(this.world, 0.06, 0.06, 0.01, '#ff5c6c', this.machine.x - 0.12, 1.3, this.machine.z + 0.18, { material: new THREE.MeshBasicMaterial({ color: '#ff5c6c' }) });
    part(this.world, 0.08, 0.1, 0.08, '#e8e8f0', this.machine.x, 0.97, this.machine.z + 0.1, { geo: CYL });

    // Cat lives on the floor in front of the desks.
    this.world.add(this.cat);
    this.catState.x = -W / 2 + 1;
    this.catState.target = this.catState.x;

    // Ceiling lights for the evening. The ceiling is cut away so we see in, so only
    // their light shows; fixtures would hang in front of people's heads at this angle.
    const lampCount = this.level === 0 ? 1 : Math.min(3, Math.max(1, Math.round(W / 4)));
    for (let i = 0; i < lampCount; i++) {
      const pl = new THREE.PointLight('#ffd49a', 0, 10, 1.1);
      pl.position.set(-W / 2 + ((i + 0.5) * W) / lampCount, WALL_H + 0.3, 0);
      this.scene.add(pl);
      this.lamps.push(pl);
    }

    this.fitCamera();
  }

  private buildRoom(W: number, D: number) {
    const level = this.level;
    const floorCol = ['#6e655a', '#6a4e3c', '#3f4a52', '#454c63'][level] ?? '#454c63';
    const wallCol = ['#a59a88', '#b89a7e', '#6a7f86', '#4a5478'][level] ?? '#4a5478';
    // Floor slab and two cut-away walls (back and left).
    part(this.world, W, 0.12, D, floorCol, 0, -0.06, 0);
    if (level === 1) {
      // Wooden floorboards.
      for (let x = -W / 2 + 0.4; x < W / 2; x += 0.4) part(this.world, 0.012, 0.005, D, shadeHex(floorCol, -0.2), x, 0.002, 0);
    } else if (level === 2) {
      part(this.world, W * 0.7, 0.01, D * 0.55, '#a8442e', 0.3, 0.005, 0.2);
    } else if (level === 3) {
      for (let x = -W / 2 + 0.8; x < W / 2; x += 1.6) part(this.world, 0.8, 0.004, D, '#4b536b', x, 0.002, 0);
    }
    part(this.world, W, WALL_H, 0.12, wallCol, 0, WALL_H / 2, -D / 2 - 0.06);
    part(this.world, 0.12, WALL_H, D, shadeHex(wallCol, 0.06), -W / 2 - 0.06, WALL_H / 2, 0);
    // Skirting boards.
    part(this.world, W, 0.1, 0.03, shadeHex(wallCol, -0.35), 0, 0.05, -D / 2 + 0.015);
    part(this.world, 0.03, 0.1, D, shadeHex(wallCol, -0.35), -W / 2 + 0.015, 0.05, 0);

    const skyMat = new THREE.MeshBasicMaterial({ map: this.skyTex });
    if (level === 0) {
      // Garage: roll-up door ribs on the back wall, a workbench vibe.
      for (let y = 0.4; y < WALL_H - 0.2; y += 0.22) part(this.world, W * 0.6, 0.05, 0.02, shadeHex(wallCol, -0.2), -W * 0.1, y, -D / 2 + 0.01);
      part(this.world, 0.6, 0.35, 0.4, '#8a5a3b', -W / 2 + 0.5, 0.18, D / 2 - 0.5, { shadow: true }); // cardboard box
      part(this.world, 0.62, 0.04, 0.42, '#a87a4b', -W / 2 + 0.5, 0.37, D / 2 - 0.5);
    } else if (level === 1 || level === 2) {
      // A window onto the sky.
      const wx = level === 1 ? 0 : -W * 0.25;
      part(this.world, 1.9, 1.05, 0.06, '#e8dccf', wx, 1.7, -D / 2 + 0.02);
      part(this.world, 1.75, 0.9, 0.01, '#ffffff', wx, 1.7, -D / 2 + 0.06, { material: skyMat });
      part(this.world, 0.05, 0.9, 0.03, '#e8dccf', wx, 1.7, -D / 2 + 0.07);
      part(this.world, 2.0, 0.06, 0.16, '#cfc2b3', wx, 1.15, -D / 2 + 0.08);
      // A plant in the corner.
      part(this.world, 0.36, 0.4, 0.36, '#b5653a', -W / 2 + 0.4, 0.2, -D / 2 + 0.4, { geo: CYL, shadow: true });
      part(this.world, 0.6, 0.7, 0.6, '#3d9a5a', -W / 2 + 0.4, 0.75, -D / 2 + 0.4, { geo: SPHERE, shadow: true });
      if (level === 2) {
        // Posters of past hits.
        ['#dc4b2a', '#23877d', '#f2b33d'].forEach((col, i) => {
          part(this.world, 0.55, 0.75, 0.02, '#1d1830', W * 0.12 + i * 0.85, 1.7, -D / 2 + 0.02);
          part(this.world, 0.47, 0.67, 0.01, col, W * 0.12 + i * 0.85, 1.7, -D / 2 + 0.04, { material: mat(col, 0.6) });
        });
        // A wall clock on the side wall.
        const clock = part(this.world, 0.5, 0.04, 0.5, '#e8e8f0', -W / 2 + 0.03, 1.85, -D / 4, { geo: CYL });
        clock.rotation.z = HALF_PI;
      }
    } else {
      // Campus: a glass wall onto the city.
      part(this.world, W - 0.4, WALL_H - 0.5, 0.01, '#ffffff', 0.1, WALL_H / 2 + 0.1, -D / 2 + 0.02, { material: skyMat });
      for (let x = -W / 2 + 0.2; x <= W / 2; x += W / 5) part(this.world, 0.06, WALL_H, 0.06, '#d8d2c4', x, WALL_H / 2, -D / 2 + 0.03);
      part(this.world, 0.36, 0.5, 0.36, '#e8e8f0', -W / 2 + 0.4, 0.25, -D / 2 + 0.4, { geo: CYL, shadow: true });
      part(this.world, 0.55, 0.9, 0.55, '#3d9a5a', -W / 2 + 0.4, 0.95, -D / 2 + 0.4, { geo: CONE, shadow: true });
    }
  }

  private buildDesk(x: number, z: number, s: Staff | undefined): Desk {
    const g = group(this.world, x, 0, z);
    const wood = DESK_WOOD[Math.min(this.level, DESK_WOOD.length - 1)];
    const look = s ? lookFor(s) : null;
    // Desk
    part(g, 1.7, 0.06, 0.85, wood, 0, 0.75, 0, { shadow: true, material: mat(wood, 0.65) });
    for (const [lx, lz] of [[-0.78, -0.36], [0.78, -0.36], [-0.78, 0.36], [0.78, 0.36]]) part(g, 0.06, 0.72, 0.06, shadeHex(wood, -0.35), lx, 0.36, lz);
    part(g, 1.5, 0.35, 0.03, shadeHex(wood, -0.2), 0, 0.5, -0.38); // modesty panel
    // Keyboard and mouse
    part(g, 0.5, 0.025, 0.16, '#2a2a33', 0, 0.795, 0.14);
    part(g, 0.46, 0.006, 0.12, '#4a4a58', 0, 0.81, 0.14);
    part(g, 0.07, 0.03, 0.1, '#2a2a33', 0.38, 0.795, 0.16);

    // Monitor for the era
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 128;
    screenCanvas.height = 80;
    const screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    screenTex.magFilter = THREE.NearestFilter;
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
    let screenPos: THREE.Vector3;
    const dual = this.era === 'wide' && this.level >= 2;
    if (this.era === 'crt-mono' || this.era === 'crt') {
      const beige = '#d8cfb8';
      part(g, 0.56, 0.46, 0.5, beige, 0, 1.08, -0.18, { shadow: true, material: mat(beige, 0.55) });
      part(g, 0.4, 0.34, 0.25, shadeHex(beige, -0.12), 0, 1.06, -0.48); // the CRT's deep back
      part(g, 0.3, 0.05, 0.3, shadeHex(beige, -0.1), 0, 0.81, -0.18);
      part(g, 0.04, 0.04, 0.01, '#3ddc97', 0.22, 0.89, 0.075, { material: new THREE.MeshBasicMaterial({ color: '#3ddc97' }) });
      part(g, 0.44, 0.34, 0.01, '#ffffff', 0, 1.1, 0.07, { material: screenMat });
      screenPos = new THREE.Vector3(0, 1.1, 0.08);
    } else if (this.era === 'lcd') {
      const silver = '#b8bcc8';
      part(g, 0.6, 0.44, 0.05, silver, 0, 1.13, -0.22, { shadow: true, material: mat(silver, 0.35, '#000000', 0.4) });
      part(g, 0.06, 0.3, 0.05, shadeHex(silver, -0.2), 0, 0.92, -0.26);
      part(g, 0.3, 0.02, 0.2, shadeHex(silver, -0.25), 0, 0.79, -0.26);
      part(g, 0.54, 0.38, 0.01, '#ffffff', 0, 1.13, -0.194, { material: screenMat });
      screenPos = new THREE.Vector3(0, 1.13, -0.18);
    } else {
      const ox = dual ? -0.18 : 0;
      part(g, 0.86, 0.48, 0.035, '#15131f', ox, 1.15, -0.22, { shadow: true, material: mat('#15131f', 0.3, '#000000', 0.3) });
      part(g, 0.05, 0.32, 0.05, '#2a2a33', ox, 0.93, -0.25);
      part(g, 0.32, 0.02, 0.2, '#2a2a33', ox, 0.79, -0.26);
      part(g, 0.82, 0.44, 0.01, '#ffffff', ox, 1.15, -0.2, { material: screenMat });
      screenPos = new THREE.Vector3(ox, 1.15, -0.19);
      if (dual) {
        const side = group(g, 0.5, 0, -0.18);
        side.rotation.y = -0.45;
        part(side, 0.32, 0.5, 0.03, '#15131f', 0, 1.15, 0, { shadow: true });
        part(side, 0.29, 0.46, 0.01, '#ffffff', 0, 1.15, 0.018, { material: new THREE.MeshBasicMaterial({ color: s ? '#e8e8f0' : '#0c0b12', toneMapped: false }) });
        if (s) for (let k = 0; k < 5; k++) part(side, 0.12 + ((s.id + k) % 3) * 0.04, 0.02, 0.005, '#9a98b0', -0.05, 1.3 - k * 0.07, 0.025);
        part(side, 0.04, 0.3, 0.04, '#2a2a33', 0, 0.93, -0.02);
      }
    }
    const screenGlow = glowSprite('#5ab0ff', 1.5);
    screenGlow.position.copy(screenPos).add(new THREE.Vector3(0, 0, 0.12));
    g.add(screenGlow);

    // Mug, desk item and the sticky note shown while they're away.
    const mugX = dual ? -0.68 : 0.62;
    const deskMug = part(g, 0.09, 0.11, 0.09, '#e8e8f0', mugX, 0.835, 0.1, { geo: CYL });
    deskMug.visible = !!s;
    const note = part(g, 0.1, 0.1, 0.01, '#ffd25c', screenPos.x + 0.18, screenPos.y + 0.12, screenPos.z + 0.01, { material: mat('#ffd25c', 0.9) });
    note.visible = false;
    let lampGlow: THREE.Sprite | undefined;
    if (look && !dual) lampGlow = this.buildProp(g, look);

    // Office chair
    const chair = group(g, 0, 0, 0.72);
    const chairCol = this.level >= 2 ? '#2a2836' : this.level === 1 ? '#3a2f4a' : '#4a3a2f';
    part(chair, 0.52, 0.08, 0.5, chairCol, 0, 0.48, 0, { shadow: true });
    part(chair, 0.5, 0.62, 0.08, chairCol, 0, 0.86, 0.26, { shadow: true });
    part(chair, 0.06, 0.4, 0.06, '#1b1a24', 0, 0.24, 0, { geo: CYL });
    part(chair, 0.6, 0.04, 0.06, '#1b1a24', 0, 0.05, 0);
    part(chair, 0.06, 0.04, 0.6, '#1b1a24', 0, 0.05, 0);

    return { group: g, screenCanvas, screenTex, screenGlow, deskMug, note, chair, lampGlow, seat: new THREE.Vector3(x, 0, z + 0.68) };
  }

  /** A personal item on the left of the desk; returns a glow for desk lamps. */
  private buildProp(g: THREE.Group, look: Look): THREE.Sprite | undefined {
    const x = -0.62;
    switch (look.prop) {
      case 0:
        part(g, 0.16, 0.16, 0.16, '#b5653a', x, 0.86, -0.05, { geo: CYL });
        part(g, 0.26, 0.3, 0.26, '#3d9a5a', x, 1.06, -0.05, { geo: SPHERE, shadow: true });
        break;
      case 1:
        part(g, 0.16, 0.12, 0.2, '#ffd25c', x, 0.84, 0, { geo: SPHERE });
        part(g, 0.11, 0.11, 0.11, '#ffd25c', x, 0.93, -0.05, { geo: SPHERE });
        part(g, 0.05, 0.03, 0.06, '#ff8a3b', x, 0.93, -0.12);
        break;
      case 2:
        part(g, 0.3, 0.04, 0.22, '#e8e8f0', x, 0.8, 0);
        part(g, 0.28, 0.04, 0.2, '#d8d8e4', x + 0.02, 0.84, 0.01);
        part(g, 0.26, 0.04, 0.2, '#ffffff', x - 0.01, 0.88, 0);
        break;
      case 3:
        part(g, 0.14, 0.14, 0.14, '#9aa3b8', x, 0.98, -0.02);
        part(g, 0.18, 0.16, 0.12, '#7c87a0', x, 0.86, -0.02);
        part(g, 0.04, 0.04, 0.01, '#ff5c6c', x - 0.03, 1.0, -0.095, { material: new THREE.MeshBasicMaterial({ color: '#ff5c6c' }) });
        break;
      case 4: {
        part(g, 0.18, 0.03, 0.18, '#2a2836', x, 0.795, -0.05, { geo: CYL });
        part(g, 0.03, 0.4, 0.03, '#2a2836', x, 1.0, -0.05);
        const shade = part(g, 0.2, 0.14, 0.2, '#ffad3b', x + 0.05, 1.18, -0.02, { geo: CONE });
        shade.rotation.z = -0.5;
        const lg = glowSprite('#ffc878', 1.3);
        lg.position.set(x + 0.08, 1.05, 0);
        g.add(lg);
        return lg;
      }
      default:
        part(g, 0.12, 0.1, 0.12, '#c98b5e', x, 0.83, -0.05, { geo: CYL });
        part(g, 0.06, 0.26, 0.06, '#3d9a5a', x, 1.0, -0.05, { geo: CYL });
        part(g, 0.04, 0.12, 0.04, '#3d9a5a', x - 0.06, 0.98, -0.05, { geo: CYL });
        part(g, 0.04, 0.04, 0.04, '#ff5c9a', x, 1.14, -0.05, { geo: SPHERE });
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // Camera & sizing
  // -------------------------------------------------------------------------

  /** Isometric-ish view from the front right, framed so the whole room fits. */
  private fitCamera() {
    const W = this.roomW;
    const D = this.roomD;
    // More frontal for wide rooms so long rows of desks don't leave dead space.
    const wide = W / D > 1.6;
    const dir = new THREE.Vector3(wide ? 0.38 : 0.62, wide ? 1.05 : 0.95, 1).normalize();
    this.camera.position.copy(dir.multiplyScalar(30));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0.6, 0);
    this.camera.updateMatrixWorld();
    const inv = this.camera.matrixWorldInverse;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const x of [-W / 2, W / 2]) {
      for (const z of [-D / 2, D / 2]) {
        for (const y of [0, z < 0 || x < 0 ? WALL_H : 0.1]) {
          const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
      }
    }
    const pad = 0.25;
    minX -= pad;
    maxX += pad;
    minY -= pad;
    maxY += pad;
    this.roomBox = { minX, maxX, minY, maxY };
    this.applyFrustum();

    // Shadow camera covers the room.
    const s = Math.max(W, D) * 0.75;
    const sc = this.sun.shadow.camera;
    sc.left = -s;
    sc.right = s;
    sc.top = s;
    sc.bottom = -s;
    sc.near = 0.5;
    sc.far = 60;
    sc.updateProjectionMatrix();
  }

  /**
   * The office fills the screen; frame the room in the visible gap between the
   * HUD (top inset) and the dock and tab bar (bottom inset).
   */
  private applyFrustum() {
    const { minX, maxX, minY, maxY } = this.roomBox;
    const w = Math.max(1, this.width);
    const h = Math.max(1, this.height);
    const top = Math.min(this.insets.top, h * 0.45);
    const bottom = Math.min(this.insets.bottom, h * 0.45);
    const freeFrac = Math.max(0.2, (h - top - bottom) / h);
    const aspect = w / h;
    const roomW = maxX - minX;
    const roomH = maxY - minY;
    // Frustum height that fits the room both across and into the free band.
    const frustumH = Math.max(roomH / freeFrac, roomW / aspect);
    const frustumW = frustumH * aspect;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Put the room's centre in the middle of the free band.
    const centreFromTop = (top + (h - top - bottom) / 2) / h;
    this.camera.left = cx - frustumW / 2;
    this.camera.right = cx + frustumW / 2;
    this.camera.top = cy + frustumH * centreFromTop;
    this.camera.bottom = this.camera.top - frustumH;
    this.camera.updateProjectionMatrix();
  }

  setInsets(top: number, bottom: number) {
    if (Math.abs(top - this.insets.top) < 2 && Math.abs(bottom - this.insets.bottom) < 2) return;
    this.insets = { top, bottom };
    this.applyFrustum();
  }

  private resize() {
    const w = this.el.clientWidth || 360;
    const h = this.el.clientHeight || 640;
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.applyFrustum();
  }

  // -------------------------------------------------------------------------
  // Light & sky
  // -------------------------------------------------------------------------

  private updateLighting(light: Daylight, time: number) {
    const day = Math.max(0, light.sun);
    // The sun swings across the sky; low and orange at dawn and dusk.
    const az = (light.tod - 0.5) * Math.PI * 1.6;
    this.sun.position.set(7 + Math.sin(az) * 6, 3 + day * 14, 9 + Math.cos(az) * 3);
    this.sun.target.position.set(0, 0, 0);
    this.sun.intensity = 0.25 + day * 2.4;
    this.sun.color.setHSL(0.1 - light.dusk * 0.04, 0.4 + light.dusk * 0.5, 0.75 + day * 0.2);
    this.hemi.intensity = 0.5 + day * 0.7;
    this.hemi.color.set(light.sun < -0.2 ? '#6070b0' : '#cfe3ff');
    this.hemi.groundColor.set(light.sun < -0.2 ? '#2a221c' : '#5a4a3a');
    const lampOn = Math.min(1, light.dark * 2.4);
    this.lamps.forEach((l) => (l.intensity = lampOn * (this.level === 0 ? 7 : 5) * (1 + Math.sin(time * 11) * 0.02)));
    for (const d of this.desks) if (d.lampGlow) (d.lampGlow.material as THREE.SpriteMaterial).opacity = light.dark * 1.2;
    // The tabletop the diorama sits on dims smoothly with the evening.
    this.backdrop.copy(BACKDROP_DAY).lerp(BACKDROP_NIGHT, light.dark * 2);
    this.renderer.setClearColor(this.backdrop);
  }

  private drawSky(light: Daylight, time: number) {
    const c = this.skyCanvas.getContext('2d')!;
    const w = this.skyCanvas.width;
    const h = this.skyCanvas.height;
    const night = light.sun < -0.25;
    const dusk = !night && light.dusk > 0.3;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, night ? '#0f1430' : dusk ? '#4a5aa8' : '#5aa8e8');
    g.addColorStop(1, night ? '#1f2a55' : dusk ? '#f29a5a' : '#a8dcf5');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    if (night) {
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 60; i++) if ((i + Math.floor(time * 2)) % 9) c.fillRect((i * 37) % w, (i * 53) % (h * 0.7), 2, 2);
      c.fillStyle = '#f4f1d8';
      c.beginPath();
      c.arc(w - 30, 20, 10, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#0f1430';
      c.beginPath();
      c.arc(w - 25, 17, 9, 0, Math.PI * 2);
      c.fill();
    } else {
      c.fillStyle = dusk ? '#ffb05a' : '#fff2b0';
      c.beginPath();
      c.arc((light.tod - 0.25) * 2 * w, 14 + (1 - light.sun) * (h - 30), 9, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.9)';
      const cx = ((time * 8) % (w + 60)) - 40;
      c.fillRect(cx, 18, 36, 8);
      c.fillRect(cx + 8, 12, 18, 8);
    }
    if (this.level === 3) {
      // City skyline with lit windows.
      for (let x = 0; x < w; x += 22) {
        const bh = 24 + ((x * 37) % 40);
        c.fillStyle = night ? '#1d2546' : '#4a5a86';
        c.fillRect(x, h - bh, 20, bh);
        c.fillStyle = '#ffe7a3';
        for (let y = h - bh + 5; y < h - 3; y += 7) for (let wx = x + 3; wx < x + 18; wx += 6) if (night ? (wx + y) % 5 : (wx * 7 + y * 3) % 9 === 0) c.fillRect(wx, y, 3, 3);
      }
    }
    this.skyTex.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Screens
  // -------------------------------------------------------------------------

  private drawScreen(desk: Desk, s: Staff | undefined, mode: Mode, animating: boolean, zone: boolean, time: number, look: Look | null) {
    const c = desk.screenCanvas.getContext('2d')!;
    const w = desk.screenCanvas.width;
    const h = desk.screenCanvas.height;
    if (!s) {
      c.fillStyle = '#0c0b12';
      c.fillRect(0, 0, w, h);
      desk.screenTex.needsUpdate = true;
      return;
    }
    const mono = this.era === 'crt-mono';
    if (mode === 'idle') {
      c.fillStyle = '#10142a';
      c.fillRect(0, 0, w, h);
      const px = Math.abs(((time * 40 + (look?.phase ?? 0) * 300) % (2 * (w - 12))) - (w - 12));
      const py = Math.abs(((time * 26 + (look?.phase ?? 0) * 150) % (2 * (h - 12))) - (h - 12));
      c.fillStyle = mono ? '#4cff7a' : '#7c5cff';
      c.fillRect(px, py, 12, 12);
    } else {
      c.fillStyle = zone ? '#2a1f08' : mode === 'polish' ? '#1f1014' : mono ? '#06140a' : '#0f1424';
      c.fillRect(0, 0, w, h);
      const rate = animating ? (zone ? 9 : 3) : 0;
      const scroll = time * rate + (look?.phase ?? 0) * 50;
      const first = Math.floor(scroll);
      const frac = scroll - first;
      for (let i = 0; i < 9; i++) {
        const line = first + i;
        const ly = 6 + Math.round((i - frac) * 9);
        if (ly < 2 || ly > h - 8) continue;
        const seed = (line * 9301 + 49297 + s.id * 233) % 233280;
        const indent = (seed % 4) * 10;
        const len = 16 + (seed % 11) * 7;
        let col = CODE[seed % CODE.length];
        if (mono) col = seed % 3 ? '#4cff7a' : '#2fbf5a';
        if (mode === 'polish') col = seed % 3 === 0 ? '#ff5c6c' : '#3ddc97';
        if (zone) col = seed % 2 ? '#ffd25c' : '#ffad3b';
        c.fillStyle = col;
        c.fillRect(6 + indent, ly, Math.min(len, w - 12 - indent), 4);
      }
      if (animating && Math.floor(time * 3) % 2) {
        c.fillStyle = '#ffffff';
        c.fillRect(8 + ((time * 40) % (w - 20)), h - 10, 5, 6);
      }
    }
    if (this.era === 'crt' || mono) {
      c.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
    }
    desk.screenTex.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Posing people
  // -------------------------------------------------------------------------

  private poseSeated(r: Rig, desk: Desk, mode: Mode, animating: boolean, zone: boolean, gt: number) {
    if (r.root.parent !== this.world) this.world.add(r.root);
    r.root.position.copy(desk.seat);
    sitLegs(r);
    r.handMug.visible = false;
    const { g, p } = gestureFor(r.id, r.look, gt, mode, zone);
    const target = poseFor(g);
    if (mode === 'idle' && g === 'type') Object.assign(target, poseFor('relax'));
    // Ease towards the target pose so gestures blend smoothly.
    const k = 0.18;
    for (const key of Object.keys(target) as (keyof Pose)[]) r.pose[key] += (target[key] - r.pose[key]) * k;

    const typing = (g === 'type' || g === 'lean' || g === 'look') && animating;
    const extra: Partial<Pose> = {};
    if (typing) {
      // Big enough to read on a phone: hands take turns hopping on the keys,
      // drift across the keyboard, and every few seconds slam Enter.
      const tempo = zone ? 2.3 : g === 'lean' ? 1.5 : 1;
      const ph = gt * 7.5 * tempo + r.look.phase * 10;
      extra.lFoX = Math.max(0, Math.sin(ph)) * 0.55;
      extra.rFoX = Math.max(0, -Math.sin(ph)) * 0.55;
      extra.lUpZ = Math.sin(ph * 0.21) * 0.2;
      extra.rUpZ = Math.sin(ph * 0.21 + 1.3) * 0.2;
      extra.lUpX = Math.abs(Math.sin(ph * 0.5)) * 0.12;
      extra.rUpX = Math.abs(Math.cos(ph * 0.5)) * 0.12;
      const slam = (gt * 0.35 * tempo + r.look.phase * 3) % 1;
      if (slam < 0.14) {
        // Wind up and hit Enter with the right hand.
        extra.rFoX = Math.sin((slam / 0.14) * Math.PI) * 1.1;
        extra.rUpX = Math.sin((slam / 0.14) * Math.PI) * 0.35;
      }
      extra.headX = Math.max(0, Math.sin(ph * 0.25)) * 0.16; // nod along
      extra.headY = Math.sin(ph * 0.09 + r.look.phase * 5) * 0.18; // read across the screen
      extra.torsoZ = Math.sin(ph * 0.5) * 0.06; // shoulders shift with the hands
      extra.torsoX = Math.abs(Math.sin(ph)) * 0.04;
    }
    if (g === 'look') extra.headY = p < 0.5 ? 0.7 : -0.7;
    if (g === 'think') extra.rFoX = Math.sin(gt * 18) * 0.3; // scratch scratch
    if (g === 'point') extra.rUpX = Math.max(0, Math.sin(gt * 9)) * 0.25; // tap the screen
    if (g === 'stretch') extra.lUpZ = -(extra.rUpZ = Math.sin(gt * 3) * 0.15);
    if (g === 'relax') extra.torsoX = Math.sin(gt * 1.6 + r.look.phase * 3) * 0.04; // breathing
    if (zone) extra.torsoX = (extra.torsoX ?? 0) - 0.12 + Math.sin(gt * 20) * 0.04; // hunched in, buzzing
    if (g === 'sip') {
      r.handMug.visible = true;
      extra.rFoX = p > 0.25 && p < 0.75 ? 0.25 : 0;
    }
    applyPose(r, r.pose, extra);
    // Swivelling turns the person and their chair.
    const yaw = g === 'swivel' ? Math.sin(gt * 2.4 + r.look.phase * 4) * 0.45 : 0;
    r.pose.yaw += (yaw - r.pose.yaw) * k;
    r.root.rotation.y = r.pose.yaw;
    desk.chair.rotation.y = r.pose.yaw;
  }

  private poseWalker(r: Rig, w: Walk, time: number) {
    // Position along the path.
    const dist = w.stage === 'sip' ? w.length : w.stage === 'out' ? Math.min(w.length, w.t * WALK_SPEED) : Math.max(0, w.length - w.t * WALK_SPEED);
    let d = dist;
    let pos = w.path[0].clone();
    let dir = new THREE.Vector3(0, 0, -1);
    for (let i = 1; i < w.path.length; i++) {
      const seg = w.path[i].clone().sub(w.path[i - 1]);
      const len = seg.length();
      if (d <= len || i === w.path.length - 1) {
        pos = w.path[i - 1].clone().add(seg.clone().multiplyScalar(Math.min(1, d / (len || 1))));
        dir = seg.normalize();
        break;
      }
      d -= len;
    }
    if (w.stage === 'back') dir.negate();
    if (w.stage === 'sip') dir.set(0, 0, 1);
    r.root.position.set(pos.x, 0.44, pos.z);
    r.root.rotation.y = Math.atan2(-dir.x, -dir.z);
    const walking = w.stage !== 'sip';
    const swing = walking ? Math.sin(time * 9) * 0.5 : 0;
    r.lHip.rotation.set(swing, 0, 0);
    r.rHip.rotation.set(-swing, 0, 0);
    r.lKnee.rotation.set(walking ? -Math.max(0, -swing) * 0.8 : 0, 0, 0);
    r.rKnee.rotation.set(walking ? -Math.max(0, swing) * 0.8 : 0, 0, 0);
    r.handMug.visible = w.stage !== 'out';
    const sipping = w.stage === 'sip' && Math.sin(w.t * 2.2) > 0.3;
    const pose: Pose = {
      ...ZERO_POSE,
      lUpX: -swing * 0.6,
      lFoX: 0.2,
      rUpX: sipping ? 0.55 : w.stage === 'out' ? swing * 0.6 : 0.45,
      rUpZ: sipping ? -0.25 : 0,
      rFoX: sipping ? 2.3 : w.stage === 'out' ? 0.2 : 1.2,
    };
    applyPose(r, pose);
  }

  private animateFire(r: Rig, time: number) {
    for (const f of r.fire) {
      const life = (time * f.speed + f.phase) % 1;
      const wobble = Math.sin(time * 11 + f.phase * 20) * 0.04;
      f.sprite.position.set(f.base.x + wobble, f.base.y + life * f.rise, f.base.z);
      const s = f.size * (1 - life * 0.65) * (0.9 + Math.sin(time * 23 + f.phase * 9) * 0.1);
      f.sprite.scale.set(s * 0.6, s, 1);
      const m = f.sprite.material as THREE.SpriteMaterial;
      m.opacity = Math.sin(life * Math.PI) * 0.95;
      m.color.setRGB(1, 0.85 - life * 0.45, 0.6 - life * 0.55);
    }
  }

  // -------------------------------------------------------------------------
  // Coffee breaks (same rules as the 2D scene)
  // -------------------------------------------------------------------------

  private updateWalk(r: Rig, desk: Desk, mode: Mode, zone: boolean, dt: number, people: number): Walk | undefined {
    let w = this.walks.get(r.id);
    if (!w) {
      if (zone || dt === 0) return undefined;
      const perSecond = mode === 'idle' ? 1 / 20 : mode === 'polish' ? 1 / 55 : 1 / 40;
      const maxAway = Math.max(1, Math.floor(people / 3));
      if (this.walks.size >= maxAway || Math.random() > perSecond * dt) return undefined;
      const used = new Set([...this.walks.values()].map((x) => x.slot));
      let slot = 0;
      while (used.has(slot)) slot++;
      // Out from behind the chair, along the aisle, then up the right-hand side to the machine.
      const aisleZ = desk.seat.z + 0.75;
      const walkX = this.roomW / 2 - 0.45;
      const spot = new THREE.Vector3(this.machine.x - 0.3 - slot * 0.55, 0, this.machine.z + 0.75);
      const path = [desk.seat.clone(), new THREE.Vector3(desk.seat.x, 0, aisleZ), new THREE.Vector3(walkX, 0, aisleZ), new THREE.Vector3(walkX, 0, spot.z), spot];
      let length = 0;
      for (let i = 1; i < path.length; i++) length += path[i].distanceTo(path[i - 1]);
      w = { stage: 'out', t: 0, slot, path, length };
      this.walks.set(r.id, w);
      if (Math.random() < 0.5) this.say(r.id, '☕?', 1.6);
      return w;
    }
    w.t += dt;
    const trip = w.length / WALK_SPEED;
    if (w.stage === 'out' && w.t >= trip) {
      w.stage = 'sip';
      w.t = 0;
      this.say(r.id, pickLine(LINES.sip), 2);
    } else if (w.stage === 'sip' && w.t >= SIP_TIME) {
      w.stage = 'back';
      w.t = 0;
    } else if (w.stage === 'back' && w.t >= trip) {
      this.walks.delete(r.id);
      return undefined;
    }
    return w;
  }

  // -------------------------------------------------------------------------
  // The studio cat
  // -------------------------------------------------------------------------

  private buildCat() {
    const fur = '#e8913a';
    const stripe = '#b5652a';
    const body = part(this.cat, 0.42, 0.2, 0.2, fur, 0, 0.22, 0, { shadow: true });
    part(body, 0.15, 1.02, 1.02, stripe, -0.15, 0, 0);
    part(body, 0.15, 1.02, 1.02, stripe, 0.18, 0, 0);
    const head = group(this.cat, 0.25, 0.34, 0);
    part(head, 0.18, 0.16, 0.18, fur, 0, 0, 0, { shadow: true });
    part(head, 0.06, 0.08, 0.05, fur, 0.02, 0.11, -0.05, { geo: CONE });
    part(head, 0.06, 0.08, 0.05, fur, 0.02, 0.11, 0.05, { geo: CONE });
    part(head, 0.01, 0.03, 0.03, '#15131f', 0.09, 0.02, -0.045);
    part(head, 0.01, 0.03, 0.03, '#15131f', 0.09, 0.02, 0.045);
    const tail = group(this.cat, -0.2, 0.28, 0);
    part(tail, 0.05, 0.3, 0.05, fur, 0, 0.14, 0);
    const legs = [
      [0.14, -0.06],
      [0.14, 0.06],
      [-0.14, -0.06],
      [-0.14, 0.06],
    ].map(([x, z]) => part(this.cat, 0.05, 0.14, 0.05, fur, x, 0.07, z));
    this.cat.userData.id = CAT_ID;
    this.catParts = { body, head, tail, legs };
  }

  private updateCat(dt: number, time: number) {
    const cat = this.catState;
    const parts = this.catParts!;
    const minX = -this.roomW / 2 + 0.5;
    const maxX = this.roomW / 2 - 1.2;
    if (dt > 0) {
      cat.t += dt;
      if (cat.mode === 'walk') {
        cat.x += 0.45 * dt * cat.dir;
        if ((cat.dir > 0 && cat.x >= cat.target) || (cat.dir < 0 && cat.x <= cat.target)) {
          cat.x = cat.target;
          cat.mode = Math.random() < 0.4 ? 'sleep' : 'sit';
          cat.t = 0;
          if (cat.mode === 'sleep' && Math.random() < 0.5) this.say(CAT_ID, '💤', 2.5);
        }
      } else if (cat.t > (cat.mode === 'sleep' ? 14 : 5) && Math.random() < dt * 0.5) {
        cat.target = minX + Math.random() * (maxX - minX);
        cat.dir = cat.target > cat.x ? 1 : -1;
        cat.mode = 'walk';
        cat.t = 0;
        if (Math.random() < 0.25) this.say(CAT_ID, pickLine(['Meow', '🐟?', 'Mrrp']), 1.6);
      }
    }
    cat.x = Math.max(minX, Math.min(maxX, cat.x));
    this.cat.position.set(cat.x, 0, this.roomD / 2 - 0.45);
    this.cat.rotation.y = cat.dir > 0 ? 0 : Math.PI;
    const step = cat.mode === 'walk' ? Math.sin(time * 12) * 0.5 : 0;
    parts.legs.forEach((l, i) => (l.rotation.z = i % 2 ? step : -step));
    parts.legs.forEach((l) => (l.visible = cat.mode !== 'sleep'));
    if (cat.mode === 'sleep') {
      parts.body.position.y = 0.1 + Math.sin(time * 2.5) * 0.008;
      parts.body.scale.set(0.42, 0.16, 0.24);
      parts.head.position.set(0.22, 0.14, 0);
      parts.head.rotation.set(0, 0, -0.3);
      parts.tail.rotation.set(HALF_PI, 0, 0.2);
      parts.tail.position.set(-0.18, 0.08, 0.08);
    } else if (cat.mode === 'sit') {
      parts.body.position.y = 0.22;
      parts.body.scale.set(0.32, 0.26, 0.2);
      parts.body.rotation.z = 0.5;
      parts.head.position.set(0.16, 0.42, 0);
      parts.head.rotation.set(0, 0, 0);
      parts.tail.position.set(-0.16, 0.06, 0);
      parts.tail.rotation.set(HALF_PI * 0.9, Math.sin(time * 3) * 0.6, 0);
    } else {
      parts.body.position.y = 0.22;
      parts.body.scale.set(0.42, 0.2, 0.2);
      parts.body.rotation.z = 0;
      parts.head.position.set(0.25, 0.34, 0);
      parts.head.rotation.set(0, 0, Math.sin(time * 6) * 0.05);
      parts.tail.position.set(-0.2, 0.28, 0);
      parts.tail.rotation.set(0, 0, 0.4 + Math.sin(time * 4) * 0.2);
    }
  }

  // -------------------------------------------------------------------------
  // Particles
  // -------------------------------------------------------------------------

  private emitWork(desk: Desk, zone: boolean, mode: Mode, dt: number) {
    const rate = zone ? 30 : 1.5;
    if (Math.random() > rate * dt) return;
    const colors = zone ? ['#ffd25c', '#ffad3b', '#ff6b4a', '#ffffff'] : mode === 'polish' ? ['#3ddc97'] : ['#4fb3ff', '#ffad3b'];
    const base = desk.seat.clone();
    this.particles.push({
      pos: new THREE.Vector3(base.x + (Math.random() - 0.5) * 0.6, zone ? 1.0 + Math.random() * 0.8 : 1.4, base.z - (zone ? 0.05 : 0.85)),
      vel: new THREE.Vector3((Math.random() - 0.5) * (zone ? 0.6 : 0.15), zone ? 1.4 + Math.random() * 1.2 : 0.35, 0),
      life: 0,
      max: zone ? 0.7 + Math.random() * 0.5 : 1.3,
      color: new THREE.Color(colors[Math.floor(Math.random() * colors.length)]),
    });
    if (this.particles.length > 300) this.particles.shift();
  }

  private updateParticles(dt: number) {
    const pos = this.pointsGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.pointsGeo.getAttribute('color') as THREE.BufferAttribute;
    this.particles = this.particles.filter((p) => (p.life += dt) < p.max);
    this.particles.forEach((p, i) => {
      p.pos.addScaledVector(p.vel, dt);
      pos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      const fade = 1 - p.life / p.max;
      col.setXYZ(i, p.color.r * fade, p.color.g * fade, p.color.b * fade);
    });
    this.pointsGeo.setDrawRange(0, this.particles.length);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Speech bubbles, labels and taps
  // -------------------------------------------------------------------------

  private maybeChatter(s: Staff, mode: Mode, zone: boolean, dt: number, people: number) {
    if (dt === 0 || this.bubbles.has(s.id)) return;
    const maxBubbles = Math.max(2, Math.ceil(people / 3));
    if (this.bubbles.size >= maxBubbles) return;
    const perSecond = zone ? 1 / 5 : mode === 'idle' ? 1 / 14 : 1 / 16;
    if (Math.random() > perSecond * dt) return;
    const list = zone ? LINES.zone : mode === 'idle' ? LINES.idle : mode === 'polish' ? LINES.polish : s.design >= s.tech ? LINES.design : LINES.tech;
    this.say(s.id, pickLine(list));
  }

  /** Projects a world position to pixel coordinates inside the scene element. */
  private toScreen(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * this.el.clientWidth, y: ((1 - p.y) / 2) * this.el.clientHeight };
  }

  private anchorFor(id: number): THREE.Vector3 | null {
    if (id === CAT_ID) return this.cat.position.clone().add(new THREE.Vector3(0.2, 0.55, 0));
    const r = this.rigs.get(id);
    if (!r) return null;
    const v = new THREE.Vector3();
    r.head.getWorldPosition(v);
    return v.add(new THREE.Vector3(0.12, 0.45, 0));
  }

  private updateOverlays(zoners: Rig[], dt: number, time: number) {
    for (const [id, b] of this.bubbles) {
      b.age += dt;
      const gone = b.age >= b.life || (id !== CAT_ID && !this.staffIds.includes(id));
      if (gone) {
        b.el.remove();
        this.bubbles.delete(id);
        continue;
      }
      const a = this.anchorFor(id);
      b.el.style.display = a && b.age >= 0 ? '' : 'none';
      if (!a) continue;
      const { x, y } = this.toScreen(a);
      b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      b.el.style.opacity = String(Math.min(1, (b.life - b.age) / 0.3));
    }
    const live = new Set(zoners.map((r) => r.id));
    for (const [id, el] of this.zoneLabels) {
      if (!live.has(id)) {
        el.remove();
        this.zoneLabels.delete(id);
      }
    }
    for (const r of zoners) {
      let el = this.zoneLabels.get(r.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'zone3d';
        el.textContent = 'IN THE ZONE';
        this.overlay.appendChild(el);
        this.zoneLabels.set(r.id, el);
      }
      const v = new THREE.Vector3();
      r.head.getWorldPosition(v);
      const { x, y } = this.toScreen(v.add(new THREE.Vector3(0, 1.45 + Math.sin(time * 6) * 0.04, 0)));
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  }

  private onTap(e: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = [...[...this.rigs.values()].map((r) => r.root), this.cat];
    for (const hit of this.raycaster.intersectObjects(targets, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && o.userData.id === undefined) o = o.parent;
      if (!o) continue;
      const id = o.userData.id as number;
      if (id === CAT_ID) {
        this.say(CAT_ID, pickLine(['❤️', 'Purr…', 'Mrrp!', '😺']), 1.8);
        if (this.catState.mode === 'sleep') this.catState = { ...this.catState, mode: 'sit', t: 0 };
      } else {
        const r = this.rigs.get(id);
        if (r) this.say(id, `👋 ${r.name === 'You' ? 'Hey boss!' : r.name.split(' ')[0]}`, 2);
      }
      return;
    }
  }
}

/** Creates the 3D office, or returns null when WebGL isn't available. */
export function createOffice3D(): Office3D | null {
  try {
    const probe = document.createElement('canvas');
    if (!probe.getContext('webgl2') && !probe.getContext('webgl')) return null;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    return new Office3D(renderer);
  } catch {
    return null;
  }
}
