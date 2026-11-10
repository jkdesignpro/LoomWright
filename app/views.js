/*
 * LoomWright views: the harness formboard and the vehicle location view.
 * Both open full-window over the editor and edit the open project through window.LoomEditor.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function () {
  'use strict';
  const L = window.Loom, E = () => window.LoomEditor;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = L.esc;
  const t = (s) => (window.LoomI18n ? window.LoomI18n.t(s) : s);
  const root = $('#views');
  const INK = '#262b28', ACC = '#2f6fde', MUTED = '#636a74', MONO = "'IBM Plex Mono', Consolas, monospace";
  const r10 = (v) => Math.round(v / 10) * 10;

  let mode = null;          // 'formboard' or 'vehicle'
  let view = { x: 0, y: 0, k: 1 };
  let drag = null;

  /* ---------------- Shared: pan and zoom ---------------- */
  function stage() { return $('#v-svg'); }
  function world(e) { const r = stage().getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k }; }
  function applyView() { const g = $('#v-vp'); if (g) g.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`); }
  function fitTo(b) {
    const r = stage().getBoundingClientRect(), pad = 40;
    const k = Math.min((r.width - pad * 2) / Math.max(1, b.w), (r.height - pad * 2) / Math.max(1, b.h), 4);
    view = { k, x: (r.width - b.w * k) / 2 - b.x * k, y: (r.height - b.h * k) / 2 - b.y * k };
  }
  function wheel(e) {
    e.preventDefault();
    const r = stage().getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (e.ctrlKey || e.metaKey) {
      const f = Math.exp(-e.deltaY * 0.0022), k = Math.min(20, Math.max(0.05, view.k * f));
      view.x = sx - ((sx - view.x) * k) / view.k; view.y = sy - ((sy - view.y) * k) / view.k; view.k = k;
    } else { view.x -= e.deltaX; view.y -= e.deltaY; }
    applyView(); redraw();
  }
  function open(html, kind) {
    root.innerHTML = html; root.hidden = false; root.dataset.kind = kind || '';
    document.addEventListener('keydown', keys, true);
    const s = stage();
    s.addEventListener('wheel', wheel, { passive: false });
    s.addEventListener('pointerdown', down);
    s.addEventListener('pointermove', move);
    s.addEventListener('pointerup', up);
    s.addEventListener('pointercancel', up);
  }
  function close() {
    root.hidden = true; root.innerHTML = ''; mode = null; drag = null;
    document.removeEventListener('keydown', keys, true);
  }
  function keys(e) {
    if (root.hidden) return;
    if (!$('#modal').hidden) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '').toUpperCase());
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (fb.connect || veh.placing) { fb.connect = null; veh.placing = null; redraw(); side(); } else close(); return; }
    if (typing) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) E().redo(); else E().undo(); redraw(); side(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && mode === 'formboard') { e.preventDefault(); e.stopPropagation(); fbDelete(); }
    if (e.key === '0') { e.preventDefault(); refit(); }
  }
  function down(e) {
    const s = stage(); s.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || e.target === s || e.target.closest('[data-bg]')) {
      if (mode === 'vehicle' && veh.placing && e.button === 0) { placeMark(world(e)); return; }
      if (mode === 'formboard' && e.button === 0 && !fb.connect) { fb.sel = null; side(); redraw(); }
      drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      return;
    }
    if (mode === 'formboard') fbDown(e); else vehDown(e);
  }
  function move(e) {
    if (!drag) return;
    if (drag.pan) { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; applyView(); return; }
    if (mode === 'formboard') fbMove(e); else vehMove(e);
  }
  function up() {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.pan) { redraw(); return; }
    if (d.moved) { E().commit(); side(); }
    redraw();
  }
  function refit() { if (mode === 'formboard') fbFit(); else vehFit(); applyView(); redraw(); }
  function redraw() { if (mode === 'formboard') fbDraw(); else if (mode === 'vehicle') vehDraw(); }
  function side() { if (mode === 'formboard') fbSide(); else if (mode === 'vehicle') vehSide(); }
  function head(title, extra) {
    return `<div class="v-head"><h2>${esc(title)}</h2>${extra}<div class="grow"></div><button class="btn" data-v="fit" title="${esc(t('Fit sheet to window'))} (0)">${esc(t('Fit'))}</button><button class="btn primary" data-v="close">${esc(t('Close'))}</button></div>`;
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]'); if (!b || b.disabled) return;
    const a = b.dataset.v;
    if (a === 'close') close();
    else if (a === 'fit') refit();
    else if (mode === 'formboard') fbAction(a, b);
    else if (mode === 'vehicle') vehAction(a, b);
  });

  /* ================= Harness formboard ================= */
  const fb = { harness: null, sel: null, scale: false, connect: null, allowance: 50 };
  const P = () => E().project;
  function lay() { return L.harnessLayout(P(), fb.harness); }
  function fbData() { const d = L.formboard(P(), fb.harness); d.grommets = L.grommetFill ? L.grommetFill(P()).filter((g) => g.harness === fb.harness) : []; return d; }
  function fbPositions(data) {
    if (!fb.scale) return new Map(data.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    return L.formboardGeometry(data.layout);
  }
  function openFormboard(harness) {
    const ed = E();
    mode = 'formboard'; fb.harness = harness; fb.sel = null; fb.connect = null;
    if (!(P().harnessLayouts || {})[harness]) { ed.pushHistory(); L.harnessLayout(P(), harness); ed.commit(); }
    const hs = ed.harnesses();
    open(head(t('Harness formboard'), `<select id="fb-h" aria-label="${esc(t('Harness'))}">${hs.map((h) => `<option${h === harness ? ' selected' : ''}>${esc(h)}</option>`).join('')}</select>
      <label class="fld check" style="margin-left:8px"><input type="checkbox" id="fb-scale"${fb.scale ? ' checked' : ''}><span>${esc(t('Draw to scale'))}</span></label>
      <span class="vsep"></span><button class="btn" data-v="dxf">${esc(t('Export DXF (1:1)'))}</button><button class="btn" data-v="svg">${esc(t('Export SVG'))}</button><button class="btn" data-v="reset">${esc(t('Start layout again'))}</button>`) +
      `<div class="v-main"><div class="v-stage"><svg id="v-svg" aria-label="${esc(t('Harness formboard'))}"><g id="v-vp"></g></svg><div class="v-hint" id="v-hint"></div></div><aside class="v-side" id="v-side"></aside></div>`, 'formboard');
    $('#fb-h').onchange = (e) => openFormboard(e.target.value);
    $('#fb-scale').onchange = (e) => { fb.scale = e.target.checked; fbFit(); applyView(); redraw(); };
    requestAnimationFrame(() => { fbFit(); applyView(); redraw(); side(); });
  }
  function fbFit() {
    const data = fbData(), pos = fbPositions(data), xs = [], ys = [];
    pos.forEach((p) => { xs.push(p.x); ys.push(p.y); });
    if (!xs.length) { fitTo({ x: -200, y: -200, w: 400, h: 400 }); return; }
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    fitTo({ x: x0 - 60, y: y0 - 60, w: Math.max(...xs) - x0 + 220, h: Math.max(...ys) - y0 + 120 });
  }
  function fbDraw() {
    if (!stage()) return;
    const data = fbData(), pos = fbPositions(data), k = view.k;
    const s1 = 1 / k;
    let g = `<rect data-bg x="-100000" y="-100000" width="200000" height="200000" fill="transparent"/>`;
    data.branches.forEach((b) => {
      const a = pos.get(b.a), c = pos.get(b.b); if (!a || !c) return;
      const on = fb.sel && fb.sel.branch === b.id, w = (2.5 + Math.min(10, b.diameter * 0.5)) * s1;
      g += `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="transparent" stroke-width="${14 * s1}" data-branch="${b.id}" style="cursor:pointer"/>`;
      g += `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="${on ? ACC : b.count ? INK : '#b8bec6'}" stroke-width="${w}" stroke-linecap="round" pointer-events="none"/>`;
      const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
      let ang = (Math.atan2(c.y - a.y, c.x - a.x) * 180) / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const txt = `${b.length} mm · ${b.count}w${b.diameter ? ' · Ø' + b.diameter : ''}${b.sleeveSize ? ' · ' + b.sleeveSize : ''}`;
      g += `<text transform="translate(${mx} ${my}) rotate(${ang})" y="${-7 * s1}" text-anchor="middle" font-size="${10.5 * s1}" font-family="${MONO}" fill="${on ? ACC : MUTED}" stroke="#fff" stroke-width="${3 * s1}" paint-order="stroke" data-branch="${b.id}" style="cursor:pointer">${esc(txt)}</text>`;
    });
    data.nodes.forEach((n) => {
      const p = pos.get(n.id); if (!p) return;
      const on = fb.sel && fb.sel.node === n.id, conn = fb.connect === n.id, linked = data.layout.branches.some((b) => b.a === n.id || b.b === n.id);
      if (n.kind === 'end') {
        const w = (Math.max(40, n.label.length * 7 + 14)) * s1, h = 20 * s1;
        g += `<g data-node="${n.id}" style="cursor:${fb.scale ? 'pointer' : 'move'}"><rect x="${p.x - w / 2}" y="${p.y - h / 2}" width="${w}" height="${h}" rx="${3 * s1}" fill="${on || conn ? '#e3ecfb' : '#ffffff'}" stroke="${on || conn ? ACC : INK}" stroke-width="${1.4 * s1}"${linked ? '' : ` stroke-dasharray="${4 * s1} ${3 * s1}"`}/><text x="${p.x}" y="${p.y + 3.8 * s1}" text-anchor="middle" font-size="${11 * s1}" font-family="${MONO}" font-weight="600" fill="${INK}">${esc(n.label)}</text></g>`;
      } else if (n.kind === 'grommet') {
        const gf = (data.grommets || []).find((x) => x.node === n.id), bad = gf && (gf.status === 'too small' || gf.status === 'tight');
        g += `<g data-node="${n.id}" style="cursor:${fb.scale ? 'pointer' : 'move'}"><circle cx="${p.x}" cy="${p.y}" r="${10 * s1}" fill="${on || conn ? '#e3ecfb' : '#ffffff'}" stroke="${bad ? '#c0392b' : on || conn ? ACC : INK}" stroke-width="${3 * s1}"/><circle cx="${p.x}" cy="${p.y}" r="${4.5 * s1}" fill="${INK}"/><text x="${p.x + 13 * s1}" y="${p.y - 10 * s1}" font-size="${10 * s1}" font-family="${MONO}" fill="${bad ? '#c0392b' : INK}">${esc((n.label || t('Grommet')) + (n.hole ? ' Ø' + n.hole : '') + (gf && gf.fill != null ? ' · ' + gf.fill + '%' : ''))}</text></g>`;
      } else {
        g += `<g data-node="${n.id}" style="cursor:${fb.scale ? 'pointer' : 'move'}"><circle cx="${p.x}" cy="${p.y}" r="${6 * s1}" fill="${on || conn ? ACC : '#ffffff'}" stroke="${on || conn ? ACC : INK}" stroke-width="${1.6 * s1}"/>${n.label ? `<text x="${p.x + 9 * s1}" y="${p.y - 8 * s1}" font-size="${10.5 * s1}" font-family="${MONO}" fill="${MUTED}">${esc(n.label)}</text>` : ''}</g>`;
      }
    });
    $('#v-vp').innerHTML = g;
    const hint = $('#v-hint');
    if (hint) hint.textContent = fb.connect ? t('Click the point or connector to join it to. Esc cancels.') : fb.scale ? t('Drawn to scale from the branch lengths. Untick "Draw to scale" to rearrange.') : t('Drag points to arrange. Click a branch to set its length and sleeving. Scroll to pan, Ctrl+scroll to zoom.');
  }
  function fbDown(e) {
    const nEl = e.target.closest('[data-node]'), bEl = e.target.closest('[data-branch]');
    if (nEl) {
      const id = nEl.dataset.node;
      if (fb.connect) {
        if (id !== fb.connect) {
          const ed = E(); ed.pushHistory();
          const l = lay();
          if (!l.branches.some((b) => (b.a === fb.connect && b.b === id) || (b.b === fb.connect && b.a === id))) l.branches.push({ id: uniqId(l.branches, 'b'), a: fb.connect, b: id, length: 300, sleeve: '' });
          fb.sel = { branch: l.branches[l.branches.length - 1].id }; fb.connect = null;
          ed.commit(); side(); redraw();
        }
        return;
      }
      fb.sel = { node: id }; side(); redraw();
      if (!fb.scale) { const n = lay().nodes.find((x) => x.id === id), w = world(e); drag = { node: id, ox: n.x - w.x, oy: n.y - w.y, moved: false }; }
      return;
    }
    if (bEl) { fb.sel = { branch: bEl.dataset.branch }; side(); redraw(); }
  }
  function fbMove(e) {
    if (!drag || !drag.node) return;
    const w = world(e), n = lay().nodes.find((x) => x.id === drag.node); if (!n) return;
    if (!drag.moved) { E().pushHistory(); drag.moved = true; }
    const l = lay(), nn = l.nodes.find((x) => x.id === drag.node);
    nn.x = r10(w.x + drag.ox); nn.y = r10(w.y + drag.oy);
    fbDraw();
  }
  function uniqId(list, prefix) { let i = list.length + 1; while (list.some((x) => x.id === prefix + i)) i++; return prefix + i; }
  function fbDelete() {
    if (!fb.sel) return;
    const ed = E(), l = lay();
    if (fb.sel.branch) {
      ed.pushHistory(); l.branches = l.branches.filter((b) => b.id !== fb.sel.branch);
    } else {
      const n = l.nodes.find((x) => x.id === fb.sel.node);
      if (!n) return;
      if (n.kind === 'end') { ed.toast(t('Connector ends come from the wires in this harness. Delete a branch instead.')); return; }
      ed.pushHistory();
      const touching = l.branches.filter((b) => b.a === n.id || b.b === n.id);
      l.branches = l.branches.filter((b) => !touching.includes(b));
      if (touching.length === 2) {
        const o1 = touching[0].a === n.id ? touching[0].b : touching[0].a, o2 = touching[1].a === n.id ? touching[1].b : touching[1].a;
        l.branches.push({ id: uniqId(l.branches, 'b'), a: o1, b: o2, length: (parseFloat(touching[0].length) || 0) + (parseFloat(touching[1].length) || 0), sleeve: touching[0].sleeve || touching[1].sleeve || '' });
      }
      l.nodes = l.nodes.filter((x) => x !== n);
    }
    fb.sel = null; ed.commit(); side(); redraw();
  }
  function fbAction(a, b) {
    const ed = E();
    if (a === 'dxf') { ed.exportFile(ed.slug() + '-' + fb.harness.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-formboard.dxf', L.exportFormboardDXF(P(), fb.harness), 'application/dxf'); }
    else if (a === 'svg') { ed.exportFile(ed.slug() + '-' + fb.harness.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-formboard.svg', formboardSVG(P(), fb.harness, true), 'image/svg+xml'); }
    else if (a === 'reset') {
      ed.showModal(t('Start layout again?'), `<p>${esc(t('The points and branch lengths for this harness are replaced with a simple star from one centre point. You can undo this.'))}</p><div class="row-btns"><button class="btn danger" id="fb-reset-go">${esc(t('Start again'))}</button><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`);
      $('#fb-reset-go').onclick = () => { ed.closeModal(); ed.pushHistory(); P().harnessLayouts[fb.harness] = L.newHarnessLayout(P(), fb.harness); fb.sel = null; ed.commit(); fbFit(); applyView(); redraw(); side(); };
    }
    else if (a === 'split') {
      const l = lay(), br = l.branches.find((x) => x.id === fb.sel.branch); if (!br) return;
      ed.pushHistory();
      const na = l.nodes.find((x) => x.id === br.a), nb = l.nodes.find((x) => x.id === br.b);
      const n = { id: uniqId(l.nodes, 'n'), kind: 'point', label: '', x: r10((na.x + nb.x) / 2), y: r10((na.y + nb.y) / 2) };
      const len = parseFloat(br.length) || 0, half = r10(len / 2);
      l.nodes.push(n);
      l.branches = l.branches.filter((x) => x !== br);
      l.branches.push({ id: uniqId(l.branches, 'b'), a: br.a, b: n.id, length: half, sleeve: br.sleeve || '' });
      l.branches.push({ id: uniqId(l.branches, 'b'), a: n.id, b: br.b, length: Math.max(0, len - half), sleeve: br.sleeve || '' });
      fb.sel = { node: n.id }; ed.commit(); side(); redraw();
    }
    else if (a === 'connect') { fb.connect = fb.sel && fb.sel.node; redraw(); }
    else if (a === 'delete') fbDelete();
    else if (a === 'apply') {
      const al = parseFloat($('#fb-allow').value); fb.allowance = al >= 0 ? al : 0;
      ed.pushHistory(); const n = L.applyFormboardLengths(P(), fb.harness, fb.allowance); ed.commit(); side();
      ed.toast(`${t('Lengths copied to')} ${n} ${t('wires')}. ${t('Ctrl+Z undoes it.')}`);
    }
    else if (a === 'show') {
      const n = lay().nodes.find((x) => x.id === fb.sel.node); if (!n) return;
      const lab = n.key && n.key.startsWith('P:') ? n.key.slice(2).split(' + ')[0] : null;
      const proj = P();
      for (const s of proj.sheets) { const p = s.parts.find((x) => x.label === lab); if (p) { close(); ed.goSheet(s.id); ed.select([p.id]); ed.centre(); return; } }
      ed.toast(t('Not found on the drawings.'));
    }
  }
  function fbSide() {
    const el = $('#v-side'); if (!el) return;
    if (el.contains(document.activeElement) && document.activeElement.matches('input')) return;
    const data = fbData(), lab = (id) => (data.nodes.find((n) => n.id === id) || {}).label || t('point');
    let h = '';
    if (fb.sel && fb.sel.branch) {
      const b = data.branches.find((x) => x.id === fb.sel.branch);
      if (b) h += `<div class="sec"><h3>${esc(t('Branch'))}</h3>
        <p class="sub">${esc(lab(b.a))} → ${esc(lab(b.b))}</p>
        <label class="fld"><span>${esc(t('Length (mm)'))}</span><input type="number" min="0" step="10" data-fb="length" value="${esc(b.length)}"></label>
        <label class="fld"><span>${esc(t('Sleeving'))}</span><select data-fb="sleeve">${L.SLEEVING.map((s) => `<option value="${s.id}"${s.id === (b.sleeve || '') ? ' selected' : ''}>${esc(t(s.name))}</option>`).join('')}</select></label>
        <div class="kv"><span>${esc(t('Wires'))}</span><b>${b.count}</b><span>${esc(t('Bundle diameter'))}</span><b>${b.diameter} mm</b>${b.sleeveSize ? `<span>${esc(t('Sleeve size'))}</span><b>${esc(b.sleeveSize)}</b>` : ''}</div>
        ${b.wires.length ? `<div class="chips">${b.wires.map((w) => `<span class="chip">${esc(w)}</span>`).join('')}</div>` : ''}
        <div class="row-btns"><button class="btn" data-v="split">${esc(t('Add a breakout point here'))}</button><button class="btn danger" data-v="delete">${esc(t('Delete branch'))}</button></div></div>`;
    } else if (fb.sel && fb.sel.node) {
      const n = data.nodes.find((x) => x.id === fb.sel.node);
      const gf = n && (data.grommets || []).find((x) => x.node === n.id);
      if (n) h += `<div class="sec"><h3>${esc(n.kind === 'end' ? t('Connector end') : n.kind === 'grommet' ? t('Grommet or bulkhead hole') : t('Breakout point'))}</h3>
        ${n.kind === 'end' ? `<p class="sub">${esc(n.label)}</p>` : `<label class="fld"><span>${esc(t('Name'))}</span><input data-fb="label" value="${esc(n.label || '')}" placeholder="${esc(t('e.g. Bulkhead grommet'))}"></label>
        <label class="fld"><span>${esc(t('Type'))}</span><select data-fb="kind"><option value="point"${n.kind === 'point' ? ' selected' : ''}>${esc(t('Breakout point'))}</option><option value="grommet"${n.kind === 'grommet' ? ' selected' : ''}>${esc(t('Grommet or bulkhead hole'))}</option></select></label>`}
        ${n.kind === 'grommet' ? `<label class="fld"><span>${esc(t('Hole (mm)'))}</span><input type="number" min="0" step="0.5" data-fb="hole" value="${esc(n.hole || '')}" placeholder="${esc(t('inside diameter'))}"></label>
        ${gf ? `<div class="kv"><span>${esc(t('Wires through'))}</span><b>${gf.wires.length}</b><span>${esc(t('Bundle diameter'))}</span><b>${gf.diameter} mm</b>${gf.fill != null ? `<span>${esc(t('Fill'))}</span><b>${gf.fill}%</b>` : ''}</div>${gf.status === 'too small' ? `<div class="callout warn">${esc(t('The bundle will not fit through this hole.'))}</div>` : gf.status === 'tight' ? `<div class="callout warn">${esc(t('Tight: keep the bundle under 80% of the hole for sleeving and a spare wire.'))}</div>` : ''}` : ''}` : ''}
        <div class="kv"><span>${esc(t('Branches'))}</span><b>${data.layout.branches.filter((b) => b.a === n.id || b.b === n.id).length}</b></div>
        <div class="row-btns"><button class="btn" data-v="connect">${esc(t('Join to another point…'))}</button>${n.kind === 'end' ? `<button class="btn" data-v="show">${esc(t('Show on drawing'))}</button>` : `<button class="btn danger" data-v="delete">${esc(t('Delete point'))}</button>`}</div></div>`;
    }
    const routed = data.wires.filter((w) => w.routed).length;
    const amb = L.harnessAmbient ? L.harnessAmbient(P(), fb.harness) : null, hot = L.derating ? L.derating(P()).filter((x) => x.harness === fb.harness && x.status !== 'ok') : [];
    if (amb != null) h += `<div class="sec"><h3>${esc(t('Heat'))}</h3><label class="fld"><span>${esc(t('Air around this harness (°C)'))}</span><input type="number" step="5" data-fb="ambient" value="${esc(((P().settings.harnessTemps || {})[fb.harness]) ?? '')}" placeholder="${amb}"></label>
      ${hot.length ? `<div class="callout warn">${hot.map((x) => esc(x.fT === 0 ? `${x.name}: its insulation (${x.tmax} °C${x.assumed ? ', assumed' : ''}) is not rated for ${x.ambient} °C.` : `${x.name}: ${x.current} A, good for about ${x.capacity} A here${x.suggest ? ', use ' + x.suggest + ' mm²' : ''}.`)).join('<br>')}</div>` : `<p class="muted" style="margin:0;font-size:11.5px">${esc(t('Wire ratings are reduced for the heat and for loaded wires bundled together. Engine bay harnesses default to 80 °C.'))}</p>`}</div>`;
    h += `<div class="sec"><h3>${esc(fb.harness)}</h3><div class="kv"><span>${esc(t('Connector ends'))}</span><b>${data.ends.length}</b><span>${esc(t('Branches'))}</span><b>${data.branches.length}</b><span>${esc(t('Trunk and branches'))}</span><b>${data.total} m</b><span>${esc(t('Wires routed'))}</span><b>${routed} / ${data.wires.length}</b></div>
      ${routed < data.wires.length ? `<div class="callout warn">${esc(t('Some wires have no path between their ends. Join their connector ends to the layout.'))}</div>` : ''}</div>`;
    h += `<div class="sec"><h3>${esc(t('Wire lengths'))}</h3><div style="overflow:auto;max-height:260px"><table class="data compact"><thead><tr><th>${esc(t('Wire'))}</th><th>${esc(t('Ends'))}</th><th>${esc(t('Routed m'))}</th><th>${esc(t('Now m'))}</th></tr></thead><tbody>${data.wires.map((w) => `<tr><td class="mono">${esc(w.name)}</td><td class="mono wrap">${esc((w.from || '') + ' – ' + (w.to || ''))}</td><td class="mono">${w.routed ? w.metres : `<span class="lvl warn">${esc(t('no path'))}</span>`}</td><td class="mono">${w.was == null ? '' : w.was}</td></tr>`).join('')}</tbody></table></div>
      <label class="fld"><span>${esc(t('Extra per end (mm)'))}</span><input id="fb-allow" type="number" min="0" step="10" value="${fb.allowance}"></label>
      <div class="row-btns"><button class="btn primary" data-v="apply">${esc(t('Copy routed lengths to the wires'))}</button></div>
      <p class="muted" style="margin:0;font-size:11.5px">${esc(t('Each wire gets the length of its path along the branches, plus the extra at both ends for terminating. The cut list then adds its own cutting allowance.'))}</p></div>`;
    el.innerHTML = h;
  }
  root.addEventListener('change', (e) => {
    const k = e.target.dataset && e.target.dataset.fb; if (!k || mode !== 'formboard') return;
    const ed = E(), l = lay(); ed.pushHistory();
    if (k === 'label') { const n = l.nodes.find((x) => x.id === fb.sel.node); if (n) n.label = e.target.value.trim(); }
    else if (k === 'kind' || k === 'hole') { const n = l.nodes.find((x) => x.id === fb.sel.node); if (n && n.kind !== 'end') { if (k === 'kind') n.kind = e.target.value === 'grommet' ? 'grommet' : 'point'; else { const v = parseFloat(e.target.value); if (v > 0) n.hole = v; else delete n.hole; } } }
    else if (k === 'ambient') { const pr = P(); pr.settings.harnessTemps = pr.settings.harnessTemps || {}; const v = parseFloat(e.target.value); if (isNaN(v)) delete pr.settings.harnessTemps[fb.harness]; else pr.settings.harnessTemps[fb.harness] = v; }
    else { const b = l.branches.find((x) => x.id === fb.sel.branch); if (b) b[k] = k === 'length' ? Math.max(0, parseFloat(e.target.value) || 0) : e.target.value; }
    e.target.blur(); ed.commit(); side(); redraw();
  });
  /* The formboard drawn to scale, for the build pack and SVG export. */
  function formboardSVG(project, harness, standalone) {
    const data = L.formboard(project, harness), pos = L.formboardGeometry(data.layout);
    const xs = [], ys = []; pos.forEach((p) => { xs.push(p.x); ys.push(p.y); });
    if (!xs.length) return '';
    const x0 = Math.min(...xs) - 120, y0 = Math.min(...ys) - 80, W = Math.max(...xs) - x0 + 160, H = Math.max(...ys) - y0 + 80;
    const u = Math.max(W, H) / 900; // text and stroke size in drawing units
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${W} ${H}"${standalone ? ` width="${Math.round(W)}mm" height="${Math.round(H)}mm"` : ''} font-family="${MONO}"><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#fff"/>`;
    data.branches.forEach((b) => {
      const a = pos.get(b.a), c = pos.get(b.b); if (!a || !c) return;
      s += `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="${INK}" stroke-width="${(2 + Math.min(8, b.diameter * 0.4)) * u}" stroke-linecap="round"/>`;
      let ang = (Math.atan2(c.y - a.y, c.x - a.x) * 180) / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      s += `<text transform="translate(${(a.x + c.x) / 2} ${(a.y + c.y) / 2}) rotate(${ang})" y="${-6 * u}" text-anchor="middle" font-size="${10 * u}" fill="${INK}">${esc(`${b.length} mm · ${b.count}w${b.diameter ? ' · Ø' + b.diameter : ''}${b.sleeveSize ? ' · ' + b.sleeveSize : ''}`)}</text>`;
    });
    data.nodes.forEach((n) => {
      const p = pos.get(n.id); if (!p) return;
      if (n.kind === 'end') { const w = (n.label.length * 7 + 14) * u, h = 18 * u; s += `<rect x="${p.x - w / 2}" y="${p.y - h / 2}" width="${w}" height="${h}" fill="#fff" stroke="${INK}" stroke-width="${1.2 * u}"/><text x="${p.x}" y="${p.y + 3.6 * u}" text-anchor="middle" font-size="${10.5 * u}" font-weight="600" fill="${INK}">${esc(n.label)}</text>`; }
      else if (n.kind === 'grommet') s += `<circle cx="${p.x}" cy="${p.y}" r="${9 * u}" fill="#fff" stroke="${INK}" stroke-width="${2.6 * u}"/><circle cx="${p.x}" cy="${p.y}" r="${4 * u}" fill="${INK}"/><text x="${p.x + 12 * u}" y="${p.y - 9 * u}" font-size="${9.5 * u}" fill="${INK}">${esc((n.label || 'Grommet') + (n.hole ? ' Ø' + n.hole + ' mm' : ''))}</text>`;
      else s += `<circle cx="${p.x}" cy="${p.y}" r="${5 * u}" fill="#fff" stroke="${INK}" stroke-width="${1.4 * u}"/>${n.label ? `<text x="${p.x + 8 * u}" y="${p.y - 7 * u}" font-size="${9.5 * u}" fill="${INK}">${esc(n.label)}</text>` : ''}`;
    });
    s += `<text x="${x0 + 20 * u}" y="${y0 + 24 * u}" font-size="${13 * u}" font-weight="600" fill="${INK}">${esc(project.title)}: ${esc(harness)}</text><text x="${x0 + 20 * u}" y="${y0 + 40 * u}" font-size="${9.5 * u}" fill="${INK}">${esc(t('Lengths in mm along each branch. Bundle Ø is an estimate.'))}</text>`;
    return s + '</svg>';
  }

  /* ================= Vehicle location view ================= */
  // Marks are stored in a 1000 x 500 box that the picture (or the outline) fills.
  const VW = 1000, VH = 500;
  const veh = { placing: null, sel: null };
  function vehicle() { const p = P(); return p.vehicle || { image: '', marks: {} }; }
  function ensureVehicle() { const p = P(); if (!p.vehicle) p.vehicle = { image: '', marks: {} }; if (!p.vehicle.marks) p.vehicle.marks = {}; return p.vehicle; }
  function outlineSVG() {
    // A generic boxy four-wheel-drive seen from above, front to the left.
    return `<g fill="none" stroke="#9aa3ab" stroke-width="2.5" stroke-linejoin="round">
      <rect x="110" y="95" width="800" height="310" rx="34"/>
      <rect x="90" y="120" width="26" height="260" rx="8"/>
      <rect x="160" y="62" width="120" height="34" rx="8"/><rect x="160" y="404" width="120" height="34" rx="8"/>
      <rect x="690" y="62" width="120" height="34" rx="8"/><rect x="690" y="404" width="120" height="34" rx="8"/>
      <path d="M330 105 V395"/><path d="M372 112 Q 360 250 372 388"/><path d="M372 112 H 540 M372 388 H 540"/><path d="M540 105 V395"/><path d="M880 120 V380"/>
      <path d="M118 160 H 320 M118 340 H 320" stroke-dasharray="6 6"/>
    </g>
    <g font-family="${MONO}" font-size="15" fill="#9aa3ab" text-anchor="middle">
      <text x="220" y="255">${esc(t('Engine bay'))}</text><text x="455" y="255">${esc(t('Cab'))}</text><text x="710" y="255">${esc(t('Rear'))}</text>
      <text x="56" y="255" transform="rotate(-90 56 255)">${esc(t('Front'))}</text>
    </g>`;
  }
  function vehBackground(v) {
    return v.image ? `<image href="${esc(v.image)}" x="0" y="0" width="${VW}" height="${VH}" preserveAspectRatio="xMidYMid meet"/>` : outlineSVG();
  }
  function marksSVG(v, list, s1, o = {}) {
    let g = '';
    list.forEach((x) => {
      const m = v.marks[x.key]; if (!m) return;
      const on = veh.sel === x.key && !o.static;
      const w = (x.ref.length * 7.2 + 12) * s1, h = 17 * s1;
      g += `<g${o.static ? '' : ` data-mark="${esc(x.key)}" style="cursor:move"`}><circle cx="${m.x}" cy="${m.y}" r="${4.5 * s1}" fill="${on ? ACC : '#c42b2b'}" stroke="#fff" stroke-width="${1.5 * s1}"/>
        <rect x="${m.x + 7 * s1}" y="${m.y - h / 2}" width="${w}" height="${h}" rx="${3 * s1}" fill="${on ? ACC : '#ffffff'}" stroke="${on ? ACC : INK}" stroke-width="${1 * s1}" opacity=".95"/>
        <text x="${m.x + 13 * s1}" y="${m.y + 3.8 * s1}" font-size="${11 * s1}" font-family="${MONO}" font-weight="600" fill="${on ? '#fff' : INK}">${esc(x.ref)}</text></g>`;
    });
    return g;
  }
  function openVehicle() {
    mode = 'vehicle'; veh.placing = null; veh.sel = null;
    open(head(t('Component locations'), `<span class="vsep"></span><button class="btn" data-v="pic">${esc(t('Use a picture…'))}</button><button class="btn" data-v="nopic"${vehicle().image ? '' : ' disabled'}>${esc(t('Use the plain outline'))}</button><button class="btn" data-v="vsvg">${esc(t('Export SVG'))}</button><button class="btn" data-v="vpng">${esc(t('Export PNG'))}</button>`) +
      `<div class="v-main"><div class="v-stage"><svg id="v-svg" aria-label="${esc(t('Vehicle view'))}"><g id="v-vp"></g></svg><div class="v-hint" id="v-hint"></div></div><aside class="v-side" id="v-side"></aside></div>`, 'vehicle');
    requestAnimationFrame(() => { vehFit(); applyView(); redraw(); side(); });
  }
  function vehFit() { fitTo({ x: 0, y: 0, w: VW, h: VH }); }
  function vehDraw() {
    if (!stage()) return;
    const v = vehicle(), list = L.locations(P());
    $('#v-vp').innerHTML = `<rect data-bg x="-5000" y="-5000" width="11000" height="11000" fill="transparent"/><g data-bg>${vehBackground(v)}</g>` + marksSVG(v, list, 1 / view.k);
    const hint = $('#v-hint');
    if (hint) hint.textContent = veh.placing ? `${t('Click where')} ${veh.placing.ref} ${t('sits. Esc cancels.')}` : t('Pick Place next to a part, then click on the vehicle. Drag a marker to move it.');
    stage().style.cursor = veh.placing ? 'crosshair' : '';
  }
  function placeMark(w) {
    const ed = E(); ed.pushHistory();
    const v = ensureVehicle();
    v.marks[veh.placing.key] = { x: Math.round(w.x), y: Math.round(w.y) };
    veh.sel = veh.placing.key; veh.placing = null;
    ed.commit(); vehDraw(); vehSide();
  }
  function vehDown(e) {
    const m = e.target.closest('[data-mark]');
    if (!m) return;
    const key = m.dataset.mark, mk = vehicle().marks[key], w = world(e);
    veh.sel = key; vehSide(); vehDraw();
    drag = { mark: key, ox: mk.x - w.x, oy: mk.y - w.y, moved: false };
  }
  function vehMove(e) {
    if (!drag || !drag.mark) return;
    if (!drag.moved) { E().pushHistory(); drag.moved = true; }
    const w = world(e), v = ensureVehicle();
    v.marks[drag.mark] = { x: Math.round(w.x + drag.ox), y: Math.round(w.y + drag.oy) };
    vehDraw();
  }
  function vehSide() {
    const el = $('#v-side'); if (!el) return;
    if (el.contains(document.activeElement) && document.activeElement.matches('input')) return;
    const list = L.locations(P()), placed = list.filter((x) => x.marked).length;
    el.innerHTML = `<div class="sec"><h3>${esc(t('Where each part is fitted'))}</h3>
      <p class="muted" style="margin:0">${esc(t('Type where each part lives (the build pack lists it), and place it on the vehicle. Use a photo or drawing of your vehicle from above, or the plain outline.'))}</p>
      <div class="kv"><span>${esc(t('Parts'))}</span><b>${list.length}</b><span>${esc(t('Placed on the vehicle'))}</span><b>${placed}</b></div></div>
      <div class="sec"><div class="list">${list.map((x) => `<div class="list-row${veh.sel === x.key ? ' on' : ''}${x.marked ? ' done' : ''}" data-key="${esc(x.key)}">
        <b class="mono" style="min-width:48px">${esc(x.ref)}</b><input data-loc="${esc(x.key)}" value="${esc(x.location)}" placeholder="${esc(x.type)}" aria-label="${esc(t('Location'))} ${esc(x.ref)}" list="v-locs">
        <button class="btn sm" data-place="${esc(x.key)}">${esc(x.marked ? t('Move') : t('Place'))}</button>${x.marked ? `<button class="iconbtn sm" data-unmark="${esc(x.key)}" title="${esc(t('Remove marker'))}" aria-label="${esc(t('Remove marker'))}"><svg class="i"><use href="#i-x"/></svg></button>` : ''}</div>`).join('')}</div>
      <datalist id="v-locs">${[...new Set(list.map((x) => x.location).filter(Boolean))].map((l) => `<option value="${esc(l)}">`).join('')}</datalist></div>`;
  }
  root.addEventListener('click', (e) => {
    if (mode !== 'vehicle') return;
    const pl = e.target.closest('[data-place]');
    if (pl) { const x = L.locations(P()).find((y) => y.key === pl.dataset.place); veh.placing = x; veh.sel = x.key; vehDraw(); vehSide(); return; }
    const um = e.target.closest('[data-unmark]');
    if (um) { const ed = E(); ed.pushHistory(); delete ensureVehicle().marks[um.dataset.unmark]; ed.commit(); vehDraw(); vehSide(); return; }
    const row = e.target.closest('.list-row[data-key]');
    if (row && !e.target.closest('input,button')) { veh.sel = row.dataset.key; vehDraw(); vehSide(); }
  });
  root.addEventListener('change', (e) => {
    const k = e.target.dataset && e.target.dataset.loc; if (k == null || mode !== 'vehicle') return;
    const ed = E(); ed.pushHistory();
    const v = e.target.value.trim();
    P().sheets.forEach((s) => s.parts.forEach((p) => { if (L.partKey(p) === k) { if (v) p.location = v; else delete p.location; } }));
    ed.commit(); vehSide();
  });
  function shrinkImage(url, max = 1600) {
    return new Promise((resolve) => {
      if (/^data:image\/svg/.test(url)) { resolve(url); return; }
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(url);
      img.src = url;
    });
  }
  async function vehAction(a) {
    const ed = E();
    if (a === 'pic') {
      const r = await ed.pickImage(); if (!r) return;
      const url = await shrinkImage(r.url);
      ed.pushHistory(); ensureVehicle().image = url; ed.commit();
      $('[data-v="nopic"]').disabled = false; vehDraw();
      ed.toast(t('Picture added. It is saved inside the project file.'));
    } else if (a === 'nopic') {
      ed.pushHistory(); ensureVehicle().image = ''; ed.commit(); $('[data-v="nopic"]').disabled = true; vehDraw();
    } else if (a === 'vsvg') {
      await ed.exportFile(ed.slug() + '-locations.svg', vehicleSVG(P(), true), 'image/svg+xml');
    } else if (a === 'vpng') {
      try { const bytes = await ed.svgToPng(vehicleSVG(P(), true), 2); await ed.exportFile(ed.slug() + '-locations.png', bytes, 'image/png'); } catch (e2) { ed.toast(e2.message); }
    }
  }
  /* The vehicle with its markers, for the build pack and export. */
  function vehicleSVG(project, standalone) {
    const v = project.vehicle || { image: '', marks: {} }, list = L.locations(project);
    if (!list.some((x) => x.marked)) return '';
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${VW} ${VH}"${standalone ? ` width="${VW}" height="${VH}"` : ''}><rect width="${VW}" height="${VH}" fill="#fff"/>${vehBackground(v)}${marksSVG(v, list, 1, { static: true })}</svg>`;
  }

  window.LoomViews = { openFormboard, openVehicle, formboardSVG: (p, h) => formboardSVG(p, h, false), vehicleSVG: (p) => vehicleSVG(p, false), close };
})();
