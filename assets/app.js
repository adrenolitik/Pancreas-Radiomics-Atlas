'use strict';

const DATA_URL = 'assets/data/atlas.json';
const LANG_KEY = 'pancreas-atlas-lang';
const LANGS = ['en', 'ru'];

const state = {
  data: null,
  rows: [],
  q: '',
  klass: 'all',
  family: 'all',
  sort: 'dataset',
  selected: null,
  selectedName: null,
  lang: 'en',
  charts: { nc: '#8b95a1', pvp: '#0f6f68', grid: '#e6e4dd', ink: '#5c6672' },
};

const $ = (sel) => document.querySelector(sel);

/* ---------- language ---------- */

function dictionary(lang) {
  const all = window.ATLAS_I18N || {};
  return all[lang] || all.en || {};
}

function interpolate(text, params) {
  if (!params) return text;
  return Object.keys(params).reduce(
    (acc, key) => acc.split(`{${key}}`).join(String(params[key])),
    text
  );
}

/** Look up a key, falling back to English and then to the supplied default. */
function tr(key, fallback, params) {
  const local = dictionary(state.lang)[key];
  const english = dictionary('en')[key];
  const text = local !== undefined ? local : english !== undefined ? english : fallback;
  return interpolate(text === undefined ? key : text, params);
}

const t = (key, params) => tr(key, key, params);

function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch (error) {
    /* private mode - fall through to browser detection */
  }
  const candidates = (navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || 'en']
  ).map((code) => String(code).toLowerCase());
  return candidates.some((code) => code.startsWith('ru') || code.startsWith('be') || code.startsWith('uk'))
    ? 'ru'
    : 'en';
}

function applyStaticText() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

function syncLangButtons() {
  document.querySelectorAll('.lang button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.lang === state.lang));
  });
}

function renderAll() {
  if (!state.data) return;
  renderMeta(state.data);
  renderMorphometry(state.data);
  renderControls(state.data);
  renderTable();
  if (state.selectedName) {
    const index = state.rows.findIndex((entry) => entry.n === state.selectedName);
    if (index >= 0) openDrawer(index);
  }
}

function setLang(lang, { persist = true } = {}) {
  state.lang = LANGS.includes(lang) ? lang : 'en';
  document.documentElement.lang = state.lang;
  document.title = t('meta.title');
  if (persist) {
    try {
      localStorage.setItem(LANG_KEY, state.lang);
    } catch (error) {
      /* ignore unavailable storage */
    }
  }
  applyStaticText();
  syncLangButtons();
  renderAll();
}

/* ---------- formatting ---------- */

function fmt(value, digits) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (Number.isInteger(value) && abs < 1e9) return value.toLocaleString('en-US');
  if (abs >= 1000) return value.toFixed(digits ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (abs >= 10) return value.toFixed(digits ?? 1);
  if (abs >= 0.1) return value.toFixed(Math.max(digits ?? 2, 2));
  if (abs >= 0.001) return value.toFixed(3);
  return value.toExponential(2);
}

function pctDelta(entry) {
  if (entry.nc.median === 0) return null;
  return ((entry.pv.median - entry.nc.median) / Math.abs(entry.nc.median)) * 100;
}

/* ---------- static blocks ---------- */

function renderMeta(data) {
  const { meta, cohort } = data;
  $('#stat-patients').textContent = fmt(cohort.patients);
  $('#stat-nc').textContent = fmt(meta.phases.nc.n);
  $('#stat-pvp').textContent = fmt(meta.phases.pvp.n);
  $('#stat-features').textContent = fmt(meta.feature_count);
  $('#note-features').textContent = t('stat.featuresNote', { n: meta.class_count });
  const generated = $('#generated');
  if (generated) generated.textContent = meta.generated;

  const femalePct = ((cohort.female / cohort.patients) * 100).toFixed(1);
  const malePct = ((cohort.male / cohort.patients) * 100).toFixed(1);
  const rows = [
    [t('cohort.patients'), fmt(cohort.patients)],
    [t('cohort.women'), `${fmt(cohort.female)} (${femalePct}%)`],
    [t('cohort.men'), `${fmt(cohort.male)} (${malePct}%)`],
    [
      t('cohort.age'),
      t('cohort.ageValue', {
        min: cohort.age_min,
        max: cohort.age_max,
        mean: cohort.age_mean,
        sd: cohort.age_sd,
      }),
    ],
    [t('cohort.ncStudies'), fmt(meta.phases.nc.n)],
    [t('cohort.pvpStudies'), fmt(meta.phases.pvp.n)],
    [t('cohort.bothStudies'), fmt(cohort.both_phases)],
    [t('cohort.features'), fmt(meta.feature_count)],
  ];
  $('#cohort-body').innerHTML = rows
    .map(([key, value]) => `<tr><th scope="row">${key}</th><td>${value}</td></tr>`)
    .join('');

  const both = $('#cohort-both');
  if (both) both.textContent = fmt(cohort.both_phases);

  const maxCount = Math.max(...meta.classes.map((c) => c.count));
  $('#class-list').innerHTML = meta.classes
    .map(
      (c) => `<div class="class-row">
        <span class="label">${tr('class.' + c.id, c.label)}</span>
        <span class="track"><span class="fill" style="width:${(c.count / maxCount) * 100}%"></span></span>
        <span class="count">${c.count}</span>
      </div>`
    )
    .join('');
}

