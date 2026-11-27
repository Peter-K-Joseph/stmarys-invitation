import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TEXT, PROGRAMME, REGARDS, EVENT } from './content.js';
import { sound } from './audio.js';

export { sound };

gsap.registerPlugin(ScrollTrigger);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// On screen only: a vowel sign straight after a hyphen ("146-ാമത്") is drawn with a
// standalone copy of the glyph (U+E0AA in the bundled Invite Malayalam font), because
// some text engines (Safari / iOS) show a box for a vowel sign with no letter before it.
// Shared, calendar and title text keep the real characters.
const screenMl = (html) => html.replace(/-ാ/g, '-');

// Shared links carry ?lang=ml when the invitation is being viewed in Malayalam
export const shareUrl = () => location.origin + location.pathname + (document.documentElement.lang === 'ml' ? '?lang=ml' : '');

/* ------------------------------------------------------------------ */
/* Language                                                            */
/* ------------------------------------------------------------------ */

export function applyText(lang) {
  const T = TEXT[lang];
  document.documentElement.lang = lang;
  document.body.classList.toggle('lang-ml', lang === 'ml');
  document.body.classList.toggle('lang-en', lang === 'en');
  document.title = T.docTitle;
  $$('[data-t]').forEach((el) => {
    const v = T[el.dataset.t];
    if (v != null) el.innerHTML = lang === 'ml' ? screenMl(v) : v;
  });
  $$('[data-words]').forEach(splitWords);

  $('#programmeList').innerHTML = PROGRAMME.map((p, i) => {
    const [item, who, role] = p[lang];
    return `<li class="step">
      <div class="node" aria-hidden="true"></div>
      <div class="card">
        <span class="item">${esc(item)}</span>
        ${who ? `<span class="who">${esc(who)}</span>` : ''}
        ${role ? `<span class="role">${esc(role)}</span>` : ''}
      </div>
    </li>`;
  }).join('');

  $('#regardsList').innerHTML = REGARDS.map((r) => {
    const [name, role] = r[lang];
    return `<li class="glass" data-reveal><strong>${esc(name)}</strong><span>${esc(role)}</span></li>`;
  }).join('');

  const gcal = new URL('https://calendar.google.com/calendar/render');
  gcal.searchParams.set('action', 'TEMPLATE');
  gcal.searchParams.set('text', T.calTitle);
  gcal.searchParams.set('dates', `${icsDate(EVENT.start)}/${icsDate(EVENT.end)}`);
  gcal.searchParams.set('details', `${T.calDetails}\n${shareUrl()}`);
  gcal.searchParams.set('location', T.venue + ', ' + T.venueSub);
  // these buttons are optional (removed from the current layout)
  const set = (sel, href) => { const el = $(sel); if (el) el.href = href; };
  set('#gcalBtn', gcal.toString());
  set('#mapBtn', 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(EVENT.mapsQuery));
  set('#waBtn', 'https://wa.me/?text=' + encodeURIComponent(`${T.shareText} ${shareUrl()}`));
}

// Wrap every word in a span (keeping inline tags) so it can be animated.
function splitWords(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const frag = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
      else {
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = part;
        frag.appendChild(s);
      }
    });
    node.replaceWith(frag);
  });
}

/* ------------------------------------------------------------------ */
/* Scroll reveals (re-runnable after a language switch)               */
/* ------------------------------------------------------------------ */

