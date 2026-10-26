/*
 * NutriAI homepage 3D food showcase.
 *
 * Plain ES module, no build step. It does NOT edit the compiled app bundle:
 * it waits for the hero <img src=".../generated_893f3711.webp"> to appear,
 * puts a 3D stage on top of it, and only hides the photo once the 3D model has
 * actually rendered. If anything fails (no WebGL, model 404, script error, lost
 * GL context) the original photo simply stays visible.
 *
 * Needs the import map in index.html (three.js is loaded from a pinned CDN version).
 * Models live in /models/*.glb.
 */

/* ---------- configuration ---------- */

const TARGET_SELECTOR = 'img[src$="generated_893f3711.webp"]';
const LAST_FOOD_KEY = 'nutriai:last-hero-food';

export const FOODS = [
  { id: 'gado-gado', url: '/models/gado-gado.glb', label: 'Gado-gado salad' },
  { id: 'salmon-brussels', url: '/models/salmon-brussels.glb', label: 'Salmon & brussels sprouts' },
  { id: 'bowl-of-salads', url: '/models/bowl-of-salads.glb', label: 'Mixed salad bowl' },
];

const LOOK = {
  footprint: 2.0,        // every model is scaled so its widest ground dimension is this many units
  fov: 28,
  elevationDeg: 32,      // camera looks down at the food from this angle
  fitRadius: 1.4,        // how much room the model gets inside the frame (bigger = smaller model)
  spinSpeed: 0.2,        // radians per second (about 31 s per full turn)
  tiltX: 0.17,           // max tilt toward the cursor (radians)
  tiltZ: 0.13,
  tiltDamping: 4.5,      // higher = snappier follow / return
};

const ENTRANCE = {
  first:  { dur: 1500, dy: -0.75, scale0: 0.82, yaw0: -1.1, fadeFrom: 0 },
  replay: { dur: 1000, dy: -0.35, scale0: 0.92, yaw0: -0.5, fadeFrom: 0.35 },
};

/* ---------- small pure helpers (also unit-tested) ---------- */

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

