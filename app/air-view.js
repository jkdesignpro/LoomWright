/*
 * LoomWright compressed air planner: compressors, receivers, air treatment, pipework,
 * drops and tools on the left, the system drawn as a schematic with flows and pressures
 * in the middle, and the results and checks from Loom.air on the right.
 * Opens full-window over the editor (Tools, Compressed air planner) and keeps its plans
 * in project.air through window.LoomEditor, so undo, autosave and saving work as usual.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function () {
  'use strict';
  const L = window.Loom, A = L && L.air, E = () => window.LoomEditor;
  if (!A || !window.LoomEditor) return;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = L.esc, fmt = A.fmt;
  const t = (s) => (window.LoomI18n ? window.LoomI18n.t(s) : s);
  const root = $('#views');
  const ACK = 'loomwright.disclaimer.air';
  const INK = '#262b28', MUTED = '#636a74', ACC = '#2f6fde', ERR = '#c0392b', WARN = '#b7791f', SOFT = '#f4f5f7', MONO = "'IBM Plex Mono', Consolas, monospace";
  const D = L.AIR_DISCLAIMER;
  const fbar = (v) => fmt(v, Math.abs(v) < 1 ? 3 : 2);
  const cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const slugOf = (s) => String(s || 'air').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'air';

  let isOpen = false, sysId = null, zoom = null, sel = null, ackedNow = false, observer = null, report = null;
  const closedSecs = new Set();  // editor sections the user folded
  const openFits = new Set();    // pipes whose fittings are unfolded
  const calc = { on: 60, off: 240, vol: '', p1: 7, p2: 5, secs: 120, hole: 3, holeBar: 7, pq: 600, pt: 10, pp1: 7, pp2: 6 };

  /* ---------------- Data ---------------- */
  const P = () => E().project;
  function systems() { return Array.isArray(P().air) ? P().air : []; }
  function current() {
    const list = systems();
    const s = list.find((x) => x.id === sysId) || list[0] || null;
    sysId = s ? s.id : null;
    return s;
  }
  /* Every change: one undo step, then save and redraw. */
  function edit(fn) {
    const ed = E();
    ed.pushHistory();
    const r = fn();
    ed.commit();
    render();
    return r;
  }
  function byPath(sys, path) {
    const parts = path.split('.');
    let o = sys;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (Array.isArray(o)) o = o.find((x) => x.id === k);
      else { if (o[k] == null) o[k] = {}; o = o[k]; }
      if (!o) return null;
    }
    return { o, k: parts[parts.length - 1], parts };
  }
  const OPTIONAL = new Set(['kw', 'set']);
  function setPath(sys, path, v) {
    const at = byPath(sys, path); if (!at) return;
    const { o, k, parts } = at;
    if (v === null && !OPTIONAL.has(k)) return;
    if (parts[0] === 'compressors' && k === 'kind') { A.setCompressorKind(o, v); return; }
    if (parts[0] === 'pipes' && k === 'material') {
      const was = A.sizeOf(o.material, o.size).id, sizes = A.PIPES[v].sizes;
      o.material = v;
      if (!sizes.some((s) => s[0] === o.size)) o.size = sizes.reduce((b, s) => (Math.abs(s[2] - was) < Math.abs(b[2] - was) ? s : b), sizes[0])[0];
      return;
    }
    if (parts[0] === 'pipes' && k === 'parent') { o.parent = v || null; if (o.parent && o.role === 'main' && !sys.pipes.some((p) => p.parent === null && p.id === o.parent)) o.role = 'branch'; return; }
    if (parts[0] === 'treatment' && k === 'kind') {
      const d = A.TREATMENT[v]; o.kind = v; o.dp = d.dp; o.before = !!d.before;
      if (d.purge) o.purge = o.purge || d.purge; else delete o.purge;
      return;
    }
    if (parts[0] === 'drops' && k === 'frlOn') { o.frl = v ? { rated: 1500, dp: 0.2, set: null, lubricator: false } : null; return; }
    if (parts[0] === 'drops' && k === 'pipe') { o.pipe = v || null; return; }
    if (parts.includes('cyl')) {
      o[k] = v;
      const tool = byPath(sys, parts.slice(0, parts.indexOf('cyl')).join('.') + '.x').o;
      tool.lpm = Math.round(A.cylinderLpm(tool.cyl) * 10) / 10;
      if (k === 'bar') tool.bar = v;
      return;
    }
    if (parts[0] === 'settings' && k === 'quality' && !A.QUALITY[v]) return;
    o[k] = v;
  }

  /* ---------------- Opening and closing ---------------- */
  function acknowledged() { if (ackedNow) return true; try { return !!localStorage.getItem(ACK); } catch { return false; } }
  function openAir() {
    if (!root) return;
    isOpen = true; sel = null; zoom = null;
    root.hidden = false; root.dataset.kind = 'air';
    root.innerHTML = `<div class="v-head air-head">
        <h2>${esc(t('Compressed air planner'))}</h2>
        <select id="air-sys" aria-label="${esc(t('Air system'))}"></select>
        <button class="btn" data-air="sys-new">${esc(t('New system…'))}</button>
        <button class="btn" data-air="sys-rename">${esc(t('Rename'))}</button>
        <button class="btn danger" data-air="sys-del">${esc(t('Delete'))}</button>
        <span class="vsep"></span>
        <button class="btn" data-air="csv">${esc(t('Export CSV'))}</button>
        <button class="btn" data-air="svg">${esc(t('Export SVG'))}</button>
        <button class="btn" data-air="pdf">${esc(t('Export PDF'))}</button>
        <div class="grow"></div>
        <button class="iconbtn" data-air="undo" title="${esc(t('Undo'))} (Ctrl+Z)" aria-label="${esc(t('Undo'))}"><svg class="i"><use href="#i-undo"/></svg></button>
        <button class="iconbtn air-redo" data-air="redo" title="${esc(t('Redo'))} (Ctrl+Shift+Z)" aria-label="${esc(t('Redo'))}"><svg class="i"><use href="#i-undo"/></svg></button>
        <button class="btn" data-air="manual" title="F1">${esc(t('Help'))}</button>
        <button class="btn primary" data-air="close">${esc(t('Close'))}</button>
      </div>
      <div class="air-disc" role="note"><span><b>${esc(t('Planning estimates only.'))}</b> ${esc(t('Not proof that a system is safe. If it is used at work, the Pressure Systems Safety Regulations 2000 apply. No responsibility is accepted.'))}</span><a href="#" data-air="disclaimer">${esc(t('Read the disclaimer'))}</a></div>
      <div class="air-main" id="air-main"></div>`;
    document.addEventListener('keydown', keys, true);
    render();
    if (!acknowledged()) ackModal();
  }
  function closeAir() {
    if (!isOpen) return;
    isOpen = false; sel = null;
    document.removeEventListener('keydown', keys, true);
    if (observer) { observer.disconnect(); observer = null; }
    root.hidden = true; root.innerHTML = ''; root.dataset.kind = '';
  }
  function ackModal() {
    const ed = E();
    ed.showModal(t('Before you plan compressed air'), `<p class="callout warn">${esc(t('Please read this before you use the compressed air planner.'))}</p>
      ${D.full.map((x) => `<p>${esc(t(x))}</p>`).join('')}
      <div class="row-btns"><button class="btn primary" id="air-ack">${esc(t('I understand'))}</button><button class="btn" id="air-ack-man">${esc(t('Read more in the manual'))}</button><button class="btn" id="air-ack-no">${esc(t('Close the planner'))}</button></div>`);
    $('#air-ack').onclick = () => { ackedNow = true; try { localStorage.setItem(ACK, new Date().toISOString()); } catch { /* storage unavailable: asked again next time */ } ed.closeModal(); };
    $('#air-ack-man').onclick = () => { if (window.LoomManualViewer) window.LoomManualViewer.open('compressed-air'); };
    $('#air-ack-no').onclick = () => ed.closeModal();
    // closing it any other way without agreeing closes the planner too
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      if (!$('#modal').hidden) return;
      observer.disconnect(); observer = null;
      if (!acknowledged()) closeAir();
    });
    observer.observe($('#modal'), { attributes: true, attributeFilter: ['hidden'] });
  }
  function disclaimerModal() {
    const ed = E();
    ed.showModal(t('Compressed air: disclaimer'), `${D.full.map((x) => `<p>${esc(t(x))}</p>`).join('')}
      <div class="row-btns"><button class="btn primary" data-close>${esc(t('Close'))}</button>${window.LoomManualViewer ? `<button class="btn" id="air-dc-man">${esc(t('Full disclaimer in the manual'))}</button>` : ''}</div>`);
    if ($('#air-dc-man')) $('#air-dc-man').onclick = () => { ed.closeModal(); window.LoomManualViewer.open('disclaimer'); };
  }
  function keys(e) {
    if (!isOpen || root.hidden) return;
    if (window.LoomManualViewer && window.LoomManualViewer.isOpen && window.LoomManualViewer.isOpen()) return;
    const ed = E(), modal = !$('#modal').hidden;
    if (modal) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ed.closeModal(); } return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '').toUpperCase());
    const mod = e.ctrlKey || e.metaKey, k = (e.key || '').toLowerCase();
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (typing) e.target.blur(); else closeAir(); return; }
    if (mod && k === 's') { e.preventDefault(); e.stopPropagation(); if (typing) e.target.blur(); ed.runCommand('save'); return; }
    if (typing) return;
    if (mod && (k === 'z' || k === 'y')) { e.preventDefault(); e.stopPropagation(); if (k === 'y' || e.shiftKey) ed.redo(); else ed.undo(); render(); return; }
    if (e.key === '0') { e.preventDefault(); zoom = 'fit'; drawSchematic(); }
  }

  /* ---------------- Drawing everything ---------------- */
  let renderTimer = 0, tab = 'summary', toTop = false;
  const TABS = [['summary', 'Results'], ['checks', 'Checks'], ['pipes', 'Pipes'], ['tools', 'Pressure at tools'], ['calc', 'Leak test and calculators']];
  function render() {
    clearTimeout(renderTimer);
    if (!isOpen) return;
    const main = $('#air-main'); if (!main) return;
    const sys = current();
    const pick = $('#air-sys');
    pick.innerHTML = systems().length ? systems().map((s) => `<option value="${esc(s.id)}"${s.id === sysId ? ' selected' : ''}>${esc(s.name || t('Untitled system'))}</option>`).join('') : `<option>${esc(t('No systems yet'))}</option>`;
    pick.disabled = !systems().length;
    root.querySelectorAll('[data-air="sys-rename"],[data-air="sys-del"],[data-air="csv"],[data-air="svg"],[data-air="pdf"]').forEach((b) => { b.disabled = !sys; });
    if (!sys) { report = null; main.className = 'air-main empty'; main.innerHTML = emptyHTML(); return; }
    report = L.airReport(sys);
    if (main.className !== 'air-main' || !$('#air-res')) {
      main.className = 'air-main';
      main.innerHTML = `<aside class="air-edit" id="air-edit" aria-label="${esc(t('System parts'))}"></aside>
        <div class="air-right">
          <div class="v-stage air-stage"><div class="air-scroll" id="air-scroll"><svg id="air-svg" aria-label="${esc(t('Compressed air schematic'))}"></svg></div>
            <div class="air-zoom"><button class="btn sm" data-air="zoom-out" title="${esc(t('Zoom out'))}">−</button><button class="btn sm" data-air="zoom-fit" title="${esc(t('Fit to window'))} (0)">${esc(t('Fit'))}</button><button class="btn sm" data-air="zoom-in" title="${esc(t('Zoom in'))}">+</button></div>
            <div class="v-hint">${esc(t('Not to scale. Red is a problem, amber a warning. Click an item to edit it. Ctrl+scroll zooms.'))}</div></div>
          <section class="air-res" aria-label="${esc(t('Results'))}"><div class="tabs" role="tablist" id="air-tabs"></div><div class="air-tabbody" id="air-res"></div></section>
        </div>`;
      $('#air-scroll').addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.002)); }, { passive: false });
    }
    if (toTop) { toTop = false; $('#air-edit').scrollTop = 0; $('#air-res').scrollTop = 0; }
    drawEditor(sys, report); drawSchematic(); drawResults(sys, report);
  }
  function emptyHTML() {
    return `<div class="air-empty"><h3>${esc(t('Plan a compressed air system'))}</h3>
      <p class="muted">${esc(t('Lay out the compressor, receiver, air treatment, pipe runs, drops and tools. The planner works out the air demand, pressure at each tool, pipe sizes, receiver size, running cost, leak cost and water to drain, and lists anything to look at.'))}</p>
      <div class="row-btns"><button class="btn primary" data-air="start" data-id="empty">${esc(t('Start a new system'))}</button><button class="btn" data-air="start" data-id="garage">${esc(t('Home garage example'))}</button><button class="btn" data-air="start" data-id="factory">${esc(t('Workshop example'))}</button></div>
      <p class="muted" style="font-size:11.5px">${esc(t(D.short))}</p></div>`;
  }

  /* ---------------- Editor (left) ---------------- */
  const fld = (label, inner, title) => `<label class="fld stack"${title ? ` title="${esc(t(title))}"` : ''}><span>${esc(t(label))}</span>${inner}</label>`;
  const num = (path, val, o = {}) => `<input type="number" data-f="${path}" data-type="num" value="${val == null ? '' : esc(val)}" step="${o.step || 'any'}"${o.neg ? '' : ' min="0"'}${o.ph ? ` placeholder="${esc(t(o.ph))}"` : ''}>`;
  const txt = (path, val, ph) => `<input type="text" data-f="${path}" data-type="text" value="${esc(val || '')}"${ph ? ` placeholder="${esc(t(ph))}"` : ''}>`;
  const sel_ = (path, val, opts) => `<select data-f="${path}" data-type="sel">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val == null ? '' : val) ? ' selected' : ''}>${esc(t(l))}</option>`).join('')}</select>`;
  const chk = (path, val, label) => `<label class="air-chk"><input type="checkbox" data-f="${path}" data-type="bool"${val ? ' checked' : ''}><span>${esc(t(label))}</span></label>`;
  const del = (act, id, id2, what) => `<button class="iconbtn sm" data-air="${act}" data-id="${esc(id)}"${id2 ? ` data-id2="${esc(id2)}"` : ''} title="${esc(t('Delete') + ' ' + what)}" aria-label="${esc(t('Delete') + ' ' + what)}"><svg class="i"><use href="#i-x"/></svg></button>`;
  function levels(R) {
    const m = new Map(), worse = (a, b) => (!a ? b : a === 'error' || b === 'error' ? 'error' : a === 'warn' || b === 'warn' ? 'warn' : 'info');
    R.checks.forEach((c) => {
      const w = c.where || {}; if (!w.id) return;
      const key = w.kind === 'tool' ? `tool:${w.drop}:${w.id}` : `${w.kind}:${w.id}`;
      m.set(key, worse(m.get(key), c.level));
    });
    return m;
  }
  const cardCls = (lv, key) => { const l = lv.get(key); return (l === 'error' ? ' err' : l === 'warn' ? ' warn' : '') + (sel && key === selKey(sel) ? ' on' : ''); };
  const selKey = (s) => (s.kind === 'tool' ? `tool:${s.drop}:${s.id}` : `${s.kind}:${s.id}`);
  function section(id, title, count, body) {
    return `<details class="air-sec" data-sec="${id}"${closedSecs.has(id) ? '' : ' open'}><summary>${esc(t(title))}${count != null ? `<span class="count">${count}</span>` : ''}</summary><div class="air-sec-body">${body}</div></details>`;
  }
  function drawEditor(sys, R) {
    const el = $('#air-edit'); if (!el) return;
    const keep = { top: el.scrollTop, f: document.activeElement && el.contains(document.activeElement) ? document.activeElement.dataset.f : null };
    const lv = levels(R), st = sys.settings || {};
    const tr = new Map(R.treatment.map((x) => [x.id, x])), dr = new Map(R.drops.map((x) => [x.id, x]));
    let h = '';
    // System settings
    h += section('system', 'System', null, `<div class="air-card" id="air-card-system-">
      ${fld('Name', txt('name', sys.name, 'e.g. Workshop air'))}
      <div class="air-g2">
        ${fld('Where it is used', sel_('settings.use', st.use || 'work', [['work', 'At work'], ['home', 'At home (hobby)']]))}
        ${fld('Air quality needed', sel_('settings.quality', st.quality || 'general', Object.entries(A.QUALITY).map(([k, v]) => [k, v.name])))}
      </div>
      <div class="air-g3">
        ${fld('Electricity £/kWh', num('settings.tariff', st.tariff, { step: 0.01 }))}
        ${fld('Hours a year', num('settings.hours', st.hours, { step: 100 }), 'Hours the system is switched on in a year')}
        ${fld('Room °C', num('settings.ambient', st.ambient, { step: 1, neg: true }), 'Temperature of the air the compressor draws in')}
        ${fld('Altitude m', num('settings.altitude', st.altitude, { step: 50, neg: true }))}
        ${fld('Humidity %', num('settings.rh', st.rh, { step: 5 }))}
        ${fld('Leaks %', num('settings.leakPct', st.leakPct, { step: 1 }), 'Allowance for leaks, as a share of the tools\' demand. Well-run systems lose under 10 %.')}
        ${fld('Growth %', num('settings.growthPct', st.growthPct, { step: 5 }), 'Margin for tools you may add later, usually 10 to 25 %')}
        ${fld('Tools at once %', num('settings.simultaneity', st.simultaneity, { step: 5 }), 'How much of the tools\' average use happens at the same time. One person using one tool at a time: lower it.')}
      </div></div>`);
    // Compressors
    h += section('comp', 'Compressors', sys.compressors.length, sys.compressors.map((c) => {
      const rc = R.compressors.find((x) => x.id === c.id) || {};
      return `<div class="air-card${cardCls(lv, 'compressor:' + c.id)}" id="air-card-compressor-${esc(c.id)}">
        <div class="air-row">${txt(`compressors.${c.id}.name`, c.name)}${del('del-comp', c.id, null, t('compressor'))}</div>
        <div class="air-g3">
          ${fld('Type', sel_(`compressors.${c.id}.kind`, c.kind, Object.entries(A.COMPRESSOR_KINDS).map(([k, v]) => [k, v.name])))}
          ${fld('Air l/min', num(`compressors.${c.id}.fad`, c.fad, { step: 10 }), 'Free air delivery (FAD) from the data sheet. 1 cfm = 28.3 l/min.')}
          ${fld('That figure is', sel_(`compressors.${c.id}.basis`, c.basis || 'fad', [['fad', 'Free air (FAD)'], ['displacement', 'Displacement']]), 'Small piston compressors often quote displacement (air drawn in). Real delivery is about 65 % of it.')}
          ${fld('Motor kW', num(`compressors.${c.id}.kw`, c.kw, { step: 0.1, ph: 'estimate' }), 'Input power. Leave empty to use a typical figure. 1 hp = 0.746 kW.')}
          ${fld('Cut-in bar', num(`compressors.${c.id}.cutIn`, c.cutIn, { step: 0.1 }), 'Pressure at which it starts (or loads)')}
          ${fld('Cut-out bar', num(`compressors.${c.id}.cutOut`, c.cutOut, { step: 0.1 }), 'Pressure at which it stops (or unloads)')}
        </div>
        <p class="air-note">${c.basis === 'displacement' ? esc(`${t('Free air used')}: ${fmt(rc.fad)} l/min (65 %). `) : ''}${rc.kwEstimated ? esc(`${t('Power assumed')}: ${fmt(rc.kw, 1)} kW. `) : ''}${esc(`${fmt(A.units.lpmToCfm(rc.fad || 0), 1)} cfm · ${fmt(A.units.barToPsi(c.cutOut || 0))} psi ${t('cut-out')}`)}</p></div>`;
    }).join('') + `<div class="row-btns"><button class="btn sm" data-air="add-comp">${esc(t('Add compressor'))}</button></div>`);
    // Receivers
    h += section('rec', 'Receivers', sys.receivers.length, sys.receivers.map((r) => `<div class="air-card${cardCls(lv, 'receiver:' + r.id)}" id="air-card-receiver-${esc(r.id)}">
        <div class="air-row">${txt(`receivers.${r.id}.name`, r.name)}${del('del-rec', r.id, null, t('receiver'))}</div>
        <div class="air-g3">${fld('Volume litres', num(`receivers.${r.id}.litres`, r.litres, { step: 10 }))}${fld('Rated PS bar', num(`receivers.${r.id}.ps`, r.ps, { step: 0.5 }), 'Maximum allowable pressure, from the data plate')}
          <div class="air-checks-col">${chk(`receivers.${r.id}.safetyValve`, r.safetyValve !== false, 'Safety valve')}${chk(`receivers.${r.id}.drain`, r.drain !== false, 'Condensate drain')}</div></div>
        <p class="air-note">PS × V = ${fmt((+r.ps || 0) * (+r.litres || 0))} bar·l</p></div>`).join('') + `<div class="row-btns"><button class="btn sm" data-air="add-rec">${esc(t('Add receiver'))}</button></div>`);
    // Treatment
    const kinds = Object.entries(A.TREATMENT).map(([k, v]) => [k, v.name]);
    h += section('treat', 'Air treatment', sys.treatment.length, sys.treatment.map((x, i) => {
      const rx = tr.get(x.id) || {};
      return `<div class="air-card${cardCls(lv, 'treatment:' + x.id)}" id="air-card-treatment-${esc(x.id)}">
        <div class="air-row">${sel_(`treatment.${x.id}.kind`, x.kind, kinds)}<button class="iconbtn sm" data-air="treat-up" data-id="${esc(x.id)}" title="${esc(t('Move up'))}" aria-label="${esc(t('Move up'))}"${i ? '' : ' disabled'}><svg class="i"><use href="#i-up"/></svg></button><button class="iconbtn sm" data-air="treat-down" data-id="${esc(x.id)}" title="${esc(t('Move down'))}" aria-label="${esc(t('Move down'))}"${i < sys.treatment.length - 1 ? '' : ' disabled'}><svg class="i"><use href="#i-down"/></svg></button>${del('del-treat', x.id, null, t('item'))}</div>
        <div class="air-g3">${fld('Rated l/min', num(`treatment.${x.id}.rated`, x.rated, { step: 50 }))}${fld('Loss at rating bar', num(`treatment.${x.id}.dp`, x.dp, { step: 0.01 }), 'Pressure lost at the rated flow, from the maker. Filters: about 0.1 to 0.2 bar new.')}
          ${x.kind === 'dryer-des' ? fld('Purge %', num(`treatment.${x.id}.purge`, x.purge, { step: 1 }), 'Air a heatless desiccant dryer uses to dry itself: typically 15 to 20 % of its rating') : `<div class="air-checks-col">${chk(`treatment.${x.id}.before`, !!x.before, 'Before the receiver')}</div>`}</div>
        <p class="air-note">${esc(`${t('Flow')} ${fmt(rx.flow || 0)} l/min · ${t('loses')} ${fbar(rx.dp || 0)} bar`)}${rx.capacity != null && rx.factor != null ? esc(` · ${t('handles about')} ${fmt(rx.capacity)} l/min ${t('here')}`) : ''}</p></div>`;
    }).join('') + `<div class="row-btns"><select data-air-add="treat" aria-label="${esc(t('Add air treatment'))}"><option value="">${esc(t('Add air treatment…'))}</option>${kinds.map(([k, n]) => `<option value="${k}">${esc(t(n))}</option>`).join('')}</select></div>`);
    // Pipework, as an indented tree
    const pipeOpts = (self) => {
      const bad = new Set([self]); let grew = true;
      while (grew) { grew = false; sys.pipes.forEach((p) => { if (p.parent && bad.has(p.parent) && !bad.has(p.id)) { bad.add(p.id); grew = true; } }); }
      return [['', 'The receiver']].concat(R.pipes.filter((p) => !bad.has(p.id)).map((p) => [p.id, p.name]));
    };
    const mats = Object.entries(A.PIPES).map(([k, v]) => [k, v.name]);
    h += section('pipes', 'Pipework', sys.pipes.length, R.pipes.map((rp) => {
      const p = sys.pipes.find((x) => x.id === rp.id), f = p.fittings || {};
      const fitN = A.FITTINGS.reduce((s, [k]) => s + (+f[k] || 0), 0);
      return `<div class="air-card air-pipe${cardCls(lv, 'pipe:' + p.id)}" id="air-card-pipe-${esc(p.id)}" style="margin-left:${Math.min(5, rp.depth) * 14}px">
        <div class="air-row">${txt(`pipes.${p.id}.name`, p.name)}<button class="btn sm" data-air="add-branch" data-id="${esc(p.id)}" title="${esc(t('Add a pipe that starts at the end of this one'))}">${esc(t('Branch'))}</button><button class="btn sm" data-air="add-drop" data-id="${esc(p.id)}" title="${esc(t('Add a drop at the end of this pipe'))}">${esc(t('Drop'))}</button>${del('del-pipe', p.id, null, t('pipe'))}</div>
        <div class="air-g3">
          ${fld('Starts from', sel_(`pipes.${p.id}.parent`, p.parent || '', pipeOpts(p.id)))}
          ${fld('Use', sel_(`pipes.${p.id}.role`, p.role || 'main', [['main', 'Main or header'], ['branch', 'Branch'], ['drop', 'Drop pipe']]), 'Sets the air speed limit: 9 m/s for mains, about 15 m/s for branches and drops')}
          <div class="air-checks-col">${chk(`pipes.${p.id}.ring`, !!p.ring, 'Ring main')}</div>
          ${fld('Material', sel_(`pipes.${p.id}.material`, p.material, mats))}
          ${fld('Size', sel_(`pipes.${p.id}.size`, p.size, A.PIPES[p.material in A.PIPES ? p.material : 'aluminium'].sizes.map((s) => [s[0], s[1]])))}
          ${fld('Length m', num(`pipes.${p.id}.length`, p.length, { step: 1 }))}
        </div>
        <details class="air-fit" data-fit="${esc(p.id)}"${openFits.has(p.id) ? ' open' : ''}><summary>${esc(t('Fittings'))}: ${fitN ? esc(`${fitN}, +${fmt(rp.eqLength - rp.length, 1)} m`) : esc(t('none'))}</summary>
          <div class="air-g3">${A.FITTINGS.map(([k, n]) => fld(n, num(`pipes.${p.id}.fittings.${k}`, f[k] || 0, { step: 1 }))).join('')}</div></details>
        <p class="air-note">${esc(`${fmt(rp.flow)} l/min · ${fmt(rp.velocity, 1)} m/s · ${t('loses')} ${fbar(rp.dp)} bar · ${fmt(rp.pOut, 2)} bar ${t('at the end')}`)}</p></div>`;
    }).join('') + `<div class="row-btns"><button class="btn sm" data-air="add-pipe">${esc(t('Add pipe from the receiver'))}</button></div>`);
    // Drops and tools
    const onPipe = [['', 'Receiver outlet']].concat(R.pipes.map((p) => [p.id, p.name]));
    const libOpts = A.TOOL_GROUPS.map((g, gi) => `<optgroup label="${esc(t(g))}">${A.TOOLS.filter((x) => x.group === gi).map((x) => `<option value="${x.id}">${esc(t(x.name))}${x.lpm ? ` (${fmt(x.lpm)} l/min)` : ''}</option>`).join('')}</optgroup>`).join('');
    h += section('drops', 'Drops and tools', sys.drops.length, sys.drops.map((d) => {
      const rd = dr.get(d.id) || { tools: [] }, hz = d.hose || {}, frl = d.frl;
      return `<div class="air-card${cardCls(lv, 'drop:' + d.id)}" id="air-card-drop-${esc(d.id)}">
        <div class="air-row">${txt(`drops.${d.id}.name`, d.name)}${del('del-drop', d.id, null, t('drop'))}</div>
        <div class="air-g3">
          ${fld('On pipe', sel_(`drops.${d.id}.pipe`, d.pipe || '', onPipe), 'The drop is at the end of this pipe')}
          ${fld('Taken off the', sel_(`drops.${d.id}.takeoff`, d.takeoff || 'top', [['top', 'Top'], ['side', 'Side'], ['bottom', 'Underside']]))}
          ${fld('Outlets', num(`drops.${d.id}.outlets`, d.outlets || 1, { step: 1 }), 'Couplings on this drop. Each runs one tool at a time.')}
        </div>
        <div class="air-sub"><div class="air-row">${chk(`drops.${d.id}.frlOn`, !!frl, 'Filter-regulator (FRL)')}${frl ? chk(`drops.${d.id}.frl.lubricator`, !!frl.lubricator, 'Lubricator') : ''}${chk(`drops.${d.id}.drainLeg`, !!d.drainLeg, 'Drain leg')}</div>
        ${frl ? `<div class="air-g3">${fld('Rated l/min', num(`drops.${d.id}.frl.rated`, frl.rated, { step: 50 }))}${fld('Loss at rating bar', num(`drops.${d.id}.frl.dp`, frl.dp, { step: 0.05 }), 'From the maker. 0.2 bar is a planning estimate.')}${fld('Regulator bar', num(`drops.${d.id}.frl.set`, frl.set, { step: 0.1, ph: 'open' }), 'Leave empty if it is not turned down')}</div>` : ''}
        <div class="air-g3">${fld('Hose', sel_(`drops.${d.id}.hose.size`, hz.size || '3/8"', A.HOSES.map(([k, b]) => [k, `${k} (${b} mm bore)`])))}${fld('Hose m', num(`drops.${d.id}.hose.length`, hz.length, { step: 1 }))}${fld('Coupling', sel_(`drops.${d.id}.hose.coupling`, hz.coupling || 'none', [['none', 'None'], ['1/4"', '1/4"'], ['3/8"', '3/8"'], ['1/2"', '1/2"']]), 'Quick coupling size. Losses are estimates; use the maker\'s figure where you have it.')}
          ${fld('Couplings', num(`drops.${d.id}.hose.couplings`, hz.couplings == null ? 1 : hz.couplings, { step: 1 }), 'Couplings between the drop and the tool, such as an extra one on a whip hose')}<div class="air-checks-col">${chk(`drops.${d.id}.hose.safety`, !!hz.safety, 'Safety coupling')}</div></div></div>
        <div class="air-tools">${(d.tools || []).map((tl) => toolRow(d, tl, rd, lv)).join('') || `<p class="air-note">${esc(t('No tools yet. Add the tools used here.'))}</p>`}</div>
        <div class="row-btns"><select data-air-add="tool" data-id="${esc(d.id)}" aria-label="${esc(t('Add a tool'))}"><option value="">${esc(t('Add a tool…'))}</option>${libOpts}</select></div>
        <p class="air-note">${esc(`${t('At the drop')}: ${fmt(rd.pDrop || 0, 2)} bar · ${t('flat out')} ${fmt(rd.peak || 0)} l/min`)}</p></div>`;
    }).join('') + `<div class="row-btns"><button class="btn sm" data-air="add-drop" data-id="">${esc(t('Add drop'))}</button></div>`);
    el.innerHTML = h;
    el.scrollTop = keep.top;
    if (keep.f) { const f = el.querySelector(`[data-f="${CSS.escape(keep.f)}"]`); if (f) f.focus({ preventScroll: true }); }
  }
  function toolRow(d, tl, rd, lv) {
    const rt = (rd.tools || []).find((x) => x.id === tl.id) || {}, lib = A.toolById(tl.kind) || {}, base = `drops.${d.id}.tools.${tl.id}`;
    const status = lv.get(`tool:${d.id}:${tl.id}`);
    return `<div class="air-tool${status === 'error' ? ' err' : status === 'warn' ? ' warn' : ''}${sel && sel.kind === 'tool' && sel.id === tl.id && sel.drop === d.id ? ' on' : ''}" id="air-card-tool-${esc(d.id)}-${esc(tl.id)}">
      <div class="air-row">${txt(`${base}.name`, tl.name)}${del('del-tool', d.id, tl.id, t('tool'))}</div>
      <div class="air-g4">
        ${fld('l/min running', tl.cyl ? `<input type="number" value="${esc(fmt(rt.lpm || 0, 1).replace(/,/g, ''))}" disabled>` : num(`${base}.lpm`, tl.lpm, { step: 10 }), 'Free air the tool uses while it runs. Use the maker\'s "under load" figure where you have it.')}
        ${fld('Use %', num(`${base}.util`, tl.util, { step: 5 }), 'Share of the time it runs. Typical tables assume 25 %.')}
        ${fld('Needs bar', num(`${base}.bar`, tl.bar, { step: 0.1 }), 'Inlet pressure for full output. Most air tools: 6.3 bar (90 psi).')}
        <div class="air-checks-col">${chk(`${base}.cont`, !!tl.cont, 'Runs for minutes')}${chk(`${base}.paint`, !!tl.paint, 'Spray gun')}</div>
      </div>
      ${tl.cyl ? `<div class="air-g4">${fld('Bore mm', num(`${base}.cyl.bore`, tl.cyl.bore, { step: 1 }))}${fld('Rod mm', num(`${base}.cyl.rod`, tl.cyl.rod, { step: 1 }))}${fld('Stroke mm', num(`${base}.cyl.stroke`, tl.cyl.stroke, { step: 5 }))}${fld('Cycles/min', num(`${base}.cyl.cpm`, tl.cyl.cpm, { step: 1 }))}${fld('Supply bar', num(`${base}.cyl.bar`, tl.cyl.bar, { step: 0.5 }))}<div class="air-checks-col">${chk(`${base}.cyl.single`, !!tl.cyl.single, 'Single-acting')}</div></div>` : ''}
      <p class="air-note">${esc(lib.conf ? `${t(lib.conf[0].toUpperCase() + lib.conf.slice(1))}. ` : '')}${rt.pTool != null ? esc(`${t('Gets')} ${fmt(Math.max(0, rt.pTool), 2)} bar`) : ''}${rt.burst != null && isFinite(rt.burst) ? esc(` · ${t('receiver alone')} ${fmt(rt.burst)} s`) : ''}</p></div>`;
  }

  /* ---------------- Schematic (middle) ---------------- */
  /* The system drawn left to right: compressors, treatment and receivers, then the pipe tree with drops and tools.
     o.export adds a title, the results, the checks and the disclaimer, for SVG and PDF files. */
  function schematicSVG(R, o = {}) {
    const lv = levels(R), ref = (k) => lv.get(k);
    const col = (k, base = INK) => (ref(k) === 'error' ? ERR : ref(k) === 'warn' ? WARN : base);
    const on = (kind, id, drop) => !o.export && sel && sel.kind === kind && sel.id === id && (kind !== 'tool' || sel.drop === drop);
    const T = (x, y, s, a = {}) => `<text x="${x}" y="${y}" font-size="${a.size || 11}"${a.anchor ? ` text-anchor="${a.anchor}"` : ''}${a.bold ? ' font-weight="600"' : ''} fill="${a.fill || INK}">${esc(s)}</text>`;
    let g = '', maxX = 600, maxY = 160;
    const grow = (x, y) => { maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
    g += T(24, 26, R.name, { size: 14, bold: true });
    g += T(24, 44, 'Compressed air schematic, not to scale. Each pipe: flow · air speed · pressure lost.', { size: 10.5, fill: MUTED });
    const cy = 112;
    let x = 24;
    // compressors
    const CW = 152, CH = 60;
    if (!R.compressors.length) { g += `<rect x="${x}" y="${cy - CH / 2}" width="${CW}" height="${CH}" rx="4" fill="#fff" stroke="${ERR}" stroke-dasharray="4 3"/>` + T(x + CW / 2, cy + 4, 'No compressor', { anchor: 'middle', fill: ERR }); }
    R.compressors.forEach((c, i) => {
      const y = cy - CH / 2 + i * (CH + 12), k = 'compressor:' + c.id, s = on('compressor', c.id) ? ACC : col(k);
      g += `<g data-ref="compressor:${esc(c.id)}" style="cursor:pointer"><rect x="${x}" y="${y}" width="${CW}" height="${CH}" rx="4" fill="#fff" stroke="${s}" stroke-width="${on('compressor', c.id) ? 2.5 : 1.5}"/>`;
      g += `<circle cx="${x + 18}" cy="${y + CH / 2}" r="11" fill="none" stroke="${INK}" stroke-width="1.3"/><path d="M${x + 11} ${y + CH / 2 + 6} L${x + 18} ${y + CH / 2 - 9} L${x + 25} ${y + CH / 2 + 6}" fill="none" stroke="${INK}" stroke-width="1.3"/>`;
      g += T(x + 34, y + 15, cut(c.name, 18), { size: 10.5, bold: true }) + T(x + 34, y + 28, c.kind === 'piston' ? 'Piston' : c.kind === 'screw' ? 'Screw' : 'Screw, VSD', { size: 10, fill: MUTED });
      g += T(x + 34, y + 41, `${fmt(c.fad)} l/min`, { size: 10 }) + T(x + 34, y + 53, `${fmt(c.cutIn, 1)}–${fmt(c.cutOut, 1)} bar`, { size: 10 }) + '</g>';
      if (R.compressors.length > 1) g += `<line x1="${x + CW}" y1="${y + CH / 2}" x2="${x + CW + 12}" y2="${y + CH / 2}" stroke="${INK}" stroke-width="2"/>`;
      grow(x + CW, y + CH + 10);
    });
    if (R.compressors.length > 1) g += `<line x1="${x + CW + 12}" y1="${cy}" x2="${x + CW + 12}" y2="${cy + (R.compressors.length - 1) * (CH + 12)}" stroke="${INK}" stroke-width="2"/>`;
    x += CW + (R.compressors.length > 1 ? 12 : 0);
    const link = (x1, x2) => `<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" stroke="${INK}" stroke-width="2.5"/><path d="M${x2 - 7} ${cy - 4} L${x2} ${cy} L${x2 - 7} ${cy + 4}" fill="none" stroke="${INK}" stroke-width="1.3"/>`;
    const SHORT = { aftercooler: 'Aftercooler', separator: 'Separator', prefilter: 'Pre-filter', 'dryer-ref': 'Refrig. dryer', 'dryer-des': 'Desicc. dryer', 'filter-coalescing': 'Oil filter', 'filter-fine': 'Fine filter', 'filter-carbon': 'Carbon filter' };
    const treatBox = (it) => {
      const k = 'treatment:' + it.id, s = on('treatment', it.id) ? ACC : col(k), W = 100;
      g += link(x, x + 26); x += 26;
      g += `<g data-ref="treatment:${esc(it.id)}" style="cursor:pointer"><rect x="${x}" y="${cy - 24}" width="${W}" height="48" rx="3" fill="${SOFT}" stroke="${s}" stroke-width="${on('treatment', it.id) ? 2.5 : 1.3}"/>`;
      g += `<path d="M${x + 10} ${cy - 14} L${x + 22} ${cy} L${x + 10} ${cy + 14}" fill="none" stroke="${MUTED}" stroke-width="1.2"/>`;
      g += T(x + 28, cy - 6, cut(SHORT[it.kind] || it.name, 13), { size: 10.5, bold: true }) + T(x + 28, cy + 9, `−${fbar(it.dp)} bar`, { size: 10, fill: MUTED }) + T(x + 28, cy + 21, `${fmt(it.rated)} l/min`, { size: 9.5, fill: MUTED }) + '</g>';
      x += W; grow(x, cy + 30);
    };
    R.treatment.filter((it) => it.before).forEach(treatBox);
    R.receivers.forEach((r) => {
      const k = 'receiver:' + r.id, s = on('receiver', r.id) ? ACC : col(k), W = 58;
      g += link(x, x + 30); x += 30;
      g += `<g data-ref="receiver:${esc(r.id)}" style="cursor:pointer"><rect x="${x}" y="${cy - 40}" width="${W}" height="80" rx="22" fill="#fff" stroke="${s}" stroke-width="${on('receiver', r.id) ? 2.5 : 1.6}"/>`;
      g += T(x + W / 2, cy - 2, `${fmt(r.litres)} l`, { size: 10.5, bold: true, anchor: 'middle' }) + T(x + W / 2, cy + 12, `PS ${fmt(r.ps, 1)}`, { size: 9.5, anchor: 'middle', fill: MUTED });
      g += T(x + W / 2, cy + 56, cut(r.name, 16), { size: 10, anchor: 'middle', fill: MUTED });
      if (!r.safetyValve || !r.drain) g += T(x + W / 2, cy + 69, !r.safetyValve ? 'no safety valve' : 'no drain', { size: 9.5, anchor: 'middle', fill: ERR });
      g += '</g>';
      x += W; grow(x, cy + 72);
    });
    R.treatment.filter((it) => !it.before).forEach(treatBox);
    g += `<line x1="${x}" y1="${cy}" x2="${x + 34}" y2="${cy}" stroke="${INK}" stroke-width="2.5"/>`;
    x += 34;
    const xs = x;
    g += `<circle cx="${xs}" cy="${cy}" r="3.5" fill="${INK}"/>` + T(xs - 4, cy - 50, `${fmt(R.afterTreatment, 2)} bar`, { size: 10.5, anchor: 'end', fill: MUTED });

    // the pipe tree
    const SEG_MIN = 260, PITCH = 176, GAP = 52, MAT = { aluminium: 'Alu', steel: 'Steel', copper: 'Copper', hose: 'Hose', pvc: 'PVC' };
    const rowById = new Map(R.pipes.map((p) => [p.id, p])), dropById = new Map(R.drops.map((d) => [d.id, d]));
    const drawDrop = (d, dx, y) => {
      const k = 'drop:' + d.id, s = on('drop', d.id) ? ACC : col(k);
      let h = `<g data-ref="drop:${esc(d.id)}" style="cursor:pointer"><line x1="${dx}" y1="${y}" x2="${dx}" y2="${y + 34}" stroke="${s}" stroke-width="2.2"/>`;
      h += `<rect x="${dx + 4}" y="${y + 3}" width="${PITCH - 30}" height="28" fill="transparent"/>`;
      h += T(dx + 7, y + 15, cut(d.name, 20), { size: 10.5, bold: true, fill: s === INK ? INK : s }) + T(dx + 7, y + 28, `${fmt(d.pDrop, 2)} bar`, { size: 10, fill: s === INK ? MUTED : s });
      let yy = y + 34;
      if (d.frl) {
        h += `<rect x="${dx - 15}" y="${yy}" width="30" height="20" rx="2" fill="#fff" stroke="${INK}" stroke-width="1.2"/>` + T(dx, yy + 14, d.frl.lubricator ? 'FRL' : 'FR', { size: 9.5, anchor: 'middle', bold: true });
        if (d.frl.set != null) h += T(dx + 20, yy + 14, `set ${fmt(d.frl.set, 1)}`, { size: 9.5, fill: MUTED });
        yy += 20;
      } else { h += `<circle cx="${dx}" cy="${yy + 4}" r="4" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`; yy += 8; }
      h += `<line x1="${dx}" y1="${yy}" x2="${dx}" y2="${yy + 16}" stroke="${INK}" stroke-width="1.4" stroke-dasharray="3 2"/>` + T(dx + 7, yy + 12, `${d.hose.size} × ${fmt(d.hose.length, 1)} m${d.hose.coupling !== 'none' ? ' · ' + d.hose.coupling : ''}`, { size: 9.5, fill: MUTED });
      h += '</g>';
      yy += 18;
      if (!d.tools.length) h += T(dx - 10, yy + 14, 'No tools yet', { size: 10, fill: MUTED });
      d.tools.forEach((tl, i) => {
        const tk = `tool:${d.id}:${tl.id}`, ts = on('tool', tl.id, d.id) ? ACC : col(tk, '#9aa1a9'), ty = yy + i * 38, low = tl.pTool < tl.bar;
        h += `<g data-ref="tool:${esc(d.id)}:${esc(tl.id)}" style="cursor:pointer"><rect x="${dx - 14}" y="${ty}" width="${PITCH - 18}" height="32" rx="3" fill="#fff" stroke="${ts}" stroke-width="${on('tool', tl.id, d.id) ? 2.5 : ref(tk) === 'error' || ref(tk) === 'warn' ? 1.8 : 1}"/>`;
        h += T(dx - 8, ty + 13, cut(tl.name, 23), { size: 10.5 }) + T(dx - 8, ty + 26, `${fmt(tl.lpm)} l/min · ${fmt(Math.max(0, tl.pTool), 2)} bar`, { size: 10, fill: low ? (ref(tk) === 'error' ? ERR : WARN) : MUTED }) + '</g>';
      });
      return { svg: h, bottom: yy + Math.max(1, d.tools.length) * 38 };
    };
    const place = (row, x0, y) => {
      const n = row.drops.length, w = Math.max(SEG_MIN, n * PITCH + 70), x1 = x0 + w, k = 'pipe:' + row.id;
      const s = on('pipe', row.id) ? ACC : col(k), sw = on('pipe', row.id) ? 4 : 3;
      let h = `<g data-ref="pipe:${esc(row.id)}" style="cursor:pointer"><line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="transparent" stroke-width="14"/>`;
      if (row.ring) h += `<path d="M${x0} ${y} H${x1} V${y + 6} H${x0 + 6}" fill="none" stroke="${s}" stroke-width="${sw - 1}"/>`;
      else h += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${s}" stroke-width="${sw}"/>`;
      h += `<rect x="${x0 + 6}" y="${y - 34}" width="${w - 20}" height="30" fill="transparent"/>`;
      h += T(x0 + 10, y - 22, cut(`${row.name} · ${MAT[row.material] || ''} ${row.size}${/^\d+$/.test(row.size) ? ' mm' : ''} · ${fmt(row.length, 1)} m${row.ring ? ' · ring' : ''}`, Math.floor((w - 20) / 6.4)), { size: 10.5, bold: true, fill: s === INK ? INK : s });
      h += T(x0 + 10, y - 8, `${fmt(row.flow)} l/min · ${fmt(row.velocity, 1)} m/s · −${fbar(row.dp)} bar`, { size: 10, fill: s === INK ? MUTED : s }) + '</g>';
      h += `<circle cx="${x1}" cy="${y}" r="3" fill="${INK}"/>`;
      g += h;
      let bottom = y + 30;
      row.drops.forEach((id, i) => { const d = dropById.get(id); if (!d) return; const r = drawDrop(d, x0 + 44 + i * PITCH, y); g += r.svg; bottom = Math.max(bottom, r.bottom); });
      grow(x1 + 12, bottom);
      const kids = row.kids.map((id) => rowById.get(id)).filter(Boolean);
      if (kids[0]) bottom = Math.max(bottom, place(kids[0], x1, y));
      kids.slice(1).forEach((kd) => { const yk = bottom + GAP; g += `<line x1="${x1}" y1="${y}" x2="${x1}" y2="${yk}" stroke="${INK}" stroke-width="2.5"/>`; bottom = place(kd, x1, yk); });
      return bottom;
    };
    let bottom = cy + 40;
    const roots = R.pipes.filter((p) => !p.parent);
    if (R.atSupply.length) roots.unshift({ id: '', name: 'Receiver outlet', material: 'hose', size: '', length: 0, flow: 0, velocity: 0, dp: 0, drops: R.atSupply, kids: [], virtual: true });
    roots.forEach((row, i) => {
      const y = i === 0 ? cy : bottom + GAP;
      if (i > 0) g += `<line x1="${xs}" y1="${cy}" x2="${xs}" y2="${y}" stroke="${INK}" stroke-width="2.5"/>`;
      if (row.virtual) {
        const w = Math.max(SEG_MIN, row.drops.length * PITCH + 70);
        g += `<line x1="${xs}" y1="${y}" x2="${xs + w}" y2="${y}" stroke="${MUTED}" stroke-width="2" stroke-dasharray="6 4"/>` + T(xs + 10, y - 8, 'Drops straight off the receiver', { size: 10, fill: MUTED });
        let b = y + 30;
        row.drops.forEach((id, j) => { const d = dropById.get(id); if (!d) return; const r = drawDrop(d, xs + 44 + j * PITCH, y); g += r.svg; b = Math.max(b, r.bottom); });
        grow(xs + w + 12, b); bottom = Math.max(bottom, b);
      } else bottom = Math.max(bottom, place(row, xs, y));
    });
    if (!roots.length) g += T(xs + 12, cy - 8, 'Add a pipe to start the pipework.', { size: 10.5, fill: MUTED });
    grow(0, bottom);
    let W = maxX + 24, H = maxY + 24;

    if (o.export) { // results, checks and the disclaimer under the drawing
      W = Math.max(W, 960);
      let y = H + 10;
      const line = (s, a) => { g += T(24, y, s, a); y += (a && a.gap) || 15; };
      const wrap = (s, n, a) => L.wrapText(s, n).forEach((l) => line(l, a));
      const n = Math.floor((W - 48) / 6.2);
      g += `<line x1="24" y1="${y - 8}" x2="${W - 24}" y2="${y - 8}" stroke="${MUTED}" stroke-width="0.6"/>`;
      line('Results (planning estimates)', { bold: true, size: 12, gap: 18 });
      summaryRows(R).forEach(([k, v]) => line(`${k}: ${v}`, { size: 10.5 }));
      y += 6;
      line('Checks', { bold: true, size: 12, gap: 18 });
      if (!R.checks.length) line('Nothing to report.', { size: 10.5, fill: MUTED });
      const word = { error: 'Problem', warn: 'Warning', info: 'Note' };
      R.checks.forEach((c) => wrap(`${word[c.level]} [${c.rule}] ${c.where ? c.where.label + ': ' : ''}${c.text}`, n, { size: 10.5, fill: c.level === 'error' ? ERR : c.level === 'warn' ? WARN : INK }));
      y += 8;
      g += `<line x1="24" y1="${y - 8}" x2="${W - 24}" y2="${y - 8}" stroke="${MUTED}" stroke-width="0.6"/>`;
      line('Disclaimer', { bold: true, size: 11, gap: 16 });
      wrap(D.text, n, { size: 10, fill: MUTED });
      y += 4;
      line(`Made with LoomWright on ${new Date().toISOString().slice(0, 10)}. A free, basic planning tool.`, { size: 10, fill: MUTED });
      H = y + 10;
    }
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(W)} ${Math.ceil(H)}" width="${Math.ceil(W)}" height="${Math.ceil(H)}" font-family="${MONO}"><rect x="0" y="0" width="${Math.ceil(W)}" height="${Math.ceil(H)}" fill="#ffffff"/>${g}</svg>`, w: W, h: H, body: g };
  }
  function drawSchematic() {
    const svg = $('#air-svg'), box = $('#air-scroll'); if (!svg || !report) return;
    const s = schematicSVG(report);
    const r = box.getBoundingClientRect();
    // first view: the whole drawing if it stays readable, otherwise readable and scrolled; Fit shows it all
    const fit = Math.max(0.25, Math.min(1.2, (r.width - 16) / s.w, (r.height - 16) / s.h));
    const k = zoom === 'fit' ? fit : zoom || Math.max(fit, 0.85);
    svg.setAttribute('viewBox', `0 0 ${Math.ceil(s.w)} ${Math.ceil(s.h)}`);
    svg.setAttribute('width', Math.round(s.w * k)); svg.setAttribute('height', Math.round(s.h * k));
    svg.style.width = Math.round(s.w * k) + 'px'; svg.style.height = Math.round(s.h * k) + 'px';
    svg.setAttribute('font-family', MONO);
    svg.innerHTML = `<rect x="0" y="0" width="${Math.ceil(s.w)}" height="${Math.ceil(s.h)}" fill="#ffffff" data-bg/>` + s.body;
  }
  function zoomBy(f) {
    const svg = $('#air-svg'); if (!svg) return;
    const vb = (svg.getAttribute('viewBox') || '0 0 1 1').split(' ').map(Number), now = (+svg.getAttribute('width') || vb[2]) / vb[2];
    if (!isFinite(now) || now <= 0) return;
    zoom = Math.min(3, Math.max(0.25, now * f)); drawSchematic();
  }

  /* ---------------- Results (right) ---------------- */
  function summaryRows(R) {
    const st = R.settings;
    return [
      ['Compressor output (FAD)', `${fmt(R.fad)} l/min${R.compressors.some((c) => c.basis === 'displacement') ? ' (estimate from displacement)' : ''}`],
      ['Design demand', `${fmt(R.demand.design)} l/min (tools ${fmt(R.demand.q)}, leaks ${fmt(R.demand.leak)}, growth ${fmt(R.demand.growth)}${R.demand.purge ? `, dryer purge ${fmt(R.demand.purge)}` : ''})`],
      ['Biggest drop flat out', `${fmt(R.demand.peak)} l/min`],
      ['Compressor running', isFinite(R.duty) ? `about ${fmt(R.duty * 100)} % of the time` : 'no compressor'],
      ['Receiver and pipes', `${fmt(R.receiver.total)} l${R.receiver.needed != null && isFinite(R.receiver.needed) ? `, ${fmt(R.receiver.needed)} l needed` : ''}`],
      ['Running cost', `about £${fmt(R.energy.cost)} a year (${fmt(R.energy.kwh)} kWh at £${fmt(st.tariff, 2)})`],
      ['Leaks', `${fmt(R.energy.leakLpm)} l/min, about £${fmt(R.energy.leakCost)} a year`],
      ['Pressure setting', R.pressure.needed == null ? 'no tools yet' : R.pressure.excess > 0.25 ? `${fmt(R.pressure.excess, 1)} bar above need, about £${fmt(R.pressure.extraCost)} a year` : 'close to what the tools need'],
      ['Water to drain', `about ${fmt(R.water.perDay, R.water.perDay < 10 ? 1 : 0)} l in an 8-hour day`],
    ];
  }
  function drawResults(sys, R) {
    const el = $('#air-res'), bar = $('#air-tabs'); if (!el || !bar) return;
    const keep = el.scrollTop;
    const lvl = { error: t('Problem'), warn: t('Warning'), info: t('Note') };
    const counts = { error: 0, warn: 0, info: 0 }; R.checks.forEach((c) => counts[c.level]++);
    const serious = counts.error + counts.warn;
    bar.innerHTML = TABS.map(([id, name]) => `<button role="tab" class="tab${tab === id ? ' on' : ''}" data-air="tab" data-id="${id}"><span>${esc(t(name))}</span>${id === 'checks' ? ` <span class="count${serious ? ' warn' : ''}">${serious || ''}</span>` : ''}</button>`).join('');
    let h = '';
    if (tab === 'summary') {
      const ratio = R.fad > 0 ? R.demand.design / R.fad : 1;
      // colour a figure by the worst check with that rule, so the summary and the checks agree
      const mark = (rule) => { const ls = R.checks.filter((c) => c.rule === rule).map((c) => c.level); return ls.includes('error') ? 'bad' : ls.includes('warn') ? 'warn' : ''; };
      const ts = R.drops.flatMap((d) => d.tools), lo = ts.length ? ts.reduce((a, b) => (b.pTool - b.bar < a.pTool - a.bar ? b : a)) : null;
      if (serious) h += `<button type="button" class="callout warn air-goto" data-air="tab" data-id="checks">${esc(`${serious} ${serious === 1 ? t('check to look at') : t('checks to look at')}${counts.error ? ` (${counts.error} ${counts.error === 1 ? t('problem') : t('problems')})` : ''}. ${t('Show them')}`)}</button>`;
      h += `<div class="air-sumgrid"><div class="sec"><h3>${esc(t('Air supply and demand'))}</h3>
        <div class="air-meter${ratio > 1 ? ' over' : ratio > 0.85 ? ' high' : ''}" title="${esc(t('Design demand against compressor output'))}"><i style="width:${Math.min(100, Math.round(ratio * 100))}%"></i></div>
        <div class="kv">
          <span>${esc(t('Compressor output (FAD)'))}</span><b>${fmt(R.fad)} l/min</b>
          <span>${esc(t('Design demand'))}</span><b class="${mark('D6-DEMAND')}">${fmt(R.demand.design)} l/min</b>
          <span class="air-sub-k">${esc(t('tools, at their use %'))}</span><b>${fmt(R.demand.q)}</b>
          <span class="air-sub-k">${esc(t('leaks'))} ${fmt(R.settings.leakPct)} %</span><b>${fmt(R.demand.leak)}</b>
          <span class="air-sub-k">${esc(t('growth'))} ${fmt(R.settings.growthPct)} %</span><b>${fmt(R.demand.growth)}</b>
          ${R.demand.purge ? `<span class="air-sub-k">${esc(t('dryer purge'))}</span><b>${fmt(R.demand.purge)}</b>` : ''}
          <span>${esc(t('Biggest drop flat out'))}</span><b>${fmt(R.demand.peak)} l/min</b>
          <span>${esc(t('Compressor running'))}</span><b class="${mark('D2-DUTY')}">${isFinite(R.duty) ? fmt(R.duty * 100) + ' %' : '–'}</b>
        </div></div>
        <div class="sec"><h3>${esc(t('Pressure and receiver'))}</h3><div class="kv">
          <span>${esc(t('Supply (lowest cut-in)'))}</span><b>${fmt(R.supply, 1)} bar</b>
          <span>${esc(t('After air treatment'))}</span><b>${fmt(R.afterTreatment, 2)} bar</b>
          <span>${esc(t('Lowest at a tool'))}</span><b class="${lo && lo.pTool < lo.bar ? mark('D1-TOOL-P') || 'warn' : ''}">${lo ? `${fmt(Math.max(0, lo.pTool), 2)} bar` : '–'}</b>
          <span>${esc(t('Set above need'))}</span><b>${R.pressure.needed == null ? '–' : R.pressure.excess > 0.25 ? `${fmt(R.pressure.excess, 1)} bar` : esc(t('no'))}</b>
          <span>${esc(t('Receivers and pipes hold'))}</span><b>${fmt(R.receiver.total)} l</b>
          <span>${esc(t('Receiver needed'))}</span><b class="${R.receiver.needed != null && R.receiver.total < R.receiver.needed ? mark('D3-RECEIVER') || 'warn' : ''}">${R.receiver.needed == null ? esc(t('n/a')) : isFinite(R.receiver.needed) ? fmt(R.receiver.needed) + ' l' : '–'}</b>
          ${R.receiver.cycles != null && isFinite(R.receiver.cycles) ? `<span>${esc(t('Load cycles, worst case'))}</span><b>${fmt(R.receiver.cycles)} ${esc(t('an hour'))}</b>` : ''}
        </div></div>
        <div class="sec"><h3>${esc(t('Running costs and water'))}</h3><div class="kv">
          <span>${esc(t('Electricity'))}</span><b>${fmt(R.energy.kwh)} kWh</b>
          <span>${esc(t('Running cost'))}</span><b>£${fmt(R.energy.cost)} ${esc(t('a year'))}</b>
          <span>${esc(t('Leaks'))} (${fmt(R.energy.leakLpm)} l/min)</span><b>£${fmt(R.energy.leakCost)} ${esc(t('a year'))}</b>
          <span>${esc(t('Pressure set too high'))}</span><b>${R.pressure.excess > 0.25 ? `£${fmt(R.pressure.extraCost)} ${esc(t('a year'))}` : '£0'}</b>
          <span>${esc(t('Water to drain'))}</span><b>${fmt(R.water.perDay, R.water.perDay < 10 ? 1 : 0)} l ${esc(t('a day'))}</b>
        </div><p class="air-note">${esc(t('Estimates. Costs use the hours a year and the electricity price under System. Water is for an 8-hour day. Each 1 bar lower saves about 7 % of the energy.'))}</p></div></div>`;
    } else if (tab === 'checks') {
      h += R.checks.length ? `<div class="air-checklist">${R.checks.map((c, i) => `<button type="button" class="air-check" data-air="check" data-id="${i}"><span class="lvl ${c.level}">${esc(lvl[c.level])}</span><span><b>${esc(c.where ? c.where.label : '')}</b> ${esc(c.text)} <span class="muted mono">${esc(c.rule)}</span></span></button>`).join('')}</div>` : '';
      h += `<p class="air-note air-pad">${esc(R.checks.length ? t('Checks are guidance from rules of thumb. A short list does not mean the system is safe.') : t('Nothing to report. That does not mean the system is safe: see the disclaimer.'))}</p>`;
    } else if (tab === 'pipes') {
      h += R.pipes.length ? `<table class="data"><thead><tr><th>${esc(t('Pipe'))}</th><th>${esc(t('Starts from'))}</th><th>${esc(t('Pipe and size'))}</th><th class="num">${esc(t('Length m'))}</th><th class="num">${esc(t('With fittings m'))}</th><th class="num">${esc(t('Flow l/min'))}</th><th class="num">${esc(t('Air speed m/s'))}</th><th class="num">${esc(t('Limit m/s'))}</th><th class="num">${esc(t('Pressure in bar'))}</th><th class="num">${esc(t('Lost bar'))}</th></tr></thead><tbody>${R.pipes.map((p) => `<tr class="click" data-air="pick" data-id="pipe:${esc(p.id)}"><td>${'&nbsp;&nbsp;'.repeat(Math.min(6, p.depth))}${esc(p.name)}${p.ring ? ` <span class="muted">(${esc(t('ring'))})</span>` : ''}</td><td>${esc(p.parent ? (R.pipes.find((x) => x.id === p.parent) || {}).name : t('Receiver'))}</td><td>${esc(A.PIPES[p.material].name)}, ${esc(p.sizeLabel)}</td><td class="num mono">${fmt(p.length, 1)}</td><td class="num mono">${fmt(p.eqLength, 1)}</td><td class="num mono">${fmt(p.flow)}</td><td class="num mono${p.velocity > p.vLimit ? ' air-bad' : ''}">${fmt(p.velocity, 1)}</td><td class="num mono">${fmt(p.vLimit)}</td><td class="num mono">${fmt(p.pIn, 2)}</td><td class="num mono">${fbar(p.dp)}</td></tr>`).join('')}</tbody></table>
        <p class="air-note air-pad">${esc(t('Flow is the larger of the design demand beyond the pipe and the biggest drop beyond it running flat out. A ring main is worked out as two halves, each with half the flow over half the length. Aim for 0.1 bar or less lost from the receiver to the furthest drop.'))}</p>` : `<p class="empty">${esc(t('No pipes yet.'))}</p>`;
    } else if (tab === 'tools') {
      const rows = R.drops.flatMap((d) => d.tools.map((x) => ({ d, x })));
      h += rows.length ? `<table class="data"><thead><tr><th>${esc(t('Tool'))}</th><th>${esc(t('Drop'))}</th><th class="num">${esc(t('l/min running'))}</th><th class="num">${esc(t('Use %'))}</th><th class="num">${esc(t('Needs bar'))}</th><th class="num">${esc(t('At drop'))}</th><th class="num">${esc(t('FRL'))}</th><th class="num">${esc(t('Couplings'))}</th><th class="num">${esc(t('Hose'))}</th><th class="num">${esc(t('Gets bar'))}</th><th class="num">${esc(t('Lost from supply'))}</th><th class="num">${esc(t('Receiver alone'))}</th></tr></thead><tbody>${rows.map(({ d, x }) => `<tr class="click" data-air="pick" data-id="tool:${esc(d.id)}:${esc(x.id)}"><td>${esc(x.name)}</td><td>${esc(d.name)}</td><td class="num mono">${fmt(x.lpm)}</td><td class="num mono">${fmt(x.util)}</td><td class="num mono">${fmt(x.bar, 1)}</td><td class="num mono">${fmt(d.pDrop, 2)}</td><td class="num mono">${fbar(x.dpFrl)}</td><td class="num mono">${fbar(x.dpCoupling)}</td><td class="num mono">${fbar(x.dpHose)}</td><td class="num mono${x.pTool < x.bar ? ' air-bad' : ''}">${fmt(Math.max(0, x.pTool), 2)}</td><td class="num mono${x.lossFromSupply > R.supply * 0.1 ? ' air-warn' : ''}">${fbar(x.lossFromSupply)}</td><td class="num mono">${x.burst == null ? '' : isFinite(x.burst) ? fmt(x.burst) + ' s' : ''}</td></tr>`).join('')}</tbody></table>
        <p class="air-note air-pad">${esc(t('Pressures in bar gauge, while the tool runs. "Lost from supply" is from the lowest cut-in pressure to the tool with the regulator open: aim for under 10 %. "Receiver alone" is how long the receiver keeps a tool that needs more than the compressor gives at full pressure. Coupling losses are estimates; use the maker\'s figures where you have them.'))}</p>` : `<p class="empty">${esc(t('No tools yet. Add them under Drops and tools.'))}</p>`;
    } else {
      const vol = calc.vol === '' ? Math.round(R.receiver.total) : calc.vol;
      h += `<div class="air-calcgrid"><div class="sec"><h3>${esc(t('Leak test'))}</h3>
        <p class="air-note">${esc(t('Do these with every tool off. Load/unload test: time the compressor on load and off load over a few cycles.'))}</p>
        <div class="air-g2">${fld('On load s', `<input type="number" min="0" data-calc="on" value="${esc(calc.on)}">`)}${fld('Off load s', `<input type="number" min="0" data-calc="off" value="${esc(calc.off)}">`)}</div>
        <p class="air-calc-out" id="air-c-load"></p>
        <p class="air-note">${esc(t('Pressure decay test: pump up, switch the compressor off, and time the fall to about half.'))}</p>
        <div class="air-g4">${fld('Volume l', `<input type="number" min="0" data-calc="vol" value="${esc(vol)}">`)}${fld('Seconds', `<input type="number" min="0" data-calc="secs" value="${esc(calc.secs)}">`)}${fld('Start bar', `<input type="number" min="0" step="0.1" data-calc="p1" value="${esc(calc.p1)}">`)}${fld('End bar', `<input type="number" min="0" step="0.1" data-calc="p2" value="${esc(calc.p2)}">`)}</div>
        <p class="air-calc-out" id="air-c-decay"></p></div>
        <div class="sec"><h3>${esc(t('One leak'))}</h3>
        <p class="air-note">${esc(t('Air lost through a round hole, and what it costs with your settings.'))}</p>
        <div class="air-g2">${fld('Hole mm', `<input type="number" min="0" step="0.5" data-calc="hole" value="${esc(calc.hole)}">`)}${fld('At bar', `<input type="number" min="0" step="0.5" data-calc="holeBar" value="${esc(calc.holeBar)}">`)}</div>
        <p class="air-calc-out" id="air-c-hole"></p>
        <h3>${esc(t('Receiver for a short peak'))}</h3>
        <p class="air-note">${esc(t('A local receiver that covers a short burst of air on its own, such as a blow-off or a machine cycle.'))}</p>
        <div class="air-g4">${fld('Flow l/min', `<input type="number" min="0" data-calc="pq" value="${esc(calc.pq)}">`)}${fld('For s', `<input type="number" min="0" data-calc="pt" value="${esc(calc.pt)}">`)}${fld('Normal bar', `<input type="number" min="0" step="0.1" data-calc="pp1" value="${esc(calc.pp1)}">`)}${fld('Lowest bar', `<input type="number" min="0" step="0.1" data-calc="pp2" value="${esc(calc.pp2)}">`)}</div>
        <p class="air-calc-out" id="air-c-peak"></p></div></div>`;
    }
    if (tab === 'summary' || tab === 'calc') h += `<p class="air-note air-pad">${esc(t('Figures marked typical or estimate come from published rules of thumb, not from your equipment. Use makers\' figures where you have them.'))} <a href="#" data-air="manual">${esc(t('How the planner works'))}</a></p>`;
    el.innerHTML = h;
    el.scrollTop = keep;
    calcOut();
  }
  function calcOut() {
    const R = report; if (!R || !$('#air-c-load')) return;
    const n = (k) => parseFloat(calc[k]) || 0;
    const lt = A.leakLoadTest(n('on'), n('off'), R.fad), cost = (lpm) => (lpm / 60) * R.energy.specificPower * R.settings.hours * R.settings.tariff;
    $('#air-c-load').innerHTML = `${esc(t('Leakage'))} <b>${fmt(lt.pct)} %</b>, ${fmt(lt.lpm)} l/min, ${esc(t('about'))} £${fmt(cost(lt.lpm))} ${esc(t('a year'))}. <button class="btn sm" data-air="use-leak" data-id="${round1(lt.pct)}">${esc(t('Use this figure'))}</button>`;
    const vol = calc.vol === '' ? R.receiver.total : n('vol');
    const dt = A.leakDecayTest(vol, n('p1'), n('p2'), n('secs')), pct = R.fad > 0 ? (dt.lpm * 100) / R.fad : 0;
    $('#air-c-decay').innerHTML = `${esc(t('Leak flow'))} <b>${fmt(dt.lpm)} l/min</b>${R.fad > 0 ? `, ${fmt(pct)} % ${esc(t('of the compressor output'))}` : ''}, ${esc(t('about'))} £${fmt(cost(dt.lpm))} ${esc(t('a year'))}.${R.fad > 0 ? ` <button class="btn sm" data-air="use-leak" data-id="${round1(pct)}">${esc(t('Use this figure'))}</button>` : ''}`;
    const hl = A.leakHole(n('hole'), n('holeBar'), false, R.pAtm) * 60;
    $('#air-c-hole').innerHTML = `${esc(t('About'))} <b>${fmt(hl)} l/min</b>, £${fmt(cost(hl))} ${esc(t('a year'))}. ${esc(t('A sharp-edged hole leaks about 40 % less.'))}`;
    const v = A.peakReceiver(n('pq') / 60, n('pt'), n('pp1'), n('pp2'));
    $('#air-c-peak').innerHTML = isFinite(v) ? `${esc(t('Receiver of about'))} <b>${fmt(v)} l</b>. ${esc(t('This ignores what the compressor adds during the burst.'))}` : esc(t('The normal pressure must be above the lowest pressure.'));
  }
  const round1 = (v) => Math.round(v * 10) / 10;

  /* ---------------- Exports ---------------- */
  function fileBase(sys) { return `${E().slug()}-${slugOf(sys.name)}-air`; }
  async function exportCSV() { const sys = current(); if (!sys) return; await E().exportFile(fileBase(sys) + '.csv', '﻿' + L.toCSV(L.airRows(sys)), 'text/csv'); }
  async function exportSVG() { const sys = current(); if (!sys) return; await E().exportFile(fileBase(sys) + '.svg', schematicSVG(L.airReport(sys), { export: true }).svg, 'image/svg+xml'); }
  async function exportPDF() {
    const sys = current(); if (!sys) return;
    const s = schematicSVG(L.airReport(sys), { export: true });
    const bytes = L.svgToPDF(s.svg, { scale: Math.min(0.75, 1190 / s.w, 1684 / s.h), title: `${sys.name}: compressed air plan` });
    await E().exportFile(fileBase(sys) + '.pdf', bytes, 'application/pdf');
  }

  /* ---------------- Systems ---------------- */
  function newSystemModal() {
    const ed = E();
    ed.showModal(t('New compressed air system'), `<label class="fld"><span>${esc(t('Name'))}</span><input id="air-new-name" value="" placeholder="${esc(t('Compressed air system'))}"></label>
      <div class="row-btns"><button class="btn primary" data-air-new="empty">${esc(t('Start a new system'))}</button><button class="btn" data-air-new="garage">${esc(t('Home garage example'))}</button><button class="btn" data-air-new="factory">${esc(t('Workshop example'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    $('#modal-body').querySelectorAll('[data-air-new]').forEach((b) => { b.onclick = () => { const name = $('#air-new-name').value.trim(); ed.closeModal(); startSystem(b.dataset.airNew, name); }; });
    $('#air-new-name').focus();
  }
  function startSystem(kind, name) {
    const sys = kind === 'garage' || kind === 'factory' ? A.example(kind) : A.newSystem(name || t('Compressed air system'));
    if (name) sys.name = name;
    const list = systems();
    while (list.some((x) => x.id === sys.id)) sys.id = L.uid('air');
    toTop = true; zoom = null; sel = null;
    edit(() => { const p = P(); if (!Array.isArray(p.air)) p.air = []; p.air.push(sys); sysId = sys.id; });
  }
  function deleteSystem() {
    const ed = E(), sys = current(); if (!sys) return;
    ed.showModal(t('Delete this system?'), `<p>${esc(sys.name)} ${esc(t('and everything in it is removed from the project. You can undo this.'))}</p><div class="row-btns"><button class="btn danger" id="air-del-go">${esc(t('Delete'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
    $('#air-del-go').onclick = () => { ed.closeModal(); edit(() => { const p = P(); p.air = p.air.filter((x) => x.id !== sys.id); sysId = null; }); };
  }

  /* ---------------- Selecting from the drawing or the checks ---------------- */
  function select(s) {
    sel = s;
    const sec = s.kind === 'compressor' ? 'comp' : s.kind === 'receiver' ? 'rec' : s.kind === 'treatment' ? 'treat' : s.kind === 'pipe' ? 'pipes' : s.kind === 'drop' || s.kind === 'tool' ? 'drops' : 'system';
    closedSecs.delete(sec);
    render();
    const id = s.kind === 'tool' ? `air-card-tool-${s.drop}-${s.id}` : `air-card-${s.kind}-${s.id}`;
    const el = document.getElementById(id);
    if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900); }
  }

  /* ---------------- Events ---------------- */
  root.addEventListener('change', (e) => {
    if (!isOpen) return;
    const el = e.target;
    if (el.dataset.airAdd) {
      const v = el.value; if (!v) return;
      const sys = current(); if (!sys) return;
      if (el.dataset.airAdd === 'treat') edit(() => { const it = A.addTreatment(sys, v); sel = { kind: 'treatment', id: it.id }; });
      else edit(() => { const d = sys.drops.find((x) => x.id === el.dataset.id); if (!d) return; const tl = A.addTool(d, v); sel = { kind: 'tool', id: tl.id, drop: d.id }; });
      return;
    }
    if (el.id === 'air-sys') { sysId = el.value; sel = null; zoom = null; toTop = true; render(); return; }
    const path = el.dataset.f; if (!path) return;
    const sys = current(); if (!sys) return;
    let v;
    if (el.dataset.type === 'bool') v = el.checked;
    else if (el.dataset.type === 'num') { const s = String(el.value).trim(); if (s === '') v = null; else { v = parseFloat(s); if (!isFinite(v)) { render(); return; } } }
    else if (el.dataset.type === 'text') v = el.value.trim();
    else v = el.value;
    // let the browser move the focus first, so the field the user tabbed to keeps it
    const id = sys.id;
    setTimeout(() => { const s = isOpen && systems().find((x) => x.id === id); if (s) edit(() => setPath(s, path, v)); }, 0);
  });
  root.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.calc; if (!k) return;
    calc[k] = e.target.value; calcOut();
  });
  root.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.dataset && d.dataset.sec) { if (d.open) closedSecs.delete(d.dataset.sec); else closedSecs.add(d.dataset.sec); }
    if (d.dataset && d.dataset.fit) { if (d.open) openFits.add(d.dataset.fit); else openFits.delete(d.dataset.fit); }
    if (d.dataset && d.dataset.calcBox) calc[d.dataset.calcBox + 'Open'] = d.open;
  }, true);
  root.addEventListener('click', (e) => {
    if (!isOpen) return;
    const refEl = e.target.closest('#air-svg [data-ref]');
    if (refEl) { const [kind, a, b] = refEl.dataset.ref.split(':'); if (kind === 'tool') select({ kind, drop: a, id: b }); else if (a) select({ kind, id: a }); return; }
    if (e.target.closest('#air-svg')) { if (sel) { sel = null; render(); } return; }
    const b = e.target.closest('[data-air]'); if (!b || b.disabled) return;
    e.preventDefault();
    const a = b.dataset.air, id = b.dataset.id, id2 = b.dataset.id2, ed = E(), sys = current();
    const after = (s) => { sel = s; };
    switch (a) {
      case 'close': closeAir(); break;
      case 'csv': exportCSV(); break;
      case 'svg': exportSVG(); break;
      case 'pdf': exportPDF().catch((err) => ed.toast(err.message || String(err))); break;
      case 'manual': if (window.LoomManualViewer) window.LoomManualViewer.open('compressed-air'); break;
      case 'disclaimer': disclaimerModal(); break;
      case 'undo': ed.undo(); render(); break;
      case 'redo': ed.redo(); render(); break;
      case 'sys-new': newSystemModal(); break;
      case 'sys-rename': { closedSecs.delete('system'); render(); const f = root.querySelector('[data-f="name"]'); if (f) { f.focus(); f.select(); } break; }
      case 'sys-del': deleteSystem(); break;
      case 'start': startSystem(id, ''); break;
      case 'zoom-in': zoomBy(1.2); break;
      case 'zoom-out': zoomBy(1 / 1.2); break;
      case 'zoom-fit': zoom = 'fit'; drawSchematic(); break;
      case 'tab': tab = id; drawResults(sys, report); $('#air-res').scrollTop = 0; break;
      case 'pick': { const [kind, x, y] = String(id).split(':'); if (kind === 'tool') select({ kind, drop: x, id: y }); else select({ kind, id: x }); break; }
      case 'check': { const c = report && report.checks[+id]; if (c && c.where && c.where.id) select({ kind: c.where.kind, id: c.where.id, drop: c.where.drop }); else if (c) select({ kind: 'system', id: '' }); break; }
      case 'use-leak': if (sys) edit(() => { sys.settings.leakPct = Math.max(0, +id || 0); }); ed.toast(t('Leakage allowance updated')); break;
      default: if (sys) structural(sys, a, id, id2, after);
    }
  });
  function structural(sys, a, id, id2, after) {
    const move = (list, i, by) => { const j = i + by; if (i < 0 || j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; };
    if (a === 'add-comp') edit(() => after({ kind: 'compressor', id: A.addCompressor(sys).id }));
    else if (a === 'del-comp') edit(() => { sys.compressors = sys.compressors.filter((x) => x.id !== id); });
    else if (a === 'add-rec') edit(() => after({ kind: 'receiver', id: A.addReceiver(sys).id }));
    else if (a === 'del-rec') edit(() => { sys.receivers = sys.receivers.filter((x) => x.id !== id); });
    else if (a === 'del-treat') edit(() => { sys.treatment = sys.treatment.filter((x) => x.id !== id); });
    else if (a === 'treat-up' || a === 'treat-down') edit(() => move(sys.treatment, sys.treatment.findIndex((x) => x.id === id), a === 'treat-up' ? -1 : 1));
    else if (a === 'add-pipe') edit(() => after({ kind: 'pipe', id: A.addPipe(sys, null, { name: sys.pipes.length ? t('Pipe') + ' ' + (sys.pipes.length + 1) : t('Main') }).id }));
    else if (a === 'add-branch') edit(() => after({ kind: 'pipe', id: A.addPipe(sys, id).id }));
    else if (a === 'del-pipe') edit(() => A.removePipe(sys, id));
    else if (a === 'add-drop') edit(() => { const pipe = id || (sys.pipes[sys.pipes.length - 1] || {}).id || null; after({ kind: 'drop', id: A.addDrop(sys, pipe).id }); });
    else if (a === 'del-drop') edit(() => { sys.drops = sys.drops.filter((x) => x.id !== id); });
    else if (a === 'del-tool') edit(() => { const d = sys.drops.find((x) => x.id === id); if (d) d.tools = (d.tools || []).filter((x) => x.id !== id2); });
  }
  window.addEventListener('resize', () => { if (isOpen && (!zoom || zoom === 'fit')) drawSchematic(); });

  /* ---------------- Menu command ---------------- */
  E().addCommand('air', { label: 'Compressed air planner…', run: openAir }, 'Tools', 'locations');
  window.LoomAirView = { open: openAir, close: closeAir, isOpen: () => isOpen, schematicSVG: (sys, o) => schematicSVG(L.airReport(sys), o || {}).svg };
})();
