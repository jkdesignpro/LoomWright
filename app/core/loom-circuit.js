/*
 * LoomWright circuit solver and fault finding.
 *
 * solveCircuit() builds a DC model of the whole project in one switch state and
 * works out the voltage at every pin, the current in every wire, the voltage each
 * load actually gets and what every fuse carries. faultFind() turns the same model
 * into a step-by-step test sheet for a load that does not work, stays on, blows its
 * fuse or runs dim or slow.
 *
 * Figures are estimates from the drawing (wire sizes and lengths, load ratings and a
 * simple battery, alternator and charger model). Real parts vary; use them as a guide
 * to what a meter should read, not as a measurement.
 *
 * Extends window.Loom; needs loom-core.js, loom-data.js and loom-nets.js first.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./loom-data.js'); require('./loom-nets.js'); module.exports = factory(require('./loom-core.js')); }
  else factory(root.Loom);
})(typeof self !== 'undefined' ? self : this, function (Loom) {
  'use strict';
  const EARTH = Loom.EARTH, esc = Loom.esc, partKey = Loom.partKey;
  const projectOf = (d) => (d && d.project) || d;
  const key = (sheet, partId, pin) => `${sheet.id}|${partId}|${pin}`;
  const pinOf = (k) => String(k).split('|').slice(2).join('|');
  const RHO = 0.0172;                                   // copper, ohm mm²/m at 20 °C
  const CONTACT = { fuse: 0.004, switch: 0.01, relay: 0.005, mate: 0.002, pdm: 0.012, diode: 0 }; // ohms, typical clean contacts
  const IDEAL = new Set(['link', 'earth', 'net', 'same']);
  const GMIN = 1e-9;
  const LOGICAL = new Set(['offpage', 'net_label']);    // drawing aids, not places you can put a probe

  class UF {
    constructor() { this.p = new Map(); }
    find(a) { let r = a; while (this.p.has(r) && this.p.get(r) !== r) r = this.p.get(r); if (!this.p.has(r)) this.p.set(r, r); let x = a; while (x !== r) { const n = this.p.get(x); this.p.set(x, r); x = n; } return r; }
    union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
  }
  const instKey = (it) => (it.p.label ? partKey(it.p) : it.p.id + '@' + it.sheet.id);
  const refOf = (it) => it.p.label || (Loom.partDef(it.v, it.p.type) || {}).name || it.p.type;
  const fmt = (v, d = 2) => (Math.abs(v) < 0.005 ? '0' : (+v).toFixed(d));

  /* Sparse symmetric solve by Gaussian elimination, lowest-degree node first.
     Wiring is mostly chains and stars, so this stays fast on big projects. */
  function solveSparse(rows, rhs) {
    const n = rows.length, alive = new Uint8Array(n).fill(1), order = [], saved = [];
    for (let step = 0; step < n; step++) {
      let p = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (alive[i] && rows[i].size < best) { best = rows[i].size; p = i; if (best <= 2) break; }
      alive[p] = 0;
      const rp = rows[p], d = rp.get(p), nb = [];
      rp.forEach((_, j) => { if (j !== p) nb.push(j); });
      for (const i of nb) {
        const ri = rows[i], f = ri.get(p) / d;
        ri.delete(p);
        for (const j of nb) ri.set(j, (ri.get(j) || 0) - f * rp.get(j));
        rhs[i] -= f * rhs[p];
      }
      order.push(p); saved.push(nb.map((j) => [j, rp.get(j)]));
    }
    const V = new Float64Array(n);
    for (let s = n - 1; s >= 0; s--) { const p = order[s]; let acc = rhs[p]; for (const [j, g] of saved[s]) acc -= g * V[j]; V[p] = acc / rows[p].get(p); }
    return V;
  }

  /* The circuit as resistors and sources, in one switch state. */
  function network(project, state, opts = {}) {
    const sim = Loom.simulate(project, state);
    const B = Loom.buildNet(project, { state, relays: sim.relays, pdm: sim.pdm, switches: 'state', protect: true, edges: true });
    const uf = new UF();
    B.inv.forEach((it) => Loom.resolved(it.v, it.p).pins.forEach((pn) => uf.find(key(it.sheet, it.p.id, pn.id))));
    B.edges.forEach((e) => { if (IDEAL.has(e.kind)) uf.union(e.a, e.b); });
    const E = uf.find(EARTH), root = (k) => uf.find(k);
    const res = [], seen = new Set();
    B.edges.forEach((e) => {
      if (IDEAL.has(e.kind)) return;
      let r, id, guessed = '';
      if (e.kind === 'wire') {
        const w = e.wire, A = parseFloat(w.gauge), L = parseFloat(w.length);
        if (!(L > 0)) guessed = 'length'; else if (!(A > 0)) guessed = 'gauge';
        r = L > 0 ? (L * RHO) / (A > 0 ? A : 1) : 1e-4;
        id = 'w:' + e.v.sheet.id + ':' + w.id;
      } else {
        id = e.kind === 'mate' ? 'mate:' + [instKey(e.it), instKey(e.other)].sort().join('/') + ':' + pinOf(e.a)
          : e.kind + ':' + instKey(e.it) + ':' + pinOf(e.a) + '>' + (e.b === EARTH ? 'E' : pinOf(e.b));
        r = CONTACT[e.kind] || 0.005;
      }
      if (seen.has(id)) return; seen.add(id);
      res.push({ ...e, r, id, guessed });
    });
    const touched = new Set([E]);
    res.forEach((e) => { touched.add(root(e.a)); touched.add(root(e.b)); });

    // parts as electrical models
    const vn = parseFloat(project.settings.volts) || 12, k = vn / 12, els = [], once = new Set(), unrated = [];
    const first = (it, tag = '') => { const id = instKey(it) + '#' + tag; if (once.has(id)) return false; once.add(id); return true; };
    B.inv.forEach((it) => {
      const b = it.b, P = (pin) => root(key(it.sheet, it.p.id, pin)), pr = Loom.resolved(it.v, it.p).props || {};
      const s = state[partKey(it.p)] != null ? state[partKey(it.p)] : b.def || 0;
      const ret = (pin) => { const r = pin ? P(pin) : E; return touched.has(r) ? r : E; }; // an unwired return is taken as case-earthed
      if (b.kind === 'source') {
        if ((b.sourceWhen && !b.sourceWhen(s)) || !first(it)) return;
        const p = P(b.source), n = ret(b.ret);
        if (it.p.type === 'alternator') els.push({ type: 'src', it, p, n, emf: 14.2 * k, r: 0.02, limit: parseFloat(pr.amps) || null, mode: 'v', what: 'alternator' });
        else if (it.p.type === 'solar') {
          const w = parseFloat(pr.watts) || 100, voc = 1.75 * vn, vmp = 1.45 * vn, imp = w / vmp;
          els.push({ type: 'src', it, p, n, emf: voc, r: (voc - vmp) / imp, limit: imp * 1.1, mode: 'v', what: 'solar' });
        } else {
          const nom = parseFloat(pr.volts) > 0 ? parseFloat(pr.volts) : vn;
          els.push({ type: 'bat', it, p, n, emf: (opts.battery ? opts.battery * (nom / 12) : 12.6 * (nom / 12)), r: 0.01, rc: 0.1, mode: 'dis', what: 'battery' });
        }
      } else if (b.kind === 'converter') {
        if (!first(it)) return;
        const en = b.enable && touched.has(P(b.enable)) && P(b.enable) !== P(b.input) ? P(b.enable) : null;
        els.push({ type: 'conv', it, in: P(b.input), out: P(b.output), n: ret(b.ret), en, emf: 14.4 * k, r: 0.01, limit: parseFloat(pr.amps) || null, eff: 0.92, on: false, mode: 'v', iin: 0, what: 'charger' });
      } else if (b.kind === 'diode') {
        if (!first(it)) return;
        els.push({ type: 'diode', it, a: P(b.anode), k: P(b.cathode), vf: 0.7, r: 0.05, on: false });
      } else if (b.kind === 'load') {
        if (!first(it)) return;
        if (it.p.type === 'led') { const I = Loom.partCurrent(it.v, it.p) || 0.02; els.push({ type: 'diode', it, a: P('A'), k: P('K'), vf: 2, r: Math.max(1, (vn - 2) / I), on: false, load: true }); return; }
        const I = Loom.partCurrent(it.v, it.p);
        if (!(I > 0)) { unrated.push(it); return; }
        const pw = b.power, ea = b.earth.find((x) => touched.has(P(x))) || b.earth[0];
        const live = pw.filter((x) => touched.has(P(x)));
        const use = live.length ? live : pw.slice(0, 1);
        use.forEach((x) => els.push({ type: 'R', it, a: P(x), b: P(ea), g: I / (vn * use.length), owner: 'load', pins: [x, ea] }));
      } else if (b.kind === 'relay') {
        if (!first(it, 'coil')) return;
        const I = it.p.type === 'relay_ssr' ? 0.01 : 0.15;
        els.push({ type: 'R', it, a: P(b.coil[0]), b: P(b.coil[1]), g: I / vn, owner: 'coil', pins: b.coil });
      }
      if (b.lamp && first(it, 'lamp')) els.push({ type: 'R', it, a: P(b.lamp[0]), b: P(b.lamp[1]), g: 0.05 / vn, owner: 'lamp', pins: b.lamp });
    });
    res.forEach((e) => els.push({ type: 'R', edge: e, a: root(e.a), b: root(e.b), g: 1 / e.r }));
    return { sim, B, uf, root, E, res, els, unrated, vn };
  }

  /* Solve the network: piecewise models for batteries (charge / discharge), current-limited
     sources, chargers that switch on with their input, and diodes. */
  function solveNetwork(N) {
    const { els, E, vn } = N, idx = new Map();
    const id = (r) => { if (r === E) return -1; if (!idx.has(r)) idx.set(r, idx.size); return idx.get(r); };
    els.forEach((e) => ['a', 'b', 'p', 'n', 'k', 'in', 'out', 'en'].forEach((f) => { if (e[f] != null) e['_' + f] = id(e[f]); }));
    const n = idx.size;
    let V = new Float64Array(n);
    const at = (i) => (i < 0 ? 0 : V[i]);
    for (let iter = 0; iter < 40; iter++) {
      const rows = Array.from({ length: n }, (_, i) => new Map([[i, GMIN]])), rhs = new Float64Array(n);
      const G = (a, b, g) => {
        if (a >= 0) rows[a].set(a, rows[a].get(a) + g);
        if (b >= 0) rows[b].set(b, rows[b].get(b) + g);
        if (a >= 0 && b >= 0 && a !== b) { rows[a].set(b, (rows[a].get(b) || 0) - g); rows[b].set(a, (rows[b].get(a) || 0) - g); }
      };
      const J = (into, from, i) => { if (into >= 0) rhs[into] += i; if (from >= 0) rhs[from] -= i; };
      const vsrc = (p, m, emf, r) => { G(p, m, 1 / r); J(p, m, emf / r); };
      els.forEach((e) => {
        if (e.type === 'R') G(e._a, e._b, e.g);
        else if (e.type === 'bat') vsrc(e._p, e._n, e.emf, e.mode === 'chg' ? e.rc : e.r);
        else if (e.type === 'src') { if (e.mode === 'v') vsrc(e._p, e._n, e.emf, e.r); else if (e.mode === 'lim') J(e._p, e._n, e.limit); }
        else if (e.type === 'diode') { if (e.on) vsrc(e._a, e._k, e.vf, e.r); }
        else if (e.type === 'conv' && e.on) {
          if (e.mode === 'v') vsrc(e._out, e._n, e.emf, e.r); else if (e.mode === 'lim') J(e._out, e._n, e.limit);
          J(e._n, e._in, e.iin);
        }
      });
      V = n ? solveSparse(rows, rhs) : V;
      let changed = false;
      els.forEach((e) => {
        if (e.type === 'bat') {
          const m = at(e._p) - at(e._n) > e.emf + 1e-6 ? 'chg' : 'dis';
          if (m !== e.mode) { e.mode = m; changed = true; }
        } else if (e.type === 'src' || (e.type === 'conv' && e.on)) {
          const P = e.type === 'src' ? e._p : e._out, vt = at(P) - at(e._n), i = (e.emf - vt) / e.r;
          let m = e.mode;
          if (m === 'v' && e.limit && i > e.limit * 1.0001) m = 'lim';
          else if (m === 'v' && i < -1e-6) m = 'off';
          else if (m === 'lim' && vt > e.emf) m = 'v';
          else if (m === 'off' && vt < e.emf - 1e-6) m = 'v';
          if (m !== e.mode) { e.mode = m; changed = true; }
        } else if (e.type === 'diode') {
          const vd = at(e._a) - at(e._k), on = e.on ? (vd - e.vf) / e.r > 0 : vd > e.vf;
          if (on !== e.on) { e.on = on; changed = true; }
        }
        if (e.type === 'conv') {
          const vin = at(e._in) - at(e._n), on = vin > 0.6 * vn && (e._en == null || at(e._en) - at(e._n) > 0.6 * vn);
          if (on !== e.on) { e.on = on; e.mode = 'v'; changed = true; }
          if (e.on) {
            const vo = at(e._out) - at(e._n), io = e.mode === 'lim' ? e.limit : e.mode === 'off' ? 0 : (e.emf - vo) / e.r;
            const want = vin > 1 ? Math.max(0, (vo * io) / (e.eff * vin)) : 0;
            if (Math.abs(want - e.iin) > Math.max(0.01, e.iin * 0.002)) { e.iin = want; changed = true; }
          } else if (e.iin) { e.iin = 0; changed = true; }
        }
      });
      if (!changed) break;
    }
    return { V, idx, at: (r) => (r === E ? 0 : idx.has(r) ? V[idx.get(r)] : 0) };
  }

  /* Rating of one way of a fuse, fuse box or power module. */
  function wayRating(it, outPin) {
    const r = Loom.resolved(it.v, it.p), ratings = String(r.props.ratings || '').split(',').map(Loom.parseAmps);
    if (it.b.kind === 'pdm') return (it.b.outputs.find((o) => o.pin === outPin) || {}).rating || null;
    if (it.p.type === 'fuse_box') return ratings[r.pins.filter((x) => x.id !== 'IN').findIndex((x) => x.id === outPin)] || null;
    if (it.p.type === 'fuse_box_lucas') return ratings[parseInt(outPin, 10) / 2 - 1] || null;
    return Loom.parseAmps(r.props.rating);
  }
  const wayName = (it, outPin) => (it.p.type === 'fuse_box' ? ' way ' + outPin : it.p.type === 'fuse_box_lucas' ? ' way ' + parseInt(outPin, 10) / 2 : it.b.kind === 'pdm' ? ' ' + outPin : '');

  /* ---------------- Solve a whole project ---------------- */
  /* The voltage every load gets, the current in every wire and fuse, in the given switch state. */
  function solveCircuit(d, state = {}, opts = {}) {
    const project = projectOf(d), N = network(project, state, opts), S = solveNetwork(N);
    const { root, res, els, sim, B, vn } = N, V = (k) => S.at(root(k));
    const notes = [];
    // sources
    const sources = els.filter((e) => e.type === 'bat' || e.type === 'src' || e.type === 'conv').map((e) => {
      const P = e.type === 'conv' ? e.out : e.p, vt = S.at(P) - S.at(e.n);
      const amps = e.type === 'conv' && !e.on ? 0 : e.mode === 'lim' ? e.limit : e.mode === 'off' ? 0 : (e.emf - vt) / (e.mode === 'chg' ? e.rc : e.r);
      return { part: e.it.p.id, sheetId: e.it.sheet.id, ref: refOf(e.it), what: e.what, volts: +vt.toFixed(2), amps: +amps.toFixed(2), state: e.type === 'bat' ? (amps < -0.05 ? 'charging' : amps > 0.05 ? 'supplying' : 'resting') : e.type === 'conv' ? (e.on ? (e.mode === 'lim' ? 'at its current limit' : 'running') : 'off') : e.mode === 'lim' ? 'at its current limit' : e.mode === 'off' ? 'not supplying' : 'supplying', input: e.type === 'conv' && e.on ? +e.iin.toFixed(2) : undefined };
    });
    const supplyV = Math.max(0, ...sources.filter((s) => s.amps >= 0 || s.what === 'battery').map((s) => s.volts));
    // wires
    const wires = [], wireAt = new Map(), live = new Set();
    res.forEach((e) => {
      const va = S.at(root(e.a)), vb = S.at(root(e.b)), amps = (va - vb) / e.r;
      e.amps = amps; e.drop = va - vb;
      if (e.kind !== 'wire') return;
      const w = e.wire, x = { id: w.id, sheetId: e.v.sheet.id, name: w.name, from: Loom.pinName(e.v, w.from), to: Loom.pinName(e.v, w.to), amps: +Math.abs(amps).toFixed(2), drop: +Math.abs(va - vb).toFixed(3), volts: +Math.max(va, vb).toFixed(2), gauge: w.gauge, guessed: e.guessed };
      wires.push(x); wireAt.set(e.v.sheet.id + '|' + w.id, x);
      if (Math.abs(amps) > 0.01 && e.guessed) live.add(w.name + (e.guessed === 'length' ? ' has no length' : ' has no size'));
    });
    if (live.size) notes.push(`${[...live].slice(0, 6).join(', ')}${live.size > 6 ? ' and more' : ''}, so its voltage drop is not counted. Add lengths for better figures.`);
    // loads: one entry per part, shared by every sheet that draws it
    const loadsBy = new Map();
    els.forEach((e) => {
      if (!(e.type === 'R' && e.owner) && !(e.type === 'diode' && e.load)) return;
      const k = instKey(e.it);
      const x = loadsBy.get(k) || { key: k, part: e.it.p.id, sheetId: e.it.sheet.id, ref: refOf(e.it), kind: e.owner || 'load', volts: 0, amps: 0, watts: 0, node: null };
      const A = e.type === 'R' ? e.a : e.a, Bn = e.type === 'R' ? e.b : e.k, v = S.at(A) - S.at(Bn);
      const i = e.type === 'R' ? v * e.g : e.on ? (v - e.vf) / e.r : 0;
      if (Math.abs(v) >= x.volts) { x.volts = Math.abs(v); x.node = v >= 0 ? A : Bn; } x.amps += Math.abs(i); x.watts += Math.abs(v * i);
      loadsBy.set(k, x);
    });
    // each load's own supply: walk uphill along the wires to the source terminal that feeds it
    const up = new Map();
    res.forEach((e) => { const a = root(e.a), b = root(e.b); if (a === b) return; (up.get(a) || up.set(a, []).get(a)).push(b); (up.get(b) || up.set(b, []).get(b)).push(a); });
    const topOf = (r) => { let x = r, v = S.at(r); for (let i = 0; i < 500; i++) { let best = null; (up.get(x) || []).forEach((y) => { const vy = S.at(y); if (vy > v + 1e-6) { v = vy; best = y; } }); if (!best) break; x = best; } return v; };
    const running = new Set();
    B.inv.forEach((it) => { if (sim.loads.has(it.p.id)) running.add(instKey(it)); });
    const loads = [...loadsBy.values()].filter((x) => x.kind !== 'lamp').map((x) => {
      const on = running.has(x.key) && x.amps > 0.001, ref = on && x.node ? topOf(x.node) : supplyV, dropPct = on && ref > 0 ? Math.max(0, ((ref - x.volts) / ref) * 100) : null;
      delete x.node;
      return { ...x, supply: on ? +ref.toFixed(2) : null, volts: +x.volts.toFixed(2), amps: +x.amps.toFixed(2), watts: +x.watts.toFixed(1), running: on, dropPct: dropPct == null ? null : +dropPct.toFixed(1), status: dropPct == null ? null : dropPct <= 3 ? 'ok' : dropPct <= 10 ? 'check' : 'low' };
    });
    N.unrated.forEach((it) => { if (running.has(instKey(it))) loads.push({ key: instKey(it), part: it.p.id, sheetId: it.sheet.id, ref: refOf(it), kind: 'load', volts: null, amps: null, watts: null, running: true, dropPct: null, status: 'no rating' }); });
    const unratedOn = N.unrated.filter((it) => running.has(instKey(it)));
    if (unratedOn.length) notes.push(`${unratedOn.map(refOf).join(', ')} ${unratedOn.length > 1 ? 'have' : 'has'} no amps or watts, so ${unratedOn.length > 1 ? 'they draw' : 'it draws'} nothing in these figures.`);
    // fuses and power module outputs
    const fuses = [];
    res.filter((e) => e.kind === 'fuse' || e.kind === 'pdm').forEach((e) => {
      const out = pinOf(e.b), rating = wayRating(e.it, out), amps = Math.abs(e.amps);
      if (amps < 0.005 && !opts.allFuses) return;
      fuses.push({ part: e.it.p.id, sheetId: e.it.sheet.id, ref: refOf(e.it) + wayName(e.it, out), amps: +amps.toFixed(2), rating, pct: rating ? Math.round((amps / rating) * 100) : null, status: !rating ? 'no rating' : amps > rating ? 'over' : amps > rating * 0.8 ? 'high' : 'ok' });
    });
    fuses.forEach((f) => { if (f.status === 'over') notes.push(`${f.ref} would carry ${f.amps} A on a ${f.rating} A rating. It would blow.`); });
    if (sim.shorts.length) notes.unshift(`Short circuit at ${sim.shorts.join(', ')}. The figures show the fault current.`);
    const lowLoads = loads.filter((x) => x.status === 'low');
    if (lowLoads.length) notes.push(`${lowLoads.map((x) => x.ref).join(', ')} lose${lowLoads.length > 1 ? '' : 's'} more than 10% of the supply voltage. Check wire sizes and lengths.`);
    const loadOf = new Map();
    B.inv.forEach((it) => { const x = loads.find((l) => l.key === instKey(it)); if (x) loadOf.set(it.sheet.id + '|' + it.p.id, x); });
    return {
      ok: !sim.shorts.length, shorts: sim.shorts, state, supply: +supplyV.toFixed(2), system: vn,
      sources, loads, wires, fuses, notes,
      volts: (sheetId, partId, pin) => { const sh = project.sheets.find((s) => s.id === sheetId); return sh ? +V(key(sh, partId, pin)).toFixed(2) : null; },
      load: (sheetId, partId) => loadOf.get(sheetId + '|' + partId) || null,
      wire: (sheetId, wireId) => wireAt.get(sheetId + '|' + wireId) || null,
      _N: N, _S: S,
    };
  }

  /* ---------------- Fault finding ---------------- */
  const SYMPTOMS = [
    { id: 'dead', name: 'Does not work' },
    { id: 'always', name: 'Will not switch off' },
    { id: 'fuse', name: 'Keeps blowing its fuse' },
    { id: 'dim', name: 'Dim, slow or weak' },
  ];
  function findPart(project, ref) {
    const inv = Loom.buildNet(project, { switches: 'open', relays: 'open', protect: false }).inv;
    const r = String(ref || '').trim().toLowerCase();
    return inv.find((it) => it.p.id === ref) || inv.find((it) => (it.p.label || '').toLowerCase() === r) || null;
  }
  /* A switch state in which the load runs (on: true) or is off (on: false). Tries up to three
     changes from the drawn defaults; fuses are kept intact. */
  function poweringState(d, ref, opts = {}) {
    const project = projectOf(d), target = typeof ref === 'object' ? ref : findPart(project, ref);
    if (!target) return null;
    const want = opts.on !== false, inv = Loom.buildNet(project, { switches: 'open', relays: 'open', protect: false }).inv;
    const ids = new Set(inv.filter((it) => instKey(it) === instKey(target)).map((it) => it.p.id));
    const base = { ...(opts.state || {}) };
    const parts = new Map();
    inv.forEach((it) => {
      if (!it.b.states) return;
      const k = partKey(it.p);
      if (it.b.kind === 'protect') { base[k] = 0; return; }
      if (it.b.kind === 'switch' || (it.b.kind === 'source' && it.p.type !== 'alternator')) parts.set(k, it);
    });
    const runs = (st) => { const s = Loom.simulate(project, st); return [...ids].some((id) => s.loads.has(id)); };
    if (runs(base) === want) return base;
    const cands = [...parts.entries()].map(([k, it]) => ({ k, it, values: it.b.states.map((_, i) => i).filter((i) => i !== (base[k] != null ? base[k] : it.b.def || 0)) }));
    let budget = opts.limit || 1500, found = null;
    const tryDepth = (depth, from, st) => {
      if (found || budget <= 0) return;
      if (depth === 0) { budget--; if (runs(st) === want) found = { ...st }; return; }
      for (let i = from; i < cands.length && !found; i++) {
        for (const val of cands[i].values) { tryDepth(depth - 1, i + 1, { ...st, [cands[i].k]: val }); if (found) return; }
      }
    };
    for (let depth = 1; depth <= 3 && !found && budget > 0; depth++) tryDepth(depth, 0, base);
    return found;
  }

  /* Graph of the circuit in one state, for following a feed step by step. */
  function graphOf(N) {
    const adj = new Map(), add = (a, b, e) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, e }); };
    N.B.edges.forEach((e) => { add(e.a, e.b, e); add(e.b, e.a, e); });
    // diodes pass current one way
    N.B.inv.forEach((it) => { if (it.b.kind === 'diode') { const a = key(it.sheet, it.p.id, it.b.anode), c = key(it.sheet, it.p.id, it.b.cathode); add(c, a, { kind: 'diode', it, a, b: c }); } });
    return adj;
  }
  function bfs(adj, from, isTarget, avoid) {
    const prev = new Map([[from, null]]), q = [from];
    while (q.length) {
      const x = q.shift();
      if (x !== from && isTarget(x)) { const out = []; let c = x; while (prev.get(c)) { const p = prev.get(c); out.push({ from: c, to: p.node, e: p.e }); c = p.node; } return { nodes: [x, ...out.map((s) => s.to)], steps: out }; }
      (adj.get(x) || []).forEach(({ to, e }) => { if (prev.has(to) || (avoid && avoid(to, e))) return; prev.set(to, { node: x, e }); q.push(to); });
    }
    return null;
  }

  function faultFind(d, ref, symptom = 'dead', opts = {}) {
    const project = projectOf(d), target = findPart(project, ref);
    if (!target) return { error: `There is no part ${ref} in this project.` };
    const tb = target.b, isRelay = tb.kind === 'relay';
    if (tb.kind !== 'load' && !isRelay && !tb.lamp) return { error: `${refOf(target)} is not a load. Pick the lamp, motor, relay or other part that should work.` };
    const sym = SYMPTOMS.find((s) => s.id === symptom) || SYMPTOMS[0];
    const onState = poweringState(project, target, { state: opts.state });
    if (!onState) return { error: `${refOf(target)} does not run in any switch position LoomWright tried. Check it has a fused feed and an earth on the drawing first.` };
    const sol = solveCircuit(project, onState, { battery: opts.battery }), N = sol._N, S = sol._S;
    const Vk = (k) => S.at(N.root(k));
    const adj = graphOf(N);
    const byKey = new Map();
    N.B.inv.forEach((it) => Loom.resolved(it.v, it.p).pins.forEach((pn) => byKey.set(key(it.sheet, it.p.id, pn.id), { it, pin: pn.id })));
    const label = (k) => { const x = byKey.get(k); return x ? Loom.pinName(x.it.v, { part: x.it.p.id, pin: x.pin }) : k; };
    const where = (k) => { const x = byKey.get(k); return x && x.it.p.location ? ` (${x.it.p.location})` : ''; };
    const vtxt = (v) => `about ${fmt(v, 1)} V`;
    const stateName = (it, s) => (it.b.states ? it.b.states[s] : String(s));
    const sk = (it) => (onState[partKey(it.p)] != null ? onState[partKey(it.p)] : it.b.def || 0);
    // the feed: from the load's supply pin back to a live source
    const pwr = isRelay ? [tb.coil[0]] : tb.lamp && tb.kind !== 'load' ? [tb.lamp[0]] : tb.either ? [...tb.power, ...tb.earth] : tb.power;
    const ret = isRelay ? tb.coil[1] : tb.lamp && tb.kind !== 'load' ? tb.lamp[1] : null;
    const pk = pwr.map((x) => key(target.sheet, target.p.id, x)).sort((a, b) => Vk(b) - Vk(a))[0];
    const srcPins = new Map();
    N.els.forEach((e) => {
      if (e.type === 'bat' || (e.type === 'src' && e.mode !== 'off')) srcPins.set(key(e.it.sheet, e.it.p.id, e.it.b.source), e);
      if (e.type === 'conv' && e.on) srcPins.set(key(e.it.sheet, e.it.p.id, e.it.b.output), e);
    });
    const isSrc = (k) => [...srcPins.keys()].some((s) => s === k);
    const feed = bfs(adj, pk, isSrc, (to) => to === EARTH);
    if (!feed) return { error: `LoomWright could not follow ${refOf(target)}'s feed back to a supply.` };
    const src = srcPins.get(feed.nodes[0]), path = feed; // nodes run from the supply to the load
    const earthPins = (isRelay || ret ? [ret] : tb.either ? [] : tb.earth).map((x) => key(target.sheet, target.p.id, x));
    const ek = earthPins.find((k) => bfs(adj, k, (x) => x === EARTH)) || earthPins[0];
    const earthPath = ek ? bfs(adj, ek, (x) => x === EARTH) : null;

    // places to put a probe along a path, with what lies between them
    const probeable = (k) => { const x = byKey.get(k); return x && !LOGICAL.has(x.it.p.type); };
    function points(p) {
      const tps = [], segs = []; let cur = [];
      const seenTp = new Set();
      p.nodes.forEach((n, i) => {
        if (i > 0) cur.push(p.steps[i - 1].e);
        if (!probeable(n)) return;
        const x = byKey.get(n), id = instKey(x.it) + ':' + x.pin;
        if (seenTp.has(id)) return;
        seenTp.add(id);
        if (tps.length) segs.push(cur);
        tps.push({ key: n, label: label(n), at: label(n) + where(n), v: Vk(n) }); cur = [];
      });
      return { tps, segs };
    }
    const wdesc = (w, v) => { const code = Loom.wireCode(project, w), bits = [code, w.gauge ? w.gauge + ' mm²' : '', w.length ? w.length + ' m' : '', w.harness ? w.harness + ' harness' : ''].filter(Boolean); return `wire ${w.name}${bits.length ? ' (' + bits.join(', ') + ')' : ''}${project.sheets.length > 1 ? ' on ' + v.sheet.name : ''}`; };
    function describe(seg) {
      const out = [];
      seg.forEach((e) => {
        if (e.kind === 'wire') out.push(wdesc(e.wire, e.v));
        else if (e.kind === 'fuse') out.push(`fuse ${refOf(e.it)}${wayName(e.it, pinOf(e.b))}`);
        else if (e.kind === 'pdm') out.push(`${refOf(e.it)} output ${pinOf(e.b)}`);
        else if (e.kind === 'switch') out.push(`switch ${refOf(e.it)} (${stateName(e.it, sk(e.it))})`);
        else if (e.kind === 'relay') out.push(`relay ${refOf(e.it)} contacts ${pinOf(e.a)}–${pinOf(e.b)}`);
        else if (e.kind === 'mate') out.push(`connector ${refOf(e.it)}/${refOf(e.other)} cavity ${pinOf(e.a)}`);
        else if (e.kind === 'diode') out.push(`diode ${refOf(e.it)}`);
        else if (e.kind === 'link' && LOGICAL.has(e.it.p.type)) out.push(`off-page link ${e.it.p.props.link || e.it.p.props.text || refOf(e.it)}`);
        else if (e.kind === 'link') out.push(`${refOf(e.it)} (${(Loom.partDef(e.it.v, e.it.p.type) || {}).name || e.it.p.type})`);
      });
      return [...new Set(out)];
    }
    const list = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
    const highlight = { wires: new Set(), parts: new Set() };
    const mark = (p) => p && p.steps.forEach(({ e }) => { if (e.wire) highlight.wires.add(e.wire.id); if (e.it) highlight.parts.add(e.it.p.id); if (e.other) highlight.parts.add(e.other.p.id); });
    mark(path); mark(earthPath); highlight.parts.add(target.p.id);

    // the steps
    const steps = [], add = (s) => { steps.push(s); return s; };
    const setup = [];
    const defaults = new Map();
    N.B.inv.forEach((it) => { if (it.b.states && it.b.kind !== 'protect' && !defaults.has(partKey(it.p))) defaults.set(partKey(it.p), it); });
    defaults.forEach((it, k) => { const s = onState[k] != null ? onState[k] : it.b.def || 0; if (s !== (it.b.def || 0)) setup.push(`${refOf(it)}: ${stateName(it, s)}`); });
    const tref = refOf(target), srcRef = refOf(src.it);
    const { tps, segs } = points(path);
    const coilSteps = (relayIt) => {
      // the relay's own coil feed, followed back to a supply
      const c0 = key(relayIt.sheet, relayIt.p.id, relayIt.b.coil[0]), c1 = key(relayIt.sheet, relayIt.p.id, relayIt.b.coil[1]);
      const f = bfs(adj, c0, isSrc, (to) => to === EARTH);
      const pts = f ? points(f).tps.reverse().slice(1) : [];
      const ce = bfs(adj, c1, (x) => x === EARTH);
      if (f) mark({ steps: f.steps }); if (ce) mark(ce);
      const a = add({ id: 'coil-' + relayIt.p.id, text: `Measure from ${label(c0)} (the coil feed of ${refOf(relayIt)}) to earth.`, expect: vtxt(Vk(c0)) });
      const b = add({ id: 'coilE-' + relayIt.p.id, text: `Measure from ${label(c1)} (the coil earth) to the battery negative.`, expect: 'under 0.1 V' });
      a.ifOk = { goto: b.id };
      a.ifNot = { text: `The coil is not being fed, so the relay never switches. Follow its feed back: ${pts.map((t) => `${t.label} (${vtxt(t.v)})`).join(', ') || 'see the drawing'}. The fault is just after the first point that reads correctly.` };
      b.ifOk = { text: `The coil is fed and earthed but the contacts do not close. Replace ${refOf(relayIt)} with a known good relay, and check its base terminals.` };
      b.ifNot = { text: `The coil earth is broken. Check ${list(ce ? describe(ce.steps.map((s) => s.e)) : ['its earth wire'])}, and clean the earth point.` };
      return a.id;
    };
    const faultIn = (seg, a, b) => {
      const kinds = seg.map((e) => e.kind), parts = describe(seg);
      const relay = seg.find((e) => e.kind === 'relay'), fuse = seg.find((e) => e.kind === 'fuse'), sw = seg.find((e) => e.kind === 'switch'), pdm = seg.find((e) => e.kind === 'pdm');
      if (relay) return { text: `Voltage reaches ${a.label} but not ${b.label}, so ${refOf(relay.it)} is not switching.`, goto: coilSteps(relay.it) };
      if (fuse) return { text: `Voltage reaches ${a.label} but not ${b.label}: fuse ${refOf(fuse.it)}${wayName(fuse.it, pinOf(fuse.b))} is blown or its holder is bad. Before fitting a new fuse, work through the "Keeps blowing its fuse" sheet for this load.` };
      if (sw) return { text: `Voltage reaches ${a.label} but not ${b.label}: ${refOf(sw.it)} is not closing in "${stateName(sw.it, sk(sw.it))}". Check it with a meter (continuity across ${pinOf(sw.a)} and ${pinOf(sw.b)}), or replace it.` };
      if (pdm) { const o = pdm.it.b.outputs.find((x) => x.pin === pinOf(pdm.b)) || {}; return { text: `${refOf(pdm.it)} has supply but ${o.pin} is off. Check its control input ${o.control}${o.control && o.control !== 'ALWAYS' ? ` (${o.active === 'low' ? 'should be at earth' : 'should be live'})` : ''}, its earth, and whether the output has tripped (limit ${o.rating || '?'} A). Reset or check the module's fault display.` }; }
      if (kinds.includes('wire') || kinds.includes('mate')) return { text: `The break is between ${a.label} and ${b.label}: ${list(parts)}. Look for a broken wire, a crimp pulled off, a pin pushed back in its housing, or corrosion.` };
      return { text: `The break is between ${a.label} and ${b.label}${parts.length ? ': ' + list(parts) : ''}.` };
    };
    const loadPin = tps[tps.length - 1];
    let notes = [];

    if (sym.id === 'dead') {
      if (setup.length) notes.push('Set the switches as listed before you start, so the load should be running.');
      const s0 = add({ id: 'load', text: `With the circuit switched on, measure from ${loadPin.at} to a clean chassis earth.`, expect: vtxt(loadPin.v) });
      const across = add({ id: 'across', text: `Measure across ${tref} itself: from ${loadPin.label} to ${ek ? label(ek) : 'its earth pin'}.`, expect: vtxt(loadPin.v - (ek ? Vk(ek) : 0)) });
      const er = add({ id: 'earth', text: `Measure from ${ek ? label(ek) : tref + ' earth'} to the battery negative, with the circuit on.`, expect: 'under 0.1 V' });
      s0.ifOk = { text: 'Supply reaches the load.', goto: across.id };
      across.ifOk = { text: `${tref} has its full voltage but does not work, so the fault is in ${tref} itself (bulb, motor, internal fuse or its own plug). Try it on a known good supply.` };
      across.ifNot = { text: 'Supply is fine but there is little voltage across the load, so its earth is suspect.', goto: er.id };
      er.ifOk = { text: `The earth path reads fine. Check the plug and pins right at ${tref}, then test it on a known good supply.` };
      er.ifNot = { text: `The earth path is broken: check ${list(earthPath ? describe(earthPath.steps.map((s) => s.e)) : ['the earth wire'])}. Earth points must be clean bare metal, tight, with a star washer.` };
      let prevStep = s0;
      for (let i = tps.length - 2; i >= 0; i--) {
        const tp = tps[i], st = add({ id: 'tp' + i, text: i === 0 ? `Measure at the supply: ${tp.at} to earth.` : `Measure from ${tp.at} to earth.`, expect: vtxt(tp.v) });
        prevStep.ifNot = { goto: st.id };
        st.ifOk = faultIn(segs[i], tp, tps[i + 1]);
        prevStep = st;
      }
      const last = prevStep;
      last.ifNot = src.type === 'conv'
        ? { text: `${srcRef} is not giving an output. Check its input ${label(key(src.it.sheet, src.it.p.id, src.it.b.input))} (${vtxt(Vk(key(src.it.sheet, src.it.p.id, src.it.b.input)))})${src.it.b.enable ? `, its ignition sense ${label(key(src.it.sheet, src.it.p.id, src.it.b.enable))}` : ''} and its earth.` }
        : { text: `No supply at ${srcRef}: the battery is flat or isolated, or its main lead or earth strap is loose. Check the terminals and any isolator.` };
    }

    if (sym.id === 'always') {
      const offState = poweringState(project, target, { on: false, state: opts.state });
      if (!offState) {
        add({ id: 'perm', text: `In the drawing ${tref} has no switch that turns it off: it runs whenever its supply is live. If that is wrong, add the missing switch or relay to the drawing.`, expect: '' });
      } else {
        const offN = network(project, offState), offS = solveNetwork(offN), offIds = new Set(offN.res.map((e) => e.id).concat(offN.B.edges.filter((e) => IDEAL.has(e.kind)).map((e) => e.kind + e.a + e.b)));
        const offV = (k) => offS.at(offN.root(k));
        const offSetup = [];
        defaults.forEach((it, k) => { const s = offState[k] != null ? offState[k] : it.b.def || 0, s1 = onState[k] != null ? onState[k] : it.b.def || 0; if (s !== s1 || s !== (it.b.def || 0)) offSetup.push(`${refOf(it)}: ${stateName(it, s)}`); });
        setup.length = 0; setup.push(...offSetup);
        const resId = new Map(N.res.map((e) => [e, e.id]));
        const idOf = (e) => N.res.find((r) => r.a === e.a && r.b === e.b && r.kind === e.kind) || null;
        const opens = [];
        path.steps.forEach(({ e }, i) => {
          if (!['switch', 'relay', 'pdm'].includes(e.kind)) return;
          const r = idOf(e); if (r && !offIds.has(resId.get(r))) opens.push({ e, i });
        });
        notes.push(offSetup.length ? `Set the switches as listed, so ${tref} should be off.` : `As drawn, ${tref} should be off.`);
        const first = add({ id: 'off', text: `With ${tref} meant to be off, measure from ${loadPin.at} to earth.`, expect: vtxt(offV(loadPin.key)) });
        first.ifOk = { text: `The feed is dead as it should be. If ${tref} still runs, it may be switched on its earth side.`, goto: 'earthside' };
        let prev = first;
        opens.slice().reverse().forEach(({ e }) => {
          const out = e.b, it = e.it;
          const st = add({ id: 'open-' + it.p.id + pinOf(out), text: `Measure from ${label(out)} (the output of ${refOf(it)}) to earth.`, expect: vtxt(offV(out)) });
          prev.ifNot = { goto: st.id };
          if (e.kind === 'relay') {
            const c0 = key(it.sheet, it.p.id, it.b.coil[0]);
            const cs = add({ id: 'coiloff-' + it.p.id, text: `Measure the coil feed ${label(c0)} to earth.`, expect: vtxt(offV(c0)) });
            st.ifNot = { text: `${refOf(it)} is passing current.`, goto: cs.id };
            cs.ifOk = { text: `The coil is not fed, so ${refOf(it)}'s contacts are stuck closed (welded). Replace the relay.` };
            cs.ifNot = { text: `Something still feeds ${refOf(it)}'s coil. Check the switch or module that drives it is really off, and look for a chafed coil wire touching a live feed.` };
          } else if (e.kind === 'pdm') {
            st.ifNot = { text: `${refOf(it)} still drives ${pinOf(out)}. Check its control input is really off, then the module's configuration.` };
          } else {
            st.ifNot = { text: `${refOf(it)} is not opening. Unplug the wire from ${label(out)}: if ${tref} stops, the switch is faulty or wired to the wrong terminal.` };
          }
          st.ifOk = { text: `${refOf(it)} is opening correctly, so the feed comes from after it.`, goto: 'backfeed' };
          prev = st;
        });
        if (prev !== first && !prev.ifNot) prev.ifNot = { goto: 'backfeed' };
        if (!opens.length) first.ifNot = { goto: 'backfeed' };
        // other wires joining the switched feed: possible back-feeds
        const lastOpen = opens.length ? opens[opens.length - 1].i : -1;
        const down = new Set(path.nodes.slice(lastOpen + 1).map((n) => N.root(n)));
        const onPath = new Set(path.steps.map((s) => s.e));
        const others = [];
        N.B.edges.forEach((e) => { if (e.kind === 'wire' && !onPath.has(e) && (down.has(N.root(e.a)) || down.has(N.root(e.b)))) others.push(e); });
        const bf = add({ id: 'backfeed', text: others.length ? `Other wires join this feed after the switching part. Disconnect them one at a time and see whether ${tref} stops: ${list(others.map((e) => `${e.wire.name} (${label(e.a)} to ${label(e.b)})`))}.` : `No other feed is drawn into this circuit. Look for a chafed wire touching another live wire, or a fault inside ${tref} (its own controller).`, expect: '' });
        bf.ifOk = null;
        const es = add({ id: 'earthside', text: `If ${tref} is switched on its earth side, measure ${ek ? label(ek) : 'its earth pin'} to earth with it meant to be off.`, expect: 'supply voltage through the load (it should not be at earth)' });
        es.ifNot = { text: 'The switched earth wire is touching the chassis somewhere. Check it where it passes grommets, clips and sharp edges.' };
        es.ifOk = { text: 'The earth side is fine.' };
      }
    }

    if (sym.id === 'fuse') {
      const fuseSteps = path.steps.map((s, i) => ({ ...s, i })).filter((s) => s.e.kind === 'fuse' || s.e.kind === 'pdm');
      if (!fuseSteps.length) {
        add({ id: 'nofuse', text: `No fuse protects ${tref} in the drawing. Fit one close to the supply, rated above the load current and no higher than the smallest wire can carry.`, expect: '' });
      } else {
        const f = fuseSteps[fuseSteps.length - 1], fe = f.e, out = fe.b, fref = refOf(fe.it) + wayName(fe.it, pinOf(fe.b));
        const rating = wayRating(fe.it, pinOf(fe.b)), r = N.res.find((x) => x.a === fe.a && x.b === fe.b && x.kind === fe.kind), amps = r ? Math.abs(r.amps) : 0;
        const after = path.steps.slice(f.i + 1), firstSw = after.findIndex((s) => ['switch', 'relay', 'pdm'].includes(s.e.kind));
        const beforeSw = describe((firstSw < 0 ? after : after.slice(0, firstSw)).map((s) => s.e)).filter((x) => /^wire|^connector/.test(x));
        const afterSw = firstSw < 0 ? [] : describe(after.slice(firstSw + 1).map((s) => s.e)).filter((x) => /^wire|^connector/.test(x));
        const sch = Loom.schedule(project).fuses.find((x) => x.part === fe.it.p.id && x.ref === fe.it.p.label + (fe.it.p.type === 'fuse_box' ? ' way ' + pinOf(fe.b) : fe.it.b.kind === 'pdm' ? ' ' + pinOf(fe.b) : fe.it.p.type === 'fuse_box_lucas' ? ' way ' + parseInt(pinOf(fe.b), 10) / 2 : ''));
        const onWay = sch ? sch.loads.map((x) => `${x.ref} (${x.amps} A)`) : [tref];
        const gm = Loom.wireGrommets ? Loom.wireGrommets(project) : new Map();
        const through = path.steps.slice(f.i + 1).filter((s) => s.e.kind === 'wire' && gm.has(s.e.wire.id)).map((s) => `${s.e.wire.name} through ${gm.get(s.e.wire.id).join(', ')}`);
        if (through.length) notes.push(`Wires on this fuse that pass through grommets or bulkheads, the usual places for chafing: ${list(through)}.`);
        const smallest = sch && sch.smallest ? Loom.gaugeInfo(sch.smallest) : null;
        const w = add({ id: 'when', text: `Note when ${fref}${rating ? ' (' + rating + ' A)' : ''} blows. Straight away when fitted with everything off: go to step {A}. Only when ${tref} is switched on: go to step {B}. After running a while, or under heavy load: go to step {C}.`, expect: '' });
        const A = add({ id: 'A', text: `Take the fuse out and switch everything off. Measure resistance from ${label(out)} (the load side of the fuse holder) to chassis earth.`, expect: 'open circuit, or many ohms through other loads' });
        const Bs = add({ id: 'B', text: `Leave the fuse out. Switch on${setup.length ? ' (' + setup.join(', ') + ')' : ''} and measure resistance from ${label(out)} to earth again.`, expect: amps > 0 ? `roughly ${fmt(sol.supply / amps, 1)} Ω or more (motors and LED drivers read lower or higher); near 0 Ω means a short` : 'not near 0 Ω' });
        const C = add({ id: 'C', text: `Refit the fuse and measure the current with a clamp meter while ${tref} runs.`, expect: amps ? `about ${fmt(amps, 1)} A${rating ? ` on a ${rating} A fuse (${Math.round((amps / rating) * 100)}%)` : ''}` : 'the load\'s rated current' });
        w.ifOk = null;
        A.ifOk = { text: 'No short with the circuit off.', goto: 'B' };
        A.ifNot = { text: `Under about 1 Ω: a short between the fuse and the first switch. Check ${list(beforeSw.length ? beforeSw : ['the wires after the fuse'])} where they pass grommets, bulkheads, clips and sharp edges. Unplug connectors to split the harness and find which half holds the short.` };
        Bs.ifOk = { text: 'No short with it switched on either.', goto: 'C' };
        Bs.ifNot = { text: `A short after the switch or inside a load. Disconnect the loads on this fuse one at a time and measure again: ${list(onWay)}. If it is still low with them all off, check ${list(afterSw.length ? afterSw : ['the wires to the load'])}.` };
        C.ifOk = { text: `Current is normal. Check the fuse holder for heat marks or a loose fit (a hot holder blows fuses below their rating) and that the right type of fuse is fitted.` };
        C.ifNot = { text: `${tref} draws too much: a failing or stalled motor or pump, a seized mechanism, or a partial short to earth. Test each load on this fuse: ${list(onWay)}.` };
        if (rating && amps > rating * 0.8) notes.push(`The expected current is ${Math.round((amps / rating) * 100)}% of the fuse rating, so it is close to its limit even when healthy. Use a larger fuse only if every wire it protects can carry it${smallest ? ` (the smallest is ${smallest.mm2} mm², about ${smallest.guideA} A)` : ''}.`);
        notes.push('Never fit a bigger fuse just to stop it blowing. The fuse protects the wire.');
        steps.forEach((s) => { s.text = s.text.replace('{A}', '%A').replace('{B}', '%B').replace('{C}', '%C'); });
      }
    }

    if (sym.id === 'dim') {
      const bat = add({ id: 'bat', text: `Measure the supply at ${srcRef}: + to −, with the load off.`, expect: src.what === 'charger' ? `about ${fmt(src.emf, 1)} V` : `12.4 to 12.7 V engine off, 13.8 to 14.4 V running${N.vn !== 12 ? ` (for a ${N.vn} V system, scale accordingly)` : ''}` });
      bat.ifNot = { text: 'Charge and test the battery (and alternator) first. A low supply makes every load dim.' };
      const totalDrop = (tps[0] ? tps[0].v : 0) - loadPin.v;
      const tot = add({ id: 'total', text: `Switch ${tref} on. Measure the voltage drop from ${tps[0].label} to ${loadPin.label}, one probe on each (use a long lead).`, expect: `about ${fmt(totalDrop, 2)} V (under 0.5 V is good)` });
      bat.ifOk = { goto: tot.id };
      const ear = add({ id: 'earthdrop', text: `Measure the drop on the earth side: from ${ek ? label(ek) : tref + ' earth'} to the battery negative, with ${tref} running.`, expect: `about ${fmt(ek ? Vk(ek) : 0, 2)} V (under 0.2 V is good)` });
      tot.ifOk = { text: 'The supply side is fine.', goto: ear.id };
      let prev = null;
      const dv = (v) => (v < 0.05 ? 'under 0.05 V' : `about ${fmt(v, 2)} V`);
      segs.forEach((seg, i) => {
        const a = tps[i], b = tps[i + 1], drop = Math.max(0, a.v - b.v), joint = seg.every((e) => e.kind !== 'wire');
        const st = add({ id: 'seg' + i, text: `Measure across ${list(describe(seg)) || 'this part'}: from ${a.at} to ${b.at}, with ${tref} running.`, expect: joint ? `${dv(drop)} (up to 0.2 V is acceptable)` : dv(drop) });
        if (prev) prev.ifOk = { goto: st.id }; else tot.ifNot = { text: 'There is too much drop on the supply side. Find it one part at a time.', goto: st.id };
        st.ifNot = { text: `More than ${joint ? '0.2' : fmt(drop + 0.3, 2)} V here is the cause. ${joint ? 'The contacts or the holder are burnt, loose or corroded: clean or replace.' : 'Check the crimps at both ends and look for corrosion or a partly broken wire. If the wire is sound, it is too thin or too long for the current: use a heavier gauge.'}` };
        prev = st;
      });
      if (prev) prev.ifOk = { text: 'Each part reads as expected.', goto: ear.id };
      ear.ifOk = { text: `Supply and earth are both fine, so ${tref} itself is weak: worn motor brushes, failing LEDs, a blocked pump or a tired compressor.` };
      ear.ifNot = { text: `The earth path has resistance: check ${list(earthPath ? describe(earthPath.steps.map((s) => s.e)) : ['the earth wire'])}, the earth points (clean bare metal, tight, star washer), the battery earth strap and the engine to chassis strap.` };
    }

    // link the steps
    const num = new Map(steps.map((s, i) => [s.id, i + 1]));
    steps.forEach((s) => {
      s.n = num.get(s.id);
      s.text = s.text.replace(/%([ABC])/g, (_, x) => String(num.get(x)));
      ['ifOk', 'ifNot'].forEach((f) => { if (s[f] && s[f].goto) s[f].step = num.get(s[f].goto) || null; });
    });
    if (sol.notes.length) notes = notes.concat(sol.notes.filter((n) => !/lose/.test(n)));
    notes.push('Expected readings come from the drawing and assume healthy parts. Real readings vary a little; look for big differences.');
    return {
      title: `${tref}: ${sym.name.toLowerCase()}`, symptom: sym.id, symptomName: sym.name, part: target.p.id, sheetId: target.sheet.id, ref: tref,
      setup, supply: srcRef, steps: steps.map(({ id, n, text, expect, ifOk, ifNot }) => ({ id, n, text, expect, ifOk: ifOk || null, ifNot: ifNot || null })),
      notes, highlight: { wires: [...highlight.wires], parts: [...highlight.parts] },
      path: tps.map((t) => ({ point: t.label, volts: +t.v.toFixed(2) })),
    };
  }

  function faultSheetText(f) {
    if (f.error) return f.error;
    const o = [`FAULT FINDING: ${f.title.toUpperCase()}`, ''];
    if (f.setup.length) o.push('Set up: ' + f.setup.join(', '), '');
    f.steps.forEach((s) => {
      o.push(`${s.n}. ${s.text}`);
      if (s.expect) o.push(`   Expect: ${s.expect}`);
      const br = (lab, x) => { if (x) o.push(`   ${lab}: ${[x.text, x.step ? `Go to step ${x.step}.` : ''].filter(Boolean).join(' ')}`); };
      br('If yes', s.ifOk); br('If not', s.ifNot);
    });
    if (f.notes.length) o.push('', 'Notes:', ...f.notes.map((n) => '- ' + n));
    return o.join('\n');
  }
  function faultSheetHTML(f, opts = {}) {
    if (f.error) return `<p>${esc(f.error)}</p>`;
    const br = (cls, lab, x) => (x ? `<div class="fs-${cls}"><b>${lab}</b> ${esc(x.text || '')}${x.step ? ` <a href="#fs-${esc(f.part)}-${x.step}" class="fs-go">Go to step ${x.step}</a>` : ''}</div>` : '');
    return `<section class="fault-sheet">
<h2>${esc(f.title)}</h2>
<p class="fs-meta">${esc(opts.project || '')}${opts.project ? ' · ' : ''}Supply ${esc(f.supply)}${f.setup.length ? ' · Set up: ' + esc(f.setup.join(', ')) : ''}</p>
<p class="fs-how">Use a multimeter on DC volts. "To earth" means black probe on clean chassis metal or the battery negative.</p>
<ol class="fs-steps">${f.steps.map((s) => `<li id="fs-${esc(f.part)}-${s.n}"><div class="fs-do">${esc(s.text)}</div>${s.expect ? `<div class="fs-expect"><b>Expect</b> ${esc(s.expect)}</div>` : ''}${br('ok', 'If yes', s.ifOk)}${br('not', 'If not', s.ifNot)}</li>`).join('')}</ol>
${f.path.length ? `<details class="fs-path"><summary>Expected voltages along the feed</summary><table><tr><th>Point</th><th>Volts</th></tr>${f.path.map((p) => `<tr><td>${esc(p.point)}</td><td>${p.volts.toFixed(2)}</td></tr>`).join('')}</table></details>` : ''}
${f.notes.length ? `<ul class="fs-notes">${f.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
</section>`;
  }
  const FAULT_CSS = `.fault-sheet{font:13px/1.45 system-ui,sans-serif;color:#222;max-width:820px;margin:0 auto 24px;page-break-after:always}
.fault-sheet h2{font-size:17px;margin:0 0 4px;border-bottom:2px solid #333;padding-bottom:4px}
.fs-meta,.fs-how{color:#555;margin:2px 0}
.fs-steps{padding-left:22px}.fs-steps li{margin:8px 0;padding:6px 8px;border:1px solid #ccc;border-radius:3px;break-inside:avoid}
.fs-do{font-weight:600}.fs-expect{margin-top:2px}.fs-ok b{color:#1e6b2e}.fs-not b{color:#a3241b}
.fs-go{white-space:nowrap}.fs-path table{border-collapse:collapse}.fs-path td,.fs-path th{border:1px solid #ccc;padding:2px 8px;text-align:left}
.fs-notes{color:#444}`;

  /* Loads you can fault-find or check the voltage of: labelled loads and relays, once each. */
  function faultTargets(d) {
    const project = projectOf(d), seen = new Set(), out = [];
    Loom.views(project).forEach((v) => v.parts.forEach((p) => {
      if (!p.label) return;
      const b = Loom.behaviour(v, p);
      if (b.kind !== 'load' && b.kind !== 'relay') return;
      const k = partKey(p); if (seen.has(k)) return; seen.add(k);
      out.push({ ref: p.label, part: p.id, sheetId: v.sheet.id, sheet: v.sheet.name, kind: b.kind, name: (Loom.partDef(v, p.type) || {}).name || p.type });
    }));
    return out;
  }
  /* Each load's voltage with its own switches on (other loads as they happen to be in that state). */
  function loadVoltages(d, opts = {}) {
    const project = projectOf(d);
    return faultTargets(project).filter((x) => x.kind === 'load').map((x) => {
      const st = poweringState(project, x.part, { limit: opts.limit || 400 });
      if (!st) return { ...x, volts: null, status: 'never on', state: '' };
      const sol = solveCircuit(project, st), l = sol.load(x.sheetId, x.part) || {};
      const inv = Loom.buildNet(project, { switches: 'open', relays: 'open', protect: false }).inv, names = [];
      const seen = new Set();
      inv.forEach((it) => { const k = partKey(it.p); if (!it.b.states || it.b.kind === 'protect' || seen.has(k)) return; seen.add(k); const s = st[k] != null ? st[k] : it.b.def || 0; if (s !== (it.b.def || 0)) names.push(`${refOf(it)} ${it.b.states[s]}`); });
      return { ...x, volts: l.volts, amps: l.amps, supply: l.supply, dropPct: l.dropPct, status: l.status, state: names.join(', ') };
    });
  }
  if (typeof Loom.PACK_CSS === 'string') Loom.PACK_CSS += FAULT_CSS;

  Object.assign(Loom, { solveCircuit, poweringState, faultFind, faultSheetHTML, faultSheetText, faultTargets, loadVoltages, FAULT_SYMPTOMS: SYMPTOMS, FAULT_CSS });
  return Loom;
});