/** Fair random pick that avoids repeating `lastId` when there is more than one food. */
export function pickFood(foods, lastId, rand = Math.random) {
  const pool = foods.length > 1 ? foods.filter((f) => f.id !== lastId) : foods;
  const list = pool.length ? pool : foods;
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

/* ---------- once-per-page-load state ---------- */

let chosenFood = null;     // chosen on first mount, then stable for the whole page visit
let disabled = false;      // set after a hard failure so we do not retry on every route change
let active = null;         // { img, dispose }
let mounting = false;

function chooseFoodOnce() {
  if (chosenFood) return chosenFood;
  let last = null;
  try { last = localStorage.getItem(LAST_FOOD_KEY); } catch (_) { /* storage blocked */ }
  chosenFood = pickFood(FOODS, last);
  try { localStorage.setItem(LAST_FOOD_KEY, chosenFood.id); } catch (_) { /* ignore */ }
  return chosenFood;
}

/* ---------- styles ---------- */

function injectStyles() {
  if (document.getElementById('n3d-styles')) return;
  const style = document.createElement('style');
  style.id = 'n3d-styles';
  style.textContent = `
.n3d-stage{--n3d-center:color-mix(in oklch,var(--c-canvas),white 65%);--n3d-edge:var(--c-bone);
  position:absolute;top:0;left:0;width:100%;aspect-ratio:4/5;border-radius:2.25rem;overflow:hidden;
  border:1px solid var(--c-line);
  background:radial-gradient(120% 90% at 50% 32%,var(--n3d-center) 0%,var(--n3d-edge) 100%);
  box-shadow:0 25px 50px -12px oklch(24% .03 250/.2);
  opacity:0;transition:opacity .5s ease;touch-action:pan-y}
.dark .n3d-stage{--n3d-center:var(--c-bone);--n3d-edge:var(--c-canvas);box-shadow:0 25px 50px -12px oklch(0% 0 0/.55)}
.n3d-stage.n3d-ready{opacity:1}
.n3d-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0}
.n3d-frame{position:absolute;inset:0;pointer-events:none}
.n3d-corner{position:absolute;width:18px;height:18px;border:0 solid color-mix(in oklch,var(--c-ink) 32%,transparent)}
.n3d-corner.tl{top:18px;left:18px;border-top-width:1.5px;border-left-width:1.5px;border-top-left-radius:6px}
.n3d-corner.tr{top:18px;right:18px;border-top-width:1.5px;border-right-width:1.5px;border-top-right-radius:6px}
.n3d-corner.bl{bottom:18px;left:18px;border-bottom-width:1.5px;border-left-width:1.5px;border-bottom-left-radius:6px}
.n3d-corner.br{bottom:18px;right:18px;border-bottom-width:1.5px;border-right-width:1.5px;border-bottom-right-radius:6px}
.n3d-scan{position:absolute;left:12%;right:12%;top:12%;height:2px;opacity:0;border-radius:2px;
  background:linear-gradient(90deg,transparent,var(--c-accent),transparent)}
.n3d-stage.n3d-scanning .n3d-scan{animation:n3d-scan 2.4s cubic-bezier(.45,0,.25,1) 1 forwards}
@keyframes n3d-scan{0%{opacity:0;top:12%}15%{opacity:.55}85%{opacity:.55}100%{opacity:0;top:86%}}
.n3d-chip{position:absolute;top:16px;right:16px;max-width:calc(100% - 32px);display:flex;align-items:center;gap:8px;
  padding:7px 12px;border-radius:999px;pointer-events:none;
  background:var(--c-glass);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid var(--c-line);
  color:var(--c-ink);font:500 11px/1 var(--font-mono,ui-monospace,monospace);letter-spacing:.02em;white-space:nowrap}
.n3d-chip-text{overflow:hidden;text-overflow:ellipsis}
.n3d-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--c-accent)}
@media (prefers-reduced-motion:reduce){.n3d-stage{transition:none}.n3d-stage.n3d-scanning .n3d-scan{animation:none}}
`;
  document.head.appendChild(style);
}

/* ---------- the showcase ---------- */

async function createShowcase(img, food) {
  const parent = img.parentElement;
  if (!parent) throw new Error('hero image has no parent');

  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!gl) throw new Error('WebGL unavailable');
  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();

  injectStyles();

  const cleanups = [];
  let disposed = false;
  let stage = null;
  let renderer = null;
  let raf = 0;
  let running = false;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motionQuery.matches;

  const fail = (err) => {
    console.warn('[NutriAI 3D hero] falling back to the photo:', err);
    dispose();
  };

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    running = false;
    cleanups.splice(0).reverse().forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
    if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
    img.style.visibility = '';
  }

  try {
    // Fetch the model in parallel with the three.js download.
    const modelBytes = fetch(food.url).then((r) => {
      if (!r.ok) throw new Error(`model request failed (${r.status})`);
      return r.arrayBuffer();
    });
    const [THREE, loaderMod, envMod, bytes] = await Promise.all([
      import('three'),
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/environments/RoomEnvironment.js'),
      modelBytes,
    ]);
    if (disposed || !img.isConnected) return { img, dispose };

    /* stage DOM, placed right after the photo so the app's glass cards stay on top */
    stage = document.createElement('div');
    stage.className = 'n3d-stage';
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-label', `Interactive 3D model of ${food.label}`);
    const frame = document.createElement('div');
    frame.className = 'n3d-frame';
    frame.setAttribute('aria-hidden', 'true');
    ['tl', 'tr', 'bl', 'br'].forEach((c) => {
      const s = document.createElement('span');
      s.className = `n3d-corner ${c}`;
      frame.appendChild(s);
    });
    const scan = document.createElement('span');
    scan.className = 'n3d-scan';
    frame.appendChild(scan);
    const chip = document.createElement('div');
    chip.className = 'n3d-chip';
    chip.setAttribute('aria-hidden', 'true');
    const dot = document.createElement('span');
    dot.className = 'n3d-dot';
    const chipText = document.createElement('span');
    chipText.className = 'n3d-chip-text';
    chipText.textContent = `Meal Vision preview · ${food.label}`;
    chip.append(dot, chipText);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NoToneMapping; // keep the scanned food colors true to the photos
    const canvas = renderer.domElement;
    canvas.className = 'n3d-canvas';
    cleanups.push(() => { renderer.dispose(); renderer.forceContextLoss(); });
    stage.append(canvas, frame, chip);
    img.insertAdjacentElement('afterend', stage);

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail('WebGL context lost'); });

    /* scene */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(LOOK.fov, 0.8, 0.1, 50);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new envMod.RoomEnvironment(), 0.04).texture;
    cleanups.push(() => { envTexture.dispose(); pmrem.dispose(); });
    scene.environment = envTexture;
    scene.environmentIntensity = 0.75;
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(2.5, 4, 3);
    scene.add(key, new THREE.HemisphereLight(0xffffff, 0x9aa4b2, 0.45));

    const root = new THREE.Group();   // entrance + cursor tilt
    const spin = new THREE.Group();   // slow turntable rotation
    root.add(spin);
    scene.add(root);

    const gltf = await new Promise((resolve, reject) => {
      new loaderMod.GLTFLoader().parse(bytes, '', resolve, reject);
    });
    if (disposed || !img.isConnected) return { img, dispose };

    /* normalize: same footprint for every model, centered on the origin */
    const model = gltf.scene;
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    model.updateMatrixWorld(true);
    box.setFromObject(model).getSize(size);
    model.scale.multiplyScalar(LOOK.footprint / Math.max(size.x, size.z, 1e-6));
    model.updateMatrixWorld(true);
    box.setFromObject(model).getCenter(center);
    model.position.sub(center);
    spin.add(model);
    box.setFromObject(model).getSize(size);

    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        ['map', 'normalMap', 'metalnessMap', 'roughnessMap'].forEach((k) => {
          if (m[k]) m[k].anisotropy = maxAniso;
        });
      });
    });

    /* soft contact shadow under the dish (does not spin) */
    const sc = document.createElement('canvas');
    sc.width = sc.height = 128;
    const sg = sc.getContext('2d');
    const grad = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 128, 128);
    const shadowTexture = new THREE.CanvasTexture(sc);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(2.7, 2.7, 1);
    shadow.position.y = -size.y / 2 - 0.05;
    root.add(shadow);

    /* camera framing, recalculated on resize */
    function fit() {
      const w = Math.max(1, stage.clientWidth);
      const h = Math.max(1, stage.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const vfov = THREE.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const dist = LOOK.fitRadius / Math.sin(Math.min(vfov, hfov) / 2);
      const el = THREE.MathUtils.degToRad(LOOK.elevationDeg);
      camera.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
      camera.lookAt(0, -0.05, 0);
      camera.updateProjectionMatrix();
    }
    fit();
    const ro = new ResizeObserver(() => { fit(); if (!running) renderOnce(); });
    ro.observe(stage);
    cleanups.push(() => ro.disconnect());

    /* animation state */
    const mouse = { x: 0, y: 0 };
    const tilt = { x: 0, z: 0 };
    let touchLike = window.matchMedia('(hover: none)').matches;
    let spinAngle = 0;
    let spinRamp = 0;
    let ent = { ...ENTRANCE.first, start: performance.now() };
    let last = performance.now();

    function startEntrance(kind) {
      ent = { ...ENTRANCE[kind], start: performance.now() };
      stage.classList.remove('n3d-scanning');
      void stage.offsetWidth; // restart the CSS scan animation
      if (!reduced) stage.classList.add('n3d-scanning');
    }

    function update(now, dt) {
      const p = reduced ? 1 : clamp((now - ent.start) / ent.dur, 0, 1);
      const e = easeOutCubic(p);

      if (!reduced) {
        spinRamp = damp(spinRamp, p > 0.35 ? 1 : 0, 2.2, dt);
        spinAngle += dt * LOOK.spinSpeed * spinRamp;
      }

      let tx = mouse.y * LOOK.tiltX;
      let tz = -mouse.x * LOOK.tiltZ;
      if (touchLike) { // no hover on touch screens: gentle idle sway instead
        tx = Math.sin(now / 1900) * 0.05;
        tz = Math.cos(now / 2400) * 0.05;
      }
      if (reduced) { tx = 0; tz = 0; }
      tilt.x = damp(tilt.x, tx, LOOK.tiltDamping, dt);
      tilt.z = damp(tilt.z, tz, LOOK.tiltDamping, dt);

      root.position.y = lerp(ent.dy, 0, e);
      root.scale.setScalar(lerp(ent.scale0, 1, e));
      root.rotation.set(tilt.x, 0, tilt.z);
      spin.rotation.y = spinAngle + lerp(ent.yaw0, 0, e);
      canvas.style.opacity = String(lerp(ent.fadeFrom, 1, clamp(p / 0.6, 0, 1)));
    }

    function frame_(now) {
      raf = requestAnimationFrame(frame_);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(now, dt);
      renderer.render(scene, camera);
    }
    function start() {
      if (running || disposed || reduced) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame_);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }
    function renderOnce() {
      if (disposed) return;
      update(performance.now(), 0.016);
      renderer.render(scene, camera);
    }
    cleanups.push(stop);

    /* pointer: tilt toward the cursor, drift back when it leaves. Never blocks clicks or scrolling. */
    const onMove = (e) => {
      if (e.pointerType === 'touch') return;
      touchLike = false;
      const r = stage.getBoundingClientRect();
      mouse.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      mouse.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    };
    const onLeave = () => { mouse.x = 0; mouse.y = 0; };
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', onLeave);
    cleanups.push(() => {
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
    });

    /* visibility: pause when scrolled away, replay a restrained entrance when coming back */
    let inView = true;
    let hiddenSince = null;
    const io = new IntersectionObserver(([entry]) => {
      const ratio = entry.intersectionRatio;
      inView = ratio >= 0.02;
      if (!inView) {
        if (hiddenSince === null) hiddenSince = performance.now();
        stop();
        return;
      }
      if (hiddenSince !== null && ratio >= 0.3) {
        const away = performance.now() - hiddenSince;
        hiddenSince = null;
        if (away > 400 && !reduced) startEntrance('replay');
      }
      if (!document.hidden) { if (reduced) renderOnce(); else start(); }
    }, { threshold: [0, 0.02, 0.3, 0.6] });
    io.observe(stage);
    cleanups.push(() => io.disconnect());

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (inView) { if (reduced) renderOnce(); else start(); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

    const onMotionChange = () => {
      reduced = motionQuery.matches;
      if (reduced) { stop(); spinAngle = 0; renderOnce(); } else if (inView) start();
    };
    motionQuery.addEventListener('change', onMotionChange);
    cleanups.push(() => motionQuery.removeEventListener('change', onMotionChange));

    /* theme changes only restyle the CSS gradient; the 3D scene is theme-independent */

    /* first frame, then reveal: the photo is only hidden after a real render */
    update(performance.now(), 0.016);
    renderer.render(scene, camera);
    requestAnimationFrame(() => {
      if (disposed) return;
      stage.classList.add('n3d-ready');
      ent.start = performance.now();
      if (!reduced) stage.classList.add('n3d-scanning');
      if (reduced) renderOnce(); else if (inView) start();
      setTimeout(() => { if (!disposed) img.style.visibility = 'hidden'; }, 550);
    });

    /* free GPU memory on dispose */
    cleanups.push(() => {
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry && o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          Object.keys(m).forEach((k) => { if (m[k] && m[k].isTexture) m[k].dispose(); });
          m.dispose();
        });
      });
      shadow.geometry.dispose();
      shadow.material.dispose();
      shadowTexture.dispose();
    });
  } catch (err) {
    fail(err);
    throw err;
  }

  return { img, dispose };
}

/* ---------- mounting inside the React app ---------- */

async function mount(img) {
  mounting = true;
  img.dataset.n3d = '1';
  try {
    active = await createShowcase(img, chooseFoodOnce());
    if (active && !img.isConnected) { active.dispose(); active = null; }
  } catch (_) {
    disabled = true; // photo stays; do not retry until the next full page load
    active = null;
  } finally {
    mounting = false;
  }
}

function scan() {
  if (active && !active.img.isConnected) { active.dispose(); active = null; }
  if (disabled || active || mounting) return;
  const img = document.querySelector(TARGET_SELECTOR);
  if (img && !img.dataset.n3d) mount(img);
}

if (typeof document !== 'undefined') {
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
}