function renderMorphometry(data) {
  const morph = data.morphometry.slice().sort((a, b) => (b.nc.median ?? 0) - (a.nc.median ?? 0));
  const scale = Math.max(...morph.flatMap((m) => [m.pv.median ?? 0, m.nc.median ?? 0]));
  $('#morph-body').innerHTML = morph
    .map((m) => {
      const delta = pctDelta(m);
      const unit = m.u ? `<span class="unit">${m.u}</span>` : '';
      const deltaClass = delta === null ? '' : delta > 0 ? ' up' : ' down';
      const deltaText = delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
      const wNc = ((m.nc.median ?? 0) / scale) * 100;
      const wPv = ((m.pv.median ?? 0) / scale) * 100;
      return `<tr>
        <td>${tr('shape.' + m.l, m.l)}${unit}</td>
        <td class="num">${fmt(m.nc.median)} <span class="iqr">[${fmt(m.nc.p25)}–${fmt(m.nc.p75)}]</span></td>
        <td class="num">${fmt(m.pv.median)} <span class="iqr">[${fmt(m.pv.p25)}–${fmt(m.pv.p75)}]</span></td>
        <td class="num delta${deltaClass}">${deltaText}</td>
        <td class="bar-col">
          <span class="dumbbell" aria-hidden="true">
            <i style="left:0;width:${wNc}%;background:${state.charts.nc}"></i>
            <i style="left:0;width:${wPv}%;background:${state.charts.pvp};opacity:.75;top:4px;height:4px"></i>
          </span>
        </td>
      </tr>`;
    })
    .join('');
}

/* ---------- explorer ---------- */

function renderControls(data) {
  $('#family').innerHTML = [`<option value="all">${t('explorer.familyAll')}</option>`]
    .concat(
      data.meta.families.map(
        (f) => `<option value="${f.id}">${tr('family.' + f.id, f.label)} (${f.count})</option>`
      )
    )
    .join('');
  $('#family').value = state.family;

  $('#class-chips').innerHTML = [
    `<button class="chip" type="button" data-class="all" aria-pressed="${state.klass === 'all'}">${t('explorer.all')} <span class="n">${data.meta.feature_count}</span></button>`,
  ]
    .concat(
      data.meta.classes.map(
        (c) => `<button class="chip" type="button" data-class="${c.id}" aria-pressed="${state.klass === c.id}">${tr('class.' + c.id, c.label)} <span class="n">${c.count}</span></button>`
      )
    )
    .join('');
}

function bindControls() {
  $('#class-chips').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    state.klass = chip.dataset.class;
    document.querySelectorAll('#class-chips .chip').forEach((el) => {
      el.setAttribute('aria-pressed', String(el === chip));
    });
    renderTable();
  });

  $('#q').addEventListener('input', (event) => {
    state.q = event.target.value.trim().toLowerCase();
    renderTable();
  });

  $('#family').addEventListener('change', (event) => {
    state.family = event.target.value;
    renderTable();
  });

  $('#sort').addEventListener('change', (event) => {
    state.sort = event.target.value;
    renderTable();
  });

  $('#feature-body').addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-index]');
    if (row) openDrawer(Number(row.dataset.index));
  });

  $('#feature-body').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('tr[data-index]');
    if (!row) return;
    event.preventDefault();
    openDrawer(Number(row.dataset.index));
  });

  $('#drawer-close').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDrawer();
  });

  document.querySelectorAll('.lang button').forEach((button) => {
    button.addEventListener('click', () => setLang(button.dataset.lang));
  });
}

