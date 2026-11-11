/*
 * LoomWright PDF export: every sheet as vector drawing, then the main tables, with
 * bookmarks for each sheet and part, and cross-references you can click.
 * It reads the SVG that LoomWright draws itself (rect, line, circle, path, text, tspan, g)
 * and writes PDF 1.4 by hand with the standard Courier and Helvetica fonts, so it works the
 * same in the app and in the Claude add-on with nothing extra to install.
 *
 * Extends window.Loom; needs loom-core.js and loom-reports.js first.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: AGPL-3.0-or-later
 */
/* global CompressionStream, Response */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./loom-core.js'));
  else factory(root.Loom);
})(typeof self !== 'undefined' ? self : this, function (Loom) {
  'use strict';
  const PT_PER_UNIT = 72 / 25.4 / 4; // 4 drawing units = 1 mm
  const MAX_PT = 14000; // PDF viewers cope up to 14400 pt a side

  /* ---------------- Reading LoomWright's SVG ---------------- */
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const unesc = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] != null ? ENT[e] : m));
  function parseSVG(src) {
    const top = { tag: '#root', attrs: {}, kids: [] }, stack = [top];
    const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(src))) {
      if (m[0][0] === '<' && (m[0][1] === '!' || m[0][1] === '?')) continue;
      if (m[5] != null) { stack[stack.length - 1].kids.push({ tag: '#text', text: unesc(m[5]) }); continue; }
      if (m[1]) { for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === m[2]) { stack.length = i; break; } continue; }
      const attrs = {};
      m[3].replace(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, k, a, b) => { attrs[k] = unesc(a != null ? a : b); return ''; });
      const node = { tag: m[2], attrs, kids: [] };
      stack[stack.length - 1].kids.push(node);
      if (!m[4]) stack.push(node);
    }
    return top;
  }

  /* ---------------- Numbers, colours, matrices ---------------- */
  const num = (v) => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? '0' : String(r); };
  const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', grey: '#808080', gray: '#808080', yellow: '#ffff00', orange: '#ffa500' };
  function colour(v) {
    if (v == null) return null;
    v = String(v).trim().toLowerCase();
    if (!v || v === 'none' || v === 'transparent') return null;
    if (NAMED[v]) v = NAMED[v];
    let m = /^#([0-9a-f]{3})$/.exec(v);
    if (m) return m[1].split('').map((c) => parseInt(c + c, 16) / 255);
    m = /^#([0-9a-f]{6})/.exec(v);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
    m = /^rgba?\(([^)]+)\)/.exec(v);
    if (m) return m[1].split(',').slice(0, 3).map((x) => Math.max(0, Math.min(1, parseFloat(x) / 255)));
    return [0, 0, 0];
  }
  const rgb = (c) => c.map(num).join(' ');
  const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const ID = [1, 0, 0, 1, 0, 0];
  function transformOf(s) {
    let N = ID;
    const list = [];
    String(s || '').replace(/(\w+)\s*\(([^)]*)\)/g, (_, f, a) => {
      const v = a.split(/[\s,]+/).filter(Boolean).map(Number);
      if (f === 'translate') list.push([1, 0, 0, 1, v[0] || 0, v[1] || 0]);
      else if (f === 'scale') list.push([v[0], 0, 0, v[1] == null ? v[0] : v[1], 0, 0]);
      else if (f === 'matrix' && v.length === 6) list.push(v);
      else if (f === 'rotate') {
        const r = (v[0] || 0) * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
        if (v.length >= 3) list.push([1, 0, 0, 1, v[1], v[2]], [c, sn, -sn, c, 0, 0], [1, 0, 0, 1, -v[1], -v[2]]);
        else list.push([c, sn, -sn, c, 0, 0]);
      }
      return '';
    });
    for (let i = list.length - 1; i >= 0; i--) N = mul(N, list[i]);
    return N;
  }

  /* ---------------- Paths: SVG path data to PDF operators ---------------- */
  function arcToBeziers(x1, y1, rx, ry, phi, large, sweep, x2, y2) {
    if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
    rx = Math.abs(rx); ry = Math.abs(ry);
    const sp = Math.sin(phi), cp = Math.cos(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const num_ = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let co = Math.sqrt(Math.max(0, num_ / den));
    if (large === sweep) co = -co;
    const cxp = co * (rx * y1p) / ry, cyp = co * -(ry * x1p) / rx;
    const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
    const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2))), d = dt / segs, k = (4 / 3) * Math.tan(d / 4), out = [];
    const pt = (t) => [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp];
    const dv = (t) => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * sp, -rx * Math.sin(t) * sp + ry * Math.cos(t) * cp];
    for (let i = 0; i < segs; i++) {
      const a = t1 + i * d, b = a + d, p0 = pt(a), p1 = pt(b), d0 = dv(a), d1 = dv(b);
      out.push([p0[0] + k * d0[0], p0[1] + k * d0[1], p1[0] - k * d1[0], p1[1] - k * d1[1], p1[0], p1[1]]);
    }
    return out;
  }
  function pathOps(d) {
    const tok = String(d || '').match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = null, cy = null, qx = null, qy = null, out = '';
    const n = () => parseFloat(tok[i++]);
    const isNum = () => i < tok.length && !/^[A-Za-z]$/.test(tok[i]);
    const c3 = (a, b, c, e, f, g) => { out += `${num(a)} ${num(b)} ${num(c)} ${num(e)} ${num(f)} ${num(g)} c\n`; };
    while (i < tok.length) {
      if (/^[A-Za-z]$/.test(tok[i])) cmd = tok[i++];
      else if (!cmd) { i++; continue; }
      const rel = cmd === cmd.toLowerCase() && cmd !== 'z', C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
      let keepC = false, keepQ = false;
      if (C === 'Z') { out += 'h\n'; x = sx; y = sy; cmd = ''; continue; }
      if (!isNum()) { cmd = ''; continue; }
      if (C === 'M') { x = ox + n(); y = oy + n(); sx = x; sy = y; out += `${num(x)} ${num(y)} m\n`; cmd = rel ? 'l' : 'L'; }
      else if (C === 'L') { x = ox + n(); y = oy + n(); out += `${num(x)} ${num(y)} l\n`; }
      else if (C === 'H') { x = ox + n(); out += `${num(x)} ${num(y)} l\n`; }
      else if (C === 'V') { y = oy + n(); out += `${num(x)} ${num(y)} l\n`; }
      else if (C === 'C') { const a = ox + n(), b = oy + n(); cx = ox + n(); cy = oy + n(); x = ox + n(); y = oy + n(); c3(a, b, cx, cy, x, y); keepC = true; }
      else if (C === 'S') { const a = cx == null ? x : 2 * x - cx, b = cy == null ? y : 2 * y - cy; cx = ox + n(); cy = oy + n(); const ex = ox + n(), ey = oy + n(); c3(a, b, cx, cy, ex, ey); x = ex; y = ey; keepC = true; }
      else if (C === 'Q' || C === 'T') {
        if (C === 'Q') { qx = ox + n(); qy = oy + n(); } else { qx = qx == null ? x : 2 * x - qx; qy = qy == null ? y : 2 * y - qy; }
        const ex = ox + n(), ey = oy + n();
        c3(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey);
        x = ex; y = ey; keepQ = true;
      } else if (C === 'A') {
        const rx = n(), ry = n(), rot = n(), la = n(), sw = n(), ex = ox + n(), ey = oy + n();
        arcToBeziers(x, y, rx, ry, rot * Math.PI / 180, !!la, !!sw, ex, ey).forEach((b) => c3(...b));
        x = ex; y = ey;
      } else { i++; }
      if (!keepC) { cx = null; cy = null; }
      if (!keepQ) { qx = null; qy = null; }
    }
    return out;
  }
  const K = 0.5522847498;
  function ellipseOps(cx, cy, rx, ry) {
    const kx = rx * K, ky = ry * K;
    return `${num(cx + rx)} ${num(cy)} m\n${num(cx + rx)} ${num(cy + ky)} ${num(cx + kx)} ${num(cy + ry)} ${num(cx)} ${num(cy + ry)} c\n${num(cx - kx)} ${num(cy + ry)} ${num(cx - rx)} ${num(cy + ky)} ${num(cx - rx)} ${num(cy)} c\n${num(cx - rx)} ${num(cy - ky)} ${num(cx - kx)} ${num(cy - ry)} ${num(cx)} ${num(cy - ry)} c\n${num(cx + kx)} ${num(cy - ry)} ${num(cx + rx)} ${num(cy - ky)} ${num(cx + rx)} ${num(cy)} c\nh\n`;
  }
  function roundRectOps(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    if (!(r > 0)) return `${num(x)} ${num(y)} ${num(w)} ${num(h)} re\n`;
    const k = r * (1 - K);
    return `${num(x + r)} ${num(y)} m\n${num(x + w - r)} ${num(y)} l\n${num(x + w - k)} ${num(y)} ${num(x + w)} ${num(y + k)} ${num(x + w)} ${num(y + r)} c\n${num(x + w)} ${num(y + h - r)} l\n${num(x + w)} ${num(y + h - k)} ${num(x + w - k)} ${num(y + h)} ${num(x + w - r)} ${num(y + h)} c\n${num(x + r)} ${num(y + h)} l\n${num(x + k)} ${num(y + h)} ${num(x)} ${num(y + h - k)} ${num(x)} ${num(y + h - r)} c\n${num(x)} ${num(y + r)} l\n${num(x)} ${num(y + k)} ${num(x + k)} ${num(y)} ${num(x + r)} ${num(y)} c\nh\n`;
  }

  /* ---------------- Text: WinAnsi encoding and the standard font widths ---------------- */
  const WIN = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
  const SUBST = { '→': '->', '←': '<-', '↔': '<->', '↑': '^', '↓': 'v', 'Ω': 'ohm', '≤': '<=', '≥': '>=', '≈': '~', '✓': 'ok', '✔': 'ok', '✕': 'x', '✗': 'x', '⚠': '!', 'Δ': 'd', '−': '-', ' ': ' ', ' ': ' ', '​': '', '⌀': 'Ø', '∅': 'Ø', '√': 'sqrt', '·': '·' };
  function winText(s) {
    let out = '';
    for (const ch of String(s == null ? '' : s)) {
      const c = ch.codePointAt(0);
      if (c === 9) out += ' ';
      else if (c < 0x20) continue;
      else if (c < 0x7f || (c >= 0xa0 && c <= 0xff)) out += ch;
      else if (WIN[c]) out += String.fromCharCode(WIN[c]);
      else if (SUBST[ch] != null) out += SUBST[ch];
      else out += '?';
    }
    return out;
  }
  function pdfStr(s) {
    let o = '(';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 40 || c === 41 || c === 92) o += '\\' + s[i];
      else if (c < 32 || c > 126) o += '\\' + c.toString(8).padStart(3, '0');
      else o += s[i];
    }
    return o + ')';
  }
  // Helvetica and Helvetica-Bold widths for character codes 32 to 126 (Adobe font metrics)
  const HV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const HVB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
  const HV_HI = { 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0xa0: 278, 0xb0: 400, 0xb2: 333, 0xb3: 333, 0xb7: 278, 0xd7: 584, 0xb5: 556 };
  function fontKey(family, bold) { return (/mono|courier|consol|menlo/i.test(family || '') ? 'C' : 'H') + (bold ? 'B' : ''); }
  function textWidth(s, size, fk) {
    if (fk[0] === 'C') return s.length * 0.6 * size;
    const tbl = fk === 'HB' ? HVB : HV;
    let w = 0;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); w += c >= 32 && c <= 126 ? tbl[c - 32] : HV_HI[c] || 556; }
    return (w * size) / 1000;
  }
  const FONT_RES = { C: 'Courier', CB: 'Courier-Bold', H: 'Helvetica', HB: 'Helvetica-Bold' };

  /* ---------------- Drawing an SVG tree into a PDF content stream ---------------- */
  const INHERIT = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'paint-order'];
  const BASE = { fill: '#000000', stroke: 'none', 'stroke-width': '1', 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'font-size': '16', 'font-weight': '400', 'text-anchor': 'start', 'font-family': 'sans-serif', opacity: 1 };
  function styleOf(parent, attrs) {
    const s = { ...parent };
    INHERIT.forEach((k) => { if (attrs[k] != null) s[k] = attrs[k]; });
    if (attrs.style) attrs.style.split(';').forEach((d) => { const [k, v] = d.split(':').map((x) => x && x.trim()); if (k && v && INHERIT.includes(k)) s[k] = v; });
    s.opacity = (parent.opacity == null ? 1 : parent.opacity) * (attrs.opacity != null ? parseFloat(attrs.opacity) : 1);
    return s;
  }

  class Painter {
    constructor(gs) { this.out = []; this.gs = gs; this.links = []; }
    gstate(ca, CA) {
      ca = Math.round(Math.max(0, Math.min(1, ca)) * 100) / 100; CA = Math.round(Math.max(0, Math.min(1, CA)) * 100) / 100;
      if (ca === 1 && CA === 1) return '';
      const k = ca + '/' + CA;
      if (!this.gs.has(k)) this.gs.set(k, { name: 'GS' + this.gs.size, ca, CA });
      return `/${this.gs.get(k).name} gs\n`;
    }
    paint(st, geom, closedOnly) {
      const fill = colour(st.fill), stroke = colour(st.stroke), sw = parseFloat(st['stroke-width']);
      const doFill = fill && !closedOnly, doStroke = stroke && sw > 0;
      if (!doFill && !doStroke) return;
      const fo = parseFloat(st['fill-opacity'] == null ? 1 : st['fill-opacity']), so = parseFloat(st['stroke-opacity'] == null ? 1 : st['stroke-opacity']);
      let s = 'q\n' + this.gstate(st.opacity * fo, st.opacity * so);
      if (doFill) s += rgb(fill) + ' rg\n';
      if (doStroke) {
        s += `${rgb(stroke)} RG\n${num(sw)} w\n${{ round: 1, square: 2 }[st['stroke-linecap']] || 0} J\n${{ round: 1, bevel: 2 }[st['stroke-linejoin']] || 0} j\n`;
        const da = String(st['stroke-dasharray'] || '').split(/[\s,]+/).filter(Boolean).map(Number).filter((v) => v >= 0);
        if (da.length && da.some((v) => v > 0)) s += `[${(da.length % 2 ? da.concat(da) : da).map(num).join(' ')}] ${num(parseFloat(st['stroke-dashoffset']) || 0)} d\n`;
      }
      const eo = st['fill-rule'] === 'evenodd' ? '*' : '';
      s += geom + (doFill && doStroke ? 'B' + eo : doFill ? 'f' + eo : 'S') + '\nQ\n';
      this.out.push(s);
    }
    node(nd, st, ctm) {
      if (nd.tag === '#text' || nd.tag === 'title' || nd.tag === 'desc' || nd.tag === 'defs' || nd.tag === 'style') return;
      const a = nd.attrs, s = styleOf(st, a);
      if (a.display === 'none' || a.visibility === 'hidden') return;
      let tf = '';
      if (a.transform) { const N = transformOf(a.transform); tf = N; ctm = mul(N, ctm); }
      if (tf) this.out.push(`q\n${tf.map(num).join(' ')} cm\n`);
      const f = (k, d = 0) => (a[k] == null ? d : parseFloat(a[k]) || 0);
      switch (nd.tag) {
        case 'g': case 'svg': case '#root': case 'a':
          nd.kids.forEach((k) => this.node(k, s, ctm)); break;
        case 'rect': { const w = f('width'), h = f('height'); if (w > 0 && h > 0) this.paint(s, roundRectOps(f('x'), f('y'), w, h, f('rx', f('ry')))); break; }
        case 'circle': { const r = f('r'); if (r > 0) this.paint(s, ellipseOps(f('cx'), f('cy'), r, r)); break; }
        case 'ellipse': this.paint(s, ellipseOps(f('cx'), f('cy'), f('rx'), f('ry'))); break;
        case 'line': this.paint({ ...s, fill: 'none' }, `${num(f('x1'))} ${num(f('y1'))} m\n${num(f('x2'))} ${num(f('y2'))} l\n`); break;
        case 'polyline': case 'polygon': {
          const v = String(a.points || '').split(/[\s,]+/).filter(Boolean).map(Number);
          if (v.length < 4) break;
          let g = `${num(v[0])} ${num(v[1])} m\n`;
          for (let i = 2; i + 1 < v.length; i += 2) g += `${num(v[i])} ${num(v[i + 1])} l\n`;
          this.paint(nd.tag === 'polyline' ? { ...s, fill: s.fill } : s, g + (nd.tag === 'polygon' ? 'h\n' : ''));
          break;
        }
        case 'path': this.paint(s, pathOps(a.d)); break;
        case 'text': this.text(nd, s, ctm); break;
        default: break;
      }
      if (tf) this.out.push('Q\n');
    }
    /* A text element and its tspans, laid out along one line. */
    text(nd, st, ctm) {
      const a = nd.attrs, runs = [];
      const collect = (n, s, link) => n.kids.forEach((k) => {
        if (k.tag === '#text') runs.push({ text: k.text, st: s, link });
        else if (k.tag === 'tspan') collect(k, styleOf(s, k.attrs), k.attrs['data-link'] || link);
      });
      collect(nd, st, a['data-link'] || null);
      // collapse white space as SVG does
      runs.forEach((r) => { r.text = r.text.replace(/\s+/g, ' '); });
      while (runs.length && !runs[0].text.trim()) runs.shift();
      if (runs.length) runs[0].text = runs[0].text.replace(/^ /, '');
      while (runs.length && !runs[runs.length - 1].text.trim()) runs.pop();
      if (runs.length) runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/ $/, '');
      if (!runs.length) return;
      runs.forEach((r) => {
        r.size = parseFloat(r.st['font-size']) || 16;
        r.fk = fontKey(r.st['font-family'], /bold|[6-9]00/.test(String(r.st['font-weight'])));
        r.s = winText(r.text); r.w = textWidth(r.s, r.size, r.fk);
      });
      const total = runs.reduce((t, r) => t + r.w, 0), anchor = st['text-anchor'];
      let x = (parseFloat(String(a.x || 0).split(/[\s,]+/)[0]) || 0) + (parseFloat(a.dx) || 0);
      const y = (parseFloat(String(a.y || 0).split(/[\s,]+/)[0]) || 0) + (parseFloat(a.dy) || 0);
      if (anchor === 'middle') x -= total / 2; else if (anchor === 'end') x -= total;
      const halo = colour(st.stroke) && parseFloat(st['stroke-width']) > 0 && /stroke/.test(st['paint-order'] || '');
      const draw = (mode) => {
        let xx = x, s = '';
        runs.forEach((r) => {
          const fill = colour(r.st.fill);
          if (mode === 'fill' && !fill) { xx += r.w; return; }
          s += 'q\n' + this.gstate(r.st.opacity * parseFloat(r.st['fill-opacity'] == null ? 1 : r.st['fill-opacity']), r.st.opacity * parseFloat(r.st['stroke-opacity'] == null ? 1 : r.st['stroke-opacity']));
          if (mode === 'halo') s += `${rgb(colour(st.stroke))} RG\n${num(parseFloat(st['stroke-width']))} w\n1 j\n1 J\n`;
          else s += `${rgb(fill)} rg\n`;
          s += `BT\n/${r.fk} ${num(r.size)} Tf\n${mode === 'halo' ? 1 : 0} Tr\n1 0 0 -1 ${num(xx)} ${num(y)} Tm\n${pdfStr(r.s)} Tj\nET\nQ\n`;
          if (mode === 'fill' && r.link) {
            const c = [apply(ctm, xx, y - r.size * 0.8), apply(ctm, xx + r.w, y + r.size * 0.25)];
            this.links.push({ link: r.link, rect: [Math.min(c[0][0], c[1][0]) - 1.5, Math.min(c[0][1], c[1][1]) - 1.5, Math.max(c[0][0], c[1][0]) + 1.5, Math.max(c[0][1], c[1][1]) + 1.5] });
          }
          xx += r.w;
        });
        this.out.push(s);
      };
      if (halo) draw('halo');
      draw('fill');
    }
  }

  /* ---------------- Writing the file ---------------- */
  function utf16(s) {
    let h = 'FEFF';
    for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
    return '<' + h + '>';
  }
  const latin1 = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  /* pages: [{w, h, content, annots:[{rect, dest:{page, fit:[l,b,r,t]}|null, uri}]}]; outline: [{title, dest, kids, open}] */
  function writePDF(pages, outline, info, gs, o = {}) {
    const objs = []; // index = object number - 1; each is a string or {dict, stream}
    const add = (v) => { objs.push(v); return objs.length; };
    const reserve = () => add(null);
    const catalogNo = reserve(), pagesNo = reserve();
    const fontNos = {};
    Object.keys(FONT_RES).forEach((k) => { fontNos[k] = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_RES[k]} /Encoding /WinAnsiEncoding >>`); });
    const gsDict = [...gs.values()].map((g) => `/${g.name} << /Type /ExtGState /ca ${num(g.ca)} /CA ${num(g.CA)} >>`).join(' ');
    const res = `<< /Font << ${Object.keys(fontNos).map((k) => `/${k} ${fontNos[k]} 0 R`).join(' ')} >>${gsDict ? ` /ExtGState << ${gsDict} >>` : ''} /ProcSet [/PDF /Text] >>`;
    const resNo = add(res);
    const pageNos = pages.map(() => reserve());
    const destOf = (d) => (d.fit ? `[${pageNos[d.page]} 0 R /FitR ${d.fit.map(num).join(' ')}]` : `[${pageNos[d.page]} 0 R /Fit]`);
    pages.forEach((p, i) => {
      const bytes = latin1(p.content);
      const z = p.z || (o.deflate ? o.deflate(bytes) : null);
      const contentNo = add({ dict: `<< /Length ${(z || bytes).length}${z ? ' /Filter /FlateDecode' : ''} >>`, bytes: z || bytes });
      const annots = (p.annots || []).filter((an) => an.dest || an.uri).map((an) => add(`<< /Type /Annot /Subtype /Link /Rect [${an.rect.map(num).join(' ')}] /Border [0 0 0] ${an.dest ? '/Dest ' + destOf(an.dest) : `/A << /S /URI /URI ${pdfStr(winText(an.uri))} >>`} >>`));
      objs[pageNos[i] - 1] = `<< /Type /Page /Parent ${pagesNo} 0 R /MediaBox [0 0 ${num(p.w)} ${num(p.h)}] /Resources ${resNo} 0 R /Contents ${contentNo} 0 R${annots.length ? ` /Annots [${annots.map((a) => a + ' 0 R').join(' ')}]` : ''} >>`;
    });
    objs[pagesNo - 1] = `<< /Type /Pages /Kids [${pageNos.map((n) => n + ' 0 R').join(' ')}] /Count ${pages.length} >>`;
    // bookmarks
    let outlinesNo = 0;
    if (outline && outline.length) {
      outlinesNo = reserve();
      const count = (items) => items.reduce((c, it) => c + 1 + (it.open && it.kids ? count(it.kids) : 0), 0);
      const place = (items, parentNo) => {
        const nos = items.map(() => reserve());
        items.forEach((it, i) => {
          let s = `<< /Title ${utf16(String(it.title || ''))} /Parent ${parentNo} 0 R /Dest ${destOf(it.dest)}`;
          if (i > 0) s += ` /Prev ${nos[i - 1]} 0 R`;
          if (i < items.length - 1) s += ` /Next ${nos[i + 1]} 0 R`;
          if (it.kids && it.kids.length) {
            const kn = place(it.kids, nos[i]);
            s += ` /First ${kn[0]} 0 R /Last ${kn[kn.length - 1]} 0 R /Count ${it.open ? count(it.kids) : -it.kids.length}`;
          }
          objs[nos[i] - 1] = s + ' >>';
        });
        return nos;
      };
      const top = place(outline, outlinesNo);
      objs[outlinesNo - 1] = `<< /Type /Outlines /First ${top[0]} 0 R /Last ${top[top.length - 1]} 0 R /Count ${count(outline)} >>`;
    }
    objs[catalogNo - 1] = `<< /Type /Catalog /Pages ${pagesNo} 0 R${outlinesNo ? ` /Outlines ${outlinesNo} 0 R /PageMode /UseOutlines` : ''} /ViewerPreferences << /DisplayDocTitle true >> >>`;
    const infoNo = add(`<< ${Object.entries(info).filter(([, v]) => v).map(([k, v]) => `/${k} ${k === 'CreationDate' ? pdfStr(v) : utf16(String(v))}`).join(' ')} >>`);
    // serialise
    const chunks = [], offsets = [];
    let len = 0;
    const put = (x) => { const b = typeof x === 'string' ? latin1(x) : x; chunks.push(b); len += b.length; };
    put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    objs.forEach((ob, i) => {
      offsets[i] = len;
      if (ob && typeof ob === 'object') { put(`${i + 1} 0 obj\n${ob.dict}\nstream\n`); put(ob.bytes); put('\nendstream\nendobj\n'); }
      else put(`${i + 1} 0 obj\n${ob == null ? 'null' : ob}\nendobj\n`);
    });
    const xref = len;
    let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((o_) => { x += String(o_).padStart(10, '0') + ' 00000 n \n'; });
    put(x + `trailer\n<< /Size ${objs.length + 1} /Root ${catalogNo} 0 R /Info ${infoNo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len);
    let at = 0;
    chunks.forEach((c) => { out.set(c, at); at += c.length; });
    return out;
  }

  /* ---------------- Table pages ---------------- */
  const A4L = [841.89, 595.28];
  /* Lay a table out over as many A4 landscape pages as it needs. cells may carry {text, link}. */
  function tablePages(title, subtitle, head, rows, o = {}) {
    const [W, H] = o.page || A4L, M = 34, size = 7.6, rowH = 12, headH = 15, top = 74, bottom = 40, avail = W - 2 * M;
    const cellText = (c) => winText(c && typeof c === 'object' ? c.text : c);
    const nat = head.map((h, i) => Math.min(o.maxCol || 240, Math.max(textWidth(winText(h), size, 'HB'), ...rows.map((r) => textWidth(cellText(r[i]), size, 'H'))) + 8));
    let widths = nat.slice();
    if (widths.reduce((a, b) => a + b, 0) > avail) {
      // shave the widest columns first until the table fits
      const sorted = nat.slice().sort((a, b) => b - a);
      let cap = sorted[0];
      for (let lo = 20, hi = cap; hi - lo > 0.5;) { const mid = (lo + hi) / 2; if (nat.reduce((t, w) => t + Math.min(w, mid), 0) > avail) hi = mid; else lo = mid; cap = lo; }
      widths = nat.map((w) => Math.min(w, cap));
    }
    const scale = Math.min(1, avail / widths.reduce((a, b) => a + b, 0));
    widths = widths.map((w) => w * scale);
    const per = Math.max(1, Math.floor((H - top - bottom - headH) / rowH)), pages = [];
    for (let start = 0; start < Math.max(1, rows.length); start += per) pages.push(rows.slice(start, start + per));
    const fit = (s, w, fk) => { if (textWidth(s, size, fk) <= w + 0.5) return s; let t = s; while (t.length > 1 && textWidth(t + '\x85', size, fk) > w) t = t.slice(0, -1); return t + '\x85'; };
    const txt = (x, y, s, fk, sz, col) => `${col ? rgb(col) + ' rg\n' : ''}BT\n/${fk} ${num(sz)} Tf\n${num(x)} ${num(H - y)} Td\n${pdfStr(s)} Tj\nET\n`;
    return pages.map((list, pi) => {
      let s = '', y = top;
      const annots = [];
      s += txt(M, 44, winText(title) + (pages.length > 1 ? `  (${pi + 1}/${pages.length})` : ''), 'HB', 14, [0.11, 0.14, 0.13]);
      if (subtitle) s += txt(M, 58, winText(subtitle), 'H', 8, [0.36, 0.38, 0.37]);
      s += `0.93 0.94 0.93 rg\n${num(M)} ${num(H - y - headH)} ${num(avail * Math.min(1, widths.reduce((a, b) => a + b, 0) / avail))} ${num(headH)} re\nf\n`;
      let x = M;
      head.forEach((h, i) => { s += txt(x + 4, y + 10.5, fit(winText(h), widths[i] - 8, 'HB'), 'HB', size, [0.11, 0.14, 0.13]); x += widths[i]; });
      y += headH;
      const tw = widths.reduce((a, b) => a + b, 0);
      list.forEach((r, ri) => {
        if (ri % 2) s += `0.975 0.978 0.975 rg\n${num(M)} ${num(H - y - rowH)} ${num(tw)} ${num(rowH)} re\nf\n`;
        x = M;
        head.forEach((_, i) => {
          const c = r[i], str = fit(cellText(c), widths[i] - 8, 'H'), link = c && typeof c === 'object' ? c.link : null;
          if (str) s += txt(x + 4, y + 8.6, str, 'H', size, link ? [0.17, 0.37, 0.72] : [0.11, 0.14, 0.13]);
          if (link && str) annots.push({ link, rect: [x + 2, H - y - rowH + 1, x + 4 + textWidth(str, size, 'H') + 2, H - y - 1] });
          x += widths[i];
        });
        y += rowH;
      });
      s += `0.75 0.77 0.76 RG\n0.5 w\n${num(M)} ${num(H - top)} m\n${num(M + tw)} ${num(H - top)} l\nS\n${num(M)} ${num(H - top - headH)} m\n${num(M + tw)} ${num(H - top - headH)} l\nS\n${num(M)} ${num(H - y)} m\n${num(M + tw)} ${num(H - y)} l\nS\n`;
      if (!rows.length) s += txt(M, top + headH + 14, winText(o.empty || 'Nothing to list.'), 'H', 9, [0.36, 0.38, 0.37]);
      return { w: W, h: H, content: s, annots, footer: true };
    });
  }

  /* Which tables can go after the drawings, the columns they keep and which column names a part. */
  const PDF_TABLES = {
    wires: { title: 'Wire list', cols: ['Sheet', 'Wire', 'From', 'To', 'Colour code', 'Colour', 'Size mm2', 'Length m', 'Current A', 'Voltage drop V', 'Circuit', 'Harness'] },
    connectors: { title: 'Connectors', cols: ['Connector', 'Type', 'Cavity', 'Wire', 'Code', 'Size mm2', 'Circuit', 'Goes to', 'Terminal', 'Seal'], ref: 'Connector' },
    fuses: { title: 'Fuses, relays and supplies', cols: ['Kind', 'Sheet', 'Ref', 'Rating A', 'Load A', 'Use %', 'Status', 'Smallest wire mm2', 'Feeds'], ref: 'Ref', sheet: 'Sheet' },
    voltages: { title: 'Voltage at each load', cols: ['Load', 'Sheet', 'Switched on by', 'Volts', 'Supply V', 'Drop %', 'Amps', 'Status'], ref: 'Load', sheet: 'Sheet' },
    bom: { title: 'Parts and costs', cols: ['Qty', 'Component', 'Spec', 'Part number', 'Supplier', 'Unit price', 'Total', 'References'] },
    cable: { title: 'Cable totals', cols: ['Size mm2', 'Code', 'Colour', 'Insulation', 'Wires', 'Total m', 'Buy m (+15%)', 'Cost'] },
    locations: { title: 'Where parts are fitted', cols: ['Ref', 'Component', 'Location', 'Sheet'], ref: 'Ref', sheet: 'Sheet' },
  };
  const DEFAULT_TABLES = ['wires', 'connectors', 'fuses', 'voltages', 'bom'];

  /* The whole project as one PDF. o: {sheets:[ids], tables:[kinds], bw, deflate(bytes), date} */
  function buildPDF(project, o = {}) {
    if (!project || !Array.isArray(project.sheets)) throw new Error('Give a project to export.');
    const all = Loom.views(project), want = o.sheets && o.sheets.length ? new Set(o.sheets) : null;
    const views = all.filter((v) => !want || want.has(v.sheet.id));
    const gs = new Map(), pages = [], outline = [];
    const at = new Map(); // sheetId -> {page, M, W, H}
    const parsed = views.map((v) => {
      const svg = Loom.exportSVG(v, { links: true, bw: o.bw });
      const tree = parseSVG(svg), el = tree.kids.find((k) => k.tag === 'svg');
      const vb = String(el.attrs.viewBox || `0 0 ${el.attrs.width} ${el.attrs.height}`).split(/[\s,]+/).map(Number);
      let sc = PT_PER_UNIT;
      if (vb[2] * sc > MAX_PT || vb[3] * sc > MAX_PT) sc = Math.min(MAX_PT / vb[2], MAX_PT / vb[3]);
      const W = vb[2] * sc, H = vb[3] * sc, M = [sc, 0, 0, -sc, -vb[0] * sc, H + vb[1] * sc];
      at.set(v.sheet.id, { page: pages.length, M, W, H, sc, view: v });
      pages.push(null);
      return { v, tree, W, H, M };
    });
    const partDest = (sheetId, partId) => {
      const t = at.get(sheetId);
      if (!t) return null;
      const p = t.view.parts.find((x) => x.id === partId);
      if (!p) return { page: t.page };
      const b = Loom.partBox(t.view, p), cx = b.x + b.w / 2, cy = b.y + b.h / 2, hw = Math.max(260, b.w), hh = Math.max(180, b.h);
      const c1 = apply(t.M, cx - hw, cy + hh), c2 = apply(t.M, cx + hw, cy - hh);
      return { page: t.page, fit: [Math.max(0, c1[0]), Math.max(0, c1[1]), Math.min(t.W, c2[0]), Math.min(t.H, c2[1])] };
    };
    const wireDest = (sheetId, wireId) => {
      const t = at.get(sheetId);
      if (!t) return null;
      const w = t.view.wires.find((x) => x.id === wireId), pts = w && Loom.wirePoints(t.view, w);
      if (!pts) return { page: t.page };
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const hw = Math.max(260, (Math.max(...xs) - Math.min(...xs)) / 2 + 40), hh = Math.max(180, (Math.max(...ys) - Math.min(...ys)) / 2 + 40);
      const c1 = apply(t.M, cx - hw, cy + hh), c2 = apply(t.M, cx + hw, cy - hh);
      return { page: t.page, fit: [Math.max(0, c1[0]), Math.max(0, c1[1]), Math.min(t.W, c2[0]), Math.min(t.H, c2[1])] };
    };
    const resolve = (link) => {
      const [kind, sheetId, id] = String(link).split('|');
      if (kind === 'part') return partDest(sheetId, id);
      if (kind === 'wire') return wireDest(sheetId, id);
      if (kind === 'sheet') return at.has(sheetId) ? { page: at.get(sheetId).page } : null;
      return null;
    };
    // drawings
    parsed.forEach(({ v, tree, W, H, M }) => {
      const pt = new Painter(gs);
      pt.out.push(`q\n${M.map(num).join(' ')} cm\n`);
      pt.node(tree, { ...BASE }, M);
      pt.out.push('Q\n');
      pages[at.get(v.sheet.id).page] = { w: W, h: H, content: pt.out.join(''), annots: pt.links.map((l) => ({ rect: l.rect, dest: resolve(l.link) })) };
      const kids = v.parts.filter((p) => p.label && !(Loom.partDef(v, p.type) || {}).noLabel)
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
        .map((p) => ({ title: `${p.label}  ${(Loom.partDef(v, p.type) || {}).name || p.type}`, dest: partDest(v.sheet.id, p.id) }));
      outline.push({ title: `${v.sheetNo}. ${v.sheet.name}`, dest: { page: at.get(v.sheet.id).page }, kids, open: false });
    });
    // tables
    const findPart = (label, sheetName) => {
      if (!label) return null;
      const vs = all.filter((v) => !sheetName || v.sheet.name === sheetName);
      for (const v of vs) { const p = v.parts.find((x) => x.label === label); if (p && at.has(v.sheet.id)) return 'part|' + v.sheet.id + '|' + p.id; }
      return null;
    };
    const subtitle = [project.title, (project.meta || {}).project, o.date && /^\d{4}-\d\d-\d\dT/.test(o.date) ? o.date.slice(0, 10) : o.date].filter(Boolean).join(' · ');
    const tables = o.tables || DEFAULT_TABLES;
    tables.forEach((kind) => {
      const spec = PDF_TABLES[kind];
      if (!spec) throw new Error(`Unknown table "${kind}". Use any of: ${Object.keys(PDF_TABLES).join(', ')}`);
      let rows;
      try { rows = Loom.reportRows(project, kind); } catch (e) { return; }
      const head = rows[0], idx = spec.cols.map((c) => head.indexOf(c)).filter((i) => i >= 0), body = rows.slice(1).filter((r) => r.length);
      let cells;
      if (kind === 'wires') {
        // link the wire to where it is drawn, and each end to its part
        const list = Loom.wireList(project), ends = new Map();
        all.forEach((v) => v.wires.forEach((w) => ends.set(w.id, { s: v.sheet.id, from: w.from.part, to: w.to.part })));
        cells = body.map((r, i) => {
          const e = ends.get((list[i] || {}).id), ok = e && at.has(e.s);
          return idx.map((j) => {
            const h = head[j], val = r[j];
            if (!ok) return val;
            if (h === 'Wire') return { text: val, link: `wire|${e.s}|${list[i].id}` };
            if (h === 'From') return { text: val, link: `part|${e.s}|${e.from}` };
            if (h === 'To') return { text: val, link: `part|${e.s}|${e.to}` };
            return val;
          });
        });
      } else {
        const ri = spec.ref ? head.indexOf(spec.ref) : -1, si = spec.sheet ? head.indexOf(spec.sheet) : -1;
        cells = body.map((r) => idx.map((j) => {
          if (j !== ri) return r[j];
          const link = findPart(String(r[j] == null ? '' : r[j]).trim(), si >= 0 ? r[si] : null);
          return link ? { text: r[j], link } : r[j];
        }));
      }
      const tp = tablePages(spec.title, subtitle, idx.map((j) => head[j]), cells);
      outline.push({ title: spec.title, dest: { page: pages.length } });
      tp.forEach((p) => { p.annots = p.annots.map((a) => ({ rect: a.rect, dest: resolve(a.link) })); pages.push(p); });
    });
    // footers on table pages: project, page numbers and the disclaimer
    const disc = Loom.disclaimerFor ? Loom.disclaimerFor(project) : null;
    pages.forEach((p, i) => {
      if (!p.footer) return;
      const left = winText(`${project.title || 'Untitled project'} · LoomWright`), right = winText(`Page ${i + 1} of ${pages.length}`);
      p.content += `0.36 0.38 0.37 rg\nBT\n/H 7 Tf\n34 22 Td\n${pdfStr(left)} Tj\nET\nBT\n/H 7 Tf\n${num(p.w - 34 - textWidth(right, 7, 'H'))} 22 Td\n${pdfStr(right)} Tj\nET\n`;
      if (disc) {
        const line = winText(disc.short), sz = Math.min(6.5, ((p.w - 68) / textWidth(line, 1, 'H')));
        p.content += `BT\n/H ${num(sz)} Tf\n34 12 Td\n${pdfStr(line)} Tj\nET\n`;
      }
    });
    const date = o.date ? new Date(o.date) : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const cd = isNaN(date) ? '' : `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
    return { pages, outline, info: { Title: project.title || 'Untitled project', Subject: (project.meta || {}).project || '', Creator: 'LoomWright', Producer: 'LoomWright PDF writer', CreationDate: cd }, gs };
  }
  function projectPDF(project, o = {}) { const b = buildPDF(project, o); return writePDF(b.pages, b.outline, b.info, b.gs, o); }
  /* The same, compressed with the browser's own CompressionStream where there is one. */
  async function projectPDFAsync(project, o = {}) {
    const b = buildPDF(project, o);
    if (!o.deflate && typeof CompressionStream === 'function' && typeof Response === 'function') {
      for (const p of b.pages) {
        try {
          const cs = new CompressionStream('deflate'), w = cs.writable.getWriter();
          w.write(latin1(p.content)); w.close();
          p.z = new Uint8Array(await new Response(cs.readable).arrayBuffer());
        } catch (e) { p.z = null; }
      }
    }
    return writePDF(b.pages, b.outline, b.info, b.gs, o);
  }

  /* One SVG (a sheet, a formboard) on its own page; for exports that are not a whole project. */
  function svgToPDF(svg, o = {}) {
    const tree = parseSVG(svg), el = tree.kids.find((k) => k.tag === 'svg');
    if (!el) throw new Error('That is not an SVG drawing.');
    const vb = String(el.attrs.viewBox || `0 0 ${el.attrs.width} ${el.attrs.height}`).split(/[\s,]+/).map(Number);
    let sc = o.scale || PT_PER_UNIT;
    if (vb[2] * sc > MAX_PT || vb[3] * sc > MAX_PT) sc = Math.min(MAX_PT / vb[2], MAX_PT / vb[3]);
    const W = vb[2] * sc, H = vb[3] * sc, M = [sc, 0, 0, -sc, -vb[0] * sc, H + vb[1] * sc], gs = new Map(), pt = new Painter(gs);
    pt.out.push(`q\n${M.map(num).join(' ')} cm\n`); pt.node(tree, { ...BASE }, M); pt.out.push('Q\n');
    return writePDF([{ w: W, h: H, content: pt.out.join('') }], [], { Title: o.title || 'Drawing', Creator: 'LoomWright', Producer: 'LoomWright PDF writer' }, gs, o);
  }

  Object.assign(Loom, { projectPDF, projectPDFAsync, svgToPDF, PDF_TABLES, PDF_DEFAULT_TABLES: DEFAULT_TABLES, _pdf: { parseSVG, pathOps, winText, textWidth, transformOf } });
  return Loom;
});
