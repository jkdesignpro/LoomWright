/*
 * LoomWright planning helpers: wire colour suggestions, cable and parts stock with a
 * shopping list, build and test tracking, bundle heat derating, grommet fill and
 * CAN bus checks.
 *
 * Extends window.Loom; needs loom-core.js, loom-data.js, loom-nets.js and loom-reports.js first.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: AGPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./loom-data.js'); require('./loom-nets.js'); require('./loom-reports.js'); module.exports = factory(require('./loom-core.js')); }
  else factory(root.Loom);
})(typeof self !== 'undefined' ? self : this, function (Loom) {
  'use strict';
  const projectOf = (d) => (d && d.project) || d;
  const key = (sheet, partId, pin) => `${sheet.id}|${partId}|${pin}`;
  const allWires = (project) => Loom.views(project).flatMap((v) => v.wires.map((w) => ({ v, w })));
  const comboKey = (c, t) => (c || '') + '|' + (t || '');

  /* ---------------- Colour helper ---------------- */
  /* Colour conventions that are safe to suggest. Lucas / Land Rover is well established;
     for DIN and SAE only the earth and the permanent battery feed are suggested. */
  const CONVENTION = {
    lr: { earth: 'black', battery: 'brown', ignition: 'white', why: { earth: 'Lucas / Land Rover earth colour', battery: 'Lucas permanent battery feed colour', ignition: 'Lucas ignition feed colour' } },
    din: { earth: 'brown', battery: 'red', why: { earth: 'DIN 72551 earth (31) colour', battery: 'DIN 72551 permanent feed (30) colour' } },
    sae: { earth: 'black', battery: 'red', why: { earth: 'usual earth colour', battery: 'usual battery feed colour' } },
  };
  const CONNECTORISH = new Set(['conn', 'connector', 'plug', 'terminal_block', 'socket_12v']);

  /* What a wire's net is: its wires, whether it is earth, a battery feed or an ignition feed. */
  function netContext(project, sheetId, w) {
    const B = Loom.buildNet(project, { switches: 'open', relays: 'open', protect: false });
    const sheet = project.sheets.find((s) => s.id === sheetId);
    const R = (end) => (end && end.part ? B.uf.find(key(sheet, end.part, end.pin)) : null);
    const roots = new Set([R(w.from), R(w.to)].filter(Boolean));
    const earth = B.uf.find(Loom.EARTH);
    const ws = allWires(project);
    const rootOfWire = (x) => B.uf.find(key(x.v.sheet, x.w.from.part, x.w.from.pin));
    const inNet = ws.filter((x) => x.w !== w && x.w.id !== w.id && roots.has(rootOfWire(x)));
    let battery = false, ignition = false;
    B.inv.forEach((it) => {
      if (it.b.kind === 'source' && it.p.type !== 'solar' && roots.has(B.uf.find(key(it.sheet, it.p.id, it.b.source)))) battery = true;
      if ((it.p.type === 'net_label' || it.p.type === 'offpage') && roots.has(B.uf.find(key(it.sheet, it.p.id, 'L')))) {
        if (/\bign|\b15\b|ignition/i.test(String(it.p.props.text || '') + ' ' + String(it.p.props.link || ''))) ignition = true;
      }
    });
    if (/\bign|ignition/i.test(w.circuit || '') || inNet.some((x) => /\bign|ignition/i.test(x.w.circuit || ''))) ignition = true;
    return { roots, earth: roots.has(earth), battery, ignition, inNet, rootOfWire, ws };
  }

  /* Ranked colour suggestions for a wire (existing, or a new one with from/to ends).
     opts.inventory: the user's cable stock; opts.limit: how many to return. */
  function suggestColours(d, sheetId, w, opts = {}) {
    const project = projectOf(d), std = project.settings.standard || 'lr', conv = CONVENTION[std] || {};
    const ctx = netContext(project, sheetId, w), cands = new Map();
    const stockCable = ((opts.inventory || {}).cable || []).filter((c) => c.colour);
    const gauge = String(w.gauge || '');
    const sameGauge = stockCable.filter((c) => String(c.gauge) === gauge);
    const add = (c, t) => { if (!c || !Loom.colourById(project, c)) return; const k = comboKey(c, t); if (!cands.has(k)) cands.set(k, { colour: c, tracer: t || '' }); };
    const stockOnly = !!project.settings.stockOnly;
    if (sameGauge.length) sameGauge.forEach((c) => add(c.colour, c.tracer));
    else if ((project.settings.stock || []).length) project.settings.stock.forEach((c) => add(c));
    else if (std === 'custom') (project.customColours || []).forEach((c) => add(c.id));
    else Loom.COLOURS.concat(project.customColours || []).forEach((c) => add(c.id));
    if (!stockOnly) { ctx.inNet.forEach((x) => add(x.w.colour, x.w.tracer)); if (w.colour) add(w.colour, w.tracer); }
    const uses = new Map();
    ctx.ws.forEach((x) => { const k = comboKey(x.w.colour, x.w.tracer); uses.set(k, (uses.get(k) || 0) + 1); });
    // wires already on the connectors this wire lands on
    const sheet = project.sheets.find((s) => s.id === sheetId), v = Loom.view(project, sheet);
    const endParts = [w.from, w.to].filter((e) => e && e.part).map((e) => v.parts.find((p) => p.id === e.part)).filter((p) => p && CONNECTORISH.has(p.type));
    const need = (parseFloat(w.length) || 1) + (parseFloat(project.settings.cutAllowance) >= 0 ? parseFloat(project.settings.cutAllowance) : 0.15);
    const out = [];
    cands.forEach((c, k) => {
      let score = 0;
      const reasons = [];
      const code = Loom.wireCode(project, c);
      const match = ctx.inNet.filter((x) => comboKey(x.w.colour, x.w.tracer) === k);
      if (match.length) { score += 100; reasons.push(`same circuit as ${match.slice(0, 3).map((x) => x.w.name).join(', ')}`); }
      if (ctx.earth && conv.earth) {
        if (c.colour === conv.earth && !c.tracer) { score += 60; reasons.push(conv.why.earth); }
      } else if (conv.earth && c.colour === conv.earth && !c.tracer) { score -= 40; reasons.push('keep plain ' + Loom.colourById(project, conv.earth).name.toLowerCase() + ' for earths'); }
      if (!ctx.earth && ctx.battery && conv.battery && c.colour === conv.battery) { score += 30; reasons.push(conv.why.battery); }
      if (!ctx.earth && ctx.ignition && conv.ignition && c.colour === conv.ignition) { score += 30; reasons.push(conv.why.ignition); }
      if (w.harness) {
        const clash = ctx.ws.filter((x) => x.w !== w && x.w.harness === w.harness && comboKey(x.w.colour, x.w.tracer) === k && !ctx.roots.has(ctx.rootOfWire(x)));
        if (clash.length) { score -= 50; reasons.push(`${clash.slice(0, 2).map((x) => x.w.name + (x.w.circuit ? ' (' + x.w.circuit + ')' : '')).join(', ')} already use${clash.length > 1 ? '' : 's'} it in ${w.harness}`); }
      }
      endParts.forEach((p) => {
        const there = v.wires.filter((x) => x !== w && x.id !== w.id && (x.from.part === p.id || x.to.part === p.id) && comboKey(x.colour, x.tracer) === k && !ctx.roots.has(ctx.rootOfWire({ v, w: x })));
        if (there.length) { score -= 70; reasons.push(`already in ${p.label || p.type} for another circuit`); }
      });
      const st = stockCable.filter((s) => s.colour === c.colour && (s.tracer || '') === c.tracer && (!gauge || String(s.gauge) === gauge));
      const metres = st.reduce((a, s) => a + (parseFloat(s.metres) || 0), 0);
      if (st.length) { if (metres < need) { score -= 30; reasons.push(`only ${+metres.toFixed(1)} m in stock`); } else { score += 10; reasons.push(`${+metres.toFixed(1)} m in stock`); } }
      if (w.id && comboKey(w.colour, w.tracer) === k) { score += 5; reasons.push('its colour now'); }
      score -= Math.min(20, (uses.get(k) || 0) * 0.5);
      out.push({ colour: c.colour, tracer: c.tracer, code, name: Loom.wireColourName(project, c), hex: (Loom.colourById(project, c.colour) || {}).hex, score: +score.toFixed(1), reasons, stock: st.length ? +metres.toFixed(1) : null });
    });
    out.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
    return { net: { earth: ctx.earth, battery: ctx.battery, ignition: ctx.ignition, wires: ctx.inNet.map((x) => x.w.name) }, suggestions: out.slice(0, opts.limit || 6) };
  }

  /* ---------------- Stock and shopping list ---------------- */
  const REELS = [5, 10, 25, 50, 100];
  function normaliseInventory(inv) {
    const o = inv && typeof inv === 'object' ? inv : {};
    return {
      cable: (Array.isArray(o.cable) ? o.cable : []).filter((c) => c && c.colour).map((c) => ({ id: c.id || Loom.uid('stk'), gauge: String(c.gauge || ''), colour: c.colour, tracer: c.tracer || '', insulation: c.insulation || '', metres: Math.max(0, parseFloat(c.metres) || 0) })),
      items: (Array.isArray(o.items) ? o.items : []).filter((x) => x && (x.name || x.mpn)).map((x) => ({ id: x.id || Loom.uid('stk'), name: x.name || '', spec: x.spec || '', mpn: x.mpn || '', qty: Math.max(0, parseFloat(x.qty) || 0) })),
    };
  }
  const itemMatch = (it, r) => (it.mpn && r.mpn ? it.mpn.trim().toLowerCase() === r.mpn.trim().toLowerCase() : it.name.trim().toLowerCase() === r.name.trim().toLowerCase() && (!it.spec || it.spec.trim().toLowerCase() === (r.spec || '').trim().toLowerCase()));
  /* What the project needs, what is in stock and what to buy. */
  function shoppingList(d, inventory, opts = {}) {
    const project = projectOf(d), inv = normaliseInventory(inventory), margin = opts.margin != null ? opts.margin : 0.1;
    const allow = parseFloat(project.settings.cutAllowance) >= 0 ? parseFloat(project.settings.cutAllowance) : 0.15;
    const groups = new Map();
    allWires(project).forEach(({ v, w }) => {
      if (w.cable && (project.cables || []).some((c) => c.id === w.cable && c.type !== 'single')) return; // cores of a multicore come with the cable
      const k = [w.gauge, w.colour, w.tracer || '', w.insulation || ''].join('|');
      if (!groups.has(k)) groups.set(k, { gauge: String(w.gauge || ''), colour: w.colour, tracer: w.tracer || '', insulation: w.insulation || '', code: Loom.wireCode(v, w), name: Loom.wireColourName(v, w), need: 0, wires: 0, unknown: 0 });
      const g = groups.get(k), len = parseFloat(w.length);
      g.wires++; if (len > 0) g.need += len + allow; else g.unknown++;
    });
    const costs = project.settings.cableCosts || {};
    const cable = [...groups.values()].map((g) => {
      const have = inv.cable.filter((c) => c.gauge === g.gauge && c.colour === g.colour && (c.tracer || '') === g.tracer && (!c.insulation || !g.insulation || c.insulation === g.insulation)).reduce((a, c) => a + c.metres, 0);
      const want = g.need * (1 + margin), buy = Math.max(0, Math.ceil((want - have) * 10) / 10);
      const pm = parseFloat(costs[g.gauge]);
      return { ...g, need: +g.need.toFixed(2), have: +have.toFixed(2), buy: +buy.toFixed(1), reel: buy > 0 ? REELS.find((r) => r >= buy) || Math.ceil(buy / 100) * 100 : null, cost: buy > 0 && pm >= 0 ? +(pm * buy).toFixed(2) : null };
    }).sort((a, b) => parseFloat(a.gauge) - parseFloat(b.gauge) || a.code.localeCompare(b.code));
    const parts = Loom.bom(project).map((r) => {
      const have = inv.items.filter((it) => itemMatch(it, r)).reduce((a, it) => a + it.qty, 0);
      const buy = Math.max(0, r.qty - have);
      return { name: r.name, spec: r.spec, mpn: r.mpn, supplier: r.supplier, need: r.qty, have, buy, unit: r.unit, cost: buy && r.unit != null ? +(r.unit * buy).toFixed(2) : null, refs: r.refs };
    });
    const total = cable.concat(parts).reduce((a, x) => a + (x.cost || 0), 0);
    return { cable, parts, total: +total.toFixed(2), currency: project.settings.currency || '£', unknown: cable.reduce((a, c) => a + c.unknown, 0), toBuy: cable.filter((c) => c.buy > 0).length + parts.filter((p) => p.buy > 0).length };
  }
  /* Take what this project uses out of stock. Returns the new inventory and what changed. */
  function takeFromStock(d, inventory) {
    const project = projectOf(d), inv = normaliseInventory(JSON.parse(JSON.stringify(inventory || {}))), list = shoppingList(project, inv, { margin: 0 }), changes = [];
    list.cable.forEach((g) => {
      let left = g.need;
      inv.cable.filter((c) => c.gauge === g.gauge && c.colour === g.colour && (c.tracer || '') === g.tracer).forEach((c) => {
        if (left <= 0) return;
        const take = Math.min(c.metres, left);
        if (take > 0) { c.metres = +(c.metres - take).toFixed(2); left -= take; changes.push(`${g.gauge} mm² ${g.code}: ${+take.toFixed(1)} m`); }
      });
    });
    list.parts.forEach((r) => {
      let left = r.need;
      inv.items.filter((it) => itemMatch(it, r)).forEach((it) => {
        if (left <= 0) return;
        const take = Math.min(it.qty, left);
        if (take > 0) { it.qty -= take; left -= take; changes.push(`${r.name}${r.mpn ? ' ' + r.mpn : ''}: ${take}`); }
      });
    });
    return { inventory: inv, changes };
  }

  /* ---------------- Build and test tracking ---------------- */
  const BUILD_STEPS = [['cut', 'Cut'], ['ends', 'Ends done'], ['fitted', 'Fitted'], ['test', 'Tested']];
  function buildProgress(d) {
    const project = projectOf(d), by = new Map(), all = { harness: 'All harnesses', wires: 0, cut: 0, ends: 0, fitted: 0, pass: 0, fail: 0, failing: [] };
    allWires(project).forEach(({ v, w }) => {
      const h = w.harness || 'No harness', b = w.build || {};
      if (!by.has(h)) by.set(h, { harness: h, wires: 0, cut: 0, ends: 0, fitted: 0, pass: 0, fail: 0, failing: [] });
      [by.get(h), all].forEach((g) => {
        g.wires++; if (b.cut) g.cut++; if (b.ends) g.ends++; if (b.fitted) g.fitted++;
        if (b.test === 'pass') g.pass++;
        if (b.test === 'fail') { g.fail++; g.failing.push({ sheetId: v.sheet.id, id: w.id, name: w.name, note: b.note || '' }); }
      });
    });
    const pct = (g) => (g.wires ? Math.round(((g.cut + g.ends + g.fitted + g.pass) / (g.wires * 4)) * 100) : 0);
    return { harnesses: [...by.values()].map((g) => ({ ...g, pct: pct(g) })).sort((a, b) => a.harness.localeCompare(b.harness)), total: { ...all, pct: pct(all) } };
  }
  /* Set build fields on a wire: cut, ends, fitted (true/false), test ('pass', 'fail' or ''), note. */
  function setBuild(w, fields) {
    const b = { ...(w.build || {}) };
    ['cut', 'ends', 'fitted'].forEach((k) => { if (fields[k] != null) b[k] = !!fields[k]; });
    if (fields.test != null) b.test = ['pass', 'fail'].includes(fields.test) ? fields.test : '';
    if (fields.note != null) b.note = String(fields.note);
    if (fields.by != null) b.by = String(fields.by);
    b.at = fields.at || new Date().toISOString().slice(0, 10);
    const empty = !b.cut && !b.ends && !b.fitted && !b.test && !b.note;
    if (empty) delete w.build; else w.build = b;
    return w.build || null;
  }
  /* Progress ticked on a phone (from the shared page): { project, wires: { id: {cut, ends, fitted, test, note} } }. */
  function importBuildProgress(d, data) {
    const project = projectOf(d);
    if (!data || typeof data !== 'object' || !data.wires) throw new Error('This is not a LoomWright build checklist file.');
    if (data.project && project.id && data.project !== project.id) throw new Error('This checklist belongs to another project.');
    let n = 0;
    allWires(project).forEach(({ w }) => {
      const x = data.wires[w.id];
      if (!x) return;
      const before = JSON.stringify(w.build || {});
      // keep whichever is further on: a tick on either side stays ticked
      const cur = w.build || {};
      setBuild(w, { cut: cur.cut || x.cut, ends: cur.ends || x.ends, fitted: cur.fitted || x.fitted, test: x.test || cur.test || '', note: x.note || cur.note || '', at: x.at || cur.at });
      if (JSON.stringify(w.build || {}) !== before) n++;
    });
    return n;
  }
  /* Data for the phone checklist on the shared page. */
  function buildChecklistData(d) {
    const project = projectOf(d), cut = Loom.cutList(project);
    return {
      format: 'loomwright-build', project: project.id || '', title: project.title,
      harnesses: cut.map((g) => ({ harness: g.harness, wires: g.rows.map((r) => ({ id: r.id, name: r.name, code: r.code, gauge: r.gauge, cut: r.cut, from: r.from, to: r.to, build: (allWires(project).find((x) => x.w.id === r.id) || { w: {} }).w.build || {} })) })),
    };
  }

  /* ---------------- Heat derating, grommets, CAN bus ---------------- */
  const tMaxOf = (ins) => { const x = Loom.INSULATION.find((i) => i.id === (ins || '')); const m = x && /(\d+)/.exec(x.temp || ''); return m ? +m[1] : null; };
  function harnessAmbient(project, h) {
    const t = (project.settings.harnessTemps || {})[h];
    if (parseFloat(t) > -60) return parseFloat(t);
    return /engine|bay|exhaust|motor/i.test(h || '') ? 80 : 30;
  }
  const groupFactor = (n) => (n <= 1 ? 1 : n <= 3 ? 0.8 : n <= 6 ? 0.7 : n <= 9 ? 0.6 : 0.5);
  /* What each wire can carry in its harness: ambient temperature and how many loaded wires share the bundle. */
  /* A copy of the project for formboard work, so checks never change the drawing. */
  function layoutCopy(project) {
    if (!project.harnessLayouts || !Object.keys(project.harnessLayouts).length) return null;
    const c = {}; Object.keys(project).forEach((k) => { if (k !== 'revisions') c[k] = project[k]; });
    return JSON.parse(JSON.stringify(c));
  }
  /* Loaded wires sharing a bundle: the busiest formboard branch each wire runs through. */
  function bundleLoads(copy) {
    const most = new Map();
    if (!copy) return most;
    const byName = new Map(allWires(copy).map((x) => [x.w.name + '|' + (x.w.harness || ''), x.w]));
    Object.keys(copy.harnessLayouts).forEach((h) => {
      Loom.formboard(copy, h).branches.forEach((b) => {
        const ws = b.wires.map((n) => byName.get(n + '|' + h)).filter(Boolean), n = ws.filter((w) => parseFloat(w.current) > 0).length;
        ws.forEach((w) => most.set(w.id, Math.max(most.get(w.id) || 0, n)));
      });
    });
    return most;
  }
  function derating(d, copy) {
    const project = projectOf(d), ws = allWires(project), most = bundleLoads(copy === undefined ? layoutCopy(project) : copy);
    return ws.filter(({ w }) => parseFloat(w.current) > 0).map(({ v, w }) => {
      const g = Loom.gaugeInfo(w.gauge), amb = harnessAmbient(project, w.harness), tmax = tMaxOf(w.insulation) || 105, assumed = !tMaxOf(w.insulation);
      const n = most.get(w.id) || 1, fG = groupFactor(n);
      const fT = amb >= tmax ? 0 : Math.min(1, Math.sqrt((tmax - amb) / (tmax - 30)));
      const cap = g ? g.guideA * fT * fG : null, I = parseFloat(w.current);
      const better = cap != null && I > cap ? Loom.GAUGES.find((x) => x.guideA * fT * fG >= I) : null;
      return { sheetId: v.sheet.id, id: w.id, name: w.name, harness: w.harness || '', gauge: w.gauge, current: I, ambient: amb, tmax, assumed, loaded: n, grouped: most.has(w.id), fT: +fT.toFixed(2), fG, capacity: cap == null ? null : +cap.toFixed(1), status: cap == null ? 'unknown' : I > cap ? 'over' : I > cap * 0.9 ? 'close' : 'ok', suggest: better ? better.mm2 : null };
    });
  }
  /* Bundle fill at each grommet or bulkhead hole drawn on a harness formboard. */
  function grommetFill(d, copy) {
    const project = projectOf(d), out = [];
    Object.entries(project.harnessLayouts || {}).forEach(([h, lay]) => {
      const gs = (lay.nodes || []).filter((n) => n.kind === 'grommet');
      if (!gs.length) return;
      if (copy === undefined) copy = layoutCopy(project);
      const fb = Loom.formboard(copy, h), wireBy = new Map(allWires(project).map((x) => [x.w.name + '|' + (x.w.harness || ''), x.w]));
      gs.forEach((n) => {
        const names = new Set();
        fb.branches.filter((b) => b.a === n.id || b.b === n.id).forEach((b) => b.wires.forEach((x) => names.add(x)));
        const ws = [...names].map((x) => wireBy.get(x + '|' + h)).filter(Boolean);
        const dia = Loom.bundleDiameter(ws), hole = parseFloat(n.hole) || null, fill = hole ? dia / hole : null;
        out.push({ harness: h, node: n.id, label: n.label || 'Grommet', hole, wires: ws.map((w) => w.name), diameter: +dia.toFixed(1), fill: fill == null ? null : Math.round(fill * 100), status: !hole ? 'no size' : fill > 1 ? 'too small' : fill > 0.8 ? 'tight' : 'ok' });
      });
    });
    return out;
  }
  /* Which grommets (formboard holes or bulkhead parts) each wire passes through. */
  function wireGrommets(d) {
    const project = projectOf(d), map = new Map();
    const put = (id, g) => { if (!map.has(id)) map.set(id, []); if (!map.get(id).includes(g)) map.get(id).push(g); };
    const nameTo = new Map(allWires(project).map((x) => [x.w.name + '|' + (x.w.harness || ''), x.w.id]));
    grommetFill(project).forEach((g) => g.wires.forEach((n) => { const id = nameTo.get(n + '|' + g.harness); if (id) put(id, g.label); }));
    Loom.views(project).forEach((v) => v.wires.forEach((w) => [w.from, w.to].forEach((e) => { const p = v.parts.find((x) => x.id === e.part); if (p && p.type === 'grommet') put(w.id, p.label || 'bulkhead'); })));
    return map;
  }
  /* CAN bus: H and L swapped, terminators, twisted pair, long stubs. */
  const isCanH = (id) => /^CAN[_\s-]?H(I|IGH)?$/i.test(String(id)), isCanL = (id) => /^CAN[_\s-]?L(O|OW)?$/i.test(String(id));
  function canChecks(d) {
    const project = projectOf(d), out = [], B = Loom.buildNet(project, { switches: 'open', relays: 'open', protect: false });
    const R = (it, pin) => B.uf.find(key(it.sheet, it.p.id, pin));
    const devs = [];
    B.inv.forEach((it) => {
      const pins = Loom.resolved(it.v, it.p).pins, h = pins.find((x) => isCanH(x.id)), l = pins.find((x) => isCanL(x.id));
      if (h && l) devs.push({ it, h: R(it, h.id), l: R(it, l.id), term: it.p.type === 'can_term' || /^(yes|on|120)/i.test(String(it.p.props.term || it.p.props.terminated || '')) });
    });
    if (!devs.length) return out;
    // buses: groups of devices sharing a CANH or CANL net
    const buses = [];
    devs.forEach((dv) => {
      let bus = buses.find((b) => b.h.has(dv.h) || b.l.has(dv.l) || b.h.has(dv.l) || b.l.has(dv.h));
      if (!bus) { bus = { h: new Set(), l: new Set(), devs: [] }; buses.push(bus); }
      if (bus.h.has(dv.l) || bus.l.has(dv.h)) out.push({ level: 'error', part: dv.it.p.id, sheetId: dv.it.sheet.id, text: `CAN H and CAN L are swapped at ${dv.it.p.label || dv.it.p.type}.` });
      else { bus.h.add(dv.h); bus.l.add(dv.l); }
      bus.devs.push(dv);
    });
    const ws = allWires(project), rootW = (x) => B.uf.find(key(x.v.sheet, x.w.from.part, x.w.from.pin));
    buses.forEach((bus, i) => {
      const name = buses.length > 1 ? `CAN bus ${i + 1}` : 'The CAN bus';
      const nodes = bus.devs.filter((x) => x.it.p.type !== 'can_term'), terms = bus.devs.filter((x) => x.term);
      const seen = new Set(); const uniqTerms = terms.filter((x) => { const k = x.it.p.label || x.it.p.id; if (seen.has(k)) return false; seen.add(k); return true; });
      if (nodes.length >= 2 && uniqTerms.length !== 2) out.push({ level: 'warn', part: (uniqTerms[0] || nodes[0]).it.p.id, sheetId: (uniqTerms[0] || nodes[0]).it.sheet.id, text: `${name} has ${uniqTerms.length} terminating resistor${uniqTerms.length === 1 ? '' : 's'}. It needs exactly two, one at each end (about 60 Ω between H and L with the power off).` });
      const busWires = ws.filter((x) => { const r = rootW(x); return bus.h.has(r) || bus.l.has(r); });
      const loose = busWires.filter((x) => { const c = x.w.cable && (project.cables || []).find((k) => k.id === x.w.cable); return !c || !/twisted/.test(c.type || ''); });
      if (loose.length) out.push({ level: 'info', wire: loose[0].w.id, sheetId: loose[0].v.sheet.id, text: `${name}: ${loose.slice(0, 4).map((x) => x.w.name).join(', ')}${loose.length > 4 ? ' and more' : ''} are not in a twisted pair cable. CAN H and L should be twisted together.` });
      // a node with one wire on its CAN H pin is a stub unless it is terminated
      nodes.forEach((dv) => {
        if (dv.term) return;
        const hp = Loom.resolved(dv.it.v, dv.it.p).pins.find((x) => isCanH(x.id));
        const mine = dv.it.v.wires.filter((w) => (w.from.part === dv.it.p.id && w.from.pin === hp.id) || (w.to.part === dv.it.p.id && w.to.pin === hp.id));
        if (mine.length === 1 && parseFloat(mine[0].length) > 0.3) out.push({ level: 'warn', wire: mine[0].id, sheetId: dv.it.sheet.id, text: `${mine[0].name} is a ${mine[0].length} m stub to ${dv.it.p.label || dv.it.p.type} on ${name.toLowerCase()}. Keep CAN stubs under about 0.3 m.` });
      });
    });
    return out;
  }
  function planChecks(d) {
    const project = projectOf(d), out = [], copy = layoutCopy(project);
    derating(project, copy).forEach((x) => {
      if (x.status !== 'over') return;
      const where = `${x.harness ? 'in ' + x.harness + ' ' : ''}(${x.ambient} °C${x.grouped ? `, ${x.loaded} loaded wire${x.loaded > 1 ? 's' : ''} in the bundle` : ''})`;
      out.push({ level: 'warn', wire: x.id, sheetId: x.sheetId, text: `${x.name} carries ${x.current} A but ${x.gauge} mm² ${where} is good for about ${x.capacity} A${x.assumed ? ' (insulation not set, 105 °C assumed)' : ''}.${x.suggest ? ` Use ${x.suggest} mm².` : x.fT === 0 ? ' The insulation is not rated for this temperature.' : ''}` });
    });
    grommetFill(project, copy).forEach((g) => {
      if (g.status === 'too small') out.push({ level: 'warn', text: `${g.harness}: the bundle at ${g.label} is about ${g.diameter} mm but the hole is ${g.hole} mm.` });
      else if (g.status === 'tight') out.push({ level: 'info', text: `${g.harness}: the bundle at ${g.label} fills ${g.fill}% of the ${g.hole} mm hole. Leave room for sleeving and a spare wire.` });
    });
    return out.concat(canChecks(project));
  }
  const baseValidate = Loom.validate;
  Loom.validate = function (d) {
    const base = baseValidate(d), project = projectOf(d);
    if (!project || !Array.isArray(project.sheets)) return base;
    const extra = planChecks(project);
    return d && d.sheet ? base.concat(extra.filter((c) => !c.sheetId || c.sheetId === d.sheet.id)) : base.concat(extra);
  };

  Object.assign(Loom, { COLOUR_CONVENTIONS: CONVENTION, suggestColours, normaliseInventory, shoppingList, takeFromStock, BUILD_STEPS, buildProgress, setBuild, importBuildProgress, buildChecklistData, derating, harnessAmbient, grommetFill, wireGrommets, canChecks, planChecks });
  return Loom;
});