function matches(entry) {
  if (state.klass !== 'all' && entry.c !== state.klass) return false;
  if (state.family !== 'all' && entry.f !== state.family) return false;
  if (!state.q) return true;
  const haystack = `${entry.n} ${entry.l} ${entry.cl} ${entry.fl}`.toLowerCase();
  return haystack.includes(state.q);
}

function sortRows(rows) {
  const copy = rows.slice();
  if (state.sort === 'effect') {
    copy.sort((a, b) => Math.abs(b.d ?? 0) - Math.abs(a.d ?? 0));
  } else if (state.sort === 'median') {
    copy.sort((a, b) => (b.pv.median ?? 0) - (a.pv.median ?? 0));
  } else if (state.sort === 'name') {
    copy.sort((a, b) => a.n.localeCompare(b.n));
  } else {
    const order = new Map(state.data.features.map((entry, index) => [entry.n, index]));
    copy.sort((a, b) => (order.get(a.n) ?? 0) - (order.get(b.n) ?? 0));
  }
  return copy;
}

function renderTable() {
  const rows = sortRows(state.data.features.filter(matches));
  state.rows = rows;
  const count = $('#result-count');
  if (count) count.textContent = fmt(rows.length);
  $('#empty').hidden = rows.length > 0;

  const showIqr = window.innerWidth > 720;
  $('#feature-body').innerHTML = rows
    .map((entry, index) => {
      const delta = pctDelta(entry);
      const deltaClass = delta === null ? '' : delta > 0 ? ' up' : ' down';
      const deltaText = delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
      const iqrNc = showIqr ? `<span class="iqr">(${fmt(entry.nc.p25)}–${fmt(entry.nc.p75)})</span>` : '';
      const iqrPv = showIqr ? `<span class="iqr">(${fmt(entry.pv.p25)}–${fmt(entry.pv.p75)})</span>` : '';
      const family = entry.f === 'original' ? '' : `<span class="fam">${entry.f}_</span>`;
      const cls = entry.n.slice(entry.f.length + 1).split('_')[0];
      return `<tr data-index="${index}" tabindex="0" aria-label="${entry.n} ${t('table.details')}">
        <td>
          <span class="f-name">${family}${cls}_${entry.n.split('_').slice(2).join('_')}</span>
          <span class="f-pretty">${entry.l}${entry.u ? ` · ${entry.u}` : ''}</span>
        </td>
        <td><span class="pill">${tr('class.' + entry.c, entry.cl)}</span></td>
        <td class="num">${fmt(entry.nc.median)} ${iqrNc}</td>
        <td class="num">${fmt(entry.pv.median)} ${iqrPv}</td>
        <td class="num delta${deltaClass}">${deltaText}</td>
        <td class="num">${entry.d === null ? '—' : entry.d.toFixed(2)}</td>
      </tr>`;
    })
    .join('');
}

/* ---------- drawer ---------- */

