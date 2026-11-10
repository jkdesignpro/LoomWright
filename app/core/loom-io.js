/*
 * LoomWright import and export: wire list spreadsheets, CAD lengths,
 * WireViz YAML, KiCad netlists, DXF for CAD, and a read-only HTML page.
 * Extends window.Loom; needs the other core modules first. WireViz needs js-yaml.
 *
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    require('./loom-reports.js');
    let yaml = null;
    try { yaml = require('../vendor/js-yaml.min.js'); } catch (e) { try { yaml = require('js-yaml'); } catch (e2) { yaml = null; } }
    module.exports = factory(require('./loom-core.js'), yaml);
  } else factory(root.Loom, root.jsyaml);
})(typeof self !== 'undefined' ? self : this, function (Loom, YAML) {
  'use strict';
  const esc = Loom.esc;
  const { L, R, T } = Loom.shapes;

  /* ---------------- Colours and sizes written in any common way ---------------- */
  function resolveColour(doc, s) {
    if (!s) return '';
    const q = String(s).trim().toLowerCase(), all = Loom.allColours(doc);
    const hit = all.find((c) => c.id.toLowerCase() === q) || all.find((c) => c.name.toLowerCase() === q)
      || all.find((c) => c.custom && (c.code || '').toLowerCase() === q)
      || all.find((c) => [c.lr, c.din, c.sae].some((x) => x && x.toLowerCase() === q))
      || all.find((c) => c.name.toLowerCase().split(/[\s/]+/).includes(q))
      || (q === 'violet' || q === 'vi' ? all.find((c) => c.id === 'purple') : null) || (q === 'gray' ? all.find((c) => c.id === 'grey') : null);
    if (!hit) throw new Error(`Unknown colour "${s}"`);
    return hit.id;
  }
  /* "brown/red", "NR" (Land Rover), "BN/RD", "BNRD" (WireViz), or separate main and tracer. */
  function parseColourSpec(doc, colour, tracer, tracer2) {
    let parts = [];
    const c = String(colour || '').trim();
    if (c && /[/\s-]/.test(c) && !Loom.allColours(doc).some((x) => x.name.toLowerCase() === c.toLowerCase())) parts = c.split(/[/-]|\s+with\s+|\s+/i).filter((x) => x && !/^(tracer|stripe)$/i.test(x));
    else if (c) {
      try { parts = [resolveColour(doc, c)]; } catch (e) {
        // run-together codes: Land Rover "NR", "LGB" or IEC pairs "BNRD"
        const sets = [Loom.COLOURS.map((x) => [x.lr, x.id]), Loom.COLOURS.map((x) => [x.din, x.id])];
        let ok = null;
        for (const set of sets) {
          const codes = set.filter((x) => x[0]).sort((a, b) => b[0].length - a[0].length);
          let rest = c.toUpperCase(); const out = [];
          while (rest.length) { const m = codes.find((x) => rest.startsWith(x[0])); if (!m) break; out.push(m[1]); rest = rest.slice(m[0].length); }
          if (!rest.length && out.length) { ok = out; break; }
        }
        if (!ok) throw e;
        parts = ok;
      }
    }
    if (tracer) parts[1] = tracer;
    if (tracer2) parts[2] = tracer2;
    const ids = parts.map((x) => (Loom.allColours(doc).some((y) => y.id === x) ? x : resolveColour(doc, x)));
    return { colour: ids[0] || 'red', tracer: ids[1] || '', tracer2: ids[2] || '' };
  }
  function parseGauge(g) {
    if (g == null || g === '') return '1.0';
    const s = String(g).trim().toLowerCase().replace(',', '.');
    const awg = /^(\d+(?:\/0)?)\s*awg$/.exec(s);
    if (awg) { const hit = Loom.GAUGES.find((x) => x.awg === awg[1]); if (hit) return hit.mm2; }
    const n = parseFloat(s);
    if (isNaN(n)) throw new Error(`Size "${g}" not understood. Use mm² like 1.5 or AWG like "14 awg".`);
    const hit = Loom.GAUGES.find((x) => parseFloat(x.mm2) === n);
    return hit ? hit.mm2 : String(n);
  }

  /* ---------------- CSV ---------------- */
  function parseCSV(text) {
    const t = String(text).replace(/^﻿/, '');
    const first = t.split(/\r?\n/)[0] || '';
    const sep = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }
  const HEADS = {
    name: /^(wire|wire ?(no|number|#|id)|name|ref|no\.?|#)$/i, from: /^(from|start|end ?a|source|from ?pin|from ?\(.*\))$/i, to: /^(to|end|end ?b|destination|dest|to ?pin|to ?\(.*\))$/i,
    fromPart: /^(from ?(part|component|connector|device))$/i, fromPin: /^(from ?(pin|cavity|terminal))$/i, toPart: /^(to ?(part|component|connector|device))$/i, toPin: /^(to ?(pin|cavity|terminal))$/i,
    colour: /^(colou?r|colou?r ?code|code|main ?colou?r|insulation colou?r)$/i, tracer: /^(tracer|stripe|tracer ?colou?r)$/i, gauge: /^(size|gauge|mm2|mm²|csa|size ?mm2|size ?mm²|awg|cross.?section)$/i,
    length: /^(length|len|length ?m|length ?\(m\)|metres|meters)$/i, lengthMm: /^(length ?mm|length ?\(mm\)|mm)$/i, current: /^(current|amps|current ?a|load)$/i,
    circuit: /^(circuit|function|signal|net|description)$/i, harness: /^(harness|loom|bundle)$/i, notes: /^(notes?|comment|remarks)$/i,
  };
  function mapHeader(head) {
    const m = {};
    head.forEach((h, i) => { const k = Object.keys(HEADS).find((x) => HEADS[x].test(String(h).trim())); if (k && m[k] == null) m[k] = i; });
    if (m.from == null && m.fromPart == null) throw new Error('No "From" column found. The first row should name the columns, e.g. Wire, From, To, Colour, Size, Length.');
    return m;
  }

  /* A plain box symbol with the given pins, for things imported without a symbol. */
  function boxPartDef(id, name, pins, o = {}) {
    const left = pins.filter((_, i) => i % 2 === 0), right = pins.filter((_, i) => i % 2 === 1);
    const rows = Math.max(1, left.length, right.length), longest = Math.max(4, ...pins.map((p) => String(p.id).length));
    const w = Math.max(80, Math.ceil((longest * 2 * 5.5 + 50) / 20) * 20), h = rows * 20 + 20;
    const shapes = [R(10, 0, w - 20, h, { rx: 3 }), T(w / 2, h / 2 + 3, o.text || '', { size: 8, weight: 600 })];
    const out = [];
    left.forEach((p, i) => { const y = 20 + i * 20; shapes.push(L(0, y, 10, y), T(14, y + 3, p.id, { size: 7, anchor: 'start' })); out.push({ id: String(p.id), x: 0, y, n: p.n || String(p.id) }); });
    right.forEach((p, i) => { const y = 20 + i * 20; shapes.push(L(w - 10, y, w, y), T(w - 14, y + 3, p.id, { size: 7, anchor: 'end' })); out.push({ id: String(p.id), x: w, y, n: p.n || String(p.id) }); });
    return { id, name, cat: 'My components', custom: true, imported: o.source || true, prefix: o.prefix || 'X', w, h, pins: out, shapes, props: [], sub: o.sub || '' };
  }
  function ensureCustom(project, def) {
    const i = project.customParts.findIndex((p) => p.id === def.id);
    if (i >= 0) {
      // keep pins already used, add new ones
      const old = project.customParts[i];
      const ids = [...new Set(old.pins.map((p) => p.id).concat(def.pins.map((p) => p.id)))];
      project.customParts[i] = boxPartDef(def.id, old.name, ids.map((x) => ({ id: x, n: (old.pins.concat(def.pins).find((p) => p.id === x) || {}).n })), { text: old.shapes[1] && old.shapes[1].text, source: old.imported, prefix: old.prefix });
    } else project.customParts.push(def);
    return def.id;
  }
  const slugId = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'part';
  function targetSheet(project, name) {
    const s = Loom.newSheet(uniqueSheetName(project, name || 'Imported'));
    project.sheets.push(s);
    return Loom.view(project, s);
  }
  function uniqueSheetName(project, n) { let name = n, i = 2; while (project.sheets.some((s) => s.name === name)) name = `${n} ${i++}`; return name; }
  /* Find a part by reference on the sheet, copy it from another sheet, or make a box for it. */
  function partFor(project, v, label, pinsWanted, source) {
    let p = v.parts.find((x) => x.label && x.label.toLowerCase() === label.toLowerCase());
    if (p) return p;
    for (const s of project.sheets) {
      const q = s.parts.find((x) => x.label && x.label.toLowerCase() === label.toLowerCase());
      if (q) {
        const r = Loom.resolved(Loom.view(project, s), q);
        if (pinsWanted.every((pn) => r.pins.some((x) => x.id === pn))) { p = { ...JSON.parse(JSON.stringify(q)), id: Loom.uid('p'), _unplaced: true }; v.parts.push(p); return p; }
      }
    }
    const id = 'imp_' + slugId(label);
    ensureCustom(project, boxPartDef(id, `${label} (imported)`, pinsWanted.map((x) => ({ id: x })), { text: label, source }));
    p = { id: Loom.uid('p'), type: id, x: 0, y: 0, rot: 0, label, props: {}, _unplaced: true };
    v.parts.push(p);
    return p;
  }
  const splitEnd = (s) => { const t = String(s || '').trim(), i = t.lastIndexOf(':'); return i > 0 ? [t.slice(0, i).trim(), t.slice(i + 1).trim()] : [t, '1']; };

  /* Wire list from a spreadsheet (CSV, or tab-separated text pasted from Excel). */
  function importWireList(project, text, o = {}) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('The wire list needs a header row and at least one wire.');
    const m = mapHeader(rows[0]), warnings = [];
    const get = (r, k) => (m[k] != null ? String(r[m[k]] == null ? '' : r[m[k]]).trim() : '');
    const items = rows.slice(1).map((r, i) => {
      const [fp, fpin] = m.fromPart != null ? [get(r, 'fromPart'), get(r, 'fromPin') || '1'] : splitEnd(get(r, 'from'));
      const [tp, tpin] = m.toPart != null ? [get(r, 'toPart'), get(r, 'toPin') || '1'] : splitEnd(get(r, 'to'));
      return { line: i + 2, r, fp, fpin, tp, tpin };
    }).filter((x) => x.fp && x.tp);
    const v = o.sheetId ? Loom.view(project, o.sheetId) : targetSheet(project, o.sheetName || 'Imported wire list');
    const pins = new Map();
    items.forEach((x) => { [[x.fp, x.fpin], [x.tp, x.tpin]].forEach(([p, pn]) => { if (!pins.has(p)) pins.set(p, new Set()); pins.get(p).add(pn); }); });
    const parts = new Map();
    pins.forEach((set, label) => parts.set(label, partFor(project, v, label, [...set], 'csv')));
    let n = 0;
    items.forEach((x) => {
      const a = parts.get(x.fp), b = parts.get(x.tp);
      let col = { colour: 'red', tracer: '', tracer2: '' };
      try { col = parseColourSpec(project, get(x.r, 'colour') || 'red', get(x.r, 'tracer')); } catch (e) { warnings.push(`Line ${x.line}: ${e.message}, used red.`); }
      let gauge = '1.0';
      try { gauge = parseGauge(get(x.r, 'gauge') || '1.0'); } catch (e) { warnings.push(`Line ${x.line}: ${e.message}, used 1.0 mm².`); }
      let len = get(x.r, 'length'); if (!len && m.lengthMm != null) { const mm = parseFloat(get(x.r, 'lengthMm')); len = mm > 0 ? String(+(mm / 1000).toFixed(3)) : ''; }
      const harness = get(x.r, 'harness');
      if (harness && !project.harnesses.includes(harness)) project.harnesses.push(harness);
      const w = Loom.addWire(v, { part: a.id, pin: x.fpin }, { part: b.id, pin: x.tpin }, { name: get(x.r, 'name') || undefined, ...col, gauge, length: len ? parseFloat(len) : '', current: get(x.r, 'current') ? parseFloat(get(x.r, 'current')) : '', circuit: get(x.r, 'circuit'), harness, notes: get(x.r, 'notes') });
      if (!w.tracer2) delete w.tracer2;
      n++;
    });
    Loom.autoLayout(v, { onlyUnplaced: true });
    return { sheetId: v.sheet.id, sheet: v.sheet.name, parts: parts.size, wires: n, warnings };
  }

  /* Lengths measured in CAD (or anywhere): rows of wire number and length. */
  function importLengths(project, text) {
    const rows = parseCSV(text);
    let start = 0, unitMm = false;
    if (rows.length && isNaN(parseFloat(rows[0][1]))) { unitMm = /mm/i.test(rows[0].join(' ')); start = 1; }
    const vals = rows.slice(start).map((r) => parseFloat(String(r[1]).replace(',', '.'))).filter((x) => x > 0);
    if (!unitMm && vals.length && Math.min(...vals) > 30) unitMm = true; // whole numbers in the hundreds are millimetres
    const byName = new Map(); project.sheets.forEach((s) => s.wires.forEach((w) => byName.set(String(w.name).toUpperCase(), w)));
    let updated = 0; const missing = [];
    rows.slice(start).forEach((r) => {
      const w = byName.get(String(r[0] || '').trim().toUpperCase()), v = parseFloat(String(r[1]).replace(',', '.'));
      if (!(v > 0)) return;
      if (!w) { missing.push(String(r[0]).trim()); return; }
      w.length = +(unitMm ? v / 1000 : v).toFixed(3); updated++;
    });
    return { updated, missing, unit: unitMm ? 'mm' : 'm' };
  }

  /* ---------------- WireViz ---------------- */
  const iec = (doc, id) => { const c = Loom.colourById(doc, id); if (!c) return ''; if (c.custom) return c.code || c.name; return c.din || c.name.toUpperCase().slice(0, 2); };
  function wirevizData(project, o = {}) {
    const connectors = {}, cables = {}, connections = [];
    const name = (v, p) => p.label || `${(Loom.partDef(v, p.type) || {}).prefix || 'X'}_${p.id.slice(1, 5)}`;
    Loom.views(project).forEach((v) => {
      v.wires.forEach((w) => {
        if (o.harness && w.harness !== o.harness) return;
        [w.from, w.to].forEach((e) => {
          const p = v.parts.find((x) => x.id === e.part); if (!p) return;
          const n = name(v, p);
          if (connectors[n]) return;
          const r = Loom.resolved(v, p), def = r.def || {};
          const c = { type: (p.type === 'conn' ? r.props.mpnShown || r.props.seriesName : def.name) || p.type, pinlabels: r.pins.map((x) => x.id) };
          if (p.type === 'conn') c.subtype = r.props.gender === 'receptacle' ? 'male' : 'female';
          if (p.mpn) c.pn = p.mpn;
          if (p.location) c.notes = p.location;
          if (r.pins.length === 1 || p.type === 'splice') { c.style = 'simple'; delete c.pinlabels; c.pincount = 1; }
          connectors[n] = c;
        });
        const two = [w.colour, w.tracer, w.tracer2].filter(Boolean).map((id) => iec(project, id)).join('');
        const cab = { wirecount: 1, gauge: `${w.gauge} mm2`, colors: [two || 'RD'] };
        if (parseFloat(w.length) > 0) cab.length = parseFloat(w.length);
        if (w.circuit) cab.notes = w.circuit;
        cables[w.name] = cab;
        const pa = v.parts.find((x) => x.id === w.from.part), pb = v.parts.find((x) => x.id === w.to.part);
        const pinOf = (p, pin) => { const c = connectors[name(v, p)]; return c.style === 'simple' ? 1 : (isNaN(+pin) ? pin : +pin); };
        connections.push([{ [name(v, pa)]: [pinOf(pa, w.from.pin)] }, { [w.name]: [1] }, { [name(v, pb)]: [pinOf(pb, w.to.pin)] }]);
      });
    });
    return { metadata: { title: project.title, notes: 'Exported from LoomWright' }, connectors, cables, connections };
  }
  function exportWireViz(project, o = {}) {
    if (!YAML) throw new Error('WireViz export needs js-yaml, which is not loaded.');
    return '# WireViz harness description exported from LoomWright ' + Loom.VERSION + '\n' + YAML.dump(wirevizData(project, o), { lineWidth: 120, noRefs: true, flowLevel: 3 });
  }
  function importWireViz(project, text, o = {}) {
    if (!YAML) throw new Error('WireViz import needs js-yaml, which is not loaded.');
    const y = YAML.load(text) || {};
    const cons = y.connectors || {}, cabs = y.cables || {}, conns = y.connections || [];
    if (!Array.isArray(conns)) throw new Error('No connections list found in this WireViz file.');
    const v = targetSheet(project, o.sheetName || (y.metadata && y.metadata.title) || 'WireViz import'), warnings = [];
    const parts = new Map();
    const expand = (sel, count) => {
      if (sel == null) return Array.from({ length: count || 1 }, (_, i) => i + 1);
      const list = Array.isArray(sel) ? sel : [sel];
      return list.flatMap((x) => { const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(x)); if (m) { const a = +m[1], b = +m[2], out = []; for (let i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) out.push(i); return out; } return [x]; });
    };
    const conPart = (n) => {
      if (parts.has(n)) return parts.get(n);
      const c = cons[n] || {}, labels = c.pinlabels || [], count = c.pincount || (c.pins ? c.pins.length : labels.length) || 1;
      const pinIds = (c.pins || Array.from({ length: count }, (_, i) => i + 1)).map(String);
      const pins = pinIds.map((id, i) => ({ id, n: labels[i] ? `${id} ${labels[i]}` : id }));
      const def = boxPartDef('wv_' + slugId(n), `${n}${c.type ? ' ' + c.type : ''} (WireViz)`, pins, { text: n, source: 'wireviz', sub: [c.type, c.subtype].filter(Boolean).join(' ') });
      ensureCustom(project, def);
      const p = { id: Loom.uid('p'), type: def.id, x: 0, y: 0, rot: 0, label: n, props: {}, _unplaced: true };
      if (c.pn) p.mpn = String(c.pn);
      v.parts.push(p); parts.set(n, p);
      return p;
    };
    const colourOf = (code) => { try { return parseColourSpec(project, String(code)); } catch (e) { warnings.push(`Colour ${code} not recognised, used red.`); return { colour: 'red', tracer: '' }; } };
    let n = 0;
    conns.forEach((set) => {
      if (!Array.isArray(set)) return;
      const steps = set.map((item) => {
        if (typeof item === 'string') return { kind: 'arrow' };
        const [k, sel] = Object.entries(item)[0] || [];
        if (k == null) return null;
        if (cabs[k]) { const cab = cabs[k]; const cnt = cab.wirecount || (cab.colors ? cab.colors.length : 1); return { kind: 'cable', name: k, cab, sel: expand(sel, cnt) }; }
        return { kind: 'con', name: k, sel: expand(sel, (cons[k] || {}).pincount || ((cons[k] || {}).pinlabels || []).length || 1) };
      }).filter(Boolean);
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (s.kind !== 'cable') continue;
        const a = steps[i - 1], b = steps[i + 1];
        if (!a || !b || a.kind !== 'con' || b.kind !== 'con') { warnings.push(`Cable ${s.name} has an end without a connector; skipped that part.`); continue; }
        const pa = conPart(a.name), pb = conPart(b.name), cab = s.cab;
        const gauge = cab.gauge != null ? (String(cab.gauge_unit || '').toLowerCase() === 'awg' || /awg/i.test(String(cab.gauge)) ? parseGauge(parseFloat(cab.gauge) + ' awg') : parseGauge(String(cab.gauge).replace(/mm2|mm²/i, ''))) : '1.0';
        s.sel.forEach((core, j) => {
          const colour = cab.colors ? cab.colors[(+core || j + 1) - 1] || cab.colors[j] : cab.color_code ? 'RD' : 'RD';
          const col = colourOf(colour || 'RD');
          const fa = a.sel[j] != null ? a.sel[j] : a.sel[0], fb = b.sel[j] != null ? b.sel[j] : b.sel[0];
          const w = Loom.addWire(v, { part: pa.id, pin: String(fa) }, { part: pb.id, pin: String(fb) }, { ...col, gauge, length: cab.length ? parseFloat(cab.length) : '', circuit: cab.notes || '', name: (cab.wirecount || 1) > 1 ? undefined : s.name });
          if (!w.tracer2) delete w.tracer2;
          n++;
        });
        if ((cab.wirecount || 1) > 1 || cab.shield) {
          const id = Loom.uid('cab');
          project.cables = project.cables || [];
          project.cables.push({ id, name: s.name, type: cab.shield ? 'screened' : cab.type && /twist/i.test(cab.type) ? 'twisted' : 'multicore', cores: cab.wirecount || 1, mpn: cab.pn || '' });
          v.wires.slice(-s.sel.length).forEach((w) => { w.cable = id; });
        }
      }
    });
    Loom.autoLayout(v, { onlyUnplaced: true });
    return { sheetId: v.sheet.id, sheet: v.sheet.name, parts: parts.size, wires: n, warnings };
  }

  /* ---------------- KiCad netlist (.net, s-expression) ---------------- */
  function sexpr(text) {
    let i = 0;
    const s = String(text);
    function read() {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (s[i] === '(') { i++; const list = []; for (;;) { while (i < s.length && /\s/.test(s[i])) i++; if (s[i] === ')') { i++; return list; } if (i >= s.length) return list; list.push(read()); } }
      if (s[i] === '"') { i++; let out = ''; while (i < s.length && s[i] !== '"') { if (s[i] === '\\') { i++; } out += s[i++]; } i++; return out; }
      let out = ''; while (i < s.length && !/[\s()]/.test(s[i])) out += s[i++]; return out;
    }
    return read();
  }
  const child = (l, k) => (Array.isArray(l) ? l.find((x) => Array.isArray(x) && x[0] === k) : null);
  const children = (l, k) => (Array.isArray(l) ? l.filter((x) => Array.isArray(x) && x[0] === k) : []);
  const val = (l, k) => { const c = child(l, k); return c ? c[1] : ''; };
  function importKiCad(project, text, o = {}) {
    const tree = sexpr(text);
    if (!Array.isArray(tree) || tree[0] !== 'export') throw new Error('This is not a KiCad netlist (.net) file. In KiCad, use File, Export, Netlist, KiCad format.');
    const comps = children(child(tree, 'components'), 'comp'), nets = children(child(tree, 'nets'), 'net');
    const libparts = children(child(tree, 'libparts'), 'libpart');
    const v = targetSheet(project, o.sheetName || val(child(tree, 'design'), 'source').split(/[\\/]/).pop().replace(/\.\w+$/, '') || 'KiCad import');
    const used = new Map();
    nets.forEach((n) => children(n, 'node').forEach((nd) => { const r = val(nd, 'ref'); if (!used.has(r)) used.set(r, new Map()); used.get(r).set(val(nd, 'pin'), val(nd, 'pinfunction') || ''); }));
    const parts = new Map();
    comps.forEach((c) => {
      const ref = val(c, 'ref'), value = val(c, 'value'), ls = child(c, 'libsource'), lib = ls ? val(ls, 'lib') : '', part = ls ? val(ls, 'part') : '';
      const lp = libparts.find((x) => val(x, 'lib') === lib && val(x, 'part') === part);
      const lpPins = lp ? children(child(lp, 'pins'), 'pin').map((pn) => ({ id: String(val(pn, 'num')), n: `${val(pn, 'num')} ${val(pn, 'name')}`.trim() })) : [];
      const usedPins = used.get(ref) || new Map();
      const pins = lpPins.length ? lpPins : [...usedPins.keys()].map((id) => ({ id, n: `${id} ${usedPins.get(id)}`.trim() }));
      if (!pins.length) return;
      const prefix = (/^[A-Za-z]+/.exec(ref) || ['X'])[0];
      let type, props = {};
      const two = pins.length === 2 && pins.every((x) => ['1', '2'].includes(x.id));
      if (two && prefix === 'R') { type = 'resistor'; props = { value }; }
      else if (two && prefix === 'C' && !/CP|pol/i.test(part)) { type = 'capacitor'; props = { value }; }
      else if (two && prefix === 'L') { type = 'inductor'; props = { value }; }
      else if (two && prefix === 'F') { type = 'fuse'; props = { rating: value }; }
      else {
        const id = 'kicad_' + slugId(`${lib}_${part || value || ref}`) + '_' + pins.length;
        if (!project.customParts.some((x) => x.id === id)) project.customParts.push(boxPartDef(id, `${part || value || ref} (KiCad ${lib || 'symbol'})`, pins, { text: part || value, source: 'kicad', prefix, sub: '' }));
        type = id;
      }
      const p = { id: Loom.uid('p'), type, x: 0, y: 0, rot: 0, label: ref, props, _unplaced: true };
      if (value && !props.value) p.notes = value;
      const fp = val(c, 'footprint'); if (fp) p.mpn = val(child(c, 'fields') || [], 'MPN') || '';
      v.parts.push(p); parts.set(ref, p);
    });
    let n = 0;
    nets.forEach((net) => {
      const name = val(net, 'name'), nodes = children(net, 'node').map((nd) => ({ ref: val(nd, 'ref'), pin: String(val(nd, 'pin')) })).filter((x) => parts.has(x.ref));
      const ground = /^(\/)?(gnd|0v|ground|vss|-batt?)/i.test(name.replace(/^\//, '')), supply = /^(\/)?(\+|vcc|vdd|\+?\d+v|vbat|batt?\+)/i.test(name.replace(/^\//, ''));
      const circuit = /^Net-\(|^unconnected/i.test(name) ? '' : name.replace(/^\//, '');
      for (let i = 1; i < nodes.length; i++) {
        const a = nodes[i - 1], b = nodes[i];
        const pa = parts.get(a.ref), pb = parts.get(b.ref);
        if (!Loom.resolved(v, pa).pins.some((x) => x.id === a.pin) || !Loom.resolved(v, pb).pins.some((x) => x.id === b.pin)) continue;
        Loom.addWire(v, { part: pa.id, pin: a.pin }, { part: pb.id, pin: b.pin }, { colour: ground ? 'black' : supply ? 'red' : 'blue', gauge: '0.5', circuit });
        n++;
      }
    });
    Loom.autoLayout(v, { onlyUnplaced: true });
    return { sheetId: v.sheet.id, sheet: v.sheet.name, parts: parts.size, wires: n, warnings: [] };
  }

  /* ---------------- DXF (AutoCAD R12 ASCII, millimetres) ---------------- */
  const ACI = [[1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255], [5, 0, 0, 255], [6, 255, 0, 255], [7, 0, 0, 0], [8, 128, 128, 128], [9, 192, 192, 192], [30, 255, 127, 0], [34, 127, 63, 0], [94, 0, 127, 0], [150, 0, 127, 255], [200, 127, 0, 255], [221, 255, 127, 191], [41, 204, 153, 102]];
  function aciOf(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); if (!m) return 7;
    const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
    if (r > 235 && g > 235 && b > 235) return 9; // white wire shown light grey
    let best = 7, bd = Infinity;
    ACI.forEach(([n, R_, G, B]) => { const d = (r - R_) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (d < bd) { bd = d; best = n; } });
    return best;
  }
  /* Flatten an SVG path to polylines. */
  function flattenPath(d) {
    const toks = String(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    const lines = []; let cur = null, x = 0, y = 0, sx = 0, sy = 0, cmd = '', i = 0, lcx = 0, lcy = 0, lq = null;
    const num = () => parseFloat(toks[i++]);
    const push = (px, py) => { cur.push([px, py]); x = px; y = py; };
    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase(), C_ = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
      if (C_ === 'Z') { if (cur) { cur.push([sx, sy]); x = sx; y = sy; } continue; }
      if (C_ === 'M') { const px = num() + ox, py = num() + oy; cur = [[px, py]]; lines.push(cur); x = sx = px; y = sy = py; cmd = rel ? 'l' : 'L'; continue; }
      if (!cur) { cur = [[x, y]]; lines.push(cur); }
      if (C_ === 'L') push(num() + ox, num() + oy);
      else if (C_ === 'H') push(num() + ox, y);
      else if (C_ === 'V') push(x, num() + oy);
      else if (C_ === 'C' || C_ === 'S' || C_ === 'Q' || C_ === 'T') {
        let c1x, c1y, c2x, c2y, ex, ey;
        if (C_ === 'C') { c1x = num() + ox; c1y = num() + oy; c2x = num() + ox; c2y = num() + oy; ex = num() + ox; ey = num() + oy; }
        else if (C_ === 'S') { c1x = 2 * x - lcx; c1y = 2 * y - lcy; c2x = num() + ox; c2y = num() + oy; ex = num() + ox; ey = num() + oy; }
        else { let qx, qy; if (C_ === 'Q') { qx = num() + ox; qy = num() + oy; } else { qx = lq ? 2 * x - lq[0] : x; qy = lq ? 2 * y - lq[1] : y; } ex = num() + ox; ey = num() + oy; c1x = x + (2 / 3) * (qx - x); c1y = y + (2 / 3) * (qy - y); c2x = ex + (2 / 3) * (qx - ex); c2y = ey + (2 / 3) * (qy - ey); lq = [qx, qy]; }
        const x0 = x, y0 = y;
        for (let t = 1; t <= 12; t++) { const u = t / 12, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, e = u ** 3; cur.push([a * x0 + b * c1x + c * c2x + e * ex, a * y0 + b * c1y + c * c2y + e * ey]); }
        x = ex; y = ey; lcx = c2x; lcy = c2y;
        if (C_ !== 'Q' && C_ !== 'T') lq = null;
        continue;
      } else if (C_ === 'A') {
        let rx = Math.abs(num()), ry = Math.abs(num()); const rot = (num() * Math.PI) / 180, large = num(), sweep = num(), ex = num() + ox, ey = num() + oy;
        if (!rx || !ry) { push(ex, ey); continue; }
        const cs = Math.cos(rot), sn = Math.sin(rot), dx = (x - ex) / 2, dy = (y - ey) / 2, x1 = cs * dx + sn * dy, y1 = -sn * dx + cs * dy;
        const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
        const sgn = large === sweep ? -1 : 1, num_ = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
        const co = sgn * Math.sqrt(Math.max(0, num_ / den)), cx1 = (co * rx * y1) / ry, cy1 = (-co * ry * x1) / rx;
        const cx = cs * cx1 - sn * cy1 + (x + ex) / 2, cy = sn * cx1 + cs * cy1 + (y + ey) / 2;
        const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
        const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry); let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
        if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
        const steps = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 12)));
        for (let k = 1; k <= steps; k++) { const t = t1 + (dt * k) / steps; cur.push([cx + rx * Math.cos(t) * cs - ry * Math.sin(t) * sn, cy + rx * Math.cos(t) * sn + ry * Math.sin(t) * cs]); }
        x = ex; y = ey; continue;
      } else { i++; continue; }
      lq = null;
    }
    return lines.filter((l) => l.length > 1);
  }
  function DXF() {
    const ents = [], layers = new Map();
    const f = (n) => (Math.round(n * 1000) / 1000).toString();
    return {
      layer(name, colour) { if (!layers.has(name)) layers.set(name, colour || 7); },
      line(l, a, b, c) { this.layer(l); ents.push(`0\nLINE\n8\n${l}\n${c ? `62\n${c}\n` : ''}10\n${f(a[0])}\n20\n${f(a[1])}\n30\n0\n11\n${f(b[0])}\n21\n${f(b[1])}\n31\n0`); },
      poly(l, pts, closed, c) { if (pts.length < 2) return; this.layer(l); ents.push(`0\nPOLYLINE\n8\n${l}\n${c ? `62\n${c}\n` : ''}66\n1\n70\n${closed ? 1 : 0}\n10\n0\n20\n0\n30\n0\n` + pts.map((p) => `0\nVERTEX\n8\n${l}\n10\n${f(p[0])}\n20\n${f(p[1])}\n30\n0`).join('\n') + `\n0\nSEQEND\n8\n${l}`); },
      circle(l, c0, r, c) { this.layer(l); ents.push(`0\nCIRCLE\n8\n${l}\n${c ? `62\n${c}\n` : ''}10\n${f(c0[0])}\n20\n${f(c0[1])}\n30\n0\n40\n${f(r)}`); },
      text(l, p, h, s, align = 0, rot = 0) {
        this.layer(l);
        const t = String(s).replace(/[\r\n]+/g, ' ').replace(/²/g, '2').replace(/[^\x20-\x7E]/g, '?');
        ents.push(`0\nTEXT\n8\n${l}\n10\n${f(p[0])}\n20\n${f(p[1])}\n30\n0\n40\n${f(h)}\n1\n${t}\n${rot ? `50\n${f(rot)}\n` : ''}${align ? `72\n${align}\n11\n${f(p[0])}\n21\n${f(p[1])}\n31\n0` : ''}`.replace(/\n$/, ''));
      },
      toString() {
        const lt = [...layers.entries()].map(([n, c]) => `0\nLAYER\n2\n${n}\n70\n0\n62\n${c}\n6\nCONTINUOUS`).join('\n');
        return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${layers.size}\n${lt}\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${ents.join('\n')}\n0\nENDSEC\n0\nEOF\n`;
      },
    };
  }
  /* One sheet as DXF, 1 mm per 4 drawing units, Y up. */
  function exportDXF(doc) {
    const D = DXF(), k = 0.25, P = (x, y) => [x * k, -y * k];
    ['FRAME', 'PARTS', 'PINS', 'WIRES', 'TEXT', 'LABELS'].forEach((l, i) => D.layer(l, [7, 7, 8, 1, 7, 5][i]));
    const pg = Loom.pageOf(doc);
    if (pg) {
      const o = pg.m, ib = pg.m + pg.b;
      D.poly('FRAME', [P(o, o), P(pg.W - o, o), P(pg.W - o, pg.H - o), P(o, pg.H - o)], true);
      D.poly('FRAME', [P(ib, ib), P(pg.W - ib, ib), P(pg.W - ib, pg.H - ib), P(ib, pg.H - ib)], true);
    }
    doc.parts.forEach((p) => {
      const r = Loom.resolved(doc, p), tr = (x, y) => { const q = Loom.rotPt(x, y, r.w, r.h, p.rot, p.flip); return P(p.x + q.x, p.y + q.y); };
      const rotDeg = -((p.rot || 0) % 4) * 90;
      r.shapes.forEach((s) => {
        const ox = s.tx || 0, oy = s.ty || 0;
        if (s.t === 'line') D.line('PARTS', tr(s.x1 + ox, s.y1 + oy), tr(s.x2 + ox, s.y2 + oy));
        else if (s.t === 'rect') D.poly('PARTS', [[s.x, s.y], [s.x + s.width, s.y], [s.x + s.width, s.y + s.h], [s.x, s.y + s.h]].map(([x, y]) => tr(x + ox, y + oy)), true);
        else if (s.t === 'circle') D.circle('PARTS', tr(s.cx + ox, s.cy + oy), s.r * k);
        else if (s.t === 'path') flattenPath(s.d).forEach((pl) => D.poly('PARTS', pl.map(([x, y]) => tr(x + ox, y + oy)), false));
        else if (s.t === 'text') { const t = Loom.tmpl(s.text, r.props); if (t) D.text('PARTS', tr(s.x + ox, s.y + oy), (s.size || 9) * 0.72 * k, t, s.anchor === 'start' ? 0 : s.anchor === 'end' ? 2 : 1, rotDeg); }
      });
      const bb = Loom.partBox(doc, p), d = r.def || {};
      if (!d.noLabel && p.label) D.text('TEXT', P(bb.x + bb.w / 2, bb.y - 7), 11 * 0.72 * k, p.label, 1);
      const sub = d.sub ? Loom.tmpl(d.sub, r.props).trim() : '';
      if (sub) D.text('TEXT', P(bb.x + bb.w / 2, bb.y + bb.h + 13), 9 * 0.72 * k, sub, 1);
    });
    doc.wires.forEach((w) => {
      const pts = Loom.wirePoints(doc, w); if (!pts) return;
      D.poly('WIRES', pts.map((q) => P(q.x, q.y)), false, aciOf((Loom.colourById(doc, w.colour) || {}).hex));
      const q = Loom.wireLabelPos(doc, w);
      if (q && (doc.settings || {}).labels !== 'none') D.text('LABELS', P(q.x, q.y), 8.5 * 0.72 * k, Loom.wireLabelText(doc, w, (doc.settings || {}).labels || 'full'), q.horiz || q.moved ? 1 : 0);
    });
    return D.toString();
  }
  /* A harness formboard at 1:1 in millimetres. */
  function exportFormboardDXF(project, harness) {
    const D = DXF(), fb = Loom.formboard(project, harness), pos = Loom.formboardGeometry(fb.layout);
    D.layer('BRANCHES', 7); D.layer('NODES', 1); D.layer('TEXT', 7); D.layer('DIMS', 5);
    const P = (id) => { const q = pos.get(id); return [q.x, -q.y]; };
    fb.branches.forEach((b) => {
      const a = P(b.a), c = P(b.b);
      D.line('BRANCHES', a, c);
      const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2, ang = (Math.atan2(c[1] - a[1], c[0] - a[0]) * 180) / Math.PI;
      const up = ang > 90 || ang < -90 ? ang + 180 : ang;
      D.text('DIMS', [mx, my + 4], 3.5, `${b.length} mm  ${b.count}w  D${b.diameter}${b.sleeveSize ? '  ' + b.sleeveSize : ''}`, 1, up);
    });
    fb.nodes.forEach((n) => { const c = P(n.id); D.circle('NODES', c, n.kind === 'end' ? 6 : 3); if (n.label) D.text('TEXT', [c[0] + 9, c[1] + 2], 5, n.label, 0); });
    D.text('TEXT', [0, 40], 8, `${project.title}: ${harness} formboard (1:1, mm)`, 0);
    return D.toString();
  }

  /* ---------------- Read-only HTML page ---------------- */
  function shareHTML(project, opts = {}) {
    const vs = Loom.views(project), nets = Loom.nets ? Loom.nets(project) : [];
    const build = Loom.buildChecklistData ? Loom.buildChecklistData(project) : null, startBuild = !!(opts.checklist && build);
    const netOf = {}; const info = nets.map((n, i) => { n.wires.forEach((x) => { netOf[x.wire.id] = i; }); return { name: n.name, wires: n.wires.map((x) => ({ s: x.sheet.name, n: x.wire.name, c: Loom.wireCode(Loom.view(project, x.sheet), x.wire), a: Loom.pinName(Loom.view(project, x.sheet), x.wire.from), b: Loom.pinName(Loom.view(project, x.sheet), x.wire.to) })) }; });
    const wl = Loom.wireList(project);
    const m = project.meta;
    const data = JSON.stringify({ netOf, info, build }).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(project.title)}</title>
<meta name="generator" content="LoomWright ${esc(Loom.VERSION)}">
<style>
:root{--bg:#f3f4f6;--panel:#fff;--line:#d5d9de;--ink:#1d2320;--muted:#5b625e;--accent:#2f6fde}
@media (prefers-color-scheme:dark){:root{--bg:#1c1f22;--panel:#25292d;--line:#3a4046;--ink:#e6e8ea;--muted:#9aa3ab}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.45 "Segoe UI",system-ui,sans-serif}
header{display:flex;flex-wrap:wrap;gap:4px 16px;align-items:baseline;padding:12px 16px;background:var(--panel);border-bottom:1px solid var(--line)}
header h1{font-size:16px;margin:0}header span{color:var(--muted)}
nav{display:flex;gap:4px;overflow-x:auto;padding:8px 16px;border-bottom:1px solid var(--line);background:var(--panel)}
nav button{font:inherit;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:4px;padding:4px 10px;cursor:pointer;white-space:nowrap}
nav button.on{background:var(--accent);border-color:var(--accent);color:#fff}
main{padding:16px;display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:16px}
@media (max-width:800px){main{grid-template-columns:1fr}}
.sheet{background:#fff;border:1px solid var(--line);border-radius:4px;overflow:auto}.sheet svg{display:block;width:100%;height:auto;min-width:640px}
.sheet [data-wire]{cursor:pointer}.sheet .on{stroke:rgba(47,111,222,.45)!important}
aside{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:12px;align-self:start}
aside h2{font-size:13px;margin:0 0 6px}aside ul{margin:0;padding-left:18px}aside li{margin:2px 0}
table{border-collapse:collapse;width:100%;background:var(--panel);font-size:12px}th,td{border:1px solid var(--line);padding:4px 6px;text-align:left}th{background:var(--bg)}
.mono{font-family:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace}[hidden]{display:none!important}
footer{padding:8px 16px 24px;color:var(--muted);font-size:12px}
#build{grid-column:1/-1}#build .bt{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
#build h2{font-size:14px;margin:14px 0 6px}.prog{flex:1;min-width:160px;height:10px;background:var(--line);border-radius:5px;overflow:hidden}.prog i{display:block;height:100%;background:#2e8540}
.bw{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin:6px 0}.bw.done{border-color:#2e8540}.bw.fail{border-color:#c0392b}
.bw .t{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.bw .t b{font-size:15px}.bw .r{color:var(--muted);font-size:12px}
.bw .k{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}.bw .k button{font:inherit;font-size:14px;min-width:64px;min-height:40px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:6px;padding:4px 10px}
.bw .k button.y{background:#2e8540;border-color:#2e8540;color:#fff}.bw .k button.n{background:#c0392b;border-color:#c0392b;color:#fff}
.bw input{font:inherit;width:100%;margin-top:6px;padding:6px;border:1px solid var(--line);border-radius:4px;background:var(--bg);color:var(--ink)}
.bbtn{font:inherit;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:4px;padding:6px 10px}
</style></head><body>
<header><h1>${esc(project.title)}</h1><span>${esc(m.project || '')}</span><span>Rev ${esc(m.revision || '')} · ${esc(m.date || '')}</span><span>${vs.length} sheet${vs.length > 1 ? 's' : ''}, ${wl.length} wires</span></header>
<nav>${vs.map((v, i) => `<button data-tab="s${i}"${i ? '' : ' class="on"'}>${i + 1} ${esc(v.sheet.name)}</button>`).join('')}<button data-tab="list">Wire list</button>${build ? '<button data-tab="build">Build checklist</button>' : ''}</nav>
<main><div>${vs.map((v, i) => `<div class="sheet" id="s${i}"${i ? ' hidden' : ''}>${Loom.exportSVG(v, { tag: true })}</div>`).join('')}
<div id="list" hidden><table><thead><tr><th>Sheet</th><th>Wire</th><th>From</th><th>To</th><th>Code</th><th>mm²</th><th>m</th><th>Circuit</th><th>Harness</th></tr></thead><tbody>${wl.map((r) => `<tr><td>${esc(r.sheet)}</td><td class="mono">${esc(r.name)}</td><td class="mono">${esc(r.from)}</td><td class="mono">${esc(r.to)}</td><td class="mono">${esc(r.code)}</td><td class="mono">${esc(r.gauge)}</td><td class="mono">${esc(r.length)}</td><td>${esc(r.circuit)}</td><td>${esc(r.harness)}</td></tr>`).join('')}</tbody></table></div></div>
${build ? `<div id="build" hidden><div class="bt"><span class="prog"><i id="bp"></i></span><span id="bpt"></span><button class="bbtn" id="bexp">Export progress</button><button class="bbtn" id="bclr">Clear ticks on this device</button></div><p class="r" style="color:var(--muted)">Tick each wire as you go. Ticks are kept on this device; Export progress and import the file in LoomWright (Lists, Build) to bring them back.</p><div id="bl"></div></div>` : ''}
<aside id="info"><h2>Trace a circuit</h2><p>Click any wire to see everything it connects to, on every sheet.</p></aside></main>
<footer>Read-only copy made with LoomWright ${esc(Loom.VERSION)}, free and open-source wiring software (GPL-3.0).</footer>
<script>
const D=${data};
const tabs=document.querySelectorAll('nav button');
function show(id){tabs.forEach(x=>x.classList.toggle('on',x.dataset.tab===id));document.querySelectorAll('.sheet,#list,#build').forEach(el=>el.hidden=el.id!==id);const a=document.getElementById('info');if(a)a.hidden=id==='build';}
tabs.forEach(b=>b.onclick=()=>show(b.dataset.tab));
if(D.build){
const KEY='loomwright-build-'+(D.build.project||D.build.title);let S={};
try{S=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){S={};}
D.build.harnesses.forEach(h=>h.wires.forEach(w=>{if(!S[w.id])S[w.id]=Object.assign({},w.build||{});}));
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}};
const STEPS=[['cut','Cut'],['ends','Ends'],['fitted','Fitted']];
function draw(){let tot=0,done=0;document.getElementById('bl').innerHTML=D.build.harnesses.map(h=>'<h2>'+esc(h.harness)+'</h2>'+h.wires.map(w=>{const s=S[w.id]||{};tot+=4;done+=(s.cut?1:0)+(s.ends?1:0)+(s.fitted?1:0)+(s.test==='pass'?1:0);
const all=s.cut&&s.ends&&s.fitted&&s.test==='pass';return '<div class="bw'+(all?' done':'')+(s.test==='fail'?' fail':'')+'" data-w="'+esc(w.id)+'"><div class="t"><b class="mono">'+esc(w.name)+'</b><span class="mono">'+esc(w.code)+' '+esc(w.gauge)+' mm²</span>'+(w.cut?'<span class="mono">cut '+esc(w.cut)+' m</span>':'')+'</div><div class="r mono">'+esc(w.from)+' → '+esc(w.to)+'</div><div class="k">'+STEPS.map(([k,l])=>'<button data-k="'+k+'" class="'+(s[k]?'y':'')+'">'+l+'</button>').join('')+'<button data-k="test" class="'+(s.test==='pass'?'y':s.test==='fail'?'n':'')+'">'+(s.test==='pass'?'Test ✓':s.test==='fail'?'Test ✗':'Test')+'</button></div><input data-n placeholder="Note" value="'+esc(s.note||'')+'"></div>';}).join('')).join('');
const pct=tot?Math.round(done/tot*100):0;document.getElementById('bp').style.width=pct+'%';document.getElementById('bpt').textContent=pct+'% done';}
document.getElementById('bl').addEventListener('click',e=>{const b=e.target.closest('button[data-k]');if(!b)return;const id=b.closest('[data-w]').dataset.w,s=S[id]=S[id]||{},k=b.dataset.k;
if(k==='test')s.test=s.test==='pass'?'fail':s.test==='fail'?'':'pass';else s[k]=!s[k];s.at=new Date().toISOString().slice(0,10);save();draw();});
document.getElementById('bl').addEventListener('change',e=>{if(!e.target.matches('[data-n]'))return;const id=e.target.closest('[data-w]').dataset.w;(S[id]=S[id]||{}).note=e.target.value;save();});
document.getElementById('bexp').onclick=()=>{const blob=new Blob([JSON.stringify({format:'loomwright-build-progress',project:D.build.project,title:D.build.title,at:new Date().toISOString(),wires:S},null,1)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(D.build.title||'loom').replace(/[^A-Za-z0-9-]+/g,'-')+'-progress.json';document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),500);};
document.getElementById('bclr').onclick=()=>{if(!confirm('Clear the ticks kept on this device?'))return;S={};D.build.harnesses.forEach(h=>h.wires.forEach(w=>{S[w.id]=Object.assign({},w.build||{});}));save();draw();};
draw();
}
${startBuild ? "show('build');" : ''}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
document.addEventListener('click',e=>{const t=e.target.closest('[data-wire]');if(!t)return;const n=D.netOf[t.dataset.wire];
document.querySelectorAll('.on').forEach(x=>x.classList.remove('on'));if(n==null)return;const net=D.info[n];
net.wires.forEach(()=>{});document.querySelectorAll('[data-wire]').forEach(x=>{if(D.netOf[x.dataset.wire]===n&&x.tagName==='path')x.classList.add('on');});
document.getElementById('info').innerHTML='<h2>'+esc(net.name)+'</h2><ul>'+net.wires.map(w=>'<li><b class="mono">'+esc(w.n)+'</b> '+esc(w.c)+' '+esc(w.a)+' → '+esc(w.b)+' <span style="color:var(--muted)">('+esc(w.s)+')</span></li>').join('')+'</ul>';});
</script></body></html>`;
  }

  Object.assign(Loom, { resolveColour, parseColourSpec, parseGauge, parseCSV, boxPartDef, importWireList, importLengths, wirevizData, exportWireViz, importWireViz, importKiCad, sexpr, flattenPath, exportDXF, exportFormboardDXF, shareHTML, hasYAML: !!YAML });
  return Loom;
});
