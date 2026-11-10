/*
 * Component builder: draw your own symbol, place pins, save it to your library.
 * Copyright (C) 2026 Loomwright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function () {
  'use strict';
  const L = window.Loom;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = L.esc;
  const root = $('#builder');
  const S5 = (v) => Math.round(v / 5) * 5;
  const S10 = (v) => Math.round(v / 10) * 10;
  const TOOLS = [
    ['select', 'Select and move', 'V'], ['line', 'Line', 'L'], ['rect', 'Rectangle', 'B'], ['circle', 'Circle', 'C'], ['text', 'Text', 'T'], ['pin', 'Pin (connection point)', 'P'],
  ];

  let comp, tool = 'select', selected = null, drag = null, temp = null, editingId = null, history = [];

  function blank() {
    return { id: L.uid('c_'), name: 'New component', prefix: 'U', sub: '', props: [], w: 80, h: 60, pins: [], shapes: [{ t: 'rect', x: 10, y: 0, width: 60, h: 60, rx: 4 }] };
  }
  function fromDef(def) {
    const c = JSON.parse(JSON.stringify(def));
    if (c.gen) delete c.gen;
    return c;
  }
  function fromLibrary(type) {
    const d = L.LIBRARY[type];
    const r = L.resolved({ customParts: [] }, { type, props: {} });
    return { id: L.uid('c_'), name: d.name + ' (custom)', prefix: d.prefix || 'U', sub: d.sub || '', props: JSON.parse(JSON.stringify(d.props || [])).map(({ k, l, d: dd }) => ({ k, l, d: dd })), w: r.w, h: r.h, pins: JSON.parse(JSON.stringify(r.pins)), shapes: JSON.parse(JSON.stringify(r.shapes)) };
  }
  const defaults = () => { const o = {}; (comp.props || []).forEach((p) => { o[p.k] = p.d; }); return o; };
  function remember() { history.push(JSON.stringify(comp)); if (history.length > 100) history.shift(); }

  function open(def) {
    editingId = def && def.custom ? def.id : null;
    comp = def ? (def.custom ? fromDef(def) : fromLibrary(def.id)) : blank();
    tool = 'select'; selected = null; history = [];
    root.innerHTML = shell();
    root.hidden = false;
    wire();
    renderAll();
  }
  function close() { root.hidden = true; root.innerHTML = ''; }

  function shell() {
    const libOpts = Object.values(L.LIBRARY).map((d) => `<option value="${d.id}">${esc(d.cat)}: ${esc(d.name)}</option>`).join('');
    return `
    <div class="b-head">
      <h2>Component builder</h2>
      <button class="btn" id="b-undo">Undo</button>
      ${editingId ? '<button class="btn danger" id="b-delete">Delete from library</button>' : ''}
      <button class="btn" id="b-cancel">Cancel</button>
      <button class="btn" id="b-save">Save to my components</button>
      <button class="btn primary" id="b-place">Save and place</button>
    </div>
    <div class="b-main">
      <div class="panel b-tools">
        ${TOOLS.map(([id, name, key]) => `<button class="btn" data-tool="${id}" title="${name} (${key})">${name}</button>`).join('')}
        <hr style="border:0;border-top:1px solid var(--line);width:100%">
        <label class="fld"><span>Start from a library symbol</span><select id="b-from"><option value="">Choose…</option>${libOpts}</select></label>
        <button class="btn danger" id="b-clear">Clear drawing</button>
        <p class="muted" style="font-size:11.5px;margin:4px 0 0">Pins snap to a 10-unit grid so wires line up. Shapes snap to 5. Text can show a field, for example {rating}.</p>
      </div>
      <div class="b-stage"><svg id="b-svg"></svg></div>
      <div class="panel b-side" id="b-side"></div>
    </div>`;
  }

  function wire() {
    $('#b-cancel').onclick = close;
    $('#b-undo').onclick = () => { if (history.length) { comp = JSON.parse(history.pop()); selected = null; renderAll(); } };
    $('#b-save').onclick = () => save(false);
    $('#b-place').onclick = () => save(true);
    if ($('#b-delete')) $('#b-delete').onclick = async (e) => {
      const b = e.currentTarget;
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Click again to delete'; b.classList.add('armed'); return; }
      await window.LoomEditor.deleteComponent(editingId); window.LoomEditor.toast('Component deleted'); close();
    };
    $('#b-from').onchange = (e) => { if (!e.target.value) return; remember(); const keepId = comp.id; comp = fromLibrary(e.target.value); comp.id = keepId; selected = null; e.target.value = ''; renderAll(); };
    $('#b-clear').onclick = () => { remember(); comp.shapes = []; comp.pins = []; selected = null; renderAll(); };
    root.querySelectorAll('[data-tool]').forEach((b) => { b.onclick = () => { tool = b.dataset.tool; renderAll(); }; });
    const svg = $('#b-svg');
    svg.addEventListener('pointerdown', down);
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
    root.addEventListener('keydown', key);
    $('#b-side').addEventListener('input', sideInput);
    $('#b-side').addEventListener('change', () => renderSide());
    $('#b-side').addEventListener('click', sideClick);
  }

  function key(e) {
    const tag = e.target.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); removeSelected(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $('#b-undo').click(); return; }
    if (e.key === 'Escape') { tool = 'select'; temp = null; renderAll(); return; }
    const t = TOOLS.find((x) => x[2].toLowerCase() === e.key.toLowerCase());
    if (t && !e.ctrlKey && !e.metaKey) { tool = t[0]; renderAll(); }
  }

  /* ----- geometry ----- */
  function pt(e) {
    const svg = $('#b-svg'), m = svg.getScreenCTM().inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  }
  function moveShape(s, dx, dy) {
    if (s.t === 'line') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
    else if (s.t === 'rect' || s.t === 'text') { s.x += dx; s.y += dy; }
    else if (s.t === 'circle') { s.cx += dx; s.cy += dy; }
    else { s.tx = (s.tx || 0) + dx; s.ty = (s.ty || 0) + dy; }
  }

  function down(e) {
    const svg = $('#b-svg'); svg.setPointerCapture(e.pointerId); root.focus();
    const p = pt(e), x5 = S5(p.x), y5 = S5(p.y);
    if (tool === 'select') {
      const pinEl = e.target.closest('[data-bpin]'), shEl = e.target.closest('[data-bs]');
      if (pinEl) { selected = { kind: 'pin', i: +pinEl.dataset.bpin }; remember(); drag = { kind: 'pin', start: p, orig: { ...comp.pins[selected.i] }, moved: false }; }
      else if (shEl) { selected = { kind: 'shape', i: +shEl.dataset.bs }; remember(); drag = { kind: 'shape', start: p, orig: JSON.parse(JSON.stringify(comp.shapes[selected.i])), moved: false }; }
      else selected = null;
      renderAll(); return;
    }
    if (tool === 'pin') {
      remember();
      const x = Math.max(0, Math.min(comp.w, S10(p.x))), y = Math.max(0, Math.min(comp.h, S10(p.y)));
      let n = comp.pins.length + 1; while (comp.pins.some((q) => q.id === String(n))) n++;
      comp.pins.push({ id: String(n), x, y, n: String(n) });
      selected = { kind: 'pin', i: comp.pins.length - 1 };
      renderAll(); return;
    }
    if (tool === 'text') {
      remember();
      comp.shapes.push({ t: 'text', x: x5, y: y5, text: 'TEXT', size: 9, anchor: 'middle' });
      selected = { kind: 'shape', i: comp.shapes.length - 1 }; tool = 'select';
      renderAll();
      const f = $('#bs-text'); if (f) { f.focus(); f.select(); }
      return;
    }
    temp = { tool, a: { x: x5, y: y5 }, b: { x: x5, y: y5 } };
  }
  function move(e) {
    const p = pt(e);
    if (drag) {
      const dx = S5(p.x - drag.start.x), dy = S5(p.y - drag.start.y);
      if (drag.kind === 'pin') {
        const pn = comp.pins[selected.i];
        pn.x = Math.max(0, Math.min(comp.w, S10(drag.orig.x + (p.x - drag.start.x))));
        pn.y = Math.max(0, Math.min(comp.h, S10(drag.orig.y + (p.y - drag.start.y))));
      } else {
        const s = JSON.parse(JSON.stringify(drag.orig)); moveShape(s, dx, dy); comp.shapes[selected.i] = s;
      }
      drag.moved = true; renderCanvas(); return;
    }
    if (temp) { temp.b = { x: S5(p.x), y: S5(p.y) }; renderCanvas(); }
  }
  function up() {
    if (drag) { if (!drag.moved) history.pop(); drag = null; renderSide(); return; }
    if (!temp) return;
    const { a, b } = temp; temp = null;
    let s = null;
    if (tool === 'line' && (a.x !== b.x || a.y !== b.y)) s = { t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    if (tool === 'rect' && a.x !== b.x && a.y !== b.y) s = { t: 'rect', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y), rx: 0 };
    if (tool === 'circle') { const r = Math.round(Math.hypot(b.x - a.x, b.y - a.y)); if (r > 0) s = { t: 'circle', cx: a.x, cy: a.y, r }; }
    if (s) { remember(); comp.shapes.push(s); selected = { kind: 'shape', i: comp.shapes.length - 1 }; }
    renderAll();
  }
  function tempShape() {
    if (!temp) return null;
    const { a, b } = temp;
    if (temp.tool === 'line') return { t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    if (temp.tool === 'rect') return { t: 'rect', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y), fill: 'none' };
    if (temp.tool === 'circle') return { t: 'circle', cx: a.x, cy: a.y, r: Math.hypot(b.x - a.x, b.y - a.y), fill: 'none' };
    return null;
  }

  /* ----- rendering ----- */
  function renderAll() {
    root.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
    renderCanvas(); renderSide();
  }
  function renderCanvas() {
    const svg = $('#b-svg'), m = 40, props = defaults();
    svg.setAttribute('viewBox', `${-m} ${-m} ${comp.w + m * 2} ${comp.h + m * 2}`);
    svg.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    let s = `<defs><pattern id="bg5" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#f1f3f1" stroke-width=".4"/></pattern><pattern id="bg10" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="url(#bg5)"/><path d="M10 0H0V10" fill="none" stroke="#dfe4e0" stroke-width=".5"/></pattern></defs>`;
    s += `<rect x="${-m}" y="${-m}" width="${comp.w + m * 2}" height="${comp.h + m * 2}" fill="url(#bg10)"/>`;
    s += `<rect x="0" y="0" width="${comp.w}" height="${comp.h}" fill="none" stroke="#9fb3a8" stroke-width=".6" stroke-dasharray="3 2"/>`;
    s += `<text x="${comp.w / 2}" y="-8" font-size="4" text-anchor="middle" fill="#7d8b83" font-family="IBM Plex Mono, monospace">${comp.w} × ${comp.h}</text>`;
    comp.shapes.forEach((sh, i) => {
      const on = selected && selected.kind === 'shape' && selected.i === i;
      s += `<g data-bs="${i}" style="cursor:${tool === 'select' ? 'move' : 'inherit'}">${L.shapeSVG(sh, props)}${hitFor(sh)}</g>`;
      if (on) s += outlineFor(sh);
    });
    const ts = tempShape(); if (ts) s += `<g opacity=".6">${L.shapeSVG(ts, props)}</g>`;
    comp.pins.forEach((pn, i) => {
      const on = selected && selected.kind === 'pin' && selected.i === i;
      s += `<g data-bpin="${i}" style="cursor:${tool === 'select' ? 'move' : 'inherit'}"><circle cx="${pn.x}" cy="${pn.y}" r="5" fill="${on ? '#2f7dff' : '#e07b00'}" fill-opacity=".25" stroke="${on ? '#2f7dff' : '#e07b00'}" stroke-width="1.2"/><circle cx="${pn.x}" cy="${pn.y}" r="2.4" fill="#fff" stroke="#1d2320" stroke-width="1"/><text x="${pn.x}" y="${pn.y - 7}" font-size="6" text-anchor="middle" fill="#b85f00" font-family="IBM Plex Mono, monospace">${esc(pn.id)}</text></g>`;
    });
    svg.innerHTML = s;
  }
  function hitFor(sh) {
    if (sh.t === 'line') return `<line x1="${sh.x1}" y1="${sh.y1}" x2="${sh.x2}" y2="${sh.y2}" stroke="transparent" stroke-width="8"/>`;
    if (sh.t === 'text') return `<rect x="${sh.x - 20 + (sh.tx || 0)}" y="${sh.y - (sh.size || 9) + (sh.ty || 0)}" width="40" height="${(sh.size || 9) + 3}" fill="transparent"/>`;
    return '';
  }
  function outlineFor(sh) {
    const st = 'fill="none" stroke="#2f7dff" stroke-width=".8" stroke-dasharray="2 2" pointer-events="none"';
    if (sh.t === 'line') return `<rect x="${Math.min(sh.x1, sh.x2) - 3}" y="${Math.min(sh.y1, sh.y2) - 3}" width="${Math.abs(sh.x1 - sh.x2) + 6}" height="${Math.abs(sh.y1 - sh.y2) + 6}" ${st}/>`;
    if (sh.t === 'rect') return `<rect x="${sh.x - 3}" y="${sh.y - 3}" width="${sh.width + 6}" height="${sh.h + 6}" ${st}/>`;
    if (sh.t === 'circle') return `<circle cx="${sh.cx}" cy="${sh.cy}" r="${sh.r + 3}" ${st}/>`;
    if (sh.t === 'text') return `<rect x="${sh.x - 22}" y="${sh.y - (sh.size || 9) - 2}" width="44" height="${(sh.size || 9) + 6}" ${st}/>`;
    return `<rect x="${(sh.tx || 0) - 2}" y="${(sh.ty || 0) - 2}" width="6" height="6" fill="#2f7dff" pointer-events="none"/>`;
  }

  const num = (label, key, v, step = 5) => `<label class="fld"><span>${label}</span><input type="number" step="${step}" data-s="${key}" value="${esc(v)}"></label>`;
  function renderSide() {
    const side = $('#b-side');
    const active = document.activeElement && side.contains(document.activeElement) ? document.activeElement.id : null;
    let h = `<div class="fields"><h3>Component</h3>
      <label class="fld"><span>Name</span><input id="bc-name" data-c="name" value="${esc(comp.name)}"></label>
      <div class="two"><label class="fld"><span>Reference prefix</span><input id="bc-prefix" data-c="prefix" value="${esc(comp.prefix || '')}" placeholder="e.g. K, S, U"></label><label class="fld"><span>Text under symbol</span><input id="bc-sub" data-c="sub" value="${esc(comp.sub || '')}" placeholder="{rating}"></label></div>
      <div class="two"><label class="fld"><span>Width</span><input id="bc-w" type="number" min="20" step="20" data-c="w" value="${comp.w}"></label><label class="fld"><span>Height</span><input id="bc-h" type="number" min="20" step="20" data-c="h" value="${comp.h}"></label></div>
      <label class="fld"><span>Fields, one per line as <code>key = default</code></span><textarea id="bc-props" data-c="props" placeholder="rating = 15A">${esc((comp.props || []).map((p) => `${p.k} = ${p.d == null ? '' : p.d}`).join('\n'))}</textarea></label>
    </div>`;
    if (selected && selected.kind === 'shape' && comp.shapes[selected.i]) {
      const s = comp.shapes[selected.i];
      h += `<div class="fields"><h3>Selected ${s.t}</h3>`;
      if (s.t === 'line') h += `<div class="two">${num('x1', 'x1', s.x1)}${num('y1', 'y1', s.y1)}${num('x2', 'x2', s.x2)}${num('y2', 'y2', s.y2)}</div>`;
      if (s.t === 'rect') h += `<div class="two">${num('x', 'x', s.x)}${num('y', 'y', s.y)}${num('Width', 'width', s.width)}${num('Height', 'h', s.h)}${num('Corner radius', 'rx', s.rx || 0, 1)}</div>`;
      if (s.t === 'circle') h += `<div class="two">${num('Centre x', 'cx', s.cx)}${num('Centre y', 'cy', s.cy)}${num('Radius', 'r', s.r, 1)}</div>`;
      if (s.t === 'text') h += `<label class="fld"><span>Text</span><input id="bs-text" data-s="text" value="${esc(s.text)}"></label><div class="two">${num('x', 'x', s.x)}${num('y', 'y', s.y)}${num('Size', 'size', s.size || 9, 1)}<label class="fld"><span>Align</span><select data-s="anchor">${['start', 'middle', 'end'].map((a) => `<option${(s.anchor || 'middle') === a ? ' selected' : ''}>${a}</option>`).join('')}</select></label></div>`;
      if (s.t === 'path') h += `<label class="fld"><span>Path data</span><input data-s="d" value="${esc(s.d)}" style="font-family:var(--f-mono)"></label>`;
      if (s.t !== 'text') {
        const swKey = s.t === 'rect' ? 'sw' : 'w';
        const swVal = s[swKey] != null ? s[swKey] : 2;
        h += `<div class="two">${num('Line width', swKey, swVal, 0.5)}`;
        if (s.t !== 'line') h += `<label class="fld"><span>Fill</span><select data-s="fill">${[['paper', 'White'], ['none', 'None'], ['ink', 'Black']].map(([v, n]) => `<option value="${v}"${(s.fill || (s.t === 'path' ? 'none' : 'paper')) === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`;
        h += `</div><label class="fld check"><input type="checkbox" data-s="dash"${s.dash ? ' checked' : ''}><span>Dashed</span></label>`;
      }
      h += `<div class="row-btns"><button class="btn danger" data-b="del">Delete shape</button><button class="btn" data-b="dup">Duplicate</button></div></div>`;
    }
    if (selected && selected.kind === 'pin' && comp.pins[selected.i]) {
      const pn = comp.pins[selected.i];
      h += `<div class="fields"><h3>Selected pin</h3><div class="two"><label class="fld"><span>Pin number / id</span><input id="bp-id" data-p="id" value="${esc(pn.id)}"></label><label class="fld"><span>Description</span><input id="bp-n" data-p="n" value="${esc(pn.n || '')}" placeholder="e.g. Ignition +"></label></div>
        <div class="two"><label class="fld"><span>x</span><input type="number" step="10" data-p="x" value="${pn.x}"></label><label class="fld"><span>y</span><input type="number" step="10" data-p="y" value="${pn.y}"></label></div>
        <div class="row-btns"><button class="btn danger" data-b="del">Delete pin</button></div></div>`;
    }
    const dupIds = comp.pins.map((p) => p.id).filter((id, i, a) => a.indexOf(id) !== i);
    h += `<div class="fields"><h3>Pins (${comp.pins.length})</h3>${dupIds.length ? `<div class="callout warn">Pin ids must be unique: ${esc(dupIds.join(', '))}</div>` : ''}${comp.pins.length ? `<div class="b-list">${comp.pins.map((p, i) => `<button data-pick="pin:${i}" class="${selected && selected.kind === 'pin' && selected.i === i ? 'on' : ''}">${esc(p.id)} · ${esc(p.n || '')} (${p.x}, ${p.y})</button>`).join('')}</div>` : '<p class="muted" style="margin:0;font-size:12px">Use the Pin tool and click on the edge of the symbol where wires should attach.</p>'}</div>`;
    h += `<div class="fields"><h3>Shapes (${comp.shapes.length})</h3><div class="b-list">${comp.shapes.map((s, i) => `<button data-pick="shape:${i}" class="${selected && selected.kind === 'shape' && selected.i === i ? 'on' : ''}">${s.t}${s.t === 'text' ? ' “' + esc(s.text) + '”' : ''}</button>`).join('')}</div></div>`;
    h += `<div class="fields"><h3>Preview</h3><div style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px">${previewSVG()}</div></div>`;
    side.innerHTML = h;
    if (active && document.getElementById(active)) { const el = document.getElementById(active); el.focus(); if (el.setSelectionRange && el.type === 'text') { const n = el.value.length; el.setSelectionRange(n, n); } }
  }
  function previewSVG() {
    const tmp = toDef();
    const doc = { customParts: [tmp], parts: [], wires: [] };
    const p = { id: 'x', type: tmp.id, x: 0, y: 0, rot: 0, label: (tmp.prefix || '') + '1', props: {} };
    doc.parts.push(p);
    const b = L.bounds(doc);
    return `<svg viewBox="${b.x - 10} ${b.y - 10} ${b.w + 20} ${b.h + 20}" style="width:100%;max-height:160px">${L.renderDiagram(doc)}</svg>`;
  }

  function sideInput(e) {
    const t = e.target;
    if (t.dataset.c) {
      const k = t.dataset.c;
      if (k === 'w' || k === 'h') { const v = Math.max(20, Math.round((parseInt(t.value, 10) || 20) / 20) * 20); if (t.value !== '' && e.type === 'input') comp[k] = v; }
      else if (k === 'props') comp.props = t.value.split('\n').map((line) => { const i = line.indexOf('='); const key = (i < 0 ? line : line.slice(0, i)).trim().replace(/[^A-Za-z0-9_]/g, '_'); return key ? { k: key, l: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '), d: i < 0 ? '' : line.slice(i + 1).trim() } : null; }).filter(Boolean);
      else comp[k] = t.value;
      renderCanvas(); return;
    }
    if (t.dataset.s && selected && selected.kind === 'shape') {
      const s = comp.shapes[selected.i], k = t.dataset.s;
      if (t.type === 'checkbox') { if (t.checked) s.dash = '4 3'; else delete s.dash; }
      else if (t.type === 'number') { const v = parseFloat(t.value); if (!isNaN(v)) s[k] = v; }
      else s[k] = t.value;
      renderCanvas(); return;
    }
    if (t.dataset.p && selected && selected.kind === 'pin') {
      const pn = comp.pins[selected.i], k = t.dataset.p;
      if (k === 'x' || k === 'y') { const v = parseFloat(t.value); if (!isNaN(v)) pn[k] = Math.max(0, Math.min(k === 'x' ? comp.w : comp.h, S10(v))); }
      else pn[k] = t.value.trim();
      renderCanvas();
    }
  }
  function sideClick(e) {
    const pick = e.target.closest('[data-pick]');
    if (pick) { const [kind, i] = pick.dataset.pick.split(':'); selected = { kind, i: +i }; tool = 'select'; renderAll(); return; }
    const b = e.target.closest('[data-b]');
    if (!b) return;
    if (b.dataset.b === 'del') removeSelected();
    if (b.dataset.b === 'dup' && selected.kind === 'shape') { remember(); const s = JSON.parse(JSON.stringify(comp.shapes[selected.i])); moveShape(s, 5, 5); comp.shapes.push(s); selected = { kind: 'shape', i: comp.shapes.length - 1 }; renderAll(); }
  }
  function removeSelected() {
    if (!selected) return;
    remember();
    if (selected.kind === 'shape') comp.shapes.splice(selected.i, 1); else comp.pins.splice(selected.i, 1);
    selected = null; renderAll();
  }

  function toDef() {
    return { id: comp.id, custom: true, cat: 'My components', name: comp.name || 'Custom component', prefix: (comp.prefix || '').trim(), sub: comp.sub || '', props: comp.props || [], w: comp.w, h: comp.h, pins: comp.pins.map((p) => ({ id: String(p.id), x: p.x, y: p.y, n: p.n || String(p.id) })), shapes: comp.shapes };
  }
  async function save(place) {
    const d = toDef();
    const ids = d.pins.map((p) => p.id);
    if (new Set(ids).size !== ids.length) { window.LoomEditor.toast('Give every pin a different id before saving.'); return; }
    if (!d.shapes.length) { window.LoomEditor.toast('Draw at least one shape first.'); return; }
    d.pins.forEach((p) => { p.x = Math.max(0, Math.min(d.w, S10(p.x))); p.y = Math.max(0, Math.min(d.h, S10(p.y))); });
    await window.LoomEditor.saveComponent(d);
    close();
    if (place) window.LoomEditor.place(d.id);
    window.LoomEditor.toast(`Saved “${d.name}” to My components`);
  }

  root.tabIndex = -1;
  window.LoomBuilder = { open };
})();