let triggers = [];
export function setupReveals({ reduced = false, silent = false } = {}) {
  triggers.forEach((t) => t.kill());
  triggers = [];
  const track = (t) => (triggers.push(t), t);
  const born = performance.now();
  // After a language switch, things already scrolled past appear instantly and quietly.
  const instant = () => reduced || (silent && performance.now() - born < 400);

  const show = (targets, vars = {}) =>
    instant() ? gsap.set(targets, { opacity: 1, x: 0, y: 0 }) : gsap.to(targets, { opacity: 1, x: 0, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, ...vars });

  const reveals = $$('#invite [data-reveal]');
  gsap.set(reveals, { opacity: 0, y: 34 });
  ScrollTrigger.batch(reveals, {
    start: 'top 90%',
    once: true,
    onEnter: (batch) => show(batch),
  }).forEach(track);

  $$('#invite [data-words]').forEach((p) => {
    const words = $$('.w', p);
    gsap.set(words, { opacity: 0, y: 12 });
    track(
      ScrollTrigger.create({
        trigger: p,
        start: 'top 85%',
        once: true,
        onEnter: () => show(words, { duration: 0.6, stagger: 0.025 }),
      }),
    );
  });

  // Programme quest path
  $$('#programmeList .step').forEach((step, i) => {
    const card = $('.card', step);
    gsap.set(card, { x: 24 });
    track(
      ScrollTrigger.create({
        trigger: step,
        start: 'top 72%',
        onEnter: () => {
          step.classList.add('lit');
          const quiet = instant();
          if (quiet) gsap.set(card, { x: 0 });
          else gsap.to(card, { x: 0, duration: 0.7, ease: 'power3.out' });
          if (!quiet) tick(i);
        },
        onLeaveBack: () => step.classList.remove('lit'),
      }),
    );
  });
  track(
    ScrollTrigger.create({
      trigger: '.quest',
      start: 'top 70%',
      end: 'bottom 75%',
      scrub: 0.6,
      animation: gsap.fromTo('.quest-fill', { scaleY: 0 }, { scaleY: 1, ease: 'none' }),
    }),
  );
  gsap.set('#finale', { opacity: 0, scale: 0.85 });
  track(
    ScrollTrigger.create({
      trigger: '#finale',
      start: 'top 80%',
      once: true,
      onEnter: () => {
        const quiet = instant();
        gsap.to('#finale', { opacity: 1, scale: 1, duration: quiet ? 0 : 0.9, ease: 'back.out(1.8)' });
        if (!quiet) {
          const r = $('#finale').getBoundingClientRect();
          confetti(r.left + r.width / 2, r.top + 40, 90);
          sound.finale();
        }
      },
    }),
  );

  // Lazy-attach the teaser video when its section approaches
  track(ScrollTrigger.create({ trigger: '.teaser', start: 'top 140%', once: true, onEnter: primeVideo }));
}

let lastTick = -1;
function tick(i) {
  if (i === lastTick) return;
  lastTick = i;
  sound.step(i);
}

/* ------------------------------------------------------------------ */
/* Countdown                                                           */
/* ------------------------------------------------------------------ */

export function startCountdown(getLang) {
  if (!$('#countdown')) return;
  const target = new Date(EVENT.start).getTime();
  const cells = Object.fromEntries($$('#countdown .cd-num').map((el) => [el.dataset.unit, el]));
  const prev = {};
  function set(unit, val) {
    const v = String(val).padStart(2, '0');
    if (prev[unit] === v) return;
    const el = cells[unit];
    el.innerHTML = `<span>${v}</span>`;
    if (prev[unit] !== undefined) gsap.from(el.firstChild, { yPercent: -70, opacity: 0, duration: 0.45, ease: 'back.out(2)' });
    prev[unit] = v;
  }
  function update() {
    const diff = target - Date.now();
    const done = $('#cdDone');
    if (diff <= 0) {
      const sameDay = Date.now() - target < 12 * 3600 * 1000;
      $('#countdown').hidden = true;
      done.hidden = false;
      done.textContent = TEXT[getLang()][sameDay ? 'eventToday' : 'eventPast'];
      return;
    }
    set('d', Math.floor(diff / 864e5));
    set('h', Math.floor(diff / 36e5) % 24);
    set('m', Math.floor(diff / 6e4) % 60);
    set('s', Math.floor(diff / 1e3) % 60);
  }
  update();
  setInterval(update, 1000);
}

/* ------------------------------------------------------------------ */
/* Calendar / share / copy                                             */
/* ------------------------------------------------------------------ */

