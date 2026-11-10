/*
 * LoomWright editor: projects made of sheets, each sheet a drawing.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function () {
  'use strict';
  const L = window.Loom, PF = window.Platform;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = L.esc;
  const AUTOSAVE = 'loomwright.autosave.v1';
  const THEME = 'loomwright.theme';

  /* ---------------- State ---------------- */
  let project;                    // the whole .loom file
  let sheetId = null;             // the sheet being edited
  let doc;                        // view of the current sheet (parts/wires of the sheet, shared settings)
  let file = { path: null, name: null, mtime: 0 };
  let dirty = false;
  let sel = { parts: new Set(), wires: new Set() };
  let draft = null;               // wire being drawn: {from, points}
  let drag = null;
  let view = { x: 40, y: 40, k: 1 };
  const views = {};               // pan/zoom per sheet
  let hist = [], redoStack = [];
  let mouse = { x: 0, y: 0 };
  let clipboard = null;
  let spaceDown = false;
  let lastWire = { colour: 'red', tracer: '', gauge: '1.0' };
  let userLib = { parts: [], colours: [] };
  let tab = 'wires';
  let placeCount = 0;
  let pane = 'parts';             // left task pane: 'parts', 'project' or null

  const svg = $('#canvas'), vp = $('#vp'), content = $('#content'), overlay = $('#overlay');

  /* ---------------- Helpers ---------------- */
  const partById = (id) => doc.parts.find((p) => p.id === id);
  const wireById = (id) => doc.wires.find((w) => w.id === id);
  const snap = L.snap;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  function world(e) { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k }; }
  function selCount() { return sel.parts.size + sel.wires.size; }
  function only(kind) { return kind === 'part' ? (sel.parts.size === 1 && !sel.wires.size ? partById([...sel.parts][0]) : null) : (sel.wires.size === 1 && !sel.parts.size ? wireById([...sel.wires][0]) : null); }
  function bindSheet(id) {
    const s = project.sheets.find((x) => x.id === id) || project.sheets[0];
    sheetId = s.id; doc = L.view(project, s);
  }
  const snapshot = () => JSON.stringify({ project, sheetId });

  function pushHistory() { hist.push(snapshot()); if (hist.length > 200) hist.shift(); redoStack = []; markDirty(); }
  function markDirty() { dirty = true; updateTitle(); }
  function markClean() { dirty = false; updateTitle(); }
  function updateTitle() {
    PF.setTitle(`${dirty ? '• ' : ''}${project.title || 'Untitled'}${file.name ? ' — ' + file.name : ''} · LoomWright`);
    $('#mc-project').textContent = `${project.title || 'Untitled'}${file.name ? '  ·  ' + file.name : ''}${dirty ? '  •' : ''}`;
    $('#mc-project').title = dirty ? 'Unsaved changes' : 'Saved';
  }
  function autosave() { try { localStorage.setItem(AUTOSAVE, JSON.stringify({ doc: project, sheetId, file: { path: file.path, name: file.name } })); } catch (e) { /* storage unavailable */ } }

  function toast(msg, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
    t.hidden = false;
    if (action) t.querySelector('button').onclick = () => { t.hidden = true; action.run(); };
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, action ? 9000 : 2600);
  }

  /* Custom parts from the user library are copied into the project when used,
     so a saved project always carries the symbols it needs. */
  function ensureCustomInDoc(type) {
    if (L.LIBRARY[type]) return;
    const fromUser = userLib.parts.find((p) => p.id === type);
    if (!fromUser) return;
    const i = project.customParts.findIndex((p) => p.id === type);
    if (i >= 0) project.customParts[i] = clone(fromUser); else project.customParts.push(clone(fromUser));
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
    const A = '#2f6fde';
    sel.parts.forEach((id) => {
      const p = partById(id); if (!p) return;
      const b = L.partBox(doc, p);
      s += `<rect x="${b.x - 6}" y="${b.y - 6}" width="${b.w + 12}" height="${b.h + 12}" fill="none" stroke="${A}" stroke-width="${1.2 / view.k}" stroke-dasharray="${4 / view.k} ${3 / view.k}" pointer-events="none"/>`;
    });
    const w = only('wire');
    if (w) {
      const pts = L.wirePoints(doc, w) || [];
      const hs = 8 / view.k;
      if (w.points && w.points.length) {
        w.points.forEach((p, i) => { s += `<rect x="${p.x - hs / 2}" y="${p.y - hs / 2}" width="${hs}" height="${hs}" fill="#ffffff" stroke="${A}" stroke-width="${1.5 / view.k}" data-wp="${w.id}|${i}" style="cursor:move"><title>Drag to move. Double-click to remove.</title></rect>`; });
      } else if (pts.length === 4) {
        const mx = pts[1].x, my = (pts[1].y + pts[2].y) / 2;
        s += `<rect x="${mx - hs / 2}" y="${my - hs / 2}" width="${hs}" height="${hs}" fill="#ffffff" stroke="${A}" stroke-width="${1.5 / view.k}" data-mid="${w.id}" style="cursor:ew-resize"><title>Drag to move this run. Double-click the wire to add bend points.</title></rect>`;
      }
    }
    if (draft) {
      const a = L.pinPos(doc, draft.from);
      if (a) {
        const pts = [a, ...draft.points, { x: snap(mouse.x), y: snap(mouse.y) }];
        const col = (L.colourById(doc, lastWire.colour) || {}).hex || '#e07b00';
        const d = `M${pts.map((p) => p.x + ' ' + p.y).join(' L')}`;
        s += `<path d="${d}" fill="none" stroke="#262b28" stroke-width="${L.gaugeWidth(lastWire.gauge) + 1.6}" stroke-dasharray="6 4" pointer-events="none" opacity=".75"/>`;
        s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${L.gaugeWidth(lastWire.gauge)}" stroke-dasharray="6 4" pointer-events="none"/>`;
        s += `<circle cx="${a.x}" cy="${a.y}" r="7" fill="none" stroke="${A}" stroke-width="2" pointer-events="none"/>`;
      }
    }
    if (drag && drag.mode === 'marquee') {
      const r = rectOf(drag.start, drag.cur);
      s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="rgba(47,111,222,.08)" stroke="${A}" stroke-width="${1 / view.k}" pointer-events="none"/>`;
    }
    overlay.innerHTML = s;
  }
  function rectOf(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }

  function refreshAll() { render(); inspector(); tables(); sheetTabs(); projectPane(); status(); }
  function commit() { autosave(); refreshAll(); }

  /* ---------------- Status bar ---------------- */
  function setHint() {
    let t;
    if (draft) t = 'Click a pin to finish the wire. Click empty space to add a bend. Esc cancels.';
    else if (only('wire')) t = 'Drag the handle to move the wire. Double-click the wire to add a bend. Del deletes.';
    else if (sel.parts.size) t = 'R rotate, F flip, Ctrl+D duplicate, Del delete, arrow keys nudge.';
    else t = 'Drag parts in from the library. Click a pin, then another pin, to draw a wire. Ctrl+scroll zooms.';
    $('#st-hint').textContent = t;
  }
  function status() {
    const n = project.sheets.indexOf(doc.sheet) + 1;
    $('#st-sheet').textContent = `Sheet ${n} of ${project.sheets.length}`;
    $('#st-count').textContent = `${plural(doc.parts.length, 'part')}, ${plural(doc.wires.length, 'wire')}`;
    const issues = L.validate(project).filter((c) => c.level !== 'info').length;
    const st = $('#st-check');
    st.textContent = issues ? `${plural(issues, 'check')} to review` : 'Checks passed';
    st.style.setProperty('--stc', issues ? 'var(--warn)' : 'var(--ok)');
    st.title = 'Show design checks';
    $('#st-mode').textContent = `${PF.kind === 'desktop' ? 'Desktop' : PF.kind === 'preview' ? 'Preview' : 'Browser'} · ${L.VERSION}`;
  }
  $('#st-check').addEventListener('click', () => showTab('checks'));

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

  /* ---------------- Sheets ---------------- */
  function goSheet(id, keepSel) {
    if (id === sheetId) return;
    views[sheetId] = { ...view };
    bindSheet(id);
    draft = null; svg.classList.remove('wiring');
    if (!keepSel) sel = { parts: new Set(), wires: new Set() };
    refreshAll(); setHint(); autosave();
    if (views[sheetId]) { view = { ...views[sheetId] }; applyView(); renderOverlay(); } else requestAnimationFrame(fit);
  }
  function addSheet(copyOf) {
    pushHistory();
    const s = L.newSheet(copyOf ? copyOf.name + ' (copy)' : 'Sheet ' + (project.sheets.length + 1));
    if (copyOf) {
      const map = {};
      s.parts = copyOf.parts.map((p) => { const q = clone(p); q.id = L.uid('p'); map[p.id] = q.id; return q; });
      s.wires = copyOf.wires.map((w) => { const q = clone(w); q.id = L.uid('w'); q.from.part = map[w.from.part]; q.to.part = map[w.to.part]; return q; });
      project.sheets.splice(project.sheets.indexOf(copyOf) + 1, 0, s);
      // the copy gets new wire numbers so the project wire list stays unique
      const v = L.view(project, s);
      s.wires.forEach((w) => { w.name = ''; });
      s.wires.forEach((w) => { w.name = L.nextWireName(v); });
    } else project.sheets.push(s);
    goSheet(s.id); commit();
    if (!copyOf) requestAnimationFrame(() => renameSheetInline(s.id));
  }
  function deleteSheet(id) {
    if (project.sheets.length < 2) { toast('A project needs at least one sheet.'); return; }
    const s = project.sheets.find((x) => x.id === id);
    pushHistory();
    const i = project.sheets.indexOf(s);
    project.sheets.splice(i, 1);
    if (sheetId === id) goSheet(project.sheets[Math.max(0, i - 1)].id);
    commit(); toast(`Deleted ${s.name}`, { label: 'Undo', run: undo });
  }
  function moveSheet(id, dir) {
    const i = project.sheets.findIndex((x) => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= project.sheets.length) return;
    pushHistory();
    const [s] = project.sheets.splice(i, 1); project.sheets.splice(j, 0, s);
    commit();
  }
  function renameSheet(id, name) {
    const s = project.sheets.find((x) => x.id === id);
    name = String(name || '').trim();
    if (!s || !name || s.name === name) return;
    pushHistory(); s.name = name; commit();
  }
  function sheetTabs() {
    $('#sheet-tabs').innerHTML = project.sheets.map((s, i) => `<button class="stab${s.id === sheetId ? ' on' : ''}" role="tab" aria-selected="${s.id === sheetId}" data-sheet="${s.id}" title="${esc(s.name)}. Double-click to rename."><b>${i + 1}</b><span>${esc(s.name)}</span></button>`).join('');
  }
  function renameSheetInline(id) {
    const b = $(`.stab[data-sheet="${id}"]`); if (!b) return;
    const s = project.sheets.find((x) => x.id === id);
    const sp = b.querySelector('span');
    sp.innerHTML = `<input value="${esc(s.name)}" aria-label="Sheet name">`;
    const inp = sp.querySelector('input'); inp.focus(); inp.select();
    let done = false;
    const finish = (ok) => { if (done) return; done = true; if (ok) renameSheet(id, inp.value); sheetTabs(); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('click', (e) => e.stopPropagation());
  }
  $('#sheet-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-sheet]'); if (b && !e.target.closest('input')) goSheet(b.dataset.sheet); });
  $('#sheet-tabs').addEventListener('dblclick', (e) => { const b = e.target.closest('[data-sheet]'); if (b) renameSheetInline(b.dataset.sheet); });

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
    const w = L.addWire(doc, draft.from, end, { colour: lastWire.colour, tracer: lastWire.tracer, gauge: lastWire.gauge, harness: lastWire.harness || '' });
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
    const custom = project.customParts.filter((c) => parts.some((p) => p.type === c.id));
    clipboard = clone({ parts, wires, custom });
    try { localStorage.setItem('loomwright.clipboard', JSON.stringify(clipboard)); } catch (e) { /* ignore */ }
    return true;
  }
  function paste(offset = 40) {
    let cb = clipboard;
    if (!cb) { try { cb = JSON.parse(localStorage.getItem('loomwright.clipboard') || 'null'); } catch (e) { cb = null; } }
    if (!cb || !cb.parts.length) return;
    pushHistory();
    (cb.custom || []).forEach((c) => { if (!project.customParts.some((x) => x.id === c.id)) project.customParts.push(clone(c)); });
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
  function restore(snap_) { const s = JSON.parse(snap_); project = s.project; bindSheet(s.sheetId); }
  function undo() { if (!hist.length) return; redoStack.push(snapshot()); restore(hist.pop()); afterSwap(); }
  function redo() { if (!redoStack.length) return; hist.push(snapshot()); restore(redoStack.pop()); afterSwap(); }
  function afterSwap() {
    ['parts', 'wires'].forEach((k) => sel[k].forEach((id) => { if (!(k === 'parts' ? partById(id) : wireById(id))) sel[k].delete(id); }));
    draft = null; markDirty(); buildLibrary(); commit(); setHint();
  }

  /* ---------------- Pointer input ---------------- */
  svg.addEventListener('pointerdown', (e) => {
    svg.focus({ preventScroll: true });
    closeMenus();
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
  const stXY = $('#st-xy');
  svg.addEventListener('pointermove', (e) => {
    const w = world(e); mouse = w;
    stXY.textContent = `X ${snap(w.x)}  Y ${snap(w.y)}`;
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
  svg.addEventListener('pointerup', () => {
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
    if (!$('#palette').hidden) return; // the palette handles its own keys
    if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
    const tag = (e.target.tagName || '').toUpperCase();
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'k') { e.preventDefault(); openPalette(); return; }
    if (mod && k === 's') { e.preventDefault(); e.shiftKey ? saveAs() : save(); return; }
    if (mod && k === 'o') { e.preventDefault(); openFile(); return; }
    if (mod && k === 'p') { e.preventDefault(); printDiagram(); return; }
    if (e.key === 'Escape' && $('.menu.open')) { closeMenus(); return; }
    if (typing) return;
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && k === 'y') { e.preventDefault(); redo(); }
    else if (mod && k === 'c') { if (copySelection()) toast('Copied'); }
    else if (mod && k === 'x') { if (copySelection()) deleteSelection(); }
    else if (mod && k === 'v') { e.preventDefault(); paste(); }
    else if (mod && k === 'd') { e.preventDefault(); if (copySelection()) paste(20); }
    else if (mod && k === 'a') { e.preventDefault(); select(doc.parts.map((p) => p.id), doc.wires.map((w) => w.id)); }
    else if (e.key === 'PageDown' || (mod && e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); stepSheet(1); }
    else if (e.key === 'PageUp' || (mod && e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); stepSheet(-1); }
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
  function stepSheet(d) { const i = project.sheets.findIndex((s) => s.id === sheetId); const j = (i + d + project.sheets.length) % project.sheets.length; goSheet(project.sheets[j].id); }

  /* ---------------- Library pane ---------------- */
  function iconSVG(type) {
    const d = defOf(type);
    if (!d) return '';
    const fake = { customParts: d.custom ? [d] : [] };
    const r = L.resolved(fake, { type, props: {} });
    const pad = 8;
    return `<svg viewBox="${-pad} ${-pad} ${r.w + pad * 2} ${r.h + pad * 2}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${L.symbolSVG(r)}</svg>`;
  }
  function libraryItems() { return Object.values(L.LIBRARY).concat(userLib.parts, project.customParts.filter((c) => !userLib.parts.some((u) => u.id === c.id))); }
  function buildLibrary() {
    const q = $('#lib-search').value.trim().toLowerCase();
    const items = libraryItems();
    const match = (d) => !q || (d.name + ' ' + d.cat + ' ' + (d.prefix || '') + ' ' + (d.tags || '')).toLowerCase().includes(q);
    const cats = ['My components', ...L.CATEGORIES];
    const openState = {};
    $$('#lib-list details').forEach((d) => { openState[d.dataset.cat] = d.open; });
    let html = '';
    cats.forEach((cat) => {
      const list = items.filter((d) => (d.custom ? 'My components' : d.cat) === cat && match(d));
      if (!list.length && !(cat === 'My components' && !q)) return;
      const open = q ? true : openState[cat] !== undefined ? openState[cat] : true;
      html += `<details class="lib-cat" data-cat="${esc(cat)}"${open ? ' open' : ''}><summary>${esc(cat)} <span>${list.length}</span></summary>`;
      if (cat === 'My components' && !list.length) html += `<p class="lib-empty">Components you draw in the builder, or that Claude makes from a picture, appear here.</p>`;
      html += '<div class="lib-grid">' + list.map((d) => `<button class="lib-item" draggable="true" data-type="${esc(d.id)}" title="${esc(d.name)}">${iconSVG(d.id)}<span>${esc(d.name)}</span>${d.custom ? `<span class="edit" data-edit="${esc(d.id)}" title="Edit component">Edit</span>` : ''}</button>`).join('') + '</div>';
      if (cat === 'My components') html += `<div class="lib-actions"><button class="btn" data-cmd="builder">New</button><button class="btn" data-cmd="lib-import">Import</button><button class="btn" data-cmd="lib-export"${userLib.parts.length ? '' : ' disabled'}>Export</button></div>`;
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

  /* ---------------- Left pane: Parts / Project ---------------- */
  function showPane(which) {
    pane = which;
    $('#task').hidden = !which;
    if (which) {
      $$('.ptab').forEach((b) => b.classList.toggle('on', b.dataset.pane === which));
      $('#pane-parts').hidden = which !== 'parts';
      $('#pane-project').hidden = which !== 'project';
      if (which === 'project') projectPane();
    }
    $('#rb-parts').classList.toggle('on', which === 'parts');
    $('#rb-project').classList.toggle('on', which === 'project');
    renderOverlay();
  }
  $$('.ptab').forEach((b) => b.addEventListener('click', () => showPane(b.dataset.pane)));

  function projectPane() {
    const el = $('#pane-project');
    if (el.hidden) return;
    if (el.contains(document.activeElement) && document.activeElement.matches('input,textarea')) return; // don't rebuild under the cursor
    const m = project.meta;
    const counts = {};
    project.sheets.forEach((s) => s.wires.forEach((w) => { if (w.harness) counts[w.harness] = (counts[w.harness] || 0) + 1; }));
    const fl = (label, key, val, extra = '') => `<label class="fld"><span>${esc(label)}</span><input data-pf="${key}" value="${esc(val == null ? '' : val)}" ${extra}></label>`;
    el.innerHTML = `<div class="proj">
      <div class="sec"><h3>Project</h3>
        ${fl('Title', 'title', project.title)}
        ${fl('Vehicle', 'meta:project', m.project, 'placeholder="e.g. Defender 110 Td5"')}
        ${fl('Drawn by', 'meta:drawnBy', m.drawnBy)}
        <div class="two">${fl('Revision', 'meta:revision', m.revision)}${fl('Date', 'meta:date', m.date, 'type="date"')}</div>
      </div>
      <div class="sec"><h3>Sheets</h3>
        <div class="list">${project.sheets.map((s, i) => `<div class="list-row${s.id === sheetId ? ' on' : ''}" data-row-sheet="${s.id}">
          <span class="num">${i + 1}</span><input data-sheet-name="${s.id}" value="${esc(s.name)}" aria-label="Sheet ${i + 1} name">
          <span class="meta" title="${plural(s.parts.length, 'part')}, ${plural(s.wires.length, 'wire')}">${s.wires.length}w</span>
          <button class="iconbtn" data-sheet-act="up" title="Move up" aria-label="Move up"${i ? '' : ' disabled'}><svg class="i"><use href="#i-up"/></svg></button>
          <button class="iconbtn" data-sheet-act="down" title="Move down" aria-label="Move down"${i < project.sheets.length - 1 ? '' : ' disabled'}><svg class="i"><use href="#i-down"/></svg></button>
          <button class="iconbtn" data-sheet-act="del" title="Delete sheet" aria-label="Delete sheet"${project.sheets.length > 1 ? '' : ' disabled'}><svg class="i"><use href="#i-x"/></svg></button>
        </div>`).join('')}</div>
        <div class="row-btns"><button class="btn" data-cmd="sheet-new">Add sheet</button><button class="btn" data-cmd="sheet-dup">Duplicate this sheet</button></div>
      </div>
      <div class="sec"><h3>Harnesses</h3>
        <p class="muted" style="margin:0">Group wires by the loom they run in. A colour can be reused in different harnesses; the Colour usage list shows every use.</p>
        <div class="list">${project.harnesses.length ? project.harnesses.map((h, i) => `<div class="list-row" data-row-harness="${i}"><input data-harness-name="${i}" value="${esc(h)}" aria-label="Harness name"><span class="meta">${counts[h] || 0}w</span><button class="iconbtn" data-harness-del="${i}" title="Remove harness" aria-label="Remove harness"><svg class="i"><use href="#i-x"/></svg></button></div>`).join('') : '<div class="list-row"><span class="muted">No harnesses yet.</span></div>'}</div>
        <div class="row-btns"><button class="btn" data-proj-act="harness-add">Add harness</button><button class="btn" data-cmd="usage">Colour usage</button></div>
      </div>
      <div class="sec"><h3>Totals</h3>
        <div class="kv"><span>Sheets</span><b>${project.sheets.length}</b><span>Parts</span><b>${project.sheets.reduce((a, s) => a + s.parts.length, 0)}</b><span>Wires</span><b>${project.sheets.reduce((a, s) => a + s.wires.length, 0)}</b><span>Cable</span><b>${project.sheets.reduce((a, s) => a + s.wires.reduce((b, w) => b + (parseFloat(w.length) || 0), 0), 0).toFixed(1)} m</b></div>
      </div>
    </div>`;
  }
  {
    const pp = $('#pane-project');
    let before = null;
    pp.addEventListener('focusin', (e) => { if (e.target.matches('input')) before = snapshot(); });
    pp.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.pf) {
        const k = t.dataset.pf;
        if (k === 'title') { project.title = t.value; updateTitle(); } else project.meta[k.slice(5)] = t.value;
      }
    });
    pp.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.sheetName) { const s = project.sheets.find((x) => x.id === t.dataset.sheetName); const v = t.value.trim(); if (s && v) s.name = v; }
      if (t.dataset.harnessName != null) {
        const i = +t.dataset.harnessName, old = project.harnesses[i], v = t.value.trim();
        if (v && v !== old) {
          project.harnesses[i] = v;
          project.sheets.forEach((s) => s.wires.forEach((w) => { if (w.harness === old) w.harness = v; }));
        }
      }
      if (before && before !== snapshot()) { hist.push(before); redoStack = []; markDirty(); }
      before = snapshot(); t.blur();
      commit();
    });
    pp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
    pp.addEventListener('click', (e) => {
      const sa = e.target.closest('[data-sheet-act]');
      if (sa) { const id = sa.closest('[data-row-sheet]').dataset.rowSheet; const a = sa.dataset.sheetAct; if (a === 'up') moveSheet(id, -1); else if (a === 'down') moveSheet(id, 1); else deleteSheet(id); return; }
      const hd = e.target.closest('[data-harness-del]');
      if (hd) {
        const i = +hd.dataset.harnessDel, h = project.harnesses[i];
        pushHistory(); project.harnesses.splice(i, 1);
        project.sheets.forEach((s) => s.wires.forEach((w) => { if (w.harness === h) w.harness = ''; }));
        commit(); return;
      }
      if (e.target.closest('[data-proj-act="harness-add"]')) {
        pushHistory();
        let n = project.harnesses.length + 1; while (project.harnesses.includes('Harness ' + n)) n++;
        project.harnesses.push('Harness ' + n); commit();
        const inp = $(`#pane-project [data-harness-name="${project.harnesses.length - 1}"]`); if (inp) { inp.focus(); inp.select(); }
        return;
      }
      const row = e.target.closest('[data-row-sheet]');
      if (row && !e.target.closest('input,button')) goSheet(row.dataset.rowSheet);
    });
  }

  /* ---------------- Inspector ---------------- */
  const fld = (label, field, value, type = 'text', extra = '') => `<label class="fld"><span>${esc(label)}</span><input id="f-${field.replace(/[^a-z0-9]/gi, '-')}" type="${type}" data-field="${field}" value="${esc(value == null ? '' : value)}" ${extra}></label>`;
  function stockSet() { const s = project.settings; return s.stockOnly && s.stock && s.stock.length ? new Set(s.stock) : null; }
  function colourOptions(selected, allowNone) {
    const std = project.settings.standard, stock = stockSet();
    const keep = (c) => !stock || stock.has(c.id) || c.id === selected;
    const opt = (c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(L.colourCode(doc, c))} · ${esc(c.name)}</option>`;
    const mine = project.customColours.filter(keep), stdList = std === 'custom' && !stock ? [] : L.COLOURS.filter(keep);
    return (allowNone ? `<option value="">None</option>` : '') +
      (mine.length ? `<optgroup label="My colours">${mine.map(opt).join('')}</optgroup>` : '') +
      (stdList.length ? `<optgroup label="${esc(stock ? 'Colours I stock' : L.STANDARDS[std === 'custom' ? 'lr' : std].name)}">${stdList.map(opt).join('')}</optgroup>` : '');
  }
  function colourField(label, field, value, allowNone) {
    const c = L.colourById(doc, value);
    return `<label class="fld"><span>${esc(label)}</span><span class="colour-row"><span class="swatch" style="background:${c ? c.hex : 'transparent'}"></span><select id="f-${field}" data-field="${field}">${colourOptions(value, allowNone)}</select></span></label>`;
  }
  function gaugeOptions(v) {
    const known = L.GAUGES.some((g) => g.mm2 === String(v));
    return (known || v === '' ? '' : `<option value="${esc(v)}" selected>${esc(v)} mm²</option>`) + L.GAUGES.map((g) => `<option value="${g.mm2}"${g.mm2 === String(v) ? ' selected' : ''}>${g.mm2} mm² (≈${g.awg} AWG)</option>`).join('');
  }
  const harnessList = () => `<datalist id="dl-harness">${project.harnesses.map((h) => `<option value="${esc(h)}">`).join('')}</datalist>`;
  const circuitList = () => { const set = new Set(); project.sheets.forEach((s) => s.wires.forEach((w) => { if (w.circuit) set.add(w.circuit); })); return `<datalist id="dl-circuit">${[...set].sort().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`; };

  function inspector() {
    const el = $('#inspector');
    if (el.contains(document.activeElement) && document.activeElement.matches('input[type=text],input:not([type]),textarea') && !inspector.force) return;
    const p = only('part'), w = only('wire');
    if (p) el.innerHTML = partPanel(p);
    else if (w) el.innerHTML = wirePanel(w);
    else if (selCount()) el.innerHTML = multiPanel();
    else el.innerHTML = sheetPanel();
  }
  function partPanel(p) {
    const r = L.resolved(doc, p), d = r.def || { name: p.type, props: [], cat: 'Missing' };
    let h = `<div><span class="kicker">${esc(d.custom ? 'My components' : d.cat)}</span><h2>${esc(d.name)}</h2></div><div class="sec"><h3>Properties</h3>`;
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
      h += `<div class="sec"><h3>Pins</h3><ul class="pins">` + r.pins.map((pn) => {
        const ws = doc.wires.filter((w) => (w.from.part === p.id && w.from.pin === pn.id) || (w.to.part === p.id && w.to.pin === pn.id));
        return `<li><b>${esc(pn.id)}</b><span class="muted">${pn.n && pn.n !== pn.id ? esc(pn.n) : ''}</span>${ws.map((w) => { const other = w.from.part === p.id && w.from.pin === pn.id ? w.to : w.from; const c = L.colourById(doc, w.colour); return `<button class="chip" data-goto="${w.id}"><span class="swatch" style="width:12px;height:8px;background:${c ? c.hex : '#888'}"></span> ${esc(w.name)} → ${esc(L.pinName(doc, other))}</button>`; }).join('') || '<span class="muted">free</span>'}</li>`;
      }).join('') + '</ul></div>';
    }
    return h;
  }
  function wirePanel(w) {
    const vd = L.voltageDrop(w), sys = parseFloat(project.settings.volts) || 12;
    // other jobs this colour combination already does in the project
    const code = L.wireCode(doc, w);
    const others = L.colourUsage(project).find((e) => e.code === code);
    const otherUses = others ? others.uses.filter((u) => u.circuit !== (w.circuit || '') || u.harness !== (w.harness || '')) : [];
    const clash = otherUses.filter((u) => u.harness && u.harness === w.harness && u.circuit !== (w.circuit || ''));
    let h = `<div><span class="kicker">Wire</span><h2>${esc(w.name)} <span class="muted mono" style="font-size:12px;font-weight:500">${esc(code)}</span></h2><p class="sub">${esc(L.pinName(doc, w.from))} → ${esc(L.pinName(doc, w.to))}</p></div>`;
    h += `<div class="sec"><h3>Identity</h3>${fld('Wire number', 'name', w.name)}${fld('Circuit', 'circuit', w.circuit, 'text', 'list="dl-circuit" placeholder="e.g. Spot lamps"')}${fld('Harness', 'harness', w.harness, 'text', 'list="dl-harness" placeholder="e.g. Engine bay"')}${harnessList()}${circuitList()}</div>`;
    h += `<div class="sec"><h3>Colour</h3>${colourField('Main', 'colour', w.colour, false)}${colourField('Tracer', 'tracer', w.tracer, true)}${colourField('Second tracer', 'tracer2', w.tracer2 || '', true)}`;
    if (otherUses.length) h += `<div class="callout ${clash.length ? 'warn' : ''}" style="${clash.length ? '' : 'background:var(--raise);border-color:var(--line)'}"><b>${esc(code)}</b> is also used for ${otherUses.map((u) => esc([u.circuit || 'no circuit', u.harness].filter(Boolean).join(' in '))).join('; ')}.${clash.length ? ' Same harness, different circuit: make sure they can be told apart, for example with wire numbers or sleeves.' : ''}</div>`;
    h += `</div><div class="sec"><h3>Cable</h3><label class="fld"><span>Size</span><select id="f-gauge" data-field="gauge">${gaugeOptions(w.gauge)}</select></label>`;
    h += `${fld('Length (m)', 'length', w.length, 'number', 'min="0" step="0.1"')}${fld('Current (A)', 'current', w.current, 'number', 'min="0" step="0.5"')}`;
    if (vd != null) h += `<div class="callout ${vd > sys * 0.03 ? 'warn' : 'ok'}">Voltage drop ${vd.toFixed(2)} V (${((vd / sys) * 100).toFixed(1)}% of ${sys} V) one way at ${esc(w.current)} A.${vd > sys * 0.03 ? ' Over 3%: consider a heavier size.' : ''}</div>`;
    h += `<label class="fld"><span>Routing</span><select id="f-route" data-field="route"><option value="auto"${w.route !== 'straight' ? ' selected' : ''}>Square corners</option><option value="straight"${w.route === 'straight' ? ' selected' : ''}>Straight lines</option></select></label>`;
    h += `<label class="fld"><span>Notes</span><textarea id="f-notes" data-field="notes" placeholder="e.g. run inside chassis rail">${esc(w.notes)}</textarea></label></div>`;
    h += `<div class="row-btns"><button class="btn" data-act="swap">Swap ends</button><button class="btn" data-act="clear-bends">Clear bends</button><button class="btn danger" data-act="delete">Delete</button></div>`;
    return h;
  }
  function multiPanel() {
    return `<div><span class="kicker">Selection</span><h2>${plural(sel.parts.size, 'part')}, ${plural(sel.wires.size, 'wire')}</h2></div>
      <div class="row-btns"><button class="btn" data-act="rotate">Rotate</button><button class="btn" data-act="dup">Duplicate</button><button class="btn danger" data-act="delete">Delete</button></div>
      ${sel.wires.size ? `<div class="sec"><h3>Set on all selected wires</h3><label class="fld"><span>Main colour</span><select id="f-all-colour" data-field="all:colour"><option value="" selected>Keep as is</option>${colourOptions('', false)}</select></label><label class="fld"><span>Size</span><select id="f-all-gauge" data-field="all:gauge"><option value="" selected>Keep as is</option>${gaugeOptions('')}</select></label>${fld('Circuit', 'all:circuit', '', 'text', 'list="dl-circuit" placeholder="Keep as is"')}${fld('Harness', 'all:harness', '', 'text', 'list="dl-harness" placeholder="Keep as is"')}${harnessList()}${circuitList()}</div>` : ''}`;
  }
  function sheetPanel() {
    const s = project.settings, n = project.sheets.indexOf(doc.sheet) + 1;
    const metres = doc.wires.reduce((a, w) => a + (parseFloat(w.length) || 0), 0);
    const checks = L.validate(doc).filter((c) => c.level !== 'info');
    return `<div><span class="kicker">Sheet ${n} of ${project.sheets.length}</span><h2>${esc(doc.sheet.name)}</h2></div>
      <div class="sec"><h3>Sheet</h3>${fld('Name', 'sheet:name', doc.sheet.name)}
        <div class="kv"><span>Parts</span><b>${doc.parts.length}</b><span>Wires</span><b>${doc.wires.length}</b><span>Cable on this sheet</span><b>${metres.toFixed(1)} m</b></div>
        ${checks.length ? `<button class="callout warn" data-act="show-checks">${plural(checks.length, 'design check')} to review on this sheet</button>` : ''}
      </div>
      <div class="sec"><h3>Drawing</h3>
        <label class="fld"><span>System voltage</span><select id="f-volts" data-field="settings:volts">${[12, 24, 48].map((v) => `<option value="${v}"${(parseFloat(s.volts) || 12) === v ? ' selected' : ''}>${v} V</option>`).join('')}</select></label>
        <label class="fld"><span>Colour codes</span><select id="f-std" data-field="settings:standard">${Object.values(L.STANDARDS).map((x) => `<option value="${x.id}"${x.id === s.standard ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label class="fld"><span>Wire labels</span><select id="f-labels" data-field="settings:labels"><option value="full"${s.labels === 'full' ? ' selected' : ''}>Number, colour, size</option><option value="code"${s.labels === 'code' ? ' selected' : ''}>Colour code only</option><option value="none"${s.labels === 'none' ? ' selected' : ''}>None</option></select></label>
        <label class="fld check"><input type="checkbox" id="f-tb" data-field="settings:titleBlock"${s.titleBlock !== false ? ' checked' : ''}><span>Title block on exports</span></label>
        <label class="fld check"><input type="checkbox" id="f-key" data-field="settings:colourKey"${s.colourKey !== false ? ' checked' : ''}><span>Colour key on exports</span></label>
        <label class="fld check"><input type="checkbox" id="f-stock" data-field="settings:stockOnly"${s.stockOnly ? ' checked' : ''}${s.stock && s.stock.length ? '' : ' disabled'}><span>Only offer colours I stock${s.stock && s.stock.length ? ` (${s.stock.length})` : ''}</span></label>
        <div class="row-btns"><button class="btn" data-cmd="colours">Wire colours…</button><button class="btn" data-cmd="pane-project">Project details</button></div>
      </div>
      <div class="sec"><h3>Getting started</h3><ul class="tips"><li>Drag a component from Parts, or click it to drop it in the middle.</li><li>Click a pin, then another pin, to wire them.</li><li>Select a wire to set colour, size, circuit and harness.</li><li>Use off-sheet references to carry a circuit to another sheet.</li></ul></div>`;
  }

  let snapBefore = null;
  const insp = $('#inspector');
  insp.addEventListener('focusin', (e) => { if (e.target.matches('[data-field]')) snapBefore = snapshot(); });
  insp.addEventListener('input', (e) => { if (e.target.matches('[data-field]') && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') applyField(e.target, true); });
  insp.addEventListener('change', (e) => {
    if (!e.target.matches('[data-field]')) return;
    if (snapBefore == null) snapBefore = snapshot();
    applyField(e.target, false);
    const now = snapshot();
    if (snapBefore !== now) { hist.push(snapBefore); redoStack = []; markDirty(); }
    snapBefore = now;
    autosave(); tables(); status(); sheetTabs(); projectPane();
    if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || /^prop:|^all:|^harness$|^circuit$/.test(e.target.dataset.field)) { inspector.force = true; inspector(); inspector.force = false; }
  });
  insp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  function addHarness(name) { name = String(name || '').trim(); if (name && !project.harnesses.includes(name)) project.harnesses.push(name); }
  function applyField(el, live) {
    const f = el.dataset.field, v = el.type === 'checkbox' ? el.checked : el.value;
    if (f.startsWith('settings:')) project.settings[f.slice(9)] = v;
    else if (f === 'sheet:name') { if (!live && v.trim()) doc.sheet.name = v.trim(); }
    else if (f.startsWith('all:')) {
      if (live || v === '') return;
      const k = f.slice(4); sel.wires.forEach((id) => { wireById(id)[k] = v; });
      if (k === 'harness') addHarness(v);
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
      w[f] = f === 'harness' || f === 'circuit' ? (live ? v : v.trim()) : v;
      if (f === 'tracer2' && !v) delete w.tracer2;
      if (f === 'harness' && !live) { addHarness(v); lastWire.harness = w.harness; }
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

  /* ---------------- Lists ---------------- */
  const allScope = () => $('#scope-all').checked;
  function swatchHTML(wd, w) {
    const m = L.colourById(wd, w.colour), t = L.colourById(wd, w.tracer);
    const bg = t ? `repeating-linear-gradient(90deg, ${m ? m.hex : '#888'} 0 6px, ${t.hex} 6px 9px)` : (m ? m.hex : '#888');
    return `<span class="swatch" style="background:${bg}"></span>`;
  }
  const sheetNo = (id) => project.sheets.findIndex((s) => s.id === id) + 1;
  const sheetNoByName = (n) => project.sheets.findIndex((s) => s.name === n) + 1;
  function findWireAnywhere(id) { for (const s of project.sheets) { const w = s.wires.find((x) => x.id === id); if (w) return { sheet: s, wire: w }; } return null; }
  function tables() {
    const wrap = $('#table-wrap');
    const scope = allScope() ? project : doc, many = allScope() && project.sheets.length > 1;
    const wl = L.wireList(scope), checks = L.validate(project), bomRows = L.bom(scope);
    const issues = checks.filter((c) => c.level !== 'info').length;
    $('#c-wires').textContent = wl.length;
    $('#c-bom').textContent = bomRows.reduce((a, r) => a + r.qty, 0);
    const cc = $('#c-checks'); cc.textContent = issues || ''; cc.className = 'count' + (issues ? ' warn' : '');
    const sheetTh = many ? '<th>Sheet</th>' : '';
    let h = '';
    if (tab === 'wires') {
      h = wl.length ? `<table class="data"><thead><tr>${sheetTh}<th>Wire</th><th>From</th><th>To</th><th>Colour</th><th>Code</th><th>Size</th><th>AWG</th><th>Length m</th><th>Current A</th><th>Drop V</th><th>Circuit</th><th>Harness</th><th>Notes</th></tr></thead><tbody>${wl.map((r) => { const f = findWireAnywhere(r.id); const wv = L.view(project, f.sheet); return `<tr class="click${sel.wires.has(r.id) ? ' sel' : ''}" data-wire="${r.id}" data-sheet="${r.sheetId}">${many ? `<td class="mono" title="${esc(r.sheet)}">${sheetNo(r.sheetId)}</td>` : ''}<td class="mono">${esc(r.name)}</td><td class="mono">${esc(r.from)}</td><td class="mono">${esc(r.to)}</td><td>${swatchHTML(wv, f.wire)} ${esc(r.colour)}</td><td class="mono">${esc(r.code)}</td><td class="mono">${esc(r.gauge)} mm²</td><td class="mono">${esc(r.awg)}</td><td class="mono">${esc(r.length)}</td><td class="mono">${esc(r.current)}</td><td class="mono">${esc(r.drop)}</td><td>${esc(r.circuit)}</td><td>${esc(r.harness)}</td><td>${esc(r.notes)}</td></tr>`; }).join('')}</tbody></table>` : '<p class="empty">No wires yet. Click a pin, then another pin, to draw one.</p>';
    } else if (tab === 'bom') {
      h = bomRows.length ? `<table class="data"><thead><tr><th>Qty</th><th>Component</th><th>Spec</th><th>References</th></tr></thead><tbody>${bomRows.map((r) => `<tr><td class="mono">${r.qty}</td><td>${esc(r.name)}</td><td class="mono">${esc(r.spec)}</td><td class="mono">${esc(r.refs.join(', '))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No components yet.</p>';
    } else if (tab === 'cable') {
      const rows = L.cableTotals(scope);
      h = rows.length ? `<table class="data"><thead><tr><th>Size</th><th>Code</th><th>Colour</th><th>Wires</th><th>Total m</th><th>Buy (+15%)</th><th>Missing lengths</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="mono">${esc(r.gauge)} mm²</td><td class="mono">${esc(r.code)}</td><td>${esc(r.colour)}</td><td class="mono">${r.wires}</td><td class="mono">${r.metres.toFixed(1)}</td><td class="mono">${(r.metres * 1.15).toFixed(1)}</td><td class="mono">${r.unknown || ''}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Add wires with lengths to see how much cable to buy.</p>';
    } else if (tab === 'usage') {
      const rows = L.colourUsage(scope);
      h = rows.length ? `<table class="data"><thead><tr><th>Colour</th><th>Code</th><th>Wires</th><th>Used for</th><th>Harness</th>${many ? '<th>Sheets</th>' : ''}<th>Wire numbers</th><th></th></tr></thead><tbody>${rows.map((e) => {
        const byHarness = {}; e.uses.forEach((u) => { (byHarness[u.harness] = byHarness[u.harness] || new Set()).add(u.circuit); });
        const f = findWireAnywhere(e.sample.id), wv = f ? L.view(project, f.sheet) : doc;
        return e.uses.map((u, i) => {
          const clash = u.harness && byHarness[u.harness].size > 1;
          return `<tr class="${i ? '' : 'group'}">${i ? '<td></td><td></td><td></td>' : `<td>${swatchHTML(wv, e.sample)} ${esc(e.colour)}</td><td class="mono">${esc(e.code)}</td><td class="mono">${e.wires}</td>`}<td>${esc(u.circuit || 'No circuit')}</td><td>${esc(u.harness || '')}</td>${many ? `<td class="mono" title="${esc(u.sheets.join(', '))}">${esc(u.sheets.map(sheetNoByName).join(', '))}</td>` : ''}<td class="mono wrap">${esc(u.wires.join(', '))}</td><td>${clash ? '<span class="lvl warn" title="Same colour for different circuits in one harness">same harness</span>' : e.uses.length > 1 && !i ? '<span class="lvl info">reused</span>' : ''}</td></tr>`;
        }).join('');
      }).join('')}</tbody></table><p class="empty" style="padding-top:6px">Reusing a colour is fine when the circuits run in different harnesses or are told apart by wire number. "Same harness" marks the uses worth a second look.</p>` : '<p class="empty">No wires yet.</p>';
    } else if (tab === 'checks') {
      h = checks.length ? `<table class="data"><thead><tr><th>Level</th><th>Finding</th></tr></thead><tbody>${checks.map((c) => `<tr class="click" data-sheet="${c.sheetId || ''}" ${c.wire ? `data-wire="${c.wire}"` : c.part ? `data-part="${c.part}"` : ''}><td><span class="lvl ${c.level}">${c.level === 'warn' ? 'check' : c.level}</span></td><td class="wrap">${esc(c.text)}</td></tr>`).join('')}</tbody></table><p class="empty" style="padding-top:6px">Size guidance is a rule of thumb for single PVC automotive cable. Always check your cable maker's ratings.</p>` : '<p class="empty">No problems found.</p>';
    }
    wrap.innerHTML = h;
  }
  function highlightRows() { $$('#table-wrap tr[data-wire]').forEach((tr) => tr.classList.toggle('sel', sel.wires.has(tr.dataset.wire))); }
  function showTab(t) {
    tab = t; $$('.tab[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    setTablesOpen(true); tables();
  }
  function setTablesOpen(open) {
    const t = $('#tables'), b = $('#tables-toggle');
    t.classList.toggle('collapsed', !open);
    b.setAttribute('aria-expanded', String(open)); b.title = open ? 'Hide lists' : 'Show lists';
    b.querySelector('use').setAttribute('href', open ? '#i-down' : '#i-up');
    $$('[data-cmd="tables"]').forEach((x) => x.classList.toggle('on', open));
  }
  $('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  $('#tables-toggle').addEventListener('click', () => setTablesOpen($('#tables').classList.contains('collapsed')));
  $('#scope-all').addEventListener('change', tables);
  $('#table-wrap').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-wire], tr[data-part]');
    if (!tr) return;
    if (tr.dataset.sheet && tr.dataset.sheet !== sheetId) goSheet(tr.dataset.sheet);
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
  function serialise() { return JSON.stringify({ ...project, app: 'LoomWright ' + L.VERSION }, null, 2); }
  function loadDoc(d, f, wantSheet) {
    project = L.normalise(d);
    Object.keys(views).forEach((k) => delete views[k]);
    bindSheet(wantSheet);
    file = { path: (f && f.path) || null, name: (f && f.name) || null, mtime: 0 };
    hist = []; redoStack = []; draft = null; sel = { parts: new Set(), wires: new Set() };
    buildLibrary(); refreshAll(); setHint(); updateTitle();
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
    } catch (e) { showMessage('Could not open that file', `<p>${esc(e.message || e)}</p><p class="muted">LoomWright opens .loom and .json files saved by LoomWright or the Claude add-on.</p>`); }
  }
  async function save() { return saveTo(file.path); }
  async function saveAs() { return saveTo(null); }
  async function saveTo(path) {
    try {
      const r = await PF.saveDiagram(serialise(), path, slug(project.title) + '.loom');
      if (!r) return;
      if (r.path) { file.path = r.path; file.name = r.name; if (PF.canWatch) file.mtime = await PF.mtime(r.path); }
      else file.name = r.name;
      markClean(); autosave();
      if (!r.shown) toast(`Saved ${r.name || ''}`);
    } catch (e) { showMessage('Could not save', `<p>${esc(e.message || e)}</p>`); }
  }
  function newProject() {
    const d = L.newDoc('Untitled project');
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
        const reload = async () => {
          const t = await PF.readFile(file.path); const keep = { ...view }, keepSheet = sheetId;
          loadDoc(JSON.parse(t), file, keepSheet); view = keep; applyView(); markClean();
        };
        if (!dirty) { await reload(); toast('Updated from file'); }
        else toast('This file changed on disk.', { label: 'Reload', run: reload });
      }
    } catch (e) { /* file may be mid-write */ }
  }, 1500);

  // Pick up components that Claude (or another window) saved to the library.
  async function reloadLibrary() {
    try {
      const fresh = await PF.loadUserLibrary();
      if (!fresh) return;
      const parts = (fresh.parts || []).map((p) => ({ ...p, custom: true, cat: 'My components' }));
      if (JSON.stringify(parts) === JSON.stringify(userLib.parts)) return;
      const added = parts.filter((p) => !userLib.parts.some((u) => u.id === p.id));
      userLib.parts = parts; userLib.colours = fresh.colours || userLib.colours;
      buildLibrary();
      if (added.length) toast(`New in My components: ${added.map((p) => p.name).join(', ')}`);
    } catch (e) { /* ignore */ }
  }
  window.addEventListener('focus', reloadLibrary);

  /* ---------------- Export ---------------- */
  const csv = (rows) => rows.map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const sheetSlug = () => slug(project.title) + (project.sheets.length > 1 ? '-' + (project.sheets.indexOf(doc.sheet) + 1) + '-' + slug(doc.sheet.name) : '');
  async function exportSVG() { await PF.exportFile(sheetSlug() + '.svg', L.exportSVG(doc), 'image/svg+xml'); }
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
  async function exportPNG() { const bytes = await svgToPng(L.exportSVG(doc), 2); await PF.exportFile(sheetSlug() + '.png', bytes, 'image/png'); }
  async function exportWires() {
    const rows = [['Sheet', 'Wire', 'From', 'To', 'Colour code', 'Colour', 'Size mm2', 'AWG', 'Length m', 'Current A', 'Voltage drop V', 'Circuit', 'Harness', 'Notes']].concat(L.wireList(project).map((r) => [r.sheet, r.name, r.from, r.to, r.code, r.colour, r.gauge, r.awg, r.length, r.current, r.drop, r.circuit, r.harness, r.notes]));
    await PF.exportFile(slug(project.title) + '-wires.csv', csv(rows), 'text/csv');
  }
  async function exportBOM() { await PF.exportFile(slug(project.title) + '-parts.csv', csv([['Qty', 'Component', 'Spec', 'References']].concat(L.bom(project).map((r) => [r.qty, r.name, r.spec, r.refs.join(' ')]))), 'text/csv'); }
  async function exportCable() { await PF.exportFile(slug(project.title) + '-cable.csv', csv([['Size mm2', 'Code', 'Colour', 'Wires', 'Total m', 'Buy m (+15%)', 'Wires missing length']].concat(L.cableTotals(project).map((r) => [r.gauge, r.code, r.colour, r.wires, r.metres.toFixed(1), (r.metres * 1.15).toFixed(1), r.unknown]))), 'text/csv'); }
  async function exportUsage() {
    const rows = [['Code', 'Colour', 'Circuit', 'Harness', 'Sheets', 'Wires']];
    L.colourUsage(project).forEach((e) => e.uses.forEach((u) => rows.push([e.code, e.colour, u.circuit, u.harness, u.sheets.join(' '), u.wires.join(' ')])));
    await PF.exportFile(slug(project.title) + '-colour-usage.csv', csv(rows), 'text/csv');
  }
  function printDiagram() {
    const wl = L.wireList(project);
    $('#print-area').innerHTML = L.views(project).map((v) => L.exportSVG(v)).join('') + (wl.length ? `<h3>Wire list: ${esc(project.title)}</h3><table><thead><tr><th>Sheet</th><th>Wire</th><th>From</th><th>To</th><th>Code</th><th>Colour</th><th>mm²</th><th>m</th><th>A</th><th>Circuit</th><th>Harness</th><th>Notes</th></tr></thead><tbody>${wl.map((r) => `<tr><td>${esc(r.sheet)}</td><td>${esc(r.name)}</td><td>${esc(r.from)}</td><td>${esc(r.to)}</td><td>${esc(r.code)}</td><td>${esc(r.colour)}</td><td>${esc(r.gauge)}</td><td>${esc(r.length)}</td><td>${esc(r.current)}</td><td>${esc(r.circuit)}</td><td>${esc(r.harness)}</td><td>${esc(r.notes)}</td></tr>`).join('')}</tbody></table>` : '');
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
      showModal('Copy your file', `<p class="muted">This preview can't save files directly. Copy the contents below into a file called <b>${esc(name)}</b>, or download LoomWright to save normally.</p><textarea id="dl-text" readonly>${esc(data)}</textarea><div class="row-btns"><button class="btn primary" id="dl-copy">Copy to clipboard</button></div>`);
      $('#dl-copy').onclick = async () => { const ta = $('#dl-text'); try { await navigator.clipboard.writeText(ta.value); toast('Copied'); } catch (e) { ta.focus(); ta.select(); } };
    } else {
      const url = URL.createObjectURL(new Blob([data], { type: mime }));
      showModal('Save your image', `<p class="muted">This preview can't save files directly. Right-click the image and choose save.</p><img src="${url}" alt="Exported diagram">`);
    }
  };

  function coloursModal() {
    const s = project.settings, stock = new Set(s.stock || []);
    const used = new Set(); project.sheets.forEach((sh) => sh.wires.forEach((w) => [w.colour, w.tracer, w.tracer2].forEach((c) => c && used.add(c))));
    const stockBox = (id) => `<input type="checkbox" data-stock="${esc(id)}"${stock.has(id) ? ' checked' : ''} aria-label="In stock">`;
    const rows = project.customColours.map((c, i) => `<tr data-i="${i}"><td>${stockBox(c.id)}</td><td><input type="color" value="${esc(c.hex)}" data-k="hex" aria-label="Colour"></td><td><input type="text" value="${esc(c.name)}" data-k="name" aria-label="Name"></td><td><input type="text" value="${esc(c.code)}" data-k="code" aria-label="Code" class="mono"></td><td class="mono">${used.has(c.id) ? 'used' : ''}</td><td><button class="btn icon danger" data-del="${i}" aria-label="Remove">✕</button></td></tr>`).join('');
    showModal('Wire colours', `
      <label class="fld"><span>Colour codes</span><select id="m-std">${Object.values(L.STANDARDS).map((x) => `<option value="${x.id}"${x.id === s.standard ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <p class="muted">${esc(L.STANDARDS[s.standard].note)} Changing the standard relabels every wire; the colours stay the same.</p>
      <h3>Colours I stock</h3>
      <p class="muted">Tick the cable colours you actually have. With "only offer colours I stock" on, wire pickers list just these, so the same few colours get reused for different jobs. The Colour usage list then shows each job a colour does.</p>
      <label class="fld check"><input type="checkbox" id="m-stockonly"${s.stockOnly ? ' checked' : ''}><span>Only offer colours I stock in wire pickers</span></label>
      <h3>My colours</h3>
      <p class="muted">Any colour your loom uses, with your own name and code. Saved in this project and in your palette for new projects.</p>
      <div style="overflow-x:auto"><table class="data colour-table"><thead><tr><th>Stock</th><th>Colour</th><th>Name</th><th>Code</th><th></th><th></th></tr></thead><tbody id="m-rows">${rows || '<tr><td colspan="6" class="muted">No custom colours yet.</td></tr>'}</tbody></table></div>
      <div class="row-btns"><button class="btn" id="m-add">Add colour</button><button class="btn" id="m-import"${userLib.colours.length ? '' : ' disabled'}>Add my saved palette</button></div>
      <h3>Standard colours</h3>
      <div style="overflow-x:auto"><table class="data"><thead><tr><th>Stock</th><th>Colour</th><th>Name</th><th>Land Rover</th><th>DIN / IEC</th><th>SAE</th><th></th></tr></thead><tbody id="m-std-rows">${L.COLOURS.map((c) => `<tr><td>${stockBox(c.id)}</td><td><span class="swatch" style="background:${c.hex}"></span></td><td>${esc(c.name)}</td><td class="mono">${esc(c.lr)}</td><td class="mono">${esc(c.din)}</td><td class="mono">${esc(c.sae)}</td><td class="mono muted">${used.has(c.id) ? 'used' : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="row-btns"><button class="btn" id="m-stock-used">Stock = colours in use</button><button class="btn primary" data-close>Done</button></div>`);
    const before = snapshot();
    const finish = () => {
      if (snapshot() !== before) { hist.push(before); redoStack = []; markDirty(); }
      const merged = clone(userLib.colours || []);
      project.customColours.forEach((c) => { const i = merged.findIndex((x) => x.id === c.id); if (i >= 0) merged[i] = clone(c); else merged.push(clone(c)); });
      userLib.colours = merged; PF.saveUserLibrary(userLib);
      commit();
    };
    $('#m-std').onchange = (e) => { s.standard = e.target.value; finish(); coloursModal(); };
    $('#m-stockonly').onchange = (e) => { s.stockOnly = e.target.checked; finish(); };
    $('#m-stock-used').onclick = () => { s.stock = [...used]; finish(); coloursModal(); };
    $('#modal-body').addEventListener('change', (e) => {
      const id = e.target.dataset && e.target.dataset.stock; if (id == null) return;
      const set = new Set(s.stock || []); if (e.target.checked) set.add(id); else set.delete(id);
      s.stock = [...set]; finish();
    });
    $('#m-add').onclick = () => { project.customColours.push({ id: L.uid('c_'), custom: true, name: 'Custom colour', code: 'CU' + (project.customColours.length + 1), hex: '#3a7d5c' }); finish(); coloursModal(); };
    $('#m-import').onclick = () => { (userLib.colours || []).forEach((c) => { if (!project.customColours.some((x) => x.id === c.id)) project.customColours.push(clone(c)); }); finish(); coloursModal(); };
    $('#m-rows').addEventListener('input', (e) => { const tr = e.target.closest('tr[data-i]'); if (!tr || !e.target.dataset.k) return; project.customColours[+tr.dataset.i][e.target.dataset.k] = e.target.value; render(); });
    $('#m-rows').addEventListener('change', (e) => { if (e.target.dataset.k) finish(); });
    $('#m-rows').addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]'); if (!b) return;
      const c = project.customColours[+b.dataset.del];
      if (used.has(c.id)) { toast(`${c.name} is used by wires. Change those wires first.`); return; }
      project.customColours.splice(+b.dataset.del, 1); s.stock = (s.stock || []).filter((x) => x !== c.id); finish(); coloursModal();
    });
  }

  function helpModal() {
    showModal('Keyboard and mouse', `
      <div class="kbd-list">
        <kbd>Click pin, then pin</kbd><span>Draw a wire. Click empty space on the way to add bends.</span>
        <kbd>Double-click wire</kbd><span>Add a bend point. Double-click a bend point to remove it.</span>
        <kbd>Drag empty space</kbd><span>Select several parts</span>
        <kbd>Scroll</kbd><span>Pan. Hold Space and drag, or drag with the middle button, to pan too.</span>
        <kbd>Ctrl+scroll</kbd><span>Zoom (pinch on a trackpad)</span>
        <kbd>Ctrl+K</kbd><span>Search commands, parts and sheets</span>
        <kbd>PgUp / PgDn</kbd><span>Previous / next sheet</span>
        <kbd>R / Shift+R</kbd><span>Rotate selection</span>
        <kbd>F</kbd><span>Flip selection</span>
        <kbd>Ctrl+C / X / V / D</kbd><span>Copy, cut, paste, duplicate</span>
        <kbd>Arrow keys</kbd><span>Nudge 10 (Shift: 50)</span>
        <kbd>Delete</kbd><span>Delete selection</span>
        <kbd>Ctrl+Z / Ctrl+Shift+Z</kbd><span>Undo / redo</span>
        <kbd>Ctrl+S / Ctrl+O / Ctrl+P</kbd><span>Save / open / print all sheets</span>
        <kbd>0</kbd><span>Fit sheet to window</span>
      </div>
      <div class="row-btns"><button class="btn primary" data-close>Close</button></div>`);
  }
  function aboutModal() {
    const where = PF.kind === 'desktop' ? 'the desktop app' : PF.kind === 'preview' ? 'a preview' : 'a browser';
    showModal('About LoomWright', `
      <p><b>LoomWright ${esc(L.VERSION)}</b>, running in ${where}.</p>
      <p class="muted">Free, open-source wiring diagram editor for vehicles and electronics. Projects are saved as <b>.loom</b> files (plain JSON) that the optional Claude add-on can also read and write.</p>
      <p class="muted">Copyright © 2026 LoomWright contributors. Licensed under the GNU General Public License v3.0 or later. IBM Plex Mono is used under the SIL Open Font License.</p>
      <div class="row-btns"><button class="btn" id="h-sample">Open the example project</button><button class="btn primary" data-close>Close</button></div>`);
    $('#h-sample').onclick = () => { closeModal(); loadDoc(window.LoomSample(), null); markDirty(); autosave(); };
  }
  function claudeModal() {
    showModal('Use LoomWright with Claude', `
      <p>The Claude add-on is optional. LoomWright works fully offline without it. With it, Claude can read and edit the project you have open; the app reloads as soon as Claude saves.</p>
      <h3>Things you can ask</h3>
      <ul class="tips" style="font-size:12.5px">
        <li>"Add a second sheet for the rear work lights: 2 LED floods on a relay, switched from the dash, 15 A fuse from FB1 way 5."</li>
        <li>"Here is a picture of my switch panel's pinout. Make it a custom component and save it to my library." (attach the picture)</li>
        <li>"I only stock red, brown/red, black, green and purple/white. Recolour sheet 2 using just those and tell me where colours are reused."</li>
        <li>"Check the whole project and fix any undersized cables."</li>
      </ul>
      <h3>Set up</h3>
      <p class="muted">Needs Node.js 18 or newer. In the LoomWright folder run <span class="mono">npm install</span> in <span class="mono">mcp</span>, then add this to Claude Desktop (Settings, Developer, Edit Config):</p>
      <pre>{
  "mcpServers": {
    "loomwright": {
      "command": "node",
      "args": ["/path/to/loomwright/mcp/server.js"]
    }
  }
}</pre>
      <p class="muted">For Claude Code: <span class="mono">claude mcp add loomwright -- node /path/to/loomwright/mcp/server.js</span>. Components Claude saves appear under Parts, My components, when you switch back to LoomWright.</p>
      <div class="row-btns"><button class="btn primary" data-close>Close</button></div>`);
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
      toast(`Imported ${plural(n, 'component')}`);
    } catch (e) { showMessage('Could not import', `<p>${esc(e.message)}</p>`); }
  }
  async function exportLibrary() {
    await PF.exportFile('loomwright-components.json', JSON.stringify({ format: 'loomwright-library', version: 1, parts: userLib.parts, colours: userLib.colours }, null, 2), 'application/json');
  }

  /* ---------------- Theme ---------------- */
  function isDark() { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
  function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem(THEME, t); } catch (e) { /* ignore */ } }
  try { const t = localStorage.getItem(THEME); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }

  /* ---------------- Commands, menus and search ---------------- */
  const COMMANDS = {
    new: { label: 'New project', run: () => confirmDiscard(newProject) },
    open: { label: 'Open…', key: 'Ctrl+O', run: openFile },
    save: { label: 'Save', key: 'Ctrl+S', run: save },
    saveas: { label: 'Save as…', key: 'Ctrl+Shift+S', run: saveAs },
    'export-svg': { label: 'Export sheet as SVG', run: exportSVG },
    'export-png': { label: 'Export sheet as PNG', run: () => exportPNG().catch((e) => toast(e.message)) },
    'export-wires': { label: 'Export wire list (CSV)', run: exportWires },
    'export-bom': { label: 'Export parts list (CSV)', run: exportBOM },
    'export-cable': { label: 'Export cable totals (CSV)', run: exportCable },
    'export-usage': { label: 'Export colour usage (CSV)', run: exportUsage },
    print: { label: 'Print or save PDF (all sheets)', key: 'Ctrl+P', run: printDiagram, when: () => PF.canPrint },
    sample: { label: 'Open example project', run: () => confirmDiscard(() => { loadDoc(window.LoomSample(), null); markDirty(); autosave(); }) },
    undo: { label: 'Undo', key: 'Ctrl+Z', run: undo, enabled: () => hist.length > 0 },
    redo: { label: 'Redo', key: 'Ctrl+Shift+Z', run: redo, enabled: () => redoStack.length > 0 },
    cut: { label: 'Cut', key: 'Ctrl+X', run: () => { if (copySelection()) deleteSelection(); }, enabled: () => sel.parts.size > 0 },
    copy: { label: 'Copy', key: 'Ctrl+C', run: () => { if (copySelection()) toast('Copied'); }, enabled: () => sel.parts.size > 0 },
    paste: { label: 'Paste', key: 'Ctrl+V', run: () => paste() },
    dup: { label: 'Duplicate', key: 'Ctrl+D', run: () => { if (copySelection()) paste(20); }, enabled: () => sel.parts.size > 0 },
    delete: { label: 'Delete', key: 'Del', run: deleteSelection, enabled: () => selCount() > 0 },
    'select-all': { label: 'Select all on sheet', key: 'Ctrl+A', run: () => select(doc.parts.map((p) => p.id), doc.wires.map((w) => w.id)) },
    rotate: { label: 'Rotate', key: 'R', run: () => rotateSelection(1), enabled: () => sel.parts.size > 0 },
    flip: { label: 'Flip', key: 'F', run: flipSelection, enabled: () => sel.parts.size > 0 },
    'zoom-in': { label: 'Zoom in', key: '+', run: () => zoomBy(1.2) },
    'zoom-out': { label: 'Zoom out', key: '−', run: () => zoomBy(1 / 1.2) },
    fit: { label: 'Fit sheet to window', key: '0', run: fit },
    'pane-parts': { label: 'Parts library', run: () => showPane(pane === 'parts' ? null : 'parts'), on: () => pane === 'parts' },
    'pane-project': { label: 'Project and sheets', run: () => showPane(pane === 'project' ? null : 'project'), on: () => pane === 'project' },
    'pane-props': { label: 'Properties', run: () => { $('#props').hidden = !$('#props').hidden; renderOverlay(); }, on: () => !$('#props').hidden },
    tables: { label: 'Lists and reports', run: () => setTablesOpen($('#tables').classList.contains('collapsed')), on: () => !$('#tables').classList.contains('collapsed') },
    theme: { label: 'Dark theme', run: () => setTheme(isDark() ? 'light' : 'dark'), on: isDark },
    'sheet-new': { label: 'New sheet', run: () => addSheet(null) },
    'sheet-dup': { label: 'Duplicate sheet', run: () => addSheet(doc.sheet) },
    'sheet-rename': { label: 'Rename sheet', run: () => renameSheetInline(sheetId) },
    'sheet-del': { label: 'Delete sheet', run: () => deleteSheet(sheetId), enabled: () => project.sheets.length > 1 },
    'sheet-left': { label: 'Move sheet left', run: () => moveSheet(sheetId, -1), enabled: () => project.sheets[0].id !== sheetId },
    'sheet-right': { label: 'Move sheet right', run: () => moveSheet(sheetId, 1), enabled: () => project.sheets[project.sheets.length - 1].id !== sheetId },
    'sheet-prev': { label: 'Previous sheet', key: 'PgUp', run: () => stepSheet(-1) },
    'sheet-next': { label: 'Next sheet', key: 'PgDn', run: () => stepSheet(1) },
    builder: { label: 'Component builder…', run: () => window.LoomBuilder.open(null) },
    colours: { label: 'Wire colours and stock…', run: coloursModal },
    'lib-import': { label: 'Import components…', run: importLibrary },
    'lib-export': { label: 'Export my components…', run: exportLibrary, enabled: () => userLib.parts.length > 0 },
    check: { label: 'Run design checks', run: () => { showTab('checks'); const n = L.validate(project).filter((c) => c.level !== 'info').length; toast(n ? `${plural(n, 'check')} to review` : 'No problems found'); } },
    wires: { label: 'Wire list', run: () => showTab('wires') },
    bom: { label: 'Parts list', run: () => showTab('bom') },
    cable: { label: 'Cable totals', run: () => showTab('cable') },
    usage: { label: 'Colour usage', run: () => showTab('usage') },
    claude: { label: 'Use with Claude…', run: claudeModal },
    help: { label: 'Keyboard and mouse', run: helpModal },
    about: { label: 'About LoomWright', run: aboutModal },
  };
  const MENUS = [
    ['File', ['new', 'open', 'sample', '-', 'save', 'saveas', '-', 'print', 'export-svg', 'export-png', '-', 'export-wires', 'export-bom', 'export-cable', 'export-usage']],
    ['Edit', ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'dup', 'delete', '-', 'select-all', 'rotate', 'flip']],
    ['View', ['pane-parts', 'pane-project', 'pane-props', 'tables', '-', 'zoom-in', 'zoom-out', 'fit', '-', 'theme']],
    ['Sheet', ['sheet-new', 'sheet-dup', 'sheet-rename', 'sheet-del', '-', 'sheet-left', 'sheet-right', '-', 'sheet-prev', 'sheet-next']],
    ['Tools', ['builder', 'colours', 'lib-import', 'lib-export', '-', 'check', 'wires', 'bom', 'cable', 'usage']],
    ['Help', ['claude', 'help', 'about']],
  ];
  function runCommand(id) {
    const c = COMMANDS[id];
    if (!c || (c.enabled && !c.enabled()) || (c.when && !c.when())) return;
    c.run();
  }
  function confirmDiscard(fn) {
    if (!dirty) { fn(); return; }
    showModal('Discard unsaved changes?', `<p>${esc(project.title)} has changes that are not saved to a file.</p><div class="row-btns"><button class="btn primary" id="cd-save">Save first</button><button class="btn danger" id="cd-go">Discard changes</button><button class="btn" data-close>Cancel</button></div>`);
    $('#cd-save').onclick = async () => { closeModal(); await save(); if (!dirty) fn(); };
    $('#cd-go').onclick = () => { closeModal(); fn(); };
  }
  function buildMenus() {
    $('#menubar').innerHTML = MENUS.map(([name, items], i) => `<div class="menu" data-menu="${i}"><button type="button" aria-haspopup="true">${name}</button><div class="drop" role="menu">${items.map((id) => {
      if (id === '-') return '<hr>';
      const c = COMMANDS[id]; if (c.when && !c.when()) return '';
      return `<button type="button" role="menuitem" data-menu-cmd="${id}">${esc(c.label)}${c.key ? `<kbd>${esc(c.key)}</kbd>` : ''}</button>`;
    }).join('')}</div></div>`).join('');
  }
  function refreshMenu(m) {
    $$('[data-menu-cmd]', m).forEach((b) => {
      const c = COMMANDS[b.dataset.menuCmd];
      b.disabled = !!(c.enabled && !c.enabled());
      b.classList.toggle('on', !!(c.on && c.on()));
    });
  }
  function closeMenus() { $$('.menu.open').forEach((m) => m.classList.remove('open')); }
  $('#menubar').addEventListener('click', (e) => {
    const item = e.target.closest('[data-menu-cmd]');
    if (item) { closeMenus(); runCommand(item.dataset.menuCmd); return; }
    const m = e.target.closest('.menu');
    if (!m) return;
    const was = m.classList.contains('open');
    closeMenus();
    if (!was) { refreshMenu(m); m.classList.add('open'); }
  });
  $('#menubar').addEventListener('mouseover', (e) => {
    const m = e.target.closest('.menu');
    if (m && $('.menu.open') && !m.classList.contains('open')) { closeMenus(); refreshMenu(m); m.classList.add('open'); }
  });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#menubar')) closeMenus(); });

  // Ctrl+K search over commands, parts and sheets
  let palItems = [], palIdx = 0;
  function openPalette() {
    closeMenus();
    $('#palette').hidden = false;
    const inp = $('#palette-input'); inp.value = ''; inp.focus();
    paletteList();
  }
  function closePalette() { $('#palette').hidden = true; }
  function paletteList() {
    const q = $('#palette-input').value.trim().toLowerCase();
    const cmds = Object.entries(COMMANDS).filter(([, c]) => !(c.when && !c.when())).map(([id, c]) => ({ kind: 'Command', label: c.label, hint: c.key || '', run: () => runCommand(id), dis: c.enabled && !c.enabled() }));
    const sheets = project.sheets.map((s, i) => ({ kind: 'Sheet', label: `${i + 1}  ${s.name}`, hint: 'Sheet', run: () => goSheet(s.id) }));
    const parts = libraryItems().map((d) => ({ kind: 'Part', label: d.name, hint: d.custom ? 'My components' : d.cat, run: () => addPartAt(d.id) }));
    const onSheet = project.sheets.flatMap((s) => s.parts.filter((p) => p.label).map((p) => ({ kind: 'Find', label: p.label + '  ' + ((L.partDef(L.view(project, s), p.type) || {}).name || p.type), hint: s.name, run: () => { goSheet(s.id); select([p.id]); centreOnSelection(); } })));
    const all = q ? [...sheets, ...onSheet, ...cmds, ...parts] : [...cmds.slice(0, 8), ...sheets];
    palItems = all.filter((x) => !q || x.label.toLowerCase().includes(q) || x.hint.toLowerCase().includes(q)).slice(0, 40);
    palIdx = 0;
    drawPalette();
  }
  function drawPalette() {
    $('#palette-list').innerHTML = palItems.length ? palItems.map((x, i) => `<button type="button" role="option" class="${i === palIdx ? 'on' : ''}" data-i="${i}"${x.dis ? ' disabled' : ''}><span class="muted" style="width:62px">${esc(x.kind)}</span><span>${esc(x.label)}</span><small>${esc(x.hint)}</small></button>`).join('') : '<p class="empty">Nothing matches.</p>';
    const on = $('#palette-list .on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function palRun(i) { const x = palItems[i]; if (!x || x.dis) return; closePalette(); x.run(); }
  $('#palette-input').addEventListener('input', paletteList);
  $('#palette-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = Math.min(palItems.length - 1, palIdx + 1); drawPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(0, palIdx - 1); drawPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); palRun(palIdx); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });
  $('#palette-list').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) palRun(+b.dataset.i); });
  $('#palette').addEventListener('pointerdown', (e) => { if (e.target.id === 'palette') closePalette(); });
  $('#cmdbtn').addEventListener('click', openPalette);

  // Buttons anywhere with data-cmd (ribbon, panes)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]');
    if (b && !b.disabled) runCommand(b.dataset.cmd);
  });
  if (!PF.canPrint) $('#rb-print').hidden = true;
  window.addEventListener('beforeunload', (e) => { if (dirty && PF.kind === 'browser') { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('resize', () => renderOverlay());

  /* ---------------- API used by the component builder ---------------- */
  window.LoomEditor = {
    get userLib() { return userLib; },
    get doc() { return doc; },
    get project() { return project; },
    async saveComponent(def) {
      def.custom = true; def.cat = 'My components';
      const i = userLib.parts.findIndex((p) => p.id === def.id);
      if (i >= 0) userLib.parts[i] = def; else userLib.parts.push(def);
      await PF.saveUserLibrary(userLib);
      // keep projects that already use it up to date
      const j = project.customParts.findIndex((p) => p.id === def.id);
      if (j >= 0) { pushHistory(); project.customParts[j] = clone(def); L.views(project).forEach((v) => L.pruneWires(v)); }
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
    buildMenus();
    showPane('parts');
    setTablesOpen(true);
    userLib = (await PF.loadUserLibrary()) || { parts: [], colours: [] };
    userLib.parts = (userLib.parts || []).map((p) => ({ ...p, custom: true, cat: 'My components' }));
    userLib.colours = userLib.colours || [];
    let restored = null;
    try { restored = JSON.parse(localStorage.getItem(AUTOSAVE) || 'null'); } catch (e) { restored = null; }
    try { if (restored && restored.doc) { loadDoc(restored.doc, restored.file, restored.sheetId); if (restored.file && restored.file.name) markClean(); else markDirty(); } }
    catch (e) { restored = null; }
    if (!restored || !restored.doc) { loadDoc(window.LoomSample(), null); markClean(); }
    const initial = await PF.initialFile();
    if (initial) { try { loadDoc(JSON.parse(initial.text), initial); markClean(); } catch (e) { toast('Could not open ' + initial.name); } }
    applyView(); setHint();
  })();
})();
