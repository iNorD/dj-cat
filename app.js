'use strict';
(() => {
  // ---------- data ----------
  const PARTS = [
    { key: 'body', name: 'Тело' },
    { key: 'head', name: 'Голова' },
    { key: 'headband', name: 'Дужка' },
    { key: 'headphones', name: 'Наушники' },
    { key: 'eyes', name: 'Глаза' },
    { key: 'nose', name: 'Носик' },
    { key: 'bow', name: 'Бантик' },
    { key: 'diamond', name: 'Кристалл' },
  ]; // part id in the frames = index + 1

  // Colors are estimated from the filament makers' product photos.
  const COLORS = {
    W: { name: 'Белый', hex: '#EFEEEA', mat: 'ELEGOO Matte PLA', finish: 'матовый', spec: 0.35, trans: 0 },
    B: { name: 'Чёрный', hex: '#232323', mat: 'ELEGOO Matte PLA', finish: 'матовый', spec: 0.35, trans: 0 },
    P: { name: 'Розовая сакура', hex: '#F4B5CA', mat: 'ELEGOO Matte PLA', finish: 'матовый', spec: 0.35, trans: 0 },
    Y: { name: 'Миндально-жёлтый', hex: '#EDDA8E', mat: 'eSUN PLA+', finish: 'полуматовый', spec: 0.8, trans: 0 },
    K: { name: 'Светлый хаки', hex: '#B7AD95', mat: 'eSUN PLA+', finish: 'полуматовый', spec: 0.8, trans: 0 },
    O: { name: 'Оливковый', hex: '#7FA063', mat: 'ELEGOO PETG', finish: 'полупрозрачный, глянцевый', spec: 1.5, trans: 0.35 },
  };
  const ORDER = ['W', 'B', 'P', 'Y', 'K', 'O'];

  // code = one letter per part in PARTS order
  const PRESETS = [
    { name: 'Классика', code: 'KKWWBPPO' },
    { name: 'Снежок', code: 'WWBBBPPO' },
    { name: 'Чёрный кот', code: 'BBYYYPPO' },
    { name: 'Сакура', code: 'PPWWBBWO' },
    { name: 'Лимонный', code: 'YYBBBPPO' },
    { name: 'Зефир', code: 'WWPPBYPO' },
    { name: 'Пастель', code: 'YYPPBPWO' },
    { name: 'Сафари', code: 'KKBOBBOY' },
    { name: 'Монохром', code: 'WWBBBBBB' },
  ];

  const PAIR = { body: 'head', head: 'body', headband: 'headphones', headphones: 'headband' };
  const PAIR_LABEL = { body: 'и голова тоже', head: 'и тело тоже', headband: 'и наушники тоже', headphones: 'и дужка тоже' };
  const linkId = (key) => (key === 'body' || key === 'head' ? 'bh' : 'hp');

  // ---------- render constants (must match the offline renderer) ----------
  const FRAMES = 36;
  const FH = 900;
  const IDW = 1440;
  const IDH = 1800;
  const DMAX = 2.0;
  const SMAX = 1.0;
  const SKY_D = 1.3094;
  const BACKDROP = '#EAE7E3';
  const CACHE = 8; // frames kept on the GPU, 3.9 MB each

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const srgbToLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const linToSrgb = (x) => { x = clamp(x, 0, 1); return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; };
  const shoulder = (c) => c / (1 + Math.max(c - 0.8, 0) * 0.9);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // the far floor color of the renders, so the canvas blends into its box
  const stage = hexToRgb(BACKDROP).map((v) => Math.round(255 * linToSrgb(shoulder(srgbToLin(v) * SKY_D))));
  document.documentElement.style.setProperty('--stage', `rgb(${stage.join(',')})`);

  // ---------- state ----------
  const colors = {};
  let sel = 'body';
  const link = { bh: true, hp: true };

  const codeOf = () => PARTS.map((p) => colors[p.key]).join('');
  const colorsOf = (code) => { const c = {}; PARTS.forEach((p, i) => { c[p.key] = code[i]; }); return c; };

  // Cyrillic letters typed instead of the Latin ones: look-alikes (К, В, Р, О, У)
  // and the same keys on the Russian keyboard layout (Ц, И, З, Н, Л, Щ).
  const CYR = { 'К': 'K', 'В': 'B', 'Р': 'P', 'О': 'O', 'У': 'Y', 'Ц': 'W', 'И': 'B', 'З': 'P', 'Н': 'Y', 'Л': 'K', 'Щ': 'O' };
  function parseCode(s) {
    const up = String(s || '').toUpperCase();
    // a code inside a longer text: the copied order, a link with #CODE
    const m = up.match(/(?:^|[^A-Z])([WBPYKO]{8})(?![A-Z])/);
    if (m) return m[1];
    // a code typed by hand: with spaces, zero instead of O or Cyrillic letters
    const t = up.replace(/0/g, 'O').replace(/[^A-ZА-ЯЁ]/g, '').replace(/[КВРОУЦИЗНЛЩ]/g, (ch) => CYR[ch]);
    return /^[WBPYKO]{8}$/.test(t) ? t : null;
  }

  function applyCode(code, opts = {}) {
    Object.assign(colors, colorsOf(code));
    link.bh = colors.body === colors.head;
    link.hp = colors.headband === colors.headphones;
    changed(opts);
  }

  function setColor(key, letter) {
    colors[key] = letter;
    if (PAIR[key] && link[linkId(key)]) colors[PAIR[key]] = letter;
    changed();
  }

  function changed(opts = {}) {
    if (glOk) { buildPalette(colors); dirty = true; requestDraw(); }
    renderParts();
    renderPalette();
    renderSummary();
    renderPresetState();
    if (!opts.keepHash) {
      try { history.replaceState(null, '', '#' + codeOf()); } catch (e) { /* file:// or sandbox */ }
    }
  }

  // ---------- UI ----------
  function dot(hex, cls = 'dot') {
    const s = document.createElement('span');
    s.className = cls;
    s.style.background = hex;
    return s;
  }

  // The preset thumbnails are pictures, not canvases: the system may wipe canvases along with the GPU.
  const thumbDpr = Math.min(window.devicePixelRatio || 1, 2);
  const thumbW = Math.round(72 * thumbDpr);
  const thumbH = Math.round(110 * thumbDpr);
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function buildPresets() {
    const box = $('presets');
    PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.setAttribute('aria-pressed', 'false');
      const im = document.createElement('img');
      im.alt = '';
      im.className = 'thumb';
      im.draggable = false;
      // an img without a picture gets a gray frame: a transparent one stands in until the render
      im.src = BLANK;
      b.appendChild(im);
      const s = document.createElement('span');
      s.textContent = p.name;
      b.appendChild(s);
      b.addEventListener('click', () => { applyCode(p.code); stopHint(); });
      p.btn = b;
      p.img = im;
      box.appendChild(b);
    });
    const r = document.createElement('button');
    r.type = 'button';
    r.className = 'preset';
    r.innerHTML = '<span class="dice" aria-hidden="true">🎲</span><span>Случайная</span>';
    r.addEventListener('click', () => { applyCode(randomCode()); stopHint(); });
    box.appendChild(r);
  }

  function renderPresetState() {
    const code = codeOf();
    PRESETS.forEach((p) => p.btn && p.btn.setAttribute('aria-pressed', String(p.code === code)));
  }

  function buildParts() {
    const box = $('parts');
    PARTS.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('role', 'tab');
      b.appendChild(dot('#ccc'));
      const s = document.createElement('span');
      s.textContent = p.name;
      b.appendChild(s);
      b.addEventListener('click', () => selectPart(p.key, false));
      p.chip = b;
      box.appendChild(b);
    });
  }

  // Parts and colors work as tabs and radio buttons: only the chosen one is a Tab stop,
  // the arrow keys move along the row.
  function renderParts() {
    PARTS.forEach((p) => {
      p.chip.setAttribute('aria-selected', String(p.key === sel));
      p.chip.tabIndex = p.key === sel ? 0 : -1;
      p.chip.firstChild.style.background = COLORS[colors[p.key]].hex;
    });
  }

  function arrowStep(e, n, i, vertical) {
    if (e.altKey || e.ctrlKey || e.metaKey) return -1;
    const k = e.key;
    if (k === 'ArrowRight' || (vertical && k === 'ArrowDown')) return (i + 1) % n;
    if (k === 'ArrowLeft' || (vertical && k === 'ArrowUp')) return (i - 1 + n) % n;
    if (k === 'Home') return 0;
    if (k === 'End') return n - 1;
    return -1;
  }

  // The swatches are built once and only re-marked, so a pressed one keeps the keyboard focus.
  const swatches = {};
  function buildSwatches() {
    const box = $('palette');
    ORDER.forEach((letter) => {
      const c = COLORS[letter];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.setAttribute('role', 'radio');
      b.appendChild(dot(c.hex, 'ball'));
      const t = document.createElement('span');
      t.className = 'txt';
      t.innerHTML = '<span class="nm"></span><span class="mt"></span>';
      t.firstChild.textContent = c.name;
      t.lastChild.textContent = c.finish;
      b.appendChild(t);
      b.title = `${c.name}: ${c.mat}, ${c.finish}`;
      b.addEventListener('click', () => { setColor(sel, letter); pulse(PARTS.findIndex((p) => p.key === sel) + 1); stopHint(); });
      swatches[letter] = b;
      box.appendChild(b);
    });
  }

  function renderPalette() {
    const part = PARTS.find((p) => p.key === sel);
    $('palTitle').textContent = `${part.name}: ${COLORS[colors[sel]].name.toLowerCase()}`;
    const lw = $('linkWrap');
    if (PAIR[sel]) {
      lw.hidden = false;
      $('linkTxt').textContent = PAIR_LABEL[sel];
      $('link').checked = link[linkId(sel)];
    } else {
      lw.hidden = true;
    }
    ORDER.forEach((letter) => {
      swatches[letter].setAttribute('aria-checked', String(colors[sel] === letter));
      swatches[letter].tabIndex = colors[sel] === letter ? 0 : -1;
    });
  }

  // The palette head keeps the height of its tallest variant at the current width (every part with
  // every color), so a new choice never moves the swatches under the finger. The variants are tried
  // on the real nodes and put back within the same task: nothing is painted in between.
  let palHeadW = -1;
  function fitPalHead() {
    const title = $('palTitle');
    const head = title.parentNode;
    const w = head.getBoundingClientRect().width;
    if (!w || Math.abs(w - palHeadW) < 0.5) return;
    palHeadW = w;
    const lw = $('linkWrap');
    const lt = $('linkTxt');
    const keep = [title.textContent, lw.hidden, lt.textContent];
    head.style.minHeight = '';
    let max = 0;
    PARTS.forEach((p) => {
      lw.hidden = !PAIR[p.key];
      if (PAIR[p.key]) lt.textContent = PAIR_LABEL[p.key];
      ORDER.forEach((l) => {
        title.textContent = `${p.name}: ${COLORS[l].name.toLowerCase()}`;
        max = Math.max(max, head.getBoundingClientRect().height);
      });
    });
    title.textContent = keep[0];
    lw.hidden = keep[1];
    lt.textContent = keep[2];
    head.style.minHeight = max + 'px';
  }

  function renderSummary() {
    const ul = $('summary');
    ul.textContent = '';
    PARTS.forEach((p) => {
      const c = COLORS[colors[p.key]];
      const li = document.createElement('li');
      li.appendChild(dot(c.hex));
      const pn = document.createElement('span');
      pn.className = 'pn';
      pn.textContent = p.name + ':';
      const cn = document.createElement('span');
      cn.className = 'cn';
      cn.textContent = c.name;
      li.append(pn, cn);
      ul.appendChild(li);
    });
    $('code').textContent = codeOf();
  }

  function selectPart(key, fromViewer, ev) {
    sel = key;
    renderParts();
    renderPalette();
    const id = PARTS.findIndex((p) => p.key === key) + 1;
    pulse(id);
    if (fromViewer && ev) flashTip(PARTS[id - 1].name, ev);
  }

  function randomCode() {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    for (let tries = 0; tries < 50; tries++) {
      const body = pick(['W', 'B', 'P', 'Y', 'K', 'K', 'W']);
      const head = Math.random() < 0.88 ? body : pick(ORDER.filter((c) => c !== 'O'));
      const phones = pick(ORDER.filter((c) => c !== body));
      const band = Math.random() < 0.75 ? phones : pick(ORDER);
      const eyes = head === 'B' ? pick(['Y', 'W', 'P']) : (Math.random() < 0.85 ? 'B' : pick(ORDER.filter((c) => c !== head)));
      const nose = pick(ORDER.filter((c) => c !== head && c !== 'O'));
      const bow = pick(ORDER.filter((c) => c !== head));
      const diamond = Math.random() < 0.6 ? 'O' : pick(ORDER);
      const code = [body, head, band, phones, eyes, nose, bow, diamond].join('');
      if (code !== codeOf()) return code;
    }
    return PRESETS[0].code;
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    // a long message stays longer, so there is time to read it
    toastTimer = setTimeout(() => t.classList.remove('show'), clamp(msg.length * 60, 2800, 6000));
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* fall back below */ }
    const prev = document.activeElement;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    // the textarea took the focus; give it back to the pressed button
    if (prev && prev !== document.body && prev.focus) {
      try { prev.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    return ok;
  }

  function orderText() {
    const code = codeOf();
    const preset = PRESETS.find((p) => p.code === code);
    const lines = [`Здравствуйте! Хочу DJ-котика в такой расцветке${preset ? ` («${preset.name}»)` : ''}:`];
    PARTS.forEach((p) => lines.push(`${p.name}: ${COLORS[colors[p.key]].name.toLowerCase()}`));
    lines.push(`Код расцветки: ${code}`);
    return lines.join('\n');
  }

  function bindUI() {
    $('link').addEventListener('change', (e) => {
      if (!PAIR[sel]) return;
      link[linkId(sel)] = e.target.checked;
      if (e.target.checked) setColor(sel, colors[sel]);
    });
    $('copy').addEventListener('click', async () => {
      const ok = await copyText(orderText());
      toast(ok ? 'Скопировано. Вставьте текст в чат с продавцом на Авито.' : 'Не получилось скопировать. Перепишите код расцветки: ' + codeOf());
    });
    $('code').addEventListener('click', async () => {
      const ok = await copyText(codeOf());
      toast(ok ? 'Код скопирован' : 'Код расцветки: ' + codeOf());
    });
    $('share').addEventListener('click', async () => {
      const url = location.href.split('#')[0] + '#' + codeOf();
      if (navigator.share) {
        try { await navigator.share({ title: 'DJ-котик', text: 'Мой DJ-котик, код расцветки ' + codeOf(), url }); return; } catch (e) {
          if (e && e.name === 'AbortError') return;
        }
      }
      const ok = await copyText(url);
      toast(ok ? 'Ссылка скопирована' : url);
    });
    // A wrong code is explained under the field: a toast would hide behind the phone keyboard.
    // The text stays until the next try: taking it away while the keyboard is open made
    // Safari move the field under the finger.
    const codeErr = (msg) => {
      $('codeerr').textContent = msg;
      if (msg) $('codein').setAttribute('aria-invalid', 'true'); else $('codein').removeAttribute('aria-invalid');
    };
    $('codeform').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('codein');
      const c = parseCode(inp.value);
      if (!c) { codeErr('Нужен код из 8 латинских букв W, B, P, Y, K, O, например KKWWBPPO.'); return; }
      codeErr('');
      inp.value = c;
      // the keyboard closes, and the next Tab goes on from the cat rather than the page bottom;
      // the block is focusable only for this moment, so a tap on it never focuses it
      const stage = $('stage');
      stage.tabIndex = -1;
      stage.addEventListener('blur', () => stage.removeAttribute('tabindex'), { once: true });
      stage.focus({ preventScroll: true });
      applyCode(c);
      toast('Расцветка по коду ' + c);
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    window.addEventListener('hashchange', () => {
      const c = parseCode(location.hash);
      if (c && c !== codeOf()) applyCode(c, { keepHash: true });
    });
    $('vmsgbtn').addEventListener('click', () => { if (msgAction) msgAction(); });
    $('parts').addEventListener('keydown', (e) => {
      const i = PARTS.findIndex((p) => p.chip === document.activeElement);
      if (i < 0) return;
      const j = arrowStep(e, PARTS.length, i, false);
      if (j < 0) return;
      e.preventDefault();
      selectPart(PARTS[j].key, false);
      PARTS[j].chip.focus();
    });
    $('palette').addEventListener('keydown', (e) => {
      const i = ORDER.findIndex((l) => swatches[l] === document.activeElement);
      if (i < 0) return;
      const j = arrowStep(e, ORDER.length, i, true);
      if (j < 0) return;
      e.preventDefault();
      swatches[ORDER[j]].click();
      swatches[ORDER[j]].focus();
    });
    const groups = {};
    ORDER.forEach((l) => {
      const c = COLORS[l];
      const key = `${c.mat} (${c.finish})`;
      (groups[key] = groups[key] || []).push(c.name.toLowerCase());
    });
    $('materials').textContent = 'Пластик: ' + Object.entries(groups).map(([k, v]) => `${v.join(', ')}: ${k}`).join('; ') + '.';
  }

  // ---------- message over the viewer ----------
  let msgKind = '';
  let msgAction = null;
  function showMsg(kind, text, btn, action) {
    if (msgKind === 'lost' && kind !== 'lost') return;
    msgAction = action || null;
    if (msgKind === kind && !$('vmsg').hidden) return; // already on screen and announced
    msgKind = kind;
    $('vmsgtxt').textContent = text;
    $('vmsgbtn').textContent = btn || '';
    $('vmsgbtn').hidden = !btn;
    $('vmsg').hidden = false;
    $('vlive').textContent = text;
    // the cat and its buttons get hidden: the keyboard focus goes to the message button
    const f = document.activeElement;
    const inViewer = f && f !== $('vmsgbtn') && $('viewer').contains(f);
    $('viewer').classList.add('off');
    if (inViewer && btn) $('vmsgbtn').focus({ preventScroll: true });
    fitMsg();
  }
  function hideMsg(kind) {
    if (msgKind !== kind) return;
    const hadFocus = document.activeElement === $('vmsgbtn');
    msgKind = '';
    msgAction = null;
    $('vmsg').hidden = true;
    $('vlive').textContent = '';
    $('viewer').classList.remove('off');
    if (hadFocus) canvas.focus({ preventScroll: true });
  }
  // A low viewer (a phone on its side, a large page zoom) gets smaller text; if even that does not
  // fit, the message scrolls inside the viewer. In the narrowest one, where a word or the button
  // label would be cut in two, the text gets smaller still and breaks long words with a hyphen.
  function wordCut(el) {
    if (el.hidden || !el.firstChild) return false;
    const t = el.firstChild;
    const re = /[^\s-]+-?/g;
    let w;
    while ((w = re.exec(t.textContent))) {
      const r = document.createRange();
      r.setStart(t, w.index);
      r.setEnd(t, w.index + w[0].length);
      if (new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size > 1) return true;
    }
    return false;
  }
  function fitMsg() {
    const m = $('vmsg');
    if (m.hidden) return;
    const over = () => m.scrollHeight > m.clientHeight + 1;
    m.classList.remove('compact', 'tiny', 'micro');
    if (over()) m.classList.add('compact');
    if (over()) m.classList.add('tiny');
    if (m.classList.contains('tiny') && (wordCut($('vmsgtxt')) || wordCut($('vmsgbtn')))) m.classList.add('micro');
  }

  // ---------- WebGL viewer ----------
  const canvas = $('cv');
  let gl = null;
  let glOk = false; // the context works and initGL() has run on it
  try {
    const attrs = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false };
    gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
  } catch (e) { gl = null; }

  const VS = 'attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }';
  const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uDS;
