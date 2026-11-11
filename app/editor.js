/*
 * LoomWright editor: projects made of sheets, each sheet a drawing.
 * Several projects can be open at once, each in its own tab.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: AGPL-3.0-or-later
 */
(function () {
  'use strict';
  const L = window.Loom, PF = window.Platform;
  const I18N = window.LoomI18n || { t: (s) => s, lang: 'en', apply() {} };
  const t = (s) => I18N.t(s);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = L.esc;
  const AUTOSAVE = 'loomwright.autosave.v2', AUTOSAVE_V1 = 'loomwright.autosave.v1';
  const THEME = 'loomwright.theme';

  /* ---------------- State of the open project ---------------- */
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
  let menusReady = false;
  /* Defaults and extra lists that depend on the kind of project. */
  const TYPE_WIRE = { vehicle: { colour: 'red', gauge: '1.0' }, household: { colour: 'grey', gauge: '2.5' }, factory: { colour: 'black', gauge: '1.5' }, electronics: { colour: 'red', gauge: '0.5' }, mixed: { colour: 'red', gauge: '1.0' } };
  const ptype = () => (project && project.settings && project.settings.projectType) || 'vehicle';
  const anyPart = (types) => !!project && project.sheets.some((sh) => sh.parts.some((p) => types.includes(p.type)));
  const showHouse = () => !!L.householdChecks && (['household', 'mixed'].includes(ptype()) || anyPart(['mcb', 'rcbo']));
  const showFactory = () => !!L.factoryChecks && (['factory', 'mixed'].includes(ptype()) || anyPart(['motor3', 'contactor', 'plc_in', 'plc_out']));
  const showTerminals = () => showFactory() || anyPart(['terminal_block']);
  const showElec = () => !!L.electronicsPower && (['electronics', 'mixed'].includes(ptype()) || (!!project && project.sheets.some((sh) => sh.parts.some((p) => L.boardPins(p.type)))));
  function typeUI() {
    const type = ptype();
    if (lastWire.type !== type) { lastWire = { ...lastWire, tracer: '', ...(TYPE_WIRE[type] || TYPE_WIRE.vehicle), type }; }
    const want = { schedule: showHouse(), motors: showFactory(), terminals: showTerminals(), plcio: showFactory(), power: showElec() };
    Object.keys(want).forEach((k) => { const b = $(`.tab[data-tab="${k}"]`); if (b) b.hidden = !want[k]; });
    if (want[tab] === false) showTab('wires');
    if (menusReady) buildMenus();
  }
  let userLib = { parts: [], colours: [], blocks: [] };
  let tab = 'wires';
  let placeCount = 0;
  let pane = 'parts';             // left task pane: 'parts', 'project', 'history' or null
  let trace = null;               // circuit being traced: {seed, name, wires, parts, sheets}
  let test = null;                // live circuit test: {state, sim}
  let editRev = 0;                // bumps on every change, for cached checks
  let lastSavePoint = 0;

  /* ---------------- Open projects (tabs) ---------------- */
  let tabs = [], active = 0;

  const svg = $('#canvas'), vp = $('#vp'), content = $('#content'), overlay = $('#overlay');

  /* ---------------- Helpers ---------------- */
  const partById = (id) => doc.parts.find((p) => p.id === id);
  const wireById = (id) => doc.wires.find((w) => w.id === id);
  const snap = L.snap;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const plural = (n, w) => (I18N.plural ? I18N.plural(n, w) : `${n} ${w}${n === 1 ? '' : 's'}`);
  function world(e) { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k }; }
  function selCount() { return sel.parts.size + sel.wires.size; }
  function only(kind) { return kind === 'part' ? (sel.parts.size === 1 && !sel.wires.size ? partById([...sel.parts][0]) : null) : (sel.wires.size === 1 && !sel.parts.size ? wireById([...sel.wires][0]) : null); }
  function bindSheet(id) {
    const s = project.sheets.find((x) => x.id === id) || project.sheets[0];
    sheetId = s.id; doc = L.view(project, s);
  }
  const snapshot = () => JSON.stringify({ project, sheetId });
  let checkCache = { rev: -1, list: [] };
  function checks() { if (checkCache.rev !== editRev) checkCache = { rev: editRev, list: L.validate(project) }; return checkCache.list; }

  function pushHistory() { hist.push(snapshot()); if (hist.length > 200) hist.shift(); redoStack = []; markDirty(); }
  function markDirty() { dirty = true; editRev++; updateTitle(); }
  function markClean() { dirty = false; updateTitle(); }
  function updateTitle() {
    PF.setTitle(`${dirty ? '• ' : ''}${project.title || t('Untitled')}${file.name ? ' — ' + file.name : ''} · LoomWright`);
    $('#mc-project').textContent = `${project.title || t('Untitled')}${file.name ? '  ·  ' + file.name : ''}${dirty ? '  •' : ''}`;
    $('#mc-project').title = dirty ? t('Unsaved changes') : t('Saved');
    docTabs();
  }
  function stash() { if (project) tabs[active] = { project, sheetId, file, dirty, hist, redoStack, views: { ...views }, view: { ...view }, viewed: true }; }
  function autosave() {
    stash();
    const pack = (tb) => ({ doc: tb.project, sheetId: tb.sheetId, file: { path: tb.file.path, name: tb.file.name }, dirty: tb.dirty });
    try { localStorage.setItem(AUTOSAVE, JSON.stringify({ tabs: tabs.map(pack), active })); }
    catch (e) { try { localStorage.setItem(AUTOSAVE, JSON.stringify({ tabs: [pack(tabs[active])], active: 0 })); } catch (e2) { /* storage unavailable */ } }
  }

  function toast(msg, action) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
    el.hidden = false;
    if (action) el.querySelector('button').onclick = () => { el.hidden = true; action.run(); };
    clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, action ? 9000 : 2600);
  }

  /* Custom parts from the user library are copied into the project when used,
     so a saved project always carries the symbols it needs. */
  function ensureCustomInDoc(type) {
    if (L.LIBRARY[type]) return;
    const fromUser = userLib.parts.find((p) => p.id === type);
    if (!fromUser) return;
    L.updateCustomPart(project, fromUser); // moves wires on renamed pins; wires on removed pins stay and show in the checks
  }
  function defOf(type) { return L.partDef(doc, type) || userLib.parts.find((p) => p.id === type) || null; }

  /* ---------------- Local save points (IndexedDB) ---------------- */
  // Every save, and every ten minutes of editing, keeps a copy of the project in this computer's browser storage.
  const SavePoints = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((resolve) => {
        try {
          const rq = indexedDB.open('loomwright', 1);
          rq.onupgradeneeded = () => { const s = rq.result.createObjectStore('points', { keyPath: 'id' }); s.createIndex('project', 'project'); };
          rq.onsuccess = () => { this.db = rq.result; resolve(this.db); };
          rq.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      });
    },
    async add(p, why) {
      const db = await this.open(); if (!db) return;
      const rec = { id: L.uid('sp'), project: p.id, time: Date.now(), why, title: p.title, rev: p.meta.revision, sheets: p.sheets.length, wires: p.sheets.reduce((a, s) => a + s.wires.length, 0), data: JSON.stringify(p) };
      await new Promise((res) => { try { const tx = db.transaction('points', 'readwrite'); tx.objectStore('points').put(rec); tx.oncomplete = res; tx.onerror = res; } catch (e) { res(); } });
      const list = await this.list(p.id);
      const extra = list.slice(40);
      if (extra.length) await new Promise((res) => { try { const tx = db.transaction('points', 'readwrite'); extra.forEach((x) => tx.objectStore('points').delete(x.id)); tx.oncomplete = res; tx.onerror = res; } catch (e) { res(); } });
    },
    async list(pid) {
      const db = await this.open(); if (!db) return [];
      return new Promise((res) => {
        try {
          const out = [], rq = db.transaction('points').objectStore('points').index('project').openCursor(IDBKeyRange.only(pid));
          rq.onsuccess = () => { const c = rq.result; if (c) { const { data, ...meta } = c.value; out.push(meta); c.continue(); } else res(out.sort((a, b) => b.time - a.time)); };
          rq.onerror = () => res([]);
        } catch (e) { res([]); }
      });
    },
    async get(id) {
      const db = await this.open(); if (!db) return null;
      return new Promise((res) => { try { const rq = db.transaction('points').objectStore('points').get(id); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); } catch (e) { res(null); } });
    },
  };
  async function savePoint(why) { lastSavePoint = Date.now(); await SavePoints.add(project, why); if (pane === 'history') historyPane(); }
  setInterval(() => { if (dirty && Date.now() - lastSavePoint > 10 * 60 * 1000) savePoint('Automatic'); }, 60 * 1000);

  /* ---------------- Rendering ---------------- */
  function applyView() {
    vp.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    $('#zoom-label').textContent = Math.round(view.k * 100) + '%';
  }
  function renderOpts() {
    const o = { mode: 'edit', selWires: sel.wires, activePin: draft ? draft.from.part + '|' + draft.from.pin : null };
    if (trace) { o.hl = trace.wires; o.hlParts = trace.parts; }
    if (test) {
      o.sim = test.sim.wires; o.simLoads = test.sim.loads;
      o.states = new Map();
      doc.parts.forEach((p) => { const st = L.partStates(doc, p); if (st) { const v = st.follows ? (L.coilOn(test.sim.relays, st.follows) ? 1 : 0) : test.state[st.key] != null ? test.state[st.key] : st.def; o.states.set(p.id, st.states[v]); } });
      if (test.sol) {
        o.badges = new Map();
        doc.parts.forEach((p) => { const l = test.sol.load(sheetId, p.id); if (l && l.running && l.volts != null) o.badges.set(p.id, { text: `${l.volts.toFixed(1)} V · ${l.amps.toFixed(1)} A`, level: l.status }); });
      }
    }
    return o;
  }
  function render() {
    content.innerHTML = L.sheetFurnitureSVG(doc, { mode: 'edit' }) + L.renderDiagram(doc, renderOpts());
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
    if (w && !test) {
      const pts = L.wirePoints(doc, w) || [];
      const hs = 8 / view.k;
      if (w.points && w.points.length) {
        w.points.forEach((p, i) => { s += `<rect x="${p.x - hs / 2}" y="${p.y - hs / 2}" width="${hs}" height="${hs}" fill="#ffffff" stroke="${A}" stroke-width="${1.5 / view.k}" data-wp="${w.id}|${i}" style="cursor:move"><title>${esc(t('Drag to move. Double-click to remove.'))}</title></rect>`; });
      } else if (pts.length === 4) {
        const mx = pts[1].x, my = (pts[1].y + pts[2].y) / 2;
        s += `<rect x="${mx - hs / 2}" y="${my - hs / 2}" width="${hs}" height="${hs}" fill="#ffffff" stroke="${A}" stroke-width="${1.5 / view.k}" data-mid="${w.id}" style="cursor:ew-resize"><title>${esc(t('Drag to move this run. Double-click the wire to add bend points.'))}</title></rect>`;
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
    if (drag && drag.guides) drag.guides.forEach((g) => { s += `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="#e0458b" stroke-width="${1 / view.k}" stroke-dasharray="${5 / view.k} ${3 / view.k}" pointer-events="none"/>`; });
    overlay.innerHTML = s;
  }
  function rectOf(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }

  function refreshAll() { if (trace) retrace(); if (test) runTest(); render(); inspector(); tables(); sheetTabs(); projectPane(); historyPane(); status(); }
  function commit() { editRev++; autosave(); refreshAll(); }

  /* ---------------- Status bar ---------------- */
  function setHint() {
    let h;
    if (test) h = t('Live test: click a switch or fuse to change it. Relays pull in when their coil is powered. Powered wires glow. Esc to stop.');
    else if (draft) h = t('Click a pin to finish the wire. Click empty space to add a bend. Esc cancels.');
    else if (trace) h = t('Tracing a circuit across all sheets. Esc to clear.');
    else if (only('wire')) h = t('Drag the handle to move the wire, or drag its label. Double-click the wire to add a bend. Alt+click traces the circuit.');
    else if (sel.parts.size) h = t('R rotate, F flip, Ctrl+D duplicate, Del delete, arrow keys nudge.');
    else h = t('Drag parts in from the library. Click a pin, then another pin, to draw a wire. Alt+click a wire to trace it.');
    $('#st-hint').textContent = h;
  }
  function status() {
    const n = project.sheets.indexOf(doc.sheet) + 1;
    const pg = L.pageOf(doc);
    $('#st-sheet').textContent = `${t('Sheet')} ${n} / ${project.sheets.length}${pg ? ' · ' + pg.size + (pg.portrait ? ' ' + t('portrait') : '') : ''}`;
    $('#st-count').textContent = `${plural(doc.parts.length, t('part'))}, ${plural(doc.wires.length, t('wire'))}`;
    const issues = checks().filter((c) => c.level !== 'info').length;
    const st = $('#st-check');
    st.textContent = issues ? plural(issues, t('check')) + ' ' + t('to review') : t('Checks passed');
    st.style.setProperty('--stc', issues ? 'var(--warn)' : 'var(--ok)');
    st.title = t('Show design checks');
    $('#st-mode').textContent = `${test ? t('LIVE TEST') + ' · ' : ''}${PF.kind === 'desktop' ? t('Desktop') : PF.kind === 'preview' ? t('Preview') : t('Browser')} · ${L.VERSION}`;
    $('#st-mode').classList.toggle('live', !!test);
  }
  $('#st-check').addEventListener('click', () => showTab('checks'));

  /* ---------------- Project tabs ---------------- */
  function docTabs() {
    const el = $('#doctabs'); if (!el) return;
    stash();
    el.innerHTML = tabs.map((tb, i) => `<div class="dtab${i === active ? ' on' : ''}" data-dtab="${i}" title="${esc(tb.file.name || tb.project.title)}"><span>${tb.dirty ? '• ' : ''}${esc(tb.project.title || t('Untitled'))}</span><button class="x" data-dclose="${i}" aria-label="${esc(t('Close project'))}" title="${esc(t('Close project'))}">×</button></div>`).join('') +
      `<button class="dnew" data-cmd="new" title="${esc(t('New project'))}" aria-label="${esc(t('New project'))}">+</button>`;
  }
  $('#doctabs').addEventListener('click', (e) => {
    const x = e.target.closest('[data-dclose]');
    if (x) { e.stopPropagation(); closeTab(+x.dataset.dclose); return; }
    const d = e.target.closest('[data-dtab]');
    if (d && +d.dataset.dtab !== active) activate(+d.dataset.dtab);
  });
  function activate(i) {
    stash();
    active = i;
    const tb = tabs[i];
    project = tb.project; bindSheet(tb.sheetId); file = tb.file; dirty = tb.dirty; hist = tb.hist; redoStack = tb.redoStack;
    Object.keys(views).forEach((k) => delete views[k]); Object.assign(views, tb.views);
    view = { ...tb.view };
    sel = { parts: new Set(), wires: new Set() }; draft = null; trace = null; endTest(true);
    editRev++;
    buildLibrary(); refreshAll(); typeUI(); setHint(); updateTitle(); applyView(); checkDisclaimer();
    if (!tb.viewed) { tb.viewed = true; requestAnimationFrame(fit); }
    autosave();
  }
  function closeTab(i) {
    const go = () => {
      tabs.splice(i, 1);
      // closing the last project leaves a fresh, empty one rather than the example
      if (!tabs.length) { project = null; const d = L.newDoc(t('Untitled project')); d.customColours = clone(userLib.colours || []); loadDoc(d, null, null, true); markClean(); return; }
      active = Math.min(active > i ? active - 1 : active, tabs.length - 1);
      const tb = tabs[active]; project = null; tabs[active] = tb;
      activateNoStash(active);
    };
    if (i === active) stash();
    const tb = tabs[i];
    if (tb.dirty) {
      showModal(t('Close without saving?'), `<p>${esc(tb.project.title)} ${esc(t('has changes that are not saved to a file.'))}</p><div class="row-btns"><button class="btn danger" id="ct-go">${esc(t('Close without saving'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
      $('#ct-go').onclick = () => { closeModal(); go(); };
    } else go();
  }
  function activateNoStash(i) {
    const tb = tabs[i];
    project = tb.project; bindSheet(tb.sheetId); file = tb.file; dirty = tb.dirty; hist = tb.hist; redoStack = tb.redoStack;
    Object.keys(views).forEach((k) => delete views[k]); Object.assign(views, tb.views);
    view = { ...tb.view }; sel = { parts: new Set(), wires: new Set() }; draft = null; trace = null; endTest(true); editRev++;
    buildLibrary(); refreshAll(); typeUI(); setHint(); updateTitle(); applyView(); autosave();
  }
  function pristine() { return !file.name && !dirty && !hist.length; }

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
    const s = L.newSheet(copyOf ? copyOf.name + ' (' + t('copy') + ')' : t('Sheet') + ' ' + (project.sheets.length + 1));
    if (copyOf) {
      const map = {};
      s.parts = copyOf.parts.map((p) => { const q = clone(p); q.id = L.uid('p'); map[p.id] = q.id; return q; });
      s.wires = copyOf.wires.map((w) => { const q = clone(w); q.id = L.uid('w'); q.from.part = map[w.from.part]; q.to.part = map[w.to.part]; return q; });
      if (copyOf.page) s.page = copyOf.page;
      if (copyOf.orientation) s.orientation = copyOf.orientation;
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
    if (project.sheets.length < 2) { toast(t('A project needs at least one sheet.')); return; }
    const s = project.sheets.find((x) => x.id === id);
    pushHistory();
    const i = project.sheets.indexOf(s);
    project.sheets.splice(i, 1);
    if (sheetId === id) goSheet(project.sheets[Math.max(0, i - 1)].id);
    commit(); toast(`${t('Deleted')} ${s.name}`, { label: t('Undo'), run: undo });
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
    $('#sheet-tabs').innerHTML = project.sheets.map((s, i) => `<button class="stab${s.id === sheetId ? ' on' : ''}${trace && trace.sheets.has(s.id) ? ' traced' : ''}" role="tab" aria-selected="${s.id === sheetId}" data-sheet="${s.id}" title="${esc(s.name)}. ${esc(t('Double-click to rename.'))}"><b>${i + 1}</b><span>${esc(s.name)}</span></button>`).join('');
  }
  function renameSheetInline(id) {
    const b = $(`.stab[data-sheet="${id}"]`); if (!b) return;
    const s = project.sheets.find((x) => x.id === id);
    const sp = b.querySelector('span');
    sp.innerHTML = `<input value="${esc(s.name)}" aria-label="${esc(t('Sheet name'))}">`;
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
    if (test) return;
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
    if (project.settings.autoColour && L.suggestColours) {
      try { const sg = L.suggestColours(project, sheetId, w, { inventory: userLib.inventory, limit: 1 }).suggestions[0]; if (sg) { w.colour = sg.colour; if (sg.tracer) w.tracer = sg.tracer; else delete w.tracer; } } catch (e) { console.warn(e); }
    }
    // a pin with a lead colour (the pigtail of a prewired box) gives a new wire its colour
    const lead = [draft.from, end].map((e) => { const p = doc.parts.find((x) => x.id === e.part); const pn = p && L.resolved(doc, p).pins.find((q) => String(q.id) === String(e.pin)); return pn && pn.c && L.colourById(doc, pn.c) ? pn : null; }).find(Boolean);
    if (lead) { w.colour = lead.c; if (lead.tr && L.colourById(doc, lead.tr)) w.tracer = lead.tr; else delete w.tracer; }
    draft = null;
    svg.classList.remove('wiring');
    select([], [w.id]);
    commit();
  }
  function deleteSelection() {
    if (!selCount() || test) return;
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
    clipboard = selectionData();
    try { localStorage.setItem('loomwright.clipboard', JSON.stringify(clipboard)); } catch (e) { /* ignore */ }
    return true;
  }
  function selectionData() {
    const parts = doc.parts.filter((p) => sel.parts.has(p.id));
    const wires = doc.wires.filter((w) => sel.parts.has(w.from.part) && sel.parts.has(w.to.part));
    const custom = project.customParts.filter((c) => parts.some((p) => p.type === c.id));
    return clone({ parts, wires, custom });
  }
  /* Paste parts and wires (from the clipboard or a saved block). at: where the block's top-left goes. */
  /* A saved block, or a starter circuit (ids starting tpl:). */
  function blockById(id) {
    if (String(id).startsWith('tpl:') && L.templateBlock) { try { return L.templateBlock(id.slice(4), project); } catch (e) { toast(e.message); return null; } }
    return (userLib.blocks || []).find((x) => x.id === id) || null;
  }
  function insertBlock(cb, offset = 40, at = null) {
    if (!cb || !cb.parts.length || test) return;
    pushHistory();
    (cb.custom || []).forEach((c) => { if (!project.customParts.some((x) => x.id === c.id)) project.customParts.push(clone(c)); });
    let dx = offset, dy = offset;
    if (at) { const b = L.bounds({ ...doc, parts: cb.parts, wires: [], customParts: project.customParts, settings: project.settings }); dx = snap(at.x - b.x - b.w / 2); dy = snap(at.y - b.y - b.h / 2); }
    const map = {}, relabel = {};
    const newParts = cb.parts.map((p) => {
      const q = clone(p); q.id = L.uid('p'); map[p.id] = q.id; q.x += dx; q.y += dy;
      // a label used more than once in the block (a coil and its contacts) keeps one new label
      const d = L.partDef(doc, q.type); if (d && d.prefix && q.label && !d.noLabel) { const nl = relabel[q.label] || L.nextLabel(doc, d.prefix); relabel[q.label] = nl; q.label = nl; }
      doc.parts.push(q); return q;
    });
    // keep connector pairs in the block mated to each other
    newParts.forEach((q) => { if (q.props && q.props.mate && relabel[q.props.mate]) q.props.mate = relabel[q.props.mate]; });
    const newWires = cb.wires.map((w) => {
      const q = clone(w); q.id = L.uid('w'); q.name = L.nextWireName(doc);
      q.from.part = map[w.from.part]; q.to.part = map[w.to.part];
      if (q.points) q.points = q.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      doc.wires.push(q); return q;
    });
    // starter circuits are laid out neatly around their parts where they land
    if (String(cb.id || '').startsWith('tpl:') && L.tidyWires) { try { L.tidyWires(doc, newWires.map((w) => w.id)); } catch (e) { console.warn(e); } }
    select(newParts.map((p) => p.id), newWires.map((w) => w.id));
    commit();
  }
  /* Lay the selected wires (or every wire on the sheet) out with square corners around the parts. */
  function tidyCmd() {
    if (!L.tidyWires || test) return;
    const ids = [...sel.wires];
    if (!ids.length && sel.parts.size) doc.wires.forEach((w) => { if (sel.parts.has(w.from.part) || sel.parts.has(w.to.part)) ids.push(w.id); });
    pushHistory();
    const n = L.tidyWires(doc, ids);
    commit();
    toast(`${t('Tidied')} ${plural(n, t('wire'))}`, { label: t('Undo'), run: undo });
  }
  function paste(offset = 40) {
    let cb = clipboard;
    if (!cb) { try { cb = JSON.parse(localStorage.getItem('loomwright.clipboard') || 'null'); } catch (e) { cb = null; } }
    insertBlock(cb, offset);
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

  /* ---------------- Align and distribute ---------------- */
  function selectedBoxes() { return [...sel.parts].map((id) => partById(id)).filter(Boolean).map((p) => ({ p, b: L.partBox(doc, p) })); }
  function align(how) {
    const items = selectedBoxes();
    if (items.length < 2) { toast(t('Select two or more parts to align.')); return; }
    pushHistory();
    const xs = items.map((i) => i.b.x), xe = items.map((i) => i.b.x + i.b.w), ys = items.map((i) => i.b.y), ye = items.map((i) => i.b.y + i.b.h);
    const L0 = Math.min(...xs), R0 = Math.max(...xe), T0 = Math.min(...ys), B0 = Math.max(...ye);
    const cx = snap((L0 + R0) / 2), cy = snap((T0 + B0) / 2);
    items.forEach(({ p, b }) => {
      let dx = 0, dy = 0;
      if (how === 'left') dx = L0 - b.x; else if (how === 'right') dx = R0 - (b.x + b.w); else if (how === 'centre') dx = cx - (b.x + b.w / 2);
      else if (how === 'top') dy = T0 - b.y; else if (how === 'bottom') dy = B0 - (b.y + b.h); else if (how === 'middle') dy = cy - (b.y + b.h / 2);
      moveParts([p.id], snap(dx), snap(dy));
    });
    commit();
  }
  function distribute(axis) {
    const items = selectedBoxes();
    if (items.length < 3) { toast(t('Select three or more parts to space evenly.')); return; }
    pushHistory();
    const key = axis === 'h' ? (i) => i.b.x + i.b.w / 2 : (i) => i.b.y + i.b.h / 2;
    items.sort((a, b) => key(a) - key(b));
    const first = key(items[0]), last = key(items[items.length - 1]), step = (last - first) / (items.length - 1);
    items.forEach((it, i) => { const target = first + step * i, d = snap(target - key(it)); moveParts([it.p.id], axis === 'h' ? d : 0, axis === 'h' ? 0 : d); });
    commit();
  }
  /* Guide lines while dragging: where the moving parts line up with others. */
  function guidesFor() {
    const moving = selectedBoxes(); if (!moving.length) return [];
    const bx = Math.min(...moving.map((i) => i.b.x)), by = Math.min(...moving.map((i) => i.b.y)), bx2 = Math.max(...moving.map((i) => i.b.x + i.b.w)), by2 = Math.max(...moving.map((i) => i.b.y + i.b.h));
    const vx = [bx, (bx + bx2) / 2, bx2], hy = [by, (by + by2) / 2, by2], out = [];
    doc.parts.forEach((p) => {
      if (sel.parts.has(p.id)) return;
      const b = L.partBox(doc, p);
      [b.x, b.x + b.w / 2, b.x + b.w].forEach((x) => { if (vx.some((v) => Math.abs(v - x) < 0.5)) out.push({ x1: x, x2: x, y1: Math.min(by, b.y) - 20, y2: Math.max(by2, b.y + b.h) + 20 }); });
      [b.y, b.y + b.h / 2, b.y + b.h].forEach((y) => { if (hy.some((v) => Math.abs(v - y) < 0.5)) out.push({ y1: y, y2: y, x1: Math.min(bx, b.x) - 20, x2: Math.max(bx2, b.x + b.w) + 20 }); });
    });
    return out.slice(0, 12);
  }

  /* ---------------- Undo ---------------- */
  function restore(snap_) { const s = JSON.parse(snap_); project = s.project; bindSheet(s.sheetId); }
  function undo() { if (!hist.length) return; redoStack.push(snapshot()); restore(hist.pop()); afterSwap(); }
  function redo() { if (!redoStack.length) return; hist.push(snapshot()); restore(redoStack.pop()); afterSwap(); }
  function afterSwap() {
    ['parts', 'wires'].forEach((k) => sel[k].forEach((id) => { if (!(k === 'parts' ? partById(id) : wireById(id))) sel[k].delete(id); }));
    draft = null; markDirty(); buildLibrary(); commit(); setHint();
  }

  /* ---------------- Circuit trace ---------------- */
  function startTrace(sid, end) {
    const net = L.netOf(project, sid, end);
    if (!net) { toast(t('Nothing connected there.')); return; }
    trace = { seed: { sid, end }, name: net.name };
    fillTrace(net);
    refreshTraceUI();
  }
  function fillTrace(net) {
    trace.net = net; trace.name = net.name;
    trace.wires = new Set(net.wires.map((x) => x.wire.id));
    trace.parts = new Set(net.pins.map((x) => x.part.id));
    trace.sheets = new Set(net.wires.map((x) => x.sheet.id).concat(net.pins.map((x) => x.sheet.id)));
  }
  function retrace() {
    if (trace.fault) return;
    const s = project.sheets.find((x) => x.id === trace.seed.sid);
    const ok = s && s.parts.some((p) => p.id === trace.seed.end.part);
    const net = ok && L.netOf(project, trace.seed.sid, trace.seed.end);
    if (!net) { trace = null; return; }
    fillTrace(net);
  }
  function clearTrace() { if (!trace) return; trace = null; refreshTraceUI(); }
  function refreshTraceUI() { render(); sheetTabs(); inspector.force = true; inspector(); inspector.force = false; setHint(); $$('[data-cmd="trace"]').forEach((b) => b.classList.toggle('on', !!trace)); if (tab === 'nets' || tab === 'wires') tables(); }

  /* ---------------- Live circuit test ---------------- */
  function startTest() {
    if (test) return;
    draft = null; svg.classList.remove('wiring'); trace = null;
    test = { state: {}, sim: null, sol: null };
    runTest();
    document.body.classList.add('testing');
    sel = { parts: new Set(), wires: new Set() };
    refreshAll(); setHint();
    $$('[data-cmd="test"]').forEach((b) => b.classList.add('on'));
    toast(t('Live test on. Click switches and fuses to operate them.'));
  }
  function endTest(quiet) {
    if (!test) return;
    test = null;
    document.body.classList.remove('testing');
    $$('[data-cmd="test"]').forEach((b) => b.classList.remove('on'));
    if (!quiet) { refreshAll(); setHint(); }
  }
  function setTestState(key, v) { test.state[key] = v; runTest(); render(); inspector.force = true; inspector(); inspector.force = false; }
  /* Connections first (what is live), then the solver for volts and amps. A solver problem never stops the test. */
  function runTest() {
    test.sim = L.simulate(project, test.state, { relays: test.sim && test.sim.relays });
    try { test.sol = L.solveCircuit ? L.solveCircuit(project, test.state, { battery: test.battery, relays: test.sim.relays }) : null; } catch (e) { test.sol = null; console.warn('circuit solver', e); }
  }
  function operate(p) {
    const st = L.partStates(doc, p);
    if (!st) return false;
    if (st.follows) { toast(t('This contact follows its coil') + ' ' + st.follows.split('|').pop()); return true; }
    const cur = test.state[st.key] != null ? test.state[st.key] : st.def;
    setTestState(st.key, (cur + 1) % st.states.length);
    return true;
  }

  /* ---------------- Pointer input ---------------- */
  svg.addEventListener('pointerdown', (e) => {
    svg.focus({ preventScroll: true });
    closeMenus();
    const tg = e.target, w = world(e);
    mouse = w;
    if (e.button === 2) return;
    if (e.button === 1 || spaceDown) { startPan(e); return; }
    const pinEl = tg.closest('[data-pin]'), wpEl = tg.closest('[data-wp]'), midEl = tg.closest('[data-mid]'), partEl = tg.closest('[data-part]'), wireEl = tg.closest('[data-wire]'), labEl = tg.closest('[data-wlab]'), xrefEl = tg.closest('[data-xref]');
    if (xrefEl) { followXref(xrefEl.dataset.xref); return; }
    if (test) {
      if (partEl && operate(partById(partEl.dataset.part))) return;
      startPan(e); return;
    }
    if (e.altKey && (pinEl || wireEl)) {
      if (pinEl) { const [pid, ...rest] = pinEl.dataset.pin.split('|'); startTrace(sheetId, { part: pid, pin: rest.join('|') }); }
      else { const wr = wireById(wireEl.dataset.wire); if (wr) startTrace(sheetId, wr.from); }
      return;
    }
    svg.setPointerCapture(e.pointerId);
    if (pinEl) {
      const [pid, ...rest] = pinEl.dataset.pin.split('|');
      drag = { mode: 'pinpress', end: { part: pid, pin: rest.join('|') }, sx: e.clientX, sy: e.clientY, start: w, shift: e.shiftKey };
      return;
    }
    if (wpEl) { const [wid, i] = wpEl.dataset.wp.split('|'); pushHistory(); drag = { mode: 'wp', wid, i: +i }; return; }
    if (midEl) { const wire = wireById(midEl.dataset.mid); pushHistory(); drag = { mode: 'mid', wid: wire.id, start: w, dx0: wire.dx || 0 }; return; }
    if (draft) { draft.points.push({ x: snap(w.x), y: snap(w.y) }); renderOverlay(); return; }
    if (labEl && !e.shiftKey) {
      const wr = wireById(labEl.dataset.wlab);
      if (!sel.wires.has(wr.id) || selCount() > 1) select([], [wr.id]);
      drag = { mode: 'lab', wid: wr.id, start: w, base: { dx: (wr.lab || {}).dx || 0, dy: (wr.lab || {}).dy || 0 }, moved: false };
      return;
    }
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
  function followXref(partId) {
    const xr = L.xrefs(project).get(partId);
    if (!xr || !xr.length) return;
    const tgt = xr[0];
    goSheet(tgt.sheetId); select([tgt.part]); centreOnSelection();
  }
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
    const pg = L.pageOf(doc);
    stXY.textContent = `X ${snap(w.x)}  Y ${snap(w.y)}${pg ? '  ' + L.zoneOf(pg, w.x, w.y) : ''}`;
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
        if (drag.moved) { moveParts([...sel.parts], dx, dy, drag.base); drag.guides = guidesFor(); render(); }
        break;
      }
      case 'lab': {
        const dx = w.x - drag.start.x, dy = w.y - drag.start.y;
        if (!drag.moved && Math.hypot(dx, dy) * view.k > 3) { pushHistory(); drag.moved = true; }
        if (drag.moved) { const wr = wireById(drag.wid); wr.lab = { dx: Math.round(drag.base.dx + dx), dy: Math.round(drag.base.dy + dy) }; render(); }
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
    if (d.mode === 'move') { renderOverlay(); if (d.moved) commit(); }
    if (d.mode === 'lab' && d.moved) commit();
    if (d.mode === 'wp' || d.mode === 'mid') commit();
  });
  svg.addEventListener('dblclick', (e) => {
    if (test) return;
    const tg = e.target, w = world(e);
    const wpEl = tg.closest('[data-wp]');
    if (wpEl) { const [wid, i] = wpEl.dataset.wp.split('|'); const wr = wireById(wid); pushHistory(); wr.points.splice(+i, 1); commit(); return; }
    const labEl = tg.closest('[data-wlab]');
    if (labEl) { const wr = wireById(labEl.dataset.wlab); if (wr.lab) { pushHistory(); delete wr.lab; commit(); } return; }
    const wireEl = tg.closest('[data-wire]');
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
    const partEl = tg.closest('[data-part]');
    if (partEl) { const f = $('#inspector input, #inspector textarea'); if (f) f.focus(); }
  });
  function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l));
    return Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy);
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
    const k2 = Math.max(0.1, Math.min(5, view.k * factor));
    view.x = sx - (sx - view.x) * (k2 / view.k); view.y = sy - (sy - view.y) * (k2 / view.k); view.k = k2;
    applyView(); renderOverlay();
  }
  function zoomBy(f) { const r = svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, f); }
  function fit() {
    const b = L.sheetBounds(doc), r = svg.getBoundingClientRect();
    if (!r.width) return;
    const k = Math.max(0.1, Math.min(1.6, Math.min((r.width - 60) / b.w, (r.height - 60) / b.h)));
    view.k = k; view.x = (r.width - b.w * k) / 2 - b.x * k; view.y = (r.height - b.h * k) / 2 - b.y * k;
    applyView(); renderOverlay();
  }

  // Drag and drop from the library
  svg.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-loom-part') || e.dataTransfer.types.includes('text/x-loom-block')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  svg.addEventListener('drop', (e) => {
    const type = e.dataTransfer.getData('text/x-loom-part'), block = e.dataTransfer.getData('text/x-loom-block');
    if (!type && !block) return;
    e.preventDefault();
    if (block) { const b = blockById(block); if (b) insertBlock(b, 0, world(e)); return; }
    addPartAt(type, world(e));
  });

  /* ---------------- Keyboard ---------------- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F1' && window.LoomManualViewer && !window.LoomManualViewer.isOpen()) { e.preventDefault(); openManual(true); return; }
    if (!$('#builder').hidden || ($('#views') && !$('#views').hidden)) return;
    if (!$('#palette').hidden) return; // the palette handles its own keys
    if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
    const tag = (e.target.tagName || '').toUpperCase();
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'k') { e.preventDefault(); openPalette(); return; }
    if (mod && k === 's') { e.preventDefault(); e.shiftKey ? saveAs() : save(); return; }
    if (mod && k === 'o') { e.preventDefault(); openFile(); return; }
    if (mod && k === 'p') { e.preventDefault(); printDiagram(); return; }
    if (mod && k === 'f') { e.preventDefault(); findModal(); return; }
    if (e.key === 'Escape' && $('.menu.open')) { closeMenus(); return; }
    if (typing) return;
    if (test) {
      if (e.key === 'Escape') endTest();
      else if (e.key === '+' || e.key === '=') zoomBy(1.2); else if (e.key === '-') zoomBy(1 / 1.2); else if (e.key === '0') fit();
      else if (e.key === 'PageDown') { e.preventDefault(); stepSheet(1); } else if (e.key === 'PageUp') { e.preventDefault(); stepSheet(-1); }
      else if (e.key === ' ') { spaceDown = true; e.preventDefault(); }
      return;
    }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && k === 'y') { e.preventDefault(); redo(); }
    else if (mod && k === 'c') { if (copySelection()) toast(t('Copied')); }
    else if (mod && k === 'x') { if (copySelection()) deleteSelection(); }
    else if (mod && k === 'v') { e.preventDefault(); paste(); }
    else if (mod && k === 'd') { e.preventDefault(); if (copySelection()) paste(20); }
    else if (mod && k === 'a') { e.preventDefault(); select(doc.parts.map((p) => p.id), doc.wires.map((w) => w.id)); }
    else if (mod && k === 'h') { e.preventDefault(); findModal(true); }
    else if (e.key === 'PageDown' || (mod && e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); stepSheet(1); }
    else if (e.key === 'PageUp' || (mod && e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); stepSheet(-1); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    else if (k === 'r' && !mod) rotateSelection(e.shiftKey ? -1 : 1);
    else if (k === 'f' && !mod) flipSelection();
    else if (k === 't' && !mod && e.shiftKey) runCommand('tidy');
    else if (k === 't' && !mod) runCommand('trace');
    else if (e.key === 'Escape') { if (draft) { draft = null; svg.classList.remove('wiring'); render(); setHint(); } else if (trace) clearTrace(); else clearSel(); }
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
  function blockIcon(b) {
    const fake = L.normalise({ customParts: b.custom || [], sheets: [{ id: 's', name: 's', parts: b.parts, wires: b.wires }] });
    const v = L.view(fake, 0), bb = L.bounds(v), pad = 10;
    return `<svg viewBox="${bb.x - pad} ${bb.y - pad} ${bb.w + pad * 2} ${bb.h + pad * 2}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${L.renderDiagram(v, { mode: 'export', xref: null, clouds: null })}</svg>`;
  }
  function libraryItems() { return Object.values(L.LIBRARY).concat(userLib.parts, project.customParts.filter((c) => !userLib.parts.some((u) => u.id === c.id))); }
  function buildLibrary() {
    const q = $('#lib-search').value.trim().toLowerCase();
    const items = libraryItems();
    const match = (d) => !q || (d.name + ' ' + d.cat + ' ' + (d.prefix || '') + ' ' + (d.tags || '')).toLowerCase().includes(q);
    const type = ptype(), FIRST = { household: ['Household', 'Loads library', 'Wiring & connectors'], factory: ['Factory & panels', 'Loads library', 'Household', 'Relays & control', 'Wiring & connectors'], electronics: ['Electronics', 'Power & charging', 'Switches', 'Wiring & connectors'] }[type] || [];
    const MAINS_CATS = ['Household', 'Factory & panels', 'Loads library'];
    const cats = ['Starter circuits', 'My blocks', 'My components', ...FIRST, ...L.CATEGORIES.filter((c) => !FIRST.includes(c))];
    const openByType = (cat) => (type === 'mixed' ? true : FIRST.length ? FIRST.includes(cat) || cat === 'Annotation' : !MAINS_CATS.includes(cat));
    const openState = {};
    if (buildLibrary.type === type) $$('#lib-list details').forEach((d) => { openState[d.dataset.cat] = d.open; });
    buildLibrary.type = type;
    let html = '';
    cats.forEach((cat) => {
      if (cat === 'Starter circuits') {
        if (!L.templateList) return;
        const kind = project.settings.projectType || 'vehicle';
        const tl = L.templateList().filter((x) => (q ? (x.name + ' ' + x.description).toLowerCase().includes(q) : x.kind === kind || kind === 'mixed'));
        if (!tl.length) return;
        const open = q ? true : openState[cat] !== undefined ? openState[cat] : false;
        html += `<details class="lib-cat" data-cat="${esc(cat)}"${open ? ' open' : ''}><summary>${esc(t(cat))} <span>${tl.length}</span></summary><div class="lib-grid">`;
        html += tl.map((x) => { let icon = ''; try { icon = blockIcon(L.templateBlock(x.id, project)); } catch (e) { icon = ''; } return `<button class="lib-item" draggable="true" data-block="tpl:${esc(x.id)}" title="${esc(t(x.name) + '. ' + t(x.description))}">${icon}<span>${esc(t(x.name))}</span></button>`; }).join('');
        html += '</div></details>';
        return;
      }
      if (cat === 'My blocks') {
        const bl = (userLib.blocks || []).filter((b) => !q || b.name.toLowerCase().includes(q));
        if (!bl.length && q) return;
        const open = q ? true : openState[cat] !== undefined ? openState[cat] : bl.length > 0;
        html += `<details class="lib-cat" data-cat="${esc(cat)}"${open ? ' open' : ''}><summary>${esc(t(cat))} <span>${bl.length}</span></summary>`;
        if (!bl.length) html += `<p class="lib-empty">${esc(t('Select parts and wires, then use Edit, Save selection as block. Blocks drop in with fresh references.'))}</p>`;
        html += '<div class="lib-grid">' + bl.map((b) => `<button class="lib-item" draggable="true" data-block="${esc(b.id)}" title="${esc(b.name)}">${blockIcon(b)}<span>${esc(b.name)}</span><span class="edit" data-del-block="${esc(b.id)}" title="${esc(t('Delete block'))}">✕</span></button>`).join('') + '</div></details>';
        return;
      }
      const list = items.filter((d) => (d.custom ? 'My components' : d.cat) === cat && match(d));
      if (!list.length && !(cat === 'My components' && !q)) return;
      const open = q ? true : openState[cat] !== undefined ? openState[cat] : cat === 'My components' || openByType(cat);
      html += `<details class="lib-cat" data-cat="${esc(cat)}"${open ? ' open' : ''}><summary>${esc(t(cat))} <span>${list.length}</span></summary>`;
      if (cat === 'My components' && !list.length) html += `<p class="lib-empty">${esc(t('Components you draw in the builder, or that Claude makes from a picture, appear here.'))}</p>`;
      html += '<div class="lib-grid">' + list.map((d) => `<button class="lib-item" draggable="true" data-type="${esc(d.id)}" title="${esc(d.name)}">${iconSVG(d.id)}<span>${esc(d.name)}</span>${d.custom ? `<span class="edit" data-edit="${esc(d.id)}" title="${esc(t('Edit component'))}">${esc(t('Edit'))}</span>` : ''}</button>`).join('') + '</div>';
      if (cat === 'My components') html += `<div class="lib-actions"><button class="btn" data-cmd="builder">${esc(t('New'))}</button><button class="btn" data-cmd="lib-import">${esc(t('Import'))}</button><button class="btn" data-cmd="lib-export"${userLib.parts.length || (userLib.blocks || []).length ? '' : ' disabled'}>${esc(t('Export'))}</button></div>`;
      html += '</details>';
    });
    $('#lib-list').innerHTML = html || `<p class="lib-empty">${esc(t('No components match.'))}</p>`;
  }
  $('#lib-search').addEventListener('input', buildLibrary);
  $('#lib-list').addEventListener('click', (e) => {
    const db = e.target.closest('[data-del-block]');
    if (db) { e.stopPropagation(); const b = userLib.blocks.find((x) => x.id === db.dataset.delBlock); userLib.blocks = userLib.blocks.filter((x) => x !== b); PF.saveUserLibrary(userLib); buildLibrary(); toast(`${t('Deleted')} ${b.name}`, { label: t('Undo'), run: () => { userLib.blocks.push(b); PF.saveUserLibrary(userLib); buildLibrary(); } }); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { e.stopPropagation(); window.LoomBuilder.open(defOf(ed.dataset.edit)); return; }
    const bl = e.target.closest('[data-block]');
    if (bl) { const b = blockById(bl.dataset.block); if (b) insertBlock(b, 0, centreWorld()); return; }
    const it = e.target.closest('.lib-item');
    if (it) addPartAt(it.dataset.type);
  });
  $('#lib-list').addEventListener('dragstart', (e) => {
    const it = e.target.closest('.lib-item');
    if (!it) return;
    if (it.dataset.block) e.dataTransfer.setData('text/x-loom-block', it.dataset.block);
    else e.dataTransfer.setData('text/x-loom-part', it.dataset.type);
    e.dataTransfer.effectAllowed = 'copy';
  });
  function saveBlockModal() {
    if (!sel.parts.size) { toast(t('Select the parts (and the wires between them) first.')); return; }
    const data = selectionData();
    showModal(t('Save selection as block'), `<p class="muted">${esc(t('A block is a reusable circuit, such as a relay-switched lamp. It is saved in your library and appears under Parts, My blocks.'))}</p>
      <label class="fld"><span>${esc(t('Name'))}</span><input id="blk-name" value="${esc(t('My circuit') + ' ' + ((userLib.blocks || []).length + 1))}"></label>
      <p class="muted">${plural(data.parts.length, t('part'))}, ${plural(data.wires.length, t('wire'))}.</p>
      <div class="row-btns"><button class="btn primary" id="blk-save">${esc(t('Save block'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    const inp = $('#blk-name'); inp.focus(); inp.select();
    const go = () => {
      const name = inp.value.trim() || t('Block');
      userLib.blocks = userLib.blocks || [];
      userLib.blocks.push({ id: L.uid('blk'), name, ...data });
      PF.saveUserLibrary(userLib); closeModal(); showPane('parts'); buildLibrary(); const det = $('#lib-list details[data-cat="My blocks"]'); if (det) det.open = true;
      toast(`${t('Saved block')} ${name}`);
    };
    $('#blk-save').onclick = go;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  /* ---------------- Left pane: Parts / Project / History ---------------- */
  function showPane(which) {
    pane = which;
    $('#task').hidden = !which;
    if (which) {
      $$('.ptab').forEach((b) => b.classList.toggle('on', b.dataset.pane === which));
      $('#pane-parts').hidden = which !== 'parts';
      $('#pane-project').hidden = which !== 'project';
      $('#pane-history').hidden = which !== 'history';
      if (which === 'project') projectPane();
      if (which === 'history') historyPane();
    }
    $('#rb-parts').classList.toggle('on', which === 'parts');
    $('#rb-project').classList.toggle('on', which === 'project');
    $('#rb-history').classList.toggle('on', which === 'history');
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
    const fl = (label, key, val, extra = '') => `<label class="fld"><span>${esc(t(label))}</span><input data-pf="${key}" value="${esc(val == null ? '' : val)}" ${extra}></label>`;
    el.innerHTML = `<div class="proj">
      <div class="sec"><h3>${esc(t('Project'))}</h3>
        ${fl('Title', 'title', project.title)}
        ${fl('Vehicle', 'meta:project', m.project, 'placeholder="e.g. Defender 110 Td5"')}
        ${fl('Drawn by', 'meta:drawnBy', m.drawnBy)}
        <div class="two">${fl('Revision', 'meta:revision', m.revision)}${fl('Date', 'meta:date', m.date, 'type="date"')}</div>
      </div>
      <div class="sec"><h3>${esc(t('Sheets'))}</h3>
        <div class="list">${project.sheets.map((s, i) => `<div class="list-row${s.id === sheetId ? ' on' : ''}" data-row-sheet="${s.id}">
          <span class="num">${i + 1}</span><input data-sheet-name="${s.id}" value="${esc(s.name)}" aria-label="${esc(t('Sheet name'))}">
          <span class="meta" title="${plural(s.parts.length, t('part'))}, ${plural(s.wires.length, t('wire'))}">${s.wires.length}w</span>
          <button class="iconbtn" data-sheet-act="up" title="${esc(t('Move up'))}" aria-label="${esc(t('Move up'))}"${i ? '' : ' disabled'}><svg class="i"><use href="#i-up"/></svg></button>
          <button class="iconbtn" data-sheet-act="down" title="${esc(t('Move down'))}" aria-label="${esc(t('Move down'))}"${i < project.sheets.length - 1 ? '' : ' disabled'}><svg class="i"><use href="#i-down"/></svg></button>
          <button class="iconbtn" data-sheet-act="del" title="${esc(t('Delete sheet'))}" aria-label="${esc(t('Delete sheet'))}"${project.sheets.length > 1 ? '' : ' disabled'}><svg class="i"><use href="#i-x"/></svg></button>
        </div>`).join('')}</div>
        <div class="row-btns"><button class="btn" data-cmd="sheet-new">${esc(t('Add sheet'))}</button><button class="btn" data-cmd="sheet-dup">${esc(t('Duplicate this sheet'))}</button></div>
      </div>
      <div class="sec"><h3>${esc(t('Harnesses'))}</h3>
        <p class="muted" style="margin:0">${esc(t('Group wires by the loom they run in. A colour can be reused in different harnesses; the Colour usage list shows every use.'))}</p>
        <div class="list">${project.harnesses.length ? project.harnesses.map((h, i) => `<div class="list-row" data-row-harness="${i}"><input data-harness-name="${i}" value="${esc(h)}" aria-label="${esc(t('Harness name'))}"><span class="meta">${counts[h] || 0}w</span><button class="iconbtn" data-harness-board="${i}" title="${esc(t('Formboard'))}" aria-label="${esc(t('Formboard'))}"><svg class="i"><use href="#i-board"/></svg></button><button class="iconbtn" data-harness-del="${i}" title="${esc(t('Remove harness'))}" aria-label="${esc(t('Remove harness'))}"><svg class="i"><use href="#i-x"/></svg></button></div>`).join('') : `<div class="list-row"><span class="muted">${esc(t('No harnesses yet.'))}</span></div>`}</div>
        <div class="row-btns"><button class="btn" data-proj-act="harness-add">${esc(t('Add harness'))}</button><button class="btn" data-cmd="usage">${esc(t('Colour usage'))}</button><button class="btn" data-cmd="formboard">${esc(t('Formboard'))}</button></div>
      </div>
      <div class="sec"><h3>${esc(t('Cables'))}</h3>
        <p class="muted" style="margin:0">${esc(t('Multicore, twisted pair and screened cables. Pick one on a wire to make that wire a core of it.'))}</p>
        <div class="list">${(project.cables || []).length ? project.cables.map((c) => `<div class="list-row"><span>${esc(c.name)}</span><span class="meta">${esc((L.CABLE_TYPES.find((x) => x[0] === c.type) || [0, c.type])[1])}${c.cores ? ', ' + c.cores + ' ' + t('cores') : ''}</span></div>`).join('') : `<div class="list-row"><span class="muted">${esc(t('No cables yet.'))}</span></div>`}</div>
        <div class="row-btns"><button class="btn" data-cmd="cables">${esc(t('Cables…'))}</button></div>
      </div>
      <div class="sec"><h3>${esc(t('Totals'))}</h3>
        <div class="kv"><span>${esc(t('Sheets'))}</span><b>${project.sheets.length}</b><span>${esc(t('Parts'))}</span><b>${project.sheets.reduce((a, s) => a + s.parts.length, 0)}</b><span>${esc(t('Wires'))}</span><b>${project.sheets.reduce((a, s) => a + s.wires.length, 0)}</b><span>${esc(t('Cable'))}</span><b>${project.sheets.reduce((a, s) => a + s.wires.reduce((b, w) => b + (parseFloat(w.length) || 0), 0), 0).toFixed(1)} m</b></div>
      </div>
    </div>`;
  }
  {
    const pp = $('#pane-project');
    let before = null;
    pp.addEventListener('focusin', (e) => { if (e.target.matches('input')) before = snapshot(); });
    pp.addEventListener('input', (e) => {
      const tg = e.target;
      if (tg.dataset.pf) {
        const k = tg.dataset.pf;
        if (k === 'title') { project.title = tg.value; updateTitle(); } else project.meta[k.slice(5)] = tg.value;
      }
    });
    pp.addEventListener('change', (e) => {
      const tg = e.target;
      if (tg.dataset.sheetName) { const s = project.sheets.find((x) => x.id === tg.dataset.sheetName); const v = tg.value.trim(); if (s && v) s.name = v; }
      if (tg.dataset.harnessName != null) {
        const i = +tg.dataset.harnessName, old = project.harnesses[i], v = tg.value.trim();
        if (v && v !== old) {
          project.harnesses[i] = v;
          project.sheets.forEach((s) => s.wires.forEach((w) => { if (w.harness === old) w.harness = v; }));
          if (project.harnessLayouts[old]) { project.harnessLayouts[v] = project.harnessLayouts[old]; delete project.harnessLayouts[old]; }
        }
      }
      if (before && before !== snapshot()) { hist.push(before); redoStack = []; markDirty(); }
      before = snapshot(); tg.blur();
      commit();
    });
    pp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
    pp.addEventListener('click', (e) => {
      const sa = e.target.closest('[data-sheet-act]');
      if (sa) { const id = sa.closest('[data-row-sheet]').dataset.rowSheet; const a = sa.dataset.sheetAct; if (a === 'up') moveSheet(id, -1); else if (a === 'down') moveSheet(id, 1); else deleteSheet(id); return; }
      const hb = e.target.closest('[data-harness-board]');
      if (hb) { openFormboard(project.harnesses[+hb.dataset.harnessBoard]); return; }
      const hd = e.target.closest('[data-harness-del]');
      if (hd) {
        const i = +hd.dataset.harnessDel, h = project.harnesses[i];
        pushHistory(); project.harnesses.splice(i, 1);
        project.sheets.forEach((s) => s.wires.forEach((w) => { if (w.harness === h) w.harness = ''; }));
        commit(); return;
      }
      if (e.target.closest('[data-proj-act="harness-add"]')) {
        pushHistory();
        let n = project.harnesses.length + 1; while (project.harnesses.includes(t('Harness') + ' ' + n)) n++;
        project.harnesses.push(t('Harness') + ' ' + n); commit();
        const inp = $(`#pane-project [data-harness-name="${project.harnesses.length - 1}"]`); if (inp) { inp.focus(); inp.select(); }
        return;
      }
      const row = e.target.closest('[data-row-sheet]');
      if (row && !e.target.closest('input,button')) goSheet(row.dataset.rowSheet);
    });
  }

  /* ---------------- History pane: revisions and save points ---------------- */
  const fmtTime = (ms) => { const d = new Date(ms); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
  let historyToken = 0;
  function historyPane() {
    const el = $('#pane-history');
    if (!el || el.hidden) return;
    const revs = (project.revisions || []).slice().reverse(), s = project.settings;
    const sinceChanges = revs.length ? L.compareRevisions(project, revs[0].id, 'current').count : null;
    el.innerHTML = `<div class="proj">
      <div class="sec"><h3>${esc(t('Revision'))}</h3>
        <div class="kv"><span>${esc(t('Current revision'))}</span><b>${esc(project.meta.revision || '—')}</b><span>${esc(t('Issued revisions'))}</span><b>${revs.length}</b>${sinceChanges != null ? `<span>${esc(t('Changes since'))} ${esc(revs[0].rev)}</span><b>${sinceChanges}</b>` : ''}</div>
        <div class="row-btns"><button class="btn primary" data-cmd="rev-issue">${esc(t('Issue revision…'))}</button><button class="btn" data-cmd="rev-compare"${revs.length ? '' : ' disabled'}>${esc(t('Compare…'))}</button></div>
        <label class="fld stack"><span>${esc(t('Revision clouds on drawings'))}</span><select data-hist="clouds"><option value="">${esc(t('None'))}</option>${revs.map((r) => `<option value="${esc(r.id)}"${s.clouds === r.id ? ' selected' : ''}>${esc(t('Changes since rev'))} ${esc(r.rev)}</option>`).join('')}</select></label>
      </div>
      <div class="sec"><h3>${esc(t('Issued revisions'))}</h3>
        ${revs.length ? `<div class="revs">${revs.map((r) => `<div class="rev" data-rev="${esc(r.id)}"><div class="rev-h"><b>${esc(r.rev)}</b><span>${esc(r.date)}</span><span class="muted">${esc(r.by || '')}</span></div><div class="rev-d">${esc(r.description || '')}</div>
          <div class="row-btns"><button class="btn sm" data-rev-act="compare">${esc(t('Compare with now'))}</button><button class="btn sm" data-rev-act="open">${esc(t('Open copy'))}</button><button class="btn sm" data-rev-act="restore">${esc(t('Restore'))}</button></div></div>`).join('')}</div>`
        : `<p class="muted" style="margin:0">${esc(t('No revisions yet. Issue a revision when you release a drawing set: it records the whole project so you can compare or go back later, and fills the revision table on every sheet.'))}</p>`}
      </div>
      <div class="sec"><h3>${esc(t('Save points on this computer'))}</h3>
        <p class="muted" style="margin:0">${esc(t('Kept automatically every time you save and every ten minutes while you work.'))}</p>
        <div class="list" id="sp-list"><div class="list-row"><span class="muted">${esc(t('Loading…'))}</span></div></div>
        <div class="row-btns"><button class="btn" data-cmd="savepoint">${esc(t('Keep a save point now'))}</button></div>
      </div>
    </div>`;
    const tok = ++historyToken;
    SavePoints.list(project.id).then((list) => {
      if (tok !== historyToken) return;
      const box = $('#sp-list'); if (!box) return;
      box.innerHTML = list.length ? list.map((x) => `<div class="list-row" data-sp="${x.id}"><span class="sp-t">${esc(fmtTime(x.time))}</span><span class="meta">${esc(t(x.why || ''))} · rev ${esc(x.rev || '')} · ${x.wires}w</span><button class="iconbtn" data-sp-act="open" title="${esc(t('Open copy'))}" aria-label="${esc(t('Open copy'))}"><svg class="i"><use href="#i-open"/></svg></button><button class="iconbtn" data-sp-act="restore" title="${esc(t('Restore'))}" aria-label="${esc(t('Restore'))}"><svg class="i"><use href="#i-undo"/></svg></button></div>`).join('') : `<div class="list-row"><span class="muted">${esc(t('None yet.'))}</span></div>`;
    });
  }
  {
    const hp = $('#pane-history');
    hp.addEventListener('change', (e) => {
      if (e.target.dataset.hist === 'clouds') { pushHistory(); project.settings.clouds = e.target.value; commit(); toast(e.target.value ? t('Clouds drawn around changes since that revision') : t('Clouds off')); }
    });
    hp.addEventListener('click', async (e) => {
      const ra = e.target.closest('[data-rev-act]');
      if (ra) {
        const r = L.revisionById(project, ra.closest('[data-rev]').dataset.rev), act = ra.dataset.revAct;
        if (act === 'compare') compareModal(r.id, 'current');
        if (act === 'open') openSnapshotCopy(r.snapshot, `${project.title} (${t('rev')} ${r.rev})`);
        if (act === 'restore') confirmModal(t('Restore revision') + ' ' + r.rev + '?', t('The drawings go back to how they were at this revision. The revision list is kept, and you can undo this.'), t('Restore'), () => { pushHistory(); L.restoreRevision(project, r.id); bindSheet(sheetId); afterSwap(); toast(`${t('Restored revision')} ${r.rev}`); });
        return;
      }
      const sa = e.target.closest('[data-sp-act]');
      if (sa) {
        const rec = await SavePoints.get(sa.closest('[data-sp]').dataset.sp); if (!rec) return;
        const data = JSON.parse(rec.data);
        if (sa.dataset.spAct === 'open') openSnapshotCopy(data, `${data.title} (${fmtTime(rec.time)})`);
        else confirmModal(t('Restore this save point?'), t('The project goes back to how it was at') + ' ' + fmtTime(rec.time) + '. ' + t('You can undo this.'), t('Restore'), () => { pushHistory(); const keepRevs = project.revisions; project = L.normalise(data); project.revisions = keepRevs.length >= (project.revisions || []).length ? keepRevs : project.revisions; bindSheet(sheetId); afterSwap(); toast(t('Restored save point')); });
      }
    });
  }
  /* Open an old state of the project in its own tab, as a copy that is not linked to the file. */
  function openSnapshotCopy(state, title) {
    const p = L.normalise(clone({ ...project, ...state, revisions: [], id: L.uid('prj') }));
    p.title = title;
    loadDoc(p, null, null, true); markDirty();
    toast(t('Opened as a separate copy. Close its tab when you are done.'));
  }
  function confirmModal(title, text, label, fn) {
    showModal(title, `<p>${esc(text)}</p><div class="row-btns"><button class="btn primary" id="cf-go">${esc(label)}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    $('#cf-go').onclick = () => { closeModal(); fn(); };
  }
  function issueRevisionModal() {
    const last = (project.revisions || [])[project.revisions.length - 1];
    const next = last ? L.nextRevision(last.rev) : (project.meta.revision || 'A');
    const changes = last ? L.describeDiff(L.compareRevisions(project, last.id, 'current')) : [];
    showModal(t('Issue revision'), `<p class="muted">${esc(t('Issuing a revision records the whole project as it is now. The revision table on every sheet lists it, and you can compare or go back to it later.'))}</p>
      <div class="two"><label class="fld"><span>${esc(t('Revision'))}</span><input id="ri-rev" value="${esc(next)}"></label><label class="fld"><span>${esc(t('Date'))}</span><input id="ri-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label></div>
      <label class="fld"><span>${esc(t('By'))}</span><input id="ri-by" value="${esc(project.meta.drawnBy || '')}"></label>
      <label class="fld"><span>${esc(t('Description'))}</span><input id="ri-desc" placeholder="${esc(last ? t('e.g. Added rear work lamp, fridge feed to 4 mm²') : t('First issue'))}"></label>
      ${last ? `<label class="fld check"><input type="checkbox" id="ri-cloud" checked><span>${esc(t('Cloud the changes since'))} ${esc(last.rev)} ${esc(t('on the drawings'))}</span></label>` : ''}
      ${last ? `<h3>${esc(t('Changes since'))} ${esc(last.rev)} (${changes.length})</h3><div class="difflist">${changes.length ? changes.slice(0, 60).map((x) => `<div>${esc(x)}</div>`).join('') + (changes.length > 60 ? `<div class="muted">+ ${changes.length - 60}</div>` : '') : `<span class="muted">${esc(t('No changes.'))}</span>`}</div>` : ''}
      <div class="row-btns"><button class="btn primary" id="ri-go">${esc(t('Issue revision'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    $('#ri-desc').focus();
    $('#ri-go').onclick = () => {
      pushHistory();
      const cloud = $('#ri-cloud') && $('#ri-cloud').checked;
      const prev = last && last.id;
      const r = L.issueRevision(project, { rev: $('#ri-rev').value.trim() || next, date: $('#ri-date').value, by: $('#ri-by').value.trim(), description: $('#ri-desc').value.trim() || (last ? t('Revised') : t('First issue')) });
      // the snapshot keeps the clouds that were showing; the live drawing clouds against the previous issue
      project.settings.clouds = cloud && prev ? prev : '';
      r.snapshot.settings.clouds = '';
      closeModal(); commit(); savePoint('Revision ' + r.rev); showPane('history');
      toast(`${t('Issued revision')} ${r.rev}`);
    };
  }
  function compareModal(fromId, toId) {
    const revs = project.revisions || [];
    if (!revs.length) { toast(t('Issue a revision first.')); return; }
    fromId = fromId || revs[revs.length - 1].id; toId = toId || 'current';
    const opts = (sel_) => revs.map((r) => `<option value="${esc(r.id)}"${r.id === sel_ ? ' selected' : ''}>${esc(t('Rev'))} ${esc(r.rev)} · ${esc(r.date)}</option>`).join('') + `<option value="current"${sel_ === 'current' ? ' selected' : ''}>${esc(t('Now (unissued)'))}</option>`;
    const d = L.compareRevisions(project, fromId, toId);
    const rows = [];
    d.meta.forEach((m) => rows.push(['', 'project', `${m.field}: "${m.from || ''}" → "${m.to || ''}"`]));
    d.harnesses.added.forEach((h) => rows.push(['', 'add', `${t('Harness added')}: ${h}`]));
    d.harnesses.removed.forEach((h) => rows.push(['', 'del', `${t('Harness removed')}: ${h}`]));
    L.describeDiff({ ...d, meta: [], harnesses: { added: [], removed: [] } }).forEach((line) => { const i = line.indexOf(': '); rows.push([line.slice(0, i), /removed/.test(line) ? 'del' : /added/.test(line) ? 'add' : 'chg', line.slice(i + 2)]); });
    showModal(t('Compare revisions'), `<div class="two"><label class="fld"><span>${esc(t('From'))}</span><select id="cmp-a">${opts(fromId)}</select></label><label class="fld"><span>${esc(t('To'))}</span><select id="cmp-b">${opts(toId)}</select></label></div>
      <p><b>${d.count}</b> ${esc(t('changes'))}</p>
      ${rows.length ? `<div style="overflow:auto"><table class="data"><thead><tr><th>${esc(t('Sheet'))}</th><th></th><th>${esc(t('Change'))}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td><span class="lvl ${r[1] === 'del' ? 'error' : r[1] === 'add' ? 'info' : 'warn'}">${esc(t(r[1] === 'del' ? 'removed' : r[1] === 'add' ? 'added' : 'changed'))}</span></td><td class="wrap">${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(t('No differences.'))}</p>`}
      <div class="row-btns"><button class="btn" id="cmp-csv">${esc(t('Export list (CSV)'))}</button><button class="btn primary" data-close>${esc(t('Close'))}</button></div>`);
    $('#cmp-a').onchange = () => compareModal($('#cmp-a').value, $('#cmp-b').value);
    $('#cmp-b').onchange = () => compareModal($('#cmp-a').value, $('#cmp-b').value);
    $('#cmp-csv').onclick = () => PF.exportFile(slug(project.title) + '-changes.csv', csv([['Sheet', 'Kind', 'Change']].concat(rows)), 'text/csv');
  }

  /* ---------------- Inspector ---------------- */
  const fld = (label, field, value, type = 'text', extra = '') => `<label class="fld"><span>${esc(t(label))}</span><input id="f-${field.replace(/[^a-z0-9]/gi, '-')}" type="${type}" data-field="${field}" value="${esc(value == null ? '' : value)}" ${extra}></label>`;
  const selFld = (label, field, value, options, extra = '') => `<label class="fld"><span>${esc(t(label))}</span><select id="f-${field.replace(/[^a-z0-9]/gi, '-')}" data-field="${field}" ${extra}>${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value == null ? '' : value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const sec = (title, body) => `<div class="sec"><h3>${esc(t(title))}</h3>${body}</div>`;
  function stockSet() { const s = project.settings; return s.stockOnly && s.stock && s.stock.length ? new Set(s.stock) : null; }
  function colourOptions(selected, allowNone) {
    const std = project.settings.standard, stock = stockSet();
    const keep = (c) => !stock || stock.has(c.id) || c.id === selected;
    const opt = (c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(L.colourCode(doc, c))} · ${esc(c.name)}</option>`;
    const mine = project.customColours.filter(keep), stdList = std === 'custom' && !stock ? [] : L.COLOURS.filter(keep);
    return (allowNone ? `<option value="">${esc(t('None'))}</option>` : '') +
      (mine.length ? `<optgroup label="${esc(t('My colours'))}">${mine.map(opt).join('')}</optgroup>` : '') +
      (stdList.length ? `<optgroup label="${esc(stock ? t('Colours I stock') : t(L.STANDARDS[std === 'custom' ? 'lr' : std].name))}">${stdList.map(opt).join('')}</optgroup>` : '');
  }
  function colourField(label, field, value, allowNone) {
    const c = L.colourById(doc, value);
    return `<label class="fld"><span>${esc(t(label))}</span><span class="colour-row"><span class="swatch" style="background:${c ? c.hex : 'transparent'}"></span><select id="f-${field}" data-field="${field}">${colourOptions(value, allowNone)}</select></span></label>`;
  }
  function gaugeOptions(v) {
    const known = L.GAUGES.some((g) => g.mm2 === String(v));
    return (known || v === '' ? '' : `<option value="${esc(v)}" selected>${esc(v)} mm²</option>`) + L.GAUGES.map((g) => `<option value="${g.mm2}"${g.mm2 === String(v) ? ' selected' : ''}>${g.mm2} mm² (≈${g.awg} AWG)</option>`).join('');
  }
  const harnessList = () => `<datalist id="dl-harness">${project.harnesses.map((h) => `<option value="${esc(h)}">`).join('')}</datalist>`;
  const circuitList = () => { const set = new Set(); project.sheets.forEach((s) => s.wires.forEach((w) => { if (w.circuit) set.add(w.circuit); })); return `<datalist id="dl-circuit">${[...set].sort().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`; };
  const locationList = () => { const set = new Set(); project.sheets.forEach((s) => s.parts.forEach((p) => { if (p.location) set.add(p.location); })); return `<datalist id="dl-loc">${[...set].sort().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`; };
  const supplierList = () => { const set = new Set(); project.sheets.forEach((s) => s.parts.forEach((p) => { if (p.supplier) set.add(p.supplier); })); return `<datalist id="dl-sup">${[...set].sort().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`; };

  function inspector() {
    const el = $('#inspector');
    if (el.contains(document.activeElement) && document.activeElement.matches('input[type=text],input:not([type]),input[type=number],textarea') && !inspector.force) return;
    const p = only('part'), w = only('wire');
    let h = '';
    if (test) h = testPanel();
    else {
      if (trace) h += tracePanel();
      if (p) h += partPanel(p);
      else if (w) h += wirePanel(w);
      else if (selCount()) h += multiPanel();
      else if (!trace) h += sheetPanel();
    }
    el.innerHTML = h;
  }
  function tracePanel() {
    const n = trace.net, bySheet = new Map();
    n.wires.forEach((x) => { if (!bySheet.has(x.sheet.id)) bySheet.set(x.sheet.id, { sheet: x.sheet, wires: [], pins: [] }); bySheet.get(x.sheet.id).wires.push(x.wire); });
    n.pins.forEach((x) => { if (!bySheet.has(x.sheet.id)) bySheet.set(x.sheet.id, { sheet: x.sheet, wires: [], pins: [] }); bySheet.get(x.sheet.id).pins.push(x); });
    let h = `<div class="trace"><div class="trace-h"><span class="kicker">${esc(t('Circuit trace'))}</span><button class="iconbtn sm" data-act="trace-off" title="${esc(t('Stop tracing (Esc)'))}" aria-label="${esc(t('Stop tracing'))}"><svg class="i"><use href="#i-x"/></svg></button></div><h2>${esc(n.name)}</h2>`;
    h += `<p class="sub">${plural(n.wires.length, t('wire'))}, ${plural(n.pins.length, t('connection'))}, ${plural(bySheet.size, t('sheet'))}</p>`;
    [...bySheet.values()].sort((a, b) => project.sheets.indexOf(a.sheet) - project.sheets.indexOf(b.sheet)).forEach((g) => {
      const v = L.view(project, g.sheet);
      h += `<div class="trace-s"><button class="linkbtn" data-goto-sheet="${g.sheet.id}"><b>${project.sheets.indexOf(g.sheet) + 1}</b> ${esc(g.sheet.name)}</button>`;
      h += g.wires.map((w) => { const c = L.colourById(v, w.colour); return `<button class="chip" data-goto="${w.id}" data-goto-sheet2="${g.sheet.id}"><span class="swatch" style="width:12px;height:8px;background:${c ? c.hex : '#888'}"></span>${esc(w.name)} ${esc(L.wireCode(v, w))}</button>`; }).join(' ');
      const pins = g.pins.filter((x) => !['offpage', 'net_label', 'splice'].includes(x.part.type));
      if (pins.length) h += `<div class="muted mono" style="font-size:11px">${esc(pins.map((x) => x.label).join('  '))}</div>`;
      h += '</div>';
    });
    return h + '</div>';
  }
  function testPanel() {
    const sim = test.sim, items = [];
    const seen = new Set();
    L.views(project).forEach((v) => v.parts.forEach((p) => {
      const st = L.partStates(v, p);
      if (!st || st.follows || seen.has(st.key)) return; seen.add(st.key);
      items.push({ p, v, st, cur: test.state[st.key] != null ? test.state[st.key] : st.def });
    }));
    const lab = (id) => { for (const s of project.sheets) { const p = s.parts.find((x) => x.id === id); if (p) return p.label || p.type; } return id; };
    let h = `<div><span class="kicker">${esc(t('Live circuit test'))}</span><h2>${esc(t('Operate the circuit'))}</h2><p class="sub">${esc(t('Supplies are live. Change switches and fuses here or by clicking them on the sheet. Relays and contactors pull in when their coil is powered.'))}</p></div>`;
    if (sim.shorts.length) h += `<div class="callout warn">${esc(t('Short circuit'))}: ${esc(sim.shorts.join(', '))} ${esc(t('is connected straight to earth in this state.'))}</div>`;
    h += sec('Controls', items.length ? items.map((x) => `<label class="fld"><span title="${esc((L.partDef(x.v, x.p.type) || {}).name || '')}">${esc(x.p.label || x.p.type)}</span><select data-test="${esc(x.st.key)}">${x.st.states.map((s, i) => `<option value="${i}"${i === x.cur ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>`).join('') : `<p class="muted" style="margin:0">${esc(t('No switches, fuses or relays to operate.'))}</p>`);
    const loads = [...sim.loads].map(lab), relays = [...sim.relays].map((k) => k.split('|').pop());
    h += sec('Working now', `<div class="kv"><span>${esc(t('Loads on'))}</span><b>${loads.length}</b><span>${esc(t('Relays pulled in'))}</span><b>${relays.length}</b><span>${esc(t('Live wires'))}</span><b>${sim.wires.size}</b></div>${loads.length ? `<div class="mono" style="font-size:11.5px">${esc([...new Set(loads)].join(', '))}</div>` : ''}`);
    h += `<div class="row-btns"><button class="btn" data-act="test-reset">${esc(t('Reset all'))}</button><button class="btn primary" data-act="test-off">${esc(t('Stop test'))}</button></div>`;
    const sol = test.sol;
    if (sol) {
      const on = sol.loads.filter((x) => x.running);
      const cls = (st) => (st === 'low' ? 'bad' : st === 'check' ? 'warnc' : '');
      h += sec('Voltage at each load', on.length ? `<table class="mini"><tr><th>${esc(t('Load'))}</th><th>V</th><th>A</th><th>${esc(t('Drop'))}</th></tr>${on.map((x) => `<tr class="${cls(x.status)}"><td><button class="linkbtn" data-goto-part="${x.part}" data-goto-sheet="${x.sheetId}">${esc(x.ref)}</button></td><td>${x.volts == null ? '–' : x.volts.toFixed(2)}</td><td>${x.amps == null ? '–' : x.amps.toFixed(1)}</td><td>${x.dropPct == null ? esc(t('no rating')) : x.dropPct.toFixed(1) + '%'}</td></tr>`).join('')}</table>` : `<p class="muted" style="margin:0">${esc(t('Nothing is running.'))}</p>`);
      if (sol.fuses.length) h += sec('Fuses carrying current', `<table class="mini"><tr><th>${esc(t('Fuse'))}</th><th>A</th><th>${esc(t('Rating'))}</th><th>%</th></tr>${sol.fuses.map((f) => `<tr class="${f.status === 'over' ? 'bad' : f.status === 'high' ? 'warnc' : ''}"><td>${esc(f.ref)}</td><td>${f.amps.toFixed(1)}</td><td>${f.rating || '?'}</td><td>${f.pct == null ? '' : f.pct}</td></tr>`).join('')}</table>`);
      h += sec('Supplies', `<table class="mini"><tr><th></th><th>V</th><th>A</th><th></th></tr>${sol.sources.map((x) => `<tr><td>${esc(x.ref)}</td><td>${x.volts.toFixed(2)}</td><td>${x.amps.toFixed(1)}</td><td class="muted">${esc(t(x.state))}</td></tr>`).join('')}</table>
        <label class="fld"><span>${esc(t('Battery at rest, V'))}</span><input type="number" step="0.1" min="0" data-testbat value="${esc(test.battery || '')}" placeholder="${(12.6 * (sol.system / 12)).toFixed(1)}"></label>`);
      if (sol.notes.length) h += `<div class="callout">${sol.notes.map((n) => esc(n)).join('<br>')}</div>`;
    }
    h += `<p class="muted" style="margin:0;font-size:11.5px">${esc(t('Volts and amps are worked out from wire sizes, lengths and load ratings: a guide to what a meter should read, not a measurement. Pick a load and use Fault finding for a step-by-step test.'))}</p>`;
    h += `<div class="row-btns"><button class="btn" data-cmd="fault">${esc(t('Fault finding…'))}</button></div>`;
    return h;
  }
  /* Where a part's data came from: a note, and the maker's page as text to copy (the desktop app does not open web links). */
  const sourceNote = (noteText, src) => (noteText || src ? `<div class="callout small" style="background:var(--raise);border-color:var(--line)">${noteText ? esc(noteText) : ''}${src ? `${noteText ? '<br>' : ''}<span class="muted">${esc(t('Source'))}:</span> <span class="mono src-url">${esc(src)}</span> <button class="linkbtn" data-act="copy-src" data-url="${esc(src)}">${esc(t('Copy link'))}</button>` : ''}</div>` : '');
  function partPanel(p) {
    const r = L.resolved(doc, p), d = r.def || { name: p.type, props: [], cat: 'Missing' };
    let h = `<div><span class="kicker">${esc(d.custom ? t('My components') : t(d.cat))}</span><h2>${esc(d.name)}</h2></div>`;
    let props = '';
    if (p.type !== 'note' && p.type !== 'frame') props += fld('Reference', 'label', p.label);
    (d.props || []).forEach((pr) => {
      const v = r.props[pr.k];
      if (pr.type === 'textarea') props += `<label class="fld"><span>${esc(t(pr.l))}</span><textarea id="f-prop-${pr.k}" data-field="prop:${pr.k}">${esc(v)}</textarea></label>`;
      else if (pr.type === 'int') props += fld(pr.l, 'prop:' + pr.k, v, 'number', `min="${pr.min}" max="${pr.max}" step="1"`);
      else if (pr.type === 'select') props += selFld(pr.l, 'prop:' + pr.k, v, pr.options);
      else props += fld(pr.l, 'prop:' + pr.k, v);
    });
    h += sec('Properties', props);
    if (!d.custom && (d.note || d.src)) h += sourceNote(d.note, d.src);
    if (p.type === 'conn') {
      const s = L.seriesById(r.props.series);
      h += `<div class="callout" style="background:var(--raise);border-color:var(--line)"><b>${esc(s.name)}</b>${s.rating ? ' · ' + esc(s.rating) : ''}${s.sealed ? ' · ' + esc(t('sealed')) : ''}<br>${esc(t('Housing'))} <span class="mono">${esc(r.props.mpnShown || '—')}</span>${s.lock ? ` · ${esc(t('wedge lock'))} <span class="mono">${esc(s.lock(r.props.ways, r.props.gender))}</span>` : ''}<br>${esc(t('Terminal'))}: ${esc((L.TERMINALS.find((x) => x.id === (r.props.gender === 'receptacle' ? s.pin : s.socket)) || {}).name || '—')}<br><span class="muted">${esc(t('Check part numbers against the maker’s catalogue before ordering.'))}</span></div>${sourceNote(s.note, s.src)}`;
    }
    const xr = L.xrefs(project).get(p.id);
    if (xr) h += sec(p.type === 'offpage' || p.type === 'net_label' ? 'Continues on' : 'Also drawn on', `<div class="row-btns">${xr.map((x) => `<button class="chip" data-goto-part="${x.part}" data-goto-sheet="${x.sheetId}">${esc(t('Sheet'))} ${x.sheetNo}${x.zone ? ' · ' + x.zone : ''}</button>`).join('')}</div>`);
    if (!d.noLabel && d.cat !== 'Annotation') {
      h += sec('Part data', fld('Part number', 'data:mpn', p.mpn) + fld('Supplier', 'data:supplier', p.supplier, 'text', 'list="dl-sup"') + fld(`Unit cost (${project.settings.currency || '£'})`, 'data:cost', p.cost, 'number', 'min="0" step="0.01"') + fld('Location', 'data:location', p.location, 'text', 'list="dl-loc" placeholder="e.g. Under seat box"') + supplierList() + locationList());
    }
    h += `<div class="row-btns"><button class="btn" data-act="rotate">${esc(t('Rotate'))}</button><button class="btn" data-act="flip">${esc(t('Flip'))}</button><button class="btn" data-act="dup">${esc(t('Duplicate'))}</button><button class="btn danger" data-act="delete">${esc(t('Delete'))}</button></div>`;
    if (d.custom) h += `<div class="row-btns"><button class="btn" data-act="edit-custom">${esc(t('Edit component design'))}</button></div>`;
    if (L.faultFind && p.label && ['load', 'relay'].includes(L.behaviour(doc, p).kind)) h += `<div class="row-btns"><button class="btn" data-act="fault-part">${esc(t('Fault finding…'))}</button></div>`;
    if (r.pins.length) {
      h += `<div class="sec"><h3>${esc(t('Pins'))}</h3><ul class="pins">` + r.pins.map((pn) => {
        const ws = doc.wires.filter((w) => (w.from.part === p.id && w.from.pin === pn.id) || (w.to.part === p.id && w.to.pin === pn.id));
        return `<li><b>${esc(pn.id)}</b><span class="muted">${pn.n && pn.n !== pn.id ? esc(pn.n) : ''}</span>${ws.map((w) => { const other = w.from.part === p.id && w.from.pin === pn.id ? w.to : w.from; const c = L.colourById(doc, w.colour); return `<button class="chip" data-goto="${w.id}"><span class="swatch" style="width:12px;height:8px;background:${c ? c.hex : '#888'}"></span> ${esc(w.name)} → ${esc(L.pinName(doc, other))}</button>`; }).join('') || `<span class="muted">${esc(t('free'))}</span>`}<button class="chip ghost" data-trace-pin="${esc(pn.id)}" title="${esc(t('Trace this circuit'))}">⤳</button></li>`;
      }).join('') + '</ul></div>';
    }
    return h;
  }
  const termOptions = (gauge) => {
    const a = parseFloat(gauge);
    return L.TERMINALS.map((x) => [x.id, x.id && a && (a < x.min || a > x.max) ? `${x.name}  ✕ ${t('size')}` : t(x.name)]);
  };
  function wirePanel(w) {
    const vd = L.voltageDrop(w), sys = parseFloat(project.settings.volts) || 12;
    // other jobs this colour combination already does in the project
    const code = L.wireCode(doc, w);
    const others = L.colourUsage(project).find((e) => e.code === code);
    const otherUses = others ? others.uses.filter((u) => u.circuit !== (w.circuit || '') || u.harness !== (w.harness || '')) : [];
    const clash = otherUses.filter((u) => u.harness && u.harness === w.harness && u.circuit !== (w.circuit || ''));
    let h = `<div><span class="kicker">${esc(t('Wire'))}</span><h2>${esc(w.name)} <span class="muted mono" style="font-size:12px;font-weight:500">${esc(code)}</span></h2><p class="sub">${esc(L.pinName(doc, w.from))} → ${esc(L.pinName(doc, w.to))}</p></div>`;
    const signalFld = L.SIGNALS && (showElec() || w.signal) ? selFld('Signal', 'signal', w.signal || '', L.SIGNALS.map((x) => [x.id, t(x.name)])) : '';
    h += sec('Identity', `${fld('Wire number', 'name', w.name)}${fld('Circuit', 'circuit', w.circuit, 'text', 'list="dl-circuit" placeholder="e.g. Spot lamps"')}${signalFld}${fld('Harness', 'harness', w.harness, 'text', 'list="dl-harness" placeholder="e.g. Engine bay"')}${harnessList()}${circuitList()}`);
    let col = `${colourField('Main', 'colour', w.colour, false)}${colourField('Tracer', 'tracer', w.tracer, true)}${colourField('Second tracer', 'tracer2', w.tracer2 || '', true)}`;
    if (otherUses.length) col += `<div class="callout ${clash.length ? 'warn' : ''}" style="${clash.length ? '' : 'background:var(--raise);border-color:var(--line)'}"><b>${esc(code)}</b> ${esc(t('is also used for'))} ${otherUses.map((u) => esc([u.circuit || t('no circuit'), u.harness].filter(Boolean).join(' in '))).join('; ')}.${clash.length ? ' ' + esc(t('Same harness, different circuit: make sure they can be told apart, for example with wire numbers or sleeves.')) : ''}</div>`;
    if (L.suggestColours) {
      try {
        const sg = ptype() === 'household' ? [] : L.suggestColours(project, sheetId, w, { inventory: userLib.inventory, limit: 6 }).suggestions.filter((x) => !(x.colour === w.colour && (x.tracer || '') === (w.tracer || '')));
        if (sg.length) col += `<div class="sugg"><span class="muted">${esc(t('Suggested'))}</span>${sg.slice(0, 5).map((x) => { const tr = x.tracer && L.colourById(doc, x.tracer); return `<button class="chip" data-sugg="${esc(x.colour)}|${esc(x.tracer || '')}" title="${esc(x.name + (x.reasons.length ? ': ' + x.reasons.join('; ') : ''))}"><span class="swatch" style="background:${tr ? `repeating-linear-gradient(90deg, ${x.hex} 0 5px, ${tr.hex} 5px 8px)` : x.hex}"></span>${esc(x.code)}</button>`; }).join('')}</div>`;
      } catch (e) { console.warn(e); }
      if (ptype() !== 'household') col += `<label class="fld check"><input type="checkbox" data-field="settings:autoColour"${project.settings.autoColour ? ' checked' : ''}><span>${esc(t('Pick colours for new wires automatically'))}</span></label>`;
    }
    h += sec('Colour', col);
    let cab = `<label class="fld"><span>${esc(t('Size'))}</span><select id="f-gauge" data-field="gauge">${gaugeOptions(w.gauge)}</select></label>`;
    cab += selFld('Insulation', 'insulation', w.insulation || '', L.INSULATION.map((x) => [x.id, x.id ? `${x.name}${x.temp ? ', ' + x.temp : ''}` : t('Not set')]));
    cab += selFld('In cable', 'cable', w.cable || '', [['', t('No, single wire')]].concat((project.cables || []).map((c) => [c.id, c.name])));
    cab += `${fld('Length (m)', 'length', w.length, 'number', 'min="0" step="0.1"')}${fld('Current (A)', 'current', w.current, 'number', 'min="0" step="0.5"')}`;
    if (vd != null) cab += `<div class="callout ${vd > sys * 0.03 ? 'warn' : 'ok'}">${esc(t('Voltage drop'))} ${vd.toFixed(2)} V (${((vd / sys) * 100).toFixed(1)}% ${esc(t('of'))} ${sys} V) ${esc(t('one way at'))} ${esc(w.current)} A.${vd > sys * 0.03 ? ' ' + esc(t('Over 3%: consider a heavier size.')) : ''}</div>`;
    cab += selFld('Routing', 'route', w.route === 'straight' ? 'straight' : 'auto', [['auto', t('Square corners')], ['straight', t('Straight lines')]]);
    let insSec = '';
    if (L.rateCable && ['household', 'factory', 'mixed'].includes(ptype())) {
      const ms = project.settings.mains || {}, rc = L.rateCable(w, ms), sizes = ['1.0', '1.5', '2.5', '4.0', '6.0', '10', '16'];
      let ins = selFld('Installation method', 'method', w.method || '', [['', `${t('Project default')} (${ms.method || 'C'})`]].concat(L.INSTALL_METHODS.map(([v, l]) => [v, t(l)])));
      ins += selFld('Thermal insulation', 'insul', w.insul || '', L.INSULATION_CONTACT.map(([v, l]) => [v, t(l)]));
      ins += `<div class="two">${fld('Circuits grouped together', 'grouped', w.grouped || '', 'number', 'min="1" max="20" step="1" placeholder="1"')}${selFld('Grouped how', 'groupKind', w.groupKind || '', [['', t('Bunched or enclosed')], ['clipped', t('Clipped side by side')]])}</div>`;
      ins += `<div class="two">${selFld('Earth (cpc) size', 'cpc', w.cpc || '', [['', `${t('Standard twin and earth')}${rc.cpc ? ` (${rc.cpc} mm²)` : ''}`]].concat(sizes.map((x) => [x, x + ' mm²'])))}${fld('Ambient °C', 'ambient', w.ambient || '', 'number', `min="0" max="70" step="1" placeholder="${esc(ms.ambient || 30)}"`)}</div>`;
      ins += rc.it ? `<div class="callout" style="background:var(--raise);border-color:var(--line)">${esc(t('Twin and earth'))} ${esc(rc.size)} mm², ${esc(t('method'))} ${esc(rc.method)}: ${rc.it} A ${esc(t('in the table'))}, ${esc(t('about'))} <b>${rc.iz} A</b> ${esc(t('here once derated'))} (Ca ${rc.ca}, Cg ${rc.cg}, Ci ${rc.ci}). <span class="muted">${esc(t('Guide figures from selected BS 7671 tables. Check against the standard and the cable maker.'))}</span></div>` : `<p class="muted" style="margin:0;font-size:11.5px">${esc(t('This size is outside the twin and earth tables used here.'))}</p>`;
      insSec = sec('Installation (mains guide)', ins);
    }
    cab += `<label class="fld"><span>${esc(t('Notes'))}</span><textarea id="f-notes" data-field="notes" placeholder="${esc(t('e.g. run inside chassis rail'))}">${esc(w.notes)}</textarea></label>`;
    h += sec('Cable', cab) + insSec;
    const ends = w.ends || {};
    ['from', 'to'].forEach((k) => {
      const e = ends[k] || {};
      h += sec(k === 'from' ? t('End A') + ': ' + L.pinName(doc, w.from) : t('End B') + ': ' + L.pinName(doc, w.to),
        selFld('Terminal', `end:${k}:term`, e.term || '', termOptions(w.gauge)) +
        selFld('Fitting', `end:${k}:method`, e.method || '', L.METHODS.map(([v, l]) => [v, t(l)])) +
        `<div class="two">${fld('Strip (mm)', `end:${k}:strip`, e.strip, 'number', 'min="0" step="0.5"')}${selFld('Seal', `end:${k}:seal`, e.seal || '', L.SEALS.map(([v, l]) => [v, t(l)]))}</div>` +
        fld('Heat shrink', `end:${k}:shrink`, e.shrink, 'text', 'placeholder="e.g. 6 mm adhesive, 25 mm"'));
    });
    const bd = w.build || {};
    h += sec('Build and test', `<div class="build-row">${['cut', 'ends', 'fitted'].map((k) => `<label class="fld check"><input type="checkbox" data-field="build:${k}"${bd[k] ? ' checked' : ''}><span>${esc(t((L.BUILD_STEPS.find((x) => x[0] === k) || [k, k])[1]))}</span></label>`).join('')}</div>
      ${selFld('Test', 'build:test', bd.test || '', [['', t('Not tested')], ['pass', t('Pass')], ['fail', t('Fail')]])}
      ${fld('Build note', 'build:note', bd.note || '', 'text', `placeholder="${esc(t('e.g. reads 0.3 Ω end to end'))}"`)}`);
    h += `<div class="row-btns"><button class="btn" data-act="trace-wire">${esc(t('Trace circuit'))}</button><button class="btn" data-act="swap">${esc(t('Swap ends'))}</button><button class="btn" data-act="clear-bends">${esc(t('Clear bends'))}</button>${w.lab ? `<button class="btn" data-act="reset-label">${esc(t('Reset label'))}</button>` : ''}<button class="btn danger" data-act="delete">${esc(t('Delete'))}</button></div>`;
    return h;
  }
  function multiPanel() {
    const n = sel.parts.size;
    return `<div><span class="kicker">${esc(t('Selection'))}</span><h2>${plural(sel.parts.size, t('part'))}, ${plural(sel.wires.size, t('wire'))}</h2></div>
      <div class="row-btns"><button class="btn" data-act="rotate">${esc(t('Rotate'))}</button><button class="btn" data-act="dup">${esc(t('Duplicate'))}</button><button class="btn" data-cmd="block-save">${esc(t('Save as block'))}</button><button class="btn danger" data-act="delete">${esc(t('Delete'))}</button></div>
      ${n > 1 ? sec('Arrange', `<div class="align-grid">${[['align-left', 'Align left'], ['align-centre', 'Align centres'], ['align-right', 'Align right'], ['align-top', 'Align tops'], ['align-middle', 'Align middles'], ['align-bottom', 'Align bottoms']].map(([c, l]) => `<button class="btn" data-cmd="${c}" title="${esc(t(l))}">${esc(t(l))}</button>`).join('')}${n > 2 ? `<button class="btn" data-cmd="dist-h">${esc(t('Space evenly across'))}</button><button class="btn" data-cmd="dist-v">${esc(t('Space evenly down'))}</button>` : ''}</div>`) : ''}
      ${sel.wires.size ? sec('Set on all selected wires', `<label class="fld"><span>${esc(t('Main colour'))}</span><select id="f-all-colour" data-field="all:colour"><option value="" selected>${esc(t('Keep as is'))}</option>${colourOptions('', false)}</select></label><label class="fld"><span>${esc(t('Size'))}</span><select id="f-all-gauge" data-field="all:gauge"><option value="" selected>${esc(t('Keep as is'))}</option>${gaugeOptions('')}</select></label>${fld('Circuit', 'all:circuit', '', 'text', `list="dl-circuit" placeholder="${esc(t('Keep as is'))}"`)}${fld('Harness', 'all:harness', '', 'text', `list="dl-harness" placeholder="${esc(t('Keep as is'))}"`)}${selFld('Insulation', 'all:insulation', '', [['', t('Keep as is')]].concat(L.INSULATION.filter((x) => x.id).map((x) => [x.id, x.name])))}${L.SIGNALS && showElec() ? selFld('Signal', 'all:signal', '', [['', t('Keep as is')], ['-', t('Not set')]].concat(L.SIGNALS.filter((x) => x.id).map((x) => [x.id, t(x.name)]))) : ''}${harnessList()}${circuitList()}`) : ''}`;
  }
  function sheetPanel() {
    const s = project.settings, n = project.sheets.indexOf(doc.sheet) + 1;
    const metres = doc.wires.reduce((a, w) => a + (parseFloat(w.length) || 0), 0);
    const issues = checks().filter((c) => c.level !== 'info' && (!c.sheetId || c.sheetId === sheetId));
    const pages = [['fit', t('Fit to drawing')], ['A4', 'A4'], ['A3', 'A3'], ['A2', 'A2'], ['A1', 'A1']];
    return `<div><span class="kicker">${esc(t('Sheet'))} ${n} / ${project.sheets.length}</span><h2>${esc(doc.sheet.name)}</h2></div>
      ${sec('Sheet', `${fld('Name', 'sheet:name', doc.sheet.name)}
        ${selFld('Paper size', 'sheet:page', doc.sheet.page || '', [['', `${t('Project default')} (${(pages.find((x) => x[0] === (s.page || 'fit')) || pages[0])[1]})`]].concat(pages))}
        ${selFld('Orientation', 'sheet:orientation', doc.sheet.orientation || '', [['', `${t('Project default')} (${t(s.orientation === 'portrait' ? 'Portrait' : 'Landscape')})`], ['landscape', t('Landscape')], ['portrait', t('Portrait')]])}
        <div class="kv"><span>${esc(t('Parts'))}</span><b>${doc.parts.length}</b><span>${esc(t('Wires'))}</span><b>${doc.wires.length}</b><span>${esc(t('Cable on this sheet'))}</span><b>${metres.toFixed(1)} m</b></div>
        ${issues.length ? `<button class="callout warn" data-act="show-checks">${esc(plural(issues.length, t('check')))} ${esc(t('to review on this sheet'))}</button>` : ''}`)}
      ${sec('Drawing', `
        ${selFld('Project type', 'settings:projectType', s.projectType || 'vehicle', L.PROJECT_TYPES.map((x) => [x.id, t(x.name)]))}
        ${L.disclaimerFor(project).mains ? `<p class="callout warn small">${esc(t('Planning aid only. Checks are guidance, not proof the work meets BS 7671, BS EN 60204-1 or any other code. Not a certificate. Use a qualified electrician.'))} <a href="#" data-act="disclaimer">${esc(t('Disclaimer'))}</a></p>` : ''}
        ${selFld('Paper size, all sheets', 'settings:page', s.page || 'fit', pages)}
        ${selFld('Orientation', 'settings:orientation', s.orientation || 'landscape', [['landscape', t('Landscape')], ['portrait', t('Portrait')]])}
        ${['household', 'factory', 'mixed'].includes(s.projectType) && L.BUILDING_TYPES ? `<div class="sub-sec"><h4>${esc(t('Mains installation'))}</h4>
          ${selFld('Building', 'settings:mains:building', (s.mains || {}).building || 'dwelling', L.BUILDING_TYPES.map(([v, l]) => [v, t(l)]))}
          ${selFld('Country (building rules)', 'settings:mains:country', (s.mains || {}).country || 'england', L.COUNTRIES.map(([v, l]) => [v, t(l)]))}
          ${selFld('Usual installation method', 'settings:mains:method', (s.mains || {}).method || 'C', L.INSTALL_METHODS.map(([v, l]) => [v, t(l)]))}
          ${fld('Ambient temperature °C', 'settings:mains:ambient', (s.mains || {}).ambient || 30, 'number', 'min="0" max="70" step="1"')}
          <p class="muted" style="margin:0;font-size:11.5px">${esc(t('Earthing, Ze and the supply fuse are set on the Supply part. Cable method, insulation and grouping can be set on each cable.'))}</p></div>` : ''}
        <label class="fld"><span>${esc(t('System voltage'))}</span><select id="f-volts" data-field="settings:volts">${[12, 24, 48, 110, 230, 400].map((v) => `<option value="${v}"${(parseFloat(s.volts) || 12) === v ? ' selected' : ''}>${v} V</option>`).join('')}</select></label>
        <label class="fld"><span>${esc(t('Colour codes'))}</span><select id="f-std" data-field="settings:standard">${Object.values(L.STANDARDS).map((x) => `<option value="${x.id}"${x.id === s.standard ? ' selected' : ''}>${esc(t(x.name))}</option>`).join('')}</select></label>
        ${selFld('Wire labels', 'settings:labels', s.labels || 'full', [['full', t('Number, colour, size')], ['code', t('Colour code only')], ['none', t('None')]])}
        <label class="fld check"><input type="checkbox" id="f-tb" data-field="settings:titleBlock"${s.titleBlock !== false ? ' checked' : ''}><span>${esc(t('Title block and revision table'))}</span></label>
        <label class="fld check"><input type="checkbox" id="f-key" data-field="settings:colourKey"${s.colourKey !== false ? ' checked' : ''}><span>${esc(t('Colour key'))}</span></label>
        <label class="fld check"><input type="checkbox" id="f-xr" data-field="settings:xrefs"${s.xrefs !== false ? ' checked' : ''}><span>${esc(t('Cross-references (→ 2/B4)'))}</span></label>
        <label class="fld check"><input type="checkbox" id="f-jn" data-field="settings:junctions"${s.junctions !== false ? ' checked' : ''}><span>${esc(t('Junction dots'))}</span></label>
        <label class="fld check"><input type="checkbox" id="f-bw" data-field="settings:bw"${s.bw ? ' checked' : ''}><span>${esc(t('Black and white (for mono printing)'))}</span></label>
        <label class="fld check"><input type="checkbox" id="f-stock" data-field="settings:stockOnly"${s.stockOnly ? ' checked' : ''}${s.stock && s.stock.length ? '' : ' disabled'}><span>${esc(t('Only offer colours I stock'))}${s.stock && s.stock.length ? ` (${s.stock.length})` : ''}</span></label>
        <div class="row-btns"><button class="btn" data-cmd="colours">${esc(t('Wire colours…'))}</button><button class="btn" data-cmd="pane-project">${esc(t('Project details'))}</button></div>`)}
      ${sec('Build', `${fld('Cut allowance per wire (m)', 'settings:cutAllowance', s.cutAllowance != null ? s.cutAllowance : 0.15, 'number', 'min="0" step="0.05"')}${fld('Currency symbol', 'settings:currency', s.currency || '£', 'text', 'maxlength="4"')}`)}
      ${sec('Getting started', `<ul class="tips"><li>${esc(t('Drag a component from Parts, or click it to drop it in the middle.'))}</li><li>${esc(t('Click a pin, then another pin, to wire them.'))}</li><li>${esc(t('Select a wire to set colour, size, terminals, circuit and harness.'))}</li><li>${esc(t('Alt+click a wire to trace it across sheets. Use Test to operate switches.'))}</li><li>${esc(t('Give off-sheet references the same link name to join sheets.'))}</li></ul>`)}`;
  }

  let snapBefore = null;
  const insp = $('#inspector');
  insp.addEventListener('focusin', (e) => { if (e.target.matches('[data-field]')) snapBefore = snapshot(); });
  insp.addEventListener('input', (e) => { if (e.target.matches('[data-field]') && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') applyField(e.target, true); });
  insp.addEventListener('change', (e) => {
    if (e.target.dataset.test != null) { setTestState(e.target.dataset.test, +e.target.value); return; }
    if (e.target.dataset.testbat != null) { test.battery = parseFloat(e.target.value) || null; runTest(); render(); inspector.force = true; inspector(); inspector.force = false; return; }
    if (!e.target.matches('[data-field]')) return;
    if (snapBefore == null) snapBefore = snapshot();
    applyField(e.target, false);
    const now = snapshot();
    if (snapBefore !== now) { hist.push(snapBefore); redoStack = []; markDirty(); }
    snapBefore = now;
    autosave(); tables(); status(); sheetTabs(); projectPane();
    const f = e.target.dataset.field;
    if (/^sheet:page|^sheet:orientation|^settings:page|^settings:orientation/.test(f)) requestAnimationFrame(fit);
    if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || /^prop:|^all:|^harness$|^circuit$|^gauge$|^data:/.test(f)) { inspector.force = true; inspector(); inspector.force = false; }
  });
  insp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  function addHarness(name) { name = String(name || '').trim(); if (name && !project.harnesses.includes(name)) project.harnesses.push(name); }
  function applyField(el, live) {
    const f = el.dataset.field, v = el.type === 'checkbox' ? el.checked : el.value;
    editRev++;
    if (f.startsWith('settings:')) {
      const k = f.slice(9);
      if (k === 'cutAllowance') { if (live && v === '') return; project.settings[k] = Math.max(0, parseFloat(v) || 0); }
      else if (k === 'projectType') { if (live) return; L.applyProjectType(project, v); buildLibrary(); typeUI(); checkDisclaimer(); }
      else if (k.startsWith('mains:')) { if (live && v === '') return; project.settings.mains = { ...(project.settings.mains || {}), [k.slice(6)]: v }; }
      else project.settings[k] = v;
    }
    else if (f === 'sheet:name') { if (!live && v.trim()) doc.sheet.name = v.trim(); }
    else if (f === 'sheet:page' || f === 'sheet:orientation') { const k = f.slice(6); if (v) doc.sheet[k] = v; else delete doc.sheet[k]; }
    else if (f.startsWith('all:')) {
      if (live || v === '') return;
      const k = f.slice(4); sel.wires.forEach((id) => { const w = wireById(id); if (k === 'signal' && v === '-') delete w.signal; else w[k] = v; });
      if (k === 'harness') addHarness(v);
    } else if (only('part')) {
      const p = only('part');
      if (f === 'label') p.label = v;
      else if (f.startsWith('data:')) { const k = f.slice(5); if (v === '' || v == null) delete p[k]; else p[k] = live ? v : String(v).trim(); }
      else if (f.startsWith('prop:')) {
        const k = f.slice(5), d = defOf(p.type), spec = (d.props || []).find((x) => x.k === k);
        if (spec && spec.type === 'int') { if (live && v === '') return; let n = parseInt(v, 10); if (isNaN(n)) n = spec.d; p.props[k] = Math.max(spec.min, Math.min(spec.max, n)); L.pruneWires(doc); }
        else p.props[k] = v;
        if (p.type === 'conn' && (k === 'series' || k === 'ways')) { p.props.ways = L.resolved(doc, p).props.ways; L.pruneWires(doc); }
      }
    } else if (only('wire')) {
      const w = only('wire');
      if (f.startsWith('build:')) {
        if (live && f !== 'build:note') return;
        L.setBuild(w, { [f.slice(6)]: v });
      } else if (f.startsWith('end:')) {
        const [, end, k] = f.split(':');
        w.ends = w.ends || {}; w.ends[end] = w.ends[end] || {};
        if (v === '' || v == null) delete w.ends[end][k]; else w.ends[end][k] = v;
        if (!Object.keys(w.ends[end]).length) delete w.ends[end];
        if (!Object.keys(w.ends).length) delete w.ends;
      } else {
        w[f] = f === 'harness' || f === 'circuit' ? (live ? v : v.trim()) : v;
        if (['tracer2', 'insulation', 'cable', 'method', 'insul', 'grouped', 'groupKind', 'cpc', 'ambient', 'signal'].includes(f) && !v) delete w[f];
        if (f === 'harness' && !live) { addHarness(v); lastWire.harness = w.harness; }
        if (['colour', 'tracer', 'gauge'].includes(f)) lastWire[f] = v;
        if (f === 'colour' || f.startsWith('tracer')) { const sw = el.parentElement.querySelector('.swatch'); const c = L.colourById(doc, v); if (sw) sw.style.background = c ? c.hex : 'transparent'; }
      }
    }
    render();
  }
  insp.addEventListener('click', (e) => {
    const gp = e.target.closest('[data-goto-part]');
    if (gp) { goSheet(gp.dataset.gotoSheet); select([gp.dataset.gotoPart]); centreOnSelection(); return; }
    const g = e.target.closest('[data-goto]');
    if (g) { if (g.dataset.gotoSheet2 && g.dataset.gotoSheet2 !== sheetId) goSheet(g.dataset.gotoSheet2, true); select([], [g.dataset.goto]); centreOnSelection(); return; }
    const gs = e.target.closest('[data-goto-sheet]');
    if (gs) { goSheet(gs.dataset.gotoSheet, true); return; }
    const tp = e.target.closest('[data-trace-pin]');
    if (tp) { startTrace(sheetId, { part: only('part').id, pin: tp.dataset.tracePin }); return; }
    const sg = e.target.closest('[data-sugg]');
    if (sg && only('wire')) {
      const w = only('wire'), [c, tr] = sg.dataset.sugg.split('|');
      pushHistory(); w.colour = c; if (tr) w.tracer = tr; else delete w.tracer;
      lastWire.colour = c; lastWire.tracer = tr || '';
      commit(); inspector.force = true; inspector(); inspector.force = false; return;
    }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'rotate') rotateSelection(1);
    else if (act === 'flip') flipSelection();
    else if (act === 'dup') { if (copySelection()) paste(20); }
    else if (act === 'delete') deleteSelection();
    else if (act === 'edit-custom') window.LoomBuilder.open(defOf(only('part').type));
    else if (act === 'show-checks') showTab('checks');
    else if (act === 'disclaimer') { e.preventDefault(); disclaimerModal(); }
    else if (act === 'copy-src') { const u = a.dataset.url; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast(t('Link copied')), () => showMessage(t('Source'), `<p class="mono" style="user-select:text">${esc(u)}</p>`)); }
    else if (act === 'swap') { const w = only('wire'); pushHistory(); [w.from, w.to] = [w.to, w.from]; if (w.points) w.points.reverse(); if (w.ends) w.ends = { from: w.ends.to, to: w.ends.from }; commit(); }
    else if (act === 'clear-bends') { const w = only('wire'); pushHistory(); delete w.points; delete w.dx; commit(); }
    else if (act === 'reset-label') { const w = only('wire'); pushHistory(); delete w.lab; commit(); }
    else if (act === 'trace-wire') { const w = only('wire'); startTrace(sheetId, w.from); }
    else if (act === 'trace-off') clearTrace();
    else if (act === 'fault-part') faultModal(only('part').id);
    else if (act === 'test-off') endTest();
    else if (act === 'test-reset') { test.state = {}; test.sim = null; setTestState('__', 0); delete test.state.__; }
  });

  /* ---------------- Lists and reports ---------------- */
  const allScope = () => $('#scope-all').checked;
  function swatchHTML(wd, w) {
    const m = L.colourById(wd, w.colour), tr = L.colourById(wd, w.tracer);
    const bg = tr ? `repeating-linear-gradient(90deg, ${m ? m.hex : '#888'} 0 6px, ${tr.hex} 6px 9px)` : (m ? m.hex : '#888');
    return `<span class="swatch" style="background:${bg}"></span>`;
  }
  const sheetNo = (id) => project.sheets.findIndex((s) => s.id === id) + 1;
  const sheetNoByName = (n) => project.sheets.findIndex((s) => s.name === n) + 1;
  function findWireAnywhere(id) { for (const s of project.sheets) { const w = s.wires.find((x) => x.id === id); if (w) return { sheet: s, wire: w }; } return null; }
  const money = (v) => (v == null ? '' : (project.settings.currency || '£') + Number(v).toFixed(2));
  const th = (labels) => `<thead><tr>${labels.map((l) => `<th>${esc(t(l))}</th>`).join('')}</tr></thead>`;
  const empty = (s) => `<p class="empty">${esc(t(s))}</p>`;
  const note = (s) => `<p class="empty" style="padding-top:6px">${esc(t(s))}</p>`;
  const bar = (pct, status) => pct == null ? '' : `<span class="loadbar ${status}" title="${pct}%"><i style="width:${Math.min(100, pct)}%"></i></span>`;
  const endText = (e) => [e.termName, e.strip && e.strip + ' mm', e.shrink, e.seal && e.seal !== 'seal' ? e.seal : e.seal ? t('seal') : ''].filter(Boolean).join(', ');
  let lastNets = [];

  function tables() {
    const wrap = $('#table-wrap');
    const all = allScope(), scope = all ? project : doc, many = all && project.sheets.length > 1;
    const inScope = (sid) => all || sid === sheetId;
    const issues = checks().filter((c) => c.level !== 'info').length;
    $('#c-wires').textContent = all ? project.sheets.reduce((a, s) => a + s.wires.length, 0) : doc.wires.length;
    const cc = $('#c-checks'); cc.textContent = issues || ''; cc.className = 'count' + (issues ? ' warn' : '');
    const sheetTh = many ? [t('Sheet')] : [];
    const sheetTd = (sid, name) => many ? `<td class="mono" title="${esc(name || '')}">${sheetNo(sid)}</td>` : '';
    let h = '';
    if (tab === 'wires') {
      const wl = L.wireList(scope);
      const sigCol = !!L.signalName && showElec();
      h = wl.length ? `<table class="data">${th([...sheetTh, 'Wire', 'From', 'To', 'Colour', 'Code', 'Size', 'AWG', 'Length m', 'Current A', 'Drop V', 'Circuit', ...(sigCol ? ['Signal'] : []), 'Harness', 'Cable', 'Notes'])}<tbody>${wl.map((r) => {
        const f = findWireAnywhere(r.id), wv = L.view(project, f.sheet), cab = r.cable && (project.cables || []).find((c) => c.id === r.cable);
        return `<tr class="click${sel.wires.has(r.id) ? ' sel' : ''}${trace && trace.wires.has(r.id) ? ' traced' : ''}" data-wire="${r.id}" data-sheet="${r.sheetId}">${sheetTd(r.sheetId, r.sheet)}<td class="mono">${esc(r.name)}</td><td class="mono">${esc(r.from)}</td><td class="mono">${esc(r.to)}</td><td>${swatchHTML(wv, f.wire)} ${esc(r.colour)}</td><td class="mono">${esc(r.code)}</td><td class="mono">${esc(r.gauge)} mm²</td><td class="mono">${esc(r.awg)}</td><td class="mono">${esc(r.length)}</td><td class="mono">${esc(r.current)}</td><td class="mono">${esc(r.drop)}</td><td>${esc(r.circuit)}</td>${sigCol ? `<td>${esc(t(L.signalName(f.wire.signal)))}</td>` : ''}<td>${esc(r.harness)}</td><td>${esc(cab ? cab.name : '')}</td><td>${esc(r.notes)}</td></tr>`;
      }).join('')}</tbody></table>` : empty('No wires yet. Click a pin, then another pin, to draw one.');
    } else if (tab === 'bom') {
      const cb = L.costedBom(project), rows = all ? cb.parts : L.bom(doc).map((r) => ({ ...r }));
      h = rows.length ? `<table class="data">${th(['Qty', 'Component', 'Spec', 'Part number', 'Supplier', 'Unit', 'Total', 'References', 'Location'])}<tbody>${rows.map((r) => `<tr><td class="mono">${r.qty}</td><td>${esc(r.name)}</td><td class="mono">${esc(r.spec)}</td><td class="mono">${esc(r.mpn)}</td><td>${esc(r.supplier)}</td><td class="mono num">${esc(money(r.unit))}</td><td class="mono num">${esc(money(r.total))}</td><td class="mono wrap">${esc(r.refs.join(', '))}</td><td class="wrap">${esc((r.locations || []).join(', '))}</td></tr>`).join('')}</tbody></table>
        ${all ? `<div class="totals"><span>${esc(t('Parts'))} <b>${esc(money(cb.partsTotal))}</b></span><span>${esc(t('Cable'))} <b>${esc(money(cb.cableTotal))}</b></span><span>${esc(t('Total'))} <b>${esc(money(cb.total))}</b></span>${cb.unpriced ? `<span class="muted">${cb.unpriced} ${esc(t('lines without a price'))}</span>` : ''}</div>` : ''}
        ${note('Add a part number, supplier and price to a part in its Part data section. Cable prices per metre go in Cable totals.')}` : empty('No components yet.');
    } else if (tab === 'cable') {
      const rows = L.cableTotals(scope), costs = project.settings.cableCosts || {};
      const gauges = [...new Set(rows.map((r) => r.gauge))];
      h = rows.length ? `<table class="data">${th(['Size', 'Code', 'Colour', 'Insulation', 'Wires', 'Total m', 'Buy (+15%)', 'Per metre', 'Cost', 'Missing lengths'])}<tbody>${rows.map((r) => `<tr><td class="mono">${esc(r.gauge)} mm²</td><td class="mono">${esc(r.code)}</td><td>${esc(r.colour)}</td><td>${esc((L.INSULATION.find((x) => x.id === r.insulation) || {}).name || '')}</td><td class="mono">${r.wires}</td><td class="mono">${r.metres.toFixed(1)}</td><td class="mono">${(r.metres * 1.15).toFixed(1)}</td><td class="mono num">${esc(money(r.perMetre))}</td><td class="mono num">${esc(money(r.cost))}</td><td class="mono">${r.unknown || ''}</td></tr>`).join('')}</tbody></table>
        <div class="cost-row"><span>${esc(t('Price per metre'))} (${esc(project.settings.currency || '£')}):</span>${gauges.map((g) => `<label>${esc(g)} mm² <input class="cost" inputmode="decimal" data-cable-cost="${esc(g)}" value="${esc(costs[g] == null ? '' : costs[g])}" aria-label="${esc(g)} mm²"></label>`).join('')}</div>` : empty('Add wires with lengths to see how much cable to buy.');
    } else if (tab === 'usage') {
      const rows = L.colourUsage(scope);
      h = rows.length ? `<table class="data">${th(['Colour', 'Code', 'Wires', 'Used for', 'Harness', ...(many ? ['Sheets'] : []), 'Wire numbers', ''])}<tbody>${rows.map((e) => {
        const byHarness = {}; e.uses.forEach((u) => { (byHarness[u.harness] = byHarness[u.harness] || new Set()).add(u.circuit); });
        const f = findWireAnywhere(e.sample.id), wv = f ? L.view(project, f.sheet) : doc;
        return e.uses.map((u, i) => {
          const clash = u.harness && byHarness[u.harness].size > 1;
          return `<tr class="${i ? '' : 'group'}">${i ? '<td></td><td></td><td></td>' : `<td>${swatchHTML(wv, e.sample)} ${esc(e.colour)}</td><td class="mono">${esc(e.code)}</td><td class="mono">${e.wires}</td>`}<td>${esc(u.circuit || t('No circuit'))}</td><td>${esc(u.harness || '')}</td>${many ? `<td class="mono" title="${esc(u.sheets.join(', '))}">${esc(u.sheets.map(sheetNoByName).join(', '))}</td>` : ''}<td class="mono wrap">${esc(u.wires.join(', '))}</td><td>${clash ? `<span class="lvl warn" title="${esc(t('Same colour for different circuits in one harness'))}">${esc(t('same harness'))}</span>` : e.uses.length > 1 && !i ? `<span class="lvl info">${esc(t('reused'))}</span>` : ''}</td></tr>`;
        }).join('');
      }).join('')}</tbody></table>${note('Reusing a colour is fine when the circuits run in different harnesses or are told apart by wire number. "Same harness" marks the uses worth a second look.')}` : empty('No wires yet.');
    } else if (tab === 'fuses') {
      const sc = L.schedule(project);
      const fu = sc.fuses.filter((x) => inScope(x.sheetId)), re = sc.relays.filter((x) => inScope(x.sheetId)), su = sc.supplies.filter((x) => inScope(x.sheetId));
      const st = (s) => s === 'over' ? `<span class="lvl error">${esc(t('over'))}</span>` : s === 'high' ? `<span class="lvl warn">${esc(t('over 80%'))}</span>` : s === 'no rating' ? `<span class="lvl info">${esc(t('no rating'))}</span>` : '';
      const row = (x, cells) => `<tr class="click" data-part="${x.part}" data-sheet="${x.sheetId}">${sheetTd(x.sheetId, x.sheet)}${cells}</tr>`;
      h = (fu.length ? `<h4 class="tbl-h">${esc(t('Fuses and breakers'))}</h4><table class="data">${th([...sheetTh, 'Fuse', 'Rating A', 'Load A', 'Use', '', 'Smallest wire', 'Feeds', 'Circuits'])}<tbody>${fu.map((x) => row(x, `<td class="mono">${esc(x.ref)}</td><td class="mono">${x.rating == null ? '' : x.rating}</td><td class="mono">${x.load}</td><td>${bar(x.pct, x.status)} <span class="mono">${x.pct == null ? '' : x.pct + '%'}</span></td><td>${st(x.status)}</td><td class="mono">${x.smallest == null ? '' : x.smallest + ' mm²'}</td><td class="wrap">${esc(x.loads.map((l) => `${l.ref} ${l.amps}A`).join(', '))}</td><td class="wrap">${esc(x.circuits.join(', '))}</td>`)).join('')}</tbody></table>` : '') +
        (re.length ? `<h4 class="tbl-h">${esc(t('Relays'))}</h4><table class="data">${th([...sheetTh, 'Relay', 'Contacts A', 'Load A', 'Use', '', 'Switches'])}<tbody>${re.map((x) => row(x, `<td class="mono">${esc(x.ref)}</td><td class="mono">${x.rating}</td><td class="mono">${x.load}</td><td>${bar(x.pct, x.status)} <span class="mono">${x.pct}%</span></td><td>${st(x.status)}</td><td class="wrap">${esc(x.loads.map((l) => `${l.ref} ${l.amps}A`).join(', '))}</td>`)).join('')}</tbody></table>` : '') +
        (su.length ? `<h4 class="tbl-h">${esc(t('Supplies'))}</h4><table class="data">${th([...sheetTh, 'Supply', 'Type', 'Capacity', 'Rating A', 'Load A', 'Use', 'Hours at full load'])}<tbody>${su.map((x) => row(x, `<td class="mono">${esc(x.ref)}</td><td>${esc(x.type)}</td><td class="mono">${esc(x.capacity ? x.capacity + ' Ah' : '')}</td><td class="mono">${x.rating == null ? '' : +Number(x.rating).toFixed(1)}</td><td class="mono">${x.load}</td><td>${bar(x.pct, x.pct > 100 ? 'over' : x.pct > 80 ? 'high' : 'ok')} <span class="mono">${x.pct == null ? '' : x.pct + '%'}</span></td><td class="mono">${x.hours == null ? '' : x.hours + ' h'}</td>`)).join('')}</tbody></table>` : '');
      h = h ? h + note(`Loads come from each part's current or wattage at ${sc.volts} V, all switched on together, so this is a worst case. Hours assume half the battery's capacity is usable.`) : empty('No fuses, relays or supplies yet.');
    } else if (tab === 'connectors') {
      const ct = L.connectorTables(project).filter((c) => inScope(c.sheetId));
      h = ct.length ? `<table class="data">${th(['Cavity', 'Wire', 'Code', 'Size', 'Circuit', 'Goes to', 'Terminal', 'Seal'])}<tbody>${ct.map((c) => `<tr class="group click conn-h" data-part="${c.part}" data-sheet="${c.sheetId}"><td colspan="8"><b>${esc(c.ref)}</b> ${esc(c.type)}${c.series ? ' · ' + esc(c.series) : ''}${c.housing ? ' · <span class="mono">' + esc(c.housing) + '</span>' : ''}<span class="muted">${esc([c.gender, c.mate && t('mates with') + ' ' + c.mate, c.lock && t('wedge lock') + ' ' + c.lock, c.cavityPlugs ? `${c.cavityPlugs} ${t('cavity plugs')}` : '', many ? t('sheet') + ' ' + sheetNo(c.sheetId) : ''].filter(Boolean).map((x) => '  ·  ' + x).join(''))}</span></td></tr>` +
        c.rows.map((r) => r.wires.length ? r.wires.map((w) => `<tr class="click" data-wire="${w.id}" data-sheet="${c.sheetId}"><td class="mono">${esc(r.cavity)}</td><td class="mono">${esc(w.name)}</td><td class="mono">${esc(w.code)}</td><td class="mono">${esc(w.gauge)} mm²</td><td>${esc(w.circuit)}</td><td class="mono">${esc(w.to)}</td><td class="mono">${esc(w.termName)}</td><td>${esc(w.seal)}</td></tr>`).join('') : `<tr><td class="mono">${esc(r.cavity)}</td><td class="muted" colspan="6">${esc(t('unused'))}</td><td>${c.sealed ? esc(t('cavity plug')) : ''}</td></tr>`).join('')).join('')}</tbody></table>${note('Terminal and seal part numbers are a guide: check them against the maker\'s catalogue before ordering.')}` : empty('No connectors yet. Add a Connector from Parts, Connectors, and pick its series.');
    } else if (tab === 'cut') {
      const groups = L.cutList(project).map((g) => ({ ...g, rows: g.rows.filter((r) => inScope(r.sheetId)) })).filter((g) => g.rows.length);
      h = groups.length ? `<table class="data">${th(['Wire', 'Code', 'Size', 'Insulation', 'Length m', 'Cut m', 'From', 'End A', 'To', 'End B', 'Cable'])}<tbody>${groups.map((g) => `<tr class="group"><td colspan="11"><b>${esc(g.harness === 'No harness' ? t('No harness') : g.harness)}</b><span class="muted">  ·  ${plural(g.rows.length, t('wire'))}  ·  ${g.cut} m ${esc(t('to cut'))}${g.missing ? '  ·  ' + g.missing + ' ' + esc(t('without a length')) : ''}</span></td></tr>` +
        g.rows.map((r) => `<tr class="click" data-wire="${r.id}" data-sheet="${r.sheetId}"><td class="mono">${esc(r.name)}</td><td class="mono">${esc(r.code)}</td><td class="mono">${esc(r.gauge)} mm²</td><td>${esc((L.INSULATION.find((x) => x.id === r.insulation) || {}).name || '')}</td><td class="mono">${r.length == null ? '' : r.length}</td><td class="mono"><b>${r.cut == null ? '' : r.cut}</b></td><td class="mono">${esc(r.from)}</td><td class="wrap">${esc(endText(r.a))}</td><td class="mono">${esc(r.to)}</td><td class="wrap">${esc(endText(r.b))}</td><td>${esc(r.cable)}</td></tr>`).join('')).join('')}</tbody></table>${note(`Cut length adds ${Math.round((parseFloat(project.settings.cutAllowance) >= 0 ? parseFloat(project.settings.cutAllowance) : 0.15) * 1000)} mm per wire for terminating. Change it in the sheet settings, under Build.`)}` : empty('No wires yet.');
    } else if (tab === 'nets') {
      lastNets = L.nets(project).filter((n) => all || n.wires.some((x) => x.sheet.id === sheetId)).sort((a, b) => (a.earth ? -1 : 0) - (b.earth ? -1 : 0) || a.name.localeCompare(b.name, undefined, { numeric: true }));
      h = lastNets.length ? `<table class="data">${th(['Circuit', 'Wires', 'Connections', 'Sheets', 'Goes to'])}<tbody>${lastNets.map((n, i) => {
        const sheets = [...new Set(n.wires.map((x) => x.sheet.id).concat(n.pins.map((x) => x.sheet.id)))];
        const pins = n.pins.filter((x) => !['offpage', 'net_label', 'splice', 'earth'].includes(x.part.type)).map((x) => x.label);
        const on = trace && trace.net && trace.net.id === n.id;
        return `<tr class="click${on ? ' sel' : ''}" data-net="${i}"><td><b>${esc(n.name)}</b></td><td class="mono">${n.wires.length}</td><td class="mono">${n.pins.length}</td><td class="mono">${esc(sheets.map(sheetNo).sort((a, b) => a - b).join(', '))}</td><td class="mono wrap">${esc([...new Set(pins)].slice(0, 14).join('  ') + (pins.length > 14 ? '  …' : ''))}</td></tr>`;
      }).join('')}</tbody></table>${note('Click a circuit to trace it: every wire on it lights up, on every sheet. Alt+click a wire or pin on the drawing does the same.')}` : empty('No circuits yet.');
    } else if (tab === 'build') {
      const pr = L.buildProgress(project), rows = L.cutList(project).map((g) => ({ ...g, rows: g.rows.filter((r) => inScope(r.sheetId)) })).filter((g) => g.rows.length);
      const wb = new Map(); project.sheets.forEach((s) => s.wires.forEach((w) => wb.set(w.id, w.build || {})));
      const bar = (g) => `<span class="pbar" title="${g.pct}%"><i style="width:${g.pct}%"></i></span> <span class="mono">${g.pct}%</span>`;
      h = rows.length ? `<div class="build-head">${[pr.total].concat(pr.harnesses.length > 1 ? pr.harnesses : []).map((g) => `<span class="bh"><b>${esc(t(g.harness))}</b> ${bar(g)} <span class="muted">${g.cut}/${g.wires} ${esc(t('cut'))}, ${g.pass} ${esc(t('passed'))}${g.fail ? `, <b class="bad">${g.fail} ${esc(t('failed'))}</b>` : ''}</span></span>`).join('')}
        <span class="bh-btns"><button class="btn sm" data-cmd="build-share">${esc(t('Phone checklist…'))}</button><button class="btn sm" data-cmd="build-import">${esc(t('Import phone progress…'))}</button></span></div>
        <table class="data">${th(['Wire', 'Code', 'Size', 'Cut m', 'From', 'To', 'Cut', 'Ends', 'Fitted', 'Test', 'Note'])}<tbody>${rows.map((g) => `<tr class="grp"><td colspan="11">${esc(g.harness)}</td></tr>` + g.rows.map((r) => { const b = wb.get(r.id) || {}; return `<tr class="click${b.test === 'fail' ? ' failrow' : ''}" data-wire="${r.id}" data-sheet="${r.sheetId}"><td class="mono">${esc(r.name)}</td><td class="mono">${esc(r.code)}</td><td class="mono">${esc(r.gauge)}</td><td class="mono">${r.cut == null ? '' : r.cut}</td><td class="mono">${esc(r.from)}</td><td class="mono">${esc(r.to)}</td>${['cut', 'ends', 'fitted'].map((k) => `<td><input type="checkbox" data-build="${r.id}|${k}"${b[k] ? ' checked' : ''} aria-label="${esc(t(k))}"></td>`).join('')}<td><select data-build="${r.id}|test"><option value="">–</option><option value="pass"${b.test === 'pass' ? ' selected' : ''}>${esc(t('Pass'))}</option><option value="fail"${b.test === 'fail' ? ' selected' : ''}>${esc(t('Fail'))}</option></select></td><td><input class="note-in" data-build="${r.id}|note" value="${esc(b.note || '')}"></td></tr>`; }).join('')).join('')}</tbody></table>` : empty('No wires yet.');
    } else if (tab === 'shop') {
      const sl = L.shoppingList(project, userLib.inventory), cur = sl.currency;
      const m = (v) => (v == null ? '' : cur + Number(v).toFixed(2));
      h = `<div class="build-head"><span class="bh"><b>${esc(t('To buy'))}</b> ${sl.toBuy} ${esc(t('lines'))}${sl.total ? `, ${esc(t('about'))} ${m(sl.total)}` : ''}${sl.unknown ? ` <span class="muted">(${plural(sl.unknown, t('wire'))} ${esc(t('without a length'))})</span>` : ''}</span><span class="bh-btns"><button class="btn sm" data-cmd="stock">${esc(t('Edit my stock…'))}</button><button class="btn sm" data-cmd="stock-take">${esc(t('Take from stock…'))}</button><button class="btn sm" data-cmd="export-shop">${esc(t('Export CSV'))}</button></span></div>`;
      h += `<table class="data">${th(['Cable', 'Code', 'Colour', 'Need m', 'In stock m', 'Buy m', 'Reel', 'Cost'])}<tbody>${sl.cable.map((c) => `<tr class="${c.buy > 0 ? '' : 'muted-row'}"><td class="mono">${esc(c.gauge)} mm²</td><td class="mono">${esc(c.code)}</td><td>${esc(c.name)}</td><td class="mono">${c.need}${c.unknown ? ' +?' : ''}</td><td class="mono">${c.have || ''}</td><td class="mono"><b>${c.buy || ''}</b></td><td class="mono">${c.reel ? c.reel + ' m' : ''}</td><td class="mono">${m(c.cost)}</td></tr>`).join('')}</tbody></table>`;
      h += `<table class="data">${th(['Component', 'Spec', 'Part number', 'Supplier', 'Need', 'In stock', 'Buy', 'Cost'])}<tbody>${sl.parts.map((r) => `<tr class="${r.buy > 0 ? '' : 'muted-row'}"><td>${esc(r.name)}</td><td>${esc(r.spec)}</td><td class="mono">${esc(r.mpn)}</td><td>${esc(r.supplier)}</td><td class="mono">${r.need}</td><td class="mono">${r.have || ''}</td><td class="mono"><b>${r.buy || ''}</b></td><td class="mono">${m(r.cost)}</td></tr>`).join('')}</tbody></table>`;
      h += note('Cable needed includes the cut allowance plus 10% spare. Stock is kept on this computer and shared by all your projects.');
    } else if (EXTRA_TABS[tab]) {
      h = extraTab(tab, all);
    } else if (tab === 'checks') {
      const list = checks().filter((c) => all || !c.sheetId || c.sheetId === sheetId);
      h = list.length ? `<table class="data">${th(['Level', 'Finding'])}<tbody>${list.map((c) => `<tr class="click" data-sheet="${c.sheetId || ''}" ${c.wire ? `data-wire="${c.wire}"` : c.part ? `data-part="${c.part}"` : ''}><td><span class="lvl ${c.level}">${esc(t(c.level === 'warn' ? 'check' : c.level))}</span></td><td class="wrap">${esc(c.text)}${c.rule ? ` <span class="muted mono" title="${esc(t('Rule code: see Where the mains checks come from'))}">${esc(c.rule)}</span>` : ''}</td></tr>`).join('')}</tbody></table>${L.disclaimerFor(project).mains ? `<div class="callout warn small">${esc(t('Mains checks are guidance from selected rules of BS 7671 and BS EN 60204-1. They are not a design, test or certificate, and passing them does not mean the work meets the regulations. A qualified electrician must design, test and certify the work.'))}</div>` : note('Size guidance is a rule of thumb for single PVC automotive cable. Always check your cable maker\'s ratings.')}` : empty('No problems found.');
    }
    wrap.innerHTML = h;
  }
  /* Lists for household and factory projects: circuit schedule, motors, terminal plan, PLC I/O. */
  const EXTRA_TABS = { schedule: 'circuits', motors: 'motors', terminals: 'terminals', plcio: 'plcio', power: 'power' };
  const EXTRA_EMPTY = {
    schedule: 'No breakers yet. Add MCBs or RCBOs from Parts, Household, and draw the cables each one feeds.',
    motors: 'No three-phase motors yet.', terminals: 'No terminal strips yet.', plcio: 'No PLC input or output cards yet.',
    power: 'No supply rails yet. Wire a supply, or a board\'s power pin, to the parts it feeds.',
  };
  function extraTab(name, all) {
    const rows = L.reportRows(project, EXTRA_TABS[name]), head = rows[0], si = head.indexOf('Sheet');
    let body = rows.slice(1), refs = [], pre = '', post = '';
    const byLabel = (label, sheetName) => { for (const sh of project.sheets) { if (sheetName && sh.name !== sheetName) continue; const p = sh.parts.find((x) => x.label === label); if (p) return { part: p.id, sheet: sh.id }; } return null; };
    if (name === 'schedule') {
      const hc = L.householdChecks(project), sp = hc.sup;
      refs = hc.circuits.map((c) => ({ part: c.dev.p.id, sheet: c.sheetId }));
      const keep = refs.map((r) => all || r.sheet === sheetId);
      body = body.filter((_, i) => keep[i]); refs = refs.filter((_, i) => keep[i]);
      pre = `<div class="callout warn small">${esc(t('Planning aid using'))} ${esc(L.MAINS_RULESET.name)}. ${esc(t('Figures are estimates from the drawing and typical values, not measurements. This is not a design or a certificate: a qualified electrician must design, test and certify the work.'))} <a href="#" data-act="disclaimer">${esc(t('Disclaimer'))}</a></div>`;
      if (hc.circuits.length) pre += `<div class="build-head"><span class="bh"><b>${esc(t('Supply'))}</b> ${esc(sp.earthing)}, Ze ${sp.ze} Ω${sp.zeTypical ? ' (' + esc(t('typical')) + ')' : ''}, ${sp.fuse} A ${esc(t('fuse'))}</span>${hc.demand ? `<span class="bh"><b>${esc(t('Estimated maximum demand'))}</b> ${esc(t('about'))} ${hc.demand.amps} A <span class="muted">${esc(hc.demand.items.map(([k, v]) => `${t(k)} ${v} A`).join(' · '))}</span></span>` : ''}</div>`;
      post = note('Volt drop and Zs are worked out from cable lengths at 70 °C, with 0.8 of the maximum Zs as the figure a tester should read. Rings use a quarter of the end-to-end resistance. Three-phase circuits are not worked out.');
    } else {
      // each list names its parts in its own column: Module for PLC I/O, Supply for power rails
      const spec = (L.PDF_TABLES && L.PDF_TABLES[EXTRA_TABS[name]]) || {}, ri = Math.max(0, head.indexOf(spec.ref));
      refs = body.map((r) => byLabel(String(r[ri] || '').trim(), si >= 0 ? r[si] : null));
      if (!all && si >= 0) { const keep = body.map((r) => r[si] === doc.sheet.name); body = body.filter((_, i) => keep[i]); refs = refs.filter((_, i) => keep[i]); }
      if (name === 'motors') post = note('Full-load current is estimated from typical 400 V motor data when the rating plate figure is not entered. Starting current is a typical range for the starting method.');
      if (name === 'plcio') post = note('Connected to lists every pin on the same potential, through wires and terminals, with switches and contacts open.');
      if (name === 'power') post = note('Each rail adds up the current drawn by the parts it feeds, from their mA figures, including parts fed through a board\'s own regulator. Parts with no figure are listed under No current figure. Check the ratings against the maker\'s data.');
    }
    if (!body.length) return pre + empty(EXTRA_EMPTY[name]);
    const st = head.indexOf('Status');
    const bad = (c) => c === 'fix' || c === 'over', lvl = (c) => (bad(c) ? 'error' : c === 'check' || c === 'close' ? 'warn' : 'info');
    return `${pre}<table class="data">${th(head)}<tbody>${body.map((r, i) => `<tr class="${refs[i] ? 'click' : ''}${st >= 0 && bad(r[st]) ? ' failrow' : ''}"${refs[i] ? ` data-part="${refs[i].part}" data-sheet="${refs[i].sheet}"` : ''}>${r.map((c, j) => `<td class="${j === st ? '' : 'mono'}">${j === st ? `<span class="lvl ${lvl(c)}">${esc(t(c))}</span>` : esc(c == null ? '' : c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${post}`;
  }
  function highlightRows() { $$('#table-wrap tr[data-wire]').forEach((tr) => tr.classList.toggle('sel', sel.wires.has(tr.dataset.wire))); }
  function showTab(name) {
    tab = name; $$('.tab[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    setTablesOpen(true); tables();
    const b = $(`.tab[data-tab="${name}"]`); if (b) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function setTablesOpen(open) {
    const tb = $('#tables'), b = $('#tables-toggle');
    tb.classList.toggle('collapsed', !open);
    b.setAttribute('aria-expanded', String(open)); b.title = open ? t('Hide lists') : t('Show lists');
    b.querySelector('use').setAttribute('href', open ? '#i-down' : '#i-up');
    $$('[data-cmd="tables"]').forEach((x) => x.classList.toggle('on', open));
  }
  $('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  $('#tables-toggle').addEventListener('click', () => setTablesOpen($('#tables').classList.contains('collapsed')));
  $('#scope-all').addEventListener('change', tables);
  $('#table-wrap').addEventListener('click', (e) => {
    const nr = e.target.closest('tr[data-net]');
    if (nr) {
      const n = lastNets[+nr.dataset.net]; if (!n) return;
      const pin = n.pins[0] || null, w = n.wires[0];
      const sid = pin ? pin.sheet.id : w.sheet.id, end = pin ? { part: pin.part.id, pin: pin.pin } : w.wire.from;
      if (w && w.sheet.id !== sheetId) goSheet(w.sheet.id);
      startTrace(sid, end); tables();
      return;
    }
    const tr = e.target.closest('tr[data-wire], tr[data-part]');
    if (!tr || e.target.closest('input, select')) return;
    if (tr.dataset.sheet && tr.dataset.sheet !== sheetId) goSheet(tr.dataset.sheet);
    if (tr.dataset.wire) select([], [tr.dataset.wire]); else select([tr.dataset.part]);
    centreOnSelection();
  });
  $('#table-wrap').addEventListener('change', (e) => {
    const bk = e.target.dataset.build;
    if (bk) {
      const [id, k] = bk.split('|'), f = findWireAnywhere(id);
      if (!f) return;
      pushHistory();
      L.setBuild(f.wire, { [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
      markDirty(); autosave(); render(); tables(); if (only('wire') === f.wire) { inspector.force = true; inspector(); inspector.force = false; }
      return;
    }
    const g = e.target.dataset.cableCost;
    if (g == null) return;
    pushHistory();
    const v = String(e.target.value).replace(',', '.').replace(/[^\d.]/g, '');
    project.settings.cableCosts = project.settings.cableCosts || {};
    if (v === '' || isNaN(parseFloat(v))) delete project.settings.cableCosts[g]; else project.settings.cableCosts[g] = parseFloat(v);
    commit();
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
  /* Load a project into the current tab, or into a new tab. */
  function loadDoc(d, f, wantSheet, newTab, o = {}) {
    const p = L.normalise(d);
    if (project && newTab) stash();
    const tb = { project: p, sheetId: null, file: { path: (f && f.path) || null, name: (f && f.name) || null, mtime: 0 }, dirty: false, hist: [], redoStack: [], views: {}, view: { x: 40, y: 40, k: 1 }, viewed: true };
    if (newTab || !tabs.length) { tabs.push(tb); active = tabs.length - 1; } else tabs[active] = tb;
    project = p; bindSheet(wantSheet); tb.sheetId = sheetId;
    file = tb.file; dirty = false; hist = tb.hist; redoStack = tb.redoStack;
    Object.keys(views).forEach((k) => delete views[k]);
    sel = { parts: new Set(), wires: new Set() }; draft = null; trace = null; endTest(true); editRev++;
    buildLibrary(); refreshAll(); typeUI(); setHint(); updateTitle(); checkDisclaimer();
    if (!o.keepView) requestAnimationFrame(fit);
    if (file.path && PF.canWatch) { const fl = file; PF.mtime(fl.path).then((m) => { fl.mtime = m; }).catch(() => {}); }
  }
  async function openFile() {
    try {
      const r = await PF.openDiagram();
      if (!r) return;
      const already = r.path ? tabs.findIndex((tb, i) => (i === active ? file.path : tb.file.path) === r.path) : -1;
      if (already >= 0) { if (already !== active) activate(already); toast(`${r.name} ${t('is already open')}`); return; }
      loadDoc(JSON.parse(r.text), r, null, !pristine());
      markClean(); autosave();
      toast(`${t('Opened')} ${r.name}`);
    } catch (e) { showMessage(t('Could not open that file'), `<p>${esc(e.message || e)}</p><p class="muted">${esc(t('LoomWright opens .loom and .json files saved by LoomWright or the Claude add-on. To bring in other formats, use File, Import.'))}</p>`); }
  }
  /* A file handed to us from outside: double-clicked, passed on the command line, or dropped on the window. */
  function openIncoming(o, say) {
    try {
      const at = o.path ? tabs.findIndex((tb, i) => (i === active ? file.path : tb.file.path) === o.path) : -1;
      if (at >= 0) { if (at !== active) activate(at); return; }
      loadDoc(JSON.parse(o.text), o, null, !pristine()); markClean();
      if (say) toast(`${t('Opened')} ${o.name}`);
    } catch (e) { toast(t('Could not open') + ' ' + o.name); }
  }
  // Dropping a .loom file anywhere on the window opens it. Without this the
  // browser would leave the page to show the file.
  window.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    [...e.dataTransfer.files].forEach((f) => {
      if (!/\.(loom|json)$/i.test(f.name)) { toast(t('Only .loom files open by dropping. To bring in other formats, use File, Import.')); return; }
      const rd = new FileReader();
      rd.onload = () => { openIncoming({ name: f.name, path: null, text: String(rd.result) }, true); autosave(); };
      rd.readAsText(f);
    });
  });
  async function save() { return saveTo(file.path); }
  async function saveAs() { return saveTo(null); }
  async function saveTo(path) {
    try {
      const r = await PF.saveDiagram(serialise(), path, slug(project.title) + '.loom');
      if (!r) return;
      if (r.path) { file.path = r.path; file.name = r.name; if (PF.canWatch) file.mtime = await PF.mtime(r.path); }
      else file.name = r.name;
      markClean(); autosave();
      savePoint('Saved');
      if (!r.shown) toast(`${t('Saved')} ${r.name || ''}`);
    } catch (e) { showMessage(t('Could not save'), `<p>${esc(e.message || e)}</p>`); }
  }
  function newProject() {
    const d = L.newDoc(t('Untitled project'));
    d.customColours = clone(userLib.colours || []);
    loadDoc(d, null, null, !pristine()); markClean(); autosave();
  }
  function openSample() { loadDoc(window.LoomSample(), null, null, !pristine()); markClean(); autosave(); }

  // Desktop: reload when the open file changes on disk, e.g. after the Claude add-on edits it.
  if (PF.canWatch) setInterval(async () => {
    if (!file.path) return;
    const fl = file;
    try {
      const m = await PF.mtime(fl.path);
      if (fl !== file) return;
      if (!fl.mtime) { fl.mtime = m; return; }
      if (m > fl.mtime) {
        fl.mtime = m;
        const reload = async () => {
          const text = await PF.readFile(fl.path); const keep = { ...view }, keepSheet = sheetId, before = snapshot();
          loadDoc(JSON.parse(text), fl, keepSheet, false, { keepView: true }); file.mtime = m;
          hist.push(before); view = keep; applyView(); renderOverlay(); markClean();
        };
        if (!dirty) { await reload(); toast(t('Updated from file. Ctrl+Z undoes the change.')); }
        else toast(t('This file changed on disk.'), { label: t('Reload'), run: reload });
      }
    } catch (e) { /* file may be mid-write */ }
  }, 1500);

  // Pick up components and blocks that Claude (or another window) saved to the library.
  async function reloadLibrary() {
    try {
      const fresh = await PF.loadUserLibrary();
      if (!fresh) return;
      const parts = (fresh.parts || []).map((p) => ({ ...p, custom: true, cat: 'My components' }));
      const blocks = fresh.blocks || [];
      if (JSON.stringify(parts) === JSON.stringify(userLib.parts) && JSON.stringify(blocks) === JSON.stringify(userLib.blocks || []) && JSON.stringify(fresh.inventory || null) === JSON.stringify(userLib.inventory || null)) return;
      const added = parts.filter((p) => !userLib.parts.some((u) => u.id === p.id));
      userLib.parts = parts; userLib.colours = fresh.colours || userLib.colours; userLib.blocks = blocks; if (fresh.inventory) userLib.inventory = fresh.inventory;
      buildLibrary();
      if (added.length) toast(`${t('New in My components')}: ${added.map((p) => p.name).join(', ')}`);
    } catch (e) { /* ignore */ }
  }
  window.addEventListener('focus', reloadLibrary);

  /* ---------------- Export ---------------- */
  const csv = (rows) => L.toCSV(rows);
  const projSlug = () => slug(project.title);
  const sheetSlug = () => projSlug() + (project.sheets.length > 1 ? '-' + (project.sheets.indexOf(doc.sheet) + 1) + '-' + slug(doc.sheet.name) : '');
  const saveCSV = (suffix, rows) => PF.exportFile(projSlug() + '-' + suffix + '.csv', '﻿' + csv(rows), 'text/csv');
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
  async function exportDXF() { await PF.exportFile(sheetSlug() + '.dxf', L.exportDXF(doc), 'application/dxf'); }
  async function exportWires() { await saveCSV('wires', L.reportRows(project, 'wires')); }
  async function exportBOM() { await saveCSV('parts', L.reportRows(project, 'bom')); }
  async function exportCable() { await saveCSV('cable', L.reportRows(project, 'cable')); }
  async function exportUsage() { await saveCSV('colour-usage', L.reportRows(project, 'usage')); }
  async function exportFuses() { await saveCSV('fuses-and-loads', L.reportRows(project, 'fuses')); }
  async function exportVoltages() { await saveCSV('voltage-at-each-load', L.reportRows(project, 'voltages')); }
  async function exportConnectors() { await saveCSV('connectors', L.reportRows(project, 'connectors')); }
  async function exportCut() { await saveCSV('cut-list', L.reportRows(project, 'cut')); }
  async function exportLabels(single) { await saveCSV('labels', L.reportRows(project, 'labels', { single })); }
  async function exportShare() { await PF.exportFile(projSlug() + '-view.html', L.shareHTML(project), 'text/html'); toast(t('Saved a read-only page. Anyone can open it in a web browser.')); }
  function wirevizModal() {
    if (!L.hasYAML) { showMessage(t('WireViz export'), `<p>${esc(t('The YAML library did not load, so WireViz files cannot be written.'))}</p>`); return; }
    const hs = [...new Set(project.sheets.flatMap((s) => s.wires.map((w) => w.harness)).filter(Boolean))];
    showModal(t('Export for WireViz'), `<p class="muted">${esc(t('WireViz is a free tool that draws harness documents from a text file. LoomWright writes the connectors, cables and connections for it.'))}</p>
      <label class="fld"><span>${esc(t('Wires'))}</span><select id="wv-h"><option value="">${esc(t('Whole project'))}</option>${hs.map((h) => `<option value="${esc(h)}">${esc(t('Harness'))}: ${esc(h)}</option>`).join('')}</select></label>
      <div class="row-btns"><button class="btn primary" id="wv-go">${esc(t('Export'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    $('#wv-go').onclick = async () => {
      const h = $('#wv-h').value;
      try { const y = L.exportWireViz(project, h ? { harness: h } : {}); closeModal(); await PF.exportFile(projSlug() + (h ? '-' + slug(h) : '') + '.yml', y, 'text/yaml'); }
      catch (e) { showMessage(t('Could not export'), `<p>${esc(e.message || e)}</p>`); }
    };
  }

  /* ---------------- Import ---------------- */
  function runImport(fn) {
    const before = snapshot();
    let res;
    try { res = fn(); } catch (e) { restore(before); bindSheet(sheetId); showMessage(t('Could not import'), `<p>${esc(e.message || e)}</p>`); return null; }
    hist.push(before); redoStack = []; markDirty();
    buildLibrary(); commit();
    if (res && res.sheetId) {
      if (res.sheetId !== sheetId) goSheet(res.sheetId); else requestAnimationFrame(fit);
      const msg = `${t('Imported')} ${plural(res.wires, t('wire'))} ${t('and')} ${plural(res.parts, t('part'))} ${t('to sheet')} "${res.sheet}".`;
      if (res.warnings && res.warnings.length) showMessage(t('Imported, with notes'), `<p>${esc(msg)}</p><ul class="tips">${res.warnings.slice(0, 40).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`);
      else toast(msg + ' ' + t('Ctrl+Z undoes it.'));
    }
    return res;
  }
  const WL_TEMPLATE = 'Wire,From,To,Colour,Size,Length,Circuit,Harness,Notes\r\n101,F1:2,S1:1,NR,1.0,1.8,Spot lamps,Engine bay,\r\n102,S1:2,K1:86,NW,0.5,2.2,Spot lamps,Engine bay,\r\n';
  function importWireListModal() {
    showModal(t('Import a wire list'), `<p class="muted">${esc(t('Bring in a wire list from a spreadsheet. Save it as CSV, or copy the cells and paste them below. The first row names the columns. From and To are written as part:pin, for example F1:2, or as separate From part / From pin columns. Parts that are not in the project yet are made as plain boxes with the pins the list uses.'))}</p>
      <p class="muted">${esc(t('Columns LoomWright understands'))}: <span class="mono">Wire, From, To, Colour, Tracer, Size (mm² or AWG), Length (m or mm), Current, Circuit, Harness, Notes</span>. ${esc(t('Colours can be names or codes such as NR, BK/RD or red/white.'))}</p>
      <label class="fld stack"><span>${esc(t('Paste the cells here'))}</span><textarea id="wl-text" rows="8" class="mono" placeholder="Wire\tFrom\tTo\tColour\tSize\tLength"></textarea></label>
      <label class="fld"><span>${esc(t('New sheet name'))}</span><input id="wl-sheet" value="${esc(t('Imported wire list'))}"></label>
      <div class="row-btns"><button class="btn primary" id="wl-go">${esc(t('Import'))}</button><button class="btn" id="wl-file">${esc(t('Choose a CSV file…'))}</button><button class="btn" id="wl-tpl">${esc(t('Save a template'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    const go = (text, name) => { if (!String(text || '').trim()) { toast(t('Paste a wire list first.')); return; } closeModal(); runImport(() => L.importWireList(project, text, { sheetName: name || $('#wl-sheet').value.trim() || t('Imported wire list') })); };
    $('#wl-go').onclick = () => go($('#wl-text').value, $('#wl-sheet').value.trim());
    $('#wl-file').onclick = async () => { const r = await PF.openText('.csv,.tsv,.txt', t('Wire list')); if (r) go(r.text, r.name.replace(/\.\w+$/, '')); };
    $('#wl-tpl').onclick = () => PF.exportFile('wire-list-template.csv', WL_TEMPLATE, 'text/csv');
  }
  async function importWireVizFile() {
    if (!L.hasYAML) { showMessage(t('WireViz import'), `<p>${esc(t('The YAML library did not load, so WireViz files cannot be read.'))}</p>`); return; }
    const r = await PF.openText('.yml,.yaml', 'WireViz'); if (!r) return;
    runImport(() => L.importWireViz(project, r.text, { sheetName: r.name.replace(/\.\w+$/, '') }));
  }
  async function importKiCadFile() {
    const r = await PF.openText('.net', 'KiCad netlist'); if (!r) return;
    runImport(() => L.importKiCad(project, r.text, { sheetName: r.name.replace(/\.\w+$/, '') }));
  }
  function importLengthsModal() {
    showModal(t('Import wire lengths'), `<p class="muted">${esc(t('Measured the harness routes in a CAD model, or on the vehicle? Bring the lengths in from a list of wire number and length. If the header row says mm, or every length is over 30, the whole list is read as millimetres; otherwise as metres.'))}</p>
      <label class="fld stack"><span>${esc(t('Paste the list here'))}</span><textarea id="ln-text" rows="8" class="mono" placeholder="Wire,Length mm&#10;101,1850&#10;102,2240"></textarea></label>
      <div class="row-btns"><button class="btn primary" id="ln-go">${esc(t('Import'))}</button><button class="btn" id="ln-file">${esc(t('Choose a file…'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    const go = (text) => {
      if (!String(text || '').trim()) { toast(t('Paste the lengths first.')); return; }
      closeModal();
      const res = runImport(() => L.importLengths(project, text));
      if (res) showMessage(t('Lengths imported'), `<p>${esc(t('Updated'))} ${plural(res.updated, t('wire'))} (${esc(t('read as'))} ${res.unit}). ${esc(t('Ctrl+Z undoes it.'))}</p>${res.missing.length ? `<p class="muted">${esc(t('Not found in this project'))}: <span class="mono">${esc(res.missing.slice(0, 40).join(', '))}</span></p>` : ''}`);
    };
    $('#ln-go').onclick = () => go($('#ln-text').value);
    $('#ln-file').onclick = async () => { const r = await PF.openText('.csv,.tsv,.txt', t('Lengths')); if (r) go(r.text); };
  }

  /* ---------------- Printing ---------------- */
  // Each sheet prints on its own page at its drawing size (A4 to A1); fit-to-content sheets use the printer's page.
  function sheetsPrintHTML(bw) {
    let css = '';
    const made = new Set();
    const html = L.views(project).map((v) => {
      const pg = L.pageOf(v), svgText = L.exportSVG(v, bw ? { bw: true } : {});
      if (!pg) return `<div class="psheet fit">${svgText}</div>`;
      const k = 'pg' + pg.size + (pg.portrait ? 'p' : 'l');
      if (!made.has(k)) { made.add(k); css += `@page ${k}{size:${pg.size} ${pg.portrait ? 'portrait' : 'landscape'};margin:0}`; }
      return `<div class="psheet" style="page:${k};width:${pg.W / 4}mm;height:${pg.H / 4 - 1}mm">${svgText}</div>`;
    }).join('');
    return `<style>${css}</style>${html}`;
  }
  function printHTML(html) {
    if (!PF.canPrint) { toast(t('Printing is not available in this preview. Use Save as web page, then print that.')); return; }
    $('#print-area').innerHTML = html;
    requestAnimationFrame(() => window.print());
  }
  function printDiagram() {
    const wl = L.wireList(project);
    printHTML(sheetsPrintHTML(project.settings.bw) + (wl.length ? `<div class="plist"><h3>${esc(t('Wire list'))}: ${esc(project.title)}</h3><table><thead><tr>${['Sheet', 'Wire', 'From', 'To', 'Code', 'Colour', 'mm²', 'm', 'A', 'Circuit', 'Harness', 'Notes'].map((x) => `<th>${esc(t(x))}</th>`).join('')}</tr></thead><tbody>${wl.map((r) => `<tr><td>${esc(r.sheet)}</td><td>${esc(r.name)}</td><td>${esc(r.from)}</td><td>${esc(r.to)}</td><td>${esc(r.code)}</td><td>${esc(r.colour)}</td><td>${esc(r.gauge)}</td><td>${esc(r.length)}</td><td>${esc(r.current)}</td><td>${esc(r.circuit)}</td><td>${esc(r.harness)}</td><td>${esc(r.notes)}</td></tr>`).join('')}</tbody></table></div>` : ''));
  }
  const PACK_SECTIONS = [['sheets', 'Drawings'], ['revisions', 'Revision history'], ['wires', 'Wire list'], ['cut', 'Cut lists by harness'], ['connectors', 'Connector tables'], ['fuses', 'Fuses, relays and load budget'], ['voltages', 'Voltage at each load'], ['circuits', 'Circuit schedule (household)'], ['motors', 'Motors'], ['terminals', 'Terminal plan'], ['plcio', 'PLC inputs and outputs'], ['power', 'Power rails'], ['faults', 'Fault-finding sheets'], ['bom', 'Parts and costs'], ['cables', 'Multicore and screened cables'], ['locations', 'Component locations'], ['formboards', 'Harness formboards'], ['colours', 'Colour usage'], ['labels', 'Wire labels'], ['checks', 'Design checks']];
  function packDocument(html, title) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>@page{size:A4;margin:12mm}body{margin:0;padding:12mm;background:#fff}@media print{body{padding:0}}${L.PACK_CSS}</style></head><body>${html}</body></html>`;
  }
  function packModal() {
    const V = window.LoomViews;
    showModal(t('Build pack'), `<p class="muted">${esc(t('Everything needed to build the loom in one document: drawings, wire and cut lists, connector tables, fuses and loads, parts and costs. Print it, or choose Save as PDF in the print window.'))}</p>
      <div class="checks2">${PACK_SECTIONS.filter(([k]) => ({ circuits: showHouse(), motors: showFactory(), plcio: showFactory(), terminals: showTerminals(), power: showElec() })[k] !== false).map(([k, l]) => `<label class="fld check"><input type="checkbox" data-pack="${k}"${k === 'labels' || k === 'faults' ? '' : ' checked'}><span>${esc(t(l))}</span></label>`).join('')}</div>
      <label class="fld check"><input type="checkbox" id="pk-bw"${project.settings.bw ? ' checked' : ''}><span>${esc(t('Drawings in black and white (wire colours written as codes)'))}</span></label>
      <label class="fld"><span>${esc(t('Label size'))}</span><select id="pk-lsize">${LABEL_SIZES.map(([v, l]) => `<option value="${v}"${v === labelSize ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <div class="row-btns"><button class="btn primary" id="pk-print"${PF.canPrint ? '' : ' disabled'}>${esc(t('Print or save PDF'))}</button><button class="btn" id="pk-html">${esc(t('Save as web page'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    const opts = () => {
      const sections = $$('[data-pack]').filter((x) => x.checked).map((x) => x.dataset.pack);
      labelSize = $('#pk-lsize').value;
      return { sections, bw: $('#pk-bw').checked, labels: sections.includes('labels'), labelSize: labelDims(labelSize), vehicleSVG: V && V.vehicleSVG ? V.vehicleSVG(project) : '', formboardSVG: V && V.formboardSVG ? (h) => V.formboardSVG(project, h) : null };
    };
    $('#pk-print').onclick = () => { const html = L.buildPackHTML(project, opts()); closeModal(); printHTML(`<style>${L.PACK_CSS}@page{size:A4;margin:12mm}</style>${html}`); };
    $('#pk-html').onclick = async () => { const html = L.buildPackHTML(project, opts()); closeModal(); await PF.exportFile(projSlug() + '-build-pack.html', packDocument(html, project.title + ' build pack'), 'text/html'); };
  }
  /* A real PDF: vector sheets, then tables, with bookmarks and links that jump to parts. */
  function pdfModal() {
    if (!L.projectPDFAsync) return;
    const type = ptype(), only = { circuits: showHouse(), motors: showFactory(), plcio: showFactory(), terminals: showTerminals(), power: showElec() };
    const T = {}; Object.keys(L.PDF_TABLES).forEach((k) => { if (only[k] !== false) T[k] = L.PDF_TABLES[k]; });
    const def = new Set(type === 'household' ? ['wires', 'circuits', 'bom'] : type === 'factory' ? ['wires', 'motors', 'terminals', 'plcio', 'bom'] : type === 'electronics' ? ['wires', 'power', 'connectors', 'bom'] : L.PDF_DEFAULT_TABLES);
    showModal(t('Export PDF'), `<p class="muted">${esc(t('Every sheet as a sharp drawing you can zoom into, then the tables you pick. Bookmarks list each sheet and every part on it, and cross-references and wire list entries are links that jump to the part.'))}</p>
      <label class="fld"><span>${esc(t('Sheets'))}</span><select id="pdf-sheets"><option value="all">${esc(t('All sheets'))} (${project.sheets.length})</option><option value="this">${esc(t('This sheet only'))}</option></select></label>
      <h3 class="mh">${esc(t('Tables after the drawings'))}</h3>
      <div class="checks2">${Object.keys(T).map((k) => `<label class="fld check"><input type="checkbox" data-pdft="${k}"${def.has(k) ? ' checked' : ''}><span>${esc(t(T[k].title))}</span></label>`).join('')}</div>
      <label class="fld check"><input type="checkbox" id="pdf-bw"${project.settings.bw ? ' checked' : ''}><span>${esc(t('Drawings in black and white (wire colours written as codes)'))}</span></label>
      <div class="row-btns"><button class="btn primary" id="pdf-go">${esc(t('Save PDF'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    $('#pdf-go').onclick = async () => {
      const tables = $$('[data-pdft]').filter((x) => x.checked).map((x) => x.dataset.pdft);
      const sheets = $('#pdf-sheets').value === 'this' ? [doc.sheet.id] : null;
      closeModal();
      try {
        const bytes = await L.projectPDFAsync(project, { tables, sheets, bw: $('#pdf-bw') ? $('#pdf-bw').checked : project.settings.bw, date: new Date().toISOString().slice(0, 10) });
        await PF.exportFile(projSlug() + '.pdf', bytes, 'application/pdf');
      } catch (e) { showMessage(t('Export PDF'), `<p>${esc(e.message)}</p>`); }
    };
  }
  let labelSize = '38x21';
  const labelDims = (v) => { const [w, h] = String(v).split('x').map(Number); return { width: w === 64 ? 63.5 : w, height: h === 34 ? 33.9 : h === 11 ? 11.1 : h }; };
  const LABEL_SIZES = [['38x21', '38 × 21 mm (65 per A4 sheet)'], ['64x34', '63.5 × 33.9 mm (24 per A4 sheet)'], ['46x11', '46 × 11.1 mm (84 per A4, wrap-around)'], ['25x10', '25 × 10 mm (heat-shrink sleeve)']];
  function labelsModal() {
    const n = project.sheets.reduce((a, s) => a + s.wires.length, 0);
    showModal(t('Wire labels'), `<p class="muted">${esc(t('One label for each end of every wire: the wire number, then where this end goes and where the other end goes. Print on plain paper to check, then on label sheets or heat-shrink sleeves. For a label printer, save the CSV and open it in the printer software.'))}</p>
      <label class="fld"><span>${esc(t('Label size'))}</span><select id="lb-size">${LABEL_SIZES.map(([v, l]) => `<option value="${v}"${v === labelSize ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="fld check"><input type="checkbox" id="lb-single"><span>${esc(t('One label per wire instead of one per end'))}</span></label>
      <p class="muted">${plural(n, t('wire'))}.</p>
      <div class="row-btns"><button class="btn primary" id="lb-print"${PF.canPrint ? '' : ' disabled'}>${esc(t('Print labels'))}</button><button class="btn" id="lb-csv">${esc(t('Save CSV for a label printer'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    const size = () => { labelSize = $('#lb-size').value; return labelDims(labelSize); };
    $('#lb-print').onclick = () => { const html = `<div class="pack">${L.labelSheetHTML(L.wireLabels(project, { single: $('#lb-single').checked }), size())}</div>`; closeModal(); printHTML(`<style>${L.PACK_CSS}@page{size:A4 portrait;margin:8mm}</style>${html}`); };
    $('#lb-csv').onclick = () => { const s = $('#lb-single').checked; closeModal(); exportLabels(s); };
  }

  /* ---------------- Stock and shopping list ---------------- */
  function stockModal() {
    const inv = L.normaliseInventory(userLib.inventory);
    const gaugeSel = (v) => `<select data-k="gauge">${L.GAUGES.map((g) => `<option value="${g.mm2}"${g.mm2 === String(v) ? ' selected' : ''}>${g.mm2} mm²</option>`).join('')}</select>`;
    const colSel = (k, v, none) => `<select data-k="${k}">${none ? `<option value="">–</option>` : ''}${L.COLOURS.concat(project.customColours || []).map((c) => `<option value="${esc(c.id)}"${c.id === v ? ' selected' : ''}>${esc(L.colourCode(doc, c) || c.name)} · ${esc(c.name)}</option>`).join('')}</select>`;
    const cableRow = (c) => `<tr data-row="cable"><td>${gaugeSel(c.gauge || '1.0')}</td><td>${colSel('colour', c.colour || 'black')}</td><td>${colSel('tracer', c.tracer || '', true)}</td><td><input type="number" min="0" step="0.5" data-k="metres" value="${c.metres || ''}" style="width:70px"></td><td><button class="iconbtn sm" data-del title="${esc(t('Remove'))}">×</button></td></tr>`;
    const itemRow = (x) => `<tr data-row="item"><td><input data-k="name" value="${esc(x.name || '')}" placeholder="${esc(t('e.g. Relay (4-pin)'))}"></td><td><input data-k="mpn" value="${esc(x.mpn || '')}"></td><td><input type="number" min="0" step="1" data-k="qty" value="${x.qty || ''}" style="width:60px"></td><td><button class="iconbtn sm" data-del title="${esc(t('Remove'))}">×</button></td></tr>`;
    showModal(t('My stock'), `<p class="muted">${esc(t('What you have on the shelf. The shopping list takes it off what each project needs, and the colour helper prefers colours you have. Kept on this computer for all your projects.'))}</p>
      <h3 class="mh">${esc(t('Cable'))}</h3><table class="data stock"><thead><tr><th>${esc(t('Size'))}</th><th>${esc(t('Main'))}</th><th>${esc(t('Tracer'))}</th><th>${esc(t('Metres'))}</th><th></th></tr></thead><tbody id="stk-cable">${inv.cable.map(cableRow).join('')}</tbody></table>
      <div class="row-btns"><button class="btn sm" id="stk-add-c">${esc(t('Add cable'))}</button><button class="btn sm" id="stk-from-proj">${esc(t('Add every cable this project uses'))}</button></div>
      <h3 class="mh">${esc(t('Parts'))}</h3><table class="data stock"><thead><tr><th>${esc(t('Component'))}</th><th>${esc(t('Part number'))}</th><th>${esc(t('Qty'))}</th><th></th></tr></thead><tbody id="stk-items">${inv.items.map(itemRow).join('')}</tbody></table>
      <div class="row-btns"><button class="btn sm" id="stk-add-i">${esc(t('Add part'))}</button></div>
      <div class="row-btns"><button class="btn primary" id="stk-save">${esc(t('Save stock'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    $('#modal .modal-card').classList.add('wide');
    $('#stk-add-c').onclick = () => $('#stk-cable').insertAdjacentHTML('beforeend', cableRow({}));
    $('#stk-add-i').onclick = () => $('#stk-items').insertAdjacentHTML('beforeend', itemRow({}));
    $('#stk-from-proj').onclick = () => {
      const have = new Set($$('#stk-cable tr').map((r) => ['gauge', 'colour', 'tracer'].map((k) => r.querySelector(`[data-k="${k}"]`).value).join('|')));
      L.shoppingList(project, null).cable.forEach((c) => { const k = [c.gauge, c.colour, c.tracer].join('|'); if (!have.has(k)) { have.add(k); $('#stk-cable').insertAdjacentHTML('beforeend', cableRow({ gauge: c.gauge, colour: c.colour, tracer: c.tracer, metres: '' })); } });
    };
    $('#modal-body').onclick = (e) => { const d = e.target.closest('[data-del]'); if (d) d.closest('tr').outerHTML = ''; };
    $('#stk-save').onclick = async () => {
      const val = (r, k) => (r.querySelector(`[data-k="${k}"]`) || {}).value || '';
      userLib.inventory = L.normaliseInventory({
        cable: $$('#stk-cable tr').map((r) => ({ gauge: val(r, 'gauge'), colour: val(r, 'colour'), tracer: val(r, 'tracer'), metres: val(r, 'metres') })),
        items: $$('#stk-items tr').map((r) => ({ name: val(r, 'name'), mpn: val(r, 'mpn'), qty: val(r, 'qty') })),
      });
      await PF.saveUserLibrary(userLib); closeModal(); tables(); inspector.force = true; inspector(); inspector.force = false;
      toast(t('Stock saved'));
    };
  }
  function takeStockModal() {
    const r = L.takeFromStock(project, userLib.inventory);
    if (!r.changes.length) { showMessage(t('Take from stock'), `<p>${esc(t('Nothing this project uses is in your stock list.'))}</p>`); return; }
    showModal(t('Take from stock'), `<p>${esc(t('Take what this project uses out of your stock list? Do this once the loom is built.'))}</p><ul class="mono" style="font-size:12px;max-height:40vh;overflow:auto">${r.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      <div class="row-btns"><button class="btn primary" id="tk-go">${esc(t('Take from stock'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    $('#tk-go').onclick = async () => { const before = userLib.inventory; userLib.inventory = r.inventory; await PF.saveUserLibrary(userLib); closeModal(); tables(); toast(t('Stock updated'), { label: t('Undo'), run: async () => { userLib.inventory = before; await PF.saveUserLibrary(userLib); tables(); } }); };
  }
  async function exportShopping() {
    const sl = L.shoppingList(project, userLib.inventory);
    const rows = [['Type', 'Item', 'Spec', 'Part number', 'Supplier', 'Need', 'In stock', 'Buy', 'Unit', 'Cost']]
      .concat(sl.cable.map((c) => ['Cable', `${c.gauge} mm² ${c.code}`, c.name, '', '', c.need, c.have, c.buy, 'm', c.cost == null ? '' : c.cost]))
      .concat(sl.parts.map((r) => ['Part', r.name, r.spec, r.mpn, r.supplier, r.need, r.have, r.buy, 'each', r.cost == null ? '' : r.cost]));
    await saveCSV('shopping-list', rows);
  }
  /* The shared page with a tick list for the bench, and reading the ticks back in. */
  async function exportBuildChecklist() {
    const html = L.shareHTML(project, { checklist: true });
    await PF.exportFile(projSlug() + '-build-checklist.html', html, 'text/html');
    toast(t('Open it on your phone. Ticks stay on the phone; use Export progress there and Import phone progress here.'));
  }
  async function importBuildProgress() {
    const f = await PF.openText('.json', 'Build progress');
    if (!f) return;
    try {
      const data = JSON.parse(f.text);
      pushHistory();
      const n = L.importBuildProgress(project, data);
      commit(); showTab('build');
      toast(`${t('Progress updated on')} ${plural(n, t('wire'))}`);
    } catch (e) { showMessage(t('Import phone progress'), `<p>${esc(e.message)}</p>`); }
  }

  /* ---------------- Fault finding ---------------- */
  function faultModal(ref, symptom) {
    if (!L.faultFind) return;
    const ts = L.faultTargets(project);
    if (!ts.length) {
      const single = ptype() === 'household';
      showMessage(t('Fault finding'), `<p>${esc(t(single ? 'Fault-finding sheets follow low-voltage circuits drawn with both the feed and the return. Household circuits are drawn single-line, so there is no path to follow. Faults on mains wiring need a qualified electrician with the right test equipment.' : 'Give your loads a reference (H1, M1 and so on) to fault-find them.'))}</p>`);
      return;
    }
    const cur = { ref: ts.some((x) => x.part === ref) ? ref : ts[0].part, symptom: symptom || 'dead' };
    if (ref && !ts.some((x) => x.part === ref)) { const p = partById(ref); const m = p && p.label && ts.find((x) => x.ref === p.label); if (m) cur.ref = m.part; }
    showModal(t('Fault finding'), `<p class="muted">${esc(t('Pick a load and what it is doing wrong. LoomWright follows its feed, switches, fuses and earth through every sheet and writes a step-by-step test with the readings to expect.'))}</p>
      <div class="ff-pick"><label class="fld"><span>${esc(t('Load'))}</span><select id="ff-ref">${ts.map((x) => `<option value="${esc(x.part)}"${x.part === cur.ref ? ' selected' : ''}>${esc(x.ref)} · ${esc(t(x.name))}${project.sheets.length > 1 ? ' · ' + esc(x.sheet) : ''}</option>`).join('')}</select></label>
      <label class="fld"><span>${esc(t('Problem'))}</span><select id="ff-sym">${L.FAULT_SYMPTOMS.map((x) => `<option value="${x.id}"${x.id === cur.symptom ? ' selected' : ''}>${esc(t(x.name))}</option>`).join('')}</select></label></div>
      <div id="ff-out" class="ff-out"></div>
      <div class="row-btns"><button class="btn" id="ff-show">${esc(t('Show on drawing'))}</button><button class="btn" id="ff-print"${PF.canPrint ? '' : ' disabled'}>${esc(t('Print'))}</button><button class="btn" id="ff-save">${esc(t('Save as web page'))}</button><button class="btn primary" data-close>${esc(t('Close'))}</button></div>`);
    $('#modal .modal-card').classList.add('wide');
    let res = null;
    const html = () => L.faultSheetHTML(res, { project: project.title });
    const run = () => {
      cur.ref = $('#ff-ref').value; cur.symptom = $('#ff-sym').value;
      try { res = L.faultFind(project, cur.ref, cur.symptom); } catch (e) { console.warn(e); res = { error: t('Could not work out this circuit.') + ' ' + e.message }; }
      $('#ff-out').innerHTML = `<style>${L.FAULT_CSS}</style>` + html();
      ['ff-show', 'ff-print', 'ff-save'].forEach((id) => { $('#' + id).disabled = !!res.error || (id === 'ff-print' && !PF.canPrint); });
    };
    $('#ff-ref').onchange = run; $('#ff-sym').onchange = run;
    $('#ff-out').onclick = (e) => {
      const a = e.target.closest('.fs-go'); if (!a) return;
      e.preventDefault();
      const el = document.getElementById(a.getAttribute('href').slice(1));
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1000); }
    };
    run();
    $('#ff-show').onclick = () => { if (!res || res.error) return; const r = res; closeModal(); showFaultPath(r); };
    $('#ff-print').onclick = () => { if (!res || res.error) return; const h = html(); closeModal(); printHTML(`<style>${L.FAULT_CSS}@page{size:A4;margin:12mm}</style>${h}`); };
    $('#ff-save').onclick = async () => { if (!res || res.error) return; const h = html(), name = `${projSlug()}-fault-${String(res.ref).replace(/[^\w-]+/g, '_')}-${res.symptom}.html`; closeModal(); await PF.exportFile(name, packDocument(h, res.title), 'text/html'); };
  }
  /* Highlight the circuit a fault sheet follows, like a trace. */
  function showFaultPath(f) {
    const ws = new Set(f.highlight.wires), ps = new Set(f.highlight.parts), wires = [], pins = [];
    project.sheets.forEach((s) => {
      s.wires.forEach((w) => { if (ws.has(w.id)) wires.push({ sheet: s, wire: w }); });
      s.parts.forEach((p) => { if (ps.has(p.id)) pins.push({ sheet: s, part: p, pin: '', label: p.label || p.type }); });
    });
    if (test) endTest(true);
    trace = { fault: true, name: f.title };
    fillTrace({ id: 'fault', name: f.title, wires, pins });
    if (f.sheetId !== sheetId) goSheet(f.sheetId, true);
    refreshTraceUI();
  }

  /* ---------------- Modals ---------------- */
  function showModal(title, html) { $('#modal-title').textContent = title; $('#modal-body').innerHTML = html; $('#modal').hidden = false; $('#modal .modal-card').classList.remove('wide'); }
  function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; }
  function showMessage(title, html) { showModal(title, html + `<div class="row-btns"><button class="btn primary" data-close>${esc(t('OK'))}</button></div>`); }
  $('#modal-x').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });

  PF.onBlockedDownload = (name, data, mime) => {
    if (typeof data === 'string') {
      showModal(t('Copy your file'), `<p class="muted">${esc(t("This preview can't save files directly. Copy the contents below into a file called"))} <b>${esc(name)}</b>${esc(t(', or download LoomWright to save normally.'))}</p><textarea id="dl-text" readonly>${esc(data)}</textarea><div class="row-btns"><button class="btn primary" id="dl-copy">${esc(t('Copy to clipboard'))}</button></div>`);
      $('#dl-copy').onclick = async () => { const ta = $('#dl-text'); try { await navigator.clipboard.writeText(ta.value); toast(t('Copied')); } catch (e) { ta.focus(); ta.select(); } };
    } else {
      const url = URL.createObjectURL(new Blob([data], { type: mime }));
      showModal(t('Save your image'), `<p class="muted">${esc(t("This preview can't save files directly. Right-click the image and choose save."))}</p><img src="${url}" alt="${esc(t('Exported diagram'))}">`);
    }
  };

  function coloursModal() {
    const s = project.settings, stock = new Set(s.stock || []);
    const used = new Set(); project.sheets.forEach((sh) => sh.wires.forEach((w) => [w.colour, w.tracer, w.tracer2].forEach((c) => c && used.add(c))));
    const stockBox = (id) => `<input type="checkbox" data-stock="${esc(id)}"${stock.has(id) ? ' checked' : ''} aria-label="${esc(t('In stock'))}">`;
    const rows = project.customColours.map((c, i) => `<tr data-i="${i}"><td>${stockBox(c.id)}</td><td><input type="color" value="${esc(c.hex)}" data-k="hex" aria-label="${esc(t('Colour'))}"></td><td><input type="text" value="${esc(c.name)}" data-k="name" aria-label="${esc(t('Name'))}"></td><td><input type="text" value="${esc(c.code)}" data-k="code" aria-label="${esc(t('Code'))}" class="mono"></td><td class="mono">${used.has(c.id) ? esc(t('used')) : ''}</td><td><button class="btn icon danger" data-del="${i}" aria-label="${esc(t('Remove'))}">✕</button></td></tr>`).join('');
    showModal(t('Wire colours'), `<div class="colours-m">
      <label class="fld"><span>${esc(t('Colour codes'))}</span><select id="m-std">${Object.values(L.STANDARDS).map((x) => `<option value="${x.id}"${x.id === s.standard ? ' selected' : ''}>${esc(t(x.name))}</option>`).join('')}</select></label>
      <p class="muted">${esc(L.STANDARDS[s.standard].note)} ${esc(t('Changing the standard relabels every wire; the colours stay the same.'))}</p>
      <h3>${esc(t('Colours I stock'))}</h3>
      <p class="muted">${esc(t('Tick the cable colours you actually have. With "only offer colours I stock" on, wire pickers list just these, so the same few colours get reused for different jobs. The Colour usage list then shows each job a colour does.'))}</p>
      <label class="fld check"><input type="checkbox" id="m-stockonly"${s.stockOnly ? ' checked' : ''}><span>${esc(t('Only offer colours I stock in wire pickers'))}</span></label>
      <h3>${esc(t('My colours'))}</h3>
      <p class="muted">${esc(t('Any colour your loom uses, with your own name and code. Saved in this project and in your palette for new projects.'))}</p>
      <div style="overflow-x:auto"><table class="data colour-table"><thead><tr><th>${esc(t('Stock'))}</th><th>${esc(t('Colour'))}</th><th>${esc(t('Name'))}</th><th>${esc(t('Code'))}</th><th></th><th></th></tr></thead><tbody id="m-rows">${rows || `<tr><td colspan="6" class="muted">${esc(t('No custom colours yet.'))}</td></tr>`}</tbody></table></div>
      <div class="row-btns"><button class="btn" id="m-add">${esc(t('Add colour'))}</button><button class="btn" id="m-import"${userLib.colours.length ? '' : ' disabled'}>${esc(t('Add my saved palette'))}</button></div>
      <h3>${esc(t('Standard colours'))}</h3>
      <div style="overflow-x:auto"><table class="data"><thead><tr><th>${esc(t('Stock'))}</th><th>${esc(t('Colour'))}</th><th>${esc(t('Name'))}</th><th>Land Rover</th><th>DIN / IEC</th><th>SAE</th><th></th></tr></thead><tbody id="m-std-rows">${L.COLOURS.map((c) => `<tr><td>${stockBox(c.id)}</td><td><span class="swatch" style="background:${c.hex}"></span></td><td>${esc(t(c.name))}</td><td class="mono">${esc(c.lr)}</td><td class="mono">${esc(c.din)}</td><td class="mono">${esc(c.sae)}</td><td class="mono muted">${used.has(c.id) ? esc(t('used')) : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="row-btns"><button class="btn" id="m-stock-used">${esc(t('Stock = colours in use'))}</button><button class="btn primary" data-close>${esc(t('Done'))}</button></div></div>`);
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
    $('#modal-body .colours-m').addEventListener('change', (e) => {
      const id = e.target.dataset && e.target.dataset.stock; if (id == null) return;
      const set = new Set(s.stock || []); if (e.target.checked) set.add(id); else set.delete(id);
      s.stock = [...set]; finish();
    });
    $('#m-add').onclick = () => { project.customColours.push({ id: L.uid('c_'), custom: true, name: t('Custom colour'), code: 'CU' + (project.customColours.length + 1), hex: '#3a7d5c' }); finish(); coloursModal(); };
    $('#m-import').onclick = () => { (userLib.colours || []).forEach((c) => { if (!project.customColours.some((x) => x.id === c.id)) project.customColours.push(clone(c)); }); finish(); coloursModal(); };
    $('#m-rows').addEventListener('input', (e) => { const tr = e.target.closest('tr[data-i]'); if (!tr || !e.target.dataset.k) return; project.customColours[+tr.dataset.i][e.target.dataset.k] = e.target.value; render(); });
    $('#m-rows').addEventListener('change', (e) => { if (e.target.dataset.k) finish(); });
    $('#m-rows').addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]'); if (!b) return;
      const c = project.customColours[+b.dataset.del];
      if (used.has(c.id)) { toast(`${c.name}: ${t('used by wires. Change those wires first.')}`); return; }
      project.customColours.splice(+b.dataset.del, 1); s.stock = (s.stock || []).filter((x) => x !== c.id); finish(); coloursModal();
    });
  }

  /* Cables: multicore, twisted pair and screened. Wires join a cable as its cores. */
  function cablesModal() {
    const rep = L.cableReport(project);
    const rows = rep.map((c, i) => `<tr data-ci="${i}"><td><input type="text" value="${esc(c.name)}" data-ck="name" aria-label="${esc(t('Name'))}"></td><td><select data-ck="type" aria-label="${esc(t('Type'))}">${L.CABLE_TYPES.map(([v, l]) => `<option value="${v}"${v === c.type ? ' selected' : ''}>${esc(t(l))}</option>`).join('')}</select></td><td><input type="number" min="1" max="64" value="${esc(c.cores || '')}" data-ck="cores" aria-label="${esc(t('Cores'))}" style="width:60px"></td><td><input type="text" value="${esc(c.mpn || '')}" data-ck="mpn" aria-label="${esc(t('Part number'))}" class="mono"></td><td class="mono">${c.used}${c.cores ? ' / ' + c.cores : ''}</td><td class="mono wrap">${esc(c.wires.join(', '))}</td><td><button class="btn icon danger" data-cdel="${i}" aria-label="${esc(t('Remove'))}">✕</button></td></tr>`).join('');
    showModal(t('Cables'), `<p class="muted">${esc(t('A cable groups wires that run together in one sheath, such as a 4-core trailer cable or a screened twisted pair for a sensor. Pick the cable on each wire (Properties, Cable) to make it a core. The cut list, build pack and WireViz export show the cable.'))}</p>
      <div style="overflow-x:auto"><table class="data"><thead><tr><th>${esc(t('Name'))}</th><th>${esc(t('Type'))}</th><th>${esc(t('Cores'))}</th><th>${esc(t('Part number'))}</th><th>${esc(t('Used'))}</th><th>${esc(t('Wires'))}</th><th></th></tr></thead><tbody id="cb-rows">${rows || `<tr><td colspan="7" class="muted">${esc(t('No cables yet.'))}</td></tr>`}</tbody></table></div>
      <div class="row-btns"><button class="btn" id="cb-add">${esc(t('Add cable'))}</button>${sel.wires.size ? `<button class="btn" id="cb-sel">${esc(t('New cable from the selected wires'))} (${sel.wires.size})</button>` : ''}<button class="btn primary" data-close>${esc(t('Done'))}</button></div>`);
    $('#modal .modal-card').classList.add('wide');
    const newCable = (cores) => { const c = { id: L.uid('cab'), name: 'C' + ((project.cables || []).length + 1), type: 'multicore', cores: cores || 2, mpn: '' }; project.cables = project.cables || []; project.cables.push(c); return c; };
    $('#cb-add').onclick = () => { pushHistory(); newCable(2); commit(); cablesModal(); };
    if ($('#cb-sel')) $('#cb-sel').onclick = () => { pushHistory(); const c = newCable(sel.wires.size); sel.wires.forEach((id) => { const w = wireById(id); if (w) w.cable = c.id; }); commit(); cablesModal(); };
    const rowsEl = $('#cb-rows');
    rowsEl.addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-ci]'); if (!tr || !e.target.dataset.ck) return;
      pushHistory();
      const c = project.cables[+tr.dataset.ci], k = e.target.dataset.ck;
      c[k] = k === 'cores' ? (parseInt(e.target.value, 10) || '') : e.target.value;
      commit();
    });
    rowsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cdel]'); if (!b) return;
      pushHistory();
      const c = project.cables[+b.dataset.cdel];
      project.cables.splice(+b.dataset.cdel, 1);
      project.sheets.forEach((s) => s.wires.forEach((w) => { if (w.cable === c.id) delete w.cable; }));
      commit(); cablesModal();
    });
  }

  /* Find and replace across wires and parts, on this sheet or the whole project. */
  const FIND_FIELDS = [['name', 'Wire numbers', 'wire'], ['circuit', 'Circuits', 'wire'], ['harness', 'Harnesses', 'wire'], ['notes', 'Wire notes', 'wire'], ['label', 'Part references', 'part'], ['props', 'Part values and text', 'part'], ['location', 'Locations', 'part'], ['mpn', 'Part numbers', 'part']];
  let findState = { q: '', r: '', all: true, cs: false, word: false, fields: new Set(['name', 'circuit', 'harness', 'notes', 'label', 'props', 'location', 'mpn']) };
  function findRegex(g) {
    const q = findState.q; if (!q) return null;
    const src = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(findState.word ? `\\b${src}\\b` : src, (g ? 'g' : '') + (findState.cs ? '' : 'i'));
  }
  function findMatches() {
    const re = findRegex(false), out = [];
    if (!re) return out;
    const sheets = findState.all ? project.sheets : [doc.sheet];
    sheets.forEach((s) => {
      const v = L.view(project, s);
      s.wires.forEach((w) => FIND_FIELDS.forEach(([f, , kind]) => { if (kind === 'wire' && findState.fields.has(f) && re.test(String(w[f] || ''))) out.push({ sheet: s, kind, obj: w, field: f, text: String(w[f]), where: w.name }); }));
      s.parts.forEach((p) => {
        const nm = (L.partDef(v, p.type) || {}).name || p.type;
        ['label', 'location', 'mpn'].forEach((f) => { if (findState.fields.has(f) && re.test(String(p[f] || ''))) out.push({ sheet: s, kind: 'part', obj: p, field: f, text: String(p[f]), where: p.label || nm }); });
        if (findState.fields.has('props')) Object.entries(p.props || {}).forEach(([k, val]) => { if (typeof val === 'string' && re.test(val)) out.push({ sheet: s, kind: 'part', obj: p, field: 'props', key: k, text: val, where: (p.label || nm) + ' ' + k }); });
      });
    });
    return out;
  }
  function findModal(replace) {
    showModal(replace ? t('Find and replace') : t('Find'), `<div class="find">
      <div class="two"><label class="fld"><span>${esc(t('Find'))}</span><input id="fd-q" value="${esc(findState.q)}" autocomplete="off" spellcheck="false"></label>${replace ? `<label class="fld"><span>${esc(t('Replace with'))}</span><input id="fd-r" value="${esc(findState.r)}" autocomplete="off" spellcheck="false"></label>` : ''}</div>
      <div class="find-opts"><label class="fld check"><input type="checkbox" id="fd-all"${findState.all ? ' checked' : ''}><span>${esc(t('All sheets'))}</span></label><label class="fld check"><input type="checkbox" id="fd-cs"${findState.cs ? ' checked' : ''}><span>${esc(t('Match case'))}</span></label><label class="fld check"><input type="checkbox" id="fd-word"${findState.word ? ' checked' : ''}><span>${esc(t('Whole words'))}</span></label></div>
      <div class="find-opts">${FIND_FIELDS.map(([f, l]) => `<label class="chip ghost"><input type="checkbox" data-ff="${f}"${findState.fields.has(f) ? ' checked' : ''}> ${esc(t(l))}</label>`).join('')}</div>
      <div id="fd-list" class="find-list"></div>
      <div class="row-btns">${replace ? `<button class="btn primary" id="fd-rep">${esc(t('Replace all'))}</button>` : `<button class="btn" id="fd-to-rep">${esc(t('Replace…'))}</button>`}<button class="btn" data-close>${esc(t('Close'))}</button></div></div>`);
    $('#modal .modal-card').classList.add('wide');
    let matches = [];
    const list = () => {
      matches = findMatches();
      const re = findRegex(true);
      const hi = (s) => re ? esc(s).replace(new RegExp(re.source.replace(/&/g, '&amp;'), re.flags), (m) => `<mark>${m}</mark>`) : esc(s);
      $('#fd-list').innerHTML = !findState.q ? `<p class="muted">${esc(t('Type to search wire numbers, circuits, harnesses, part references, values and locations.'))}</p>`
        : matches.length ? `<p class="muted">${plural(matches.length, t('match'))}${matches.length > 300 ? ', ' + t('first 300 shown') : ''}</p><table class="data"><tbody>${matches.slice(0, 300).map((m, i) => `<tr class="click" data-fm="${i}"><td class="mono">${sheetNo(m.sheet.id)}</td><td>${esc(t(m.kind === 'wire' ? 'Wire' : 'Part'))}</td><td class="mono">${esc(m.where)}</td><td class="muted">${esc(t((FIND_FIELDS.find((f) => f[0] === m.field) || [0, m.field])[1]))}</td><td class="wrap">${hi(m.text)}</td></tr>`).join('')}</tbody></table>`
          : `<p class="muted">${esc(t('Nothing matches.'))}</p>`;
    };
    const q = $('#fd-q'); q.focus(); q.select();
    const box = $('#modal-body .find');
    box.addEventListener('input', (e) => {
      if (e.target.id === 'fd-q') findState.q = e.target.value;
      if (e.target.id === 'fd-r') findState.r = e.target.value;
      list();
    });
    box.addEventListener('change', (e) => {
      const tg = e.target;
      if (tg.id === 'fd-all') findState.all = tg.checked;
      if (tg.id === 'fd-cs') findState.cs = tg.checked;
      if (tg.id === 'fd-word') findState.word = tg.checked;
      if (tg.dataset.ff) { if (tg.checked) findState.fields.add(tg.dataset.ff); else findState.fields.delete(tg.dataset.ff); }
      list();
    });
    $('#fd-list').addEventListener('click', (e) => {
      const tr = e.target.closest('[data-fm]'); if (!tr) return;
      const m = matches[+tr.dataset.fm];
      if (m.sheet.id !== sheetId) goSheet(m.sheet.id);
      if (m.kind === 'wire') select([], [m.obj.id]); else select([m.obj.id]);
      centreOnSelection();
    });
    if ($('#fd-to-rep')) $('#fd-to-rep').onclick = () => findModal(true);
    if ($('#fd-rep')) $('#fd-rep').onclick = () => {
      matches = findMatches();
      if (!matches.length) return;
      pushHistory();
      const re = findRegex(true), relabel = new Map();
      matches.forEach((m) => {
        if (m.field === 'props') { m.obj.props[m.key] = m.obj.props[m.key].replace(re, findState.r); return; }
        const was = String(m.obj[m.field] || ''), now = was.replace(re, findState.r);
        m.obj[m.field] = now;
        if (m.field === 'harness' && now) addHarness(now);
        if (m.field === 'label' && was !== now) relabel.set(was, now);
      });
      if (relabel.size) project.sheets.forEach((s) => s.parts.forEach((p) => { if (p.type === 'conn' && p.props && relabel.has(p.props.mate)) p.props.mate = relabel.get(p.props.mate); }));
      const usedH = new Set(project.sheets.flatMap((s) => s.wires.map((w) => w.harness)));
      project.harnesses = project.harnesses.filter((h) => usedH.has(h) || !matches.some((m) => m.field === 'harness'));
      commit(); list();
      toast(`${t('Replaced')} ${plural(matches.length, t('match'))}. ${t('Ctrl+Z undoes it.')}`);
    };
    list();
  }

  /* Renumber wires and part references in drawing order: sheet by sheet, top to bottom, left to right. */
  function renumberModal() {
    showModal(t('Renumber'), `<p class="muted">${esc(t('Numbers wires and part references in drawing order: sheet by sheet, then top to bottom and left to right. A part drawn on several sheets keeps one reference. Connector mating references follow.'))}</p>
      <div class="sec"><label class="fld check"><input type="checkbox" id="rn-w" checked><span><b>${esc(t('Wires'))}</b></span></label>
        <div class="three"><label class="fld"><span>${esc(t('Prefix'))}</span><input id="rn-pre" value="W"></label><label class="fld"><span>${esc(t('Start at'))}</span><input id="rn-start" type="number" value="1"></label><label class="fld"><span>${esc(t('Step'))}</span><input id="rn-step" type="number" value="1" min="1"></label></div>
        <label class="fld check"><input type="checkbox" id="rn-sheet"><span>${esc(t('Start each sheet at the next hundred (101, 201, …)'))}</span></label></div>
      <div class="sec"><label class="fld check"><input type="checkbox" id="rn-p"><span><b>${esc(t('Part references'))}</b> (F1, F2, K1 …)</span></label></div>
      <label class="fld check"><input type="checkbox" id="rn-all" checked><span>${esc(t('All sheets'))}</span></label>
      <div class="row-btns"><button class="btn primary" id="rn-go">${esc(t('Renumber'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    $('#rn-go').onclick = () => {
      const sheets = $('#rn-all').checked ? project.sheets : [doc.sheet];
      const order = (v, items, pos) => items.map((x) => ({ x, p: pos(x) })).sort((a, b) => Math.round(a.p.y / 40) - Math.round(b.p.y / 40) || a.p.x - b.p.x).map((e) => e.x);
      pushHistory();
      let nw = 0, np = 0;
      if ($('#rn-w').checked) {
        const pre = $('#rn-pre').value, step = Math.max(1, parseInt($('#rn-step').value, 10) || 1), byHundred = $('#rn-sheet').checked;
        let n = parseInt($('#rn-start').value, 10); if (isNaN(n)) n = 1;
        sheets.forEach((s) => {
          const v = L.view(project, s);
          if (byHundred) n = (project.sheets.indexOf(s) + 1) * 100 + 1;
          order(v, s.wires, (w) => { const pts = L.wirePoints(v, w) || [{ x: 0, y: 0 }]; return pts.reduce((a, q) => (q.y < a.y || (q.y === a.y && q.x < a.x) ? q : a), pts[0]); }).forEach((w) => { w.name = pre + n; n += step; nw++; });
        });
      }
      if ($('#rn-p').checked) {
        const counters = {}, map = new Map(), relabel = new Map();
        sheets.forEach((s) => {
          const v = L.view(project, s);
          order(v, s.parts.filter((p) => { const d = L.partDef(v, p.type); return d && d.prefix && !d.noLabel && p.label && d.cat !== 'Annotation' && !['offpage', 'net_label'].includes(p.type); }), (p) => { const b = L.partBox(v, p); return { x: b.x, y: b.y }; }).forEach((p) => {
            const d = L.partDef(v, p.type), key = p.type + '|' + p.label;
            if (!map.has(key)) { counters[d.prefix] = (counters[d.prefix] || 0) + 1; map.set(key, d.prefix + counters[d.prefix]); }
            const now = map.get(key);
            if (now !== p.label) { relabel.set(p.label, now); p.label = now; np++; }
          });
        });
        project.sheets.forEach((s) => s.parts.forEach((p) => { if (p.type === 'conn' && p.props && relabel.has(p.props.mate)) p.props.mate = relabel.get(p.props.mate); }));
      }
      closeModal(); commit();
      toast(`${t('Renumbered')} ${plural(nw, t('wire'))}, ${plural(np, t('part'))}. ${t('Ctrl+Z undoes it.')}`);
    };
  }

  function languageModal() {
    const langs = I18N.languages || [['en', 'English']];
    showModal(t('Language'), `<p class="muted">${esc(t('Menus, panels and messages. Drawings and reports keep the words you type.'))}</p>
      <div class="list">${langs.map(([c, n]) => `<label class="list-row"><input type="radio" name="lang" value="${c}"${c === I18N.lang ? ' checked' : ''}> <span>${esc(n)}</span></label>`).join('')}</div>
      <p class="muted">${esc(t('Translations are a first pass. Corrections are welcome on GitHub.'))}</p>
      <p class="muted">${esc(t('LoomWright reloads to change language. Your open projects are kept, but undo starts again.'))}</p>
      <div class="row-btns"><button class="btn primary" id="lg-go">${esc(t('Apply'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    $('#lg-go').onclick = () => {
      const c = ($('input[name="lang"]:checked') || {}).value;
      if (!c || c === I18N.lang) { closeModal(); return; }
      I18N.set(c); autosave(); location.reload();
    };
  }

  function helpModal() {
    const k = [
      ['Click pin, then pin', 'Draw a wire. Click empty space on the way to add bends.'],
      ['Double-click wire', 'Add a bend point. Double-click a bend point to remove it.'],
      ['Drag a wire label', 'Move the label; a leader line points back to the wire. Double-click it to put it back.'],
      ['Alt+click wire or pin', 'Trace the circuit across every sheet'],
      ['T', 'Trace the selected wire. Esc stops tracing.'],
      ['Shift+T', 'Tidy wires: re-route them with square corners'],
      ['F1', 'Open the user manual at the chapter for what you are doing'],
      ['Drag empty space', 'Select several parts'],
      ['Scroll', 'Pan. Hold Space and drag, or drag with the middle button, to pan too.'],
      ['Ctrl+scroll', 'Zoom (pinch on a trackpad)'],
      ['Ctrl+K', 'Search commands, parts and sheets'],
      ['Ctrl+F / Ctrl+H', 'Find / find and replace'],
      ['PgUp / PgDn', 'Previous / next sheet'],
      ['R / Shift+R', 'Rotate selection'],
      ['F', 'Flip selection'],
      ['Ctrl+C / X / V / D', 'Copy, cut, paste, duplicate'],
      ['Arrow keys', 'Nudge 10 (Shift: 50)'],
      ['Delete', 'Delete selection'],
      ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
      ['Ctrl+S / Ctrl+O / Ctrl+P', 'Save / open / print all sheets'],
      ['0', 'Fit sheet to window'],
      ['Esc', 'Cancel a wire, stop tracing or stop the live test'],
    ];
    showModal(t('Keyboard and mouse'), `<div class="kbd-list">${k.map(([a, b]) => `<kbd>${esc(t(a))}</kbd><span>${esc(t(b))}</span>`).join('')}</div>
      <div class="row-btns"><button class="btn primary" data-close>${esc(t('Close'))}</button></div>`);
  }
  /* The built-in user manual; with context, it opens at the chapter for what is on screen. */
  function openManual(context) {
    const M = window.LoomManualViewer;
    if (!M) { toast(t('The user manual is not included in this copy.')); return; }
    if (!context) { M.open(); return; }
    const views = $('#views'), vt = views && !views.hidden ? (views.dataset.kind || '') : '';
    // the open list tab, when the lists are showing, says what the person is working on
    const TAB_CH = { schedule: 'household-wiring', motors: 'factory-and-control-panels', terminals: 'factory-and-control-panels', plcio: 'factory-and-control-panels', power: 'electronics', checks: 'design-checks', fuses: 'fuses-and-loads', build: 'build-pack-and-labels' };
    const listsOpen = $('#tables') && !$('#tables').classList.contains('collapsed');
    const ch = !$('#builder').hidden ? 'component-builder' : vt === 'formboard' ? 'harness-formboard' : vt === 'vehicle' ? 'vehicle-locations' : vt === 'air' ? 'compressed-air' : test ? 'trace-and-live-test' : (listsOpen && TAB_CH[tab]) || null;
    const known = ch && M.chapters().some((c) => c.id === ch);
    if (known) M.open(ch); else M.open();
  }
  /* Disclaimer: always available from Help, and shown once before household, factory or compressed air work. */
  const ACK = 'loomwright.disclaimer.mains';
  function disclaimerModal(ack) {
    const dc = L.disclaimerFor(project);
    showModal(t(L.DISCLAIMER.title), `${ack ? `<p class="callout warn">${esc(t('Please read this before planning household, factory or compressed air work.'))}</p>` : ''}
      ${dc.full.map((x) => `<p>${esc(t(x))}</p>`).join('')}
      <div class="row-btns">${ack ? `<button class="btn primary" id="dc-ok">${esc(t('I understand'))}</button>` : `<button class="btn primary" data-close>${esc(t('Close'))}</button>`}${window.LoomManualViewer ? `<button class="btn" id="dc-man">${esc(t('Open in the manual'))}</button>` : ''}</div>`);
    if ($('#dc-ok')) $('#dc-ok').onclick = () => { try { localStorage.setItem(ACK, new Date().toISOString()); } catch (e) { /* ignore */ } closeModal(); };
    if ($('#dc-man')) $('#dc-man').onclick = () => { closeModal(); window.LoomManualViewer.open('disclaimer'); };
  }
  function acknowledged() { try { return !!localStorage.getItem(ACK); } catch (e) { return false; } }
  /* Called when a project of a mains type opens, or a project is switched to one. */
  function checkDisclaimer() { if (L.disclaimerFor(project).mains && !acknowledged()) setTimeout(() => { if ($('#modal').hidden) disclaimerModal(true); }, 300); }
  /* Control panel style wire numbers: every wire on one potential gets the same number. */
  function numberPotentialModal() {
    showModal(t('Number wires by potential'), `<p>${esc(t('Every wire that is joined without passing through a switch, contact, fuse or device gets the same number, as on control panel drawings. Numbers start with the sheet number, for example 101, 102 on sheet 1.'))}</p>
      <p class="muted">${esc(t('This renames every wire in the project. You can undo it.'))}</p>
      <div class="row-btns"><button class="btn primary" id="np-go">${esc(t('Number wires'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    $('#np-go').onclick = () => { closeModal(); pushHistory(); const n = L.numberByPotential(project); commit(); toast(`${n} ${t('wires numbered')}`); };
  }
  function aboutModal() {
    const where = PF.kind === 'desktop' ? t('the desktop app') : PF.kind === 'preview' ? t('a preview') : t('a browser');
    showModal(t('About LoomWright'), `
      <p><b>LoomWright ${esc(L.VERSION)}</b>, ${esc(t('running in'))} ${esc(where)}.</p>
      <p class="muted">${esc(t('Free, open-source wiring diagram editor, mainly for vehicles, and also for household, workshop, factory and electronics wiring. Projects are saved as .loom files (plain JSON) that the optional Claude add-on can also read and write.'))}</p>
      <p class="callout warn">${esc(t('A basic planning tool: its checks are guidance only and do not replace a qualified electrician or engineer.'))} <a href="#" id="h-disc">${esc(t('Read the disclaimer'))}</a></p>
      <p class="muted">Copyright © 2026 LoomWright contributors. ${esc(t('Licensed under the GNU Affero General Public License v3.0 or later.'))} IBM Plex Mono: SIL Open Font License. js-yaml: MIT License.</p>
      <p class="muted">${esc(t('Source code'))}: <span class="mono src-url">https://github.com/jkdesignpro/LoomWright</span> <button class="linkbtn" data-src-copy>${esc(t('Copy link'))}</button></p>
      <div class="row-btns"><button class="btn" id="h-sample">${esc(t('Open the example project'))}</button><button class="btn primary" data-close>${esc(t('Close'))}</button></div>`);
    $('#h-sample').onclick = () => { closeModal(); openSample(); };
    $('[data-src-copy]').onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText('https://github.com/jkdesignpro/LoomWright').then(() => toast(t('Link copied')), () => {}); };
    $('#h-disc').onclick = (e) => { e.preventDefault(); disclaimerModal(); };
    if (PF.appInfo) PF.appInfo().then((info) => {
      const at = $('#modal-body .muted'); if (!info || !at) return;
      at.insertAdjacentHTML('beforebegin', `<p class="muted">${esc(info.portable ? t('Portable copy: settings and My components are kept next to the program in') : t('My components are kept in'))} <span class="mono">${esc(info.portable ? info.data_dir : info.library)}</span></p>`);
    });
  }
  function claudeModal() {
    showModal(t('Use LoomWright with Claude'), `
      <p>${esc(t('The Claude add-on is optional. LoomWright works fully offline without it. With it, Claude can read and edit the project you have open; the app reloads as soon as Claude saves, and Ctrl+Z undoes what Claude changed.'))}</p>
      <h3>${esc(t('Things you can ask'))}</h3>
      <ul class="tips" style="font-size:12.5px">
        <li>"Add a second sheet for the rear work lights: 2 LED floods on a relay, switched from the dash, 15 A fuse from FB1 way 5."</li>
        <li>"Here is a picture of my switch panel's pinout. Make it a custom component and save it to my library." (attach the picture)</li>
        <li>"I only stock red, brown/red, black, green and purple/white. Recolour sheet 2 using just those and tell me where colours are reused."</li>
        <li>"Check the load on every fuse and tell me which are over 80%."</li>
        <li>"Trace the AUX FEED circuit and list every wire on it."</li>
        <li>"Issue revision B, 'fridge feed moved to 6 mm²', and tell me what changed since A."</li>
        <li>"Give me the cut list for the engine bay harness."</li>
      </ul>
      <h3>${esc(t('Set up'))}</h3>
      <p class="muted">${esc(t('Needs Node.js 18 or newer. In the LoomWright folder run npm install in mcp, then add this to Claude Desktop (Settings, Developer, Edit Config):'))}</p>
      <pre>{
  "mcpServers": {
    "loomwright": {
      "command": "node",
      "args": ["/path/to/loomwright/mcp/server.js"]
    }
  }
}</pre>
      <p class="muted">Claude Code: <span class="mono">claude mcp add loomwright -- node /path/to/loomwright/mcp/server.js</span>. ${esc(t('Components Claude saves appear under Parts, My components, when you switch back to LoomWright.'))}</p>
      <div class="row-btns"><button class="btn primary" data-close>${esc(t('Close'))}</button></div>`);
  }

  async function importLibrary() {
    const r = await PF.openText('.json,application/json', t('Component library'));
    if (!r) return;
    try {
      const data = JSON.parse(r.text);
      const parts = (data.parts || (Array.isArray(data) ? data : [])).filter((p) => p && p.id && p.shapes && p.pins);
      let n = 0, nb = 0;
      parts.forEach((p) => { p.custom = true; p.cat = 'My components'; const i = userLib.parts.findIndex((x) => x.id === p.id); if (i >= 0) userLib.parts[i] = p; else userLib.parts.push(p); n++; });
      (data.colours || []).forEach((c) => { if (!userLib.colours.some((x) => x.id === c.id)) userLib.colours.push({ ...c, custom: true }); });
      userLib.blocks = userLib.blocks || [];
      (data.blocks || []).forEach((b) => { if (b && b.id && Array.isArray(b.parts)) { const i = userLib.blocks.findIndex((x) => x.id === b.id); if (i >= 0) userLib.blocks[i] = b; else userLib.blocks.push(b); nb++; } });
      await PF.saveUserLibrary(userLib); buildLibrary();
      toast(`${t('Imported')} ${plural(n, t('component'))}${nb ? ', ' + plural(nb, t('block')) : ''}`);
    } catch (e) { showMessage(t('Could not import'), `<p>${esc(e.message)}</p>`); }
  }
  async function exportLibrary() {
    await PF.exportFile('loomwright-library.json', JSON.stringify({ format: 'loomwright-library', version: 2, parts: userLib.parts, colours: userLib.colours, blocks: userLib.blocks || [] }, null, 2), 'application/json');
  }

  /* ---------------- Theme ---------------- */
  function isDark() { const th_ = document.documentElement.dataset.theme; return th_ ? th_ === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
  function setTheme(th_) { document.documentElement.dataset.theme = th_; try { localStorage.setItem(THEME, th_); } catch (e) { /* ignore */ } }
  try { const th_ = localStorage.getItem(THEME); if (th_) document.documentElement.dataset.theme = th_; } catch (e) { /* ignore */ }
  /* The work area (the sheet and the component builder's drawing) can be dark on its own, whatever the
     window theme. Only the screen changes: exports, prints and PDFs stay black on white. */
  const WORK = 'loomwright.workarea';
  function isWorkDark() { return document.documentElement.classList.contains('work-dark'); }
  function setWorkDark(on) { document.documentElement.classList.toggle('work-dark', on); showWorkDark(); try { localStorage.setItem(WORK, on ? 'dark' : 'light'); } catch (e) { /* ignore */ } }
  function showWorkDark() { const b = document.querySelector('#titlebar [data-cmd="workdark"]'); if (b) { b.setAttribute('aria-pressed', String(isWorkDark())); b.classList.toggle('on', isWorkDark()); } }
  try { if (localStorage.getItem(WORK) === 'dark') document.documentElement.classList.add('work-dark'); } catch (e) { /* ignore */ }
  showWorkDark();

  /* ---------------- Views: formboard and vehicle ---------------- */
  function harnessesInUse() { return [...new Set(project.harnesses.concat(project.sheets.flatMap((s) => s.wires.map((w) => w.harness))).filter(Boolean))]; }
  function openFormboard(h) {
    const V = window.LoomViews;
    if (!V) { toast(t('The formboard view is not loaded.')); return; }
    const hs = harnessesInUse();
    if (!hs.length) { showMessage(t('Harness formboard'), `<p>${esc(t('Give your wires a harness first (Properties, Harness). Each harness gets its own formboard: a full-size layout of the trunk and branches for building the loom on a board.'))}</p>`); return; }
    V.openFormboard(h && hs.includes(h) ? h : hs[0]);
  }
  function openVehicle() {
    const V = window.LoomViews;
    if (!V) { toast(t('The vehicle view is not loaded.')); return; }
    V.openVehicle();
  }
  function toggleSetting(k, label) { pushHistory(); project.settings[k] = project.settings[k] === false ? true : k === 'bw' ? !project.settings.bw : false; commit(); toast(`${t(label)}: ${t(project.settings[k] ? 'on' : 'off')}`); }

  /* ---------------- Commands, menus and search ---------------- */
  const hasSel = () => sel.parts.size > 0;
  const COMMANDS = {
    new: { label: 'New project', run: newProject },
    open: { label: 'Open…', key: 'Ctrl+O', run: openFile },
    sample: { label: 'Open example project', run: openSample },
    'close-tab': { label: 'Close project', run: () => closeTab(active) },
    save: { label: 'Save', key: 'Ctrl+S', run: save },
    saveas: { label: 'Save as…', key: 'Ctrl+Shift+S', run: saveAs },
    print: { label: 'Print or save PDF (all sheets)', key: 'Ctrl+P', run: printDiagram, when: () => PF.canPrint },
    'print-pack': { label: 'Build pack (PDF)…', run: packModal },
    'export-pdf': { label: 'Export PDF with bookmarks and links…', run: pdfModal },
    'print-labels': { label: 'Wire labels…', run: labelsModal },
    'import-csv': { label: 'Import wire list (spreadsheet)…', run: importWireListModal },
    'import-wireviz': { label: 'Import WireViz (YAML)…', run: importWireVizFile },
    'import-kicad': { label: 'Import KiCad netlist…', run: importKiCadFile },
    'import-lengths': { label: 'Import wire lengths (CAD)…', run: importLengthsModal },
    'export-svg': { label: 'Export sheet as SVG', run: exportSVG },
    'export-png': { label: 'Export sheet as PNG', run: () => exportPNG().catch((e) => toast(e.message)) },
    'export-dxf': { label: 'Export sheet as DXF (CAD)', run: exportDXF },
    'export-share': { label: 'Save read-only web page…', run: exportShare },
    'export-wireviz': { label: 'Export for WireViz (YAML)…', run: wirevizModal },
    'export-wires': { label: 'Export wire list (CSV)', run: exportWires },
    'export-bom': { label: 'Export parts and costs (CSV)', run: exportBOM },
    'export-cable': { label: 'Export cable totals (CSV)', run: exportCable },
    'export-cut': { label: 'Export cut list (CSV)', run: exportCut },
    'export-connectors': { label: 'Export connector tables (CSV)', run: exportConnectors },
    'export-fuses': { label: 'Export fuses and loads (CSV)', run: exportFuses },
    'export-voltages': { label: 'Export voltage at each load (CSV)', run: exportVoltages },
    'export-labels': { label: 'Export wire labels (CSV)', run: () => exportLabels(false) },
    'export-usage': { label: 'Export colour usage (CSV)', run: exportUsage },
    schedule: { label: 'Circuit schedule (household)', run: () => showTab('schedule'), when: showHouse },
    motors: { label: 'Motors', run: () => showTab('motors'), when: showFactory },
    terminals: { label: 'Terminal plan', run: () => showTab('terminals'), when: showTerminals },
    plcio: { label: 'PLC inputs and outputs', run: () => showTab('plcio'), when: showFactory },
    power: { label: 'Power rails', run: () => showTab('power'), when: showElec },
    'export-power': { label: 'Export power rails (CSV)', run: () => saveCSV('power-rails', L.reportRows(project, 'power')), when: showElec },
    'export-schedule': { label: 'Export circuit schedule (CSV)', run: () => saveCSV('circuit-schedule', L.reportRows(project, 'circuits')), when: showHouse },
    'export-motors': { label: 'Export motor list (CSV)', run: () => saveCSV('motors', L.reportRows(project, 'motors')), when: showFactory },
    'export-terminals': { label: 'Export terminal plan (CSV)', run: () => saveCSV('terminal-plan', L.reportRows(project, 'terminals')), when: showTerminals },
    'export-plcio': { label: 'Export PLC I/O list (CSV)', run: () => saveCSV('plc-io', L.reportRows(project, 'plcio')), when: showFactory },
    'number-potential': { label: 'Number wires by potential…', run: numberPotentialModal, when: showFactory },
    undo: { label: 'Undo', key: 'Ctrl+Z', run: undo, enabled: () => hist.length > 0 },
    redo: { label: 'Redo', key: 'Ctrl+Shift+Z', run: redo, enabled: () => redoStack.length > 0 },
    cut: { label: 'Cut', key: 'Ctrl+X', run: () => { if (copySelection()) deleteSelection(); }, enabled: hasSel },
    copy: { label: 'Copy', key: 'Ctrl+C', run: () => { if (copySelection()) toast(t('Copied')); }, enabled: hasSel },
    paste: { label: 'Paste', key: 'Ctrl+V', run: () => paste() },
    dup: { label: 'Duplicate', key: 'Ctrl+D', run: () => { if (copySelection()) paste(20); }, enabled: hasSel },
    delete: { label: 'Delete', key: 'Del', run: deleteSelection, enabled: () => selCount() > 0 },
    'select-all': { label: 'Select all on sheet', key: 'Ctrl+A', run: () => select(doc.parts.map((p) => p.id), doc.wires.map((w) => w.id)) },
    find: { label: 'Find…', key: 'Ctrl+F', run: () => findModal(false) },
    replace: { label: 'Find and replace…', key: 'Ctrl+H', run: () => findModal(true) },
    renumber: { label: 'Renumber wires and parts…', run: renumberModal },
    'block-save': { label: 'Save selection as block…', run: saveBlockModal, enabled: hasSel },
    rotate: { label: 'Rotate', key: 'R', run: () => rotateSelection(1), enabled: hasSel },
    flip: { label: 'Flip', key: 'F', run: flipSelection, enabled: hasSel },
    'align-left': { label: 'Align left', run: () => align('left'), enabled: () => sel.parts.size > 1 },
    'align-centre': { label: 'Align centres', run: () => align('centre'), enabled: () => sel.parts.size > 1 },
    'align-right': { label: 'Align right', run: () => align('right'), enabled: () => sel.parts.size > 1 },
    'align-top': { label: 'Align tops', run: () => align('top'), enabled: () => sel.parts.size > 1 },
    'align-middle': { label: 'Align middles', run: () => align('middle'), enabled: () => sel.parts.size > 1 },
    'align-bottom': { label: 'Align bottoms', run: () => align('bottom'), enabled: () => sel.parts.size > 1 },
    'dist-h': { label: 'Distribute across', run: () => distribute('h'), enabled: () => sel.parts.size > 2 },
    'dist-v': { label: 'Distribute down', run: () => distribute('v'), enabled: () => sel.parts.size > 2 },
    'zoom-in': { label: 'Zoom in', key: '+', run: () => zoomBy(1.2) },
    'zoom-out': { label: 'Zoom out', key: '−', run: () => zoomBy(1 / 1.2) },
    fit: { label: 'Fit sheet to window', key: '0', run: fit },
    'pane-parts': { label: 'Parts library', run: () => showPane(pane === 'parts' ? null : 'parts'), on: () => pane === 'parts' },
    'pane-project': { label: 'Project and sheets', run: () => showPane(pane === 'project' ? null : 'project'), on: () => pane === 'project' },
    'pane-history': { label: 'Revision history', run: () => showPane(pane === 'history' ? null : 'history'), on: () => pane === 'history' },
    'pane-props': { label: 'Properties', run: () => { $('#props').hidden = !$('#props').hidden; renderOverlay(); }, on: () => !$('#props').hidden },
    tables: { label: 'Lists and reports', run: () => setTablesOpen($('#tables').classList.contains('collapsed')), on: () => !$('#tables').classList.contains('collapsed') },
    junctions: { label: 'Junction dots', run: () => toggleSetting('junctions', 'Junction dots'), on: () => project.settings.junctions !== false },
    xrefs: { label: 'Sheet cross-references', run: () => toggleSetting('xrefs', 'Sheet cross-references'), on: () => project.settings.xrefs !== false },
    bw: { label: 'Black and white drawings', run: () => toggleSetting('bw', 'Black and white drawings'), on: () => !!project.settings.bw },
    theme: { label: 'Dark theme', run: () => setTheme(isDark() ? 'light' : 'dark'), on: isDark },
    workdark: { label: 'Dark work area', run: () => setWorkDark(!isWorkDark()), on: isWorkDark },
    language: { label: 'Language…', run: languageModal },
    'sheet-new': { label: 'New sheet', run: () => addSheet(null) },
    'sheet-dup': { label: 'Duplicate sheet', run: () => addSheet(doc.sheet) },
    'sheet-rename': { label: 'Rename sheet', run: () => renameSheetInline(sheetId) },
    'sheet-del': { label: 'Delete sheet', run: () => deleteSheet(sheetId), enabled: () => project.sheets.length > 1 },
    'sheet-left': { label: 'Move sheet left', run: () => moveSheet(sheetId, -1), enabled: () => project.sheets[0].id !== sheetId },
    'sheet-right': { label: 'Move sheet right', run: () => moveSheet(sheetId, 1), enabled: () => project.sheets[project.sheets.length - 1].id !== sheetId },
    'sheet-prev': { label: 'Previous sheet', key: 'PgUp', run: () => stepSheet(-1) },
    'sheet-next': { label: 'Next sheet', key: 'PgDn', run: () => stepSheet(1) },
    trace: { label: 'Trace circuit', key: 'T', run: () => {
      if (trace) { clearTrace(); return; }
      const w = only('wire'), p = only('part');
      if (w) startTrace(sheetId, w.from);
      else if (p) { const pins = L.resolved(doc, p).pins; const pn = pins.find((x) => doc.wires.some((wr) => (wr.from.part === p.id && wr.from.pin === x.id) || (wr.to.part === p.id && wr.to.pin === x.id))); if (pn) startTrace(sheetId, { part: p.id, pin: pn.id }); else toast(t('Nothing is wired to this part yet.')); }
      else { showTab('nets'); toast(t('Pick a circuit in the list, or Alt+click a wire or pin.')); }
    }, on: () => !!trace },
    test: { label: 'Live circuit test', run: () => (test ? endTest() : startTest()), on: () => !!test },
    fault: { label: 'Fault finding…', run: () => faultModal(only('part') ? only('part').id : null) },
    tidy: { label: 'Tidy wires', key: 'Shift+T', run: tidyCmd },
    stock: { label: 'My stock…', run: stockModal },
    'stock-take': { label: 'Take this project from stock…', run: takeStockModal },
    'export-shop': { label: 'Export shopping list (CSV)', run: exportShopping },
    shop: { label: 'Shopping list', run: () => showTab('shop') },
    build: { label: 'Build and test progress', run: () => showTab('build') },
    'build-share': { label: 'Phone build checklist…', run: exportBuildChecklist },
    'build-import': { label: 'Import phone progress…', run: importBuildProgress },
    formboard: { label: 'Harness formboard…', run: () => openFormboard() },
    locations: { label: 'Component locations (vehicle view)…', run: openVehicle },
    builder: { label: 'Component builder…', run: () => window.LoomBuilder.open(null) },
    colours: { label: 'Wire colours and stock…', run: coloursModal },
    cables: { label: 'Cables (multicore, screened)…', run: cablesModal },
    'lib-import': { label: 'Import components and blocks…', run: importLibrary },
    'lib-export': { label: 'Export my components and blocks…', run: exportLibrary, enabled: () => userLib.parts.length > 0 || (userLib.blocks || []).length > 0 },
    check: { label: 'Run design checks', run: () => { showTab('checks'); const n = checks().filter((c) => c.level !== 'info').length; toast(n ? plural(n, t('check')) + ' ' + t('to review') : t('No problems found')); } },
    wires: { label: 'Wire list', run: () => showTab('wires') },
    bom: { label: 'Parts and costs', run: () => showTab('bom') },
    cable: { label: 'Cable totals', run: () => showTab('cable') },
    usage: { label: 'Colour usage', run: () => showTab('usage') },
    fuses: { label: 'Fuses and loads', run: () => showTab('fuses') },
    connectors: { label: 'Connector tables', run: () => showTab('connectors') },
    cutlist: { label: 'Cut list', run: () => showTab('cut') },
    nets: { label: 'Circuits', run: () => showTab('nets') },
    'rev-issue': { label: 'Issue revision…', run: issueRevisionModal },
    'rev-compare': { label: 'Compare revisions…', run: () => compareModal(), enabled: () => (project.revisions || []).length > 0 },
    savepoint: { label: 'Keep a save point now', run: () => savePoint('Manual').then(() => toast(t('Save point kept on this computer'))) },
    claude: { label: 'Use with Claude…', run: claudeModal },
    manual: { label: 'User manual', key: 'F1', run: () => openManual() },
    disclaimer: { label: 'Disclaimer', run: () => disclaimerModal() },
    help: { label: 'Keyboard and mouse', run: helpModal },
    about: { label: 'About LoomWright', run: aboutModal },
  };
  const MENUS = [
    ['File', ['new', 'open', 'sample', 'close-tab', '-', 'save', 'saveas', '-', 'print', 'print-pack', 'print-labels', '-', 'import-csv', 'import-wireviz', 'import-kicad', 'import-lengths', '-', 'export-pdf', 'export-svg', 'export-png', 'export-dxf', 'export-wireviz', 'export-share']],
    ['Edit', ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'dup', 'delete', '-', 'select-all', 'find', 'replace', 'renumber', '-', 'block-save']],
    ['View', ['pane-parts', 'pane-project', 'pane-history', 'pane-props', 'tables', '-', 'zoom-in', 'zoom-out', 'fit', '-', 'junctions', 'xrefs', 'bw', '-', 'theme', 'workdark', 'language']],
    ['Arrange', ['rotate', 'flip', '-', 'align-left', 'align-centre', 'align-right', 'align-top', 'align-middle', 'align-bottom', '-', 'dist-h', 'dist-v', '-', 'tidy']],
    ['Sheet', ['sheet-new', 'sheet-dup', 'sheet-rename', 'sheet-del', '-', 'sheet-left', 'sheet-right', '-', 'sheet-prev', 'sheet-next']],
    ['Tools', ['trace', 'test', 'fault', '-', 'formboard', 'locations', '-', 'builder', 'colours', 'cables', '-', 'stock', 'build-share', 'build-import', '-', 'lib-import', 'lib-export', '-', 'number-potential', 'check']],
    ['Reports', ['wires', 'bom', 'cable', 'usage', 'fuses', 'connectors', 'cutlist', 'build', 'shop', 'nets', 'schedule', 'motors', 'terminals', 'plcio', 'power', '-', 'print-pack', 'print-labels', '-', 'export-wires', 'export-bom', 'export-cable', 'export-cut', 'export-connectors', 'export-fuses', 'export-voltages', 'export-shop', 'export-labels', 'export-usage', 'export-schedule', 'export-motors', 'export-terminals', 'export-plcio', 'export-power']],
    ['Revision', ['rev-issue', 'rev-compare', 'pane-history', '-', 'savepoint']],
    ['Help', ['manual', 'claude', 'help', '-', 'disclaimer', 'about']],
  ];
  function runCommand(id) {
    const c = COMMANDS[id];
    if (!c || (c.enabled && !c.enabled()) || (c.when && !c.when())) return;
    c.run();
  }
  function buildMenus() {
    menusReady = true;
    $('#menubar').innerHTML = MENUS.map(([name, items], i) => `<div class="menu" data-menu="${i}"><button type="button" aria-haspopup="true">${esc(t(name))}</button><div class="drop" role="menu">${items.map((id) => {
      if (id === '-') return '<hr>';
      const c = COMMANDS[id]; if (c.when && !c.when()) return '';
      return `<button type="button" role="menuitem" data-menu-cmd="${id}">${esc(t(c.label))}${c.key ? `<kbd>${esc(c.key)}</kbd>` : ''}</button>`;
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

  // Ctrl+K search over commands, parts, sheets, circuits and open projects
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
    const cmds = Object.entries(COMMANDS).filter(([, c]) => !(c.when && !c.when())).map(([id, c]) => ({ kind: t('Command'), label: t(c.label), hint: c.key || '', run: () => runCommand(id), dis: c.enabled && !c.enabled() }));
    const sheets = project.sheets.map((s, i) => ({ kind: t('Sheet'), label: `${i + 1}  ${s.name}`, hint: t('Sheet'), run: () => goSheet(s.id) }));
    const projs = tabs.length > 1 ? tabs.map((tb, i) => ({ kind: t('Project'), label: (i === active ? project.title : tb.project.title) || t('Untitled'), hint: i === active ? t('open now') : t('switch to'), run: () => { if (i !== active) activate(i); } })) : [];
    const parts = libraryItems().map((d) => ({ kind: t('Part'), label: d.name, hint: d.custom ? t('My components') : t(d.cat), run: () => addPartAt(d.id) }));
    const onSheet = q ? project.sheets.flatMap((s) => s.parts.filter((p) => p.label).map((p) => ({ kind: t('Find'), label: p.label + '  ' + ((L.partDef(L.view(project, s), p.type) || {}).name || p.type), hint: s.name, run: () => { goSheet(s.id); select([p.id]); centreOnSelection(); } }))) : [];
    const wiresF = q ? project.sheets.flatMap((s) => s.wires.map((w) => ({ kind: t('Wire'), label: w.name + (w.circuit ? '  ' + w.circuit : ''), hint: s.name, run: () => { goSheet(s.id); select([], [w.id]); centreOnSelection(); } }))) : [];
    const all = q ? [...projs, ...sheets, ...onSheet, ...wiresF, ...cmds, ...parts] : [...cmds.slice(0, 8), ...projs, ...sheets];
    palItems = all.filter((x) => !q || x.label.toLowerCase().includes(q) || x.hint.toLowerCase().includes(q)).slice(0, 50);
    palIdx = 0;
    drawPalette();
  }
  function drawPalette() {
    $('#palette-list').innerHTML = palItems.length ? palItems.map((x, i) => `<button type="button" role="option" class="${i === palIdx ? 'on' : ''}" data-i="${i}"${x.dis ? ' disabled' : ''}><span class="muted" style="width:72px">${esc(x.kind)}</span><span>${esc(x.label)}</span><small>${esc(x.hint)}</small></button>`).join('') : `<p class="empty">${esc(t('Nothing matches.'))}</p>`;
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

  // Buttons anywhere with data-cmd (ribbon, panes, inspector)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]');
    if (b && !b.disabled && !b.closest('#menubar')) runCommand(b.dataset.cmd);
  });
  window.addEventListener('beforeunload', (e) => { stash(); if (tabs.some((tb) => tb.dirty) && PF.kind === 'browser') { autosave(); e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('resize', () => renderOverlay());

  /* ---------------- API used by the component builder and the formboard / vehicle views ---------------- */
  window.LoomEditor = {
    get userLib() { return userLib; },
    get doc() { return doc; },
    get project() { return project; },
    get sheetId() { return sheetId; },
    async saveComponent(def) {
      def.custom = true; def.cat = 'My components';
      const i = userLib.parts.findIndex((p) => p.id === def.id);
      if (i >= 0) userLib.parts[i] = def; else userLib.parts.push(def);
      await PF.saveUserLibrary(userLib);
      // keep projects that already use it up to date
      // wires on renamed pins move with them; only wires on pins that were taken away are removed
      // (the builder warns about those first), and Ctrl+Z puts everything back
      if (project.customParts.some((p) => p.id === def.id)) {
        pushHistory();
        const lost = L.updateCustomPart(project, def), gone = new Set(lost.map((x) => x.wire));
        project.sheets.forEach((sh) => { for (let k = sh.wires.length - 1; k >= 0; k--) if (gone.has(sh.wires[k])) sh.wires.splice(k, 1); });
        if (gone.size) setTimeout(() => toast(`${plural(gone.size, t('wire'))} ${t('removed from pins that are no longer on')} ${def.name}`, { label: t('Undo'), run: () => undo() }), 2700);
      }
      buildLibrary(); commit();
    },
    /* Wires on each pin of a component type in the open project, for the builder's warning. */
    pinUse(type) {
      const use = {};
      project.sheets.forEach((sh) => {
        const ids = new Set(sh.parts.filter((p) => p.type === type).map((p) => p.id));
        sh.wires.forEach((w) => [w.from, w.to].forEach((e) => { if (ids.has(e.part)) use[e.pin] = (use[e.pin] || 0) + 1; }));
      });
      return use;
    },
    async deleteComponent(id) {
      userLib.parts = userLib.parts.filter((p) => p.id !== id);
      await PF.saveUserLibrary(userLib); buildLibrary();
    },
    place(type) { addPartAt(type); },
    toast, t, esc,
    pushHistory, commit, render,
    undo: () => undo(), redo: () => redo(),
    goSheet: (id) => goSheet(id),
    select: (parts, wires) => select(parts || [], wires || []),
    centre: () => centreOnSelection(),
    showModal, closeModal, showMessage,
    exportFile: (name, data, mime) => PF.exportFile(name, data, mime),
    slug: () => projSlug(),
    svgToPng,
    harnesses: harnessesInUse,
    pickImage: () => PF.pickImage(),
    openText: (ext, what) => PF.openText(ext, what),
    /* Open a project (parsed .loom JSON) in a new tab. */
    loadProject: (d, name) => loadDoc(typeof d === 'string' ? JSON.parse(d) : d, { name: name || null }, null, true),
    /* For add-on modules: register a command and put it in a menu (after an existing item, or at the end). */
    addCommand(id, cmd, menu, after) {
      COMMANDS[id] = cmd;
      const m = MENUS.find((x) => x[0] === menu);
      if (m && !m[1].includes(id)) { const i = after ? m[1].indexOf(after) : -1; if (i >= 0) m[1].splice(i + 1, 0, id); else m[1].push(id); }
      buildMenus();
    },
    runCommand: (id) => runCommand(id),
    refresh: () => { refreshAll(); },
  };

  /* ---------------- Start ---------------- */
  (async function start() {
    if (I18N.apply) I18N.apply(document);
    buildMenus();
    showPane('parts');
    setTablesOpen(true);
    userLib = (await PF.loadUserLibrary()) || { parts: [], colours: [], blocks: [] };
    userLib.parts = (userLib.parts || []).map((p) => ({ ...p, custom: true, cat: 'My components' }));
    userLib.colours = userLib.colours || [];
    userLib.blocks = userLib.blocks || [];
    let restored = null, ok = false;
    try { restored = JSON.parse(localStorage.getItem(AUTOSAVE) || 'null'); } catch (e) { restored = null; }
    if (restored && Array.isArray(restored.tabs) && restored.tabs.length) {
      try {
        restored.tabs.forEach((tb, i) => {
          loadDoc(tb.doc, tb.file, tb.sheetId, i > 0);
          dirty = !!tb.dirty; updateTitle();
        });
        const want = Math.min(Math.max(0, restored.active | 0), tabs.length - 1);
        const last = active;
        tabs.forEach((tb, i) => { if (i !== last) tb.viewed = false; });
        if (want !== last) activate(want);
        ok = true;
      } catch (e) { tabs = []; active = 0; project = null; ok = false; }
    }
    if (!ok) {
      let v1 = null;
      try { v1 = JSON.parse(localStorage.getItem(AUTOSAVE_V1) || 'null'); } catch (e) { v1 = null; }
      try { if (v1 && v1.doc) { loadDoc(v1.doc, v1.file, v1.sheetId); if (v1.file && v1.file.name) markClean(); else markDirty(); ok = true; } } catch (e) { tabs = []; project = null; ok = false; }
    }
    if (!ok) { loadDoc(window.LoomSample(), null); markClean(); }
    (await PF.openedFiles()).forEach((o) => openIncoming(o, false));
    PF.onFilesWaiting(async () => { (await PF.openedFiles()).forEach((o) => openIncoming(o, true)); autosave(); });
    applyView(); setHint(); autosave();
  })();
})();
