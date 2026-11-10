/*
 * Loomwright editor.
 * Copyright (C) 2026 Loomwright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function () {
  'use strict';
  const L = window.Loom, PF = window.Platform;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = L.esc;
  const AUTOSAVE = 'loomwright.autosave.v1';

  /* ---------------- State ---------------- */
  let doc;
  let file = { path: null, name: null, mtime: 0 };
  let dirty = false;
  let sel = { parts: new Set(), wires: new Set() };
  let draft = null;               // wire being drawn: {from, points}
  let drag = null;
  let view = { x: 40, y: 40, k: 1 };
  let hist = [], redoStack = [];
  let mouse = { x: 0, y: 0 };
  let clipboard = null;
  let spaceDown = false;
  let lastWire = { colour: 'red', tracer: '', gauge: '1.0' };
  let userLib = { parts: [], colours: [] };
  let tab = 'wires';
  let placeCount = 0;

  const svg = $('#canvas'), vp = $('#vp'), content = $('#content'), overlay = $('#overlay');

  /* ---------------- Helpers ---------------- */
  const partById = (id) => doc.parts.find((p) => p.id === id);
  const wireById = (id) => doc.wires.find((w) => w.id === id);
  const snap = L.snap;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function world(e) { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k }; }
  function selCount() { return sel.parts.size + sel.wires.size; }
  function only(kind) { return kind === 'part' ? (sel.parts.size === 1 && !sel.wires.size ? partById([...sel.parts][0]) : null) : (sel.wires.size === 1 && !sel.parts.size ? wireById([...sel.wires][0]) : null); }

  function pushHistory() { hist.push(JSON.stringify(doc)); if (hist.length > 200) hist.shift(); redoStack = []; markDirty(); }
  function markDirty() { dirty = true; $('#dirty').hidden = false; updateTitle(); }
  function markClean() { dirty = false; $('#dirty').hidden = true; updateTitle(); }
  function updateTitle() { PF.setTitle(`${dirty ? '• ' : ''}${doc.title || 'Untitled'}${file.name ? ' — ' + file.name : ''} · Loomwright`); }
  function autosave() { try { localStorage.setItem(AUTOSAVE, JSON.stringify({ doc, file: { path: file.path, name: file.name } })); } catch (e) { /* storage unavailable */ } }

  function toast(msg, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
    t.hidden = false;
    if (action) t.querySelector('button').onclick = () => { t.hidden = true; action.run(); };
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, action ? 9000 : 2600);
  }

  /* Merge custom parts from the user library into the document when used,
     so a saved diagram always carries the symbols it needs. */
  function ensureCustomInDoc(type) {
    if (L.LIBRARY[type]) return;
    const fromUser = userLib.parts.find((p) => p.id === type);
    if (!fromUser) return;
    const i = doc.customParts.findIndex((p) => p.id === type);
    if (i >= 0) doc.customParts[i] = clone(fromUser); else doc.customParts.push(clone(fromUser));
  }
  function defOf(type) { return L.partDef(doc, type) || userLib.parts.find((p) => p.id === type) || null; }

  /* ---------------- Rendering ---------------- */
  function applyView() {
    vp.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    $('#zoom-label').textContent = Math.round(view.k * 100) + '%';
  }
  function render() {
    content.innerHTML = L.renderDiagram(doc, { mode: 'edit', selWires: sel.wires, activePin: draft ? draft.from.part + '|' + draft.from.pin : null });
    renderOverlay();
  }
  function renderOverlay() {
    let s = '';
    sel.parts.forEach((id) => {
      const p = partById(id); if (!p) return;
      const b = L.partBox(doc, p);
      s += `<rect x="${b.x - 6}" y="${b.y - 6}" width="${b.w + 12}" height="${b.h + 12}" rx="4" fill="none" stroke="#2f7dff" stroke-width="${1.3 / view.k}" stroke-dasharray="${4 / view.k} ${3 / view.k}" pointer-events="none"/>`;
    });
    const w = only('wire');
    if (w) {
      const pts = L.wirePoints(doc, w) || [];
      const hs = 9 / view.k;
      if (w.points && w.points.length) {
        w.points.forEach((p, i) => { s += `<rect x="${p.x - hs / 2}" y="${p.y - hs / 2}" width="${hs}" height="${hs}" fill="#ffffff" stroke="#2f7dff" stroke-width="${1.6 / view.k}" data-wp="${w.id}|${i}" style="cursor:move"><title>Drag to move. Double-click to remove.</title></rect>`; });
      } else if (pts.length === 4) {
        const mx = pts[1].x, my = (pts[1].y + pts[2].y) / 2;
        s += `<rect x="${mx - hs / 2}" y="${my - hs / 2}" width="${hs}" height="${hs}" rx="${hs / 2}" fill="#ffffff" stroke="#2f7dff" stroke-width="${1.6 / view.k}" data-mid="${w.id}" style="cursor:ew-resize"><title>Drag to move this run. Double-click the wire to add bend points.</title></rect>`;
      }
    }
    if (draft) {
      const a = L.pinPos(doc, draft.from);
      if (a) {
        const pts = [a, ...draft.points, { x: snap(mouse.x), y: snap(mouse.y) }];
        const col = (L.colourById(doc, lastWire.colour) || {}).hex || '#e07b00';
        s += `<path d="M${pts.map((p) => p.x + ' ' + p.y).join(' L')}" fill="none" stroke="#262b28" stroke-width="${L.gaugeWidth(lastWire.gauge) + 1.6}" stroke-dasharray="6 4" pointer-events="none" opacity=".75"/>`;
        s += `<path d="M${pts.map((p) => p.x + ' ' + p.y).join(' L')}" fill="none" stroke="${col}" stroke-width="${L.gaugeWidth(lastWire.gauge)}" stroke-dasharray="6 4" pointer-events="none"/>`;
        s += `<circle cx="${a.x}" cy="${a.y}" r="7" fill="none" stroke="#e07b00" stroke-width="2" pointer-events="none"/>`;
      }
    }
    if (drag && drag.mode === 'marquee') {
      const r = rectOf(drag.start, drag.cur);
      s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="rgba(47,125,255,.08)" stroke="#2f7dff" stroke-width="${1 / view.k}" pointer-events="none"/>`;
    }
    overlay.innerHTML = s;
  }
  function rectOf(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }

  function refreshAll() { render(); inspector(); tables(); }
  function commit() { autosave(); refreshAll(); }

  function setHint() {
    const h = $('#hint');
    let items;
    if (draft) items = ['Click a pin to finish the wire', 'Click empty space to add a bend', '<kbd>Esc</kbd> cancels'];
    else if (only('wire')) items = ['Drag the handle to move the wire', 'Double-click the wire to add a bend', '<kbd>Del</kbd> deletes'];
    else if (sel.parts.size) items = ['<kbd>R</kbd> rotate', '<kbd>F</kbd> flip', '<kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate', '<kbd>Del</kbd> delete', 'Arrow keys nudge'];
    else items = ['Drag parts in from the library', 'Click a pin, then another pin, to draw a wire', 'Scroll to pan, <kbd>Ctrl</kbd>+scroll or pinch to zoom', 'Drag empty space to select'];
    h.innerHTML = items.map((t) => `<span>${t}</span>`).join('');
  }

  /* ---------------- Selection ---------------- */
  function select(parts = [], wires = [], add = false) {
    if (!add) sel = { parts: new Set(), wires: new Set() };
    parts.forEach((id) => sel.parts.add(id));
    wires.forEach((id) => sel.wires.add(id));
    render(); inspector(); highlightRows(); setHint();
  }
  function toggleSel(kind, id) {
    const set = kind === 'part' ? sel.parts : sel.wires;
    if (set.has(id)) set.delete(id); else set.add(id);
    render(); inspector(); highlightRows(); setHint();
  }
  function clearSel() { select(); }

  /* ---------------- Parts and wires ---------------- */
  function centreWorld() { const r = svg.getBoundingClientRect(); return { x: (r.width / 2 - view.x) / view.k, y: (r.height / 2 - view.y) / view.k }; }
  function addPartAt(type, at) {
    ensureCustomInDoc(type);
    const d = L.partDef(doc, type);
    if (!d) return;
    pushHistory();
    const c = at || (() => { const cw = centreWorld(); placeCount = (placeCount + 1) % 6; return { x: cw.x + placeCount * 20, y: cw.y + placeCount * 20 }; })();
    const p = L.addPart(doc, type, {});
    const r = L.resolved(doc, p);
    p.x = snap(c.x - r.w / 2); p.y = snap(c.y - r.h / 2);
    select([p.id]);
    commit();
  }
  function finishWire(end) {
    if (!draft) return;
    if (draft.from.part === end.part && draft.from.pin === end.pin) { draft = null; render(); setHint(); return; }
    pushHistory();
    const w = L.addWire(doc, draft.from, end, { colour: lastWire.colour, tracer: lastWire.tracer, gauge: lastWire.gauge });
    if (draft.points.length) w.points = draft.points.slice();
    draft = null;
    svg.classList.remove('wiring');
    select([], [w.id]);
    commit();
  }
  function deleteSelection() {
    if (!selCount()) return;
    pushHistory();
    doc.parts = doc.parts.filter((p) => !sel.parts.has(p.id));
    doc.wires = doc.wires.filter((w) => !sel.wires.has(w.id) && !sel.parts.has(w.from.part) && !sel.parts.has(w.to.part));
    clearSel(); commit();
  }
  function rotateSelection(dir = 1) {
    if (!sel.parts.size) return;
    pushHistory();
    sel.parts.forEach((id) => { const p = partById(id); p.rot = (((p.rot || 0) + dir) % 4 + 4) % 4; });
    commit();
  }
  function flipSelection() {
    if (!sel.parts.size) return;
    pushHistory();
    sel.parts.forEach((id) => { const p = partById(id); p.flip = !p.flip; });
    commit();
  }
  function copySelection() {
    if (!sel.parts.size) return false;
    const parts = doc.parts.filter((p) => sel.parts.has(p.id));
    const wires = doc.wires.filter((w) => sel.parts.has(w.from.part) && sel.parts.has(w.to.part));
    const custom = doc.customParts.filter((c) => parts.some((p) => p.type === c.id));
    clipboard = clone({ parts, wires, custom });
    try { localStorage.setItem('loomwright.clipboard', JSON.stringify(clipboard)); } catch (e) { /* ignore */ }
    return true;
  }
  function paste(offset = 40) {
    let cb = clipboard;
    if (!cb) { try { cb = JSON.parse(localStorage.getItem('loomwright.clipboard') || 'null'); } catch (e) { cb = null; } }
    if (!cb || !cb.parts.length) return;
    pushHistory();
    (cb.custom || []).forEach((c) => { if (!doc.customParts.some((x) => x.id === c.id)) doc.customParts.push(clone(c)); });
    const map = {};
    const newParts = cb.parts.map((p) => {
      const q = clone(p); q.id = L.uid('p'); map[p.id] = q.id; q.x += offset; q.y += offset;
      const d = L.partDef(doc, q.type); if (d && d.prefix && q.label) q.label = L.nextLabel(doc, d.prefix);
      doc.parts.push(q); return q;
    });
    const newWires = cb.wires.map((w) => {
      const q = clone(w); q.id = L.uid('w'); q.name = L.nextWireName(doc);
      q.from.part = map[w.from.part]; q.to.part = map[w.to.part];
      if (q.points) q.points = q.points.map((p) => ({ x: p.x + offset, y: p.y + offset }));
      doc.wires.push(q); return q;
    });
    select(newParts.map((p) => p.id), newWires.map((w) => w.id));
    commit();
  }
  function nudge(dx, dy) {
    if (!sel.parts.size) return;
    pushHistory();
    moveParts([...sel.parts], dx, dy);
    commit();
  }
  function moveParts(ids, dx, dy, base) {
    const set = new Set(ids);
    ids.forEach((id) => { const p = partById(id); if (!p) return; const o = base ? base.parts[id] : p; p.x = o.x + dx; p.y = o.y + dy; });
    doc.wires.forEach((w) => {
      if (!w.points || !w.points.length) return;
      if (set.has(w.from.part) && set.has(w.to.part)) {
        const o = base ? base.wires[w.id] : w.points;
        w.points = o.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      }
    });
  }

  /* ---------------- Undo ---------------- */
  function undo() { if (!hist.length) return; redoStack.push(JSON.stringify(doc)); doc = JSON.parse(hist.pop()); afterSwap(); }
  function redo() { if (!redoStack.length) return; hist.push(JSON.stringify(doc)); doc = JSON.parse(redoStack.pop()); afterSwap(); }
  function afterSwap() {
    ['parts', 'wires'].forEach((k) => sel[k].forEach((id) => { if (!(k === 'parts' ? partById(id) : wireById(id))) sel[k].delete(id); }));
    draft = null; $('#doc-title').value = doc.title; markDirty(); buildLibrary(); commit(); setHint();
  }

  /* ---------------- Pointer input ---------------- */
  svg.addEventListener('pointerdown', (e) => {
    svg.focus({ preventScroll: true });
    const t = e.target, w = world(e);
    mouse = w;
    if (e.button === 2) return;
    if (e.button === 1 || spaceDown) { startPan(e); return; }
    const pinEl = t.closest('[data-pin]'), wpEl = t.closest('[data-wp]'), midEl = t.closest('[data-mid]'), partEl = t.closest('[data-part]'), wireEl = t.closest('[data-wire]');
    svg.setPointerCapture(e.pointerId);
    if (pinEl) {
      const [pid, ...rest] = pinEl.dataset.pin.split('|');
      drag = { mode: 'pinpress', end: { part: pid, pin: rest.join('|') }, sx: e.clientX, sy: e.clientY, start: w, shift: e.shiftKey };
      return;
    }
    if (wpEl) { const [wid, i] = wpEl.dataset.wp.split('|'); pushHistory(); drag = { mode: 'wp', wid, i: +i }; return; }
    if (midEl) { const wire = wireById(midEl.dataset.mid); pushHistory(); drag = { mode: 'mid', wid: wire.id, start: w, dx0: wire.dx || 0 }; return; }
    if (draft) { draft.points.push({ x: snap(w.x), y: snap(w.y) }); renderOverlay(); return; }
    if (partEl) {
      const id = partEl.dataset.part;
      if (e.shiftKey) { toggleSel('part', id); return; }
      if (!sel.parts.has(id)) select([id]);
      startMove(w);
      return;
    }
    if (wireEl) { const id = wireEl.dataset.wire; if (e.shiftKey) toggleSel('wire', id); else select([], [id]); return; }
    if (!e.shiftKey && selCount()) clearSel();
    drag = { mode: 'marquee', start: w, cur: w, add: e.shiftKey };
  });
  function startPan(e) { svg.setPointerCapture(e.pointerId); drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; svg.classList.add('panning'); }
  function startMove(w) {
    const base = { parts: {}, wires: {} };
    sel.parts.forEach((id) => { const p = partById(id); base.parts[id] = { x: p.x, y: p.y }; });
    doc.wires.forEach((wr) => { if (wr.points) base.wires[wr.id] = clone(wr.points); });
    drag = { mode: 'move', start: w, base, moved: false };
  }
  svg.addEventListener('pointermove', (e) => {
    const w = world(e); mouse = w;
    if (!drag) { if (draft) renderOverlay(); return; }
    switch (drag.mode) {
      case 'pan': view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; applyView(); break;
      case 'pinpress':
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5 && !draft) {
          const id = drag.end.part;
          if (!sel.parts.has(id)) select([id]);
          startMove(drag.start);
        }
        break;
      case 'move': {
        const dx = snap(w.x - drag.start.x), dy = snap(w.y - drag.start.y);
        if (!drag.moved && (dx || dy)) { pushHistory(); drag.moved = true; }
        if (drag.moved) { moveParts([...sel.parts], dx, dy, drag.base); render(); }
        break;
      }
      case 'wp': { const wr = wireById(drag.wid); wr.points[drag.i] = { x: snap(w.x), y: snap(w.y) }; render(); break; }
      case 'mid': { const wr = wireById(drag.wid); wr.dx = drag.dx0 + snap(w.x - drag.start.x); render(); break; }
      case 'marquee': drag.cur = w; renderOverlay(); break;
    }
  });
  svg.addEventListener('pointerup', (e) => {
    const d = drag; drag = null; svg.classList.remove('panning');
    if (!d) return;
    if (d.mode === 'pinpress') {
      if (draft) finishWire(d.end);
      else { draft = { from: d.end, points: [] }; svg.classList.add('wiring'); render(); setHint(); }
      return;
    }
    if (d.mode === 'marquee') {
      const r = rectOf(d.start, d.cur);
      if (r.w < 3 && r.h < 3) { renderOverlay(); return; }
      const parts = doc.parts.filter((p) => { const b = L.partBox(doc, p); return b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h; }).map((p) => p.id);
      const ps = new Set(parts);
      const wires = doc.wires.filter((w) => ps.has(w.from.part) && ps.has(w.to.part)).map((w) => w.id);
      select(parts, wires, d.add);
      return;
    }
    if (d.mode === 'move' && d.moved) commit();
    if (d.mode === 'wp' || d.mode === 'mid') commit();
  });
  svg.addEventListener('dblclick', (e) => {
    const t = e.target, w = world(e);
    const wpEl = t.closest('[data-wp]');
    if (wpEl) { const [wid, i] = wpEl.dataset.wp.split('|'); const wr = wireById(wid); pushHistory(); wr.points.splice(+i, 1); commit(); return; }
    const wireEl = t.closest('[data-wire]');
    if (wireEl) {
      const wr = wireById(wireEl.dataset.wire);
      const pts = L.wirePoints(doc, wr);
      pushHistory();
      if (!wr.points || !wr.points.length) { wr.points = pts.slice(1, -1).map((p) => ({ x: p.x, y: p.y })); delete wr.dx; }
      // insert a new bend on the nearest segment
      const full = L.wirePoints(doc, wr), via = wr.points;
      let best = 0, bd = Infinity;
      for (let i = 0; i < full.length - 1; i++) { const dd = segDist(w, full[i], full[i + 1]); if (dd < bd) { bd = dd; best = i; } }
      const before = full[best];
      let idx = via.findIndex((p) => p.x === before.x && p.y === before.y);
      idx = idx < 0 ? (best === 0 ? 0 : via.length) : idx + 1;
      via.splice(idx, 0, { x: snap(w.x), y: snap(w.y) });
      select([], [wr.id]); commit(); return;
    }
    const partEl = t.closest('[data-part]');
    if (partEl) { const f = $('#inspector input, #inspector textarea'); if (f) f.focus(); }
  });
  function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const r = svg.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      zoomAt(sx, sy, Math.exp(-e.deltaY * 0.01));
    } else {
      const f = e.deltaMode === 1 ? 16 : 1;
      view.x -= (e.shiftKey ? e.deltaY : e.deltaX) * f; view.y -= (e.shiftKey ? 0 : e.deltaY) * f; applyView();
    }
  }, { passive: false });
  function zoomAt(sx, sy, factor) {
    const k2 = Math.max(0.15, Math.min(5, view.k * factor));
    view.x = sx - (sx - view.x) * (k2 / view.k); view.y = sy - (sy - view.y) * (k2 / view.k); view.k = k2;
    applyView(); renderOverlay();
  }
  function zoomBy(f) { const r = svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, f); }
  function fit() {
    const b = L.bounds(doc), r = svg.getBoundingClientRect();
    if (!r.width) return;
    const k = Math.max(0.15, Math.min(1.6, Math.min((r.width - 60) / b.w, (r.height - 60) / b.h)));
    view.k = k; view.x = (r.width - b.w * k) / 2 - b.x * k; view.y = (r.height - b.h * k) / 2 - b.y * k;
    applyView(); renderOverlay();
  }

  // Drag and drop from the library
  svg.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-loom-part')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  svg.addEventListener('drop', (e) => {
    const type = e.dataTransfer.getData('text/x-loom-part');
    if (!type) return;
    e.preventDefault();
    addPartAt(type, world(e));
  });

  /* ---------------- Keyboard ---------------- */
  document.addEventListener('keydown', (e) => {
    if (!$('#builder').hidden) return;
    if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
    const tag = (e.target.tagName || '').toUpperCase();
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); e.shiftKey ? saveAs() : save(); return; }
    if (mod && k === 'o') { e.preventDefault(); openFile(); return; }
    if (typing) return;
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && k === 'y') { e.preventDefault(); redo(); }
    else if (mod && k === 'c') { if (copySelection()) toast('Copied'); }
    else if (mod && k === 'x') { if (copySelection()) deleteSelection(); }
    else if (mod && k === 'v') { e.preventDefault(); paste(); }
    else if (mod && k === 'd') { e.preventDefault(); if (copySelection()) paste(20); }
    else if (mod && k === 'a') { e.preventDefault(); select(doc.parts.map((p) => p.id), doc.wires.map((w) => w.id)); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    else if (k === 'r' && !mod) rotateSelection(e.shiftKey ? -1 : 1);
    else if (k === 'f' && !mod) flipSelection();
    else if (e.key === 'Escape') { if (draft) { draft = null; svg.classList.remove('wiring'); render(); setHint(); } else clearSel(); }
    else if (e.key === '+' || e.key === '=') zoomBy(1.2);
    else if (e.key === '-') zoomBy(1 / 1.2);
    else if (e.key === '0') fit();
    else if (e.key.startsWith('Arrow')) { e.preventDefault(); const s = e.shiftKey ? 50 : 10; nudge(e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0); }
    else if (e.key === ' ') { spaceDown = true; e.preventDefault(); }
  });
  document.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });

  /* ---------------- Library panel ---------------- */
  function iconSVG(type) {
    const d = defOf(type);
    if (!d) return '';
    const fake = { customParts: d.custom ? [d] : [] };
    const r = L.resolved(fake, { type, props: {} });
    const pad = 8;
    return `<svg viewBox="${-pad} ${-pad} ${r.w + pad * 2} ${r.h + pad * 2}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${L.symbolSVG(r)}</svg>`;
  }
  function buildLibrary() {
    const q = $('#lib-search').value.trim().toLowerCase();
    const items = Object.values(L.LIBRARY).concat(userLib.parts, doc.customParts.filter((c) => !userLib.parts.some((u) => u.id === c.id)));
    const match = (d) => !q || (d.name + ' ' + d.cat + ' ' + (d.prefix || '') + ' ' + (d.tags || '')).toLowerCase().includes(q);
    const cats = ['My components', ...L.CATEGORIES];
    let html = '';
    cats.forEach((cat) => {
      const list = items.filter((d) => (d.custom ? 'My components' : d.cat) === cat && match(d));
      if (!list.length && !(cat === 'My components' && !q)) return;
      html += `<details class="lib-cat" open><summary>${esc(cat)} <span>${list.length}</span></summary>`;
      if (cat === 'My components' && !list.length) html += `<p class="lib-empty">Components you design in the builder appear here.</p>`;
      html += '<div class="lib-grid">' + list.map((d) => `<button class="lib-item" draggable="true" data-type="${esc(d.id)}" title="${esc(d.name)}">${iconSVG(d.id)}<span>${esc(d.name)}</span>${d.custom ? `<span class="edit" data-edit="${esc(d.id)}" title="Edit component">Edit</span>` : ''}</button>`).join('') + '</div>';
      if (cat === 'My components') html += `<div class="lib-actions"><button class="btn" data-cmd="builder">New component</button><button class="btn" data-cmd="lib-import">Import</button><button class="btn" data-cmd="lib-export"${userLib.parts.length ? '' : ' disabled'}>Export</button></div>`;
      html += '</details>';
    });
    $('#lib-list').innerHTML = html || '<p class="lib-empty">No components match.</p>';
  }
  $('#lib-search').addEventListener('input', buildLibrary);
  $('#lib-list').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { e.stopPropagation(); window.LoomBuilder.open(defOf(ed.dataset.edit)); return; }
    const it = e.target.closest('.lib-item');
    if (it) addPartAt(it.dataset.type);
  });
  $('#lib-list').addEventListener('dragstart', (e) => {
    const it = e.target.closest('.lib-item');
    if (!it) return;
    e.dataTransfer.setData('text/x-loom-part', it.dataset.type);
    e.dataTransfer.effectAllowed = 'copy';
  });

  /* ---------------- Inspector ---------------- */
  const fld = (label, field, value, type = 'text', extra = '') => `<label class="fld"><span>${esc(label)}</span><input id="f-${field.replace(/[^a-z0-9]/gi, '-')}" type="${type}" data-field="${field}" value="${esc(value == null ? '' : value)}" ${extra}></label>`;
  function colourOptions(selected, allowNone) {
    const std = doc.settings.standard;
    const std_ = L.COLOURS.filter((c) => std === 'custom' ? false : true);
    const opt = (c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(L.colourCode(doc, c))} · ${esc(c.name)}</option>`;
    return (allowNone ? `<option value="">None</option>` : '') +
      (doc.customColours.length ? `<optgroup label="My colours">${doc.customColours.map(opt).join('')}</optgroup>` : '') +
      (std_.length ? `<optgroup label="${esc(L.STANDARDS[std === 'custom' ? 'lr' : std].name)}">${std_.map(opt).join('')}</optgroup>` : '');
  }
  function colourField(label, field, value, allowNone) {
    const c = L.colourById(doc, value);
    return `<label class="fld"><span>${esc(label)}</span><span class="colour-row"><span class="swatch" style="background:${c ? c.hex : 'transparent'}"></span><select id="f-${field}" data-field="${field}">${colourOptions(value, allowNone)}</select></span></label>`;
  }
  function gaugeOptions(v) {
    const known = L.GAUGES.some((g) => g.mm2 === String(v));
    return (known ? '' : `<option value="${esc(v)}" selected>${esc(v)} mm²</option>`) + L.GAUGES.map((g) => `<option value="${g.mm2}"${g.mm2 === String(v) ? ' selected' : ''}>${g.mm2} mm² (≈${g.awg} AWG)</option>`).join('');
  }

  function inspector() {
    const el = $('#inspector');
    const p = only('part'), w = only('wire');
    if (p) el.innerHTML = partPanel(p);
    else if (w) el.innerHTML = wirePanel(w);
    else if (selCount()) el.innerHTML = multiPanel();
    else el.innerHTML = docPanel();
  }
  function partPanel(p) {
    const r = L.resolved(doc, p), d = r.def || { name: p.type, props: [], cat: 'Missing' };
    let h = `<div><span class="kicker">${esc(d.custom ? 'My components' : d.cat)}</span><h2>${esc(d.name)}</h2></div><div class="fields">`;
    if (p.type !== 'note' && p.type !== 'frame') h += fld('Reference', 'label', p.label);
    (d.props || []).forEach((pr) => {
      const v = r.props[pr.k];
      if (pr.type === 'textarea') h += `<label class="fld"><span>${esc(pr.l)}</span><textarea id="f-prop-${pr.k}" data-field="prop:${pr.k}">${esc(v)}</textarea></label>`;
      else if (pr.type === 'int') h += fld(pr.l, 'prop:' + pr.k, v, 'number', `min="${pr.min}" max="${pr.max}" step="1"`);
      else h += fld(pr.l, 'prop:' + pr.k, v);
    });
    h += `</div><div class="row-btns"><button class="btn" data-act="rotate">Rotate</button><button class="btn" data-act="flip">Flip</button><button class="btn" data-act="dup">Duplicate</button><button class="btn danger" data-act="delete">Delete</button></div>`;
    if (d.custom) h += `<div class="row-btns"><button class="btn" data-act="edit-custom">Edit component design</button></div>`;
    if (r.pins.length) {
      h += `<div><h3>Pins</h3><ul class="pins" style="margin-top:8px">` + r.pins.map((pn) => {
        const ws = doc.wires.filter((w) => (w.from.part === p.id && w.from.pin === pn.id) || (w.to.part === p.id && w.to.pin === pn.id));
        return `<li><b>${esc(pn.id)}</b><span class="muted">${pn.n && pn.n !== pn.id ? esc(pn.n) : ''}</span>${ws.map((w) => { const other = w.from.part === p.id && w.from.pin === pn.id ? w.to : w.from; const c = L.colourById(doc, w.colour); return `<button class="chip" data-goto="${w.id}"><span class="swatch" style="width:12px;height:8px;background:${c ? c.hex : '#888'}"></span> ${esc(w.name)} → ${esc(L.pinName(doc, other))}</button>`; }).join('') || '<span class="muted">· free</span>'}</li>`;
      }).join('') + '</ul></div>';
    }
    return h;
  }
  function wirePanel(w) {
    const vd = L.voltageDrop(w), sys = 12;
    let h = `<div><span class="kicker">Wire</span><h2>${esc(w.name)} <span class="muted" style="font-family:var(--f-mono);font-size:13px">${esc(L.wireCode(doc, w))}</span></h2><p class="sub">${esc(L.pinName(doc, w.from))} → ${esc(L.pinName(doc, w.to))}</p></div><div class="fields">`;
    h += `<div class="two">${fld('Wire number', 'name', w.name)}${fld('Circuit', 'circuit', w.circuit, 'text', 'placeholder="e.g. Spot lamps"')}</div>`;
    h += colourField('Main colour', 'colour', w.colour, false);
    h += `<div class="two">${colourField('Tracer', 'tracer', w.tracer, true)}${colourField('Second tracer', 'tracer2', w.tracer2 || '', true)}</div>`;
    h += `<label class="fld"><span>Size</span><select id="f-gauge" data-field="gauge">${gaugeOptions(w.gauge)}</select></label>`;
    h += `<div class="two">${fld('Length (m)', 'length', w.length, 'number', 'min="0" step="0.1"')}${fld('Current (A)', 'current', w.current, 'number', 'min="0" step="0.5"')}</div>`;
    if (vd != null) h += `<div class="callout ${vd > sys * 0.03 ? 'warn' : 'ok'}">Voltage drop ${vd.toFixed(2)} V (${((vd / sys) * 100).toFixed(1)}% of 12 V) one way at ${esc(w.current)} A.${vd > sys * 0.03 ? ' Over 3%: consider a heavier size.' : ''}</div>`;
    h += `<label class="fld"><span>Routing</span><select id="f-route" data-field="route"><option value="auto"${w.route !== 'straight' ? ' selected' : ''}>Square corners</option><option value="straight"${w.route === 'straight' ? ' selected' : ''}>Straight lines</option></select></label>`;
    h += `<label class="fld"><span>Notes</span><textarea id="f-notes" data-field="notes" placeholder="e.g. run inside chassis rail, P-clip every 300mm">${esc(w.notes)}</textarea></label></div>`;
    h += `<div class="row-btns"><button class="btn" data-act="swap">Swap ends</button><button class="btn" data-act="clear-bends">Clear bends</button><button class="btn danger" data-act="delete">Delete</button></div>`;
    return h;
  }
  function multiPanel() {
    return `<div><span class="kicker">Selection</span><h2>${sel.parts.size} parts, ${sel.wires.size} wires</h2></div>
      <div class="row-btns"><button class="btn" data-act="rotate">Rotate</button><button class="btn" data-act="dup">Duplicate</button><button class="btn danger" data-act="delete">Delete</button></div>
      ${sel.wires.size ? `<div class="fields"><h3>Set on all selected wires</h3><label class="fld"><span>Main colour</span><select id="f-all-colour" data-field="all:colour"><option value="" selected>Keep as is</option>${colourOptions('', false)}</select></label><label class="fld"><span>Size</span><select id="f-all-gauge" data-field="all:gauge"><option value="" selected>Keep as is</option>${gaugeOptions('')}</select></label>${fld('Circuit', 'all:circuit', '', 'text', 'placeholder="Keep as is"')}</div>` : ''}`;
  }
  function docPanel() {
    const m = doc.meta, s = doc.settings, checks = L.validate(doc).filter((c) => c.level !== 'info');
    const metres = doc.wires.reduce((a, w) => a + (parseFloat(w.length) || 0), 0);
    return `<div><span class="kicker">Diagram</span><h2>${esc(doc.title)}</h2></div>
      <div class="stat-row"><div class="stat"><b>${doc.parts.length}</b><span>parts</span></div><div class="stat"><b>${doc.wires.length}</b><span>wires</span></div><div class="stat"><b>${metres.toFixed(1)}</b><span>metres</span></div></div>
      ${checks.length ? `<button class="callout warn" style="border:0;text-align:left;cursor:pointer" data-act="show-checks">${checks.length} design check${checks.length > 1 ? 's' : ''} to review</button>` : ''}
      <div class="fields"><h3>Title block</h3>
        ${fld('Project / vehicle', 'meta:project', m.project, 'text', 'placeholder="e.g. Defender 110 Td5"')}
        <div class="two">${fld('Drawn by', 'meta:drawnBy', m.drawnBy)}${fld('Revision', 'meta:revision', m.revision)}</div>
        <div class="two">${fld('Date', 'meta:date', m.date, 'date')}${fld('Sheet', 'meta:sheet', m.sheet)}</div>
      </div>
      <div class="fields"><h3>Wire colours and labels</h3>
        <label class="fld"><span>Colour code standard</span><select id="f-std" data-field="settings:standard">${Object.values(L.STANDARDS).map((x) => `<option value="${x.id}"${x.id === s.standard ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <p class="muted" style="margin:-4px 0 0;font-size:12px">${esc(L.STANDARDS[s.standard].note)}</p>
        <label class="fld"><span>Wire labels on the drawing</span><select id="f-labels" data-field="settings:labels"><option value="full"${s.labels === 'full' ? ' selected' : ''}>Number, colour and size</option><option value="code"${s.labels === 'code' ? ' selected' : ''}>Colour code only</option><option value="none"${s.labels === 'none' ? ' selected' : ''}>None</option></select></label>
        <label class="fld check"><input type="checkbox" id="f-tb" data-field="settings:titleBlock"${s.titleBlock !== false ? ' checked' : ''}><span>Title block on exports</span></label>
        <label class="fld check"><input type="checkbox" id="f-key" data-field="settings:colourKey"${s.colourKey !== false ? ' checked' : ''}><span>Wire colour key on exports</span></label>
        <button class="btn" data-cmd="colours">Edit custom colours</button>
      </div>
      <div><h3>Getting started</h3><ul class="tips" style="margin-top:8px"><li>Drag a component from the library, or click it to drop it in the middle.</li><li>Click a pin, then another pin, to wire them. Click empty space on the way to add bends.</li><li>Select a wire to set its colour, tracer, size, length and current.</li><li>Use the component builder for anything not in the library.</li></ul></div>`;
  }

  let snapBefore = null;
  const insp = $('#inspector');
  insp.addEventListener('focusin', (e) => { if (e.target.matches('[data-field]')) snapBefore = JSON.stringify(doc); });
  insp.addEventListener('input', (e) => { if (e.target.matches('[data-field]') && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') applyField(e.target, true); });
  insp.addEventListener('change', (e) => {
    if (!e.target.matches('[data-field]')) return;
    if (snapBefore == null) snapBefore = JSON.stringify(doc);
    applyField(e.target, false);
    const now = JSON.stringify(doc);
    if (snapBefore !== now) { hist.push(snapBefore); redoStack = []; markDirty(); }
    snapBefore = now;
    autosave(); tables();
    if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || /^prop:|^all:/.test(e.target.dataset.field)) inspector();
  });
  function applyField(el, live) {
    const f = el.dataset.field, v = el.type === 'checkbox' ? el.checked : el.value;
    if (f.startsWith('meta:')) doc.meta[f.slice(5)] = v;
    else if (f.startsWith('settings:')) doc.settings[f.slice(9)] = v;
    else if (f.startsWith('all:')) {
      if (live || v === '') return;
      const k = f.slice(4); sel.wires.forEach((id) => { wireById(id)[k] = v; });
    } else if (only('part')) {
      const p = only('part');
      if (f === 'label') p.label = v;
      else if (f.startsWith('prop:')) {
        const k = f.slice(5), d = defOf(p.type), spec = (d.props || []).find((x) => x.k === k);
        if (spec && spec.type === 'int') { if (live && v === '') return; let n = parseInt(v, 10); if (isNaN(n)) n = spec.d; p.props[k] = Math.max(spec.min, Math.min(spec.max, n)); L.pruneWires(doc); }
        else p.props[k] = v;
      }
    } else if (only('wire')) {
      const w = only('wire');
      w[f] = v;
      if (f === 'tracer2' && !v) delete w.tracer2;
      if (['colour', 'tracer', 'gauge'].includes(f)) lastWire[f] = v;
      if (f === 'colour' || f.startsWith('tracer')) { const sw = el.parentElement.querySelector('.swatch'); const c = L.colourById(doc, v); if (sw) sw.style.background = c ? c.hex : 'transparent'; }
    }
    render();
  }
  insp.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) { select([], [g.dataset.goto]); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'rotate') rotateSelection(1);
    else if (act === 'flip') flipSelection();
    else if (act === 'dup') { if (copySelection()) paste(20); }
    else if (act === 'delete') deleteSelection();
    else if (act === 'edit-custom') window.LoomBuilder.open(defOf(only('part').type));
    else if (act === 'show-checks') showTab('checks');
    else if (act === 'swap') { const w = only('wire'); pushHistory(); [w.from, w.to] = [w.to, w.from]; if (w.points) w.points.reverse(); commit(); }
    else if (act === 'clear-bends') { const w = only('wire'); pushHistory(); delete w.points; delete w.dx; commit(); }
  });

  /* ---------------- Tables ---------------- */
  function swatchHTML(w) {
    const m = L.colourById(doc, w.colour), t = L.colourById(doc, w.tracer);
    const bg = t ? `repeating-linear-gradient(90deg, ${m ? m.hex : '#888'} 0 6px, ${t.hex} 6px 9px)` : (m ? m.hex : '#888');
    return `<span class="swatch" style="background:${bg}"></span>`;
  }
  function tables() {
    const wrap = $('#table-wrap');
    const wl = L.wireList(doc), checks = L.validate(doc), bomRows = L.bom(doc);
    const issues = checks.filter((c) => c.level !== 'info').length;
    $('#c-wires').textContent = doc.wires.length;
    $('#c-bom').textContent = bomRows.reduce((a, r) => a + r.qty, 0);
    const cc = $('#c-checks'); cc.textContent = issues || ''; cc.className = 'count' + (issues ? ' warn' : '');
    let h = '';
    if (tab === 'wires') {
      h = wl.length ? `<table class="data"><thead><tr><th>Wire</th><th>From</th><th>To</th><th>Colour</th><th>Code</th><th>Size</th><th>AWG</th><th>Length m</th><th>Current A</th><th>Drop V</th><th>Circuit</th><th>Notes</th></tr></thead><tbody>${wl.map((r) => { const w = wireById(r.id); return `<tr class="click${sel.wires.has(r.id) ? ' sel' : ''}" data-wire="${r.id}"><td class="mono">${esc(r.name)}</td><td class="mono">${esc(r.from)}</td><td class="mono">${esc(r.to)}</td><td>${swatchHTML(w)} ${esc(r.colour)}</td><td class="mono">${esc(r.code)}</td><td class="mono">${esc(r.gauge)} mm²</td><td class="mono">${esc(r.awg)}</td><td class="mono">${esc(r.length)}</td><td class="mono">${esc(r.current)}</td><td class="mono">${esc(r.drop)}</td><td>${esc(r.circuit)}</td><td>${esc(r.notes)}</td></tr>`; }).join('')}</tbody></table>` : '<p class="empty">No wires yet. Click a pin, then another pin, to draw one.</p>';
    } else if (tab === 'bom') {
      h = bomRows.length ? `<table class="data"><thead><tr><th>Qty</th><th>Component</th><th>Spec</th><th>References</th></tr></thead><tbody>${bomRows.map((r) => `<tr><td class="mono">${r.qty}</td><td>${esc(r.name)}</td><td class="mono">${esc(r.spec)}</td><td class="mono">${esc(r.refs.join(', '))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No components yet.</p>';
    } else if (tab === 'cable') {
      const rows = L.cableTotals(doc);
      h = rows.length ? `<table class="data"><thead><tr><th>Size</th><th>Code</th><th>Colour</th><th>Wires</th><th>Total m</th><th>Buy (+15%)</th><th>Missing lengths</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="mono">${esc(r.gauge)} mm²</td><td class="mono">${esc(r.code)}</td><td>${esc(r.colour)}</td><td class="mono">${r.wires}</td><td class="mono">${r.metres.toFixed(1)}</td><td class="mono">${(r.metres * 1.15).toFixed(1)}</td><td class="mono">${r.unknown || ''}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Add wires with lengths to see how much cable to buy.</p>';
    } else if (tab === 'checks') {
      h = checks.length ? `<table class="data"><thead><tr><th>Level</th><th>Finding</th></tr></thead><tbody>${checks.map((c) => `<tr class="click" ${c.wire ? `data-wire="${c.wire}"` : c.part ? `data-part="${c.part}"` : ''}><td><span class="lvl ${c.level}">${c.level === 'warn' ? 'check' : c.level}</span></td><td style="white-space:normal">${esc(c.text)}</td></tr>`).join('')}</tbody></table><p class="empty" style="padding-top:6px">Size guidance is a rule of thumb for single PVC automotive cable. Always check your cable maker's ratings.</p>` : '<p class="empty">No problems found.</p>';
    }
    wrap.innerHTML = h;
  }
  function highlightRows() { $$('#table-wrap tr[data-wire]').forEach((tr) => tr.classList.toggle('sel', sel.wires.has(tr.dataset.wire))); }
  function showTab(t) { tab = t; $$('.tab[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); $('#tables').classList.remove('collapsed'); tables(); }
  $('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  $('#tables-toggle').addEventListener('click', (e) => { const t = $('#tables'); t.classList.toggle('collapsed'); e.currentTarget.textContent = t.classList.contains('collapsed') ? '▴' : '▾'; e.currentTarget.setAttribute('aria-expanded', String(!t.classList.contains('collapsed'))); });
  $('#table-wrap').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-wire], tr[data-part]');
    if (!tr) return;
    if (tr.dataset.wire) select([], [tr.dataset.wire]); else select([tr.dataset.part]);
    centreOnSelection();
  });
  function centreOnSelection() {
    const pts = [];
    sel.parts.forEach((id) => { const p = partById(id); if (p) { const b = L.partBox(doc, p); pts.push({ x: b.x + b.w / 2, y: b.y + b.h / 2 }); } });
    sel.wires.forEach((id) => { const w = wireById(id); const ps = w && L.wirePoints(doc, w); if (ps) pts.push(...ps); });
    if (!pts.length) return;
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const r = svg.getBoundingClientRect();
    const sx = cx * view.k + view.x, sy = cy * view.k + view.y;
    if (sx < 40 || sy < 40 || sx > r.width - 40 || sy > r.height - 40) { view.x = r.width / 2 - cx * view.k; view.y = r.height / 2 - cy * view.k; applyView(); renderOverlay(); }
  }

  /* ---------------- Files ---------------- */
  const slug = (s) => (String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wiring-diagram');
  function serialise() { return JSON.stringify({ ...doc, app: 'Loomwright ' + L.VERSION }, null, 2); }
  function loadDoc(d, f) {
    doc = L.normalise(d);
    file = { path: (f && f.path) || null, name: (f && f.name) || null, mtime: 0 };
    hist = []; redoStack = []; draft = null; sel = { parts: new Set(), wires: new Set() };
    $('#doc-title').value = doc.title;
    buildLibrary(); refreshAll(); setHint();
    requestAnimationFrame(fit);
    if (file.path && PF.canWatch) PF.mtime(file.path).then((m) => { file.mtime = m; }).catch(() => {});
  }
  async function openFile() {
    try {
      const r = await PF.openDiagram();
      if (!r) return;
      loadDoc(JSON.parse(r.text), r);
      markClean(); autosave();
      toast(`Opened ${r.name}`);
    } catch (e) { showMessage('Could not open that file', `<p>${esc(e.message || e)}</p><p class="muted">Loomwright opens .loom and .json files saved by Loomwright or the Claude add-on.</p>`); }
  }
  async function save() { return saveTo(file.path); }
  async function saveAs() { return saveTo(null); }
  async function saveTo(path) {
    try {
      const r = await PF.saveDiagram(serialise(), path, slug(doc.title) + '.loom');
      if (!r) return;
      if (r.path) { file.path = r.path; file.name = r.name; if (PF.canWatch) file.mtime = await PF.mtime(r.path); }
      else file.name = r.name;
      markClean(); autosave();
      if (!r.shown) toast(`Saved ${r.name || ''}`);
    } catch (e) { showMessage('Could not save', `<p>${esc(e.message || e)}</p>`); }
  }
  function newDoc() {
    const d = L.newDoc('Untitled diagram');
    d.customColours = clone(userLib.colours || []);
    loadDoc(d, null); markClean(); autosave();
  }

  // Desktop: reload when the open file changes on disk, e.g. after the Claude add-on edits it.
  if (PF.canWatch) setInterval(async () => {
    if (!file.path) return;
    try {
      const m = await PF.mtime(file.path);
      if (!file.mtime) { file.mtime = m; return; }
      if (m > file.mtime) {
        file.mtime = m;
        const reload = async () => { const t = await PF.readFile(file.path); const keep = { ...view }; loadDoc(JSON.parse(t), file); view = keep; applyView(); markClean(); };
        if (!dirty) { await reload(); toast('Updated from file'); }
        else toast('This file changed on disk.', { label: 'Reload', run: reload });
      }
    } catch (e) { /* file may be mid-write */ }
  }, 1500);

  /* ---------------- Export ---------------- */
  const csv = (rows) => rows.map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  async function exportSVG() { await PF.exportFile(slug(doc.title) + '.svg', L.exportSVG(doc), 'image/svg+xml'); }
  function svgToPng(svgText, scale = 2) {
    return new Promise((resolve, reject) => {
      const m = /width="([\d.]+)" height="([\d.]+)"/.exec(svgText), W = +m[1], H = +m[2];
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => b ? b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab))) : reject(new Error('PNG export failed')), 'image/png');
      };
      img.onerror = () => reject(new Error('PNG export failed'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
    });
  }
  async function exportPNG() { const bytes = await svgToPng(L.exportSVG(doc), 2); await PF.exportFile(slug(doc.title) + '.png', bytes, 'image/png'); }
  async function exportWires() {
    const rows = [['Wire', 'From', 'To', 'Colour code', 'Colour', 'Size mm2', 'AWG', 'Length m', 'Current A', 'Voltage drop V', 'Circuit', 'Notes']].concat(L.wireList(doc).map((r) => [r.name, r.from, r.to, r.code, r.colour, r.gauge, r.awg, r.length, r.current, r.drop, r.circuit, r.notes]));
    await PF.exportFile(slug(doc.title) + '-wires.csv', csv(rows), 'text/csv');
  }
  async function exportBOM() { await PF.exportFile(slug(doc.title) + '-parts.csv', csv([['Qty', 'Component', 'Spec', 'References']].concat(L.bom(doc).map((r) => [r.qty, r.name, r.spec, r.refs.join(' ')]))), 'text/csv'); }
  async function exportCable() { await PF.exportFile(slug(doc.title) + '-cable.csv', csv([['Size mm2', 'Code', 'Colour', 'Wires', 'Total m', 'Buy m (+15%)', 'Wires missing length']].concat(L.cableTotals(doc).map((r) => [r.gauge, r.code, r.colour, r.wires, r.metres.toFixed(1), (r.metres * 1.15).toFixed(1), r.unknown]))), 'text/csv'); }
  function printDiagram() {
    const wl = L.wireList(doc);
    $('#print-area').innerHTML = L.exportSVG(doc) + (wl.length ? `<h3>Wire list: ${esc(doc.title)}</h3><table><thead><tr><th>Wire</th><th>From</th><th>To</th><th>Code</th><th>Colour</th><th>mm²</th><th>m</th><th>A</th><th>Circuit</th><th>Notes</th></tr></thead><tbody>${wl.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.from)}</td><td>${esc(r.to)}</td><td>${esc(r.code)}</td><td>${esc(r.colour)}</td><td>${esc(r.gauge)}</td><td>${esc(r.length)}</td><td>${esc(r.current)}</td><td>${esc(r.circuit)}</td><td>${esc(r.notes)}</td></tr>`).join('')}</tbody></table>` : '');
    window.print();
  }

  /* ---------------- Modals ---------------- */
  function showModal(title, html) { $('#modal-title').textContent = title; $('#modal-body').innerHTML = html; $('#modal').hidden = false; }
  function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; }
  function showMessage(title, html) { showModal(title, html + `<div class="row-btns"><button class="btn primary" data-close>OK</button></div>`); }
  $('#modal-x').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });

  PF.onBlockedDownload = (name, data, mime) => {
    if (typeof data === 'string') {
      showModal('Copy your file', `<p class="muted">This preview can't save files directly. Copy the contents below into a file called <b>${esc(name)}</b>, or download Loomwright to save normally.</p><textarea id="dl-text" readonly>${esc(data)}</textarea><div class="row-btns"><button class="btn primary" id="dl-copy">Copy to clipboard</button></div>`);
      $('#dl-copy').onclick = async () => { const ta = $('#dl-text'); try { await navigator.clipboard.writeText(ta.value); toast('Copied'); } catch (e) { ta.focus(); ta.select(); } };
    } else {
      const url = URL.createObjectURL(new Blob([data], { type: mime }));
      showModal('Save your image', `<p class="muted">This preview can't save files directly. Right-click the image (or long-press on a phone) and choose save.</p><img src="${url}" alt="Exported diagram">`);
    }
  };

  function coloursModal() {
    const s = doc.settings.standard;
    const rows = doc.customColours.map((c, i) => `<tr data-i="${i}"><td><input type="color" value="${esc(c.hex)}" data-k="hex" aria-label="Colour"></td><td><input type="text" value="${esc(c.name)}" data-k="name" aria-label="Name"></td><td><input type="text" value="${esc(c.code)}" data-k="code" aria-label="Code" style="font-family:var(--f-mono)"></td><td><button class="btn icon danger" data-del="${i}" aria-label="Remove">✕</button></td></tr>`).join('');
    showModal('Wire colours', `
      <label class="fld"><span>Colour code standard</span><select id="m-std">${Object.values(L.STANDARDS).map((x) => `<option value="${x.id}"${x.id === s ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <p class="muted" style="margin:0">${esc(L.STANDARDS[s].note)} Changing the standard relabels every wire; the colours stay the same.</p>
      <h3 style="margin:6px 0 0;font-size:13px">My colours</h3>
      <p class="muted" style="margin:0">Add any colour your loom uses, with your own name and code. These are saved in this diagram and in your palette for new diagrams.</p>
      <div style="overflow-x:auto"><table class="data colour-table"><thead><tr><th>Colour</th><th>Name</th><th>Code</th><th></th></tr></thead><tbody id="m-rows">${rows || '<tr><td colspan="4" class="muted">No custom colours yet.</td></tr>'}</tbody></table></div>
      <div class="row-btns"><button class="btn" id="m-add">Add colour</button><button class="btn" id="m-import"${userLib.colours.length ? '' : ' disabled'}>Add my saved palette</button></div>
      <h3 style="margin:6px 0 0;font-size:13px">Standard colours</h3>
      <div style="overflow-x:auto"><table class="data"><thead><tr><th>Colour</th><th>Name</th><th>Land Rover</th><th>DIN / IEC</th><th>SAE</th></tr></thead><tbody>${L.COLOURS.map((c) => `<tr><td><span class="swatch" style="background:${c.hex}"></span></td><td>${esc(c.name)}</td><td class="mono">${esc(c.lr)}</td><td class="mono">${esc(c.din)}</td><td class="mono">${esc(c.sae)}</td></tr>`).join('')}</tbody></table></div>
      <div class="row-btns"><button class="btn primary" data-close>Done</button></div>`);
    const before = JSON.stringify(doc);
    const finish = () => {
      if (JSON.stringify(doc) !== before) { hist.push(before); redoStack = []; markDirty(); }
      const merged = clone(userLib.colours || []);
      doc.customColours.forEach((c) => { const i = merged.findIndex((x) => x.id === c.id); if (i >= 0) merged[i] = clone(c); else merged.push(clone(c)); });
      userLib.colours = merged; PF.saveUserLibrary(userLib);
      commit();
    };
    $('#m-std').onchange = (e) => { doc.settings.standard = e.target.value; finish(); coloursModal(); };
    $('#m-add').onclick = () => { doc.customColours.push({ id: L.uid('c_'), custom: true, name: 'Custom colour', code: 'CU' + (doc.customColours.length + 1), hex: '#3a7d5c' }); finish(); coloursModal(); };
    $('#m-import').onclick = () => { (userLib.colours || []).forEach((c) => { if (!doc.customColours.some((x) => x.id === c.id)) doc.customColours.push(clone(c)); }); finish(); coloursModal(); };
    $('#m-rows').addEventListener('input', (e) => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; doc.customColours[+tr.dataset.i][e.target.dataset.k] = e.target.value; render(); });
    $('#m-rows').addEventListener('change', finish);
    $('#m-rows').addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]'); if (!b) return;
      const c = doc.customColours[+b.dataset.del];
      if (doc.wires.some((w) => [w.colour, w.tracer, w.tracer2].includes(c.id))) { toast(`${c.name} is used by wires. Change those wires first.`); return; }
      doc.customColours.splice(+b.dataset.del, 1); finish(); coloursModal();
    });
  }

  function helpModal() {
    const where = PF.kind === 'desktop' ? 'the desktop app' : PF.kind === 'preview' ? 'this preview' : 'your browser';
    showModal('Help and shortcuts', `
      <div class="kbd-list">
        <kbd>Click pin → pin</kbd><span>Draw a wire. Click empty space on the way to add bends.</span>
        <kbd>Double-click wire</kbd><span>Add a bend point. Double-click a bend point to remove it.</span>
        <kbd>Drag empty space</kbd><span>Select several parts</span>
        <kbd>Scroll</kbd><span>Pan. Hold <kbd>Space</kbd> and drag, or drag with the middle button, to pan too.</span>
        <kbd>Ctrl + scroll</kbd><span>Zoom (pinch on a trackpad)</span>
        <kbd>R</kbd> / <kbd>Shift+R</kbd><span>Rotate selection</span>
        <kbd>F</kbd><span>Flip selection</span>
        <kbd>Ctrl+C / X / V / D</kbd><span>Copy, cut, paste, duplicate</span>
        <kbd>Arrow keys</kbd><span>Nudge 10 (Shift: 50)</span>
        <kbd>Delete</kbd><span>Delete selection</span>
        <kbd>Ctrl+Z / Ctrl+Shift+Z</kbd><span>Undo / redo</span>
        <kbd>Ctrl+S / Ctrl+O</kbd><span>Save / open</span>
        <kbd>0</kbd><span>Fit diagram to screen</span>
      </div>
      <p class="muted" style="margin:0">You are running Loomwright ${L.VERSION} in ${where}. Diagrams are saved as <b>.loom</b> files (plain JSON) that the optional Claude add-on can also read and write. Loomwright is free software under the GNU GPL v3.</p>
      <div class="row-btns"><button class="btn" id="h-sample">Load the example diagram</button><button class="btn primary" data-close>Close</button></div>`);
    $('#h-sample').onclick = () => { closeModal(); loadDoc(window.LoomSample(), null); markDirty(); autosave(); };
  }

  async function importLibrary() {
    const r = await PF.openText('.json,application/json');
    if (!r) return;
    try {
      const data = JSON.parse(r.text);
      const parts = (data.parts || (Array.isArray(data) ? data : [])).filter((p) => p && p.id && p.shapes && p.pins);
      let n = 0;
      parts.forEach((p) => { p.custom = true; p.cat = 'My components'; const i = userLib.parts.findIndex((x) => x.id === p.id); if (i >= 0) userLib.parts[i] = p; else userLib.parts.push(p); n++; });
      (data.colours || []).forEach((c) => { if (!userLib.colours.some((x) => x.id === c.id)) userLib.colours.push({ ...c, custom: true }); });
      await PF.saveUserLibrary(userLib); buildLibrary();
      toast(`Imported ${n} component${n === 1 ? '' : 's'}`);
    } catch (e) { showMessage('Could not import', `<p>${esc(e.message)}</p>`); }
  }
  async function exportLibrary() {
    await PF.exportFile('loomwright-components.json', JSON.stringify({ format: 'loomwright-library', version: 1, parts: userLib.parts, colours: userLib.colours }, null, 2), 'application/json');
  }

  /* ---------------- Toolbar ---------------- */
  let newArmed = null;
  async function command(cmd, btn) {
    switch (cmd) {
      case 'new':
        if (dirty && !newArmed) { newArmed = setTimeout(() => { newArmed = null; btn.classList.remove('armed'); btn.textContent = 'New'; }, 3000); btn.classList.add('armed'); btn.textContent = 'Discard changes?'; return; }
        clearTimeout(newArmed); newArmed = null; $('#btn-new').classList.remove('armed'); $('#btn-new').textContent = 'New'; newDoc(); break;
      case 'open': openFile(); break;
      case 'save': save(); break;
      case 'saveas': saveAs(); break;
      case 'export-svg': exportSVG(); break;
      case 'export-png': exportPNG().catch((e) => toast(e.message)); break;
      case 'export-wires': exportWires(); break;
      case 'export-bom': exportBOM(); break;
      case 'export-cable': exportCable(); break;
      case 'print': printDiagram(); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'zoom-in': zoomBy(1.2); break;
      case 'zoom-out': zoomBy(1 / 1.2); break;
      case 'fit': fit(); break;
      case 'builder': window.LoomBuilder.open(null); break;
      case 'colours': coloursModal(); break;
      case 'help': helpModal(); break;
      case 'lib-import': importLibrary(); break;
      case 'lib-export': exportLibrary(); break;
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]');
    const menu = $('#export-menu');
    if (e.target.closest('#export-btn')) { menu.hidden = !menu.hidden; $('#export-btn').setAttribute('aria-expanded', String(!menu.hidden)); return; }
    if (!menu.hidden && !e.target.closest('#export-menu')) { menu.hidden = true; $('#export-btn').setAttribute('aria-expanded', 'false'); }
    if (b) { if (b.closest('#export-menu')) menu.hidden = true; command(b.dataset.cmd, b); }
  });
  $('#doc-title').addEventListener('focus', () => { snapBefore = JSON.stringify(doc); });
  $('#doc-title').addEventListener('input', (e) => { doc.title = e.target.value; updateTitle(); });
  $('#doc-title').addEventListener('change', () => { if (snapBefore && snapBefore !== JSON.stringify(doc)) { hist.push(snapBefore); markDirty(); } autosave(); inspector(); });
  if (!PF.canPrint) $('#btn-print').hidden = true;
  window.addEventListener('beforeunload', (e) => { if (dirty && PF.kind === 'browser') { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('resize', () => renderOverlay());

  /* ---------------- API used by the component builder ---------------- */
  window.LoomEditor = {
    get userLib() { return userLib; },
    get doc() { return doc; },
    async saveComponent(def) {
      def.custom = true; def.cat = 'My components';
      const i = userLib.parts.findIndex((p) => p.id === def.id);
      if (i >= 0) userLib.parts[i] = def; else userLib.parts.push(def);
      await PF.saveUserLibrary(userLib);
      // keep diagrams that already use it up to date
      const j = doc.customParts.findIndex((p) => p.id === def.id);
      if (j >= 0) { pushHistory(); doc.customParts[j] = clone(def); L.pruneWires(doc); }
      buildLibrary(); commit();
    },
    async deleteComponent(id) {
      userLib.parts = userLib.parts.filter((p) => p.id !== id);
      await PF.saveUserLibrary(userLib); buildLibrary();
    },
    place(type) { addPartAt(type); },
    toast,
  };

  /* ---------------- Start ---------------- */
  (async function start() {
    userLib = (await PF.loadUserLibrary()) || { parts: [], colours: [] };
    userLib.parts = (userLib.parts || []).map((p) => ({ ...p, custom: true, cat: 'My components' }));
    userLib.colours = userLib.colours || [];
    let restored = null;
    try { restored = JSON.parse(localStorage.getItem(AUTOSAVE) || 'null'); } catch (e) { restored = null; }
    try { if (restored && restored.doc) { loadDoc(restored.doc, restored.file); if (restored.file && restored.file.name) markClean(); else markDirty(); } }
    catch (e) { restored = null; }
    if (!restored || !restored.doc) { loadDoc(window.LoomSample(), null); markClean(); }
    const initial = await PF.initialFile();
    if (initial) { try { loadDoc(JSON.parse(initial.text), initial); markClean(); } catch (e) { toast('Could not open ' + initial.name); } }
    applyView(); setHint();
  })();
})();
