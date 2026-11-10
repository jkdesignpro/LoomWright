/*
 * LoomWright core: component library, wire colour standards, diagram model,
 * SVG renderer and design checks.
 *
 * Shared by the editor (browser / Tauri, as window.Loom) and the optional
 * Claude MCP add-on (Node, via require). No dependencies.
 *
 * Copyright (C) 2026 LoomWright contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Loom = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '0.3.0';
  const FORMAT = 'loomwright';
  const GRID = 10;
  const INK = '#1d2320';
  const MONO = "IBM Plex Mono, ui-monospace, Menlo, Consolas, monospace";

  /* ------------------------------------------------------------------ */
  /* Shape helpers. Every symbol is a list of plain-object shapes, so    */
  /* built-in and user-made components share one format.                 */
  /* ------------------------------------------------------------------ */
  const L = (x1, y1, x2, y2, o = {}) => ({ t: 'line', x1, y1, x2, y2, ...o });
  const R = (x, y, w, h, o = {}) => ({ t: 'rect', x, y, w, h, ...o });
  const C = (cx, cy, r, o = {}) => ({ t: 'circle', cx, cy, r, ...o });
  const P = (d, o = {}) => ({ t: 'path', d, ...o });
  const T = (x, y, text, o = {}) => ({ t: 'text', x, y, text, ...o });
  const DOT = (x, y, r = 2.5) => C(x, y, r, { fill: 'ink', w: 0 });

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fillOf = (f, ink) => (f === 'ink' ? ink : f === 'none' || f == null ? 'none' : f === 'paper' ? '#ffffff' : f);
  const tmpl = (s, props) => String(s).replace(/\{(\w+)\}/g, (_, k) => (props && props[k] != null ? props[k] : ''));

  function shapeSVG(s, props, ink = INK) {
    if (s.tx || s.ty) return `<g transform="translate(${s.tx || 0} ${s.ty || 0})">${shapeSVG({ ...s, tx: 0, ty: 0 }, props, ink)}</g>`;
    const sw = s.w != null ? s.w : 2;
    const stroke = s.stroke ? fillOf(s.stroke, ink) : ink;
    const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
    const st = `stroke="${sw ? stroke : 'none'}" stroke-width="${sw}"${dash}`;
    switch (s.t) {
      case 'line':
        return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" ${st} stroke-linecap="round"/>`;
      case 'rect':
      {
        // rects keep their width in `width` and stroke width in `sw`
        const rsw = s.sw != null ? s.sw : 2;
        return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.h}" rx="${s.rx || 0}" fill="${fillOf(s.fill || 'paper', ink)}" stroke="${rsw ? stroke : 'none'}" stroke-width="${rsw}"${dash}/>`;
      }
      case 'circle':
        return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${fillOf(s.fill || 'paper', ink)}" ${st}/>`;
      case 'path':
        return `<path d="${s.d}" fill="${fillOf(s.fill || 'none', ink)}" ${st} stroke-linejoin="round" stroke-linecap="round"/>`;
      case 'text': {
        const size = s.size || 9;
        const anchor = s.anchor || 'middle';
        return `<text x="${s.x}" y="${s.y}" font-size="${size}" text-anchor="${anchor}" font-weight="${s.weight || 400}" fill="${s.color ? fillOf(s.color, ink) : ink}" font-family="${MONO}">${esc(tmpl(s.text, props))}</text>`;
      }
      default:
        return '';
    }
  }
  // rect uses `w` for width in data, but `w` is stroke width for other shapes.
  // Normalise: rect width lives in `width`, stroke width in `sw`.
  function R2(x, y, width, h, o = {}) { return { t: 'rect', x, y, width, h, ...o }; }

  /* ------------------------------------------------------------------ */
  /* Component library                                                   */
  /* ------------------------------------------------------------------ */
  const CATEGORIES = [
    'Power & charging', 'Protection', 'Switches', 'Relays & control', 'Lighting', 'Motors & loads',
    'Gauges & sensors', 'Wiring & connectors', 'Electronics', 'Annotation',
  ];

  const lib = {};
  function def(id, d) { lib[id] = { id, props: [], ...d }; }
  const pin = (id, x, y, n) => ({ id: String(id), x, y, n: n || String(id) });
  const lead2 = (w, a = 0, b = w) => [L(0, 10, a, 10), L(b, 10, w, 10)];
  const two = (w) => [pin(1, 0, 10), pin(2, w, 10)];

  // ---- Power & charging ----
  def('battery', {
    name: 'Battery', cat: 'Power & charging', prefix: 'BAT', w: 60, h: 40,
    props: [{ k: 'volts', l: 'Voltage', d: '12V' }, { k: 'ah', l: 'Capacity', d: '' }],
    sub: '{volts} {ah}',
    pins: [pin('-', 0, 20, '−'), pin('+', 60, 20, '+')],
    shapes: [L(0, 20, 24, 20), L(26, 11, 26, 29, { w: 3 }), L(34, 4, 34, 36, { w: 3 }), L(36, 20, 60, 20), T(14, 12, '−', { size: 12 }), T(46, 12, '+', { size: 12 })],
  });
  def('battery_aux', {
    name: 'Auxiliary battery', cat: 'Power & charging', prefix: 'BAT', w: 60, h: 40,
    props: [{ k: 'volts', l: 'Voltage', d: '12V' }, { k: 'ah', l: 'Capacity', d: '100Ah' }],
    sub: 'AUX {volts} {ah}',
    pins: [pin('-', 0, 20, '−'), pin('+', 60, 20, '+')],
    shapes: [L(0, 20, 18, 20), L(20, 11, 20, 29, { w: 3 }), L(27, 4, 27, 36, { w: 3 }), L(33, 11, 33, 29, { w: 3 }), L(40, 4, 40, 36, { w: 3 }), L(42, 20, 60, 20)],
  });
  def('ground_chassis', {
    name: 'Chassis earth', cat: 'Power & charging', prefix: 'E', w: 40, h: 40, noLabel: true,
    pins: [pin('G', 20, 0, 'Earth')],
    shapes: [L(20, 0, 20, 22), L(6, 22, 34, 22, { w: 2.5 }), L(10, 22, 5, 31), L(20, 22, 15, 31), L(30, 22, 25, 31)],
  });
  def('ground_signal', {
    name: 'Earth / ground', cat: 'Power & charging', prefix: 'E', w: 40, h: 40, noLabel: true,
    pins: [pin('G', 20, 0, 'Earth')],
    shapes: [L(20, 0, 20, 20), L(6, 20, 34, 20, { w: 2.5 }), L(11, 27, 29, 27, { w: 2.5 }), L(16, 34, 24, 34, { w: 2.5 })],
  });
  def('earth_stud', {
    name: 'Earth stud / point', cat: 'Power & charging', prefix: 'G', w: 40, h: 40,
    props: [{ k: 'where', l: 'Location', d: '' }], sub: '{where}',
    pins: [pin('G', 20, 0, 'Stud')],
    shapes: [L(20, 0, 20, 12), C(20, 20, 8), C(20, 20, 3, { fill: 'ink', w: 0 }), L(10, 34, 30, 34, { w: 2.5 }), L(20, 28, 20, 34)],
  });
  def('alternator', {
    name: 'Alternator', cat: 'Power & charging', prefix: 'ALT', w: 60, h: 60,
    props: [{ k: 'amps', l: 'Output', d: '120A' }], sub: '{amps}',
    pins: [pin('B+', 60, 30), pin('D+', 30, 0, 'D+ / IND'), pin('-', 0, 30, '−')],
    shapes: [L(0, 30, 14, 30), L(46, 30, 60, 30), L(30, 0, 30, 14), C(30, 30, 16), T(30, 32, 'G', { size: 13, weight: 600 }), P('M23 38 q3.5 -4 7 0 t7 0', { w: 1.4 }), T(56, 25, 'B+', { size: 7, anchor: 'end' })],
  });
  def('starter_motor', {
    name: 'Starter motor', cat: 'Power & charging', prefix: 'M', w: 80, h: 60,
    pins: [pin('30', 0, 10, '30 battery'), pin('50', 80, 10, '50 start signal'), pin('31', 40, 60, '31 earth')],
    shapes: [L(0, 10, 10, 10), L(70, 10, 80, 10), R2(10, 0, 60, 20, { rx: 2 }), T(40, 13, 'SOLENOID', { size: 7 }), L(40, 20, 40, 24), C(40, 40, 16), T(40, 45, 'M', { size: 14, weight: 600 }), L(40, 56, 40, 60), T(14, 30, '30', { size: 7, anchor: 'start' }), T(66, 30, '50', { size: 7, anchor: 'end' })],
  });
  def('ignition_switch', {
    name: 'Ignition switch', cat: 'Power & charging', prefix: 'S', w: 80, h: 80,
    pins: [pin('30', 0, 20, '30 battery'), pin('75', 80, 20, '75 accessory (I)'), pin('15', 80, 40, '15 ignition (II)'), pin('50', 80, 60, '50 start (III)')],
    shapes: [R2(0, 0, 80, 80, { rx: 4 }), C(30, 46, 14), R2(27, 34, 6, 18, { fill: 'ink', sw: 0, rx: 2 }), T(6, 16, '30', { size: 8, anchor: 'start' }), T(74, 16, '75', { size: 8, anchor: 'end' }), T(74, 36, '15', { size: 8, anchor: 'end' }), T(74, 56, '50', { size: 8, anchor: 'end' }), T(30, 75, '0 I II III', { size: 7 })],
  });
  def('isolator', {
    name: 'Battery isolator / master switch', cat: 'Power & charging', prefix: 'S', w: 60, h: 40,
    props: [{ k: 'amps', l: 'Rating', d: '300A' }], sub: '{amps}',
    pins: [pin(1, 0, 20), pin(2, 60, 20)],
    shapes: [L(0, 20, 16, 20), L(44, 20, 60, 20), C(30, 20, 14), DOT(18, 20), DOT(42, 20), L(18, 20, 38, 10, { w: 2.5 }), P('M24 6 a14 14 0 0 1 12 0', { w: 1.2 })],
  });
  def('vsr', {
    name: 'Split charge relay (VSR)', cat: 'Power & charging', prefix: 'K', w: 80, h: 60,
    props: [{ k: 'amps', l: 'Rating', d: '140A' }], sub: '{amps}',
    pins: [pin('A', 0, 20, 'Start battery'), pin('B', 80, 20, 'Aux battery'), pin('GND', 40, 60, 'Earth'), pin('IND', 0, 40, 'Indicator')],
    shapes: [R2(0, 0, 80, 60, { rx: 4 }), T(40, 34, 'VSR', { size: 12, weight: 600 }), T(6, 16, 'A', { size: 8, anchor: 'start' }), T(74, 16, 'B', { size: 8, anchor: 'end' }), T(40, 54, 'GND', { size: 7 }), T(6, 44, 'IND', { size: 7, anchor: 'start' })],
  });
  def('dcdc', {
    name: 'DC-DC charger', cat: 'Power & charging', prefix: 'U', w: 100, h: 80,
    props: [{ k: 'amps', l: 'Rating', d: '25A' }], sub: '{amps}',
    pins: [pin('IN', 0, 20, 'Input (start battery)'), pin('SOL', 0, 40, 'Solar input'), pin('IGN', 0, 60, 'Ignition trigger'), pin('OUT', 100, 20, 'Output (aux battery)'), pin('GND', 100, 60, 'Earth')],
    shapes: [R2(0, 0, 100, 80, { rx: 4 }), T(50, 44, 'DC-DC', { size: 12, weight: 600 }), T(6, 23, 'IN', { size: 7, anchor: 'start' }), T(6, 43, 'SOLAR', { size: 7, anchor: 'start' }), T(6, 63, 'IGN', { size: 7, anchor: 'start' }), T(94, 23, 'OUT', { size: 7, anchor: 'end' }), T(94, 63, 'GND', { size: 7, anchor: 'end' })],
  });
  def('solar', {
    name: 'Solar panel', cat: 'Power & charging', prefix: 'PV', w: 60, h: 40,
    props: [{ k: 'watts', l: 'Power', d: '200W' }], sub: '{watts}',
    pins: [pin('+', 60, 10, '+'), pin('-', 60, 30, '−')],
    shapes: [R2(0, 0, 44, 40, { rx: 2 }), L(15, 0, 15, 40, { w: 1 }), L(29, 0, 29, 40, { w: 1 }), L(0, 13, 44, 13, { w: 1 }), L(0, 27, 44, 27, { w: 1 }), L(44, 10, 60, 10), L(44, 30, 60, 30), T(52, 7, '+', { size: 8 }), T(52, 27, '−', { size: 8 })],
  });
  def('socket_12v', {
    name: '12V power socket', cat: 'Power & charging', prefix: 'X', w: 40, h: 40,
    pins: [pin('+', 0, 10, '+'), pin('-', 0, 30, '−')],
    shapes: [C(24, 20, 14), C(24, 20, 4, { fill: 'ink', w: 0 }), L(0, 10, 12, 10), L(0, 30, 12, 30)],
  });
  def('socket_usb', {
    name: 'USB charger', cat: 'Power & charging', prefix: 'X', w: 60, h: 40,
    pins: [pin('+', 0, 10, '+'), pin('-', 0, 30, '−')],
    shapes: [R2(10, 0, 50, 40, { rx: 4 }), T(35, 24, 'USB', { size: 10, weight: 600 }), L(0, 10, 10, 10), L(0, 30, 10, 30)],
  });
  def('inverter', {
    name: 'Inverter', cat: 'Power & charging', prefix: 'U', w: 80, h: 40,
    props: [{ k: 'watts', l: 'Power', d: '1000W' }], sub: '{watts}',
    pins: [pin('+', 0, 10, 'DC +'), pin('-', 0, 30, 'DC −'), pin('L', 80, 10, 'AC L'), pin('N', 80, 30, 'AC N')],
    shapes: [R2(0, 0, 80, 40, { rx: 3 }), L(0, 40, 80, 0, { w: 1 }), T(18, 18, 'DC', { size: 8 }), T(62, 32, 'AC', { size: 8 })],
  });

  // ---- Protection ----
  def('fuse', {
    name: 'Blade fuse', cat: 'Protection', prefix: 'F', w: 60, h: 20,
    props: [{ k: 'rating', l: 'Rating', d: '15A' }], sub: '{rating}',
    pins: two(60), shapes: [...lead2(60, 16, 44), R2(16, 4, 28, 12, { rx: 2 }), L(16, 10, 44, 10, { w: 1.2 })],
  });
  def('fuse_maxi', {
    name: 'Maxi / MIDI / ANL fuse', cat: 'Protection', prefix: 'F', w: 80, h: 20,
    props: [{ k: 'rating', l: 'Rating', d: '100A' }, { k: 'style', l: 'Type', d: 'MIDI' }], sub: '{style} {rating}',
    pins: two(80), shapes: [...lead2(80, 18, 62), R2(18, 2, 44, 16, { rx: 2, sw: 2.5 }), L(18, 10, 62, 10, { w: 1.6 })],
  });
  def('fusible_link', {
    name: 'Fusible link', cat: 'Protection', prefix: 'FL', w: 60, h: 20,
    props: [{ k: 'rating', l: 'Rating', d: '80A' }], sub: '{rating}',
    pins: two(60), shapes: [...lead2(60, 14, 46), P('M14 10 q4 -8 8 0 t8 0 t8 0 t8 0', { w: 2 })],
  });
  def('breaker', {
    name: 'Circuit breaker', cat: 'Protection', prefix: 'CB', w: 60, h: 20,
    props: [{ k: 'rating', l: 'Rating', d: '50A' }, { k: 'reset', l: 'Reset', d: 'manual' }], sub: '{rating} {reset}',
    pins: two(60), shapes: [...lead2(60, 18, 42), DOT(18, 10), DOT(42, 10), P('M18 10 Q30 -6 42 10', { w: 2 })],
  });
  def('fuse_box', {
    name: 'Fuse box', cat: 'Protection', prefix: 'FB',
    props: [{ k: 'ways', l: 'Ways', d: 6, type: 'int', min: 1, max: 24 }, { k: 'ratings', l: 'Ratings (comma list)', d: '20A,15A,10A,10A,5A,5A' }],
    gen(p) {
      const n = p.ways, h = n * 20 + 20, r = String(p.ratings || '').split(',').map((s) => s.trim());
      const shapes = [R2(10, 0, 80, h, { rx: 3 }), L(0, h / 2, 26, h / 2), L(26, 20, 26, 20 + (n - 1) * 20), DOT(26, h / 2)];
      const pins = [pin('IN', 0, h / 2, 'Feed in')];
      for (let i = 0; i < n; i++) {
        const y = 20 + i * 20;
        shapes.push(L(26, y, 44, y), R2(44, y - 5, 22, 10, { rx: 1.5, sw: 1.5 }), L(44, y, 66, y, { w: 1 }), L(66, y, 100, y), T(36, y - 3, i + 1, { size: 7 }));
        if (r[i]) shapes.push(T(84, y - 3, r[i], { size: 7 }));
        pins.push(pin(i + 1, 100, y, `Way ${i + 1}${r[i] ? ' (' + r[i] + ')' : ''}`));
      }
      return { w: 100, h, pins, shapes };
    },
  });

  // ---- Switches ----
  const swArm = (x, y, x2, y2) => [DOT(x, y), L(x, y, x2, y2, { w: 2 })];
  def('switch_spst', {
    name: 'Switch (on/off)', cat: 'Switches', prefix: 'S', w: 60, h: 20,
    pins: two(60), shapes: [...lead2(60, 18, 42), ...swArm(20, 10, 40, 0), C(42, 10, 2.5)],
  });
  def('switch_spdt', {
    name: 'Changeover switch (on/on)', cat: 'Switches', prefix: 'S', w: 60, h: 40,
    pins: [pin('C', 0, 20, 'Common'), pin('1', 60, 10), pin('2', 60, 30)],
    shapes: [L(0, 20, 18, 20), ...swArm(20, 20, 40, 12), C(42, 10, 2.5), C(42, 30, 2.5), L(45, 10, 60, 10), L(45, 30, 60, 30)],
  });
  def('switch_dpdt', {
    name: 'Double-pole changeover', cat: 'Switches', prefix: 'S', w: 60, h: 80,
    pins: [pin('C1', 0, 20, 'Common 1'), pin('1A', 60, 10), pin('1B', 60, 30), pin('C2', 0, 60, 'Common 2'), pin('2A', 60, 50), pin('2B', 60, 70)],
    shapes: [L(0, 20, 18, 20), ...swArm(20, 20, 40, 12), C(42, 10, 2.5), C(42, 30, 2.5), L(45, 10, 60, 10), L(45, 30, 60, 30),
      L(0, 60, 18, 60), ...swArm(20, 60, 40, 52), C(42, 50, 2.5), C(42, 70, 2.5), L(45, 50, 60, 50), L(45, 70, 60, 70), L(30, 16, 30, 56, { w: 1.2, dash: '3 3' })],
  });
  def('switch_push_no', {
    name: 'Push button (normally open)', cat: 'Switches', prefix: 'S', w: 60, h: 20,
    pins: two(60), shapes: [...lead2(60, 18, 42), C(20, 10, 2.5), C(40, 10, 2.5), L(16, 3, 44, 3), L(30, 3, 30, -4)],
  });
  def('switch_push_nc', {
    name: 'Push button (normally closed)', cat: 'Switches', prefix: 'S', w: 60, h: 20,
    pins: two(60), shapes: [...lead2(60, 18, 42), C(20, 10, 2.5), C(40, 10, 2.5), L(16, 15, 44, 15), L(30, 15, 30, -2)],
  });
  def('switch_rocker_lit', {
    name: 'Illuminated rocker switch', cat: 'Switches', prefix: 'S', w: 80, h: 60,
    props: [{ k: 'legend', l: 'Legend', d: 'SPOTS' }], sub: '{legend}',
    pins: [pin('2', 0, 20, '2 power in'), pin('3', 80, 20, '3 load out'), pin('7', 0, 40, '7 lamp +'), pin('8', 80, 40, '8 lamp −')],
    shapes: [R2(0, 0, 80, 60, { rx: 6 }), L(0, 20, 26, 20), ...swArm(28, 20, 48, 12), C(52, 20, 2.5), L(55, 20, 80, 20), L(0, 40, 30, 40), P('M30 34 l10 6 l-10 6 z', { fill: 'ink', w: 1 }), L(40, 34, 40, 46), L(40, 40, 80, 40), T(6, 16, '2', { size: 7, anchor: 'start' }), T(74, 16, '3', { size: 7, anchor: 'end' }), T(6, 54, '7', { size: 7, anchor: 'start' }), T(74, 54, '8', { size: 7, anchor: 'end' })],
  });
  def('switch_rotary', {
    name: 'Rotary switch', cat: 'Switches', prefix: 'S',
    props: [{ k: 'positions', l: 'Positions', d: 3, type: 'int', min: 2, max: 12 }],
    gen(p) {
      const n = p.positions, h = n * 20 + 20, cy = h / 2;
      const shapes = [L(0, cy, 18, cy), DOT(20, cy), L(20, cy, 42, 20, { w: 2 }), P(`M44 14 A ${cy} ${cy} 0 0 1 44 ${h - 14}`, { w: 1, dash: '2 3' })];
      const pins = [pin('C', 0, cy, 'Common')];
      for (let i = 0; i < n; i++) { const y = 20 + i * 20; shapes.push(C(46, y, 2.5), L(49, y, 60, y), T(56, y - 3, i + 1, { size: 7 })); pins.push(pin(i + 1, 60, y, `Position ${i + 1}`)); }
      return { w: 60, h, pins, shapes };
    },
  });
  def('switch_pressure', {
    name: 'Pressure switch', cat: 'Switches', prefix: 'S', w: 60, h: 40,
    props: [{ k: 'what', l: 'Use', d: 'Oil pressure' }], sub: '{what}',
    pins: [pin(1, 0, 30), pin(2, 60, 30)],
    shapes: [L(0, 30, 18, 30), ...swArm(20, 30, 40, 20), C(42, 30, 2.5), L(45, 30, 60, 30), R2(18, 0, 24, 12, { rx: 2, sw: 1.2 }), T(30, 9, 'P', { size: 8 }), L(30, 12, 30, 24, { w: 1, dash: '2 2' })],
  });
  def('switch_temp', {
    name: 'Temperature switch', cat: 'Switches', prefix: 'S', w: 60, h: 40,
    props: [{ k: 'temp', l: 'Switch point', d: '92°C' }], sub: '{temp}',
    pins: [pin(1, 0, 30), pin(2, 60, 30)],
    shapes: [L(0, 30, 18, 30), ...swArm(20, 30, 40, 20), C(42, 30, 2.5), L(45, 30, 60, 30), R2(18, 0, 24, 12, { rx: 2, sw: 1.2 }), T(30, 9, 't°', { size: 8 }), L(30, 12, 30, 24, { w: 1, dash: '2 2' })],
  });
  def('switch_door', {
    name: 'Door / pin switch (earths)', cat: 'Switches', prefix: 'S', w: 40, h: 60,
    pins: [pin(1, 20, 0, 'Switch terminal')],
    shapes: [L(20, 0, 20, 14), DOT(20, 16), L(20, 16, 30, 32, { w: 2 }), C(20, 36, 2.5), L(20, 39, 20, 44), L(8, 44, 32, 44, { w: 2.5 }), L(13, 51, 27, 51, { w: 2.5 }), L(17, 58, 23, 58, { w: 2.5 })],
  });

  // ---- Relays & control ----
  function relayShapes(five) {
    const s = [R2(0, 0, 80, 80, { rx: 3 }), L(0, 60, 28, 60), R2(28, 52, 24, 16, { sw: 1.8 }), L(28, 68, 52, 52, { w: 1.2 }), L(52, 60, 80, 60),
      L(0, 20, 26, 20), DOT(28, 20), L(28, 20, 54, five ? 37 : 11, { w: 2 }), L(56, 20, 80, 20), L(56, 15, 56, 25),
      L(40, 52, 40, five ? 31 : 17, { w: 1.2, dash: '3 3' }),
      T(4, 15, '30', { size: 8, anchor: 'start' }), T(4, 55, '86', { size: 8, anchor: 'start' }), T(76, 15, '87', { size: 8, anchor: 'end' }), T(76, 55, '85', { size: 8, anchor: 'end' })];
    if (five) s.push(L(56, 40, 80, 40), L(56, 35, 56, 45), T(76, 35, '87a', { size: 8, anchor: 'end' }));
    return s;
  }
  def('relay4', {
    name: 'Relay, 4-pin (make)', cat: 'Relays & control', prefix: 'K', w: 80, h: 80,
    props: [{ k: 'rating', l: 'Rating', d: '30A' }], sub: '{rating}',
    pins: [pin('30', 0, 20, '30 common'), pin('86', 0, 60, '86 coil +'), pin('87', 80, 20, '87 normally open'), pin('85', 80, 60, '85 coil −')],
    shapes: relayShapes(false),
  });
  def('relay5', {
    name: 'Relay, 5-pin (changeover)', cat: 'Relays & control', prefix: 'K', w: 80, h: 80,
    props: [{ k: 'rating', l: 'Rating', d: '30/40A' }], sub: '{rating}',
    pins: [pin('30', 0, 20, '30 common'), pin('86', 0, 60, '86 coil +'), pin('87', 80, 20, '87 normally open'), pin('87a', 80, 40, '87a normally closed'), pin('85', 80, 60, '85 coil −')],
    shapes: relayShapes(true),
  });
  def('relay_ssr', {
    name: 'Solid state relay', cat: 'Relays & control', prefix: 'K', w: 80, h: 60,
    props: [{ k: 'rating', l: 'Rating', d: '40A' }], sub: '{rating}',
    pins: [pin('3', 0, 20, '3 control +'), pin('4', 0, 40, '4 control −'), pin('1', 80, 20, '1 load'), pin('2', 80, 40, '2 load')],
    shapes: [R2(0, 0, 80, 60, { rx: 3 }), T(40, 34, 'SSR', { size: 11, weight: 600 }), T(6, 16, '+', { size: 8, anchor: 'start' }), T(6, 54, '−', { size: 8, anchor: 'start' })],
  });
  def('flasher', {
    name: 'Flasher unit', cat: 'Relays & control', prefix: 'K', w: 60, h: 60,
    pins: [pin('B', 0, 20, 'B battery'), pin('L', 60, 20, 'L lamps'), pin('P', 60, 40, 'P pilot / warning'), pin('E', 0, 40, 'E earth')],
    shapes: [R2(0, 0, 60, 60, { rx: 3 }), P('M22 40 l6 -16 l4 10 l6 -16', { w: 1.6 }), T(6, 16, 'B', { size: 8, anchor: 'start' }), T(54, 16, 'L', { size: 8, anchor: 'end' }), T(54, 54, 'P', { size: 8, anchor: 'end' }), T(6, 54, 'E', { size: 8, anchor: 'start' })],
  });
  def('timer_relay', {
    name: 'Timer / delay relay', cat: 'Relays & control', prefix: 'K', w: 80, h: 80,
    props: [{ k: 'delay', l: 'Delay', d: '30s' }], sub: '{delay}',
    pins: [pin('30', 0, 20, '30 common'), pin('86', 0, 60, '86 trigger +'), pin('87', 80, 20, '87 output'), pin('85', 80, 60, '85 earth')],
    shapes: [...relayShapes(false), C(40, 40, 7, { w: 1.2 }), L(40, 40, 40, 35, { w: 1.2 }), L(40, 40, 44, 40, { w: 1.2 })],
  });
  def('module', {
    name: 'Control module / ECU', cat: 'Relays & control', prefix: 'U',
    props: [{ k: 'left', l: 'Pins on left', d: 3, type: 'int', min: 0, max: 40 }, { k: 'right', l: 'Pins on right', d: 3, type: 'int', min: 0, max: 40 }, { k: 'names', l: 'Pin names (comma list, left then right)', d: '+12V,IGN,GND,OUT 1,OUT 2,CAN' }, { k: 'text', l: 'Text inside', d: 'ECU' }],
    gen(p) {
      const n = Math.max(1, p.left, p.right), h = n * 20 + 20, w = 140, names = String(p.names || '').split(',').map((s) => s.trim());
      const shapes = [R2(10, 0, 120, h, { rx: 4 }), T(70, h / 2 + 4, p.text || '', { size: 11, weight: 600 })];
      const pins = [];
      for (let i = 0; i < p.left; i++) { const y = 20 + i * 20, nm = names[i] || `L${i + 1}`; shapes.push(L(0, y, 10, y), T(14, y + 3, nm, { size: 7, anchor: 'start' })); pins.push(pin('L' + (i + 1), 0, y, nm)); }
      for (let i = 0; i < p.right; i++) { const y = 20 + i * 20, nm = names[p.left + i] || `R${i + 1}`; shapes.push(L(130, y, 140, y), T(126, y + 3, nm, { size: 7, anchor: 'end' })); pins.push(pin('R' + (i + 1), w, y, nm)); }
      return { w, h, pins, shapes };
    },
  });

  // ---- Lighting ----
  const lampBody = (cx, cy, r) => [C(cx, cy, r), L(cx - r * 0.7, cy - r * 0.7, cx + r * 0.7, cy + r * 0.7, { w: 1.6 }), L(cx + r * 0.7, cy - r * 0.7, cx - r * 0.7, cy + r * 0.7, { w: 1.6 })];
  def('lamp', {
    name: 'Lamp / bulb', cat: 'Lighting', prefix: 'H', w: 40, h: 40,
    props: [{ k: 'watts', l: 'Rating', d: '' }], sub: '{watts}',
    pins: [pin(1, 0, 20), pin(2, 40, 20)], shapes: [L(0, 20, 8, 20), L(32, 20, 40, 20), ...lampBody(20, 20, 12)],
  });
  def('lamp_indicator', {
    name: 'Indicator / side lamp', cat: 'Lighting', prefix: 'H', w: 40, h: 40,
    props: [{ k: 'colour', l: 'Lens', d: 'Amber' }], sub: '{colour}',
    pins: [pin(1, 0, 20), pin(2, 40, 20)], shapes: [L(0, 20, 10, 20), L(30, 20, 40, 20), ...lampBody(20, 20, 10), P('M20 4 l0 -4 M30 8 l3 -3 M10 8 l-3 -3', { w: 1.2 })],
  });
  def('lamp_warning', {
    name: 'Warning light (dash)', cat: 'Lighting', prefix: 'H', w: 40, h: 40,
    props: [{ k: 'what', l: 'Warning', d: 'Oil' }, { k: 'colour', l: 'Colour', d: 'Red' }], sub: '{what}',
    pins: [pin(1, 0, 20), pin(2, 40, 20)], shapes: [L(0, 20, 10, 20), L(30, 20, 40, 20), R2(8, 8, 24, 24, { rx: 3, sw: 1.5 }), ...lampBody(20, 20, 8)],
  });
  def('headlamp', {
    name: 'Headlamp (dip / main)', cat: 'Lighting', prefix: 'H', w: 60, h: 60,
    pins: [pin('56b', 0, 20, '56b dip'), pin('56a', 0, 40, '56a main'), pin('31', 60, 30, '31 earth')],
    shapes: [C(30, 30, 22), P('M18 22 q6 -6 12 0 t12 0', { w: 1.6 }), P('M18 38 q6 -6 12 0 t12 0', { w: 1.6 }), L(0, 20, 18, 20), L(0, 40, 18, 40), L(42, 22, 42, 38, { w: 1.2 }), L(52, 30, 60, 30), T(14, 15, 'DIP', { size: 6, anchor: 'start' }), T(14, 52, 'MAIN', { size: 6, anchor: 'start' })],
  });
  def('led_bar', {
    name: 'LED light bar / spot', cat: 'Lighting', prefix: 'H', w: 100, h: 40,
    props: [{ k: 'watts', l: 'Rating', d: '120W' }], sub: '{watts}',
    pins: [pin('+', 0, 10, '+'), pin('-', 0, 30, '−')],
    shapes: [R2(10, 2, 90, 36, { rx: 5 }), L(0, 10, 10, 10), L(0, 30, 10, 30), ...[30, 50, 70, 88].flatMap((x) => [P(`M${x - 6} 14 l10 6 l-10 6 z`, { fill: 'ink', w: 1 }), L(x + 4, 14, x + 4, 26, { w: 1.5 })])],
  });
  def('beacon', {
    name: 'Beacon / strobe', cat: 'Lighting', prefix: 'H', w: 40, h: 40,
    pins: [pin('+', 0, 20, '+'), pin('-', 40, 20, '−')],
    shapes: [L(0, 20, 8, 20), L(32, 20, 40, 20), P('M8 32 L12 10 Q20 2 28 10 L32 32 Z', { fill: 'paper' }), L(14, 20, 26, 20, { w: 1.2 }), P('M4 6 l4 3 M36 6 l-4 3 M20 0 l0 3', { w: 1.2 })],
  });

  // ---- Motors & loads ----
  const motorLike = (letter) => [L(0, 20, 6, 20), L(34, 20, 40, 20), C(20, 20, 14), T(20, 25, letter, { size: 13, weight: 600 })];
  def('motor', { name: 'Motor', cat: 'Motors & loads', prefix: 'M', w: 40, h: 40, pins: [pin(1, 0, 20), pin(2, 40, 20)], shapes: motorLike('M') });
  def('pump', { name: 'Pump (fuel / water)', cat: 'Motors & loads', prefix: 'M', w: 40, h: 40, props: [{ k: 'what', l: 'Use', d: 'Fuel' }], sub: '{what}', pins: [pin(1, 0, 20), pin(2, 40, 20)], shapes: motorLike('P') });
  def('compressor', { name: 'Air compressor', cat: 'Motors & loads', prefix: 'M', w: 40, h: 40, pins: [pin('+', 0, 20, '+'), pin('-', 40, 20, '−')], shapes: motorLike('C') });
  def('fan', {
    name: 'Fan', cat: 'Motors & loads', prefix: 'M', w: 40, h: 40, pins: [pin(1, 0, 20), pin(2, 40, 20)],
    shapes: [L(0, 20, 6, 20), L(34, 20, 40, 20), C(20, 20, 14), P('M20 20 q-2 -10 6 -10 q-2 6 -6 10 M20 20 q10 -2 10 6 q-6 -2 -10 -6 M20 20 q2 10 -6 10 q2 -6 6 -10 M20 20 q-10 2 -10 -6 q6 2 10 6', { w: 1.2, fill: 'ink' })],
  });
  def('wiper_motor', {
    name: 'Wiper motor', cat: 'Motors & loads', prefix: 'M', w: 80, h: 80,
    pins: [pin('53', 0, 20, '53 slow'), pin('53b', 0, 40, '53b fast'), pin('31b', 0, 60, '31b park'), pin('31', 80, 60, '31 earth'), pin('53a', 80, 20, '53a park feed')],
    shapes: [R2(0, 0, 80, 80, { rx: 4 }), C(44, 40, 16), T(44, 45, 'M', { size: 13, weight: 600 }), T(6, 16, '53', { size: 7, anchor: 'start' }), T(6, 36, '53b', { size: 7, anchor: 'start' }), T(6, 56, '31b', { size: 7, anchor: 'start' }), T(74, 76, '31', { size: 7, anchor: 'end' }), T(74, 16, '53a', { size: 7, anchor: 'end' })],
  });
  def('winch', {
    name: 'Winch motor', cat: 'Motors & loads', prefix: 'M', w: 60, h: 60,
    props: [{ k: 'lbs', l: 'Rating', d: '9500lb' }], sub: '{lbs}',
    pins: [pin('A', 30, 0, 'A armature'), pin('F1', 0, 40, 'F1 field'), pin('F2', 60, 40, 'F2 field'), pin('-', 30, 60, '− earth')],
    shapes: [C(30, 30, 18), T(30, 35, 'M', { size: 13, weight: 600 }), L(30, 0, 30, 12), L(30, 48, 30, 60), L(0, 40, 13, 40), L(47, 40, 60, 40), T(5, 35, 'F1', { size: 7, anchor: 'start' }), T(55, 35, 'F2', { size: 7, anchor: 'end' }), T(34, 8, 'A', { size: 7, anchor: 'start' })],
  });
  def('winch_control', {
    name: 'Winch control box', cat: 'Motors & loads', prefix: 'U', w: 100, h: 120,
    pins: [pin('+', 0, 20, 'Battery +'), pin('-', 0, 40, 'Battery −'), pin('IN', 0, 80, 'Wind in'), pin('OUT', 0, 100, 'Wind out'), pin('A', 100, 20, 'A'), pin('F1', 100, 40, 'F1'), pin('F2', 100, 60, 'F2')],
    shapes: [R2(0, 0, 100, 120, { rx: 4 }), T(50, 64, 'CONTACTOR', { size: 8, weight: 600 }), ...['+', '−', '', 'IN', 'OUT'].map((t, i) => T(6, 23 + i * 20, t, { size: 7, anchor: 'start' })), ...['A', 'F1', 'F2'].map((t, i) => T(94, 23 + i * 20, t, { size: 7, anchor: 'end' }))],
  });
  def('horn', {
    name: 'Horn', cat: 'Motors & loads', prefix: 'B', w: 40, h: 40, pins: [pin(1, 0, 20), pin(2, 20, 40, '2 / earth')],
    shapes: [L(0, 20, 8, 20), R2(8, 14, 8, 12, { sw: 1.8 }), P('M16 14 L34 4 L34 36 L16 26 Z', { fill: 'paper' }), L(20, 28, 20, 40)],
  });
  def('buzzer', {
    name: 'Buzzer', cat: 'Motors & loads', prefix: 'B', w: 40, h: 40, pins: [pin('+', 0, 30, '+'), pin('-', 40, 30, '−')],
    shapes: [P('M6 30 A14 14 0 0 1 34 30 Z', { fill: 'paper' }), L(0, 30, 6, 30), L(34, 30, 40, 30), L(20, 16, 20, 30, { w: 1 })],
  });
  def('speaker', {
    name: 'Speaker', cat: 'Motors & loads', prefix: 'B', w: 40, h: 40, pins: [pin('+', 0, 10, '+'), pin('-', 0, 30, '−')],
    shapes: [L(0, 10, 12, 10), L(0, 30, 12, 30), R2(12, 12, 8, 16, { sw: 1.8 }), P('M20 12 L32 2 L32 38 L20 28 Z', { fill: 'paper' })],
  });
  def('heater', {
    name: 'Heater element / glow plug', cat: 'Motors & loads', prefix: 'R', w: 60, h: 40,
    props: [{ k: 'watts', l: 'Rating', d: '' }], sub: '{watts}',
    pins: [pin(1, 0, 30), pin(2, 60, 30)],
    shapes: [L(0, 30, 14, 30), L(46, 30, 60, 30), R2(14, 24, 32, 12), P('M20 18 q3 -4 0 -8 t0 -8 M30 18 q3 -4 0 -8 t0 -8 M40 18 q3 -4 0 -8 t0 -8', { w: 1.2 })],
  });
  def('solenoid', {
    name: 'Solenoid / valve', cat: 'Motors & loads', prefix: 'Y', w: 60, h: 40,
    props: [{ k: 'what', l: 'Use', d: 'Diff lock' }], sub: '{what}',
    pins: [pin(1, 0, 20), pin(2, 60, 20)],
    shapes: [L(0, 20, 16, 20), L(44, 20, 60, 20), R2(16, 8, 28, 24), L(16, 32, 44, 8, { w: 1.2 })],
  });
  def('load', {
    name: 'Generic load', cat: 'Motors & loads', prefix: 'L', w: 80, h: 40,
    props: [{ k: 'text', l: 'Text inside', d: 'FRIDGE' }, { k: 'amps', l: 'Current', d: '' }], sub: '{amps}',
    pins: [pin('+', 0, 20, '+'), pin('-', 80, 20, '−')],
    shapes: [L(0, 20, 10, 20), L(70, 20, 80, 20), R2(10, 4, 60, 32, { rx: 3 }), T(40, 24, '{text}', { size: 9, weight: 600 })],
  });

  // ---- Gauges & sensors ----
  def('gauge', {
    name: 'Gauge', cat: 'Gauges & sensors', prefix: 'P', w: 60, h: 60,
    props: [{ k: 'what', l: 'Reads', d: 'FUEL' }],
    pins: [pin('I', 0, 20, 'I ignition +'), pin('S', 0, 40, 'S sender'), pin('E', 60, 40, 'E earth'), pin('ILL', 60, 20, 'Illumination')],
    shapes: [C(30, 30, 20), P('M16 36 A16 16 0 0 1 44 36', { w: 1 }), L(30, 34, 40, 20, { w: 1.8 }), DOT(30, 34), T(30, 48, '{what}', { size: 6 }), L(0, 20, 13, 20), L(0, 40, 12, 40), L(48, 40, 60, 40), L(47, 20, 60, 20)],
  });
  def('sender', {
    name: 'Sender (variable resistance)', cat: 'Gauges & sensors', prefix: 'B', w: 40, h: 80,
    props: [{ k: 'what', l: 'Measures', d: 'Fuel level' }], sub: '{what}',
    pins: [pin('S', 20, 0, 'Signal')],
    shapes: [L(20, 0, 20, 14), R2(12, 14, 16, 34), L(4, 46, 34, 16, { w: 1.4 }), P('M34 16 l-7 1 l3 4 z', { fill: 'ink', w: 1 }), L(20, 48, 20, 60), L(8, 60, 32, 60, { w: 2.5 }), L(13, 67, 27, 67, { w: 2.5 }), L(17, 74, 23, 74, { w: 2.5 })],
  });
  def('sensor3', {
    name: 'Sensor, 3-wire', cat: 'Gauges & sensors', prefix: 'B', w: 80, h: 80,
    props: [{ k: 'what', l: 'Type', d: 'MAP' }],
    pins: [pin('V', 0, 20, '5V supply'), pin('SIG', 0, 40, 'Signal'), pin('GND', 0, 60, 'Earth')],
    shapes: [R2(10, 0, 70, 80, { rx: 4 }), T(50, 44, '{what}', { size: 10, weight: 600 }), L(0, 20, 10, 20), L(0, 40, 10, 40), L(0, 60, 10, 60), T(14, 23, '5V', { size: 7, anchor: 'start' }), T(14, 43, 'SIG', { size: 7, anchor: 'start' }), T(14, 63, 'GND', { size: 7, anchor: 'start' })],
  });
  def('voltmeter', { name: 'Voltmeter', cat: 'Gauges & sensors', prefix: 'P', w: 40, h: 40, pins: [pin('+', 0, 20, '+'), pin('-', 40, 20, '−')], shapes: motorLike('V') });
  def('ammeter', { name: 'Ammeter', cat: 'Gauges & sensors', prefix: 'P', w: 40, h: 40, pins: [pin('+', 0, 20, '+'), pin('-', 40, 20, '−')], shapes: motorLike('A') });
  def('shunt', {
    name: 'Current shunt / battery monitor', cat: 'Gauges & sensors', prefix: 'R', w: 80, h: 40,
    props: [{ k: 'amps', l: 'Rating', d: '500A' }], sub: '{amps}',
    pins: [pin('BAT', 0, 30, 'Battery −'), pin('LOAD', 80, 30, 'System −'), pin('S1', 30, 0, 'Sense / monitor'), pin('S2', 50, 0, 'Sense / monitor')],
    shapes: [L(0, 30, 12, 30), L(68, 30, 80, 30), R2(12, 22, 56, 16, { fill: '#d9dcd8' }), L(30, 0, 30, 22, { w: 1.2 }), L(50, 0, 50, 22, { w: 1.2 })],
  });

  // ---- Wiring & connectors ----
  def('connector', {
    name: 'Inline connector', cat: 'Wiring & connectors', prefix: 'X',
    props: [{ k: 'pins', l: 'Pins', d: 2, type: 'int', min: 1, max: 48 }, { k: 'part', l: 'Part number', d: '' }], sub: '{part}',
    gen(p) {
      const n = p.pins, h = n * 20 + 20, shapes = [R2(6, 4, 14, h - 8, { sw: 1.8 }), R2(20, 4, 14, h - 8, { fill: '#e2e6e1', sw: 1.8 })], pins = [];
      for (let i = 0; i < n; i++) { const y = 20 + i * 20; shapes.push(L(0, y, 6, y), L(34, y, 40, y), T(13, y + 3, i + 1, { size: 7 })); pins.push(pin('A' + (i + 1), 0, y, `${i + 1} (side A)`), pin('B' + (i + 1), 40, y, `${i + 1} (side B)`)); }
      return { w: 40, h, pins, shapes };
    },
  });
  def('plug', {
    name: 'Connector (one side)', cat: 'Wiring & connectors', prefix: 'X',
    props: [{ k: 'pins', l: 'Pins', d: 4, type: 'int', min: 1, max: 48 }],
    gen(p) {
      const n = p.pins, h = n * 20 + 20, shapes = [P(`M8 4 H32 V${h - 4} H8 Z`, { fill: 'paper' }), P(`M32 4 l6 6 V${h - 10} l-6 6`, { w: 1.4 })], pins = [];
      for (let i = 0; i < n; i++) { const y = 20 + i * 20; shapes.push(L(0, y, 8, y), T(20, y + 3, i + 1, { size: 7 })); pins.push(pin(i + 1, 0, y)); }
      return { w: 40, h, pins, shapes };
    },
  });
  def('splice', { name: 'Splice / junction', cat: 'Wiring & connectors', prefix: 'SP', w: 20, h: 20, noLabel: true, hidePins: true, pins: [pin('J', 10, 10, 'Junction')], shapes: [C(10, 10, 4.5, { fill: 'ink', w: 0 })] });
  def('busbar', {
    name: 'Busbar / power stud', cat: 'Wiring & connectors', prefix: 'BB',
    props: [{ k: 'studs', l: 'Studs', d: 4, type: 'int', min: 1, max: 24 }, { k: 'what', l: 'Use', d: '' }], sub: '{what}',
    gen(p) {
      const n = p.studs, w = n * 20 + 20, shapes = [R2(4, 5, w - 8, 10, { fill: '#c98a4b', sw: 1.8, rx: 2 })], pins = [];
      for (let i = 0; i < n; i++) { const x = 20 + i * 20; shapes.push(L(x, 15, x, 20), C(x, 10, 2, { fill: 'ink', w: 0 })); pins.push(pin(i + 1, x, 20, `Stud ${i + 1}`)); }
      return { w, h: 20, pins, shapes };
    },
  });
  def('terminal_block', {
    name: 'Terminal strip', cat: 'Wiring & connectors', prefix: 'TB',
    props: [{ k: 'ways', l: 'Ways', d: 4, type: 'int', min: 1, max: 40 }],
    gen(p) {
      const n = p.ways, h = n * 20, shapes = [], pins = [];
      for (let i = 0; i < n; i++) { const y = 10 + i * 20; shapes.push(R2(8, y - 10, 24, 20, { sw: 1.4 }), C(20, y, 3), L(0, y, 8, y), L(32, y, 40, y)); pins.push(pin('A' + (i + 1), 0, y, `${i + 1} in`), pin('B' + (i + 1), 40, y, `${i + 1} out`)); }
      return { w: 40, h, pins, shapes };
    },
  });
  def('offpage', {
    name: 'Off-sheet reference', cat: 'Wiring & connectors', prefix: 'REF', w: 100, h: 20, noLabel: true,
    props: [{ k: 'text', l: 'Text', d: 'TO REAR LOOM' }, { k: 'link', l: 'Link name (same on both sheets)', d: '' }],
    pins: [pin('L', 0, 10, 'Left end'), pin('R', 100, 10, 'Right end')],
    shapes: [L(0, 10, 10, 10), P('M10 2 H86 L96 10 L86 18 H10 Z', { fill: 'paper', w: 1.6 }), L(96, 10, 100, 10), T(50, 13, '{text}', { size: 7, weight: 600 })],
  });
  def('net_label', {
    name: 'Net label', cat: 'Wiring & connectors', prefix: 'N', w: 100, h: 20, noLabel: true,
    props: [{ k: 'text', l: 'Net name', d: 'IGN +12V' }],
    pins: [pin('L', 0, 10, 'Left end'), pin('R', 100, 10, 'Right end')],
    shapes: [L(0, 10, 4, 10), R2(4, 2, 92, 16, { rx: 8, sw: 1.2 }), L(96, 10, 100, 10), T(50, 13, '{text}', { size: 8, weight: 600 })],
  });
  def('grommet', {
    name: 'Bulkhead / grommet', cat: 'Wiring & connectors', prefix: 'GR', w: 20, h: 40,
    pins: [pin('A', 0, 20, 'Side A'), pin('B', 20, 20, 'Side B')],
    shapes: [L(10, 0, 10, 40, { w: 3, dash: '6 3' }), C(10, 20, 6), L(0, 20, 20, 20, { w: 1.5 })],
  });

  // ---- Electronics ----
  def('resistor', { name: 'Resistor', cat: 'Electronics', prefix: 'R', w: 60, h: 20, props: [{ k: 'value', l: 'Value', d: '1kΩ' }], sub: '{value}', pins: two(60), shapes: [...lead2(60, 15, 45), R2(15, 5, 30, 10, { sw: 1.8 })] });
  def('potentiometer', {
    name: 'Potentiometer', cat: 'Electronics', prefix: 'RV', w: 60, h: 40, props: [{ k: 'value', l: 'Value', d: '10kΩ' }], sub: '{value}',
    pins: [pin(1, 0, 30), pin('W', 30, 0, 'Wiper'), pin(3, 60, 30)],
    shapes: [L(0, 30, 15, 30), L(45, 30, 60, 30), R2(15, 25, 30, 10, { sw: 1.8 }), L(30, 0, 30, 21, { w: 1.6 }), P('M26 17 l4 6 l4 -6 z', { fill: 'ink', w: 1 })],
  });
  def('capacitor', { name: 'Capacitor', cat: 'Electronics', prefix: 'C', w: 40, h: 20, props: [{ k: 'value', l: 'Value', d: '100nF' }], sub: '{value}', pins: two(40), shapes: [...lead2(40, 17, 23), L(17, 2, 17, 18, { w: 2.5 }), L(23, 2, 23, 18, { w: 2.5 })] });
  def('capacitor_pol', { name: 'Electrolytic capacitor', cat: 'Electronics', prefix: 'C', w: 40, h: 20, props: [{ k: 'value', l: 'Value', d: '470µF' }], sub: '{value}', pins: [pin('+', 0, 10, '+'), pin('-', 40, 10, '−')], shapes: [...lead2(40, 17, 21), L(17, 2, 17, 18, { w: 2.5 }), P('M25 2 Q21 10 25 18', { w: 2.5 }), T(10, 5, '+', { size: 8 })] });
  def('inductor', { name: 'Inductor / coil', cat: 'Electronics', prefix: 'L', w: 60, h: 20, props: [{ k: 'value', l: 'Value', d: '' }], sub: '{value}', pins: two(60), shapes: [...lead2(60, 10, 50), P('M10 10 a5 5 0 0 1 10 0 a5 5 0 0 1 10 0 a5 5 0 0 1 10 0 a5 5 0 0 1 10 0', { w: 1.8 })] });
  const diodeShapes = () => [...lead2(60, 22, 36), P('M22 3 L22 17 L36 10 Z', { fill: 'ink', w: 1 }), L(36, 3, 36, 17)];
  def('diode', { name: 'Diode', cat: 'Electronics', prefix: 'D', w: 60, h: 20, props: [{ k: 'part', l: 'Part', d: '1N4007' }], sub: '{part}', pins: [pin('A', 0, 10, 'Anode'), pin('K', 60, 10, 'Cathode')], shapes: diodeShapes() });
  def('zener', { name: 'Zener / TVS diode', cat: 'Electronics', prefix: 'D', w: 60, h: 20, props: [{ k: 'part', l: 'Voltage', d: '15V' }], sub: '{part}', pins: [pin('A', 0, 10, 'Anode'), pin('K', 60, 10, 'Cathode')], shapes: [...lead2(60, 22, 36), P('M22 3 L22 17 L36 10 Z', { fill: 'ink', w: 1 }), P('M32 1 L36 3 L36 17 L40 19', { w: 2 })] });
  def('led', { name: 'LED', cat: 'Electronics', prefix: 'D', w: 60, h: 20, props: [{ k: 'colour', l: 'Colour', d: 'Red' }], sub: '{colour}', pins: [pin('A', 0, 10, 'Anode +'), pin('K', 60, 10, 'Cathode −')], shapes: [...diodeShapes(), P('M30 0 l6 -6 m-3 0 l3 0 l0 3 M36 2 l6 -6 m-3 0 l3 0 l0 3', { w: 1.2 })] });
  const bjt = (pnp) => [C(30, 30, 18, { w: 1.4 }), L(0, 30, 22, 30), L(22, 18, 22, 42, { w: 2.5 }), L(22, 24, 40, 12), L(22, 36, 40, 48), L(40, 12, 40, 0), L(40, 48, 40, 60),
    pnp ? P('M27 39 l2 -6 l4 4 z', { fill: 'ink', w: 1 }) : P('M38 47 l-6 -1 l3 -4 z', { fill: 'ink', w: 1 })];
  def('npn', { name: 'Transistor NPN', cat: 'Electronics', prefix: 'Q', w: 60, h: 60, props: [{ k: 'part', l: 'Part', d: 'BC547' }], sub: '{part}', pins: [pin('B', 0, 30, 'Base'), pin('C', 40, 0, 'Collector'), pin('E', 40, 60, 'Emitter')], shapes: bjt(false) });
  def('pnp', { name: 'Transistor PNP', cat: 'Electronics', prefix: 'Q', w: 60, h: 60, props: [{ k: 'part', l: 'Part', d: 'BC557' }], sub: '{part}', pins: [pin('B', 0, 30, 'Base'), pin('E', 40, 0, 'Emitter'), pin('C', 40, 60, 'Collector')], shapes: bjt(true) });
  def('nmos', {
    name: 'MOSFET N-channel', cat: 'Electronics', prefix: 'Q', w: 60, h: 60, props: [{ k: 'part', l: 'Part', d: 'IRLZ44N' }], sub: '{part}',
    pins: [pin('G', 0, 40, 'Gate'), pin('D', 40, 0, 'Drain'), pin('S', 40, 60, 'Source')],
    shapes: [C(30, 30, 18, { w: 1.4 }), L(0, 40, 20, 40), L(20, 20, 20, 40, { w: 2 }), L(25, 18, 25, 24, { w: 2.5 }), L(25, 27, 25, 33, { w: 2.5 }), L(25, 36, 25, 42, { w: 2.5 }), L(25, 21, 40, 21), L(40, 21, 40, 0), L(25, 39, 40, 39), L(40, 39, 40, 60), L(25, 30, 40, 30), L(40, 30, 40, 39), P('M26 30 l5 -3 l0 6 z', { fill: 'ink', w: 1 })],
  });
  def('regulator', {
    name: 'Voltage regulator', cat: 'Electronics', prefix: 'U', w: 80, h: 60, props: [{ k: 'part', l: 'Part', d: '7805' }], sub: '{part}',
    pins: [pin('IN', 0, 20, 'Input'), pin('OUT', 80, 20, 'Output'), pin('GND', 40, 60, 'Ground')],
    shapes: [R2(10, 4, 60, 40, { rx: 3 }), L(0, 20, 10, 20), L(70, 20, 80, 20), L(40, 44, 40, 60), T(16, 24, 'IN', { size: 7, anchor: 'start' }), T(64, 24, 'OUT', { size: 7, anchor: 'end' }), T(40, 40, 'GND', { size: 7 })],
  });
  def('ic', {
    name: 'IC / microcontroller', cat: 'Electronics', prefix: 'U',
    props: [{ k: 'pins', l: 'Pins', d: 8, type: 'int', min: 2, max: 64 }, { k: 'names', l: 'Pin names (comma list, numbered order)', d: '' }, { k: 'text', l: 'Text inside', d: 'NE555' }],
    gen(p) {
      const n = Math.max(2, p.pins + (p.pins % 2)), side = n / 2, h = side * 20 + 20, names = String(p.names || '').split(',').map((s) => s.trim());
      const shapes = [R2(20, 0, 80, h, { rx: 2 }), P('M54 0 a6 6 0 0 0 12 0', { w: 1.4 }), T(60, h / 2 + 4, p.text || '', { size: 10, weight: 600 })], pins = [];
      for (let i = 0; i < side; i++) { const y = 20 + i * 20, nm = names[i] || String(i + 1); shapes.push(L(0, y, 20, y), T(4, y - 3, i + 1, { size: 6, anchor: 'start' }), T(24, y + 3, nm, { size: 7, anchor: 'start' })); pins.push(pin(i + 1, 0, y, nm)); }
      for (let i = 0; i < side; i++) { const num = n - i, y = 20 + i * 20, nm = names[num - 1] || String(num); shapes.push(L(100, y, 120, y), T(116, y - 3, num, { size: 6, anchor: 'end' }), T(96, y + 3, nm, { size: 7, anchor: 'end' })); pins.push(pin(num, 120, y, nm)); }
      return { w: 120, h, pins, shapes };
    },
  });

  // ---- Annotation ----
  def('note', {
    name: 'Text note', cat: 'Annotation', prefix: '', w: 200, h: 20, noLabel: true,
    props: [{ k: 'text', l: 'Text', d: 'Note', type: 'textarea' }, { k: 'size', l: 'Text size', d: 12, type: 'int', min: 6, max: 72 }],
    gen(p) {
      const lines = String(p.text || '').split('\n'), size = p.size || 12, lh = Math.round(size * 1.35);
      const h = Math.max(20, Math.ceil((lines.length * lh + 6) / 20) * 20);
      const w = Math.max(40, Math.ceil((Math.max(...lines.map((l) => l.length)) * size * 0.62 + 4) / 20) * 20);
      return { w, h, pins: [], shapes: lines.map((l, i) => T(0, size + i * lh, l, { size, anchor: 'start' })) };
    },
  });
  def('frame', {
    name: 'Area / group box', cat: 'Annotation', prefix: '', noLabel: true, back: true,
    props: [{ k: 'text', l: 'Title', d: 'ENGINE BAY' }, { k: 'width', l: 'Width', d: 300, type: 'int', min: 40, max: 5000 }, { k: 'height', l: 'Height', d: 200, type: 'int', min: 40, max: 5000 }],
    gen(p) {
      const w = Math.round(p.width / 20) * 20, h = Math.round(p.height / 20) * 20;
      return { w, h, pins: [], shapes: [R2(0, 0, w, h, { fill: 'none', sw: 1.4, dash: '8 5', rx: 6 }), T(10, 16, p.text || '', { size: 10, anchor: 'start', weight: 600 })] };
    },
  });

  /* ------------------------------------------------------------------ */
  /* Wire colours                                                        */
  /* ------------------------------------------------------------------ */
  // One canonical colour set; each standard has its own codes.
  const COLOURS = [
    { id: 'black', name: 'Black', hex: '#1b1b1b', lr: 'B', din: 'BK', sae: 'BLK' },
    { id: 'brown', name: 'Brown', hex: '#7b4a22', lr: 'N', din: 'BN', sae: 'BRN' },
    { id: 'red', name: 'Red', hex: '#d3261c', lr: 'R', din: 'RD', sae: 'RED' },
    { id: 'orange', name: 'Orange', hex: '#f07c14', lr: 'O', din: 'OG', sae: 'ORN' },
    { id: 'yellow', name: 'Yellow', hex: '#f3cf16', lr: 'Y', din: 'YE', sae: 'YEL' },
    { id: 'green', name: 'Green', hex: '#1e9a3c', lr: 'G', din: 'GN', sae: 'DK GRN' },
    { id: 'lightgreen', name: 'Light green', hex: '#8fd36b', lr: 'LG', din: 'LGN', sae: 'LT GRN' },
    { id: 'blue', name: 'Blue', hex: '#2260c9', lr: 'U', din: 'BU', sae: 'DK BLU' },
    { id: 'lightblue', name: 'Light blue', hex: '#62b4ec', lr: 'LU', din: 'LBU', sae: 'LT BLU' },
    { id: 'purple', name: 'Purple / violet', hex: '#7a3db2', lr: 'P', din: 'VT', sae: 'PPL' },
    { id: 'grey', name: 'Grey / slate', hex: '#868d94', lr: 'S', din: 'GY', sae: 'GRY' },
    { id: 'white', name: 'White', hex: '#f8f8f6', lr: 'W', din: 'WH', sae: 'WHT' },
    { id: 'pink', name: 'Pink', hex: '#f39cc2', lr: 'K', din: 'PK', sae: 'PNK' },
    { id: 'tan', name: 'Tan', hex: '#c9a978', lr: '', din: '', sae: 'TAN' },
    { id: 'turquoise', name: 'Turquoise', hex: '#21b6b0', lr: '', din: 'TQ', sae: '' },
    { id: 'natural', name: 'Natural / clear', hex: '#e9e2cf', lr: '', din: 'NT', sae: 'NAT' },
  ];
  const STANDARDS = {
    lr: { id: 'lr', name: 'Land Rover / British', note: 'Main colour then tracer, e.g. NR = brown with red tracer.', sep: '', tracerSep: '' },
    din: { id: 'din', name: 'DIN 72551 / IEC 60757', note: 'Main colour / tracer, e.g. BN/RD.', sep: '/', tracerSep: '/' },
    sae: { id: 'sae', name: 'SAE / US', note: 'Main colour / tracer, e.g. BRN/RED.', sep: '/', tracerSep: '/' },
    custom: { id: 'custom', name: 'Custom only', note: 'Only your own colours and codes.', sep: '/', tracerSep: '/' },
  };
  const GAUGES = [
    { mm2: '0.35', awg: '22', guideA: 5 }, { mm2: '0.5', awg: '20', guideA: 7.5 }, { mm2: '0.75', awg: '18', guideA: 10 }, { mm2: '1.0', awg: '17', guideA: 15 },
    { mm2: '1.5', awg: '16', guideA: 20 }, { mm2: '2.0', awg: '14', guideA: 25 }, { mm2: '2.5', awg: '13', guideA: 25 }, { mm2: '4.0', awg: '12', guideA: 30 },
    { mm2: '6.0', awg: '10', guideA: 40 }, { mm2: '10', awg: '8', guideA: 60 }, { mm2: '16', awg: '6', guideA: 80 }, { mm2: '25', awg: '4', guideA: 120 },
    { mm2: '35', awg: '2', guideA: 150 }, { mm2: '50', awg: '1/0', guideA: 200 }, { mm2: '70', awg: '2/0', guideA: 250 }, { mm2: '95', awg: '3/0', guideA: 300 },
  ];
  const COPPER_RHO = 0.0172; // ohm mm^2 / m at 20C

  function allColours(doc) { return COLOURS.concat((doc && doc.customColours) || []); }
  function colourById(doc, id) { return allColours(doc).find((c) => c.id === id) || null; }
  function colourCode(doc, c) {
    if (!c) return '';
    if (c.custom) return c.code || c.name;
    const std = (doc && doc.settings && doc.settings.standard) || 'lr';
    return (std !== 'custom' && c[std]) || c.din || c.name;
  }
  function wireCode(doc, w) {
    const std = STANDARDS[(doc && doc.settings && doc.settings.standard) || 'lr'] || STANDARDS.lr;
    const parts = [w.colour, w.tracer, w.tracer2].filter(Boolean).map((id) => colourCode(doc, colourById(doc, id)));
    return parts.join(std.sep);
  }
  function wireColourName(doc, w) {
    const main = colourById(doc, w.colour);
    const tr = [w.tracer, w.tracer2].filter(Boolean).map((id) => (colourById(doc, id) || {}).name).filter(Boolean);
    return (main ? main.name : 'Unknown') + (tr.length ? ' with ' + tr.join(' and ') + ' tracer' : '');
  }
  function gaugeInfo(mm2) { return GAUGES.find((g) => g.mm2 === String(mm2)) || null; }
  function gaugeWidth(mm2) { return 1.4 + Math.sqrt(parseFloat(mm2) || 1) * 0.75; }
  function voltageDrop(w) {
    const A = parseFloat(w.gauge), len = parseFloat(w.length), I = parseFloat(w.current);
    if (!(A > 0 && len > 0 && I > 0)) return null;
    return (I * COPPER_RHO * len) / A; // one conductor; add earth return separately
  }

  /* ------------------------------------------------------------------ */
  /* Model                                                               */
  /* ------------------------------------------------------------------ */
  /* A project (.loom file) holds one or more sheets. Each sheet has its own
     parts and wires; colours, custom components, harnesses and the title block
     details are shared across the project. */
  function newSheet(name) { return { id: uid('s'), name: name || 'Sheet 1', parts: [], wires: [] }; }
  const DEFAULT_SETTINGS = {
    standard: 'lr', volts: 12, labels: 'full', titleBlock: true, colourKey: true, stock: [], stockOnly: false,
    page: 'fit', orientation: 'landscape', bw: false, junctions: true, xrefs: true, clouds: '',
    cutAllowance: 0.15, currency: '£', cableCosts: {},
  };
  function newDoc(title) {
    return {
      format: FORMAT, version: 3, id: uid('prj'), title: title || 'Untitled project',
      meta: { project: '', drawnBy: '', revision: 'A', date: new Date().toISOString().slice(0, 10), notes: '' },
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      harnesses: [], cables: [], customColours: [], customParts: [], revisions: [], harnessLayouts: {}, vehicle: null, sheets: [newSheet('Sheet 1')],
    };
  }
  const SHARED = ['format', 'version', 'id', 'title', 'meta', 'settings', 'harnesses', 'cables', 'customColours', 'customParts', 'revisions', 'harnessLayouts', 'vehicle', 'sheets'];
  /* A view of one sheet that reads and writes through to the project, so every
     function that takes a "doc" (parts + wires + settings) works on a sheet. */
  function view(project, sheetRef) {
    const sheets = project.sheets;
    let sheet = typeof sheetRef === 'object' && sheetRef ? sheetRef : null;
    if (!sheet && typeof sheetRef === 'number') sheet = sheets[sheetRef]; // 0-based index
    if (!sheet && sheetRef != null) sheet = sheets.find((x) => x.id === sheetRef) || sheets.find((x) => x.name.toLowerCase() === String(sheetRef).toLowerCase()) || sheets[parseInt(sheetRef, 10) - 1];
    if (!sheet) sheet = sheets[0];
    if (!sheet) throw new Error('No sheet ' + sheetRef);
    const v = { project, sheet };
    SHARED.forEach((k) => Object.defineProperty(v, k, { get: () => project[k], set: (x) => { project[k] = x; }, enumerable: false }));
    ['parts', 'wires'].forEach((k) => Object.defineProperty(v, k, { get: () => sheet[k], set: (x) => { sheet[k] = x; }, enumerable: false }));
    Object.defineProperty(v, 'allParts', { get: () => project.sheets.flatMap((x) => x.parts) });
    Object.defineProperty(v, 'allWires', { get: () => project.sheets.flatMap((x) => x.wires) });
    Object.defineProperty(v, 'sheetNo', { get: () => project.sheets.indexOf(sheet) + 1 });
    return v;
  }
  function views(project) { return project.sheets.map((s) => view(project, s)); }

  function partDef(doc, type) {
    if (lib[type]) return lib[type];
    const c = ((doc && doc.customParts) || []).find((p) => p.id === type);
    return c || null;
  }
  function defaultProps(d) { const o = {}; (d.props || []).forEach((p) => { o[p.k] = p.d; }); return o; }
  function resolved(doc, part) {
    const d = partDef(doc, part.type);
    if (!d) return { w: 40, h: 40, pins: [], shapes: [R2(0, 0, 40, 40, { dash: '4 3' }), T(20, 24, '?', { size: 14 })], def: null };
    let props = { ...defaultProps(d), ...(part.props || {}) };
    if (d.derive) props = { ...props, ...d.derive(props) };
    if (d.gen) { const g = d.gen(props); return { ...g, def: d, props }; }
    return { w: d.w, h: d.h, pins: d.pins, shapes: d.shapes, def: d, props };
  }
  function rotPt(px, py, w, h, rot, flip) {
    let dx = px - w / 2, dy = py - h / 2;
    if (flip) dx = -dx;
    const n = (((rot || 0) % 4) + 4) % 4;
    for (let i = 0; i < n; i++) { const t = dx; dx = -dy; dy = t; }
    return { x: w / 2 + dx, y: h / 2 + dy };
  }
  function partBox(doc, p) {
    const r = resolved(doc, p), odd = (p.rot || 0) % 2 !== 0;
    const bw = odd ? r.h : r.w, bh = odd ? r.w : r.h;
    return { x: p.x + r.w / 2 - bw / 2, y: p.y + r.h / 2 - bh / 2, w: bw, h: bh };
  }
  function findPart(doc, ref) {
    return doc.parts.find((p) => p.id === ref) || doc.parts.find((p) => p.label && p.label.toLowerCase() === String(ref).toLowerCase()) || null;
  }
  function pinPos(doc, end) {
    const p = doc.parts.find((q) => q.id === end.part);
    if (!p) return null;
    const r = resolved(doc, p), pn = r.pins.find((q) => q.id === end.pin);
    if (!pn) return null;
    const o = rotPt(pn.x, pn.y, r.w, r.h, p.rot, p.flip);
    return { x: p.x + o.x, y: p.y + o.y };
  }
  function pinName(doc, end) {
    const p = doc.parts.find((q) => q.id === end.part);
    if (!p) return '?';
    const pn = resolved(doc, p).pins.find((q) => q.id === end.pin);
    return `${p.label || partDef(doc, p.type)?.name || p.type}:${pn ? pn.id : end.pin}`;
  }
  function snap(v) { return Math.round(v / GRID) * GRID; }

  function wirePoints(doc, w) {
    const a = pinPos(doc, w.from), b = pinPos(doc, w.to);
    if (!a || !b) return null;
    if (w.route === 'straight') return [a, ...(w.points || []), b];
    const pts = [a];
    const via = w.points || [];
    if (!via.length) {
      const mx = snap((a.x + b.x) / 2) + (w.dx || 0);
      if (a.y === b.y && !w.dx) return [a, b];
      pts.push({ x: mx, y: a.y }, { x: mx, y: b.y }, b);
      return pts;
    }
    const targets = [...via, b];
    for (let i = 0; i < targets.length; i++) {
      const prev = pts[pts.length - 1], q = targets[i];
      if (prev.x !== q.x && prev.y !== q.y) pts.push(i % 2 === 0 ? { x: q.x, y: prev.y } : { x: prev.x, y: q.y });
      pts.push(q);
    }
    return pts;
  }

  function nextLabel(doc, prefix) {
    if (!prefix) return '';
    let max = 0; const re = new RegExp('^' + prefix.replace(/[^A-Za-z0-9]/g, '') + '(\\d+)$');
    (doc.allParts || doc.parts).forEach((p) => { const m = re.exec(p.label || ''); if (m) max = Math.max(max, +m[1]); });
    return prefix + (max + 1);
  }
  function nextWireName(doc) {
    let max = 0; (doc.allWires || doc.wires).forEach((w) => { const m = /^W(\d+)$/.exec(w.name || ''); if (m) max = Math.max(max, +m[1]); });
    return 'W' + (max + 1);
  }
  const uid = (p) => p + Math.random().toString(36).slice(2, 9);

  function addPart(doc, type, opts = {}) {
    const d = partDef(doc, type);
    if (!d) throw new Error(`Unknown component type "${type}"`);
    const p = { id: uid('p'), type, x: snap(opts.x || 0), y: snap(opts.y || 0), rot: ((opts.rot || 0) % 4 + 4) % 4, label: opts.label != null ? opts.label : nextLabel(doc, d.prefix), props: { ...defaultProps(d), ...(opts.props || {}) } };
    if (opts.flip) p.flip = true;
    doc.parts.push(p);
    return p;
  }
  function parseEnd(doc, s) {
    if (typeof s === 'object' && s.part) return s;
    const str = String(s), i = str.lastIndexOf(':');
    if (i < 0) throw new Error(`Wire end "${str}" must look like LABEL:PIN, e.g. F1:2`);
    const p = findPart(doc, str.slice(0, i));
    if (!p) throw new Error(`No part called "${str.slice(0, i)}"`);
    const pinId = str.slice(i + 1), pins = resolved(doc, p).pins;
    const pn = pins.find((q) => q.id === pinId) || pins.find((q) => q.id.toLowerCase() === pinId.toLowerCase()) || pins.find((q) => (q.n || '').toLowerCase() === pinId.toLowerCase());
    if (!pn) throw new Error(`${p.label} has no pin "${pinId}". Pins: ${pins.map((q) => q.id).join(', ')}`);
    return { part: p.id, pin: pn.id };
  }
  function addWire(doc, from, to, opts = {}) {
    const w = { id: uid('w'), name: opts.name || nextWireName(doc), from: parseEnd(doc, from), to: parseEnd(doc, to), colour: opts.colour || 'red', tracer: opts.tracer || '', gauge: String(opts.gauge || '1.0'), length: opts.length || '', current: opts.current || '', circuit: opts.circuit || '', harness: opts.harness || '', notes: opts.notes || '' };
    if (opts.tracer2) w.tracer2 = opts.tracer2;
    doc.wires.push(w);
    return w;
  }
  function pruneWires(doc) { doc.wires = doc.wires.filter((w) => pinPos(doc, w.from) && pinPos(doc, w.to)); }

  function normalise(doc) {
    const base = newDoc();
    if (!doc || typeof doc !== 'object') throw new Error('This file is not a LoomWright project.');
    let sheets = doc.sheets;
    if (!Array.isArray(sheets)) {
      // version 1 files had a single drawing at the top level
      if (!Array.isArray(doc.parts) || !Array.isArray(doc.wires)) throw new Error('This file is not a LoomWright project.');
      sheets = [{ id: uid('s'), name: doc.title || 'Sheet 1', parts: doc.parts, wires: doc.wires }];
    }
    const out = { ...base, ...doc, version: 3, meta: { ...base.meta, ...(doc.meta || {}) }, settings: { ...base.settings, ...(doc.settings || {}) } };
    delete out.parts; delete out.wires; delete out.meta.sheet; delete out.app;
    if (!out.id) out.id = uid('prj');
    out.customColours = (out.customColours || []).map((c) => ({ ...c, custom: true }));
    out.customParts = out.customParts || [];
    out.harnesses = out.harnesses || [];
    out.revisions = Array.isArray(out.revisions) ? out.revisions : [];
    out.cables = Array.isArray(out.cables) ? out.cables : [];
    out.harnessLayouts = out.harnessLayouts && typeof out.harnessLayouts === 'object' ? out.harnessLayouts : {};
    out.vehicle = out.vehicle || null;
    out.settings.stock = out.settings.stock || [];
    out.settings.cableCosts = out.settings.cableCosts || {};
    out.sheets = sheets.map((sh, i) => ({
      id: sh.id || uid('s'), name: sh.name || `Sheet ${i + 1}`, ...(sh.notes ? { notes: sh.notes } : {}), ...(sh.page ? { page: sh.page } : {}), ...(sh.orientation ? { orientation: sh.orientation } : {}),
      parts: (sh.parts || []).filter((p) => p && p.type).map((p) => ({ rot: 0, props: {}, ...p })),
      wires: (sh.wires || []).filter((w) => w && w.from && w.to),
    }));
    if (!out.sheets.length) out.sheets = [newSheet('Sheet 1')];
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */
  function symbolSVG(r, ink = INK) { return r.shapes.map((s) => shapeSVG(s, r.props, ink)).join(''); }

  /* ---- Fixed sheet sizes. 4 drawing units = 1 mm. ---- */
  const PAGES = { A4: [1188, 840, 6, 4], A3: [1680, 1188, 8, 6], A2: [2376, 1680, 12, 8], A1: [3364, 2376, 16, 12] };
  function pageOf(doc) {
    const s = (doc && doc.settings) || {}, sh = (doc && doc.sheet) || {};
    const size = sh.page || s.page || 'fit', P = PAGES[size];
    if (!P) return null;
    const portrait = (sh.orientation || s.orientation) === 'portrait';
    const [W, H, cols, rows] = portrait ? [P[1], P[0], P[3], P[2]] : P;
    return { size, portrait, W, H, cols, rows, m: 40, b: 20 };
  }
  function zoneOf(page, x, y) {
    if (!page) return '';
    const o = page.m + page.b, iw = (page.W - 2 * o) / page.cols, ih = (page.H - 2 * o) / page.rows;
    const c = Math.max(1, Math.min(page.cols, Math.floor((x - o) / iw) + 1)), r = Math.max(1, Math.min(page.rows, Math.floor((y - o) / ih) + 1));
    return String.fromCharCode(64 + r) + c;
  }
  function frameSVG(page, o = {}) {
    const { W, H, m, b, cols, rows } = page, iw = (W - 2 * (m + b)) / cols, ih = (H - 2 * (m + b)) / rows;
    let s = '<g pointer-events="none">';
    if (o.mode === 'edit') s += `<path d="M-20000 -20000 H20000 V20000 H-20000 Z M0 0 V${H} H${W} V0 Z" fill="#000" fill-opacity=".045" fill-rule="evenodd"/><rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#9aa3ab" stroke-width="1"/>`;
    s += `<rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
    s += `<rect x="${m + b}" y="${m + b}" width="${W - 2 * (m + b)}" height="${H - 2 * (m + b)}" fill="none" stroke="${INK}" stroke-width="1"/>`;
    const t = (x, y, v) => `<text x="${x}" y="${y}" font-size="9" text-anchor="middle" fill="${INK}" font-family="${MONO}">${v}</text>`;
    for (let i = 0; i < cols; i++) {
      const x = m + b + i * iw;
      if (i) s += `<line x1="${x}" y1="${m}" x2="${x}" y2="${m + b}" stroke="${INK}" stroke-width="1"/><line x1="${x}" y1="${H - m - b}" x2="${x}" y2="${H - m}" stroke="${INK}" stroke-width="1"/>`;
      s += t(x + iw / 2, m + b / 2 + 3.5, i + 1) + t(x + iw / 2, H - m - b / 2 + 3.5, i + 1);
    }
    for (let j = 0; j < rows; j++) {
      const y = m + b + j * ih, L_ = String.fromCharCode(65 + j);
      if (j) s += `<line x1="${m}" y1="${y}" x2="${m + b}" y2="${y}" stroke="${INK}" stroke-width="1"/><line x1="${W - m - b}" y1="${y}" x2="${W - m}" y2="${y}" stroke="${INK}" stroke-width="1"/>`;
      s += t(m + b / 2, y + ih / 2 + 3.5, L_) + t(W - m - b / 2, y + ih / 2 + 3.5, L_);
    }
    return s + '</g>';
  }

  /* ---- Cross-references: where off-sheet links, net labels and repeated parts appear elsewhere ---- */
  function xrefs(project) {
    const groups = new Map(), out = new Map();
    if (!project || !Array.isArray(project.sheets)) return out;
    views(project).forEach((v, i) => {
      const page = pageOf(v);
      v.parts.forEach((p) => {
        const pr = p.props || {};
        let k = null;
        if (p.type === 'offpage' && pr.link) k = 'N:' + String(pr.link).trim().toUpperCase();
        else if (p.type === 'net_label' && pr.text) k = 'N:' + String(pr.text).trim().toUpperCase();
        else if (p.label && !(partDef(v, p.type) || {}).noLabel) k = 'P:' + p.type + '|' + p.label;
        if (!k) return;
        const bb = partBox(v, p);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push({ p, sheetNo: i + 1, sheetId: v.sheet.id, zone: zoneOf(page, bb.x + bb.w / 2, bb.y + bb.h / 2) });
      });
    });
    groups.forEach((list) => list.forEach((e) => {
      const t = list.filter((x) => x.sheetId !== e.sheetId).map((x) => ({ sheetNo: x.sheetNo, sheetId: x.sheetId, zone: x.zone, part: x.p.id, text: x.sheetNo + (x.zone ? '/' + x.zone : '') }));
      if (t.length) out.set(e.p.id, t);
    }));
    return out;
  }

  /* ---- Revision clouds ---- */
  function cloudPath(x, y, w, h, r = 9) {
    const nx = Math.max(1, Math.round(w / (2 * r))), ny = Math.max(1, Math.round(h / (2 * r))), sx = w / nx, sy = h / ny;
    let d = `M${x} ${y}`;
    for (let i = 0; i < nx; i++) d += ` a${sx / 2} ${sx / 2} 0 0 1 ${sx} 0`;
    for (let i = 0; i < ny; i++) d += ` a${sy / 2} ${sy / 2} 0 0 1 0 ${sy}`;
    for (let i = 0; i < nx; i++) d += ` a${sx / 2} ${sx / 2} 0 0 1 ${-sx} 0`;
    for (let i = 0; i < ny; i++) d += ` a${sy / 2} ${sy / 2} 0 0 1 0 ${-sy}`;
    return d + ' Z';
  }
  function cloudsSVG(doc, c, ink) {
    if (!c) return '';
    const col = ink || '#c0392b', boxes = [];
    doc.parts.forEach((p) => { if (c.parts.has(p.id)) boxes.push(partBox(doc, p)); });
    doc.wires.forEach((w) => {
      if (!c.wires.has(w.id)) return;
      const pts = wirePoints(doc, w); if (!pts) return;
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      boxes.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
    });
    (c.removed || []).forEach((b) => boxes.push({ ...b, removed: true }));
    // merge overlapping boxes so one change gets one cloud
    const pad = 14, merged = [];
    boxes.map((b) => ({ x: b.x - pad, y: b.y - pad - (b.removed ? 0 : 14), w: b.w + pad * 2, h: b.h + pad * 2 + (b.removed ? 0 : 28), removed: b.removed })).forEach((b) => {
      const hit = merged.find((m) => !(b.x > m.x + m.w || b.x + b.w < m.x || b.y > m.y + m.h || b.y + b.h < m.y));
      if (hit) { const x1 = Math.max(hit.x + hit.w, b.x + b.w), y1 = Math.max(hit.y + hit.h, b.y + b.h); hit.x = Math.min(hit.x, b.x); hit.y = Math.min(hit.y, b.y); hit.w = x1 - hit.x; hit.h = y1 - hit.y; hit.removed = hit.removed && b.removed; }
      else merged.push(b);
    });
    // a grown cloud can now overlap one made earlier: keep merging until none overlap
    for (let again = true; again;) {
      again = false;
      for (let i = 0; i < merged.length && !again; i++) {
        for (let j = i + 1; j < merged.length; j++) {
          const a = merged[i], b = merged[j];
          if (b.x > a.x + a.w || b.x + b.w < a.x || b.y > a.y + a.h || b.y + b.h < a.y) continue;
          const x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
          a.x = Math.min(a.x, b.x); a.y = Math.min(a.y, b.y); a.w = x1 - a.x; a.h = y1 - a.y; a.removed = a.removed && b.removed;
          merged.splice(j, 1); again = true; break;
        }
      }
    }
    return merged.map((b) => `<path d="${cloudPath(b.x, b.y, b.w, b.h)}" fill="none" stroke="${col}" stroke-width="1.4"${b.removed ? ' stroke-dasharray="5 4"' : ''} pointer-events="none"/>` +
      `<path d="M${b.x - 4} ${b.y + 8} l9 -16 l9 16 z" fill="#ffffff" stroke="${col}" stroke-width="1.3" pointer-events="none"/><text x="${b.x + 5}" y="${b.y + 5.5}" font-size="8" font-weight="700" text-anchor="middle" fill="${col}" font-family="${MONO}" pointer-events="none">${esc(c.rev || '')}</text>`).join('');
  }

  function partSVG(doc, p, o) {
    const r = resolved(doc, p), d = r.def || {}, bb = partBox(doc, p), edit = o.mode === 'edit';
    const tf = `translate(${p.x} ${p.y}) rotate(${(p.rot || 0) * 90} ${r.w / 2} ${r.h / 2})${p.flip ? ` translate(${r.w} 0) scale(-1 1)` : ''}`;
    let s = '';
    if (o.simLoads && o.simLoads.has(p.id)) s += `<rect x="${bb.x - 8}" y="${bb.y - 8}" width="${bb.w + 16}" height="${bb.h + 16}" rx="8" fill="#ffb400" fill-opacity=".28" stroke="#e09a00" stroke-width="1.2" pointer-events="none"/>`;
    if (o.hlParts && o.hlParts.has(p.id)) s += `<rect x="${bb.x - 6}" y="${bb.y - 6}" width="${bb.w + 12}" height="${bb.h + 12}" rx="6" fill="#2f6fde" fill-opacity=".10" stroke="#2f6fde" stroke-width="1" pointer-events="none"/>`;
    s += `<g transform="${tf}"${edit || o.tag ? ` data-part="${p.id}" class="part"` : ''}>`;
    if (edit) s += `<rect x="-4" y="-4" width="${r.w + 8}" height="${r.h + 8}" fill="transparent"${d.back ? ' pointer-events="stroke" stroke="transparent" stroke-width="10"' : ''}/>`;
    s += symbolSVG(r);
    if (!d.hidePins) r.pins.forEach((pn) => { s += `<circle cx="${pn.x}" cy="${pn.y}" r="2.6" fill="#ffffff" stroke="${INK}" stroke-width="1.2"/>`; });
    if (edit) r.pins.forEach((pn) => { s += `<circle cx="${pn.x}" cy="${pn.y}" r="7" fill="transparent" class="pinhit${o.activePin === p.id + '|' + pn.id ? ' on' : ''}" data-pin="${p.id}|${esc(pn.id)}"><title>${esc(p.label || '')} ${esc(pn.n || pn.id)}</title></circle>`; });
    s += '</g>';
    if (!d.noLabel && p.label) s += `<text x="${bb.x + bb.w / 2}" y="${bb.y - 7}" font-size="11" font-weight="600" text-anchor="middle" fill="${INK}" font-family="${MONO}">${esc(p.label)}</text>`;
    const sub = d.sub ? tmpl(d.sub, r.props).trim() : '';
    let ty = bb.y + bb.h + 13;
    if (sub) { s += `<text x="${bb.x + bb.w / 2}" y="${ty}" font-size="9" text-anchor="middle" fill="#4a524d" font-family="${MONO}">${esc(sub)}</text>`; ty += 11; }
    const xr = o.xref && o.xref.get(p.id);
    if (xr) {
      const link = p.type === 'offpage' || p.type === 'net_label';
      const txt = (link ? '→ ' : 'also on ') + xr.map((x) => x.text).join(', ');
      s += `<text x="${bb.x + bb.w / 2}" y="${ty}" font-size="8" text-anchor="middle" fill="${o.bw ? INK : '#2b5fb8'}" font-family="${MONO}"${edit ? ` data-xref="${p.id}" class="xref"` : ''}>${esc(txt)}${edit ? '<title>Click to go there</title>' : ''}</text>`;
      ty += 10;
    }
    if (o.states && o.states.has(p.id)) { s += `<text x="${bb.x + bb.w / 2}" y="${ty}" font-size="8.5" font-weight="700" text-anchor="middle" fill="#a35f00" font-family="${MONO}" pointer-events="none">${esc(o.states.get(p.id))}</text>`; ty += 10; }
    if (o.badges && o.badges.has(p.id)) {
      const bd = o.badges.get(p.id), col = bd.level === 'low' ? '#a3241b' : bd.level === 'check' ? '#9a5b00' : '#1e6b2e', tw = bd.text.length * 5.2 + 8;
      s += `<rect x="${bb.x + bb.w / 2 - tw / 2}" y="${ty - 8}" width="${tw}" height="11" rx="2" fill="#ffffff" stroke="${col}" stroke-width=".8" pointer-events="none"/><text x="${bb.x + bb.w / 2}" y="${ty}" font-size="8.5" font-weight="600" text-anchor="middle" fill="${col}" font-family="${MONO}" pointer-events="none">${esc(bd.text)}</text>`;
    }
    return s;
  }

  function wireSVG(doc, w, o) {
    const pts = wirePoints(doc, w);
    if (!pts) return '';
    const d = 'M' + pts.map((p) => `${p.x} ${p.y}`).join(' L');
    const main = o.bw ? { hex: '#3a403c' } : colourById(doc, w.colour) || { hex: '#888' };
    const sw = gaugeWidth(w.gauge), edit = o.mode === 'edit', selected = edit && o.selWires && o.selWires.has(w.id);
    const live = o.sim && o.sim.has(w.id), lit = o.hl && o.hl.has(w.id), dim = (o.sim && !live) || (o.hl && !lit);
    let s = dim ? '<g opacity=".3">' : '';
    if (live) s += `<path d="${d}" fill="none" stroke="#ffb400" stroke-opacity=".6" stroke-width="${sw + 10}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (lit) s += `<path d="${d}" fill="none" stroke="#2f6fde" stroke-opacity=".38" stroke-width="${sw + 10}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (selected) s += `<path d="${d}" fill="none" stroke="#2f7dff" stroke-opacity=".35" stroke-width="${sw + 10}" stroke-linejoin="round" stroke-linecap="round"/>`;
    s += `<path d="${d}" fill="none" stroke="#262b28" stroke-width="${sw + 1.6}" stroke-linejoin="round" stroke-linecap="round"/>`;
    s += `<path d="${d}" fill="none" stroke="${main.hex}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
    const tracers = o.bw ? [] : [w.tracer, w.tracer2].filter(Boolean).map((id) => colourById(doc, id)).filter(Boolean);
    tracers.forEach((t, i) => {
      const dash = tracers.length === 2 ? `4 8` : `6 6`;
      s += `<path d="${d}" fill="none" stroke="${t.hex}" stroke-width="${sw * 0.62}" stroke-dasharray="${dash}" stroke-dashoffset="${i * 6}" stroke-linejoin="round"/>`;
    });
    [pts[0], pts[pts.length - 1]].forEach((p) => { s += `<circle cx="${p.x}" cy="${p.y}" r="${Math.max(2.4, sw / 2 + 1)}" fill="#262b28"/>`; });
    if (edit || o.tag) s += `<path d="${d}" fill="none" stroke="transparent" stroke-width="${Math.max(12, sw + 8)}" data-wire="${w.id}" class="wirehit"/>`;
    return s + (dim ? '</g>' : '');
  }

  /* Where a wire's label sits: the middle of its longest run, plus any offset the user dragged it by. */
  function wireLabelPos(doc, w) {
    const pts = wirePoints(doc, w);
    if (!pts) return null;
    let best = null, bl = -1;
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], l = Math.abs(a.x - b.x) + Math.abs(a.y - b.y); if (l > bl) { bl = l; best = [a, b]; } }
    const [a, b] = best, horiz = a.y === b.y, lab = w.lab || {};
    const ax = (a.x + b.x) / 2, ay = (a.y + b.y) / 2;
    return { ax, ay, horiz, x: (horiz ? ax : a.x + 6) + (lab.dx || 0), y: (horiz ? a.y - 6 : ay + 3) + (lab.dy || 0), moved: !!(lab.dx || lab.dy) };
  }
  function wireLabelText(doc, w, mode) {
    const cab = w.cable && ((doc.cables || []).find((c) => c.id === w.cable) || {}).name;
    return (mode === 'code' ? wireCode(doc, w) : [w.name, wireCode(doc, w), w.gauge ? w.gauge + 'mm²' : ''].filter(Boolean).join(' ')) + (cab ? ` [${cab}]` : '');
  }
  function wireLabelSVG(doc, w, o) {
    const mode = (doc.settings && doc.settings.labels) || 'full';
    if (mode === 'none') return '';
    const q = wireLabelPos(doc, w);
    if (!q) return '';
    const txt = wireLabelText(doc, w, mode), edit = o.mode === 'edit';
    let s = '';
    if (q.moved && Math.hypot(q.x - q.ax, q.y - q.ay) > 16) s += `<line x1="${q.ax}" y1="${q.ay}" x2="${q.x}" y2="${q.y - 3}" stroke="${INK}" stroke-width=".7" stroke-dasharray="2 2" pointer-events="none"/>`;
    const dim = (o.sim && !o.sim.has(w.id)) || (o.hl && !o.hl.has(w.id));
    s += `<text x="${q.x}" y="${q.y}" font-size="8.5" text-anchor="${q.horiz || q.moved ? 'middle' : 'start'}" fill="${INK}" font-family="${MONO}" stroke="#ffffff" stroke-width="3" paint-order="stroke" stroke-linejoin="round"${dim ? ' opacity=".3"' : ''}${edit ? ` data-wire="${w.id}" data-wlab="${w.id}" class="wirehit wlab"` : o.tag ? ` data-wire="${w.id}" class="wirehit"` : ''}>${esc(txt)}</text>`;
    return s;
  }

  /* Pins with two or more wires get a junction dot. */
  function junctionsSVG(doc) {
    const n = new Map();
    doc.wires.forEach((w) => [w.from, w.to].forEach((e) => { const k = e.part + '|' + e.pin; n.set(k, (n.get(k) || 0) + 1); }));
    let s = '';
    n.forEach((c, k) => {
      if (c < 2) return;
      const [part, ...pin] = k.split('|'), p = doc.parts.find((x) => x.id === part);
      if (!p || p.type === 'splice') return;
      const at = pinPos(doc, { part, pin: pin.join('|') });
      if (at) s += `<circle cx="${at.x}" cy="${at.y}" r="4.2" fill="#262b28" pointer-events="none"/>`;
    });
    return s;
  }

  /* Options shared by the editor and exports: cross-references, black and white, revision clouds. */
  function renderOptions(doc, o = {}) {
    const s = doc.settings || {}, project = doc.project;
    const out = { ...o };
    if (out.bw == null) out.bw = !!s.bw;
    if (out.xref === undefined && s.xrefs !== false && project) out.xref = xrefs(project);
    if (out.clouds === undefined && s.clouds && project && doc.sheet) out.clouds = cloudsFor(project, s.clouds, doc.sheet.id);
    return out;
  }
  function renderDiagram(doc, o = {}) {
    o = renderOptions(doc, { mode: 'export', ...o });
    const back = doc.parts.filter((p) => (partDef(doc, p.type) || {}).back), front = doc.parts.filter((p) => !(partDef(doc, p.type) || {}).back);
    return back.map((p) => partSVG(doc, p, o)).join('') + doc.wires.map((w) => wireSVG(doc, w, o)).join('') +
      ((doc.settings || {}).junctions !== false ? junctionsSVG(doc) : '') +
      front.map((p) => partSVG(doc, p, o)).join('') + doc.wires.map((w) => wireLabelSVG(doc, w, o)).join('') +
      cloudsSVG(doc, o.clouds, o.bw ? INK : null);
  }

  /* Bounds of what is drawn on a sheet. */
  function bounds(doc) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    doc.parts.forEach((p) => { const b = partBox(doc, p); add(b.x - 10, b.y - 20); add(b.x + b.w + 10, b.y + b.h + 28); });
    doc.wires.forEach((w) => (wirePoints(doc, w) || []).forEach((p) => add(p.x, p.y)));
    if (x0 === Infinity) return { x: 0, y: 0, w: 400, h: 300 };
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  /* The sheet itself: the page for fixed sizes, otherwise the drawing. */
  function sheetBounds(doc) { const pg = pageOf(doc); return pg ? { x: 0, y: 0, w: pg.W, h: pg.H } : bounds(doc); }

  /* Where each colour combination is used. Colours can be reused for different
     jobs in different harnesses or sheets; this shows every use side by side. */
  function colourUsage(d) {
    const m = new Map();
    eachView(d).forEach((doc) => doc.wires.forEach((w) => {
      const code = wireCode(doc, w);
      if (!m.has(code)) m.set(code, { code, colour: wireColourName(doc, w), sample: w, wires: 0, uses: new Map() });
      const e = m.get(code); e.wires++;
      const use = [w.circuit || 'No circuit', w.harness].filter(Boolean).join(' · ');
      if (!e.uses.has(use)) e.uses.set(use, { circuit: w.circuit || '', harness: w.harness || '', sheets: new Set(), wires: [] });
      const u = e.uses.get(use); u.sheets.add(doc.sheet ? doc.sheet.name : ''); u.wires.push(w.name);
    }));
    return [...m.values()].sort((a, b) => a.code.localeCompare(b.code)).map((e) => ({ ...e, uses: [...e.uses.values()].map((u) => ({ ...u, sheets: [...u.sheets].filter(Boolean) })) }));
  }
  function usedColourCombos(doc) { return colourUsage(doc).map((e) => [e.code, e.sample, e.uses]); }

  /* ---- Sheet furniture: colour key, revision table, title block ---- */
  function keySVG(doc, kx, ky, maxRows, o) {
    const combos = usedColourCombos(doc);
    if (!combos.length) return '';
    let out = `<text x="${kx}" y="${ky}" font-size="11" font-weight="700" fill="${INK}">WIRE COLOUR KEY</text>`;
    const shown = maxRows && combos.length > maxRows ? combos.slice(0, maxRows - 1) : combos;
    shown.forEach(([code, w, uses], i) => {
      const yy = ky + 18 + i * 18, main = o.bw ? { hex: '#3a403c' } : colourById(doc, w.colour) || { hex: '#888' };
      out += `<line x1="${kx}" y1="${yy - 4}" x2="${kx + 40}" y2="${yy - 4}" stroke="#262b28" stroke-width="6.5"/><line x1="${kx}" y1="${yy - 4}" x2="${kx + 40}" y2="${yy - 4}" stroke="${main.hex}" stroke-width="5"/>`;
      if (!o.bw) [w.tracer, w.tracer2].filter(Boolean).forEach((id, j) => { const t = colourById(doc, id); if (t) out += `<line x1="${kx}" y1="${yy - 4}" x2="${kx + 40}" y2="${yy - 4}" stroke="${t.hex}" stroke-width="3" stroke-dasharray="${w.tracer2 ? '4 8' : '6 6'}" stroke-dashoffset="${j * 6}"/>`; });
      const what = uses.map((u) => u.circuit).filter(Boolean);
      out += `<text x="${kx + 48}" y="${yy}" font-size="9" fill="${INK}"><tspan font-weight="700">${esc(code)}</tspan> ${esc(wireColourName(doc, w))}${what.length ? `<tspan fill="#5b625e"> · ${esc(what.join(', ').slice(0, 60))}</tspan>` : ''}</text>`;
    });
    if (shown.length < combos.length) out += `<text x="${kx}" y="${ky + 18 + shown.length * 18}" font-size="9" fill="#5b625e">+ ${combos.length - shown.length} more in the colour usage list</text>`;
    return out;
  }
  const REV_ROW = 14;
  function revRows(doc, max = 6) { return ((doc.revisions || []).slice(-max)).reverse(); }
  function revTableSVG(doc, x, yBottom, w) {
    const rows = revRows(doc);
    if (!rows.length) return { svg: '', h: 0 };
    const h = (rows.length + 1) * REV_ROW, y = yBottom - h;
    const cols = [[0, 40, 'REV'], [40, 80, 'DATE'], [120, w - 180, 'DESCRIPTION'], [w - 60, 60, 'BY']];
    const fit = (v, cw) => { const t = String(v == null ? '' : v), n = Math.floor((cw - 8) / (8 * 0.62)); return t.length > n ? t.slice(0, Math.max(1, n - 1)) + '…' : t; };
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" stroke="${INK}" stroke-width="1"/>`;
    cols.forEach(([cx, cw, label], i) => {
      if (i) s += `<line x1="${x + cx}" y1="${y}" x2="${x + cx}" y2="${y + h}" stroke="${INK}" stroke-width=".8"/>`;
      s += `<text x="${x + cx + 4}" y="${y + 10}" font-size="6.5" fill="#5b625e">${label}</text>`;
    });
    rows.forEach((r, i) => {
      const yy = y + (i + 1) * REV_ROW;
      s += `<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" stroke="${INK}" stroke-width=".6"/>`;
      [r.rev, r.date, r.description, r.by].forEach((v, j) => { s += `<text x="${x + cols[j][0] + 4}" y="${yy + 10}" font-size="8" ${j === 0 ? 'font-weight="700"' : ''} fill="${INK}">${esc(fit(v, cols[j][1]))}</text>`; });
    });
    return { svg: s, h };
  }
  const TB_W = 420, TB_H = 96;
  function titleBlockSVG(doc, tx, ty) {
    const m = doc.meta || {};
    const fit = (v, w, size) => { const t = String(v == null ? '' : v), n = Math.floor((w - 10) / (size * 0.62)); return t.length > n ? t.slice(0, Math.max(1, n - 1)) + '…' : t; };
    const cell = (x, y, w, h, label, val, big) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" stroke="${INK}" stroke-width="1"/><text x="${x + 5}" y="${y + 10}" font-size="6.5" fill="#5b625e">${esc(label)}</text><text x="${x + 5}" y="${y + h - 7}" font-size="${big ? 13 : 9}" font-weight="${big ? 700 : 500}" fill="${INK}">${esc(fit(val, w, big ? 13 : 9))}</text>`;
    const sheetName = doc.sheet ? doc.sheet.name : doc.title, sheetNo = doc.sheet ? `${doc.sheetNo} of ${doc.sheets.length}` : '1 of 1';
    const pg = pageOf(doc);
    let out = cell(tx, ty, TB_W, 36, 'SHEET TITLE', sheetName, true);
    out += cell(tx, ty + 36, 210, 30, 'PROJECT', doc.title) + cell(tx + 210, ty + 36, 150, 30, 'VEHICLE / CLIENT', m.project) + cell(tx + 360, ty + 36, 60, 30, 'SIZE', pg ? pg.size : '—');
    out += cell(tx, ty + 66, 110, 30, 'DRAWN BY', m.drawnBy) + cell(tx + 110, ty + 66, 90, 30, 'DATE', m.date) + cell(tx + 200, ty + 66, 50, 30, 'REV', m.revision) + cell(tx + 250, ty + 66, 70, 30, 'SHEET', sheetNo) + cell(tx + 320, ty + 66, 100, 30, 'DRAWN WITH', 'LoomWright');
    return out;
  }
  /* Frame, zones, key, revision table and title block for a fixed-size sheet. */
  function sheetFurnitureSVG(doc, o = {}) {
    const pg = pageOf(doc);
    if (!pg) return '';
    const s = doc.settings || {}, inner = pg.m + pg.b;
    let out = frameSVG(pg, o);
    out += '<g pointer-events="none">';
    if (s.colourKey !== false) out += keySVG(doc, pg.W - inner - 330, inner + 22, Math.floor((pg.H / 2 - inner - 40) / 18), o);
    if (s.titleBlock !== false) {
      const tx = pg.W - inner - TB_W, ty = pg.H - inner - TB_H;
      out += revTableSVG(doc, tx, ty, TB_W).svg + titleBlockSVG(doc, tx, ty);
    }
    return out + '</g>';
  }

  function exportSVG(doc, o = {}) {
    const s = doc.settings || {}, pg = pageOf(doc);
    const ro = renderOptions(doc, { mode: 'export', ...o });
    if (pg) {
      let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${pg.W}" height="${pg.H}" viewBox="0 0 ${pg.W} ${pg.H}" font-family="${MONO}" data-page="${pg.size}${pg.portrait ? ' portrait' : ''}">`;
      out += `<rect x="0" y="0" width="${pg.W}" height="${pg.H}" fill="#ffffff"/>`;
      out += renderDiagram(doc, ro) + sheetFurnitureSVG(doc, ro);
      return out + '</svg>';
    }
    const b = bounds(doc), pad = 40;
    const combos = s.colourKey !== false ? usedColourCombos(doc) : [];
    const keyW = combos.length ? 330 : 0;
    const revH = s.titleBlock !== false && (doc.revisions || []).length ? (revRows(doc).length + 1) * REV_ROW : 0;
    const tbH = s.titleBlock !== false ? TB_H + revH : 0;
    const W = Math.max(b.w + pad * 2 + keyW, 520), H = Math.max(b.h + pad * 2 + tbH, combos.length * 18 + 80 + tbH);
    const X = b.x - pad, Y = b.y - pad;
    let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${X} ${Y} ${W} ${H}" font-family="${MONO}">`;
    out += `<rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="#ffffff"/>`;
    out += `<rect x="${X + 8}" y="${Y + 8}" width="${W - 16}" height="${H - 16}" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
    out += renderDiagram(doc, ro);
    if (combos.length) out += keySVG(doc, X + W - keyW + 4, Y + 30, 0, ro);
    if (tbH) {
      const tx = X + W - TB_W - 8, ty = Y + H - TB_H - 8;
      out += revTableSVG(doc, tx, ty, TB_W).svg + titleBlockSVG(doc, tx, ty);
    }
    return out + '</svg>';
  }

  /* ------------------------------------------------------------------ */
  /* Revisions: issue, compare, restore                                  */
  /* ------------------------------------------------------------------ */
  const STATE_KEYS = ['title', 'meta', 'settings', 'harnesses', 'cables', 'customColours', 'customParts', 'harnessLayouts', 'sheets'];
  function revisionState(project) { const o = {}; STATE_KEYS.forEach((k) => { if (project[k] !== undefined) o[k] = JSON.parse(JSON.stringify(project[k])); }); return o; }
  function nextRevision(rev) {
    const r = String(rev || '').trim();
    if (!r) return 'A';
    const m = /^(.*?)(\d+)$/.exec(r);
    if (m) return m[1] + (parseInt(m[2], 10) + 1);
    if (/^[A-Z]+$/.test(r)) {
      const a = r.split(''); let i = a.length - 1;
      while (i >= 0) { if (a[i] === 'Z') { a[i] = 'A'; i--; } else { a[i] = String.fromCharCode(a[i].charCodeAt(0) + 1); return a.join(''); } }
      return 'A' + a.join('');
    }
    return r + '.1';
  }
  /* Record the project as it is now as a revision. The first issue keeps the current letter. */
  function issueRevision(project, o = {}) {
    project.revisions = project.revisions || [];
    const last = project.revisions[project.revisions.length - 1];
    const rev = o.rev || (last ? nextRevision(last.rev) : (project.meta.revision || 'A'));
    const date = o.date || new Date().toISOString().slice(0, 10);
    project.meta.revision = rev; project.meta.date = date;
    if (o.by != null && !project.meta.drawnBy) project.meta.drawnBy = o.by;
    const r = { id: uid('r'), rev, date, by: o.by || project.meta.drawnBy || '', description: o.description || '', snapshot: null };
    r.snapshot = revisionState(project);
    project.revisions.push(r);
    return r;
  }
  function revisionById(project, id) { return (project.revisions || []).find((r) => r.id === id || r.rev === id) || null; }
  const PART_FIELDS = ['type', 'label', 'props', 'mpn', 'supplier', 'cost', 'location', 'rot', 'flip'];
  const WIRE_FIELDS = ['name', 'from', 'to', 'colour', 'tracer', 'tracer2', 'gauge', 'length', 'current', 'circuit', 'harness', 'notes', 'ends', 'insulation', 'cable', 'route'];
  const same = (a, b) => JSON.stringify(a == null || a === '' ? null : a) === JSON.stringify(b == null || b === '' ? null : b);
  /* What changed between two project states (older a, newer b). */
  function diffStates(a, b) {
    const out = { sheets: [], meta: [], harnesses: { added: [], removed: [] }, count: 0 };
    ['title'].forEach((k) => { if (!same(a[k], b[k])) out.meta.push({ field: k, from: a[k], to: b[k] }); });
    ['project', 'drawnBy', 'notes'].forEach((k) => { if (!same((a.meta || {})[k], (b.meta || {})[k])) out.meta.push({ field: k, from: (a.meta || {})[k], to: (b.meta || {})[k] }); });
    out.harnesses.added = (b.harnesses || []).filter((h) => !(a.harnesses || []).includes(h));
    out.harnesses.removed = (a.harnesses || []).filter((h) => !(b.harnesses || []).includes(h));
    const as = a.sheets || [], bs = b.sheets || [];
    const ids = [...new Set([...as.map((s) => s.id), ...bs.map((s) => s.id)])];
    ids.forEach((id) => {
      const sa = as.find((s) => s.id === id), sb = bs.find((s) => s.id === id);
      const e = { id, name: (sb || sa).name, status: !sa ? 'added' : !sb ? 'removed' : sa.name !== sb.name ? 'renamed' : 'same', oldName: sa && sa.name, parts: { added: [], removed: [], changed: [] }, wires: { added: [], removed: [], changed: [] } };
      const pa = (sa && sa.parts) || [], pb = (sb && sb.parts) || [], wa = (sa && sa.wires) || [], wb = (sb && sb.wires) || [];
      const label = (p) => p.label || p.type;
      pb.forEach((p) => {
        const o = pa.find((x) => x.id === p.id);
        if (!o) { e.parts.added.push({ id: p.id, label: label(p), type: p.type }); return; }
        const f = PART_FIELDS.filter((k) => !same(o[k], p[k]));
        const moved = o.x !== p.x || o.y !== p.y;
        if (f.length || moved) e.parts.changed.push({ id: p.id, label: label(p), type: p.type, fields: f, moved, from: o, to: p });
      });
      pa.forEach((p) => { if (!pb.some((x) => x.id === p.id)) e.parts.removed.push({ id: p.id, label: label(p), type: p.type, was: p }); });
      wb.forEach((w) => {
        const o = wa.find((x) => x.id === w.id);
        if (!o) { e.wires.added.push({ id: w.id, label: w.name }); return; }
        const f = WIRE_FIELDS.filter((k) => !same(o[k], w[k]));
        const rerouted = !same(o.points, w.points) || !same(o.dx, w.dx);
        if (f.length || rerouted) e.wires.changed.push({ id: w.id, label: w.name, fields: f, rerouted, from: o, to: w });
      });
      wa.forEach((w) => { if (!wb.some((x) => x.id === w.id)) e.wires.removed.push({ id: w.id, label: w.name, was: w }); });
      const n = e.parts.added.length + e.parts.removed.length + e.parts.changed.length + e.wires.added.length + e.wires.removed.length + e.wires.changed.length;
      e.count = n + (e.status !== 'same' ? 1 : 0);
      out.count += e.count;
      if (e.count) out.sheets.push(e);
    });
    out.count += out.meta.length + out.harnesses.added.length + out.harnesses.removed.length;
    return out;
  }
  /* Compare two revisions (ids, letters, or 'current'). */
  function compareRevisions(project, fromId, toId) {
    const st = (id) => (!id || id === 'current' ? revisionState(project) : (revisionById(project, id) || {}).snapshot);
    const a = st(fromId), b = st(toId);
    if (!a || !b) throw new Error('No such revision');
    return diffStates(a, b);
  }
  /* Parts and wires on one sheet that changed since a revision, for clouds. */
  function cloudsFor(project, revId, sheetId) {
    const r = revisionById(project, revId);
    if (!r || !r.snapshot) return null;
    const d = diffStates(r.snapshot, revisionState(project)), e = d.sheets.find((x) => x.id === sheetId);
    const c = { parts: new Set(), wires: new Set(), removed: [], rev: project.meta.revision === r.rev ? nextRevision(r.rev) : project.meta.revision };
    if (!e) return c;
    if (e.status === 'added') { const sh = project.sheets.find((s) => s.id === sheetId); sh.parts.forEach((p) => c.parts.add(p.id)); sh.wires.forEach((w) => c.wires.add(w.id)); return c; }
    e.parts.added.concat(e.parts.changed.filter((x) => x.fields.length || x.moved)).forEach((x) => c.parts.add(x.id));
    e.wires.added.concat(e.wires.changed).forEach((x) => c.wires.add(x.id));
    const old = r.snapshot.sheets.find((s) => s.id === sheetId);
    if (old) {
      const ov = view({ ...r.snapshot, customParts: r.snapshot.customParts || project.customParts, sheets: r.snapshot.sheets }, old);
      e.parts.removed.forEach((x) => { const p = old.parts.find((q) => q.id === x.id); if (p) c.removed.push(partBox(ov, p)); });
    }
    return c;
  }
  /* Human-readable list of changes, used by the compare dialog, the Claude add-on and exports. */
  function describeDiff(d) {
    const lines = [];
    d.meta.forEach((m) => lines.push(`Project ${m.field}: "${m.from || ''}" → "${m.to || ''}"`));
    d.harnesses.added.forEach((h) => lines.push(`Harness added: ${h}`));
    d.harnesses.removed.forEach((h) => lines.push(`Harness removed: ${h}`));
    d.sheets.forEach((s) => {
      const at = s.name + ': ';
      if (s.status === 'added') lines.push(`Sheet added: ${s.name}`);
      if (s.status === 'removed') lines.push(`Sheet removed: ${s.name}`);
      if (s.status === 'renamed') lines.push(`Sheet renamed: ${s.oldName} → ${s.name}`);
      if (s.status === 'added' || s.status === 'removed') return;
      s.parts.added.forEach((p) => lines.push(at + `added ${p.label}`));
      s.parts.removed.forEach((p) => lines.push(at + `removed ${p.label}`));
      s.parts.changed.forEach((p) => lines.push(at + `${p.label}: ` + [...p.fields.map((f) => f === 'props' ? Object.keys({ ...p.from.props, ...p.to.props }).filter((k) => !same((p.from.props || {})[k], (p.to.props || {})[k])).map((k) => `${k} ${(p.from.props || {})[k] ?? ''} → ${(p.to.props || {})[k] ?? ''}`).join(', ') : f === 'label' ? `renamed from ${p.from.label}` : ['mpn', 'supplier', 'cost', 'location'].includes(f) ? `${f === 'mpn' ? 'part no.' : f} ${p.from[f] ?? '—'} → ${p.to[f] ?? '—'}` : `${f} changed`), p.moved ? 'moved' : ''].filter(Boolean).join('; ')));
      s.wires.added.forEach((w) => lines.push(at + `added wire ${w.label}`));
      s.wires.removed.forEach((w) => lines.push(at + `removed wire ${w.label}`));
      s.wires.changed.forEach((w) => lines.push(at + `wire ${w.label}: ` + [...w.fields.map((f) => (['from', 'to'].includes(f) ? `${f} end moved` : ['colour', 'tracer', 'tracer2', 'gauge', 'length', 'current', 'circuit', 'harness', 'name', 'insulation'].includes(f) ? `${f} ${w.from[f] || '—'} → ${w.to[f] || '—'}` : `${f} changed`)), w.rerouted ? 'rerouted' : ''].filter(Boolean).join('; ')));
    });
    return lines;
  }
  /* Put the project back to a revision. Revisions themselves are kept. */
  function restoreRevision(project, id) {
    const r = revisionById(project, id);
    if (!r || !r.snapshot) throw new Error('No such revision');
    const snap = JSON.parse(JSON.stringify(r.snapshot));
    // build and test progress belongs to the loom on the bench, not the drawing: keep it
    const built = new Map();
    (project.sheets || []).forEach((s) => s.wires.forEach((w) => { if (w.build) built.set(w.id, w.build); }));
    STATE_KEYS.forEach((k) => { if (snap[k] !== undefined) project[k] = snap[k]; });
    (project.sheets || []).forEach((s) => s.wires.forEach((w) => { if (built.has(w.id)) w.build = built.get(w.id); else delete w.build; }));
    project.settings.clouds = '';
    return project;
  }

  /* ------------------------------------------------------------------ */
  /* Reports and checks                                                  */
  /* ------------------------------------------------------------------ */
  // Reports accept a sheet view or a whole project.
  function eachView(d) { return d && d.sheet ? [d] : d && Array.isArray(d.sheets) ? views(d) : [d]; }
  function wireList(d) { return eachView(d).flatMap(wireListSheet); }
  function wireListSheet(doc) {
    return doc.wires.map((w) => {
      const g = gaugeInfo(w.gauge), vd = voltageDrop(w);
      const ends = w.ends || {}, ef = ends.from || {}, et = ends.to || {};
      return { id: w.id, sheet: doc.sheet ? doc.sheet.name : '', sheetId: doc.sheet ? doc.sheet.id : '', name: w.name, from: pinName(doc, w.from), to: pinName(doc, w.to), code: wireCode(doc, w), colour: wireColourName(doc, w), gauge: w.gauge, awg: g ? g.awg : '', length: w.length, current: w.current, drop: vd == null ? '' : vd.toFixed(2), circuit: w.circuit || '', harness: w.harness || '', notes: w.notes || '', insulation: w.insulation || '', cable: w.cable || '', termFrom: ef.term || '', termTo: et.term || '' };
    });
  }
  function bom(d) {
    const m = new Map(), seen = new Set();
    eachView(d).forEach((doc) => doc.parts.forEach((p) => {
      if (p.label && seen.has(p.type + '|' + p.label)) return; // the same part drawn on several sheets
      if (p.label) seen.add(p.type + '|' + p.label);
      const d = partDef(doc, p.type); if (!d || d.cat === 'Annotation' || p.type === 'splice' || p.type === 'net_label' || p.type === 'offpage') return;
      const r = resolved(doc, p), spec = d.sub ? tmpl(d.sub, r.props).trim() : '';
      const mpn = p.mpn || (p.type === 'conn' ? r.props.mpnShown : '') || '';
      const k = d.name + '|' + spec + '|' + mpn + '|' + (p.supplier || '');
      if (!m.has(k)) m.set(k, { name: d.name, spec, mpn, supplier: p.supplier || '', unit: null, qty: 0, refs: [], locations: [] });
      const e = m.get(k); e.qty++; if (p.label) e.refs.push(p.label);
      const c = parseFloat(p.cost); if (c >= 0 && e.unit == null) e.unit = c;
      if (p.location && !e.locations.includes(p.location)) e.locations.push(p.location);
    }));
    return [...m.values()].map((e) => ({ ...e, total: e.unit != null ? +(e.unit * e.qty).toFixed(2) : null })).sort((a, b) => a.name.localeCompare(b.name));
  }
  function cableTotals(d) {
    const m = new Map();
    eachView(d).forEach((doc) => doc.wires.forEach((w) => {
      const k = w.gauge + '|' + wireCode(doc, w) + '|' + (w.insulation || '');
      if (!m.has(k)) m.set(k, { gauge: w.gauge, code: wireCode(doc, w), colour: wireColourName(doc, w), insulation: w.insulation || '', metres: 0, wires: 0, unknown: 0 });
      const e = m.get(k); e.wires++; const l = parseFloat(w.length); if (l > 0) e.metres += l; else e.unknown++;
    }));
    const costs = (d && d.settings && d.settings.cableCosts) || {};
    return [...m.values()].map((e) => { const pm = parseFloat(costs[e.gauge]); return { ...e, perMetre: pm >= 0 ? pm : null, cost: pm >= 0 ? +(pm * e.metres * 1.15).toFixed(2) : null }; })
      .sort((a, b) => parseFloat(a.gauge) - parseFloat(b.gauge) || a.code.localeCompare(b.code));
  }
  function parseAmps(s) { const m = /([\d.]+)\s*A?/i.exec(String(s || '')); return m ? parseFloat(m[1]) : null; }

  function validate(d) {
    const vs = eachView(d), many = vs.length > 1;
    return vs.flatMap((doc) => validateSheet(doc).map((c) => ({ ...c, sheetId: doc.sheet ? doc.sheet.id : '', text: many && doc.sheet ? `${doc.sheet.name}: ${c.text}` : c.text })));
  }
  function validateSheet(doc) {
    const out = [], sys = parseFloat(((doc.settings || {}).volts) || 12) || 12;
    const conn = new Map();
    doc.wires.forEach((w) => [w.from, w.to].forEach((e) => { const k = e.part + '|' + e.pin; conn.set(k, (conn.get(k) || 0) + 1); }));
    doc.wires.forEach((w) => {
      if (!pinPos(doc, w.from) || !pinPos(doc, w.to)) out.push({ level: 'error', wire: w.id, text: `${w.name} is connected to a pin that no longer exists.` });
      if (w.from.part === w.to.part && w.from.pin === w.to.pin) out.push({ level: 'error', wire: w.id, text: `${w.name} starts and ends on the same pin.` });
      const vd = voltageDrop(w);
      if (vd != null && vd > sys * 0.03) out.push({ level: 'warn', wire: w.id, text: `${w.name}: voltage drop ${vd.toFixed(2)}V (${((vd / sys) * 100).toFixed(1)}%) at ${w.current}A over ${w.length}m. Over 3%, consider a heavier gauge.` });
      const g = gaugeInfo(w.gauge), I = parseFloat(w.current);
      if (g && I > g.guideA) out.push({ level: 'warn', wire: w.id, text: `${w.name}: ${I}A is above the guide figure of ${g.guideA}A for ${w.gauge}mm².` });
    });
    doc.parts.forEach((p) => {
      const r = resolved(doc, p), d = r.def;
      if (!d) { out.push({ level: 'error', part: p.id, text: `${p.label || p.type}: component type "${p.type}" is missing from the library.` }); return; }
      if (d.cat === 'Annotation') return;
      const free = r.pins.filter((pn) => !conn.get(p.id + '|' + pn.id));
      if (free.length && free.length === r.pins.length && r.pins.length) out.push({ level: 'info', part: p.id, text: `${p.label || d.name} has no wires connected.` });
      else if (free.length && !['fuse_box', 'busbar', 'terminal_block', 'connector', 'plug', 'conn', 'module', 'ic', 'switch_rotary', 'offpage', 'net_label', 'contura', 'dcdc', 'fuse_box_lucas', 'pdm'].includes(p.type)) out.push({ level: 'info', part: p.id, text: `${p.label || d.name}: pin ${free.map((q) => q.id).join(', ')} not connected.` });
      // Fuse rating against the wire it protects
      if (['fuse', 'fuse_maxi', 'breaker', 'fusible_link'].includes(p.type) || p.type === 'fuse_box') {
        const ratings = p.type === 'fuse_box' ? String(r.props.ratings || '').split(',').map(parseAmps) : null;
        doc.wires.forEach((w) => {
          [w.from, w.to].forEach((e) => {
            if (e.part !== p.id) return;
            let amps = null;
            if (p.type === 'fuse_box') { if (e.pin === 'IN') return; amps = ratings[parseInt(e.pin, 10) - 1]; }
            else { if (e.pin !== '2') return; amps = parseAmps(r.props.rating); }
            const g = gaugeInfo(w.gauge);
            if (amps && g && amps > g.guideA) out.push({ level: 'warn', wire: w.id, part: p.id, text: `${p.label}${p.type === 'fuse_box' ? ' way ' + e.pin : ''} (${amps}A) feeds ${w.name} at ${w.gauge}mm². Guide maximum for that size is ${g.guideA}A.` });
          });
        });
      }
    });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Auto layout: used by the Claude add-on for text-to-diagram          */
  /* ------------------------------------------------------------------ */
  const COLUMN_OF = { 'Power & charging': 0, Protection: 1, Switches: 2, 'Relays & control': 3, 'Wiring & connectors': 3, Electronics: 3, Lighting: 4, 'Motors & loads': 4, 'Gauges & sensors': 4, Annotation: 5 };
  function autoLayout(doc, opts = {}) {
    const only = opts.onlyUnplaced ? new Set(doc.parts.filter((p) => p.x == null || p.y == null || p._unplaced).map((p) => p.id)) : null;
    const cols = [[], [], [], [], [], []], earths = [];
    doc.parts.forEach((p) => {
      if (only && !only.has(p.id)) return;
      const d = partDef(doc, p.type) || { cat: 'Electronics' };
      if (/^ground|earth/.test(p.type)) earths.push(p); else cols[COLUMN_OF[d.cat] != null ? COLUMN_OF[d.cat] : 3].push(p);
    });
    let x = 40, maxY = 0, y0 = 40;
    if (only) {
      const placed = doc.parts.filter((p) => !only.has(p.id));
      if (placed.length) { const b = bounds({ ...doc, parts: placed, wires: [], customParts: doc.customParts, settings: doc.settings }); y0 = snap(b.y + b.h + 80); x = snap(Math.max(40, b.x)); }
    }
    maxY = y0;
    cols.forEach((col) => {
      if (!col.length) return;
      let y = y0, colW = 0;
      col.forEach((p) => { p.rot = p.rot || 0; const bb = partBox(doc, { ...p, x: 0, y: 0 }); p.x = snap(x - bb.x); p.y = snap(y - bb.y); y += bb.h + 70; colW = Math.max(colW, bb.w); delete p._unplaced; });
      maxY = Math.max(maxY, y); x += colW + 140;
    });
    let ex = 60;
    earths.forEach((p) => { p.x = ex; p.y = snap(maxY + 20); ex += 80; delete p._unplaced; });
    return doc;
  }

  function libraryList(doc) {
    const items = Object.values(lib).concat(((doc && doc.customParts) || []));
    return items.map((d) => {
      const r = resolved(doc || { customParts: [] }, { type: d.id, props: {} });
      return { id: d.id, name: d.name, category: d.cat, prefix: d.prefix || '', custom: !!d.custom, pins: r.pins.map((p) => ({ id: p.id, name: p.n || p.id })), props: (d.props || []).map((p) => ({ key: p.k, label: p.l, default: p.d })) };
    });
  }

  return {
    VERSION, FORMAT, GRID, INK, CATEGORIES, LIBRARY: lib, COLOURS, STANDARDS, GAUGES,
    shapes: { L, R: R2, C, P, T }, shapeSVG, symbolSVG, esc, tmpl, uid, snap,
    newDoc, newSheet, view, views, normalise, colourUsage, partDef, defaultProps, resolved, partBox, findPart, pinPos, pinName, wirePoints, rotPt,
    addPart, addWire, parseEnd, pruneWires, nextLabel, nextWireName,
    allColours, colourById, colourCode, wireCode, wireColourName, gaugeInfo, gaugeWidth, voltageDrop,
    renderDiagram, exportSVG, bounds, sheetBounds, wireList, bom, cableTotals, validate, autoLayout, libraryList, eachView,
    PAGES, pageOf, zoneOf, frameSVG, sheetFurnitureSVG, xrefs, renderOptions, wireLabelPos, wireLabelText, cloudPath,
    DEFAULT_SETTINGS, revisionState, nextRevision, issueRevision, revisionById, diffStates, compareRevisions, cloudsFor, describeDiff, restoreRevision,
  };
});
