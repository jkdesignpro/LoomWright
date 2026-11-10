/*
 * LoomWright build outputs: connector tables, cut lists, wire labels,
 * harness formboards, component locations and the one-file build pack.
 * Extends window.Loom; needs loom-core.js, loom-data.js and loom-nets.js first.
 *
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./loom-data.js'); require('./loom-nets.js'); module.exports = factory(require('./loom-core.js')); }
  else factory(root.Loom);
})(typeof self !== 'undefined' ? self : this, function (Loom) {
  'use strict';
  const esc = Loom.esc;
  const projectOf = (d) => (d && d.project) || d;
  const termName = (id) => { const t = Loom.TERMINALS.find((x) => x.id === id); return t && t.id ? t.name : ''; };
  const CONNECTOR_TYPES = ['conn', 'connector', 'plug'];
  const METHODS = [['', 'Not set'], ['crimp', 'Crimp'], ['crimp_solder', 'Crimp and solder'], ['solder', 'Solder'], ['screw', 'Screw terminal'], ['ferrule', 'Ferrule']];
  const SEALS = [['', 'None / not set'], ['seal', 'Wire seal'], ['plug', 'Cavity plug'], ['gel', 'Gel / grease']];

  /* Every wire in the project with its sheet view. */
  function allWires(project) { return Loom.views(project).flatMap((v) => v.wires.map((w) => ({ v, w }))); }

  /* ---------------- Connector tables ---------------- */
  function connectorTables(d) {
    const project = projectOf(d), out = [];
    Loom.views(project).forEach((v) => v.parts.forEach((p) => {
      const def = Loom.partDef(v, p.type) || {};
      if (!CONNECTOR_TYPES.includes(p.type) && !(def.custom && /conn|plug|socket/i.test(def.name || ''))) return;
      const r = Loom.resolved(v, p), pr = r.props || {};
      const series = p.type === 'conn' ? Loom.seriesById(pr.series) : null;
      const rec = pr.gender === 'receptacle';
      const defTerm = series ? (rec ? series.pin : series.socket) : '';
      const rows = r.pins.map((pn) => {
        const ws = v.wires.filter((w) => (w.from.part === p.id && w.from.pin === pn.id) || (w.to.part === p.id && w.to.pin === pn.id)).map((w) => {
          const end = w.from.part === p.id && w.from.pin === pn.id ? 'from' : 'to', other = end === 'from' ? w.to : w.from;
          const e = (w.ends || {})[end] || {};
          return { id: w.id, name: w.name, code: Loom.wireCode(v, w), colour: Loom.wireColourName(v, w), gauge: w.gauge, circuit: w.circuit || '', to: Loom.pinName(v, other), term: e.term || defTerm, termName: termName(e.term || defTerm), seal: e.seal || (series && series.sealed ? 'seal' : ''), method: e.method || '' };
        });
        return { cavity: pn.id, name: pn.n || pn.id, wires: ws };
      });
      const used = rows.filter((x) => x.wires.length).length;
      out.push({
        sheet: v.sheet.name, sheetId: v.sheet.id, part: p.id, ref: p.label || def.name, type: def.name, series: series ? series.name : '', sealed: !!(series && series.sealed),
        housing: p.mpn || pr.mpnShown || pr.part || '', gender: p.type === 'conn' ? (rec ? 'Receptacle (pins)' : 'Plug (sockets)') : '', mate: pr.mate || '',
        lock: series && series.lock ? series.lock(Loom.nearestWays(series, pr.ways), pr.gender) : '', terminal: termName(defTerm),
        rows, ways: rows.length, used, unused: rows.length - used, cavityPlugs: series && series.sealed ? rows.length - used : 0, plugName: series ? series.plug || '' : '', rating: series ? series.rating : '',
      });
    }));
    return out;
  }

  /* ---------------- Cut list ---------------- */
  function cutList(d) {
    const project = projectOf(d), allow = parseFloat(project.settings.cutAllowance);
    const extra = allow >= 0 ? allow : 0.15;
    const groups = new Map();
    allWires(project).forEach(({ v, w }) => {
      const h = w.harness || 'No harness';
      if (!groups.has(h)) groups.set(h, { harness: h, rows: [], metres: 0, cut: 0, missing: 0 });
      const g = groups.get(h), len = parseFloat(w.length), ends = w.ends || {};
      const end = (k) => { const e = ends[k] || {}; return { term: e.term || '', termName: termName(e.term), method: e.method || '', strip: e.strip || '', shrink: e.shrink || '', seal: e.seal || '' }; };
      const cab = w.cable && (project.cables || []).find((c) => c.id === w.cable);
      const row = { id: w.id, sheet: v.sheet.name, sheetId: v.sheet.id, name: w.name, from: Loom.pinName(v, w.from), to: Loom.pinName(v, w.to), code: Loom.wireCode(v, w), colour: Loom.wireColourName(v, w), gauge: w.gauge, insulation: w.insulation || '', length: len > 0 ? len : null, cut: len > 0 ? +(len + extra).toFixed(2) : null, a: end('from'), b: end('to'), circuit: w.circuit || '', cable: cab ? cab.name : '' };
      g.rows.push(row);
      if (len > 0) { g.metres += len; g.cut += len + extra; } else g.missing++;
    });
    return [...groups.values()].map((g) => ({ ...g, metres: +g.metres.toFixed(2), cut: +g.cut.toFixed(2), rows: g.rows.sort((a, b) => parseFloat(b.gauge) - parseFloat(a.gauge) || a.code.localeCompare(b.code) || a.name.localeCompare(b.name, undefined, { numeric: true })) }))
      .sort((a, b) => (a.harness === 'No harness') - (b.harness === 'No harness') || a.harness.localeCompare(b.harness));
  }

  /* ---------------- Wire labels ---------------- */
  // One label per wire end: the wire number, then where this end and the other end go.
  function wireLabels(d, o = {}) {
    const project = projectOf(d), out = [];
    allWires(project).forEach(({ v, w }) => {
      const a = Loom.pinName(v, w.from), b = Loom.pinName(v, w.to), code = Loom.wireCode(v, w);
      if (o.single) out.push({ wire: w.name, line1: w.name, line2: `${a} ↔ ${b}`, code, harness: w.harness || '', sheet: v.sheet.name });
      else {
        out.push({ wire: w.name, end: 'A', line1: w.name, line2: `${a} → ${b}`, code, harness: w.harness || '', sheet: v.sheet.name });
        out.push({ wire: w.name, end: 'B', line1: w.name, line2: `${b} → ${a}`, code, harness: w.harness || '', sheet: v.sheet.name });
      }
    });
    return out.sort((x, y) => x.wire.localeCompare(y.wire, undefined, { numeric: true }));
  }

  /* ---------------- Cables (multicore, twisted, screened) ---------------- */
  const CABLE_TYPES = [['single', 'Single cores'], ['multicore', 'Multicore (sheathed)'], ['twisted', 'Twisted pair'], ['screened', 'Screened / shielded'], ['twisted_screened', 'Twisted and screened']];
  function cableReport(d) {
    const project = projectOf(d), ws = allWires(project);
    return (project.cables || []).map((c) => {
      const cores = ws.filter((x) => x.w.cable === c.id);
      const lens = cores.map((x) => parseFloat(x.w.length)).filter((x) => x > 0);
      return { ...c, typeName: (CABLE_TYPES.find((t) => t[0] === c.type) || [0, c.type])[1], used: cores.length, wires: cores.map((x) => x.w.name), length: lens.length ? Math.max(...lens) : null, spare: c.cores ? Math.max(0, c.cores - cores.length) : null };
    });
  }

  /* ---------------- Harness formboard ---------------- */
  // Each harness has a layout of nodes (connector ends and breakout points) joined by branches.
  // Wires are routed along branches between their two end nodes, giving lengths and bundle sizes.
  function endKey(v, part) {
    if (!part) return null;
    const pr = part.props || {};
    if (part.type === 'offpage' && pr.link) return 'N:' + String(pr.link).trim().toUpperCase();
    if (part.type === 'net_label' && pr.text) return 'N:' + String(pr.text).trim().toUpperCase();
    if (part.type === 'conn' && pr.mate && part.label) return 'P:' + [part.label, String(pr.mate).trim()].sort().join(' + ');
    return part.label ? 'P:' + part.label : `S:${v.sheet.id}:${part.id}`;
  }
  function harnessEnds(project, harness) {
    const ends = new Map();
    allWires(project).forEach(({ v, w }) => {
      if ((w.harness || '') !== harness) return;
      [w.from, w.to].forEach((e) => {
        const p = v.parts.find((x) => x.id === e.part); const k = endKey(v, p);
        if (!k) return;
        if (!ends.has(k)) ends.set(k, { key: k, label: k.startsWith('P:') ? k.slice(2) : k.startsWith('N:') ? k.slice(2) + ' (link)' : (p.label || (Loom.partDef(v, p.type) || {}).name || p.type), wires: [] });
        ends.get(k).wires.push(w.id);
      });
    });
    return ends;
  }
  function newLayout(project, harness) {
    const ends = [...harnessEnds(project, harness).values()];
    const centre = { id: 'n0', kind: 'point', x: 0, y: 0, label: '' };
    const nodes = [centre], branches = [];
    ends.forEach((e, i) => {
      const a = (i / Math.max(1, ends.length)) * Math.PI * 2 - Math.PI / 2, rr = 220;
      const n = { id: 'n' + (i + 1), kind: 'end', key: e.key, label: e.label, x: Math.round(Math.cos(a) * rr / 10) * 10, y: Math.round(Math.sin(a) * rr / 10) * 10 };
      nodes.push(n);
      branches.push({ id: 'b' + (i + 1), a: 'n0', b: n.id, length: 500, sleeve: '' });
    });
    return { nodes, branches };
  }
  /* The stored layout for a harness, brought up to date with the wires (new ends added, gone ends removed). */
  function harnessLayout(d, harness, create = true) {
    const project = projectOf(d);
    project.harnessLayouts = project.harnessLayouts || {};
    let lay = project.harnessLayouts[harness];
    if (!lay) { if (!create) return null; lay = project.harnessLayouts[harness] = newLayout(project, harness); return lay; }
    const ends = harnessEnds(project, harness);
    lay.nodes.filter((n) => n.kind === 'end' && !ends.has(n.key)).forEach((n) => {
      lay.branches = lay.branches.filter((b) => b.a !== n.id && b.b !== n.id);
      lay.nodes = lay.nodes.filter((x) => x !== n);
    });
    const hub = lay.nodes.find((n) => n.kind === 'point') || lay.nodes[0];
    let k = lay.nodes.length;
    ends.forEach((e) => {
      const ex = lay.nodes.find((n) => n.key === e.key);
      if (ex) { ex.label = e.label; return; }
      const n = { id: uniq(lay.nodes, 'n'), kind: 'end', key: e.key, label: e.label, x: (hub ? hub.x : 0) + 160, y: (hub ? hub.y : 0) + 40 * (k++ % 8) - 140 };
      lay.nodes.push(n);
      if (hub) lay.branches.push({ id: uniq(lay.branches, 'b'), a: hub.id, b: n.id, length: 500, sleeve: '' });
    });
    return lay;
  }
  function uniq(list, prefix) { let i = list.length + 1; while (list.some((x) => x.id === prefix + i)) i++; return prefix + i; }
  function routeBetween(lay, from, to) {
    if (from === to) return [];
    const adj = new Map();
    lay.branches.forEach((b) => { [[b.a, b.b], [b.b, b.a]].forEach(([x, y]) => { if (!adj.has(x)) adj.set(x, []); adj.get(x).push({ to: y, b }); }); });
    const prev = new Map([[from, null]]), q = [from];
    while (q.length) {
      const x = q.shift();
      if (x === to) break;
      (adj.get(x) || []).forEach((e) => { if (!prev.has(e.to)) { prev.set(e.to, { from: x, b: e.b }); q.push(e.to); } });
    }
    if (!prev.has(to)) return null;
    const path = []; let c = to;
    while (prev.get(c)) { path.unshift(prev.get(c).b); c = prev.get(c).from; }
    return path;
  }
  /* Routes, lengths and bundle sizes for one harness. */
  function formboard(d, harness) {
    const project = projectOf(d), lay = harnessLayout(project, harness), ends = harnessEnds(project, harness);
    const nodeOf = (key) => lay.nodes.find((n) => n.key === key);
    const wires = [], through = new Map(lay.branches.map((b) => [b.id, []]));
    allWires(project).forEach(({ v, w }) => {
      if ((w.harness || '') !== harness) return;
      const ka = endKey(v, v.parts.find((x) => x.id === w.from.part)), kb = endKey(v, v.parts.find((x) => x.id === w.to.part));
      const na = nodeOf(ka), nb = nodeOf(kb);
      const route = na && nb ? routeBetween(lay, na.id, nb.id) : null;
      const mm = route ? route.reduce((a, b) => a + (parseFloat(b.length) || 0), 0) : null;
      if (route) route.forEach((b) => through.get(b.id).push(w));
      wires.push({ id: w.id, name: w.name, code: Loom.wireCode(v, w), gauge: w.gauge, from: na && na.label, to: nb && nb.label, routed: !!route, mm, metres: mm != null ? +(mm / 1000).toFixed(2) : null, was: parseFloat(w.length) || null });
    });
    const branches = lay.branches.map((b) => {
      const ws = through.get(b.id), dia = Loom.bundleDiameter(ws);
      return { ...b, wires: ws.map((w) => w.name), count: ws.length, diameter: +dia.toFixed(1), sleeveSize: b.sleeve ? Loom.suggestSleeve(b.sleeve, dia) : '' };
    });
    return { harness, layout: lay, nodes: lay.nodes, branches, wires, ends: [...ends.values()], total: +(lay.branches.reduce((a, b) => a + (parseFloat(b.length) || 0), 0) / 1000).toFixed(2) };
  }
  /* Copy the routed lengths onto the wires (plus an allowance at each end for termination). */
  function applyFormboardLengths(d, harness, endAllowanceMm = 0) {
    const project = projectOf(d), fb = formboard(project, harness);
    let n = 0;
    fb.wires.forEach((x) => {
      if (x.mm == null) return;
      allWires(project).forEach(({ w }) => { if (w.id === x.id) { w.length = +((x.mm + 2 * endAllowanceMm) / 1000).toFixed(2); n++; } });
    });
    return n;
  }
  /* Positions in millimetres, with every branch drawn at its true length in the direction it was laid out. */
  function formboardGeometry(lay) {
    const pos = new Map(), adj = new Map();
    lay.branches.forEach((b) => { [[b.a, b.b], [b.b, b.a]].forEach(([x, y]) => { if (!adj.has(x)) adj.set(x, []); adj.get(x).push({ to: y, b }); }); });
    const byId = new Map(lay.nodes.map((n) => [n.id, n]));
    lay.nodes.forEach((start) => {
      if (pos.has(start.id)) return;
      pos.set(start.id, { x: start.x, y: start.y });
      const q = [start.id];
      while (q.length) {
        const x = q.shift(), px = pos.get(x), nx = byId.get(x);
        (adj.get(x) || []).forEach((e) => {
          if (pos.has(e.to)) return;
          const ny = byId.get(e.to); let dx = ny.x - nx.x, dy = ny.y - nx.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          const len = parseFloat(e.b.length) || 0;
          pos.set(e.to, { x: px.x + dx * len, y: px.y + dy * len }); q.push(e.to);
        });
      }
    });
    return pos;
  }

  /* ---------------- Component locations ---------------- */
  function locations(d) {
    const project = projectOf(d), marks = (project.vehicle && project.vehicle.marks) || {}, out = [], seen = new Set();
    Loom.views(project).forEach((v) => v.parts.forEach((p) => {
      const def = Loom.partDef(v, p.type) || {};
      if (def.cat === 'Annotation' || def.noLabel || !p.label) return;
      const k = Loom.partKey ? Loom.partKey(p) : p.id;
      if (seen.has(k)) return; seen.add(k);
      out.push({ ref: p.label, key: k, type: def.name || p.type, location: p.location || '', sheet: v.sheet.name, sheetId: v.sheet.id, part: p.id, marked: !!marks[k], mark: marks[k] || null });
    }));
    return out;
  }

  /* ---------------- Costed BOM ---------------- */
  function costedBom(d) {
    const project = projectOf(d), parts = Loom.bom(project), cable = Loom.cableTotals(project);
    const partsTotal = parts.reduce((a, r) => a + (r.total || 0), 0), cableTotal = cable.reduce((a, r) => a + (r.cost || 0), 0);
    return { parts, cable, partsTotal: +partsTotal.toFixed(2), cableTotal: +cableTotal.toFixed(2), total: +(partsTotal + cableTotal).toFixed(2), unpriced: parts.filter((r) => r.unit == null).length, currency: project.settings.currency || '£' };
  }

  /* ---------------- Build pack ---------------- */
  const money = (cur, v) => (v == null ? '' : cur + Number(v).toFixed(2));
  const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c == null ? '' : c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  function labelSheetHTML(labels, o = {}) {
    const w = o.width || 38, h = o.height || 21;
    return `<div class="labels" style="grid-template-columns:repeat(auto-fill, ${w}mm)">${labels.map((l) => `<div class="label" style="width:${w}mm;height:${h}mm"><b>${esc(l.line1)}</b><span>${esc(l.line2)}</span><i>${esc(l.code)}</i></div>`).join('')}</div>`;
  }
  const PACK_CSS = `
    .pack{font:10pt/1.35 "IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;color:#1d2320}
    .pack section{break-before:page;page-break-before:always}
    .pack section:first-child{break-before:auto;page-break-before:auto}
    .pack h1{font-size:22pt;margin:0 0 6mm}.pack h2{font-size:13pt;margin:0 0 3mm;border-bottom:1px solid #1d2320;padding-bottom:1mm}
    .pack h3{font-size:10.5pt;margin:4mm 0 2mm}
    .pack table{border-collapse:collapse;width:100%;font-size:8pt;margin-bottom:4mm}
    .pack th,.pack td{border:1px solid #9aa3ab;padding:1mm 1.5mm;text-align:left;vertical-align:top}
    .pack th{background:#eef0f2}
    .pack .cover dl{display:grid;grid-template-columns:40mm 1fr;gap:2mm 4mm;font-size:11pt}
    .pack .cover dt{color:#5b625e}.pack .toc li{margin:1mm 0}
    .pack .sheet svg{width:100%;height:auto;max-height:180mm;display:block}
    .pack .labels{display:grid;gap:0;font-size:7pt}
    .pack .label{box-sizing:border-box;border:1px dashed #9aa3ab;padding:1mm 1.5mm;display:flex;flex-direction:column;justify-content:center;overflow:hidden}
    .pack .label b{font-size:10pt}.pack .label i{font-style:normal;color:#5b625e}
    .pack .muted{color:#5b625e}.pack .warn{color:#a35f00;font-weight:600}
    .pack .vehicle{position:relative;max-width:100%}.pack .vehicle img,.pack .vehicle svg{width:100%;height:auto;display:block}`;
  /* The whole job in one printable document. o.sections picks what goes in. */
  function buildPackHTML(d, o = {}) {
    const project = projectOf(d), m = project.meta, cur = project.settings.currency || '£';
    const want = (k) => !o.sections || o.sections.includes(k);
    const sections = [];
    const add = (id, title, html) => { if (want(id) && html) sections.push({ id, title, html }); };
    const vs = Loom.views(project);
    add('sheets', 'Drawings', vs.map((v) => `<div class="sheet">${Loom.exportSVG(v, o.bw ? { bw: true } : {})}</div>`).join('<div style="break-before:page"></div>'));
    const revs = (project.revisions || []).slice().reverse();
    add('revisions', 'Revision history', revs.length ? table(['Rev', 'Date', 'By', 'Description'], revs.map((r) => [r.rev, r.date, r.by, r.description])) : '<p class="muted">No revisions issued yet.</p>');
    const wl = Loom.wireList(project);
    add('wires', 'Wire list', wl.length ? table(['Sheet', 'Wire', 'From', 'To', 'Code', 'Colour', 'mm²', 'm', 'A', 'Circuit', 'Harness', 'Notes'], wl.map((r) => [r.sheet, r.name, r.from, r.to, r.code, r.colour, r.gauge, r.length, r.current, r.circuit, r.harness, r.notes])) : '');
    const cl = cutList(project);
    add('cut', 'Cut lists by harness', cl.map((g) => `<h3>${esc(g.harness)}: ${g.rows.length} wires, ${g.cut} m to cut${g.missing ? ` <span class="warn">(${g.missing} without a length)</span>` : ''}</h3>` + table(['Wire', 'Code', 'mm²', 'Insulation', 'Length m', 'Cut m', 'End A', 'Term A', 'Strip/shrink A', 'End B', 'Term B', 'Strip/shrink B'], g.rows.map((r) => [r.name, r.code, r.gauge, r.insulation, r.length, r.cut, r.from, r.a.termName, [r.a.strip && r.a.strip + ' mm', r.a.shrink].filter(Boolean).join(', '), r.to, r.b.termName, [r.b.strip && r.b.strip + ' mm', r.b.shrink].filter(Boolean).join(', ')]))).join(''));
    const ct = connectorTables(project);
    add('connectors', 'Connector tables', ct.map((c) => `<h3>${esc(c.ref)}: ${esc(c.type)}${c.series ? ', ' + esc(c.series) : ''} ${esc(c.housing)}</h3><p class="muted">${[c.gender, c.mate && 'mates with ' + c.mate, c.lock && 'wedge lock ' + c.lock, c.terminal && 'terminal ' + c.terminal, c.cavityPlugs ? `${c.cavityPlugs} cavity plug${c.cavityPlugs > 1 ? 's' : ''}` : ''].filter(Boolean).map(esc).join(' · ')}</p>` + table(['Cavity', 'Wire', 'Code', 'mm²', 'Circuit', 'Goes to', 'Terminal', 'Seal'], c.rows.flatMap((r) => (r.wires.length ? r.wires.map((w) => [r.cavity, w.name, w.code, w.gauge, w.circuit, w.to, w.termName, w.seal]) : [[r.cavity, '— unused —', '', '', '', '', '', c.sealed ? 'cavity plug' : '']])))).join('') || '');
    if (Loom.schedule) {
      const sc = Loom.schedule(project);
      add('fuses', 'Fuses, relays and load budget', (sc.fuses.length ? '<h3>Fuses and breakers</h3>' + table(['Sheet', 'Fuse', 'Rating A', 'Load A', '%', 'Smallest wire mm²', 'Feeds', 'Circuits'], sc.fuses.map((f) => [f.sheet, f.ref, f.rating, f.load, f.pct, f.smallest, f.loads.map((x) => x.ref).join(', '), f.circuits.join(', ')])) : '') +
        (sc.relays.length ? '<h3>Relays</h3>' + table(['Sheet', 'Relay', 'Contacts A', 'Load A', '%', 'Switches'], sc.relays.map((f) => [f.sheet, f.ref, f.rating, f.load, f.pct, f.loads.map((x) => x.ref).join(', ')])) : '') +
        (sc.supplies.length ? '<h3>Supplies</h3>' + table(['Sheet', 'Supply', 'Type', 'Capacity', 'Rating A', 'Load A', '%', 'Hours at full load (50% usable)'], sc.supplies.map((f) => [f.sheet, f.ref, f.type, f.capacity, f.rating, f.load, f.pct, f.hours])) : '') +
        `<p class="muted">Loads come from each part's current or wattage at ${sc.volts} V, all switched on together. Use it as a worst case.</p>`);
    }
    if (Loom.loadVoltages && want('voltages')) {
      const lv = Loom.loadVoltages(project);
      add('voltages', 'Voltage at each load', lv.length ? table(['Load', 'Sheet', 'Switched on by', 'Volts', 'Supply V', 'Drop %', 'Amps', 'Status'], lv.map((x) => [x.ref, x.sheet, x.state || 'always on', x.volts, x.supply, x.dropPct, x.amps, x.status || ''])) + '<p class="muted">Worked out from wire sizes, lengths and load ratings with a 12.6 V resting battery (scaled for other systems). A guide, not a measurement.</p>' : '');
    }
    // lists added by the household, factory and electronics modules, when the project has any rows for them
    [['circuits', 'Circuit schedule (household)'], ['motors', 'Motors'], ['terminals', 'Terminal plan'], ['plcio', 'PLC inputs and outputs'], ['power', 'Power rails']].forEach(([k, title]) => {
      if (!want(k) || !Loom.REPORTS.includes(k)) return;
      const rows = Loom.reportRows(project, k);
      if (rows.length > 1) add(k, title, table(rows[0], rows.slice(1)));
    });
    if (Loom.faultFind && want('faults')) {
      const ts = Loom.faultTargets(project).filter((x) => x.kind === 'load');
      add('faults', 'Fault-finding sheets', ts.map((x) => Loom.faultSheetHTML(Loom.faultFind(project, x.part, 'dead'), { project: project.title })).join(''));
    }
    const cb = costedBom(project);
    add('bom', 'Parts and costs', cb.parts.length ? table(['Qty', 'Component', 'Spec', 'Part number', 'Supplier', 'Unit', 'Total', 'References'], cb.parts.map((r) => [r.qty, r.name, r.spec, r.mpn, r.supplier, money(cur, r.unit), money(cur, r.total), r.refs.join(', ')])) +
      (cb.cable.length ? '<h3>Cable</h3>' + table(['Size mm²', 'Code', 'Colour', 'Insulation', 'Metres', 'Buy (+15%)', 'Per metre', 'Cost'], cb.cable.map((r) => [r.gauge, r.code, r.colour, r.insulation, r.metres.toFixed(1), (r.metres * 1.15).toFixed(1), money(cur, r.perMetre), money(cur, r.cost)])) : '') +
      `<p><b>Total ${money(cur, cb.total)}</b>${cb.unpriced ? ` <span class="muted">(${cb.unpriced} line${cb.unpriced > 1 ? 's' : ''} without a price)</span>` : ''}</p>` : '');
    const cab = cableReport(project);
    add('cables', 'Multicore and screened cables', cab.length ? table(['Cable', 'Type', 'Cores', 'Used', 'Spare', 'Part number', 'Wires'], cab.map((c) => [c.name, c.typeName, c.cores, c.used, c.spare, c.mpn, c.wires.join(', ')])) : '');
    const loc = locations(project).filter((x) => x.location || x.marked);
    add('locations', 'Component locations', (o.vehicleSVG || '') + (loc.length ? table(['Ref', 'Component', 'Location', 'Sheet'], loc.map((x) => [x.ref, x.type, x.location, x.sheet])) : ''));
    const hs = [...new Set(allWires(project).map((x) => x.w.harness).filter(Boolean))];
    add('formboards', 'Harness formboards', hs.filter((h) => project.harnessLayouts && project.harnessLayouts[h]).map((h) => { const fb = formboard(project, h); return `<h3>${esc(h)}: ${fb.total} m of trunk and branches</h3>${o.formboardSVG ? o.formboardSVG(h) : ''}` + table(['Branch', 'From', 'To', 'Length mm', 'Wires', 'Bundle Ø mm', 'Sleeving'], fb.branches.map((b) => [b.id, (fb.nodes.find((n) => n.id === b.a) || {}).label || b.a, (fb.nodes.find((n) => n.id === b.b) || {}).label || b.b, b.length, b.count, b.diameter, [Loom.SLEEVING.find((s) => s.id === b.sleeve)?.name, b.sleeveSize].filter((x) => x && x !== 'None').join(' ')])); }).join(''));
    const use = Loom.colourUsage(project);
    add('colours', 'Colour usage', use.length ? table(['Code', 'Colour', 'Circuit', 'Harness', 'Wires'], use.flatMap((e) => e.uses.map((u) => [e.code, e.colour, u.circuit, u.harness, u.wires.join(', ')]))) : '');
    if (o.labels) add('labels', 'Wire labels', labelSheetHTML(wireLabels(project), o.labelSize));
    const issues = Loom.validate(project).filter((c) => c.level !== 'info');
    add('checks', 'Design checks', issues.length ? table(['Level', 'Rule', 'Finding'], issues.map((c) => [c.level === 'warn' ? 'check' : c.level, c.rule || '', c.text])) : '<p>No problems found.</p>');
    const cover = `<section class="cover"><h1>${esc(project.title)}</h1><dl><dt>Vehicle / client</dt><dd>${esc(m.project || '')}</dd><dt>Revision</dt><dd>${esc(m.revision || '')}</dd><dt>Date</dt><dd>${esc(m.date || '')}</dd><dt>Drawn by</dt><dd>${esc(m.drawnBy || '')}</dd><dt>Sheets</dt><dd>${vs.length}</dd><dt>Wires</dt><dd>${wl.length}</dd></dl>
      <h2 style="margin-top:10mm">Contents</h2><ol class="toc">${sections.map((s) => `<li>${esc(s.title)}${s.id === 'sheets' ? ': ' + vs.map((v, i) => `${i + 1} ${esc(v.sheet.name)}`).join(', ') : ''}</li>`).join('')}</ol>
      <p class="muted" style="margin-top:10mm">Drawn with LoomWright ${esc(Loom.VERSION)}. Part numbers and ratings are a guide: check them against the maker's data before ordering.</p>
      ${Loom.disclaimerFor ? `<p class="${Loom.disclaimerFor(project).mains ? 'warn' : 'muted'}">${esc(Loom.disclaimerFor(project).short)}</p>` : ''}</section>`;
    return `<div class="pack">${cover}${sections.map((s) => `<section><h2>${esc(s.title)}</h2>${s.html}</section>`).join('')}</div>`;
  }

  /* ---------------- Tables for CSV export (the app and the Claude add-on share these) ---------------- */
  const REPORTS = ['wires', 'bom', 'cable', 'usage', 'fuses', 'connectors', 'cut', 'labels', 'locations', 'nets', 'voltages'];
  function reportRows(d, kind, o = {}) {
    const project = projectOf(d);
    const insName = (id) => (Loom.INSULATION.find((x) => x.id === id) || {}).name || '';
    const cableName = (id) => ((project.cables || []).find((c) => c.id === id) || {}).name || '';
    const fix = (n, p = 2) => (n == null || n === '' ? '' : Number(n).toFixed(p));
    const amps = (l) => l.map((x) => `${x.ref} ${x.amps}A`).join('; ');
    switch (kind) {
      case 'wires':
        return [['Sheet', 'Wire', 'From', 'To', 'Colour code', 'Colour', 'Size mm2', 'AWG', 'Length m', 'Current A', 'Voltage drop V', 'Circuit', 'Harness', 'Insulation', 'Cable', 'Terminal A', 'Terminal B', 'Notes']]
          .concat(Loom.wireList(project).map((r) => [r.sheet, r.name, r.from, r.to, r.code, r.colour, r.gauge, r.awg, r.length, r.current, r.drop, r.circuit, r.harness, insName(r.insulation), cableName(r.cable), r.termFrom, r.termTo, r.notes]));
      case 'bom': {
        const cb = costedBom(project);
        const rows = [['Qty', 'Component', 'Spec', 'Part number', 'Supplier', 'Unit price', 'Total', 'References', 'Locations']].concat(cb.parts.map((r) => [r.qty, r.name, r.spec, r.mpn, r.supplier, fix(r.unit), fix(r.total), r.refs.join(' '), (r.locations || []).join('; ')]));
        rows.push([], ['', 'Cable', '', '', '', '', fix(cb.cableTotal)], ['', 'Total (' + cb.currency + ')', '', '', '', '', fix(cb.total)]);
        return rows;
      }
      case 'cable':
        return [['Size mm2', 'Code', 'Colour', 'Insulation', 'Wires', 'Total m', 'Buy m (+15%)', 'Per metre', 'Cost', 'Wires missing length']]
          .concat(Loom.cableTotals(project).map((r) => [r.gauge, r.code, r.colour, insName(r.insulation), r.wires, r.metres.toFixed(1), (r.metres * 1.15).toFixed(1), r.perMetre == null ? '' : r.perMetre, fix(r.cost), r.unknown]));
      case 'usage': {
        const rows = [['Code', 'Colour', 'Circuit', 'Harness', 'Sheets', 'Wires']];
        Loom.colourUsage(project).forEach((e) => e.uses.forEach((u) => rows.push([e.code, e.colour, u.circuit, u.harness, u.sheets.join(' '), u.wires.join(' ')])));
        return rows;
      }
      case 'fuses': {
        const sc = Loom.schedule(project), rows = [['Kind', 'Sheet', 'Ref', 'Rating A', 'Load A', 'Use %', 'Status', 'Smallest wire mm2', 'Feeds', 'Circuits']];
        sc.fuses.forEach((x) => rows.push(['Fuse', x.sheet, x.ref, x.rating, x.load, x.pct, x.status, x.smallest, amps(x.loads), x.circuits.join('; ')]));
        sc.relays.forEach((x) => rows.push(['Relay', x.sheet, x.ref, x.rating, x.load, x.pct, x.status, '', amps(x.loads), '']));
        sc.supplies.forEach((x) => rows.push(['Supply', x.sheet, x.ref, x.rating, x.load, x.pct, x.hours == null ? '' : x.hours + ' h', '', amps(x.loads), '']));
        return rows;
      }
      case 'connectors': {
        const rows = [['Connector', 'Type', 'Series', 'Housing', 'Gender', 'Mates with', 'Cavity', 'Wire', 'Code', 'Size mm2', 'Circuit', 'Goes to', 'Terminal', 'Seal']];
        connectorTables(project).forEach((c) => c.rows.forEach((r) => (r.wires.length ? r.wires : [null]).forEach((w) => rows.push([c.ref, c.type, c.series, c.housing, c.gender, c.mate, r.cavity, w ? w.name : '(unused)', w ? w.code : '', w ? w.gauge : '', w ? w.circuit : '', w ? w.to : '', w ? w.termName : '', w ? w.seal : (c.sealed ? 'cavity plug' : '')]))));
        return rows;
      }
      case 'cut': {
        const rows = [['Harness', 'Wire', 'Code', 'Size mm2', 'Insulation', 'Length m', 'Cut m', 'From', 'Terminal A', 'Method A', 'Strip A mm', 'Sleeve A', 'Seal A', 'To', 'Terminal B', 'Method B', 'Strip B mm', 'Sleeve B', 'Seal B', 'Cable']];
        cutList(project).forEach((g) => g.rows.forEach((r) => rows.push([g.harness, r.name, r.code, r.gauge, insName(r.insulation), r.length, r.cut, r.from, r.a.termName, r.a.method, r.a.strip, r.a.shrink, r.a.seal, r.to, r.b.termName, r.b.method, r.b.strip, r.b.shrink, r.b.seal, r.cable])));
        return rows;
      }
      case 'labels':
        return [['Wire', 'End', 'Line 1', 'Line 2', 'Code', 'Harness']].concat(wireLabels(project, { single: o.single }).map((l) => [l.wire, l.end || '', l.line1, l.line2, l.code, l.harness]));
      case 'locations':
        return [['Ref', 'Component', 'Location', 'Sheet', 'Marked on vehicle']].concat(locations(project).map((x) => [x.ref, x.type, x.location, x.sheet, x.marked ? 'yes' : '']));
      case 'nets':
        return [['Net', 'Pins', 'Wires']].concat(Loom.nets(project).map((n) => [n.name, n.pins.map((p) => p.label).join(' '), n.wires.map((x) => x.wire.name).join(' ')]));
      case 'voltages':
        if (!Loom.loadVoltages) throw new Error('The circuit module is not loaded.');
        return [['Load', 'Sheet', 'Switched on by', 'Volts', 'Supply V', 'Drop %', 'Amps', 'Status']].concat(Loom.loadVoltages(project).map((x) => [x.ref, x.sheet, x.state || 'always on', x.volts, x.supply, x.dropPct, x.amps, x.status || '']));
      default:
        throw new Error(`Unknown report "${kind}". Use one of: ${REPORTS.join(', ')}`);
    }
  }
  const toCSV = (rows) => rows.map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n');

  Object.assign(Loom, { REPORTS, reportRows, toCSV, CONNECTOR_TYPES, METHODS, SEALS, CABLE_TYPES, connectorTables, cutList, wireLabels, cableReport, harnessEnds, harnessLayout, newHarnessLayout: newLayout, routeBetween, formboard, applyFormboardLengths, formboardGeometry, locations, costedBom, buildPackHTML, labelSheetHTML, PACK_CSS });
  return Loom;
});