uniform sampler2D uID;
uniform sampler2D uPal;
uniform vec2 uStep;
uniform float uHalf;
uniform float uDMax;
uniform float uSMax;
uniform float uHiId;
uniform float uHi;
vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 alb = vec3(0.0);
  float spec = 0.0; float trans = 0.0; float hi = 0.0;
  for (int k = 0; k < 4; k++) {
    float fx = (k == 1 || k == 3) ? 1.0 : -1.0;
    float fy = (k >= 2) ? 1.0 : -1.0;
    float id = floor(texture2D(uID, uv + vec2(fx, fy) * uStep).r * 255.0 + 0.5);
    vec4 a = texture2D(uPal, vec2((id + 0.5) / 16.0, 0.25));
    vec4 b = texture2D(uPal, vec2((id + 0.5) / 16.0, 0.75));
    alb += toLin(a.rgb);
    spec += b.r * 2.0;
    trans += b.g;
    hi += abs(id - uHiId) < 0.5 ? 1.0 : 0.0;
  }
  alb *= 0.25; spec *= 0.25; trans *= 0.25; hi *= 0.25;
  float v = clamp(uv.y, uHalf, 1.0 - uHalf) * 0.5;
  float D = uDMax * pow(texture2D(uDS, vec2(uv.x, v)).r, 2.2);
  float S = uSMax * pow(texture2D(uDS, vec2(uv.x, v + 0.5)).r, 2.2);
  D = mix(D, 0.35 + 0.65 * D, trans);
  vec3 c = alb * D + vec3(spec * S);
  c = c / (1.0 + max(c - 0.8, 0.0) * 0.9);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 target = lum > 0.45 ? c * 0.7 + vec3(0.0, 0.03, 0.015) : c + vec3(0.10, 0.17, 0.12);
  c = mix(c, target, hi * uHi);
  gl_FragColor = vec4(toSrgb(c), 1.0);
}`;

  let prog = null;
  let vbo = null;
  let aPos = -1;
  const U = {};
  let texPal = null;
  const palData = new Uint8Array(16 * 2 * 4);
  let cache = []; // frame textures on the GPU, least recently used first
  let cur = null; // textures of the frame on screen
  let dirty = true; // the picture on the canvas is out of date

  function mkTex(filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // Fill the canvas with the stage color: an opaque WebGL canvas is black until something is drawn.
  function clearStage() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(stage[0] / 255, stage[1] / 255, stage[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function initGL() {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    aPos = gl.getAttribLocation(prog, 'aPos');
    ['uDS', 'uID', 'uPal', 'uStep', 'uHalf', 'uDMax', 'uSMax', 'uHiId', 'uHi'].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    texPal = mkTex(gl.NEAREST);
    cache = [];
    cur = null;
    shown = -1;
    gl.useProgram(prog);
    gl.uniform1i(U.uDS, 0);
    gl.uniform1i(U.uID, 1);
    gl.uniform1i(U.uPal, 2);
    gl.uniform1f(U.uHalf, 0.5 / FH);
    gl.uniform1f(U.uDMax, DMAX);
    gl.uniform1f(U.uSMax, SMAX);
    glOk = true;
    clearStage();
  }

  function buildPalette(cols) {
    palData.fill(0);
    const put = (i, rgb, spec, trans) => {
      palData.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
      palData.set([Math.round(clamp(spec / 2, 0, 1) * 255), Math.round(trans * 255), 0, 255], (16 + i) * 4);
    };
    put(0, hexToRgb(BACKDROP), 0, 0);
    PARTS.forEach((p, i) => { const c = COLORS[cols[p.key]]; put(i + 1, hexToRgb(c.hex), c.spec, c.trans); });
    gl.bindTexture(gl.TEXTURE_2D, texPal);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 16, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, palData);
  }

  // ---------- frames ----------
  const frames = new Array(FRAMES).fill(null);
  let loadedCount = 0;
  let shown = -1; // frame whose textures are in `cur`
  let failed = [];
  let loading = false;
  let started = false; // the first frame is on screen
  let thumbFrame = -1; // frame the preset thumbnails were drawn from
  let retries = 0;

  const loadImg = (src) => new Promise((resolve, reject) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('load ' + src));
    im.src = src;
  });

  async function loadFrame(i) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await sleep(700 * attempt);
      try {
        const [ds, id] = await Promise.all([loadImg(`frames/ds${pad(i)}.webp`), loadImg(`frames/id${pad(i)}.png`)]);
        frames[i] = { ds, id };
        loadedCount++;
        $('bar').style.width = Math.round((loadedCount / FRAMES) * 100) + '%';
        return true;
      } catch (e) { /* try again */ }
    }
    return false;
  }

  function nearestLoaded(i) {
    if (frames[i]) return i;
    let best = -1;
    let bd = 1e9;
    for (let k = 0; k < FRAMES; k++) {
      if (!frames[k]) continue;
      const d = Math.min(Math.abs(k - i), FRAMES - Math.abs(k - i));
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  // Textures of frame i. Uploading decodes the images again, so recent frames stay on the GPU.
  function texFor(i) {
    const k = cache.findIndex((e) => e.i === i);
    let e;
    if (k >= 0) {
      e = cache.splice(k, 1)[0];
    } else {
      e = cache.length >= CACHE ? cache.shift() : { ds: mkTex(gl.LINEAR), id: mkTex(gl.NEAREST) };
      e.i = i;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.bindTexture(gl.TEXTURE_2D, e.ds);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, frames[i].ds);
      gl.bindTexture(gl.TEXTURE_2D, e.id);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, frames[i].id);
    }
    cache.push(e);
    return e;
  }

  function showFrame(i) {
    const k = nearestLoaded(i);
    if (k < 0 || k === shown) return;
    cur = texFor(k);
    shown = k;
    dirty = true;
  }

  let hiId = 0;
  let hiAmt = 0;
  let drawnHi = -1;
  let drawnAmt = -1;

  function draw() {
    if (!glOk || !cur || !canvas.width) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cur.ds);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, cur.id);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texPal);
    gl.uniform2f(U.uStep, 0.25 / canvas.width, 0.25 / canvas.height);
    gl.uniform1f(U.uHiId, hiId);
    gl.uniform1f(U.uHi, hiAmt);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawnHi = hiId;
    drawnAmt = hiAmt;
    dirty = false;
  }

  // A low or narrow viewer gets a shorter hint, and none if even the shortest would cover
  // a fifth of the cat.
  function fitHint(r) {
    const h = $('hint');
    const max = r.height * 0.2;
    h.classList.remove('small', 'xs', 'gone');
    if (r.height < 200 || h.offsetHeight > max) h.classList.add('small');
    if (h.offsetHeight > max) h.classList.add('xs');
    if (h.offsetHeight > max) h.classList.add('gone');
  }

  function resize() {
    fitMsg();
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    fitHint(r);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    let w = Math.round(r.width * dpr);
    let h = Math.round(r.height * dpr);
    const s = Math.min(1, IDW / w, IDH / h);
    w = Math.round(w * s);
    h = Math.round(h * s);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      // a new size empties the canvas: redraw before it is painted
      if (!glOk) return;
      if (cur) draw(); else clearStage();
    }
  }

  // Copy a part of the WebGL picture through readPixels. Chrome may copy a context restored
  // after a GPU crash as transparent pixels, while readPixels still sees the picture.
  let bigCanvas = null;
  function copyPixels(ctx, sx, sy, sw, sh) {
    const x = Math.round(sx);
    const y = Math.round(sy);
    const w = Math.round(sw);
    const h = Math.round(sh);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(x, canvas.height - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (!bigCanvas) bigCanvas = document.createElement('canvas');
    bigCanvas.width = w;
    bigCanvas.height = h;
    const bctx = bigCanvas.getContext('2d');
    const img = bctx.createImageData(w, h);
    const row = w * 4;
    for (let r = 0; r < h; r++) img.data.set(px.subarray((h - 1 - r) * row, (h - r) * row), r * row);
    bctx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, thumbW, thumbH);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bigCanvas, 0, 0, w, h, 0, 0, thumbW, thumbH);
  }

  function renderThumbs() {
    const k = nearestLoaded(0);
    if (!glOk || k < 0 || !canvas.width || gl.isContextLost()) return;
    const keep = shown;
    const keepHi = [hiId, hiAmt];
    hiId = 0;
    hiAmt = 0;
    cur = texFor(k);
    const cw = canvas.width;
    const ch = canvas.height;
    const sw = cw * 0.72;
    const sh = Math.min(ch, sw * (thumbH / thumbW));
    const sx = cw * 0.14;
    const sy = clamp(ch * 0.47 - sh / 2, 0, ch - sh);
    const ctx = thumbCanvas.getContext('2d');
    let viaPixels = false;
    const urls = PRESETS.map((p, n) => {
      buildPalette(colorsOf(p.code));
      draw();
      if (!viaPixels) {
        ctx.clearRect(0, 0, thumbW, thumbH);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, thumbW, thumbH);
        // the canvas is opaque: a transparent copy means the copy did not work
        if (!n && !ctx.getImageData(thumbW >> 1, thumbH >> 1, 1, 1).data[3]) viaPixels = true;
      }
      if (viaPixels) copyPixels(ctx, sx, sy, sw, sh);
      try { return thumbCanvas.toDataURL('image/png'); } catch (e) { return ''; }
    });
    buildPalette(colors);
    [hiId, hiAmt] = keepHi;
    if (keep >= 0) cur = texFor(keep); else shown = k;
    draw();
    // a context lost on the way leaves empty pictures: the restored context draws them again
    if (gl.isContextLost()) return;
    PRESETS.forEach((p, n) => { if (urls[n]) p.img.src = urls[n]; });
    thumbFrame = k;
  }

  // ---------- animation + input ----------
  let angle = 0;
  let spinning = !reduceMotion;
  let vel = 0;
  let dragging = false;
  let raf = 0;
  let lastT = 0;
  let pulseT = -1;
  let pulseId = 0;
  let hoverId = 0;
  const SPIN = 0.024; // degrees per ms
  const frameOf = (a) => ((Math.round(a / (360 / FRAMES)) % FRAMES) + FRAMES) % FRAMES;

  function requestDraw() { if (glOk && !raf) raf = requestAnimationFrame(tick); }

  function tick(t) {
    raf = 0;
    if (!glOk) return;
    const dt = lastT ? Math.min(50, t - lastT) : 16;
    lastT = t;
    let again = false;
    if (spinning && !dragging) { angle += SPIN * dt; again = true; }
    if (!dragging && Math.abs(vel) > 0.004) { angle += vel * dt; vel *= Math.pow(0.996, dt); again = true; } else if (!dragging) { vel = 0; }
    hiId = 0;
    hiAmt = 0;
    if (pulseT >= 0) {
      const p = (t - pulseT) / 950;
      if (p < 1) { hiId = pulseId; hiAmt = Math.sin(p * Math.PI) * 0.85; again = true; } else { pulseT = -1; }
    }
    if (!hiAmt && hoverId) { hiId = hoverId; hiAmt = 0.45; }
    showFrame(frameOf(angle));
    if (hiId !== drawnHi || hiAmt !== drawnAmt) dirty = true;
    if (dirty) draw();
    // nothing to show yet: the first loaded frame restarts the loop
    if (again && shown >= 0) requestDraw(); else lastT = 0;
  }

  function pulse(id) {
    if (reduceMotion) return;
    pulseId = id;
    pulseT = performance.now();
    requestDraw();
  }

  function setSpin(on) {
    spinning = on;
    const b = $('spin');
    b.setAttribute('aria-pressed', String(on));
    b.firstChild.textContent = on ? '❚❚' : '▶';
    requestDraw();
  }

  let hintTimer = 0;
  function stopHint() { $('hint').classList.remove('show'); clearTimeout(hintTimer); }

  const pickCanvas = document.createElement('canvas');
  pickCanvas.width = 1;
  pickCanvas.height = 1;
  const pctx = pickCanvas.getContext('2d', { willReadFrequently: true });

  function pickAt(cx, cy) {
    if (shown < 0 || !frames[shown]) return 0;
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((cx - r.left) / r.width) * IDW);
    const y = Math.floor(((cy - r.top) / r.height) * IDH);
    if (x < 0 || y < 0 || x >= IDW || y >= IDH) return 0;
    try {
      pctx.imageSmoothingEnabled = false;
      pctx.clearRect(0, 0, 1, 1);
      pctx.drawImage(frames[shown].id, x, y, 1, 1, 0, 0, 1, 1);
      const v = pctx.getImageData(0, 0, 1, 1).data[0];
      return v >= 1 && v <= PARTS.length ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  const tip = $('tip');
  let tipTimer = 0;
  function placeTip(text, ev) {
    const r = canvas.getBoundingClientRect();
    tip.textContent = text;
    tip.style.left = (ev.clientX - r.left) + 'px';
    tip.style.top = (ev.clientY - r.top) + 'px';
    tip.hidden = false;
  }
  function flashTip(text, ev) {
    placeTip(text, ev);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tip.hidden = true; }, 1200);
  }

  let pid = null;
  let sx = 0;
  let sy = 0;
  let sAngle = 0;
  let lx = 0;
  let lt = 0;
  let downT = 0;
  let moved = false;
  let hoverRaf = 0;
  let hoverEv = null;

  function bindViewer() {
    // A touch may turn into a page scroll (touch-action: pan-y), so the spin and the hint
    // are stopped only once the gesture is a drag or a tap.
    canvas.addEventListener('pointerdown', (e) => {
      // nothing on the canvas yet: a tap there (a second tap on "Повторить", say) must not stop the spin
      if (e.button !== 0 || !glOk || shown < 0) return;
      pid = e.pointerId;
      try { canvas.setPointerCapture(pid); } catch (err) { /* ignore */ }
      dragging = true;
      moved = false;
      sx = lx = e.clientX;
      sy = e.clientY;
      sAngle = angle;
      lt = downT = e.timeStamp;
      vel = 0;
      // a touch of the cat with frames still missing asks for them again
      if (failed.length) retryLoad(true);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (dragging && e.pointerId === pid) {
        const dx = e.clientX - sx;
        // a finger going more down than sideways scrolls the page, as the browser decides too
        if (!moved && Math.abs(dx) > 6 && (e.pointerType === 'mouse' || Math.abs(dx) > Math.abs(e.clientY - sy))) {
          moved = true;
          canvas.classList.add('dragging');
          tip.hidden = true;
          setSpin(false);
          stopHint();
        }
        if (moved) {
          const k = 360 / (canvas.clientWidth * 1.5);
          angle = sAngle + dx * k;
          const dtm = Math.max(1, e.timeStamp - lt);
          vel = ((e.clientX - lx) * k) / dtm;
          lx = e.clientX;
          lt = e.timeStamp;
          requestDraw();
        }
      } else if (e.pointerType === 'mouse') {
        hoverEv = e;
        if (!hoverRaf) {
          hoverRaf = requestAnimationFrame(() => {
            hoverRaf = 0;
            const id = pickAt(hoverEv.clientX, hoverEv.clientY);
            if (id !== hoverId) { hoverId = id; requestDraw(); }
            if (id) placeTip(PARTS[id - 1].name, hoverEv); else tip.hidden = true;
          });
        }
      }
    });
    const end = (e, cancelled) => {
      if (!dragging || e.pointerId !== pid) return;
      dragging = false;
      canvas.classList.remove('dragging');
      if (!moved) {
        vel = 0;
        if (!cancelled && e.timeStamp - downT < 600) {
          setSpin(false);
          stopHint();
          const id = pickAt(e.clientX, e.clientY);
          if (id) selectPart(PARTS[id - 1].key, true, e);
        }
      } else if (e.timeStamp - lt > 90) {
        vel = 0;
      }
      vel = clamp(vel, -1.2, 1.2);
      requestDraw();
    };
    canvas.addEventListener('pointerup', (e) => end(e, false));
    canvas.addEventListener('pointercancel', (e) => end(e, true));
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && hoverId) { hoverId = 0; tip.hidden = true; requestDraw(); }
    });
    canvas.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setSpin(false);
        angle += (e.key === 'ArrowRight' ? 1 : -1) * (360 / FRAMES);
        requestDraw();
      }
    });
    $('spin').addEventListener('click', () => setSpin(!spinning));
    $('front').addEventListener('click', () => { setSpin(false); vel = 0; angle = Math.round(angle / 360) * 360; requestDraw(); });
    // The system may take the GPU away (a phone in the background); the frames stay in memory.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      glOk = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      cache = [];
      cur = null;
      shown = -1;
      // a drag cut short: no spin from its speed after the restore
      if (dragging && pid !== null) {
        try { canvas.releasePointerCapture(pid); } catch (err) { /* ignore */ }
      }
      dragging = false;
      moved = false;
      vel = 0;
      pid = null;
      canvas.classList.remove('dragging');
      hoverId = 0;
      tip.hidden = true;
      stopHint();
      showMsg('lost', '3D-просмотр отключился. Обновите страницу: выбранные цвета сохранятся.', 'Обновить', () => location.reload());
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try { initGL(); } catch (err) { return; }
      buildPalette(colors);
      hideMsg('lost');
      afterFrame();
      if (!loadedCount && !loading && failed.length) showLoadFail();
    });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize);
    window.addEventListener('online', () => retryLoad());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) retryLoad(true); });
  }

  // A frame arrived or the context came back.
  function afterFrame() {
    if (!glOk || !loadedCount) return;
    if (!started) {
      started = true;
      hideMsg('load');
      $('loader').classList.add('started');
      resize();
      showFrame(frameOf(angle));
      draw();
      renderThumbs();
      $('hint').classList.add('show');
      hintTimer = setTimeout(stopHint, 7000);
    } else if (nearestLoaded(0) !== thumbFrame) {
      // the thumbnails show the front view, or the nearest frame while it is missing
      renderThumbs();
    }
    requestDraw();
  }

  function showLoadFail() {
    showMsg('load', 'Не получилось загрузить котика. Проверьте интернет и попробуйте ещё раз.', 'Повторить', retryLoad);
  }

  // Frames load in up to 4 streams. While nothing is on screen, the front view loads alone
  // to get the whole connection: it is the first picture.
  const queue = [];
  let workers = 0;
  let loadingFront = false;

  function enqueue(list, quiet) {
    list.forEach((i) => { if (!frames[i] && !queue.includes(i)) queue.push(i); });
    const z = queue.indexOf(0);
    if (z > 0) { queue.splice(z, 1); queue.unshift(0); }
    loading = true;
    if (!quiet) $('loader').classList.remove('done');
    pump();
  }

  function pump() {
    const limit = !loadedCount && (queue[0] === 0 || loadingFront) ? 1 : 4;
    while (workers < limit && queue.length) runWorker(queue.shift());
  }

  async function runWorker(i) {
    workers++;
    if (i === 0) loadingFront = true;
    const ok = await loadFrame(i);
    if (i === 0) loadingFront = false;
    workers--;
    if (ok) {
      // a failure here must not stop the queue
      try { afterFrame(); } catch (e) { /* the next frame tries again */ }
    } else {
      failed.push(i);
      // one missing frame is not the connection: wait for a second failure before saying so
      if (!loadedCount && failed.length > 1) showLoadFail();
    }
    if (queue.length) pump();
    else if (!workers) loadEnded();
  }

  // Missing frames are asked for again on a timer (5, 10, 15... up to 30 s apart), when the page
  // comes back to the screen and on a touch of the cat; these tries are quiet. The "Повторить"
  // button and the browser coming back online try at once and show the progress.
  let retryTimer = 0;
  let retryAt = -1e9;

  function loadEnded() {
    loading = false;
    if (!failed.length) { $('loader').classList.add('done'); return; }
    if (!loadedCount) showLoadFail();
    retries++;
    // the line along the top goes away after two tries: it must not hang there for good
    if (loadedCount && retries > 2) $('loader').classList.add('done');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => retryLoad(true), Math.min(30000, 5000 * retries));
  }

  function retryLoad(quiet) {
    quiet = quiet === true;
    if (!failed.length) {
      // a quiet round has taken the frames: the button or the network coming back shows it loading
      if (!quiet && loading) {
        hideMsg('load');
        $('loader').classList.remove('done');
      }
      return;
    }
    if (quiet && (loading || document.hidden || navigator.onLine === false || performance.now() - retryAt < 4000)) return;
    clearTimeout(retryTimer);
    retryAt = performance.now();
    const list = failed;
    failed = [];
    if (!quiet) hideMsg('load');
    // the first two rounds keep the line on screen anyway
    enqueue(list, quiet);
  }

  // ---------- start ----------
  buildPresets();
  buildParts();
  buildSwatches();
  bindUI();
  if (gl) {
    try {
      initGL();
    } catch (e) {
      glOk = false;
    }
  }
  const initial = parseCode(location.hash) || PRESETS[0].code;
  applyCode(initial, { keepHash: true });
  fitPalHead();
  if (window.ResizeObserver) new ResizeObserver(fitPalHead).observe($('palTitle').parentNode);
  else window.addEventListener('resize', fitPalHead);
  const active = PRESETS.find((p) => p.code === initial);
  if (active) {
    const box = $('presets');
    box.scrollLeft += active.btn.getBoundingClientRect().left - box.getBoundingClientRect().left - 16;
  }
  if (glOk) {
    bindViewer();
    setSpin(spinning);
    resize();
    const order = [0, 18, 9, 27];
    for (let i = 3; i < FRAMES; i += 3) if (!order.includes(i)) order.push(i);
    for (let i = 1; i < FRAMES; i++) if (i % 3) order.push(i);
    enqueue(order);
  } else {
    showMsg('nogl', 'Браузер не смог включить 3D-просмотр. Цвета всё равно можно выбрать ниже, а текст для заказа скопируется как обычно.');
    $('loader').classList.add('done');
    window.addEventListener('resize', fitMsg);
    // without 3D the thumbnails are color stripes
    const ctx = thumbCanvas.getContext('2d');
    PRESETS.forEach((p) => {
      const c = colorsOf(p.code);
      ['body', 'headphones', 'bow', 'diamond'].forEach((k, i) => {
        // whole pixel rows: a row shared by two stripes would keep a trace of the previous picture
        const y0 = Math.round((thumbH * i) / 4);
        const y1 = Math.round((thumbH * (i + 1)) / 4);
        ctx.fillStyle = COLORS[c[k]].hex;
        ctx.fillRect(0, y0, thumbW, y1 - y0);
      });
      try { p.img.src = thumbCanvas.toDataURL('image/png'); } catch (e) { /* no thumbnail then */ }
    });
  }
})();
