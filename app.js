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
  function parseCode(s) {
    const c = String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
    return /^[WBPYKO]{8}$/.test(c) ? c : null;
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
    if (gl) { buildPalette(colors); requestDraw(); }
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

  function buildPresets() {
    const box = $('presets');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.setAttribute('aria-pressed', 'false');
      const c = document.createElement('canvas');
      c.width = Math.round(72 * dpr);
      c.height = Math.round(110 * dpr);
      c.setAttribute('aria-hidden', 'true');
      b.appendChild(c);
      const s = document.createElement('span');
      s.textContent = p.name;
      b.appendChild(s);
      b.addEventListener('click', () => { applyCode(p.code); stopHint(); });
      p.btn = b;
      p.canvas = c;
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

  function renderParts() {
    PARTS.forEach((p) => {
      p.chip.setAttribute('aria-selected', String(p.key === sel));
      p.chip.firstChild.style.background = COLORS[colors[p.key]].hex;
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
    const box = $('palette');
    box.textContent = '';
    ORDER.forEach((letter) => {
      const c = COLORS[letter];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(colors[sel] === letter));
      b.appendChild(dot(c.hex, 'ball'));
      const t = document.createElement('span');
      t.className = 'txt';
      t.innerHTML = '<span class="nm"></span><span class="mt"></span>';
      t.firstChild.textContent = c.name;
      t.lastChild.textContent = c.finish;
      b.appendChild(t);
      b.title = `${c.name}: ${c.mat}, ${c.finish}`;
      b.addEventListener('click', () => { setColor(sel, letter); pulse(PARTS.findIndex((p) => p.key === sel) + 1); stopHint(); });
      box.appendChild(b);
    });
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
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* fall back below */ }
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
    $('codeform').addEventListener('submit', (e) => {
      e.preventDefault();
      const c = parseCode($('codein').value);
      if (!c) { toast('Код из 8 букв: W, B, P, Y, K или O'); return; }
      applyCode(c);
      toast('Расцветка по коду ' + c);
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    window.addEventListener('hashchange', () => {
      const c = parseCode(location.hash);
      if (c && c !== codeOf()) applyCode(c, { keepHash: true });
    });
    const groups = {};
    ORDER.forEach((l) => {
      const c = COLORS[l];
      const key = `${c.mat} (${c.finish})`;
      (groups[key] = groups[key] || []).push(c.name.toLowerCase());
    });
    $('materials').textContent = 'Пластик: ' + Object.entries(groups).map(([k, v]) => `${v.join(', ')}: ${k}`).join('; ') + '.';
  }

  // ---------- WebGL viewer ----------
  const canvas = $('cv');
  let gl = null;
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
  let texDS = null;
  let texID = null;
  let texPal = null;
  const palData = new Uint8Array(16 * 2 * 4);

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
    const mk = (filter) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    texDS = mk(gl.LINEAR);
    texID = mk(gl.NEAREST);
    texPal = mk(gl.NEAREST);
    gl.useProgram(prog);
    gl.uniform1i(U.uDS, 0);
    gl.uniform1i(U.uID, 1);
    gl.uniform1i(U.uPal, 2);
    gl.uniform1f(U.uHalf, 0.5 / FH);
    gl.uniform1f(U.uDMax, DMAX);
    gl.uniform1f(U.uSMax, SMAX);
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
  let shown = -1;

  const loadImg = (src) => new Promise((resolve, reject) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('load ' + src));
    im.src = src;
  });

  async function loadFrame(i) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const [ds, id] = await Promise.all([loadImg(`frames/ds${pad(i)}.webp`), loadImg(`frames/id${pad(i)}.png`)]);
        frames[i] = { ds, id };
        loadedCount++;
        $('bar').style.width = Math.round((loadedCount / FRAMES) * 100) + '%';
        return true;
      } catch (e) {
        await sleep(600 * (attempt + 1));
      }
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

  function upload(i) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.bindTexture(gl.TEXTURE_2D, texDS);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, frames[i].ds);
    gl.bindTexture(gl.TEXTURE_2D, texID);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, frames[i].id);
    shown = i;
  }

  function showFrame(i) {
    const k = nearestLoaded(i);
    if (k >= 0 && k !== shown) upload(k);
  }

  let hiId = 0;
  let hiAmt = 0;

  function draw() {
    if (!gl || shown < 0 || !canvas.width) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texDS);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texID);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texPal);
    gl.uniform2f(U.uStep, 0.25 / canvas.width, 0.25 / canvas.height);
    gl.uniform1f(U.uHiId, hiId);
    gl.uniform1f(U.uHi, hiAmt);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    let w = Math.round(r.width * dpr);
    let h = Math.round(r.height * dpr);
    const s = Math.min(1, IDW / w, IDH / h);
    w = Math.round(w * s);
    h = Math.round(h * s);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      requestDraw();
    }
  }

  function renderThumbs() {
    if (!gl || !frames[0] || !canvas.width) return;
    const keepShown = shown;
    const keepHi = [hiId, hiAmt];
    hiId = 0;
    hiAmt = 0;
    upload(0);
    const cw = canvas.width;
    const ch = canvas.height;
    PRESETS.forEach((p) => {
      buildPalette(colorsOf(p.code));
      draw();
      const ctx = p.canvas.getContext('2d');
      const sw = cw * 0.72;
      const sh = Math.min(ch, sw * (p.canvas.height / p.canvas.width));
      const sx = cw * 0.14;
      const sy = clamp(ch * 0.47 - sh / 2, 0, ch - sh);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, p.canvas.width, p.canvas.height);
    });
    buildPalette(colors);
    [hiId, hiAmt] = keepHi;
    if (keepShown >= 0 && keepShown !== 0) upload(keepShown);
    draw();
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

  function requestDraw() { if (gl && !raf) raf = requestAnimationFrame(tick); }

  function tick(t) {
    raf = 0;
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
    draw();
    if (again) requestDraw(); else lastT = 0;
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
    if (shown < 0) return 0;
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
  let sAngle = 0;
  let lx = 0;
  let lt = 0;
  let downT = 0;
  let moved = false;
  let hoverRaf = 0;
  let hoverEv = null;

  function bindViewer() {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      pid = e.pointerId;
      try { canvas.setPointerCapture(pid); } catch (err) { /* ignore */ }
      dragging = true;
      moved = false;
      sx = lx = e.clientX;
      sAngle = angle;
      lt = downT = e.timeStamp;
      vel = 0;
      setSpin(false);
      stopHint();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (dragging && e.pointerId === pid) {
        const dx = e.clientX - sx;
        if (!moved && Math.abs(dx) > 6) { moved = true; canvas.classList.add('dragging'); tip.hidden = true; }
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
      if (!moved && !cancelled && e.timeStamp - downT < 600) {
        vel = 0;
        const id = pickAt(e.clientX, e.clientY);
        if (id) selectPart(PARTS[id - 1].key, true, e);
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
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      $('nogl').hidden = false;
      gl = null;
    });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize);
  }

  async function loadAll() {
    const ok = await loadFrame(0);
    if (!ok) { $('loadtxt').textContent = 'Не удалось загрузить котика, обновите страницу'; return; }
    resize();
    upload(0);
    renderThumbs();
    requestDraw();
    $('hint').classList.add('show');
    hintTimer = setTimeout(stopHint, 7000);
    const first = [18, 9, 27];
    const rest = [];
    for (let i = 3; i < FRAMES; i += 3) if (!first.includes(i)) rest.push(i);
    for (let i = 1; i < FRAMES; i++) if (i % 3) rest.push(i);
    const queue = first.concat(rest);
    const worker = async () => {
      while (queue.length) {
        const i = queue.shift();
        await loadFrame(i);
        requestDraw();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    $('loader').classList.add('done');
  }

  // ---------- start ----------
  buildPresets();
  buildParts();
  bindUI();
  if (gl) {
    try {
      initGL();
    } catch (e) {
      gl = null;
    }
  }
  const initial = parseCode(location.hash) || PRESETS[0].code;
  applyCode(initial, { keepHash: true });
  const active = PRESETS.find((p) => p.code === initial);
  if (active) {
    const box = $('presets');
    box.scrollLeft += active.btn.getBoundingClientRect().left - box.getBoundingClientRect().left - 16;
  }
  if (gl) {
    bindViewer();
    setSpin(spinning);
    loadAll();
  } else {
    $('nogl').hidden = false;
    $('loader').classList.add('done');
    PRESETS.forEach((p) => {
      const ctx = p.canvas.getContext('2d');
      const w = p.canvas.width;
      const h = p.canvas.height;
      ['body', 'headphones', 'bow', 'diamond'].forEach((k, i) => {
        ctx.fillStyle = COLORS[colorsOf(p.code)[k]].hex;
        ctx.fillRect(0, (h / 4) * i, w, h / 4);
      });
    });
  }
})();
