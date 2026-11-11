/*
 * LoomWright tidy routing: lays wires out on the grid with square corners, around parts,
 * with as few bends as possible and without running on top of other wires.
 * A* search over grid cells and directions; the result is stored as the wire's bend points,
 * so a routed wire can still be dragged and edited by hand afterwards.
 *
 * Extends window.Loom; needs loom-core.js first.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: AGPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./loom-core.js'));
  else factory(root.Loom);
})(typeof self !== 'undefined' ? self : this, function (Loom) {
  'use strict';
  const G = Loom.GRID;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const COST = { step: 1, bend: 6, cross: 4, along: 30, nearPart: 2 };

  class Heap {
    constructor() { this.a = []; }
    push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
    get size() { return this.a.length; }
  }

  /* Which way a pin faces: out of the nearest edge of its part. */
  function pinDir(doc, end) {
    const p = doc.parts.find((x) => x.id === end.part), at = Loom.pinPos(doc, end);
    if (!p || !at) return 0;
    const b = Loom.partBox(doc, p);
    const d = [[Math.abs(at.x - (b.x + b.w)), 0], [Math.abs(at.y - (b.y + b.h)), 1], [Math.abs(at.x - b.x), 2], [Math.abs(at.y - b.y), 3]];
    d.sort((x, y) => x[0] - y[0]);
    return d[0][1];
  }

  /* Route wires on one sheet. ids: the wires to route (all when empty). Returns how many were routed. */
  function tidyWires(doc, ids, opts = {}) {
    const want = ids && ids.length ? new Set(ids) : null;
    const list = doc.wires.filter((w) => (!want || want.has(w.id)) && w.route !== 'straight' && Loom.pinPos(doc, w.from) && Loom.pinPos(doc, w.to));
    if (!list.length) return 0;
    const bb = Loom.bounds(doc), pad = 200;
    const x0 = Math.floor((bb.x - pad) / G), y0 = Math.floor((bb.y - pad) / G), W = Math.ceil((bb.w + pad * 2) / G) + 1, H = Math.ceil((bb.h + pad * 2) / G) + 1;
    const idx = (cx, cy) => (cy - y0) * W + (cx - x0);
    const inside = (cx, cy) => cx >= x0 && cy >= y0 && cx < x0 + W && cy < y0 + H;
    const blocked = new Uint8Array(W * H), near = new Uint8Array(W * H), occH = new Uint16Array(W * H), occV = new Uint16Array(W * H);
    doc.parts.forEach((p) => {
      const d = Loom.partDef(doc, p.type) || {};
      if (d.cat === 'Annotation' && p.type !== 'note') return;
      const b = Loom.partBox(doc, p);
      for (let cx = Math.ceil(b.x / G) - 1; cx <= Math.floor((b.x + b.w) / G) + 1; cx++) {
        for (let cy = Math.ceil(b.y / G) - 1; cy <= Math.floor((b.y + b.h) / G) + 1; cy++) {
          if (!inside(cx, cy)) continue;
          const core = cx * G > b.x && cx * G < b.x + b.w && cy * G > b.y && cy * G < b.y + b.h;
          if (core) blocked[idx(cx, cy)] = 1; else near[idx(cx, cy)] = 1;
        }
      }
    });
    const mark = (pts, add) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], ax = Math.round(a.x / G), ay = Math.round(a.y / G), bx = Math.round(b.x / G), by = Math.round(b.y / G);
        if (ay === by) for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) { if (inside(x, ay)) occH[idx(x, ay)] += add; }
        else if (ax === bx) for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) { if (inside(ax, y)) occV[idx(ax, y)] += add; }
      }
    };
    // other wires stay where they are and count as obstacles to run along
    doc.wires.forEach((w) => { if (!list.includes(w)) { const pts = Loom.wirePoints(doc, w); if (pts) mark(pts, 1); } });
    // shortest wires first: they have the fewest choices
    const order = list.slice().sort((a, b) => { const la = Loom.pinPos(doc, a.from), lb = Loom.pinPos(doc, a.to), ma = Loom.pinPos(doc, b.from), mb = Loom.pinPos(doc, b.to); return (Math.abs(la.x - lb.x) + Math.abs(la.y - lb.y)) - (Math.abs(ma.x - mb.x) + Math.abs(ma.y - mb.y)); });
    let n = 0;
    order.forEach((w) => {
      const a = Loom.pinPos(doc, w.from), b = Loom.pinPos(doc, w.to), da = pinDir(doc, w.from), db = pinDir(doc, w.to);
      const s = { x: Math.round(a.x / G) + DIRS[da][0], y: Math.round(a.y / G) + DIRS[da][1] };
      const t = { x: Math.round(b.x / G) + DIRS[db][0], y: Math.round(b.y / G) + DIRS[db][1] };
      const route = search(s, da, t, (db + 2) % 4);
      if (!route) return;
      const cells = [{ x: Math.round(a.x / G), y: Math.round(a.y / G) }, ...route, { x: Math.round(b.x / G), y: Math.round(b.y / G) }];
      // keep only the corners, in drawing units
      const corners = [];
      for (let i = 1; i < cells.length - 1; i++) {
        const p = cells[i - 1], c = cells[i], q = cells[i + 1];
        if ((p.x === c.x) !== (c.x === q.x)) corners.push({ x: c.x * G, y: c.y * G });
      }
      // pins that sit off the grid: line the first and last legs up with them exactly
      if (corners.length) {
        const f = corners[0], l = corners[corners.length - 1];
        if (da % 2 === 0) f.y = a.y; else f.x = a.x;
        if (db % 2 === 0) l.y = b.y; else l.x = b.x;
      }
      const before = Loom.wirePoints(doc, w);
      w.points = corners; delete w.dx;
      if (!corners.length) delete w.points;
      mark(before, 0); mark(Loom.wirePoints(doc, w), 1);
      n++;
    });
    return n;

    function search(s, sd, t, td) {
      if (!inside(s.x, s.y) || !inside(t.x, t.y)) return null;
      const N = W * H * 4, g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), heap = new Heap();
      const key = (x, y, d) => idx(x, y) * 4 + d;
      const h = (x, y) => (Math.abs(x - t.x) + Math.abs(y - t.y)) * COST.step;
      const k0 = key(s.x, s.y, sd); g[k0] = 0; heap.push([h(s.x, s.y), k0]);
      let found = -1, budget = opts.budget || 400000;
      while (heap.size && budget-- > 0) {
        const [, k] = heap.pop(), cell = (k / 4) | 0, d = k % 4, cx = (cell % W) + x0, cy = ((cell / W) | 0) + y0;
        if (cx === t.x && cy === t.y && d === td) { found = k; break; }
        const gk = g[k];
        for (let nd = 0; nd < 4; nd++) {
          if (nd === (d + 2) % 4) continue;
          const nx = cx + DIRS[nd][0], ny = cy + DIRS[nd][1];
          if (!inside(nx, ny)) continue;
          const i = idx(nx, ny);
          if (blocked[i] && !(nx === t.x && ny === t.y)) continue;
          let c = COST.step + (nd !== d ? COST.bend : 0) + (near[i] ? COST.nearPart : 0);
          const along = nd % 2 === 0 ? occH[i] : occV[i], across = nd % 2 === 0 ? occV[i] : occH[i];
          if (along) c += COST.along * along;
          if (across) c += COST.cross;
          const nk = key(nx, ny, nd), ng = gk + c;
          if (ng < g[nk]) { g[nk] = ng; prev[nk] = k; heap.push([ng + h(nx, ny), nk]); }
        }
        // turning on the spot at the target to arrive the right way
        if (cx === t.x && cy === t.y && d !== td) { const nk = key(cx, cy, td), ng = gk + COST.bend; if (ng < g[nk]) { g[nk] = ng; prev[nk] = k; heap.push([ng, nk]); } }
      }
      if (found < 0) return null;
      const out = [];
      for (let k = found; k >= 0; k = prev[k]) { const cell = (k / 4) | 0; const p = { x: (cell % W) + x0, y: ((cell / W) | 0) + y0 }; if (!out.length || out[out.length - 1].x !== p.x || out[out.length - 1].y !== p.y) out.push(p); }
      return out.reverse();
    }
  }

  Object.assign(Loom, { tidyWires });
  return Loom;
});