function icsDate(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
const icsEsc = (s) => s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');

export function downloadIcs(lang) {
  const T = TEXT[lang];
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//St Marys UP School Thevara//Invitation//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:annual-day-2027@stmarys-ups-thevara',
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(EVENT.start)}`,
    `DTEND:${icsDate(EVENT.end)}`,
    `SUMMARY:${icsEsc(T.calTitle)}`,
    `LOCATION:${icsEsc(T.venue + ', ' + T.venueSub)}`,
    `DESCRIPTION:${icsEsc(T.calDetails + '\n' + shareUrl())}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT12H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEsc(T.calTitle)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'StMarys-Annual-Day-2027.ics';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
}

export async function share(lang) {
  const T = TEXT[lang];
  if (navigator.share) {
    try {
      await navigator.share({ title: T.docTitle, text: T.shareText, url: shareUrl() });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  window.open($('#waBtn').href, '_blank', 'noopener');
}

export async function copyLink(lang) {
  const url = shareUrl();
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const t = document.createElement('textarea');
    t.value = url;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  toast(TEXT[lang].copied);
}

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ------------------------------------------------------------------ */
/* Video                                                               */
/* ------------------------------------------------------------------ */

const VIDEO_SRC = './assets/teaser.mp4';
function primeVideo() {
  const v = $('#teaser');
  if (v.dataset.primed) return;
  v.dataset.primed = '1';
  v.preload = 'metadata';
  v.src = VIDEO_SRC + '#t=0.1';
}
export function setupVideo() {
  const v = $('#teaser');
  const phone = v.closest('.phone');
  $('#playBtn').addEventListener('click', () => {
    if (!v.dataset.started) {
      v.dataset.started = v.dataset.primed = '1';
      v.src = VIDEO_SRC;
    }
    v.play().catch(() => {});
    v.controls = true;
  });
  v.addEventListener('play', () => {
    phone.classList.add('playing');
    sound.duck(true);
  });
  v.addEventListener('pause', () => {
    phone.classList.remove('playing');
    sound.duck(false);
  });
  v.addEventListener('ended', () => {
    phone.classList.remove('playing');
    v.controls = false;
    sound.duck(false);
  });
}

/* ------------------------------------------------------------------ */
/* Tilt cards                                                          */
/* ------------------------------------------------------------------ */

export function setupTilt() {
  $$('.tilt').forEach((el) => {
    const frame = $('.frame', el) || el;
    const rx = gsap.quickTo(frame, 'rotationX', { duration: 0.5, ease: 'power3.out' });
    const ry = gsap.quickTo(frame, 'rotationY', { duration: 0.5, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      ry(x * 18);
      rx(-y * 14);
    });
    el.addEventListener('pointerleave', () => {
      rx(0);
      ry(0);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Confetti                                                            */
/* ------------------------------------------------------------------ */

const CONFETTI_COLORS = ['#e6b84a', '#f4dc95', '#fff6dd', '#ffffff', '#9fb4ff', '#2c55d8'];
export function confetti(x, y, n = 80) {
  const box = $('#confetti');
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    if (i % 3 === 0) p.style.borderRadius = '50%';
    box.appendChild(p);
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const v = 260 + Math.random() * 380;
    const dx = Math.cos(ang) * v;
    const dy = Math.sin(ang) * v;
    gsap.set(p, { x, y, rotation: Math.random() * 360, scale: 0.6 + Math.random() * 0.8 });
    const tl = gsap.timeline({ onComplete: () => p.remove() });
    tl.to(p, { x: x + dx, duration: 2.2, ease: 'power1.out' }, 0)
      .to(p, { y: y + dy, duration: 0.7, ease: 'power2.out' }, 0)
      .to(p, { y: y + dy + 520 + Math.random() * 300, duration: 1.6, ease: 'power1.in' }, 0.7)
      .to(p, { rotation: '+=' + (360 + Math.random() * 540), rotationX: 360, duration: 2.3, ease: 'none' }, 0)
      .to(p, { opacity: 0, duration: 0.5 }, 1.8);
  }
}