function openDrawer(index) {
  const entry = state.rows[index];
  if (!entry) return;
  state.selected = index;
  state.selectedName = entry.n;

  $('#drawer-title').textContent = entry.n;
  $('#drawer-eyebrow').textContent = `${tr('class.' + entry.c, entry.cl)} · ${tr('family.' + entry.f, entry.fl)}`;
  $('#drawer-badges').innerHTML = `
    <span class="badge">${tr('class.' + entry.c, entry.cl)}</span>
    <span class="badge">${tr('family.' + entry.f, entry.fl)}</span>
    ${entry.u ? `<span class="badge alt">${entry.u}</span>` : ''}
    <span class="badge">NC n=${entry.nc.n} · PVP n=${entry.pv.n}</span>`;

  const delta = pctDelta(entry);
  const rows = [
    [t('stats.n'), fmt(entry.nc.n), fmt(entry.pv.n)],
    [t('stats.meanSd'), `${fmt(entry.nc.mean)} ± ${fmt(entry.nc.sd)}`, `${fmt(entry.pv.mean)} ± ${fmt(entry.pv.sd)}`],
    [t('stats.median'), fmt(entry.nc.median), fmt(entry.pv.median)],
    [t('stats.iqr'), `${fmt(entry.nc.p25)} – ${fmt(entry.nc.p75)}`, `${fmt(entry.pv.p25)} – ${fmt(entry.pv.p75)}`],
    [t('stats.p5p95'), `${fmt(entry.nc.p5)} – ${fmt(entry.nc.p95)}`, `${fmt(entry.pv.p5)} – ${fmt(entry.pv.p95)}`],
    [t('stats.range'), `${fmt(entry.nc.min)} – ${fmt(entry.nc.max)}`, `${fmt(entry.pv.min)} – ${fmt(entry.pv.max)}`],
  ];
  $('#quantile-body').innerHTML = rows
    .map(([key, nc, pv]) => `<tr><th scope="row">${key}</th><td class="num">${nc}</td><td class="num">${pv}</td></tr>`)
    .join('');

  const notes = [];
  if (entry.u) notes.push(t('notes.unit', { unit: entry.u }));
  if (delta !== null) {
    notes.push(t('notes.delta', { pct: `${delta > 0 ? '+' : ''}${delta.toFixed(1)}` }));
  }
  if (entry.d !== null) notes.push(t('notes.d', { d: entry.d.toFixed(2) }));
  notes.push(t('notes.disclaimer'));
  $('#drawer-note').textContent = notes.join(' ');

  $('#drawer').hidden = false;
  drawHistogram(entry);
}

function closeDrawer() {
  if ($('#drawer').hidden) return;
  $('#drawer').hidden = true;
  state.selected = null;
  state.selectedName = null;
}

function drawHistogram(entry) {
  const canvas = $('#hist');
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 400;
  const height = 260;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const pad = { top: 14, right: 8, bottom: 30, left: 8 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const nc = entry.h.nc;
  const pv = entry.h.pv;
  const maxShare = Math.max(...nc, ...pv) || 1;
  const bin = plotW / nc.length;

  ctx.strokeStyle = state.charts.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, Math.round(y) + 0.5);
    ctx.lineTo(pad.left + plotW, Math.round(y) + 0.5);
    ctx.stroke();
  }

  nc.forEach((share, i) => {
    const x = pad.left + i * bin;
    const hNc = (share / maxShare) * plotH;
    const hPv = (pv[i] / maxShare) * plotH;
    ctx.fillStyle = state.charts.nc;
    ctx.fillRect(x + bin * 0.08, pad.top + plotH - hNc, bin * 0.4, hNc);
    ctx.fillStyle = state.charts.pvp;
    ctx.fillRect(x + bin * 0.52, pad.top + plotH - hPv, bin * 0.4, hPv);
  });

  ctx.strokeStyle = '#cfccc2';
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + plotH + 0.5);
  ctx.lineTo(pad.left + plotW, pad.top + plotH + 0.5);
  ctx.stroke();

  ctx.fillStyle = state.charts.ink;
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'top';
  const ticks = [0, nc.length / 2, nc.length];
  ticks.forEach((tick, index) => {
    const value = entry.h.lo + ((entry.h.hi - entry.h.lo) * tick) / nc.length;
    ctx.textAlign = index === 0 ? 'left' : index === ticks.length - 1 ? 'right' : 'center';
    ctx.fillText(fmt(value), pad.left + (plotW * tick) / nc.length, pad.top + plotH + 8);
  });

  ctx.textAlign = 'right';
  ctx.fillStyle = '#8b95a1';
  ctx.fillText(t('chart.axis'), pad.left + plotW, pad.top - 2);
}

/* ---------- boot ---------- */

async function boot() {
  state.lang = detectLang();
  document.documentElement.lang = state.lang;
  document.title = t('meta.title');
  applyStaticText();
  syncLangButtons();
  bindControls();

  try {
    const response = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
  } catch (error) {
    const empty = $('#empty');
    empty.hidden = false;
    empty.textContent =
      'The atlas data (assets/data/atlas.json) could not be loaded. Serve this folder over HTTP — for example python3 -m http.server 8000 — rather than opening the file directly.';
    const count = $('#result-count');
    if (count) count.textContent = '0';
    console.error('Atlas data failed to load', error);
    return;
  }

  renderAll();

  window.addEventListener('resize', () => {
    if (state.selected !== null && state.rows[state.selected]) drawHistogram(state.rows[state.selected]);
  });
}

boot();
