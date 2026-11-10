/*
 * LoomWright circuit analysis: nets across sheets, live circuit test,
 * fuse and relay schedule with load budget, and project-level design checks.
 * Extends window.Loom; needs loom-core.js and loom-data.js first.
 *
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./loom-data.js'); module.exports = factory(require('./loom-core.js')); }
  else factory(root.Loom);
})(typeof self !== 'undefined' ? self : this, function (Loom) {
  'use strict';
  const EARTH = 'EARTH';

  class UF {
    constructor() { this.p = new Map(); }
    find(a) { let r = a; while (this.p.has(r) && this.p.get(r) !== r) r = this.p.get(r); if (!this.p.has(r)) this.p.set(r, r); let x = a; while (x !== r) { const n = this.p.get(x); this.p.set(x, r); x = n; } return r; }
    union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
  }
  const projectOf = (d) => (d && d.project) || d;
  const key = (sheet, partId, pinId) => `${sheet.id}|${partId}|${pinId}`;
  /* State key: the same physical part drawn on several sheets shares its state. */
  const partKey = (p) => (p.label ? `${p.type}|${p.label}` : p.id);

  /* Every part on every sheet, with its sheet view and behaviour. */
  function inventory(project) {
    const out = [];
    Loom.views(project).forEach((v) => v.parts.forEach((p) => out.push({ v, sheet: v.sheet, p, b: Loom.behaviour(v, p) })));
    return out;
  }

  /* Union-find over pins. opts: switches ('open' | 'closed' | state map), protect (true = fuses conduct),
     relays ('open' | 'closed' | Set of energised part keys), pdm (Set of live power module outputs),
     edges (true = also list every join, for following a circuit step by step). */
  function build(project, opts = {}) {
    const uf = new UF(), inv = inventory(project), byLabel = new Map(), edges = opts.edges ? [] : null;
    const join = (a, b, e) => { uf.union(a, b); if (edges) edges.push({ a, b, ...e }); };
    const state = (it) => (opts.state && opts.state[partKey(it.p)] != null ? opts.state[partKey(it.p)] : it.b.def || 0);
    inv.forEach((it) => {
      const { sheet, p, b } = it, k = (pin) => key(sheet, p.id, pin), at = { it };
      const r = Loom.resolved(it.v, p);
      r.pins.forEach((pn) => uf.find(k(pn.id)));
      b.links.forEach(([a, c]) => join(k(a), k(c), { kind: 'link', ...at }));
      if (b.kind === 'earth') r.pins.forEach((pn) => join(k(pn.id), EARTH, { kind: 'earth', ...at }));
      if (b.earthPins) b.earthPins.forEach((pn) => join(k(pn), EARTH, { kind: 'earth', ...at }));
      if (p.type === 'net_label' && p.props.text) join(k('L'), 'NET:' + String(p.props.text).trim().toUpperCase(), { kind: 'net', ...at });
      if (p.type === 'offpage' && p.props.link) join(k('L'), 'NET:' + String(p.props.link).trim().toUpperCase(), { kind: 'net', ...at });
      if (b.kind === 'protect' && opts.protect !== false) {
        const s = state(it); (b.switched ? b.switched(opts.blown && opts.blown.has(partKey(p)) ? 1 : s === 1 && b.states ? 1 : 0) : []).forEach(([a, c]) => join(k(a), k(c), { kind: 'fuse', ...at }));
      }
      if (b.kind === 'pdm' && opts.protect !== false) {
        b.outputs.forEach((o) => { if (opts.relays === 'closed' || (opts.pdm instanceof Set && opts.pdm.has(partKey(p) + '#' + o.pin))) join(k(b.input), k(o.pin), { kind: 'pdm', ...at }); });
      }
      if (b.kind === 'switch') {
        // a contact drawn apart from its coil (b.follows) takes the coil's state
        const st = b.follows && opts.relays instanceof Set ? (coilOn(opts.relays, b.follows) ? 1 : 0) : state(it);
        const pairs = opts.switches === 'closed' ? (b.states || ['', '']).flatMap((_, i) => (b.switched ? b.switched(i) : [])) : opts.switches === 'open' ? [] : (b.switched ? b.switched(st) : []);
        pairs.forEach(([a, c]) => join(k(a), k(c), { kind: 'switch', ...at }));
        if (b.earthWhen && (opts.switches === 'closed' || (opts.switches !== 'open' && b.earthWhen(state(it))))) join(k('1'), EARTH, { kind: 'switch', ...at });
      }
      if (b.kind === 'relay') {
        const on = opts.relays === 'closed' ? null : opts.relays instanceof Set ? opts.relays.has(partKey(p)) : false;
        const pairs = on == null ? [...b.contacts(true), ...b.contacts(false)] : b.contacts(on);
        pairs.forEach(([a, c]) => join(k(a), k(c), { kind: 'relay', ...at }));
      }
      const pd = Loom.partDef(it.v, p.type) || {};
      if (p.label && !pd.noLabel && !(pd.xrefGroup && !pd.coil)) {
        const lk = p.type + '|' + p.label;
        if (byLabel.has(lk)) { const o = byLabel.get(lk); r.pins.forEach((pn) => join(k(pn.id), key(o.sheet, o.p.id, pn.id), { kind: 'same', ...at, other: o })); } else byLabel.set(lk, it);
      }
    });
    // mated connectors: cavity n of one joins cavity n of the other
    inv.forEach((it) => {
      if (it.p.type !== 'conn' || !it.p.props.mate) return;
      const m = inv.find((o) => o.p.type === 'conn' && o.p.label && o.p.label.toLowerCase() === String(it.p.props.mate).trim().toLowerCase());
      if (!m) return;
      Loom.resolved(it.v, it.p).pins.forEach((pn) => join(key(it.sheet, it.p.id, pn.id), key(m.sheet, m.p.id, pn.id), { kind: 'mate', it, other: m }));
    });
    Loom.views(project).forEach((v) => v.wires.forEach((w) => join(key(v.sheet, w.from.part, w.from.pin), key(v.sheet, w.to.part, w.to.pin), { kind: 'wire', wire: w, v })));
    return { uf, inv, k: key, edges };
  }

  /* The nets of a project: every pin and wire grouped by electrical connection. */
  function nets(d, opts) {
    const project = projectOf(d), { uf, inv } = build(project, opts || { switches: 'open', relays: 'open', protect: false });
    const map = new Map();
    const get = (r) => { if (!map.has(r)) map.set(r, { id: r, pins: [], wires: [], names: new Set(), earth: r === uf.find(EARTH) }); return map.get(r); };
    inv.forEach((it) => Loom.resolved(it.v, it.p).pins.forEach((pn) => {
      const n = get(uf.find(key(it.sheet, it.p.id, pn.id)));
      n.pins.push({ sheet: it.sheet, part: it.p, pin: pn.id, label: `${it.p.label || it.p.type}:${pn.id}` });
      if (it.p.type === 'net_label' && it.p.props.text) n.names.add(String(it.p.props.text));
      if (it.p.type === 'offpage' && it.p.props.link) n.names.add(String(it.p.props.link));
      if (it.b.kind === 'source' && pn.id === it.b.source) n.names.add(`${it.p.label} +`);
    }));
    Loom.views(project).forEach((v) => v.wires.forEach((w) => get(uf.find(key(v.sheet, w.from.part, w.from.pin))).wires.push({ sheet: v.sheet, wire: w })));
    const list = [...map.values()].filter((n) => n.wires.length || n.earth);
    list.forEach((n, i) => {
      const circ = [...new Set(n.wires.map((x) => x.wire.circuit).filter(Boolean))];
      n.name = n.earth ? 'EARTH' : n.names.size ? [...n.names].join(' / ') : circ.length ? circ.join(' / ') : 'Net ' + (i + 1);
    });
    return list;
  }
  /* The net a wire (or a pin) belongs to, across all sheets. */
  function netOf(d, sheetId, end) {
    const project = projectOf(d), sheet = project.sheets.find((s) => s.id === sheetId);
    const { uf } = build(project, { switches: 'open', relays: 'open', protect: false });
    const r = uf.find(key(sheet, end.part, end.pin));
    return nets(project).find((n) => n.id === r) || null;
  }

  /* ---------------- Live circuit test ---------------- */
  /* opts.relays: the relays pulled in before this change. Starting from them lets a
     hold-in (self-latching) contact keep its coil on after the start button is released. */
  /* Is the coil a contact follows pulled in? follows is 'coil|K1' (any relay or contactor
     with reference K1) or a part key such as 'contactor|K1'. */
  function coilOn(relays, follows) {
    if (!relays || !follows) return false;
    if (relays.has(follows)) return true;
    if (!follows.startsWith('coil|')) return false;
    const ref = follows.slice(5);
    return [...relays].some((k) => k.slice(k.indexOf('|') + 1) === ref);
  }
  function simulate(d, state = {}, opts = {}) {
    const project = projectOf(d);
    let relays = opts.relays instanceof Set ? new Set(opts.relays) : new Set(), pdm = new Set(), result = null;
    for (let iter = 0; iter < 12; iter++) {
      const { uf, inv } = build(project, { state, relays, pdm, switches: 'state' });
      const earth = uf.find(EARTH), powered = new Set();
      const rootOf = (it, pin) => uf.find(key(it.sheet, it.p.id, pin));
      inv.forEach((it) => {
        const b = it.b, s = state[partKey(it.p)] != null ? state[partKey(it.p)] : b.def || 0;
        if (b.kind === 'source' && (!b.sourceWhen || b.sourceWhen(s))) powered.add(rootOf(it, b.source));
        if (b.liveFeed) powered.add(rootOf(it, b.liveFeed));
      });
      // diodes and converters pass power on; repeat until nothing changes
      for (let k = 0; k < 20; k++) {
        const before = powered.size;
        inv.forEach((it) => {
          const b = it.b;
          if ((b.kind === 'diode' || (b.kind === 'load' && b.anode)) && powered.has(rootOf(it, b.anode))) powered.add(rootOf(it, b.cathode));
          if (b.kind === 'converter' && powered.has(rootOf(it, b.input))) {
            const en = Loom.views(project).some((v) => v.sheet === it.sheet && v.wires.some((w) => (w.from.part === it.p.id && w.from.pin === b.enable) || (w.to.part === it.p.id && w.to.pin === b.enable)));
            if (!en || powered.has(rootOf(it, b.enable))) powered.add(rootOf(it, b.output));
          }
        });
        if (powered.size === before) break;
      }
      const next = new Set();
      inv.forEach((it) => {
        if (it.b.kind !== 'relay') return;
        if (it.b.runInput) { const r = rootOf(it, it.b.runInput); if (powered.has(r) && r !== earth) next.add(partKey(it.p)); return; }
        const a = rootOf(it, it.b.coil[0]), c = rootOf(it, it.b.coil[1]);
        if (it.b.needsJoined && !it.b.needsJoined.every(([x, y]) => rootOf(it, x) === rootOf(it, y))) return;
        if ((powered.has(a) && c === earth) || (powered.has(c) && a === earth)) next.add(partKey(it.p));
      });
      // electronic power modules: an output is on when its control input is
      const nextPdm = new Set();
      inv.forEach((it) => {
        if (it.b.kind !== 'pdm' || !powered.has(rootOf(it, it.b.input))) return;
        it.b.outputs.forEach((o) => {
          let on = o.control === 'ALWAYS';
          if (!on && it.b.inputs.includes(o.control)) { const r = rootOf(it, o.control); on = o.active === 'low' ? r === earth : powered.has(r) && r !== earth; }
          if (on) nextPdm.add(partKey(it.p) + '#' + o.pin);
        });
      });
      result = { uf, inv, earth, powered, relays: next, pdm: nextPdm };
      if ([...next].sort().join() === [...relays].sort().join() && [...nextPdm].sort().join() === [...pdm].sort().join()) break;
      relays = next; pdm = nextPdm;
    }
    const { uf, inv, earth, powered } = result;
    const live = (r) => powered.has(r) && r !== earth;
    const wires = new Set(), loads = new Set(), shorts = [];
    Loom.views(project).forEach((v) => v.wires.forEach((w) => { if (live(uf.find(key(v.sheet, w.from.part, w.from.pin)))) wires.add(w.id); }));
    inv.forEach((it) => {
      const b = it.b, R = (pin) => uf.find(key(it.sheet, it.p.id, pin));
      const on = (pw, ea) => pw.some((x) => live(R(x))) && ea.some((x) => R(x) === earth);
      if (b.kind === 'load' && (on(b.power, b.earth) || (b.either && on(b.earth, b.power)))) loads.add(it.p.id);
      if (b.lamp && (on([b.lamp[0]], [b.lamp[1]]) || on([b.lamp[1]], [b.lamp[0]]))) loads.add(it.p.id);
      if (b.lineLoad && (b.lineLoadAll ? b.lineLoad.every((x) => live(R(x))) : b.lineLoad.some((x) => live(R(x))))) loads.add(it.p.id);
      if (b.kind === 'relay' && result.relays.has(partKey(it.p))) loads.add(it.p.id);
      if (b.kind === 'source' && powered.has(earth) && R(b.source) === earth) shorts.push(it.p.label || it.p.type);
    });
    if (powered.has(earth) && !shorts.length) shorts.push('a supply');
    return { wires, loads, relays: result.relays, pdm: result.pdm, shorts, state };
  }
  /* The states a part can be switched between in the live test, or null. */
  function partStates(d, p) {
    const v = d.sheet ? d : Loom.view(projectOf(d), 0);
    const b = Loom.behaviour(v, p);
    return b.states ? { states: b.states, def: b.def || 0, key: partKey(p), ...(b.follows ? { follows: b.follows } : {}) } : null;
  }

  /* ---------------- Fuse and relay schedule, load budget ---------------- */
  function schedule(d) {
    const project = projectOf(d), volts = parseFloat(project.settings.volts) || 12;
    const { uf, inv } = build(project, { switches: 'closed', relays: 'closed', protect: false });
    const R = (it, pin) => uf.find(key(it.sheet, it.p.id, pin));
    const loadsIn = new Map(), protIn = new Map();
    inv.forEach((it) => {
      const b = it.b;
      const pins = b.kind === 'load' ? (b.either ? [...b.power, ...b.earth] : b.power) : b.kind === 'relay' ? [b.coil[0]] : b.kind === 'converter' ? [b.input] : b.lamp ? [b.lamp[0]] : [];
      const amps = b.kind === 'converter' ? (parseFloat(Loom.resolved(it.v, it.p).props.amps) || 0) * 1.1 : b.kind === 'relay' ? 0.2 : Loom.partCurrent(it.v, it.p);
      const roots = new Set(pins.map((x) => R(it, x)));
      roots.forEach((r) => { if (!loadsIn.has(r)) loadsIn.set(r, []); loadsIn.get(r).push({ it, amps }); });
      if (b.kind === 'protect' || b.kind === 'pdm') outputs(it).forEach((o) => { const r = R(it, o.inPin); if (!protIn.has(r)) protIn.set(r, []); protIn.get(r).push(o); });
    });
    const seenLoads = (root, seen = new Set(), acc = new Map()) => {
      if (seen.has(root)) return acc; seen.add(root);
      (loadsIn.get(root) || []).forEach((x) => acc.set(x.it.p.label ? partKey(x.it.p) : x.it.p.id + x.it.sheet.id, x));
      (protIn.get(root) || []).forEach((o) => seenLoads(o.root, seen, acc));
      return acc;
    };
    /* The ways of a fuse, breaker or fuse box: input pin, output pin and rating of each. */
    function outputs(it) {
      const r = Loom.resolved(it.v, it.p), ratings = String(r.props.ratings || '').split(',').map(Loom.parseAmps);
      if (it.p.type === 'fuse_box') return r.pins.filter((x) => x.id !== 'IN').map((x, i) => ({ way: x.id, rating: ratings[i] || null, root: R(it, x.id), pin: x.id, inPin: 'IN' }));
      if (it.b.kind === 'pdm') return it.b.outputs.map((o) => ({ way: o.pin, rating: o.rating, root: R(it, o.pin), pin: o.pin, inPin: it.b.input }));
      if (it.p.type === 'fuse_box_lucas') return [0, 1, 2, 3].map((i) => ({ way: String(i + 1), rating: ratings[i] || null, root: R(it, String(i * 2 + 2)), pin: String(i * 2 + 2), inPin: String(i * 2 + 1) }));
      return [{ way: '', rating: Loom.parseAmps(r.props.rating), root: R(it, '2'), pin: '2', inPin: '1' }];
    }
    const wiresAt = (root) => Loom.views(project).flatMap((v) => v.wires.filter((w) => uf.find(key(v.sheet, w.from.part, w.from.pin)) === root).map((w) => ({ v, w })));
    // a part drawn on more than one sheet (same reference) is listed once
    const once = () => { const seen = new Set(); return (it) => { const k = it.p.label ? partKey(it.p) : it.p.id + it.sheet.id; if (seen.has(k)) return false; seen.add(k); return true; }; };
    const fuses = [];
    inv.filter((it) => it.b.kind === 'protect' || it.b.kind === 'pdm').filter(once()).forEach((it) => outputs(it).forEach((o) => {
      const loads = [...seenLoads(o.root).values()], ws = wiresAt(o.root);
      const fromLoads = loads.reduce((a, x) => a + x.amps, 0), fromWires = Math.max(0, ...ws.map((x) => parseFloat(x.w.current) || 0));
      const load = Math.max(fromLoads, fromWires);
      const g = ws.map((x) => parseFloat(x.w.gauge)).filter((x) => x > 0);
      fuses.push({
        sheet: it.sheet.name, sheetId: it.sheet.id, part: it.p.id, ref: it.p.label + (o.way ? (it.b.kind === 'pdm' ? ' ' : ' way ') + o.way : ''), type: (Loom.partDef(it.v, it.p.type) || {}).name,
        rating: o.rating, load: +load.toFixed(2), pct: o.rating ? Math.round((load / o.rating) * 100) : null,
        circuits: [...new Set(ws.map((x) => x.w.circuit).filter(Boolean))], wires: ws.map((x) => x.w.name), smallest: g.length ? Math.min(...g) : null,
        loads: loads.map((x) => ({ ref: x.it.p.label || x.it.p.type, amps: +x.amps.toFixed(2) })),
        status: !o.rating ? 'no rating' : load > o.rating ? 'over' : load > o.rating * 0.8 ? 'high' : 'ok',
      });
    }));
    const relays = inv.filter((it) => it.b.kind === 'relay').filter(once()).map((it) => {
      const outs = it.b.contacts(true).concat(it.b.contacts(false)).map(([, b]) => b);
      const acc = new Map(); outs.forEach((pin) => seenLoads(R(it, pin), new Set(), acc));
      acc.delete(it.p.label ? partKey(it.p) : it.p.id + it.sheet.id); // its own coil is not a load on its contacts
      const load = [...acc.values()].reduce((a, x) => a + x.amps, 0);
      return { sheet: it.sheet.name, sheetId: it.sheet.id, part: it.p.id, ref: it.p.label, rating: it.b.rating, load: +load.toFixed(2), pct: it.b.rating ? Math.round((load / it.b.rating) * 100) : null, loads: [...acc.values()].map((x) => ({ ref: x.it.p.label, amps: +x.amps.toFixed(2) })), status: load > it.b.rating ? 'over' : load > it.b.rating * 0.8 ? 'high' : 'ok' };
    });
    // supplies: what hangs off each battery, DC-DC charger and alternator
    const supplies = [], firstSupply = once();
    inv.forEach((it) => {
      const b = it.b, pr = Loom.resolved(it.v, it.p).props || {};
      let root = null, rating = null;
      if (b.kind === 'source') { root = R(it, b.source); rating = it.p.type === 'alternator' ? parseFloat(pr.amps) || null : it.p.type === 'solar' ? (parseFloat(pr.watts) || 0) / volts || null : null; }
      if (b.kind === 'converter') { root = R(it, b.output); rating = parseFloat(pr.amps) || null; }
      if (!root || !firstSupply(it)) return;
      const acc = seenLoads(root), loads = [...acc.values()].filter((x) => x.it.p.id !== it.p.id);
      const load = loads.reduce((a, x) => a + x.amps, 0);
      supplies.push({ sheet: it.sheet.name, sheetId: it.sheet.id, part: it.p.id, ref: it.p.label, type: (Loom.partDef(it.v, it.p.type) || {}).name, capacity: pr.ah ? String(parseFloat(pr.ah) || pr.ah) : '', rating, load: +load.toFixed(2), pct: rating ? Math.round((load / rating) * 100) : null, loads: loads.map((x) => ({ ref: x.it.p.label || x.it.p.type, amps: +x.amps.toFixed(2) })), hours: pr.ah && load ? +(parseFloat(pr.ah) * 0.5 / load).toFixed(1) : null });
    });
    return { fuses, relays, supplies, volts };
  }

  /* ---------------- Project-level design checks ---------------- */
  function projectChecks(d) {
    const project = projectOf(d), out = [];
    const views = Loom.views(project), many = project.sheets.length > 1;
    const where = (s) => (many ? s.name + ': ' : '');
    // duplicate references
    const seen = new Map();
    views.forEach((v) => v.parts.forEach((p) => {
      const def = Loom.partDef(v, p.type) || {};
      if (!p.label || def.noLabel || def.cat === 'Annotation' || (def.xrefGroup && !def.coil)) return;
      const k = p.label.toUpperCase();
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k).push({ v, p });
    }));
    seen.forEach((list) => {
      for (let i = 1; i < list.length; i++) {
        const a = list[0], b = list[i];
        if (a.v.sheet === b.v.sheet) out.push({ level: 'error', part: b.p.id, sheetId: b.v.sheet.id, text: `${where(b.v.sheet)}${b.p.label} is used twice on this sheet. Give each part its own reference.` });
        else if (a.p.type !== b.p.type) out.push({ level: 'warn', part: b.p.id, sheetId: b.v.sheet.id, text: `${where(b.v.sheet)}${b.p.label} is a ${(Loom.partDef(b.v, b.p.type) || {}).name} here but a ${(Loom.partDef(a.v, a.p.type) || {}).name} on ${a.v.sheet.name}. The same reference should mean the same part.` });
      }
    });
    // shorts: a battery positive wired to earth with every switch open
    const st = build(project, { switches: 'open', relays: 'open', protect: true });
    const earth = st.uf.find(EARTH);
    st.inv.forEach((it) => { if (it.b.kind === 'source' && it.p.type !== 'alternator' && st.uf.find(key(it.sheet, it.p.id, it.b.source)) === earth) out.push({ level: 'error', part: it.p.id, sheetId: it.sheet.id, text: `${where(it.sheet)}${it.p.label} ${it.b.source} is connected straight to earth. That is a short circuit.` }); });
    // unfused feeds
    const uf = build(project, { switches: 'closed', relays: 'closed', protect: false });
    uf.inv.filter((it) => it.b.kind === 'source').forEach((src) => {
      const r = uf.uf.find(key(src.sheet, src.p.id, src.b.source));
      const hits = new Set();
      uf.inv.forEach((it) => {
        if (it === src || ['starter_motor', 'alternator', 'battery', 'battery_aux', 'solar'].includes(it.p.type)) return;
        const pins = it.b.kind === 'load' ? it.b.power.concat(it.b.either ? it.b.earth : []) : it.b.kind === 'relay' ? [it.b.coil[0]] : it.b.kind === 'converter' ? [it.b.input] : it.b.lamp ? [it.b.lamp[0], it.b.lamp[1]] : [];
        if (pins.some((x) => uf.uf.find(key(it.sheet, it.p.id, x)) === r) && !hits.has(it.p.label || it.p.id)) {
          hits.add(it.p.label || it.p.id);
          out.push({ level: 'warn', part: it.p.id, sheetId: it.sheet.id, text: `${where(it.sheet)}${it.p.label || (Loom.partDef(it.v, it.p.type) || {}).name} is fed from ${src.p.label} ${src.b.source} with no fuse in between.` });
        }
      });
    });
    // loads without an earth return
    const cl = build(project, { switches: 'closed', relays: 'closed', protect: true }), ce = cl.uf.find(EARTH);
    cl.inv.forEach((it) => {
      if (it.b.kind !== 'load') return;
      const wired = views.find((v) => v.sheet === it.sheet).wires.some((w) => w.from.part === it.p.id || w.to.part === it.p.id);
      if (!wired) return;
      const R = (x) => cl.uf.find(key(it.sheet, it.p.id, x));
      const ok = it.b.earth.some((x) => R(x) === ce) || (it.b.either && it.b.power.some((x) => R(x) === ce));
      if (!ok) out.push({ level: 'warn', part: it.p.id, sheetId: it.sheet.id, text: `${where(it.sheet)}${it.p.label || it.p.type} has no earth return.` });
    });
    // wire size against terminal
    views.forEach((v) => v.wires.forEach((w) => ['from', 'to'].forEach((end) => {
      const t = Loom.TERMINALS.find((x) => x.id === ((w.ends || {})[end] || {}).term);
      const a = parseFloat(w.gauge);
      if (t && t.id && a && (a < t.min || a > t.max)) out.push({ level: 'warn', wire: w.id, sheetId: v.sheet.id, text: `${where(v.sheet)}${w.name} is ${w.gauge} mm² but the ${t.name} at ${Loom.pinName(v, w[end])} takes ${t.min}–${t.max} mm².` });
    })));
    // colours: different colours inside one net, one colour for different circuits in a harness
    nets(project).forEach((n) => {
      if (n.earth) return;
      const codes = [...new Set(n.wires.map((x) => Loom.wireCode(project, x.wire)))];
      if (codes.length > 1 && n.wires.length > 1) out.push({ level: 'info', wire: n.wires[0].wire.id, sheetId: n.wires[0].sheet.id, text: `Net ${n.name} uses ${codes.join(', ')}. Fine across a connector; otherwise keep one colour per circuit.` });
    });
    Loom.colourUsage(project).forEach((e) => {
      const byH = new Map();
      e.uses.forEach((u) => { if (!u.harness) return; if (!byH.has(u.harness)) byH.set(u.harness, []); byH.get(u.harness).push(u); });
      byH.forEach((us, h) => { if (us.length > 1) out.push({ level: 'info', text: `${e.code} is used in the ${h} harness for ${us.map((u) => u.circuit || 'no circuit').join(' and ')}. Tell them apart by wire number or sleeve.` }); });
    });
    // overloaded fuses and relays
    const sc = schedule(project);
    sc.fuses.forEach((f) => { if (f.status === 'over') out.push({ level: 'warn', part: f.part, sheetId: f.sheetId, text: `${where({ name: f.sheet })}${f.ref} (${f.rating} A) carries about ${f.load} A of load.` }); });
    sc.relays.forEach((f) => { if (f.status === 'over') out.push({ level: 'warn', part: f.part, sheetId: f.sheetId, text: `${where({ name: f.sheet })}${f.ref} contacts (${f.rating} A) switch about ${f.load} A.` }); });
    return out;
  }
  // validate() now includes the project-level checks when given a project or the first sheet's view
  const baseValidate = Loom.validate;
  Loom.validate = function (d) {
    const base = baseValidate(d);
    const project = projectOf(d);
    if (!project || !Array.isArray(project.sheets)) return base;
    const extra = projectChecks(project);
    return d && d.sheet ? base.concat(extra.filter((c) => !c.sheetId || c.sheetId === d.sheet.id)) : base.concat(extra);
  };

  Object.assign(Loom, { nets, netOf, simulate, coilOn, partStates, partKey, schedule, projectChecks, EARTH, buildNet: build });
  return Loom;
});
