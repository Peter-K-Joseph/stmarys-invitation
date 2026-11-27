// Sound design for the invitation, synthesised live with the Web Audio API (no files).
// Palette is Western / cinematic: a soft grand piano (additive synthesis), a string
// section, a concert harp for glissandi, and glass chimes, all in a hall reverb.
// Harmony is full major-scale (no pentatonic) with classic church cadences.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const SR = 44100; // notes are rendered at this rate, before an AudioContext exists
const RAW = new Map(); // rendered note data, shared

// D major scale over three octaves (for harp glissandi and the programme melody)
const D_MAJOR = [];
for (let o = 0; o < 4; o++) [0, 2, 4, 5, 7, 9, 11].forEach((s) => D_MAJOR.push(50 + o * 12 + s));

// Score: 8 bars, 66 bpm. Each bar: piano arpeggio (8 eighths), bass, string voicing, melody [note, beats]
const SCORE = [
  { arp: [50, 57, 62, 66, 69, 66, 62, 57], bass: 38, str: [62, 66, 69], mel: [[78, 2], [76, 1], [74, 1]] }, // D
  { arp: [49, 57, 61, 64, 69, 64, 61, 57], bass: 37, str: [61, 64, 69], mel: [[76, 3], [73, 1]] }, // A/C#
  { arp: [47, 54, 59, 62, 66, 62, 59, 54], bass: 35, str: [59, 62, 66], mel: [[74, 1], [78, 1], [83, 2]] }, // Bm
  { arp: [43, 50, 55, 59, 62, 59, 55, 50], bass: 31, str: [59, 62, 67], mel: [[81, 3], [79, 1]] }, // G
  { arp: [42, 50, 54, 57, 62, 57, 54, 50], bass: 30, str: [57, 62, 66], mel: [[78, 2], [81, 1], [86, 1]] }, // D/F#
  { arp: [43, 50, 55, 59, 62, 59, 55, 50], bass: 31, str: [59, 62, 67], mel: [[83, 2], [81, 1], [79, 1]] }, // G
  { arp: [45, 52, 57, 62, 64, 61, 57, 52], bass: 33, str: [57, 62, 64], mel: [[79, 2], [76, 1], [73, 1]] }, // Asus4 → A
  { arp: [50, 57, 62, 66, 69, 66, 62, 57], bass: 38, str: [57, 62, 66], mel: [[74, 4]] }, // D
];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem('inv-sound') !== 'off';
    this.cache = new Map();
    this.musicOn = false;
    this.ducked = false;
    this.lastHover = 0;
  }

  /* ---------------- setup ---------------- */

  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 14;
      comp.ratio.value = 3;
      comp.attack.value = 0.005;
      comp.release.value = 0.3;
      this.master.connect(comp).connect(ctx.destination);

      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(3.2, 2.8);
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.42;
      this.reverb.connect(this.wet).connect(this.master);

      this.sfx = this.bus(1);
      this.music = this.bus(0);
      this.noiseBuf = this.makeNoise(2);

      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend();
        else if (this.enabled) this.ctx.resume();
      });
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  bus(level) {
    const g = this.ctx.createGain();
    g.gain.value = level;
    g.connect(this.master);
    g.connect(this.reverb);
    return g;
  }

  impulse(seconds, decay) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += (0.5 - t * 0.42) * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  makeNoise(seconds) {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * seconds, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  out(node, bus, pan = 0) {
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p).connect(bus);
    } else node.connect(bus);
  }

  play(buf, t, { vol = 0.3, pan = 0, bus = this.sfx, cutoff = 0 } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    let node = src;
    if (cutoff) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      node = src.connect(f);
    }
    node.connect(g);
    this.out(g, bus, pan);
    src.start(Math.max(t, this.ctx.currentTime));
  }

  /* ---------------- instruments ---------------- */

  // Soft grand piano: inharmonic partials with per-partial decay, two-stage envelope,
  // slightly detuned unison strings and a felt-hammer thump. Rendered once per pitch
  // (cheap recurrence oscillators) and cached; prewarm() renders them while idle.
  static genPiano(m) {
    const sr = SR;
    const f = midi(m);
    const dur = m < 50 ? 4.5 : m < 70 ? 3.6 : 2.6;
    const len = Math.floor(sr * dur);
    const d = new Float32Array(len);
    const B = 0.00025; // string stiffness → inharmonicity
    const partials = m < 55 ? 9 : m < 75 ? 7 : 5;
    const baseTau = 1.9 * Math.pow(261.6 / f, 0.45);
    for (let n = 1; n <= partials; n++) {
      const fn = n * f * Math.sqrt(1 + B * n * n);
      if (fn > sr * 0.45) break;
      // felt hammer strikes ~1/8 along the string → weak 8th partial, warm spectrum
      const amp = 0.5 * Math.pow(n, -1.25) * (n === 8 ? 0.2 : 1) * (m > 80 ? Math.pow(n, -0.4) : 1);
      const tau = baseTau / (1 + 0.55 * (n - 1));
      const w1 = (2 * Math.PI * fn) / sr;
      const w2 = w1 * 1.0007; // second string a hair sharp → gentle chorus
      const c1 = 2 * Math.cos(w1);
      const c2 = 2 * Math.cos(w2);
      const ph = Math.random() * 6.28;
      let a1 = Math.sin(ph), b1 = Math.sin(ph - w1);
      let a2 = 0, b2 = Math.sin(-w2);
      let e1 = 0.6, e2 = 0.4;
      const k1 = Math.exp(-4 / (tau * sr));
      const k2 = Math.exp(-1 / (tau * sr));
      for (let i = 0; i < len; i++) {
        d[i] += amp * (e1 + e2) * (a1 + a2);
        const n1 = c1 * a1 - b1; b1 = a1; a1 = n1;
        const n2 = c2 * a2 - b2; b2 = a2; a2 = n2;
        e1 *= k1;
        e2 *= k2;
        if (e2 < 0.0002) break;
      }
    }
    let lp = 0;
    const hammerLen = Math.floor(sr * 0.03);
    for (let i = 0; i < hammerLen; i++) {
      lp += 0.12 * (Math.random() * 2 - 1 - lp);
      d[i] += lp * 0.5 * (1 - i / hammerLen);
    }
    const atk = Math.floor(sr * 0.003);
    for (let i = 0; i < atk; i++) d[i] *= i / atk;
    const fade = Math.floor(sr * 0.25);
    for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
    let peak = 0;
    for (let i = 0; i < len; i++) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > peak) peak = v; }
    const norm = 0.85 / (peak || 1);
    for (let i = 0; i < len; i++) d[i] *= norm;
    return d;
  }

  static genHarp(m) {
    const sr = SR;
    const f = midi(m);
    const len = Math.floor(sr * 2.4);
    const d = new Float32Array(len);
    const N = Math.max(2, Math.round(sr / f));
    const ring = new Float32Array(N);
    let prev = 0;
    for (let i = 0; i < N; i++) {
      prev += 0.25 * (Math.random() * 2 - 1 - prev); // soft finger pluck
      ring[i] = prev;
    }
    const decay = Math.min(0.9993, 0.9982 - f / 500000);
    let idx = 0;
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const nx = idx + 1 === N ? 0 : idx + 1;
      const v = ring[idx];
      d[i] = v;
      ring[idx] = decay * (0.5 * v + 0.5 * ring[nx]);
      idx = nx;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    const norm = 0.8 / (peak || 1);
    for (let i = 0; i < len; i++) d[i] *= norm;
    return d;
  }

  raw(key) {
    if (!RAW.has(key)) RAW.set(key, key[0] === 'p' ? AudioEngine.genPiano(+key.slice(1)) : AudioEngine.genHarp(+key.slice(1)));
    return RAW.get(key);
  }

  buffer(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    const data = this.raw(key);
    const buf = this.ctx.createBuffer(1, data.length, SR);
    buf.getChannelData(0).set(data);
    this.cache.set(key, buf);
    return buf;
  }

  pianoBuffer(m) {
    return this.buffer('p' + m);
  }

  harpBuffer(m) {
    return this.buffer('h' + m);
  }

  // Render every note the site uses during idle time (before anyone taps Open)
  prewarm() {
    const keys = new Set();
    [74, 38, 50, 57, 62, 66, 69, 43, 55, 59, 67, 45, 61, 64].forEach((m) => keys.add('p' + m));
    D_MAJOR.filter((m) => m >= 50 && m <= 93).forEach((m) => keys.add('h' + m));
    D_MAJOR.slice(7).forEach((m) => keys.add('p' + m));
    SCORE.forEach((b) => [b.bass, ...b.arp, ...b.mel.map((x) => x[0]), b.mel[0][0] - 12].forEach((m) => keys.add('p' + m)));
    const queue = [...keys].filter((k) => !RAW.has(k));
    const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 40));
    const work = (dl) => {
      while (queue.length && dl.timeRemaining() > 4) this.raw(queue.shift());
      if (queue.length) idle(work);
    };
    idle(work);
  }

  piano(m, t, opts = {}) {
    const vel = opts.vol ?? 0.3;
    // softer notes are darker, like a real piano
    this.play(this.pianoBuffer(m), t, { ...opts, vol: vel, cutoff: 1800 + vel * 9000 });
  }

  // Classic harp glissando up the D-major scale
  gliss(t, from, to, { dur = 0.6, vol = 0.12 } = {}) {
    const notes = D_MAJOR.filter((n) => n >= from && n <= to);
    notes.forEach((n, i) => {
      const p = i / Math.max(1, notes.length - 1);
      this.play(this.harpBuffer(n), t + p * dur, { vol: vol * (0.75 + p * 0.25), pan: -0.5 + p, cutoff: 5000 });
    });
  }

  // String section: detuned saws, vibrato, slow bow attack, warm lowpass
  strings(notes, t, dur, { vol = 0.05, bus = this.sfx, cutoff = 1500, attack = 0.9 } = {}) {
    const c = this.ctx;
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(cutoff * 0.5, t);
    lp.frequency.linearRampToValueAtTime(cutoff, t + attack + 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, Math.max(t + attack, t + dur - 0.9));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(bus);
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.frequency.value = 5.2;
    lfoG.gain.value = 6; // cents of vibrato
    lfo.connect(lfoG);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
    notes.forEach((m) => {
      [-9, 0, 9].forEach((cents, k) => {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(m);
        o.detune.value = cents;
        lfoG.connect(o.detune);
        const og = c.createGain();
        og.gain.value = k === 1 ? 0.5 : 0.35;
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(t + dur + 0.1);
      });
    });
  }

  // Glass chime (FM, inharmonic) for sparkle accents only
  chime(m, t, { vol = 0.05, dur = 1.6, pan = 0 } = {}) {
    const c = this.ctx;
    const f = midi(m);
    const car = c.createOscillator();
    const mod = c.createOscillator();
    const modG = c.createGain();
    const amp = c.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * 3.01;
    modG.gain.setValueAtTime(f * 1.1, t);
    modG.gain.exponentialRampToValueAtTime(f * 0.02, t + dur * 0.5);
    mod.connect(modG).connect(car.frequency);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(amp);
    this.out(amp, this.sfx, pan);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  // Sparkle over a D-major-9 chord (D F# A C# E): a magical, film-score shimmer
  sparkle(t, dur = 1.4, count = 20) {
    const tones = [86, 90, 93, 97, 100, 102, 105];
    for (let i = 0; i < count; i++) {
      const p = i / count;
      this.chime(tones[Math.floor(Math.random() * tones.length)], t + Math.pow(p, 1.3) * dur + Math.random() * 0.04, {
        vol: 0.035 * (1 - p * 0.6),
        dur: 1.3,
        pan: Math.random() * 1.6 - 0.8,
      });
    }
  }

  noise(t, dur, { f0 = 800, f1 = 3000, q = 1.2, vol = 0.2, type = 'bandpass', pan = 0, attack = 0.3 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    this.out(g, this.sfx, pan);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /* ---------------- sound effects ---------------- */

  sealCrack(t) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.3);
    this.noise(t, 0.08, { f0: 2200, f1: 1100, q: 0.8, vol: 0.5, attack: 0.05 });
    for (let i = 0; i < 8; i++) {
      this.noise(t + 0.03 + Math.random() * 0.2, 0.02 + Math.random() * 0.03, {
        f0: 3000 + Math.random() * 3000,
        f1: 2000,
        q: 4,
        vol: 0.1 + Math.random() * 0.08,
        attack: 0.05,
        pan: Math.random() * 1.4 - 0.7,
      });
    }
  }

  paper(t, dur = 0.8) {
    this.noise(t, dur, { f0: 1200, f1: 3800, q: 0.9, vol: 0.12, attack: 0.5, pan: -0.15 });
    for (let tt = t; tt < t + dur; tt += 0.02 + Math.random() * 0.05) {
      this.noise(tt, 0.02 + Math.random() * 0.04, { f0: 2500 + Math.random() * 3500, f1: 1800, q: 2.5, vol: 0.04 + Math.random() * 0.06, attack: 0.1, pan: Math.random() * 0.6 - 0.3 });
    }
  }

  /* ---------------- moments ---------------- */

  open(mode = 'gl') {
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime + 0.03;
    const T = mode === 'gl' ? { crack: 0.22, flap: 0.35, card: 1.05, fly: 1.75, reveal: 1.95 } : { crack: 0.1, flap: 0.25, card: 0.9, fly: 1.5, reveal: 1.7 };

    this.piano(74, t, { vol: 0.18 }); // a single soft note as you tap
    this.sealCrack(t + T.crack);
    this.sparkle(t + T.crack + 0.02, 1.4, 22);
    this.paper(t + T.flap, 0.85);
    this.noise(t + T.card, 0.8, { f0: 500, f1: 2600, q: 0.7, vol: 0.12, attack: 0.6 });
    this.noise(t + T.fly, 0.75, { f0: 300, f1: 5000, q: 0.6, vol: 0.15, attack: 0.85 });
    // strings swell on a dominant (A) that resolves to D on the reveal
    this.strings([57, 61, 64, 69], t + T.flap, T.reveal - T.flap + 0.4, { vol: 0.045, attack: 1.2, cutoff: 1800 });
    this.gliss(t + T.reveal - 0.62, 50, 86, { dur: 0.6, vol: 0.11 });
    this.reveal(t + T.reveal);
  }

  // Arrival: full D-major chord on piano + strings + low octave, sparkle on top
  reveal(t) {
    [38, 50, 57, 62, 66, 69, 74].forEach((m, i) => this.piano(m, t + i * 0.018, { vol: i < 2 ? 0.32 : 0.24, pan: -0.3 + i * 0.1 }));
    this.strings([50, 57, 62, 66, 69], t, 4.2, { vol: 0.05, attack: 0.25, cutoff: 2200 });
    this.sparkle(t + 0.05, 1.6, 16);
  }

  // Programme path: each step climbs the D-major scale on piano
  step(i) {
    const c = this.ensure();
    if (!c) return;
    const m = D_MAJOR[Math.min(7 + i, D_MAJOR.length - 1)]; // starts at D4
    this.piano(m, c.currentTime + 0.01, { vol: 0.22, pan: i % 2 ? 0.25 : -0.25 });
  }

  // Finale: a proper cadence IV – V – I with a harp flourish and sparkle
  finale() {
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime + 0.02;
    const chords = [
      [43, 55, 59, 62, 67], // G
      [45, 57, 61, 64, 69], // A
      [38, 50, 57, 62, 66, 69, 74], // D
    ];
    chords.forEach((ch, k) => ch.forEach((m, i) => this.piano(m, t + k * 0.42 + i * 0.012, { vol: k === 2 ? 0.28 : 0.2 })));
    this.gliss(t + 0.84 - 0.4, 62, 93, { dur: 0.4, vol: 0.1 });
    this.strings([50, 57, 62, 66], t + 0.84, 3.5, { vol: 0.05, attack: 0.3, cutoff: 2200 });
    this.sparkle(t + 0.9, 1.4, 14);
  }

  click() {
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.04);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.08);
  }

  hover() {
    if (!this.ctx || !this.enabled) return;
    const now = performance.now();
    if (now - this.lastHover < 1200) return;
    this.lastHover = now;
    this.sparkle(this.ctx.currentTime, 0.4, 4);
  }

  /* ---------------- background music: piano & strings ---------------- */

  startMusic() {
    const c = this.ensure();
    if (!c || this.musicOn) return;
    this.musicOn = true;
    const now = c.currentTime;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setValueAtTime(this.music.gain.value, now);
    this.music.gain.linearRampToValueAtTime(this.ducked ? 0 : 0.5, now + 4);
    this.bar = 0;
    this.nextBar = now + 3.2; // let the reveal ring out first
    this.timer = setInterval(() => this.schedule(), 150);
  }

  stopMusic() {
    if (!this.ctx) return;
    this.musicOn = false;
    clearInterval(this.timer);
    const now = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setValueAtTime(this.music.gain.value, now);
    this.music.gain.linearRampToValueAtTime(0, now + 0.8);
  }

  duck(on) {
    this.ducked = on;
    if (!this.ctx || !this.musicOn) return;
    const now = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setValueAtTime(this.music.gain.value, now);
    this.music.gain.linearRampToValueAtTime(on ? 0 : 0.5, now + (on ? 0.4 : 2.5));
  }

  // 16-bar loop: bars 1–8 with melody, bars 9–16 accompaniment only (melody an octave
  // lower and sparser on alternate loops), so it breathes instead of repeating a tune.
  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running' || !this.enabled) return;
    const beat = 60 / 66;
    const barLen = beat * 4;
    if (this.nextBar < c.currentTime) this.nextBar = c.currentTime + 0.1;
    while (this.nextBar < c.currentTime + 0.8) {
      const t0 = this.nextBar;
      const idx = this.bar % 8;
      const bar = SCORE[idx];
      const section = Math.floor(this.bar / 8) % 2; // 0 = with melody, 1 = accompaniment
      const B = this.music;
      const human = () => (Math.random() - 0.5) * 0.012; // tiny timing feel

      this.strings(bar.str, t0, barLen + 0.5, { vol: section ? 0.03 : 0.022, bus: B, cutoff: 1300, attack: 1.0 });
      this.strings([bar.bass + 12], t0, barLen + 0.3, { vol: 0.03, bus: B, cutoff: 700, attack: 0.6 }); // cellos
      this.piano(bar.bass, t0 + human(), { vol: 0.22, bus: B });
      bar.arp.forEach((m, i) => {
        const accent = i === 0 ? 0.17 : i === 4 ? 0.13 : 0.1;
        this.piano(m, t0 + i * beat * 0.5 + human(), { vol: accent, bus: B, pan: -0.25 + (m - 42) / 120 });
      });
      if (section === 0) {
        let at = 0;
        bar.mel.forEach(([m, len]) => {
          this.piano(m, t0 + at * beat + human(), { vol: 0.2, bus: B, pan: 0.1 });
          at += len;
        });
      } else if (idx === 3 || idx === 7) {
        // gentle answering phrase in the accompaniment section
        this.piano(bar.mel[0][0] - 12, t0 + beat * 2, { vol: 0.14, bus: B });
      }
      this.nextBar += barLen;
      this.bar++;
    }
  }

  /* ---------------- control ---------------- */

  unlock() {
    this.ensure();
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('inv-sound', this.enabled ? 'on' : 'off');
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(this.enabled ? 0.9 : 0, now + 0.3);
      if (this.enabled) this.ctx.resume();
    } else if (this.enabled) this.ensure();
    return this.enabled;
  }
}

export const sound = new AudioEngine();
