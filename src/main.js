import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import './fonts/fonts.css';
import './styles.css';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createScene, webglAvailable } from './scene.js';
import { TEXT } from './content.js';
import {
  applyText,
  setupReveals,
  startCountdown,
  downloadIcs,
  share,
  copyLink,
  setupVideo,
  setupTilt,
  confetti,
  sound,
} from './ui.js';

gsap.registerPlugin(ScrollTrigger);

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const lowPower = (navigator.hardwareConcurrency || 4) <= 4 && Math.min(innerWidth, innerHeight) < 500;
const useGL = !params.has('nogl') && !reduced && webglAvailable();

// Language comes from the link: ?lang=ml for Malayalam, ?lang=en (or nothing) for English
const urlLang = (params.get('lang') || '').toLowerCase();
let lang = urlLang === 'ml' ? 'ml' : 'en';
let scene = null;
let phase = 'loading'; // loading → intro → opening → revealed
let revealedOnce = false;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

applyText(lang);
updateSoundBtn();
if (!useGL) document.body.classList.add('no-gl');

function loadImage(src) {
  return new Promise((res) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

async function boot() {
  const bar = $('#loader .bar');
  let done = 0;
  const tasks = [
    loadImage('./assets/logo.png'),
    loadImage('./assets/school-900.webp'),
    loadImage('./assets/teacher-1.webp'),
    loadImage('./assets/teacher-2.webp'),
    document.fonts
      ? Promise.all([
          document.fonts.load('800 40px "Plus Jakarta Sans"'),
          document.fonts.load('600 20px "Plus Jakarta Sans"'),
          document.fonts.load('400 20px "Plus Jakarta Sans"'),
          document.fonts.load('400 20px "Invite Malayalam"', 'സെന്റ്'),
          document.fonts.load('700 20px "Invite Malayalam"', 'സെന്റ്'),
        ]).catch(() => {})
      : Promise.resolve(),
    new Promise((r) => setTimeout(r, 900)),
  ].map((p) =>
    p.then((v) => {
      done++;
      bar.style.strokeDashoffset = String(352 * (1 - done / 6));
      return v;
    }),
  );
  const [logoImg] = await Promise.all(tasks);

  if (useGL && logoImg) {
    try {
      scene = createScene($('#gl'), { logoImg, lang, lowPower });
    } catch (e) {
      console.warn('WebGL failed, using fallback', e);
      document.body.classList.add('no-gl');
      scene = null;
    }
  }
  layout();
  startIntro();
  sound.prewarm();
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

function layout() {
  const stage = $('#stage');
  const r = stage.getBoundingClientRect();
  const envPx = Math.max(170, Math.min(r.width * 0.74, 400, r.height * 0.72 * 1.6));
  document.documentElement.style.setProperty('--env-w', envPx + 'px');
  if (scene) {
    scene.resize();
    if (phase !== 'revealed' && phase !== 'opening') scene.layoutEnvelope(r, envPx);
  }
}

let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    layout();
    if (phase === 'revealed') ScrollTrigger.refresh();
  }, 120);
});

/* ------------------------------------------------------------------ */
/* Intro                                                               */
/* ------------------------------------------------------------------ */

