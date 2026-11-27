import * as THREE from 'three';
import { gsap } from 'gsap';

const ENV_W = 1.6;
const ENV_H = 1.0;
const FLAP_DEPTH = 0.62;
const SEAL_R = 0.2;
const CAM_Z = 10;
const FOV = 35;

/* ------------------------------------------------------------------ */
/* Canvas textures                                                     */
/* ------------------------------------------------------------------ */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, renderer) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

function goldGradient(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#a8801f');
  g.addColorStop(0.3, '#f3d98b');
  g.addColorStop(0.55, '#d4af37');
  g.addColorStop(0.75, '#fff1c1');
  g.addColorStop(1, '#b88a22');
  return g;
}

function diamondPattern(ctx, w, h, step, alpha) {
  ctx.save();
  ctx.strokeStyle = `rgba(212,175,55,${alpha})`;
  ctx.lineWidth = 1;
  for (let x = -h; x < w + h; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h, h);
    ctx.moveTo(x + h, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.restore();
}

function flourish(ctx, x, y, s, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.lineWidth = 2.2 / s;
  ctx.beginPath();
  ctx.moveTo(0, 60);
  ctx.bezierCurveTo(0, 20, 20, 0, 60, 0);
  ctx.moveTo(10, 60);
  ctx.bezierCurveTo(14, 34, 30, 22, 44, 30);
  ctx.bezierCurveTo(54, 36, 46, 50, 38, 44);
  ctx.moveTo(60, 10);
  ctx.bezierCurveTo(34, 14, 22, 30, 30, 44);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(14, 14, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Outer envelope paper (front pocket / flap). `edges` = polyline(s) in envelope units to trace in gold.
function envelopeTexture(renderer, edges = [], { corners = true } = {}) {
  const W = 1024;
  const H = 640;
  const [c, ctx] = canvas(W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fbf6ea');
  bg.addColorStop(0.55, '#f1e8d3');
  bg.addColorStop(1, '#e6dabe');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // cotton-paper fibres
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  // soft paper sheen
  const sh = ctx.createRadialGradient(W * 0.3, H * 0.15, 10, W * 0.3, H * 0.15, W * 0.85);
  sh.addColorStop(0, 'rgba(255,255,255,0.35)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, W, H);
  // borders
  ctx.strokeStyle = goldGradient(ctx, 0, 0, W, H);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, W - 28, H - 28);

  const toPx = ([x, y]) => [((x + ENV_W / 2) / ENV_W) * W, (1 - (y + ENV_H / 2) / ENV_H) * H];
  for (const line of edges) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(150,110,30,0.35)';
    ctx.beginPath();
    line.forEach((p, i) => {
      const [px, py] = toPx(p);
      i ? ctx.lineTo(px, py + 4) : ctx.moveTo(px, py + 4);
    });
    ctx.stroke();
    ctx.strokeStyle = goldGradient(ctx, 0, 0, W, H);
    ctx.beginPath();
    line.forEach((p, i) => {
      const [px, py] = toPx(p);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
  }
  return toTexture(c, renderer);
}

function linerTexture(renderer) {
  const W = 512;
  const H = 320;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0e1f5c');
  g.addColorStop(1, '#060f33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  diamondPattern(ctx, W, H, 22, 0.16);
  ctx.strokeStyle = goldGradient(ctx, 0, 0, W, H);
  ctx.lineWidth = 4;
  ctx.strokeRect(5, 5, W - 10, H - 10);
  return toTexture(c, renderer);
}

function cardTexture(renderer, logoImg, lang) {
  const W = 1024;
  const H = 612;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#fffaf0');
  g.addColorStop(1, '#f1e4c3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = goldGradient(ctx, 0, 0, W, H);
  ctx.lineWidth = 8;
  ctx.strokeRect(18, 18, W - 36, H - 36);
  ctx.lineWidth = 2;
  ctx.strokeRect(34, 34, W - 68, H - 68);
  ctx.fillStyle = ctx.strokeStyle;
  if (logoImg) ctx.drawImage(logoImg, W / 2 - 70, 60, 140, 140);
  ctx.textAlign = 'center';
  ctx.fillStyle = goldGradient(ctx, W * 0.25, 0, W * 0.75, 0);
  ctx.fillStyle = '#0b1a4a';
  ctx.font = lang === 'ml' ? '700 96px "Invite Malayalam", sans-serif' : '800 104px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(lang === 'ml' ? 'ക്ഷണം' : 'Invitation', W / 2, 330);
  ctx.fillStyle = goldGradient(ctx, W * 0.4, 0, W * 0.6, 0);
  ctx.fillRect(W / 2 - 70, 362, 140, 6);
  ctx.fillStyle = '#0b1a4a';
  ctx.font = lang === 'ml' ? '700 40px "Invite Malayalam", sans-serif' : '700 40px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(lang === 'ml' ? 'സെന്റ് മേരീസ് യു.പി സ്കൂൾ, തേവര' : "St. Mary's U P School, Thevara", W / 2, 440);
  ctx.fillStyle = '#6b5420';
  ctx.font = lang === 'ml' ? '500 30px "Invite Malayalam", sans-serif' : '500 30px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(lang === 'ml' ? '2027 ജനുവരി 16 · രാവിലെ 10 മണി' : '16 January 2027 · 10 AM', W / 2, 510);
  return toTexture(c, renderer);
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const bgVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }
`;
const bgFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uAspect;
  uniform float uScroll;
  uniform float uBoost;
  void main() {
    vec2 uv = vUv;
    vec3 deep = vec3(0.020, 0.043, 0.141);
    vec3 navy = vec3(0.043, 0.102, 0.290);
    vec3 royal = vec3(0.110, 0.220, 0.540);
    vec3 col = mix(deep, navy, smoothstep(0.0, 1.0, uv.y));
    vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y - 0.62 + uScroll * 0.08);
    vec2 glowC = vec2(uPointer.x * 0.15 * uAspect, uPointer.y * 0.1);
    float glow = exp(-dot(p - glowC, p - glowC) * 3.2);
    col = mix(col, royal, glow * (0.55 + 0.25 * sin(uTime * 0.4)));
    // diamond lattice like the printed card
    vec2 q = vec2((uv.x - 0.5) * uAspect, uv.y + uScroll * 0.15) * 14.0;
    vec2 d = abs(fract(vec2(q.x + q.y, q.x - q.y) * 0.5) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.03, min(d.x, d.y));
    col += vec3(0.83, 0.69, 0.22) * line * 0.035 * (0.6 + glow);
    // warm burst during opening
    float r = length(vec2((uv.x - 0.5) * uAspect, uv.y - 0.5));
    col += vec3(1.0, 0.82, 0.45) * uBoost * 0.35 * exp(-r * r * 6.0);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const dustVert = /* glsl */ `
  attribute float aScale;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPR;
  uniform vec2 uPointer;
  uniform float uScrollY;
  uniform float uBoost;
  uniform float uSize;
  varying float vTw;
  void main() {
    vec3 p = position;
    float speed = 0.12 + aSeed * 0.25;
    float t = uTime + uBoost * 6.0 * aSeed;
    p.y = mod(p.y + t * speed + 9.0, 18.0) - 9.0;
    p.x += sin(t * 0.3 + aSeed * 40.0) * 0.4;
    float depth = (p.z + 6.0) / 10.0;
    p.xy += uPointer * depth * 0.6;
    p.y += uScrollY * (0.3 + depth * 0.7);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aScale * uPR * (10.0 / -mv.z) * (1.0 + uBoost * 0.8);
    vTw = 0.55 + 0.45 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 90.0);
  }
`;
const dustFrag = /* glsl */ `
  precision mediump float;
  varying float vTw;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    a = pow(a, 2.2);
    vec3 col = mix(vec3(0.83, 0.62, 0.20), vec3(1.0, 0.93, 0.72), a);
    gl_FragColor = vec4(col, a * vTw * 0.9);
  }
`;

const burstVert = /* glsl */ `
  attribute vec3 aColor;
  attribute vec3 aRand;
  uniform float uProgress;
  uniform float uPR;
  uniform float uSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float pr = uProgress;
    vec3 dir = normalize(vec3(p.xy + (aRand.xy - 0.5) * 0.25, 0.4 + aRand.z));
    float dist = pr * (0.8 + aRand.z * 2.6);
    float ang = pr * (aRand.x - 0.5) * 5.0;
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec3 q = p + dir * dist;
    q.xy = rot * q.xy;
    q.y -= pr * pr * 0.6;
    vec4 mv = modelViewMatrix * vec4(q, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPR * (10.0 / -mv.z) * (1.0 - pr * 0.5) * (0.6 + aRand.y * 0.8);
    vColor = aColor;
    vAlpha = 1.0 - smoothstep(0.45, 1.0, pr);
  }
`;
const burstFrag = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.2, d) * vAlpha;
    gl_FragColor = vec4(vColor, a);
  }
`;

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

export function createScene(canvasEl, { logoImg, lang = 'ml', lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: !lowPower,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
  const PR = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);
  renderer.setPixelRatio(PR);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAM_Z);

  /* Background quad */
  const bgMat = new THREE.ShaderMaterial({
    vertexShader: bgVert,
    fragmentShader: bgFrag,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2() },
      uAspect: { value: 1 },
      uScroll: { value: 0 },
      uBoost: { value: 0 },
    },
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  // background is CSS (blurred photo + glass); the shader quad is kept for its uniforms only

  /* Gold dust */
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const N = lowPower ? 700 : small ? 1300 : 3200;
  const pos = new Float32Array(N * 3);
  const scl = new Float32Array(N);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 22;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 18;
    pos[i * 3 + 2] = -6 + Math.random() * 10;
    scl[i] = 0.4 + Math.pow(Math.random(), 3) * 1.8;
    seed[i] = Math.random();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('aScale', new THREE.BufferAttribute(scl, 1));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const dustMat = new THREE.ShaderMaterial({
    vertexShader: dustVert,
    fragmentShader: dustFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPR: { value: PR },
      uPointer: { value: new THREE.Vector2() },
      uScrollY: { value: 0 },
      uBoost: { value: 0 },
      uSize: { value: small ? 7 : 9 },
    },
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  /* Envelope */
  const env = new THREE.Group(); // positioned/scaled to the stage
  const tilt = new THREE.Group(); // pointer tilt + idle float
  env.add(tilt);
  scene.add(env);

  const mats = [];
  const basic = (opts) => {
    const m = new THREE.MeshBasicMaterial({ transparent: true, ...opts });
    mats.push(m);
    return m;
  };
  const uvFromEnvelope = (geo) => {
    const p = geo.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = (p.getX(i) + ENV_W / 2) / ENV_W;
      uv[i * 2 + 1] = (p.getY(i) + ENV_H / 2) / ENV_H;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  };

  // Back / liner
  const back = new THREE.Mesh(new THREE.PlaneGeometry(ENV_W, ENV_H), basic({ map: linerTexture(renderer) }));
  tilt.add(back);

  // Card
  const cardMat = basic({ map: cardTexture(renderer, logoImg, lang) });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(ENV_W * 0.9, ENV_H * 0.86), cardMat);
  card.position.z = 0.01;
  tilt.add(card);

  // Front pocket with a V opening
  const vTip = -0.02;
  const frontShape = new THREE.Shape();
  frontShape.moveTo(-ENV_W / 2, -ENV_H / 2);
  frontShape.lineTo(ENV_W / 2, -ENV_H / 2);
  frontShape.lineTo(ENV_W / 2, ENV_H / 2);
  frontShape.lineTo(0, vTip);
  frontShape.lineTo(-ENV_W / 2, ENV_H / 2);
  frontShape.closePath();
  const frontGeo = new THREE.ShapeGeometry(frontShape);
  uvFromEnvelope(frontGeo);
  const frontTex = envelopeTexture(renderer, [
    [
      [-ENV_W / 2, ENV_H / 2],
      [0, vTip],
      [ENV_W / 2, ENV_H / 2],
    ],
  ]);
  const front = new THREE.Mesh(frontGeo, basic({ map: frontTex }));
  front.position.z = 0.02;
  tilt.add(front);

  // Flap (hinged on top edge)
  const flapPivot = new THREE.Group();
  flapPivot.position.set(0, ENV_H / 2, 0.03);
  tilt.add(flapPivot);
  const flapShape = new THREE.Shape();
  flapShape.moveTo(-ENV_W / 2, 0);
  flapShape.lineTo(ENV_W / 2, 0);
  flapShape.lineTo(0, -FLAP_DEPTH);
  flapShape.closePath();
  const flapGeo = new THREE.ShapeGeometry(flapShape);
  // UVs relative to the closed position so the pattern lines up with the front
  {
    const p = flapGeo.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = (p.getX(i) + ENV_W / 2) / ENV_W;
      uv[i * 2 + 1] = (p.getY(i) + ENV_H) / ENV_H;
    }
    flapGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  const flapTex = envelopeTexture(
    renderer,
    [
      [
        [-ENV_W / 2 + 0.01, ENV_H / 2 - 0.01],
        [0, ENV_H / 2 - FLAP_DEPTH],
        [ENV_W / 2 - 0.01, ENV_H / 2 - 0.01],
      ],
    ],
    { corners: false },
  );
  const flapOuter = new THREE.Mesh(flapGeo, basic({ map: flapTex, side: THREE.FrontSide }));
  const flapInner = new THREE.Mesh(flapGeo, basic({ color: 0x0b1a4a, side: THREE.BackSide }));
  flapPivot.add(flapOuter, flapInner);

  // Wax seal = school logo
  const seal = new THREE.Group();
  seal.position.set(0, ENV_H / 2 - FLAP_DEPTH, 0.05);
  tilt.add(seal);
  const logoTex = new THREE.Texture(logoImg);
  logoTex.colorSpace = THREE.SRGBColorSpace;
  logoTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  logoTex.needsUpdate = true;
  const sealShadow = new THREE.Mesh(
    new THREE.CircleGeometry(SEAL_R * 1.12, 48),
    basic({ color: 0x000000, opacity: 0.35 }),
  );
  sealShadow.position.set(0.012, -0.018, -0.004);
  const sealRing = new THREE.Mesh(new THREE.RingGeometry(SEAL_R * 0.98, SEAL_R * 1.1, 64), basic({ color: 0xe6b84a }));
  const sealDisc = new THREE.Mesh(new THREE.CircleGeometry(SEAL_R, 64), basic({ map: logoTex }));
  sealDisc.position.z = 0.002;
  seal.add(sealShadow, sealRing, sealDisc);

  /* Burst particles sampled from the logo */
  const burst = (() => {
    const G = lowPower ? 56 : small ? 72 : 96;
    const [c, ctx] = canvas(G, G);
    ctx.drawImage(logoImg, 0, 0, G, G);
    const data = ctx.getImageData(0, 0, G, G).data;
    const P = [];
    const C = [];
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = (y * G + x) * 4;
        if (data[i + 3] < 150) continue;
        P.push(((x + 0.5) / G - 0.5) * 2 * SEAL_R, (0.5 - (y + 0.5) / G) * 2 * SEAL_R, 0);
        C.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
      }
    }
    const GOLD = lowPower ? 150 : 420;
    for (let i = 0; i < GOLD; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * SEAL_R;
      P.push(Math.cos(a) * r, Math.sin(a) * r, 0);
      const k = 0.85 + Math.random() * 0.15;
      C.push(1.0 * k, 0.85 * k, 0.45 * k);
    }
    const count = P.length / 3;
    const R = new Float32Array(count * 3).map(() => Math.random());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(C), 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(R, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: burstVert,
      fragmentShader: burstFrag,
      transparent: true,
      depthWrite: false,
      uniforms: { uProgress: { value: 0 }, uPR: { value: PR }, uSize: { value: 4 } },
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.visible = false;
    pts.position.z = 0.01;
    seal.add(pts);
    return { pts, mat, G };
  })();

  // Explicit draw order so thin layers never z-fight
  back.renderOrder = 1;
  card.renderOrder = 2;
  front.renderOrder = 3;
  flapOuter.renderOrder = flapInner.renderOrder = 4;
  sealShadow.renderOrder = 5;
  sealRing.renderOrder = 6;
  sealDisc.renderOrder = 7;
  burst.pts.renderOrder = 8;

  /* Layout & state */
  const state = {
    w: 1,
    h: 1,
    k: 1, // world units per CSS px at z=0
    pointer: new THREE.Vector2(),
    pointerTarget: new THREE.Vector2(),
    hover: 0,
    hoverTarget: 0,
    envPx: 300,
    scrollY: 0,
    opened: false,
  };

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    state.w = w;
    state.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    bgMat.uniforms.uAspect.value = w / h;
    state.k = (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z) / h;
  }

  // Place the envelope in the centre of a DOM rect with a given pixel width.
  function layoutEnvelope(rect, envPx) {
    state.envPx = envPx;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    env.position.set((cx - state.w / 2) * state.k, -(cy - state.h / 2) * state.k, 0);
    const s = (envPx * state.k) / ENV_W;
    env.scale.setScalar(s);
    // burst point size ≈ logo pixel spacing on screen
    burst.mat.uniforms.uSize.value = ((envPx * (2 * SEAL_R)) / ENV_W / burst.G) * 2.2;
  }

  function setPointer(x, y) {
    state.pointerTarget.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
  }
  function setHover(on) {
    state.hoverTarget = on ? 1 : 0;
  }
  function setScroll(px) {
    state.scrollY = px;
  }

  /* Opening timeline */
  function openTimeline() {
    state.opened = true;
    const tl = gsap.timeline();
    const flapState = { r: 0 };
    tl.to(seal.scale, { x: 1.18, y: 1.18, duration: 0.22, ease: 'back.in(3)' }, 0)
      .add(() => {
        sealDisc.visible = sealRing.visible = sealShadow.visible = false;
        burst.pts.visible = true;
        seal.scale.setScalar(1);
      }, 0.22)
      .to(burst.mat.uniforms.uProgress, { value: 1, duration: 1.6, ease: 'power2.out' }, 0.22)
      .to([bgMat.uniforms.uBoost, dustMat.uniforms.uBoost], { value: 1, duration: 0.5, ease: 'power2.out' }, 0.22)
      .to(
        flapState,
        {
          r: 1,
          duration: 0.9,
          ease: 'power2.inOut',
          onUpdate: () => {
            flapPivot.rotation.x = -Math.PI * 0.985 * flapState.r;
            const past = flapState.r > 0.5;
            flapPivot.position.z = past ? -0.006 : 0.03;
            flapOuter.renderOrder = flapInner.renderOrder = past ? 0.5 : 4;
          },
        },
        0.35,
      )
      .to(card.position, { y: ENV_H * 0.62, duration: 0.85, ease: 'power3.out' }, 1.05)
      .to(tilt.rotation, { x: 0, y: 0, z: 0, duration: 0.6, ease: 'power2.out' }, 1.0)
      .to(env.position, { y: env.position.y - state.envPx * state.k * 0.15, duration: 0.85, ease: 'power3.out' }, 1.05)
      .addLabel('fly', 1.75)
      .to([back.position, front.position, flapPivot.position], { y: '-=1.6', duration: 0.8, ease: 'power2.in' }, 'fly')
      .to([back.material, front.material, flapOuter.material, flapInner.material], { opacity: 0, duration: 0.7, ease: 'power1.in' }, 'fly')
      .to(card.position, { z: 3.2, y: '+=0.15', duration: 1.0, ease: 'power2.in' }, 'fly')
      .to(card.rotation, { x: -0.25, duration: 1.0, ease: 'power2.in' }, 'fly')
      .to(cardMat, { opacity: 0, duration: 0.45, ease: 'power1.in' }, 'fly+=0.55')
      .to([bgMat.uniforms.uBoost, dustMat.uniforms.uBoost], { value: 0, duration: 1.4, ease: 'power2.inOut' }, 'fly+=0.4')
      .add(() => {
        env.visible = false;
      });
    return tl;
  }

  function resetEnvelope() {
    state.opened = false;
    env.visible = true;
    sealDisc.visible = sealRing.visible = sealShadow.visible = true;
    burst.pts.visible = false;
    burst.mat.uniforms.uProgress.value = 0;
    seal.scale.setScalar(1);
    flapPivot.rotation.x = 0;
    flapPivot.position.set(0, ENV_H / 2, 0.03);
    flapOuter.renderOrder = flapInner.renderOrder = 4;
    bgMat.uniforms.uBoost.value = dustMat.uniforms.uBoost.value = 0;
    back.position.set(0, 0, 0);
    front.position.set(0, 0, 0.02);
    card.position.set(0, 0, 0.01);
    card.rotation.set(0, 0, 0);
    mats.forEach((m) => {
      m.opacity = m === sealShadow.material ? 0.35 : 1;
    });
  }

  // Envelope drops in with a little spin
  function introTween() {
    const s = env.scale.x;
    env.scale.setScalar(s * 0.001);
    const tl = gsap.timeline();
    tl.to(env.scale, { x: s, y: s, z: s, duration: 1.2, ease: 'back.out(1.5)' }, 0).fromTo(
      env.rotation,
      { z: -0.5 },
      { z: 0, duration: 1.2, ease: 'power3.out' },
      0,
    );
    return tl;
  }

  function setLang(next) {
    const old = cardMat.map;
    cardMat.map = cardTexture(renderer, logoImg, next);
    cardMat.needsUpdate = true;
    old.dispose();
  }

  /* Loop */
  const clock = new THREE.Clock();
  let running = true;
  function frame() {
    if (!running) return;
    const t = clock.getElapsedTime();
    state.pointer.lerp(state.pointerTarget, 0.06);
    state.hover += (state.hoverTarget - state.hover) * 0.1;

    bgMat.uniforms.uTime.value = t;
    bgMat.uniforms.uPointer.value.copy(state.pointer);
    dustMat.uniforms.uTime.value = t;
    dustMat.uniforms.uPointer.value.copy(state.pointer);
    const sy = state.scrollY * state.k * 0.35;
    dustMat.uniforms.uScrollY.value = sy;
    bgMat.uniforms.uScroll.value = state.scrollY / Math.max(1, state.h);

    if (env.visible && !state.opened) {
      tilt.rotation.y = state.pointer.x * 0.42 + Math.sin(t * 0.7) * 0.05;
      tilt.rotation.x = -state.pointer.y * 0.3 + Math.cos(t * 0.6) * 0.04;
      tilt.rotation.z = Math.sin(t * 0.5) * 0.015;
      tilt.position.y = Math.sin(t * 1.1) * 0.03 + state.hover * 0.04;
      tilt.scale.setScalar(1 + state.hover * 0.04);
      seal.rotation.z = Math.sin(t * 0.9) * 0.05;
    }
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) clock.getDelta();
  });
  resize();

  return { resize, layoutEnvelope, setPointer, setHover, setScroll, openTimeline, resetEnvelope, introTween, setLang, renderer };
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}