function startIntro() {
  phase = 'intro';
  const tl = gsap.timeline();
  tl.to('#loader', { opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: () => ($('#loader').style.display = 'none') });
  tl.from('.intro-pill', { y: -16, opacity: 0, duration: 0.8, ease: 'power3.out' }, 0.15);
  tl.from('.arch', { y: 30, opacity: 0, scale: 0.96, duration: 1.1, ease: 'power3.out' }, 0.2);
  tl.from('.arch-text > *', { y: 18, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out' }, 0.55);
  if (scene) tl.add(scene.introTween(), 0.3);
  else tl.from('.dom-envelope', { scale: 0.4, opacity: 0, rotation: -12, duration: 1.1, ease: 'back.out(1.6)' }, 0.3);
  tl.from('.intro-foot', { y: 20, opacity: 0, duration: 0.8, ease: 'power3.out' }, 0.7);
  tl.from('.chip', { opacity: 0, duration: 0.6 }, 0.8);
  if (!scene && !reduced) {
    gsap.to('.dom-envelope', { y: -8, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.4 });
  }
}

/* Pointer + device tilt */
window.addEventListener(
  'pointermove',
  (e) => {
    if (!scene || e.pointerType === 'touch') return;
    scene.setPointer((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
  },
  { passive: true },
);

let orientationOn = false;
function onOrientation(e) {
  if (!scene || e.gamma == null) return;
  scene.setPointer(e.gamma / 30, -(e.beta - 45) / 30);
}
function enableOrientation() {
  if (orientationOn || !window.DeviceOrientationEvent) return;
  const DOE = window.DeviceOrientationEvent;
  if (typeof DOE.requestPermission === 'function') {
    DOE.requestPermission()
      .then((s) => {
        if (s === 'granted') {
          orientationOn = true;
          window.addEventListener('deviceorientation', onOrientation);
        }
      })
      .catch(() => {});
  } else {
    orientationOn = true;
    window.addEventListener('deviceorientation', onOrientation);
  }
}
// Android: start immediately; iOS needs a tap (handled on first pointerdown)
if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission !== 'function') enableOrientation();
window.addEventListener('pointerdown', () => {
  sound.unlock();
  enableOrientation();
}, { once: true });

// Hover feedback on the envelope
['#sealHit', '#openBtn'].forEach((sel) => {
  const el = $(sel);
  el.addEventListener('pointerenter', () => {
    if (scene) scene.setHover(true);
    sound.hover();
  });
  el.addEventListener('pointerleave', () => scene && scene.setHover(false));
});

/* ------------------------------------------------------------------ */
/* Open                                                                */
/* ------------------------------------------------------------------ */

function open() {
  if (phase !== 'intro') return;
  phase = 'opening';
  sound.open(scene ? 'gl' : 'dom');
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate([18, 40, 30]);
  gsap.killTweensOf('.dom-envelope');

  const tl = gsap.timeline();
  tl.to('.intro-foot', { opacity: 0, y: 20, duration: 0.4, ease: 'power2.in' }, 0);
  tl.to('.intro-pill', { opacity: 0, y: -20, duration: 0.5, ease: 'power2.in' }, 0.1);
  tl.to('.arch-text', { opacity: 0, y: 20, duration: 0.5, ease: 'power2.in' }, 0.15);
  tl.to('.arch', { opacity: 0, scale: 1.04, duration: 0.9, ease: 'power2.in' }, 1.0);

  let revealAt;
  if (scene) {
    tl.add(scene.openTimeline(), 0);
    revealAt = 1.95;
  } else if (reduced) {
    tl.to('.dom-envelope', { opacity: 0, duration: 0.4 }, 0);
    revealAt = 0.4;
  } else {
    tl.to('.env-seal', { scale: 1.3, opacity: 0, duration: 0.35, ease: 'back.in(2)' }, 0)
      .to('.env-flap', { rotationX: 180, duration: 0.8, ease: 'power2.inOut' }, 0.25)
      .set('.env-flap', { zIndex: 0 }, 0.65)
      .to('.env-card', { yPercent: -70, duration: 0.8, ease: 'power3.out' }, 0.9)
      .to('.dom-envelope', { scale: 1.6, opacity: 0, duration: 0.7, ease: 'power2.in' }, 1.6);
    revealAt = 1.7;
  }

  tl.add(() => {
    if (!reduced) {
      gsap.fromTo('#flash', { opacity: 0 }, { opacity: 1, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.out' });
      confetti(innerWidth / 2, innerHeight * 0.45, innerWidth < 600 ? 70 : 120);
    }
    reveal();
  }, revealAt);
}

function reveal() {
  phase = 'revealed';
  document.body.classList.remove('is-locked');
  document.body.classList.add('revealed');
  $('#intro').setAttribute('aria-hidden', 'true');
  $('#invite').setAttribute('aria-hidden', 'false');
  window.scrollTo(0, 0);
  gsap.to('#intro', { opacity: 0, duration: 0.5, onComplete: () => ($('#intro').style.visibility = 'hidden') });
  gsap.to('#invite', { opacity: 1, duration: 0.8, ease: 'power2.out' });
  setupReveals({ reduced });
  sound.startMusic();
  if (!revealedOnce) {
    revealedOnce = true;
    startCountdown(() => lang);
    setupVideo();
    setupTilt();
  }
  setupNav();
  ScrollTrigger.refresh();
}

$('#openBtn').addEventListener('click', open);
$('#sealHit').addEventListener('click', open);
document.addEventListener('keydown', (e) => {
  if (phase === 'intro' && (e.key === 'Enter' || e.key === ' ') && document.activeElement === document.body) {
    e.preventDefault();
    open();
  }
});

/* Replay */
$('#replayBtn')?.addEventListener('click', () => {
  if (phase !== 'revealed') return;
  window.scrollTo({ top: 0, behavior: 'instant' });
  ScrollTrigger.getAll().forEach((t) => t.disable(false));
  document.body.classList.add('is-locked');
  document.body.classList.remove('revealed');
  $('#invite').setAttribute('aria-hidden', 'true');
  $('#intro').removeAttribute('aria-hidden');
  gsap.set('#invite', { opacity: 0 });
  gsap.set('#intro', { opacity: 1, visibility: 'visible' });
  gsap.set(['.intro-pill', '.arch', '.arch-text', '.intro-foot'], { clearProps: 'all' });
  closeNav();
  gsap.set(['.dom-envelope', '.env-seal', '.env-flap', '.env-card'], { clearProps: 'all' });
  sound.stopMusic();
  if (scene) {
    scene.setScroll(0);
    scene.resetEnvelope();
  }
  phase = 'loading';
  layout();
  startIntro();
  gsap.set('#loader', { display: 'none' });
});

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

$('#langBtn').addEventListener('click', () => {
  lang = lang === 'ml' ? 'en' : 'ml';
  // keep the address bar in sync so a copied link opens in the same language
  const u = new URL(location.href);
  if (lang === 'ml') u.searchParams.set('lang', 'ml');
  else u.searchParams.delete('lang');
  history.replaceState(null, '', u);
  applyText(lang);
  if (scene) scene.setLang(lang);
  if (phase === 'revealed') {
    setupReveals({ reduced, silent: true });
    ScrollTrigger.refresh();
  }
});

function updateSoundBtn() {
  $('#soundBtn').setAttribute('aria-pressed', String(sound.enabled));
}
$('#soundBtn').addEventListener('click', () => {
  const on = sound.toggle();
  updateSoundBtn();
  if (on) {
    sound.click();
    if (phase === 'revealed') sound.startMusic();
  }
});

// Soft tap on every button except Open / seal / sound (those have their own sounds)
document.addEventListener('click', (e) => {
  const b = e.target.closest('.btn, .chip, .link, .play');
  if (b && b.id !== 'soundBtn') sound.click();
});

$('#icsBtn')?.addEventListener('click', () => downloadIcs(lang));
$('#shareBtn')?.addEventListener('click', () => share(lang));
$('#copyBtn')?.addEventListener('click', () => copyLink(lang));

window.addEventListener(
  'scroll',
  () => {
    if (scene && phase === 'revealed') scene.setScroll(window.scrollY);
  },
  { passive: true },
);

/* ------------------------------------------------------------------ */
/* Section pill nav                                                    */
/* ------------------------------------------------------------------ */

const NAV = [
  ['#s-invite', 'navInvite'],
  ['#s-date', 'navDate'],
  ['#s-video', 'navVideo'],
  ['#s-programme', 'navProgramme'],
];
let navReady = false;
function setNavLabel(key) {
  const label = $('#navLabel');
  label.dataset.t = key;
  label.textContent = TEXT[lang][key];
  document.querySelectorAll('#navMenu a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.t === key)));
}
function closeNav() {
  $('#navMenu').hidden = true;
  $('#navBtn').setAttribute('aria-expanded', 'false');
}
function setupNav() {
  NAV.forEach(([sel, key]) =>
    ScrollTrigger.create({ trigger: sel, start: 'top 45%', end: 'bottom 45%', onToggle: (st) => st.isActive && setNavLabel(key) }),
  );
  if (navReady) return;
  navReady = true;
  $('#navBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = $('#navMenu').hidden;
    $('#navMenu').hidden = !open;
    $('#navBtn').setAttribute('aria-expanded', String(open));
    if (open) gsap.fromTo('#navMenu', { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
  });
  $('#navMenu').addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    closeNav();
    document.querySelector(a.getAttribute('href')).scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#nav')) closeNav();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeNav());
}

boot();
