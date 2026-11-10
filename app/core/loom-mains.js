/*
 * LoomWright mains: household wiring (guidance from selected BS 7671 rules), factory and
 * control panel wiring (guidance from selected BS EN 60204-1 recommendations), and a loads
 * library of appliances, workshop machines, motors and solar.
 *
 * Everything here is guidance for planning. It does not design, test or certify anything,
 * and it does not replace a qualified electrician. Figures marked "typical" are published
 * typical values, not limits; table values should be checked against the standard itself.
 * Sources are listed in docs/standards-sources.md.
 *
 * Extends window.Loom; needs loom-core.js, loom-data.js, loom-nets.js and loom-reports.js first.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./loom-core.js'));
  else factory(root.Loom);
})(typeof self !== 'undefined' ? self : this, function (Loom) {
  'use strict';
  const { L, R, C, P, T } = Loom.shapes;
  const lib = Loom.LIBRARY;
  const pin = (id, x, y, n) => ({ id: String(id), x, y, n: n || String(id) });
  const DOT = (x, y, r = 2.5) => C(x, y, r, { fill: 'ink', w: 0 });
  const def = (id, d) => { lib[id] = { id, props: [], ...d }; };
  const HOUSE = 'Household', FACTORY = 'Factory & panels', LOADS = 'Loads library';
  [HOUSE, FACTORY, LOADS].forEach((c) => { if (!Loom.CATEGORIES.includes(c)) Loom.CATEGORIES.splice(Loom.CATEGORIES.indexOf('Annotation'), 0, c); });

  const RULESET = { id: 'bs7671-a4-2026', name: 'selected rules from BS 7671:2018+A4:2026', reviewed: '10 November 2026' };
  const FACTORY_RULES = { id: 'en60204-1', name: 'selected recommendations of BS EN 60204-1', reviewed: '10 November 2026' };

  /* ---------------- Reference data (check table values against BS 7671 itself) ---------------- */
  // Twin and earth (70 °C PVC) current ratings in amps, single circuit, 30 °C. BS 7671 Table 4D5 as reproduced by suppliers.
  const TE_RATING = {
    C: { '1.0': 16, '1.5': 20, '2.5': 27, '4.0': 37, '6.0': 47, '10': 64, '16': 85 },
    B: { '1.0': 13, '1.5': 16.5, '2.5': 23, '4.0': 30, '6.0': 38, '10': 52, '16': 69 },
    A: { '1.0': 11.5, '1.5': 14.5, '2.5': 20, '4.0': 26, '6.0': 32, '10': 44, '16': 57 },
    100: { '1.0': 13, '1.5': 16, '2.5': 21, '4.0': 27, '6.0': 34, '10': 45, '16': 57 },
    101: { '1.0': 10.5, '1.5': 13, '2.5': 17, '4.0': 22, '6.0': 27, '10': 36, '16': 46 },
    102: { '1.0': 13, '1.5': 16, '2.5': 21, '4.0': 27, '6.0': 35, '10': 47, '16': 63 },
    103: { '1.0': 8, '1.5': 10, '2.5': 13.5, '4.0': 17.5, '6.0': 23.5, '10': 32, '16': 42.5 },
  };
  const METHODS = [
    ['C', 'C: clipped to a wall or floor'],
    ['B', 'B: in conduit or trunking on a wall'],
    ['A', 'A: in conduit in an insulated wall'],
    ['100', '100: above a ceiling, under up to 100 mm of insulation'],
    ['101', '101: above a ceiling, under more than 100 mm of insulation'],
    ['102', '102: in an insulated stud wall, touching the inner skin'],
    ['103', '103: in an insulated stud wall, not touching the inner skin'],
  ];
  const MV_A_M = { '1.0': 44, '1.5': 29, '2.5': 18, '4.0': 11, '6.0': 7.3, '10': 4.4, '16': 2.8 };
  const R20 = { '1.0': 18.1, '1.5': 12.1, '2.5': 7.41, '4.0': 4.61, '6.0': 3.08, '10': 1.83, '16': 1.15, '25': 0.727 }; // copper, mΩ/m at 20 °C
  const TE_CPC = { '1.0': '1.0', '1.5': '1.0', '2.5': '1.5', '4.0': '1.5', '6.0': '2.5', '10': '4.0', '16': '6.0' };
  const CA = [[25, 1.03], [30, 1], [35, 0.94], [40, 0.87], [45, 0.79], [50, 0.71]];
  const CG = { bunched: [1, 0.8, 0.7, 0.65, 0.6, 0.57], clipped: [1, 0.85, 0.79, 0.75, 0.73, 0.72] };
  const CI = { '': 1, 50: 0.88, 100: 0.78, 200: 0.63, 400: 0.51, surrounded: 0.5 };
  const INSUL = [['', 'Not in insulation'], ['50', 'Surrounded by 50 mm of insulation'], ['100', 'Surrounded by 100 mm'], ['200', 'Surrounded by 200 mm'], ['400', 'Surrounded by 400 mm'], ['surrounded', 'Totally surrounded for more than 0.5 m']];
  const TRIP = { B: 5, C: 10, D: 20 }; // multiples of In for instantaneous operation (top of each band)
  const CMIN = 0.95, U0 = 230;
  const ZE_DEFAULT = { 'TN-C-S': 0.35, 'TN-S': 0.8, TT: 21 };
  const norm = (g) => { const v = parseFloat(g); if (!v) return ''; return v >= 10 ? String(v) : v.toFixed(1); };
  const interp = (tbl, x) => { if (x <= tbl[0][0]) return tbl[0][1]; for (let i = 1; i < tbl.length; i++) if (x <= tbl[i][0]) { const [a, fa] = tbl[i - 1], [b, fb] = tbl[i]; return fa + ((x - a) / (b - a)) * (fb - fa); } return tbl[tbl.length - 1][1]; };
  const r2 = (v) => Math.round(v * 100) / 100, r1 = (v) => Math.round(v * 10) / 10;

  // Three-phase cage motor full-load current at 400 V (EN 60947 technical data, approximate)
  const MOTOR_FLC = [[0.37, 1.1], [0.55, 1.5], [0.75, 1.9], [1.1, 2.6], [1.5, 3.6], [2.2, 5.0], [3, 6.6], [4, 8.5], [5.5, 11.3], [7.5, 15.2], [11, 21.7], [15, 29.3], [18.5, 36], [22, 41], [30, 55], [37, 68], [45, 81], [55, 99], [75, 134]];
  function motorFLC(kw, phases = 3, volts) {
    kw = parseFloat(kw) || 0;
    if (!kw) return 0;
    if (phases === 3 || phases === '3') return r1(interp(MOTOR_FLC, kw) * (400 / (parseFloat(volts) || 400)));
    return r1((kw * 1000) / ((parseFloat(volts) || 230) * 0.8 * 0.85)); // single phase: cos φ 0.8, efficiency 0.85 assumed
  }
  const STARTING = { DOL: [6, 8], 'Star-delta': [2, 3], 'Soft start': [3, 5], VFD: [1, 1.5] };

  /* ---------------- Loads library ---------------- */
  // Typical published ratings. Always use the rating plate when you have it.
  const APPLIANCES = [
    { name: 'Kettle', kw: 3, range: '2.2–3.0 kW', pf: 1 },
    { name: 'Oven (single)', kw: 2.4, range: '2.0–2.4 kW', pf: 1 },
    { name: 'Hob, one zone', kw: 2, range: '1.0–2.0 kW', pf: 1 },
    { name: 'Cooker or induction hob', kw: 10, range: '7–10 kW total', pf: 1, cooker: true },
    { name: 'Microwave', kw: 1.5, range: '0.6–1.5 kW input', pf: 0.9, note: 'Transformer inrush at switch-on.' },
    { name: 'Dishwasher', kw: 1.5, range: '1.05–1.5 kW', pf: 1 },
    { name: 'Washing machine', kw: 2.2, range: '1.2–3.0 kW', pf: 0.95 },
    { name: 'Tumble dryer', kw: 2.5, range: '2.0–3.0 kW', pf: 1 },
    { name: 'Fridge-freezer', kw: 0.2, range: '0.1–0.4 kW running', pf: 0.7, note: 'Compressor start draws several times the running current.' },
    { name: 'Electric shower', kw: 9.5, range: '7.0–10.5 kW', pf: 1, own: true },
    { name: 'Immersion heater', kw: 3, range: '3 kW', pf: 1, own: true },
    { name: 'Air source heat pump (8.5 kW example)', amps: 22, running: 9.1, range: '9.1 A running, 22 A maximum (one maker\'s 8.5 kW unit)', own: true, inverter: true },
    { name: 'EV charge point', kw: 7.4, range: '7 kW minimum for new homes in England (Part S)', pf: 1, own: true, ev: true },
    { name: 'Television', kw: 0.15, range: '25–200 W', pf: 0.9 },
    { name: 'Desktop computer', kw: 0.2, range: '80–200 W', pf: 0.9 },
    { name: 'Hair dryer', kw: 2, range: '1.0–2.0 kW', pf: 1 },
    { name: 'Vacuum cleaner', kw: 0.9, range: '0.5–1.2 kW', pf: 0.9 },
    { name: 'Iron', kw: 2.4, range: '1.0–3.0 kW', pf: 1 },
    { name: 'Fan heater or electric fire', kw: 3, range: '1.0–3.0 kW', pf: 1 },
    { name: 'Storage heater', kw: 3.4, range: 'see rating plate', pf: 1, own: true },
    { name: 'Air conditioner', kw: 0, range: 'no reliable typical figure: use the rating plate', pf: 0.9 },
    { name: 'Other (enter kW)', kw: 0, range: '', pf: 1 },
  ];
  const MACHINES = [
    { name: 'Bench lathe (variable speed)', kw: 1.1, amps: 0, supply: '13 A plug', phases: 1, start: 'VFD', range: 'Example: 1.1 kW with inverter drive on a 13 A plug' },
    { name: 'Milling machine (small)', kw: 1.1, amps: 5.2, supply: '13 A plug', phases: 1, start: 'VFD', range: 'Example: 1.1 kW, 5.2 A' },
    { name: 'Bandsaw (14 inch)', kw: 1.4, amps: 0, supply: '13 A plug', phases: 1, start: 'DOL', range: 'Example: 1.4 kW input' },
    { name: 'Pillar drill', kw: 0.55, amps: 0, supply: '13 A plug', phases: 1, start: 'DOL', range: '0.37–0.75 kW typical' },
    { name: 'Dust extractor', kw: 1.5, amps: 0, supply: '13 A plug', phases: 1, start: 'DOL', range: '1–2.2 kW typical; 2 kW and over start hard on 13 A' },
    { name: 'Piston air compressor (3 hp)', kw: 2.2, amps: 0, supply: '13 A plug', phases: 1, start: 'DOL', range: 'Example: 2.2 kW on a 13 A plug; often needs a Type C breaker' },
    { name: 'MIG welder (inverter, 180 A)', kw: 0, amps: 16, supply: '16 A socket', phases: 1, start: 'Electronic', range: 'Example: 16 A supply recommended; duty cycle 35 % at 180 A', welder: true },
    { name: 'Plasma cutter with built-in compressor', kw: 2.5, amps: 15, supply: '16 A socket', phases: 1, start: 'Electronic', range: 'Example: 15 A at 240 V' },
    { name: 'Large MIG or TIG welder (over 250 A)', kw: 0, amps: 0, supply: 'Fixed', phases: 3, start: 'Electronic', range: 'Usually 400 V three-phase: use the rating plate', welder: true },
    { name: 'Other machine (enter kW or amps)', kw: 0, amps: 0, supply: 'Fixed', phases: 1, start: 'DOL', range: '' },
  ];
  const byName = (list, n) => list.find((x) => x.name === n) || null;

  /* ---------------- Household parts (single-line: one line is one cable) ---------------- */
  const io = (w = 60) => [pin('in', 0, 20, 'Supply in'), pin('out', w, 20, 'Out')];
  const leads = (w = 60, a = 10, b = w - 10) => [L(0, 20, a, 20), L(b, 20, w, 20)];
  const box = (w, text, size = 9) => [R(10, 6, w - 20, 28, { rx: 2 }), T(w / 2, 24, text, { size, weight: 600 })];
  const sel = (k, l, d, opts) => ({ k, l, d, type: 'select', options: opts.map((o) => (Array.isArray(o) ? o : [String(o), String(o)])) });
  const ZONES = [['', 'Not in a bathroom'], ['outside', 'Bathroom, outside the zones'], ['2', 'Bathroom zone 2'], ['1', 'Bathroom zone 1'], ['0', 'Bathroom zone 0']];
  const CIRCUITS = [['', 'Work it out from the drawing'], ['ring', 'Ring final (sockets)'], ['radial', 'Radial (sockets)'], ['lighting', 'Lighting'], ['cooker', 'Cooker'], ['shower', 'Shower'], ['immersion', 'Immersion heater'], ['ev', 'EV charge point'], ['smoke', 'Smoke alarms'], ['outdoor', 'Outdoor'], ['heating', 'Heating'], ['pv', 'Solar inverter'], ['battery', 'Home battery'], ['machine', 'Machine or motor'], ['fixed', 'Fixed appliance'], ['other', 'Other']];
  const curveProps = [sel('curve', 'Type (curve)', 'B', ['B', 'C', 'D']), sel('rating', 'Rating (A)', '32', [6, 10, 16, 20, 25, 32, 40, 45, 50, 63]), sel('poles', 'Poles', '1', [['1', 'Single phase'], ['3', 'Three phase']]),
    sel('circuit', 'Circuit', '', CIRCUITS), { k: 'area', l: 'Floor area served (m², rings)', d: '' }, sel('afdd', 'Arc fault detection (AFDD)', 'no', [['no', 'No'], ['yes', 'Yes']]), sel('existing', 'New or existing', 'new', [['new', 'New work'], ['existing', 'Existing, unchanged']])];
  const rcdProps = [{ k: 'mA', l: 'Trip current (mA)', d: '30' }, sel('rcdType', 'RCD type', 'A', ['AC', 'A', 'F', 'B'])];

  def('supply_cutout', {
    name: 'Supply (cut-out and meter)', cat: HOUSE, prefix: 'SUP', w: 80, h: 40,
    props: [{ k: 'fuse', l: 'Supply fuse (A)', d: '100' }, sel('earthing', 'Earthing', 'TN-C-S', [['TN-C-S', 'TN-C-S (PME), most UK homes'], ['TN-S', 'TN-S (cable sheath earth)'], ['TT', 'TT (own earth rod)']]), { k: 'ze', l: 'Ze (Ω), blank for typical', d: '' }, { k: 'pscc', l: 'Prospective fault current (kA)', d: '16' }, { k: 'ra', l: 'Earth rod resistance RA (Ω, TT only)', d: '' }, sel('supplyType', 'Supply', 'public', [['public', 'Public supply'], ['private', 'Private (own transformer or generator)']]), sel('phases', 'Phases', '1', [['1', 'Single phase'], ['3', 'Three phase']])],
    sub: '{fuse}A {earthing}', pins: [pin('out', 80, 20, 'Supply out')], mains: true,
    shapes: [R(0, 0, 80, 40, { rx: 2 }), T(40, 16, 'SUPPLY', { size: 8, weight: 700 }), T(40, 31, 'kWh', { size: 8 })],
  });
  def('main_switch', {
    name: 'Main switch (consumer unit)', cat: HOUSE, prefix: 'Q', w: 60, h: 40,
    props: [{ k: 'rating', l: 'Rating (A)', d: '100' }, sel('cu', 'Consumer unit case', 'metal', [['metal', 'Metal (non-combustible)'], ['plastic', 'Plastic']]), sel('existing', 'Consumer unit', 'new', [['new', 'New or replaced'], ['existing', 'Existing, unchanged']])],
    sub: '{rating}A', pins: io(), mains: true,
    shapes: [L(0, 20, 18, 20), DOT(18, 20), L(18, 20, 40, 9, { w: 2 }), C(42, 20, 2.5), L(45, 20, 60, 20), L(29, 4, 29, 13, { w: 1, dash: '2 2' }), L(24, 4, 34, 4, { w: 1.5 })],
  });
  def('mcb', { name: 'MCB (circuit breaker)', cat: HOUSE, prefix: 'CB', w: 60, h: 40, props: curveProps.slice(), sub: '{circuit}', pins: io(), mains: true, shapes: [...leads(), ...box(60, '{curve}{rating}')] });
  def('rcbo', {
    name: 'RCBO (breaker with RCD)', cat: HOUSE, prefix: 'CB', w: 60, h: 40, props: curveProps.concat(rcdProps), sub: '{mA}mA {rcdType} · {circuit}', pins: io(), mains: true,
    shapes: [...leads(), R(10, 6, 40, 28, { rx: 2 }), T(30, 21, '{curve}{rating}', { size: 9, weight: 600 }), T(30, 31, 'RCBO', { size: 6 })],
  });
  def('rcd', {
    name: 'RCD (residual current device)', cat: HOUSE, prefix: 'RCD', w: 60, h: 40, props: [{ k: 'rating', l: 'Rating (A)', d: '63' }].concat(rcdProps), sub: '{rating}A {mA}mA Type {rcdType}', pins: io(), mains: true,
    shapes: [...leads(), R(10, 6, 40, 28, { rx: 2 }), T(30, 19, 'RCD', { size: 8, weight: 700 }), T(30, 30, '{mA}mA', { size: 7 })],
  });
  def('spd', {
    name: 'Surge protection device (SPD)', cat: HOUSE, prefix: 'SPD', w: 40, h: 60, props: [sel('spdType', 'Type', '2', [['1', 'Type 1'], ['2', 'Type 2'], ['1+2', 'Type 1+2']])], sub: 'Type {spdType}', pins: [pin('L', 0, 20, 'Line')], mains: true,
    shapes: [L(0, 20, 12, 20), R(12, 8, 18, 30), P('M24 12 l-5 9 h6 l-5 9', { w: 1.4 }), L(21, 38, 21, 46), L(13, 46, 29, 46), L(16, 50, 26, 50), L(19, 54, 23, 54)],
  });
  def('socket', {
    name: 'Socket outlet (13 A)', cat: HOUSE, prefix: 'SO', w: 60, h: 40,
    props: [sel('kind', 'Kind', 'twin', [['twin', 'Twin'], ['single', 'Single']]), sel('outdoor', 'Outdoors', 'no', [['no', 'No'], ['yes', 'Yes']]), sel('zone', 'Bathroom', '', ZONES), { k: 'ip', l: 'IP rating', d: '' }],
    sub: '{kind}', pins: io(), mains: true,
    shapes: [L(0, 20, 60, 20, { w: 1.2 }), L(30, 20, 30, 26), P('M18 26 A12 12 0 0 0 42 26 Z', { fill: 'paper', w: 1.6 }), L(24, 30, 24, 34, { w: 1.4 }), L(36, 30, 36, 34, { w: 1.4 })],
  });
  def('fcu', { name: 'Fused connection unit (fused spur)', cat: HOUSE, prefix: 'FCU', w: 60, h: 40, props: [{ k: 'fuse', l: 'Fuse (A)', d: '13' }, sel('switched', 'Switched', 'yes', [['yes', 'Yes'], ['no', 'No']]), sel('zone', 'Bathroom', '', ZONES)], sub: '{fuse}A', pins: io(), mains: true, shapes: [...leads(60, 16, 44), R(16, 13, 28, 14), L(16, 20, 44, 20, { w: 1 })] });
  def('light', {
    name: 'Light (luminaire)', cat: HOUSE, prefix: 'LT', w: 40, h: 40,
    props: [{ k: 'watts', l: 'Watts (each)', d: '10' }, { k: 'count', l: 'How many', d: '1' }, sel('zone', 'Bathroom', '', ZONES), { k: 'ip', l: 'IP rating', d: '' }],
    sub: '{count}× {watts}W', pins: io(40), mains: true,
    shapes: [L(0, 20, 10, 20), L(30, 20, 40, 20), C(20, 20, 10), L(13, 13, 27, 27), L(27, 13, 13, 27)],
  });
  def('switch_light', {
    name: 'Light switch', cat: HOUSE, prefix: 'SW', w: 40, h: 40, props: [sel('ways', 'Kind', '1-way', ['1-way', '2-way', 'Intermediate', 'Pull cord', 'Dimmer'])], sub: '{ways}', pins: io(40), mains: true,
    shapes: [L(0, 20, 16, 20), L(24, 20, 40, 20), C(20, 20, 4, { fill: 'ink' }), L(22, 17, 31, 6, { w: 1.6 }), L(31, 6, 35, 9, { w: 1.6 })],
  });
  def('smoke_alarm', { name: 'Smoke or heat alarm (mains)', cat: HOUSE, prefix: 'SA', w: 40, h: 40, props: [sel('kind', 'Kind', 'smoke', ['smoke', 'heat', 'CO'])], sub: '{kind}', pins: io(40), mains: true, shapes: [L(0, 20, 10, 20), L(30, 20, 40, 20), C(20, 20, 10), T(20, 23, 'SA', { size: 7, weight: 700 })] });
  def('jbox', { name: 'Junction box', cat: HOUSE, prefix: 'JB', w: 40, h: 40, pins: [pin('a', 0, 20), pin('b', 40, 20), pin('c', 20, 40)], mains: true, shapes: [L(0, 20, 12, 20), L(28, 20, 40, 20), L(20, 28, 20, 40), C(20, 20, 8), DOT(20, 20, 2)] });
  const fixedLoad = (id, name, text, props, sub, extra = {}) => def(id, { name, cat: HOUSE, prefix: 'FL', w: 80, h: 40, props, sub, pins: [pin('in', 0, 20, 'Supply in')], mains: true, shapes: [L(0, 20, 10, 20), R(10, 4, 66, 32, { rx: 3 }), T(43, 24, text, { size: 8, weight: 700 })], ...extra });
  fixedLoad('cooker', 'Cooker (cooker control unit)', 'COOKER', [{ k: 'kw', l: 'Total rating (kW)', d: '10' }, sel('socket', 'Socket on the control unit', 'no', [['no', 'No'], ['yes', 'Yes']])], '{kw} kW');
  fixedLoad('shower', 'Electric shower', 'SHOWER', [{ k: 'kw', l: 'Rating (kW)', d: '9.5' }, sel('ratedV', 'Rated at', '230', [['230', '230 V'], ['240', '240 V']]), sel('zone', 'Bathroom', '1', ZONES), { k: 'ip', l: 'IP rating', d: 'IPX4' }], '{kw} kW');
  fixedLoad('immersion', 'Immersion heater', 'IMMERSION', [{ k: 'kw', l: 'Rating (kW)', d: '3' }], '{kw} kW');
  fixedLoad('ev_charger', 'EV charge point', 'EV', [{ k: 'kw', l: 'Rating (kW)', d: '7.4' }, sel('rdcdd', 'DC fault protection built in (RDC-DD)', 'yes', [['yes', 'Yes'], ['no', 'No or not known']])], '{kw} kW');
  fixedLoad('appliance', 'Appliance (loads library)', 'APPLIANCE', [sel('kind', 'Appliance', 'Kettle', APPLIANCES.map((a) => a.name)), { k: 'kw', l: 'Rating (kW), blank for typical', d: '' }, sel('plug', 'Connection', 'plug', [['plug', '13 A plug'], ['fixed', 'Fixed wiring']]), sel('zone', 'Bathroom', '', ZONES), { k: 'ip', l: 'IP rating', d: '' }], '{kind}', { cat: LOADS, prefix: 'AP' });
  def('pv_array', {
    name: 'Solar PV array (strings)', cat: LOADS, prefix: 'PV', w: 80, h: 60,
    props: [{ k: 'strings', l: 'Strings in parallel', d: '1' }, { k: 'modules', l: 'Modules per string', d: '10' }, { k: 'isc', l: 'Module Isc (A)', d: '13.9' }, { k: 'voc', l: 'Module Voc (V)', d: '49.5' }, { k: 'maxfuse', l: 'Module maximum series fuse (A)', d: '25' }, { k: 'wp', l: 'Module rating (W)', d: '430' }],
    sub: '{strings}× {modules} modules', pins: [pin('+', 80, 20, 'DC +'), pin('-', 80, 40, 'DC −')], mains: true,
    shapes: [R(4, 6, 60, 48), L(24, 6, 24, 54, { w: 1 }), L(44, 6, 44, 54, { w: 1 }), L(4, 30, 64, 30, { w: 1 }), L(64, 20, 80, 20), L(64, 40, 80, 40), T(72, 16, '+', { size: 8 }), T(72, 52, '−', { size: 8 })],
  });
  def('pv_inverter', {
    name: 'Solar inverter (grid-tied)', cat: LOADS, prefix: 'INV', w: 80, h: 60,
    props: [{ k: 'kw', l: 'AC rating (kW)', d: '3.68' }, sel('phases', 'Phases', '1', [['1', 'Single phase'], ['3', 'Three phase']]), sel('dciso', 'DC isolator fitted', 'yes', [['yes', 'Yes'], ['no', 'No']])],
    sub: '{kw} kW', pins: [pin('DC+', 0, 20, 'DC +'), pin('DC-', 0, 40, 'DC −'), pin('AC', 80, 30, 'AC out')], mains: true,
    shapes: [R(10, 4, 60, 52, { rx: 2 }), L(10, 56, 70, 4, { w: 1 }), T(26, 24, '=', { size: 14 }), T(54, 46, '~', { size: 14 }), L(0, 20, 10, 20), L(0, 40, 10, 40), L(70, 30, 80, 30)],
  });
  def('home_battery', {
    name: 'Home battery (storage)', cat: LOADS, prefix: 'BESS', w: 80, h: 40,
    props: [{ k: 'kw', l: 'Inverter rating (kW)', d: '3' }, { k: 'kwh', l: 'Capacity (kWh)', d: '5' }, sel('where', 'Location', '', [['', 'Not set'], ['garage', 'Garage'], ['utility', 'Utility room'], ['outside', 'Outside wall'], ['living', 'Living space'], ['loft', 'Loft'], ['understairs', 'Under the stairs']])],
    sub: '{kwh} kWh {kw} kW', pins: [pin('AC', 0, 20, 'AC')], mains: true,
    shapes: [L(0, 20, 10, 20), R(10, 4, 66, 32, { rx: 3 }), L(26, 12, 26, 28, { w: 2 }), L(32, 16, 32, 24, { w: 3 }), T(56, 24, 'kWh', { size: 8, weight: 700 })],
  });
  def('bonding', {
    name: 'Main bonding (gas, water, oil)', cat: HOUSE, prefix: 'MB', w: 40, h: 40, props: [sel('service', 'Bonded to', 'Gas', ['Gas', 'Water', 'Oil', 'Structural steel', 'Other']), { k: 'size', l: 'Conductor (mm²)', d: '10' }],
    sub: '{service} {size}mm²', pins: [pin('E', 0, 20, 'Earth')], mains: true,
    shapes: [L(0, 20, 20, 20), L(20, 20, 20, 26), L(10, 26, 30, 26), L(13, 30, 27, 30), L(16, 34, 24, 34), C(30, 12, 6), L(30, 18, 30, 20)],
  });

  /* ---------------- Workshop and factory parts ---------------- */
  def('machine', {
    name: 'Machine (loads library)', cat: LOADS, prefix: 'MC', w: 80, h: 40,
    props: [sel('kind', 'Machine', 'Pillar drill', MACHINES.map((m) => m.name)), { k: 'kw', l: 'Motor (kW), blank for typical', d: '' }, { k: 'amps', l: 'Current (A), from the rating plate', d: '' }, sel('supply', 'Connection', '13 A plug', ['13 A plug', '16 A socket', '32 A socket', 'Fixed']), sel('phases', 'Phases', '1', [['1', 'Single phase'], ['3', 'Three phase']]), sel('start', 'Starting', 'DOL', Object.keys(STARTING).concat(['Electronic']))],
    sub: '{kind}', pins: [pin('in', 0, 20, 'Supply in')], mains: true,
    shapes: [L(0, 20, 10, 20), R(10, 4, 66, 32, { rx: 3 }), C(28, 20, 9), T(28, 23, 'M', { size: 8, weight: 700 }), T(56, 24, '{phases}~', { size: 8 })],
  });
  const poles3 = (w, draw) => {
    const shapes = [], pins = [];
    [['L1', 'T1', 10], ['L2', 'T2', 30], ['L3', 'T3', 50]].forEach(([a, b, y]) => { pins.push(pin(a, 0, y, a), pin(b, w, y, b)); shapes.push(...draw(y)); });
    return { shapes, pins };
  };
  const swPole = (y, w = 60) => [L(0, y, 18, y), DOT(18, y), L(18, y, 40, y - 8, { w: 2 }), C(42, y, 2.5), L(45, y, w, y)];
  const iso = poles3(60, (y) => swPole(y));
  def('isolator3', { name: 'Isolator, three-pole', cat: FACTORY, prefix: 'Q', w: 60, h: 60, props: [{ k: 'rating', l: 'Rating (A)', d: '63' }], sub: '{rating}A', pins: iso.pins, shapes: [...iso.shapes, L(29, 2, 29, 44, { w: 1, dash: '3 3' })], factory: true });
  const mcb3 = poles3(60, (y) => [...swPole(y), P(`M24 ${y - 6} q6 -8 12 0`, { w: 1 })]);
  def('mcb3', { name: 'Circuit breaker, three-pole', cat: FACTORY, prefix: 'Q', w: 60, h: 60, props: [sel('curve', 'Type (curve)', 'C', ['B', 'C', 'D']), { k: 'rating', l: 'Rating (A)', d: '16' }], sub: '{curve}{rating}', pins: mcb3.pins, shapes: [...mcb3.shapes, L(29, 2, 29, 44, { w: 1, dash: '3 3' })], factory: true });
  const mp = poles3(60, (y) => [...swPole(y), R(48, y - 4, 6, 8, { sw: 1 })]);
  def('mpcb', { name: 'Motor circuit breaker (MPCB)', cat: FACTORY, prefix: 'Q', w: 60, h: 60, props: [{ k: 'range', l: 'Adjustment range (A)', d: '4–6.3' }, { k: 'setting', l: 'Set to (A)', d: '' }], sub: '{range}A set {setting}', pins: mp.pins, shapes: [...mp.shapes, L(29, 2, 29, 44, { w: 1, dash: '3 3' })], factory: true });
  def('contactor', {
    name: 'Contactor', cat: FACTORY, prefix: 'K', w: 80, h: 100, xrefGroup: 'coil', coil: true, factory: true,
    props: [{ k: 'ac3', l: 'AC-3 rating (A)', d: '9' }, sel('coilV', 'Coil', '24V DC', ['24V DC', '24V AC', '110V AC', '230V AC'])], sub: 'AC-3 {ac3}A · {coilV}',
    pins: [pin('L1', 0, 10), pin('L2', 0, 30), pin('L3', 0, 50), pin('T1', 80, 10), pin('T2', 80, 30), pin('T3', 80, 50), pin('A1', 0, 70, 'A1 coil'), pin('A2', 80, 70, 'A2 coil'), pin('13', 0, 90, '13 auxiliary (NO)'), pin('14', 80, 90, '14 auxiliary (NO)')],
    shapes: [...[10, 30, 50].flatMap((y) => [L(0, y, 28, y), DOT(28, y, 2), L(28, y, 48, y - 8, { w: 2 }), L(52, y, 80, y)]), R(30, 62, 20, 16, { sw: 1.6 }), L(0, 70, 30, 70), L(50, 70, 80, 70), L(0, 90, 30, 90), L(30, 90, 46, 84, { w: 1.6 }), L(50, 90, 80, 90), L(39, 4, 39, 62, { w: 1, dash: '3 3' }), L(39, 78, 39, 86, { w: 1, dash: '3 3' })],
  });
  def('aux_contact', {
    name: 'Contact of a contactor or relay', cat: FACTORY, prefix: 'K', xrefGroup: 'coil', factory: true,
    props: [sel('kind', 'Contact', 'NO', [['NO', 'Normally open'], ['NC', 'Normally closed']]), { k: 'pins', l: 'Terminal numbers', d: '13-14' }],
    gen(p) {
      const [a, b] = String(p.pins || '13-14').split(/[-/ ]+/);
      const shapes = [L(0, 10, 20, 10), L(40, 10, 60, 10), p.kind === 'NC' ? L(20, 10, 42, 2, { w: 1.8 }) : L(20, 10, 38, 2, { w: 1.8 })];
      if (p.kind === 'NC') shapes.push(L(40, 2, 40, 10, { w: 1.4 }));
      shapes.push(T(8, 6, a || '1', { size: 6 }), T(52, 6, b || '2', { size: 6 }));
      return { w: 60, h: 20, pins: [pin('1', 0, 10, a || '1'), pin('2', 60, 10, b || '2')], shapes };
    },
  });
  const ol = poles3(80, (y) => [L(0, y, 28, y), R(28, y - 5, 22, 10, { sw: 1.2 }), P(`M31 ${y} h4 v-3 h5 v6 h5 v-3 h3`, { w: 1 }), L(50, y, 80, y)]);
  def('overload', {
    name: 'Overload relay (thermal)', cat: FACTORY, prefix: 'F', w: 80, h: 80, factory: true, props: [{ k: 'range', l: 'Adjustment range (A)', d: '4–6' }, { k: 'setting', l: 'Set to (A)', d: '' }], sub: '{range}A set {setting}',
    pins: ol.pins.concat([pin('95', 0, 70, '95 trip contact (NC)'), pin('96', 80, 70, '96 trip contact (NC)')]),
    shapes: [...ol.shapes, L(0, 70, 30, 70), L(30, 70, 52, 62, { w: 1.6 }), L(50, 62, 50, 70, { w: 1.4 }), L(50, 70, 80, 70), L(39, 15, 39, 62, { w: 1, dash: '3 3' })],
  });
  def('motor3', {
    name: 'Motor, three-phase', cat: FACTORY, prefix: 'M', w: 80, h: 80, factory: true,
    props: [{ k: 'kw', l: 'Power (kW)', d: '1.5' }, { k: 'flc', l: 'Full-load current (A), blank to estimate', d: '' }, sel('start', 'Starting', 'DOL', Object.keys(STARTING)), sel('duty', 'Duty', 'normal', [['normal', 'Normal (start and stop)'], ['inching', 'Inching or plugging']])],
    sub: '{kw} kW {start}', pins: [pin('U', 0, 10, 'U1'), pin('V', 0, 30, 'V1'), pin('W', 0, 50, 'W1'), pin('PE', 0, 70, 'PE')],
    shapes: [L(0, 10, 34, 10), L(34, 10, 40, 20), L(0, 30, 28, 30), L(0, 50, 34, 50), L(34, 50, 40, 40), L(0, 70, 52, 70), L(52, 70, 52, 62), C(52, 38, 24), T(52, 37, 'M', { size: 13, weight: 700 }), T(52, 51, '3~', { size: 8 })],
  });
  const btn = (id, name, kind, colour, pins, props) => def(id, {
    name, cat: FACTORY, prefix: 'S', factory: true, props: [sel('colour', 'Button colour', colour, ['red', 'green', 'white', 'grey', 'black', 'yellow', 'blue']), ...(props || [])],
    gen(p) {
      const hex = { red: '#c62828', green: '#2e7d32', white: '#ffffff', grey: '#9e9e9e', black: '#222222', yellow: '#f2c500', blue: '#1565c0' }[p.colour] || '#ffffff';
      const shapes = [L(0, 30, 20, 30), L(40, 30, 60, 30), kind === 'NC' ? L(20, 30, 42, 22, { w: 1.8 }) : L(20, 30, 38, 22, { w: 1.8 }), L(30, 8, 30, 25, { w: 1, dash: '2 2' }), L(22, 8, 38, 8, { w: 2 }), L(22, 8, 22, 12, { w: 2 }), L(38, 8, 38, 12, { w: 2 }), C(48, 8, 4, { fill: hex, w: 1 })];
      if (kind === 'NC') shapes.push(L(40, 22, 40, 30, { w: 1.4 }));
      return { w: 60, h: 40, pins: [pin(pins[0], 0, 30), pin(pins[1], 60, 30)], shapes };
    },
  });
  btn('pb_start', 'Push button, start (NO)', 'NO', 'green', ['13', '14']);
  btn('pb_stop', 'Push button, stop (NC)', 'NC', 'red', ['11', '12']);
  def('estop', {
    name: 'Emergency stop', cat: FACTORY, prefix: 'S', w: 60, h: 40, factory: true, props: [sel('category', 'Stop category', '0', [['0', '0: power removed at once'], ['1', '1: controlled stop, then power removed'], ['2', '2: controlled stop, power left on']])], sub: 'Cat {category}',
    pins: [pin('11', 0, 30), pin('12', 60, 30)],
    shapes: [L(0, 30, 20, 30), L(40, 30, 60, 30), L(20, 30, 42, 22, { w: 1.8 }), L(40, 22, 40, 30, { w: 1.4 }), L(30, 14, 30, 25, { w: 1, dash: '2 2' }), R(14, 0, 32, 14, { fill: '#f2c500', sw: 1 }), P('M19 12 A11 9 0 0 1 41 12 Z', { fill: '#c62828', w: 1 })],
  });
  def('pilot', {
    name: 'Indicator lamp', cat: FACTORY, prefix: 'H', factory: true, props: [sel('colour', 'Colour', 'green', ['green', 'red', 'yellow', 'white', 'blue'])], sub: '{colour}',
    gen(p) { const hex = { red: '#e53935', green: '#43a047', white: '#ffffff', yellow: '#fdd835', blue: '#1e88e5' }[p.colour] || '#ffffff'; return { w: 40, h: 40, pins: [pin('X1', 0, 20), pin('X2', 40, 20)], shapes: [L(0, 20, 10, 20), L(30, 20, 40, 20), C(20, 20, 10, { fill: hex }), L(13, 13, 27, 27), L(27, 13, 13, 27)] }; },
  });
  def('ctrl_tx', {
    name: 'Control transformer', cat: FACTORY, prefix: 'T', w: 80, h: 60, factory: true, props: [{ k: 'primary', l: 'Primary (V)', d: '400' }, { k: 'secondary', l: 'Secondary (V AC)', d: '24' }, { k: 'va', l: 'Rating (VA)', d: '100' }], sub: '{primary}/{secondary}V {va}VA',
    pins: [pin('H1', 0, 10, 'Primary 1'), pin('H2', 0, 50, 'Primary 2'), pin('X1', 80, 10, 'Secondary 1'), pin('X2', 80, 50, 'Secondary 2')],
    shapes: [L(0, 10, 30, 10), L(30, 10, 30, 16), L(0, 50, 30, 50), L(30, 50, 30, 44), C(32, 30, 14), C(48, 30, 14), L(50, 10, 80, 10), L(50, 10, 50, 16), L(50, 50, 80, 50), L(50, 50, 50, 44)],
  });
  def('psu24', {
    name: 'Power supply, 24 V DC', cat: FACTORY, prefix: 'G', w: 80, h: 60, factory: true, props: [{ k: 'volts', l: 'Output (V DC)', d: '24' }, { k: 'amps', l: 'Output (A)', d: '5' }], sub: '{volts}V {amps}A',
    pins: [pin('L', 0, 10, 'L'), pin('N', 0, 30, 'N'), pin('PE', 0, 50, 'PE'), pin('+', 80, 10, '+V'), pin('-', 80, 30, '0V')],
    shapes: [R(10, 0, 60, 60, { rx: 2 }), L(10, 60, 70, 0, { w: 1 }), T(26, 22, '~', { size: 13 }), T(54, 48, '=', { size: 13 }), L(0, 10, 10, 10), L(0, 30, 10, 30), L(0, 50, 10, 50), L(70, 10, 80, 10), L(70, 30, 80, 30)],
  });
  const plc = (id, name, dir, prefix) => def(id, {
    name, cat: FACTORY, prefix: 'PLC', factory: true, props: [{ k: 'channels', l: 'Channels', d: 8, type: 'int', min: 1, max: 32 }, { k: 'address', l: 'Address prefix', d: prefix }, { k: 'text', l: 'Text inside', d: dir === 'in' ? 'INPUTS' : 'OUTPUTS' }],
    gen(p) {
      const n = Math.max(1, Math.min(32, p.channels | 0)), h = n * 20 + 40, shapes = [R(dir === 'in' ? 20 : 0, 0, 80, h, { rx: 2 }), T(dir === 'in' ? 60 : 40, 14, p.text || '', { size: 8, weight: 700 })], pins = [];
      for (let i = 0; i < n; i++) {
        const y = 30 + i * 20, a = `${p.address || prefix}${i}`;
        if (dir === 'in') { shapes.push(L(0, y, 20, y), T(24, y + 3, a, { size: 7, anchor: 'start' })); pins.push(pin(a, 0, y, a)); }
        else { shapes.push(L(80, y, 100, y), T(76, y + 3, a, { size: 7, anchor: 'end' })); pins.push(pin(a, 100, y, a)); }
      }
      const yc = h - 10;
      if (dir === 'in') { shapes.push(L(100, yc, 120, yc), T(96, yc + 3, 'COM', { size: 7, anchor: 'end' })); pins.push(pin('COM', 120, yc, 'Common')); }
      else { shapes.push(L(0, yc, 0, yc), T(4, yc + 3, 'COM', { size: 7, anchor: 'start' })); pins.push(pin('COM', 0, yc, 'Common')); }
      return { w: dir === 'in' ? 120 : 100, h, pins, shapes };
    },
  });
  plc('plc_in', 'PLC digital inputs', 'in', 'I0.');
  plc('plc_out', 'PLC digital outputs', 'out', 'Q0.');
  def('vfd', {
    name: 'Variable speed drive (VFD)', cat: FACTORY, prefix: 'U', w: 100, h: 80, factory: true, props: [{ k: 'kw', l: 'Rating (kW)', d: '2.2' }, sel('input', 'Supply', '3', [['1', 'Single phase'], ['3', 'Three phase']])], sub: '{kw} kW',
    pins: [pin('L1', 0, 10), pin('L2', 0, 30), pin('L3', 0, 50), pin('PE', 0, 70), pin('U', 100, 10), pin('V', 100, 30), pin('W', 100, 50), pin('DI', 100, 70, 'Run input')],
    shapes: [R(14, 0, 72, 80, { rx: 2 }), ...[10, 30, 50, 70].flatMap((y) => [L(0, y, 14, y), L(86, y, 100, y)]), T(50, 34, 'VFD', { size: 10, weight: 700 }), T(50, 50, '~ / ~', { size: 8 })],
  });
  def('safety_relay', {
    name: 'Safety relay', cat: FACTORY, prefix: 'K', w: 100, h: 100, factory: true, props: [{ k: 'text', l: 'Text inside', d: 'SAFETY' }],
    pins: [['A1', 10], ['S11', 30], ['S12', 50], ['S21', 70], ['S22', 90]].map(([n, y]) => pin(n, 0, y)).concat([['A2', 10], ['13', 30], ['14', 50], ['23', 70], ['24', 90]].map(([n, y]) => pin(n, 100, y))),
    shapes: [R(16, 0, 68, 100, { rx: 2 }), T(50, 54, '{text}', { size: 9, weight: 700 }), ...[10, 30, 50, 70, 90].flatMap((y) => [L(0, y, 16, y), L(84, y, 100, y)]), ...['A1', 'S11', 'S12', 'S21', 'S22'].map((n, i) => T(20, 13 + i * 20, n, { size: 6, anchor: 'start' })), ...['A2', '13', '14', '23', '24'].map((n, i) => T(80, 13 + i * 20, n, { size: 6, anchor: 'end' }))],
  });

  /* ---------------- How the new parts behave in nets, trace and the live test ---------------- */
  const PASS = ['socket', 'light', 'switch_light', 'smoke_alarm', 'jbox'];
  const DEVICES = ['mcb', 'rcbo', 'rcd', 'main_switch', 'fcu'];
  const baseBehaviour = Loom.behaviour;
  Loom.behaviour = function (doc, p) {
    const d = Loom.partDef(doc, p.type) || {};
    if (!d.mains && !d.factory) return baseBehaviour(doc, p);
    const r = Loom.resolved(doc, p), ids = r.pins.map((x) => x.id), pr = r.props || {};
    const B = { links: [], switched: null, kind: 'mains', states: null };
    if (PASS.includes(p.type)) { B.links = ids.slice(1).map((x) => [ids[0], x]); return B; }
    if (DEVICES.includes(p.type)) { B.kind = 'switch'; B.states = ['On', 'Off or tripped']; B.switched = (s) => (s ? [] : [['in', 'out']]); return B; }
    if (['isolator3', 'mcb3', 'mpcb'].includes(p.type)) { B.kind = 'switch'; B.states = ['On', 'Off']; B.switched = (s) => (s ? [] : [['L1', 'T1'], ['L2', 'T2'], ['L3', 'T3']]); return B; }
    if (p.type === 'contactor') { B.kind = 'relay'; B.coil = ['A1', 'A2']; B.contacts = (on) => (on ? [['L1', 'T1'], ['L2', 'T2'], ['L3', 'T3'], ['13', '14']] : []); B.rating = parseFloat(pr.ac3) || 9; return B; }
    if (p.type === 'aux_contact') { B.kind = 'switch'; B.states = ['Coil off', 'Coil on']; B.switched = (s) => ((pr.kind === 'NC') === !s ? [['1', '2']] : []); if (p.label) B.follows = 'contactor|' + p.label; return B; }
    if (p.type === 'psu24') { B.kind = 'source'; B.source = '+'; B.ret = '-'; B.earthPins = ['-']; return B; }
    if (p.type === 'ctrl_tx') { B.kind = 'source'; B.source = 'X1'; B.ret = 'X2'; B.earthPins = ['X2']; return B; }
    if (p.type === 'overload') { B.links = [['L1', 'T1'], ['L2', 'T2'], ['L3', 'T3']]; B.kind = 'switch'; B.states = ['Not tripped', 'Tripped']; B.switched = (s) => (s ? [] : [['95', '96']]); return B; }
    if (p.type === 'pb_start') { B.kind = 'switch'; B.states = ['Released', 'Pressed']; B.switched = (s) => (s ? [['13', '14']] : []); return B; }
    if (p.type === 'pb_stop' || p.type === 'estop') { B.kind = 'switch'; B.states = ['Released', 'Pressed']; B.switched = (s) => (s ? [] : [['11', '12']]); return B; }
    return B;
  };

  /* ---------------- Reading the drawing: cables and circuits ---------------- */
  const view = (project) => Loom.views(project);
  function graph(project) {
    const uf = new Map(), find = (a) => { while (uf.has(a) && uf.get(a) !== a) a = uf.get(a); return a; }, union = (a, b) => { a = find(a); b = find(b); if (a !== b) uf.set(a, b); };
    const K = (s, part, pin_) => `${s}|${part}|${pin_}`, parts = [], devices = [], cables = [];
    view(project).forEach((v) => {
      v.parts.forEach((p) => {
        const d = Loom.partDef(v, p.type) || {}, r = Loom.resolved(v, p), ids = r.pins.map((x) => x.id);
        ids.forEach((id) => { if (!uf.has(K(v.sheet.id, p.id, id))) uf.set(K(v.sheet.id, p.id, id), K(v.sheet.id, p.id, id)); });
        const it = { v, p, d, props: r.props || {}, pins: ids, k: (id) => K(v.sheet.id, p.id, id) };
        parts.push(it);
        if (PASS.includes(p.type) || ['busbar', 'terminal_block', 'connector', 'splice'].includes(p.type)) {
          const b = Loom.behaviour(v, p);
          if (PASS.includes(p.type) || p.type === 'splice') ids.slice(1).forEach((x) => union(it.k(ids[0]), it.k(x)));
          else b.links.forEach(([a, c]) => union(it.k(a), it.k(c)));
        }
        if ((p.type === 'net_label' && p.props.text) || (p.type === 'offpage' && p.props.link)) { const n = 'NET:' + String(p.type === 'net_label' ? p.props.text : p.props.link).trim().toUpperCase(); union(it.k('L'), n); union(it.k('R'), n); }
        if (DEVICES.includes(p.type)) devices.push(it);
      });
      v.wires.forEach((w) => cables.push({ w, v, a: K(v.sheet.id, w.from.part, w.from.pin), b: K(v.sheet.id, w.to.part, w.to.pin) }));
    });
    cables.forEach((c) => { c.a = find(c.a); c.b = find(c.b); });
    parts.forEach((it) => { it.nodes = it.pins.map((id) => find(it.k(id))); it.node = (id) => find(it.k(id)); });
    return { parts, devices, cables, find };
  }
  const len = (w) => { const l = parseFloat(w.length); return l > 0 ? l : null; };
  const refOf = (it) => it.p.label || (it.d.name || it.p.type);

  /* Bridges (edges that are not on any loop) in the cable graph, by Tarjan's method. */
  function bridges(nodes, edges) {
    const adj = new Map(); nodes.forEach((n) => adj.set(n, []));
    edges.forEach((e, i) => { adj.get(e.a).push([e.b, i]); adj.get(e.b).push([e.a, i]); });
    const disc = new Map(), low = new Map(), out = new Set(); let t = 0;
    const dfs = (u, pe) => {
      disc.set(u, ++t); low.set(u, t);
      adj.get(u).forEach(([v, i]) => {
        if (i === pe) return;
        if (!disc.has(v)) { dfs(v, i); low.set(u, Math.min(low.get(u), low.get(v))); if (low.get(v) > disc.get(u)) out.add(i); }
        else low.set(u, Math.min(low.get(u), disc.get(v)));
      });
    };
    nodes.forEach((n) => { if (!disc.has(n)) dfs(n, -1); });
    return out;
  }

  /* Supply settings: from the supply part on the drawing, else the project settings, else typical UK values. */
  function supplyOf(project, g) {
    const sp = g.parts.find((x) => x.p.type === 'supply_cutout'), pr = sp ? sp.props : {}, st = (project.settings && project.settings.mains) || {};
    const earthing = pr.earthing || st.earthing || 'TN-C-S', zeIn = parseFloat(pr.ze != null && pr.ze !== '' ? pr.ze : st.ze);
    return { part: sp, earthing, ze: zeIn > 0 ? zeIn : ZE_DEFAULT[earthing], zeTypical: !(zeIn > 0), fuse: parseFloat(pr.fuse || st.fuse) || 100, pscc: parseFloat(pr.pscc || st.pscc) || 16, ra: parseFloat(pr.ra) || null, private: (pr.supplyType || st.supplyType) === 'private', phases: String(pr.phases || '1') };
  }
  const BUILDINGS = [['dwelling', 'Home (house or flat)'], ['hmo', 'House in multiple occupation'], ['hrrb', 'Flat in a high-rise residential building'], ['student', 'Purpose-built student accommodation'], ['care', 'Care home'], ['commercial', 'Commercial or industrial']];
  const COUNTRIES = [['england', 'England'], ['wales', 'Wales'], ['scotland', 'Scotland'], ['ni', 'Northern Ireland']];
  const settingsOf = (project) => ({ building: 'dwelling', country: 'england', ambient: 30, method: 'C', ...((project.settings && project.settings.mains) || {}) });

  /* What a load draws, in amps at 230 V (or per phase at 400 V). */
  function loadAmps(it) {
    const pr = it.props, t = it.p.type, kw = parseFloat(pr.kw);
    if (t === 'light') return ((parseFloat(pr.watts) || 0) * (parseFloat(pr.count) || 1)) / U0;
    if (t === 'shower') { const p_ = (kw || 0) * 1000 * (pr.ratedV === '240' ? (230 / 240) ** 2 : 1); return p_ / U0; }
    if (t === 'immersion' || t === 'ev_charger' || t === 'pv_inverter' || t === 'home_battery') return ((kw || 0) * 1000) / (U0 * (String(pr.phases) === '3' ? 3 : 1));
    if (t === 'cooker') { const i = ((kw || 0) * 1000) / U0; return i <= 10 ? i : 10 + 0.3 * (i - 10) + (pr.socket === 'yes' ? 5 : 0); }
    if (t === 'appliance') { const a = byName(APPLIANCES, pr.kind) || {}; if (a.amps && !kw) return a.amps; const k = kw || a.kw || 0; return (k * 1000) / (U0 * (a.pf || 1)); }
    if (t === 'machine') {
      const m = byName(MACHINES, pr.kind) || {}, amps = parseFloat(pr.amps) || (!kw && m.amps) || 0;
      if (amps) return amps;
      return motorFLC(kw || m.kw, pr.phases || m.phases || 1);
    }
    return 0;
  }
  /* One cable's current rating where it is installed: table value times the derating factors. */
  function rateCable(w, set) {
    set = set || settingsOf({});
    const size = norm(w.gauge), method = String(w.method || set.method || 'C'), tbl = TE_RATING[method] || TE_RATING.C;
    const ca = interp(CA, parseFloat(w.ambient) || parseFloat(set.ambient) || 30), n = Math.max(1, parseInt(w.grouped, 10) || 1), cg = (CG[w.groupKind === 'clipped' ? 'clipped' : 'bunched'][Math.min(n, 6) - 1]), ci = w.insul === 'surrounded' && (len(w) || 1) > 0.5 ? 0.5 : (CI[w.insul || ''] || 1);
    return { size, cpc: norm(w.cpc) || TE_CPC[size] || '', method, it: tbl[size] || null, ca: r2(ca), cg, ci, iz: tbl[size] ? r1(tbl[size] * ca * cg * ci) : null, length: len(w) };
  }
  const isSocket = (it) => it.p.type === 'socket';
  const isFixed = (it) => ['cooker', 'shower', 'immersion', 'ev_charger', 'appliance', 'machine', 'pv_inverter', 'home_battery'].includes(it.p.type) && !(it.p.type === 'appliance' && it.props.plug === 'plug');

  /* One final circuit: everything wired after a breaker. */
  function circuitOf(project, g, dev, sup, set) {
    const start = dev.node('out'), stop = dev.node('in');
    const fcuEdges = g.devices.filter((x) => x.p.type === 'fcu' && x !== dev).map((x) => ({ a: x.node('in'), b: x.node('out'), fcu: x }));
    const seen = new Set([start]), q = [start], edges = [], fused = new Set();
    while (q.length) {
      const n = q.shift();
      g.cables.forEach((c, i) => {
        if (c.a !== n && c.b !== n) return;
        const o = c.a === n ? c.b : c.a;
        if (o === stop) return;
        if (!edges.includes(i)) edges.push(i);
        if (!seen.has(o)) { seen.add(o); q.push(o); }
      });
      fcuEdges.forEach((e) => { if (e.a === n && !seen.has(e.b)) { seen.add(e.b); q.push(e.b); fused.add(e.b); } });
    }
    // nodes behind a fused spur
    const behindFcu = new Set();
    if (fused.size) {
      const fq = [...fused]; fq.forEach((n) => behindFcu.add(n));
      while (fq.length) { const n = fq.shift(); edges.forEach((i) => { const c = g.cables[i]; const o = c.a === n ? c.b : c.b === n ? c.a : null; if (o && !behindFcu.has(o) && o !== start) { behindFcu.add(o); fq.push(o); } }); }
    }
    const loads = g.parts.filter((it) => it !== dev && !DEVICES.includes(it.p.type) && it.nodes.some((n) => seen.has(n)) && (it.d.mains || it.d.factory));
    const pr = dev.props, In = parseFloat(pr.rating) || 0, curve = pr.curve || 'B', three = String(pr.poles) === '3';
    // RCD protection: the breaker itself (RCBO) or an RCD upstream
    let rcd = dev.p.type === 'rcbo' ? { it: dev, mA: parseFloat(pr.mA) || 30, type: pr.rcdType || 'A' } : null;
    if (!rcd) {
      const up = new Set([stop]), uq = [stop];
      while (uq.length && !rcd) {
        const n = uq.shift();
        g.cables.forEach((c) => { if (c.a === n || c.b === n) { const o = c.a === n ? c.b : c.a; if (!up.has(o)) { up.add(o); uq.push(o); } } });
        g.devices.forEach((x) => { if (x !== dev && x.node('out') === n && x.p.type === 'rcd') rcd = { it: x, mA: parseFloat(x.props.mA) || 30, type: x.props.rcdType || 'A' }; else if (x !== dev && x.node('out') === n && !up.has(x.node('in'))) { up.add(x.node('in')); uq.push(x.node('in')); } });
      }
    }
    // the cable layout: a ring has loops that start and end at the breaker
    const nodes = [...seen], E = edges.map((i) => g.cables[i]), br = bridges(nodes, E);
    const ringEdges = E.filter((_, i) => !br.has(i)), ringNodes = new Set(ringEdges.flatMap((e) => [e.a, e.b]));
    const ring = ringNodes.has(start);
    // kind of circuit
    const has = (t) => loads.some((x) => x.p.type === t), sockets = loads.filter(isSocket);
    let kind = pr.circuit && pr.circuit !== 'auto' ? pr.circuit : null;
    if (!kind) {
      kind = has('shower') ? 'shower' : has('ev_charger') ? 'ev' : has('cooker') ? 'cooker' : has('immersion') ? 'immersion' : has('pv_inverter') ? 'pv' : has('home_battery') ? 'battery'
        : sockets.length ? (ring ? 'ring' : 'radial') : has('light') ? 'lighting' : has('smoke_alarm') ? 'smoke' : has('machine') ? 'machine' : loads.some(isFixed) || has('appliance') ? 'fixed' : 'other';
    }
    // cable: the smallest size used, and its worst rating once derated
    const cab = E.map((c) => ({ w: c.w, v: c.v, ...rateCable(c.w, set) }));
    const sizes = cab.filter((c) => c.size).map((c) => parseFloat(c.size));
    const minSize = sizes.length ? norm(Math.min(...sizes)) : '';
    const worst = cab.filter((c) => c.iz != null).sort((a, b) => a.iz - b.iz)[0] || null;
    const missingLen = cab.some((c) => c.length == null);
    // length: the ring's total, or the furthest point of a radial
    let L_ = null;
    if (!missingLen && cab.length) {
      if (ring) L_ = cab.filter((c) => ringEdges.includes(g.cables.find((x) => x.w === c.w))).reduce((a, c) => a + c.length, 0);
      else {
        const dist = new Map([[start, 0]]), dq = [start];
        while (dq.length) { const n = dq.shift(); cab.forEach((c, i) => { const e = E[i]; const o = e.a === n ? e.b : e.b === n ? e.a : null; if (o != null && !dist.has(o)) { dist.set(o, dist.get(n) + c.length); dq.push(o); } }); }
        L_ = Math.max(0, ...dist.values());
      }
    }
    // design current
    const lightsW = loads.filter((x) => x.p.type === 'light').reduce((a, x) => a + (parseFloat(x.props.watts) || 0) * (parseFloat(x.props.count) || 1), 0);
    let Ib;
    if (kind === 'ring' || kind === 'radial') Ib = In;
    else Ib = loads.reduce((a, x) => a + loadAmps(x), 0);
    Ib = r1(Ib);
    return { dev, ref: refOf(dev), sheetId: dev.v.sheet.id, sheet: dev.v.sheet.name, kind, In, curve, three, rcd, afdd: pr.afdd === 'yes', existing: pr.existing === 'existing', area: parseFloat(pr.area) || null, loads, sockets, cab, minSize, worst, ring, ringNodes, ringEdges, E, br, start, behindFcu, missingLen, L: L_, Ib, lightsW, sup, set };
  }

  /* ---------------- Household checks (guidance from selected BS 7671 rules) ---------------- */
  function circuitChecks(c, out) {
    const add = (level, rule, text) => out.push({ level, rule, text: `${c.ref}: ${text}`, part: c.dev.p.id, sheetId: c.sheetId });
    const { sup, set } = c, dwelling = set.building !== 'commercial';
    if (!c.cab.length) { add('info', 'A0', 'no cables drawn after this breaker yet.'); return; }
    if (c.three) { c.notes = ['Three-phase circuit: cable ratings, voltage drop and earth loop impedance are not worked out here. Check against the cable maker\'s tables.']; }
    if (c.In && c.Ib > c.In) add('error', 'A5-IB-IN', `design current is about ${c.Ib} A, more than the ${c.In} A breaker.`);
    // cable rating against the breaker
    if (!c.three && c.worst && c.In) {
      const w = c.worst;
      if (c.kind === 'ring') {
        if (parseFloat(c.minSize) < 2.5) add('error', 'A1-RING-CABLE', `a ring protected at ${c.In} A needs 2.5 mm² cable all the way round (this one has ${c.minSize} mm²).`);
        else if (w.iz < 20) add('warn', 'A1-RING-CABLE', `once derated, the ${w.size} mm² cable is good for about ${r1(w.iz)} A. Each leg of a ring needs at least 20 A.`);
      } else {
        const need = c.In / (w.ca * w.cg * w.ci);
        c.itNeed = r1(need);
        if (w.it < need) add('warn', 'A5-CCC', `this cable is too small for the breaker once derating is applied (${r1(need)} A needed, ${w.size} mm² method ${w.method} is rated ${w.it} A).`);
      }
      if (c.cab.some((x) => x.ci === 0.5)) add('info', 'A5-INSULATION', 'cable buried in insulation can carry only about half its normal current. Taken into account.');
    }
    if (c.cab.some((x) => x.size && !TE_RATING.C[x.size]) && !c.three) add('info', 'A5-SIZE', 'some cable sizes are outside the twin and earth tables used here. Check them against the cable maker\'s data.');
    // voltage drop and earth loop impedance
    if (!c.three && c.L != null && c.minSize && MV_A_M[c.minSize]) {
      const div = c.ring ? 4 : 1, vd = (MV_A_M[c.minSize] * c.Ib * c.L) / (1000 * div), pct = (vd / U0) * 100;
      const lim = (c.kind === 'lighting' ? 3 : 5) + (sup.private ? 3 : 0);
      c.vd = r2(vd); c.vdPct = r1(pct); c.vdLimit = lim;
      if (pct > lim) add('warn', 'A4-VD', `voltage drop is about ${r1(pct)} %, over the ${lim} % guide for ${c.kind === 'lighting' ? 'lighting' : 'other circuits'}. Use a larger cable or shorten the run.`);
      const cpc = c.cab[0].cpc || TE_CPC[c.minSize], rr = (R20[c.minSize] || 0) + (R20[cpc] || 0);
      if (rr) {
        const R12 = (rr * 1.2 * c.L) / (1000 * div), zs = sup.ze + R12, zmax = (CMIN * U0) / ((TRIP[c.curve] || 5) * c.In);
        c.r1r2 = r2(R12); c.zs = r2(zs); c.zsMax = r2(zmax); c.zsMeasured = r2(0.8 * zmax);
        if (sup.earthing !== 'TT' && c.In && zs > zmax) add('error', 'A3-ZS', `earth fault loop impedance is about ${r2(zs)} Ω, over the ${r2(zmax)} Ω maximum for a Type ${c.curve} ${c.In} A breaker. It may not disconnect fast enough. Use a shorter or larger cable, a lower rating, or RCD protection.`);
        // adiabatic check for the earth (cpc) at the end of the circuit
        const If = (CMIN * U0) / zs, t = If >= (TRIP[c.curve] || 5) * c.In ? 0.1 : 0.4, smin = Math.sqrt(If * If * t) / 115;
        if (parseFloat(cpc) < smin) add('warn', 'A7-CPC-ADIABATIC', `the ${cpc} mm² earth (cpc) may be too small for the fault current (about ${Math.round(If)} A) and disconnection time.`);
      }
    } else if (c.missingLen && !c.three) add('info', 'A4-LEN', 'some cables have no length, so voltage drop and earth loop impedance are not worked out.');
    // RCD protection
    const rcd30 = c.rcd && c.rcd.mA <= 30;
    if (sup.earthing === 'TT' && !c.rcd) add('error', 'A3-TT-RCD', 'on a TT supply every circuit must be protected by an RCD.');
    if (sup.earthing === 'TT' && c.rcd && sup.ra && sup.ra * (c.rcd.mA / 1000) > 50) add('error', 'A3-TT-RA', `the earth rod (${sup.ra} Ω) is too high for a ${c.rcd.mA} mA RCD (RA × IΔn must be 50 V or less).`);
    if (c.sockets.length && dwelling && !rcd30 && c.In <= 32) add('error', 'A2-RCD-SOCKETS', 'socket circuits in a home need 30 mA RCD protection.');
    if (c.kind === 'lighting' && dwelling && !rcd30) add('warn', 'A2-RCD-LIGHTING', 'lighting circuits in a home need 30 mA RCD protection.');
    if (c.loads.some((x) => x.props.zone) && !rcd30) add('error', 'A2-RCD-BATH', 'every circuit serving a bathroom needs 30 mA RCD protection.');
    if (c.loads.some((x) => x.props.outdoor === 'yes') && !rcd30) add('error', 'A2-RCD-OUTDOOR', 'outdoor sockets need 30 mA RCD protection.');
    if (c.rcd && c.rcd.type === 'AC') add('warn', 'A2-RCD-TYPE', `the RCD is Type AC. Type AC is only for loads with no DC content. Use Type A or better.`);
    if (c.kind === 'ev') {
      const ev = c.loads.find((x) => x.p.type === 'ev_charger');
      if (!(c.rcd && (c.rcd.type === 'B' || (ev && ev.props.rdcdd === 'yes' && ['A', 'F'].includes(c.rcd.type))))) add('warn', 'A2-RCD-EV', 'an EV charge point needs DC fault protection: a Type B RCD, or Type A or F with an RDC-DD (often built into the charger).');
    }
    if (['pv', 'battery'].includes(c.kind) || c.loads.some((x) => (byName(APPLIANCES, x.props.kind) || {}).inverter)) { if (c.rcd && c.rcd.type === 'AC') add('warn', 'A2-RCD-INV', 'inverters and heat pumps need at least a Type A RCD.'); }
    if (c.sockets.length && ['hrrb', 'hmo', 'student', 'care'].includes(set.building) && !c.afdd) add('error', 'A2-AFDD', 'arc fault detection (AFDD) is required for socket circuits in this type of building.');
    // rings
    if (c.kind === 'ring') {
      if (!c.ring) add('error', 'A1-RING-CLOSED', 'this ring is not a closed loop. A broken ring leaves 2.5 mm² cable on a 32 A breaker, which can overheat.');
      if (c.area > 100) add('warn', 'A1-RING-AREA', `this ring serves ${c.area} m² of floor, more than 100 m². Split it into two circuits.`);
      if (c.ring) {
        // spurs: whatever hangs off the ring through a single cable
        const ringPoints = c.loads.filter((x) => (isSocket(x) || isFixed(x)) && x.nodes.some((n) => c.ringNodes.has(n))).length;
        let spurs = 0;
        c.E.forEach((e, i) => {
          if (!c.br.has(i)) return;
          const onRing = c.ringNodes.has(e.a) ? e.a : c.ringNodes.has(e.b) ? e.b : null;
          if (onRing == null) return;
          const root_ = onRing === e.a ? e.b : e.a;
          if (c.behindFcu.has(root_)) return;
          spurs++;
          const sub = new Set([root_]), sq = [root_];
          while (sq.length) { const n = sq.shift(); c.E.forEach((f) => { const o = f.a === n ? f.b : f.b === n ? f.a : null; if (o != null && o !== onRing && !sub.has(o) && !c.behindFcu.has(o)) { sub.add(o); sq.push(o); } }); }
          const fed = c.loads.filter((x) => (isSocket(x) || isFixed(x)) && x.nodes.some((n) => sub.has(n)));
          if (fed.length > 1) add('warn', 'A1-RING-SPURS-UNFUSED', `an unfused spur feeds ${fed.length} outlets (${fed.map(refOf).join(', ')}). An unfused spur can feed only one single or twin socket. Use a 13 A fused connection unit for more.`);
        });
        if (spurs > ringPoints) add('warn', 'A1-RING-SPURS-COUNT', `there are more unfused spurs (${spurs}) than sockets and fixed items on the ring itself (${ringPoints}).`);
      }
      if (c.loads.some((x) => ['immersion', 'shower', 'cooker'].includes(x.p.type) || (byName(APPLIANCES, x.props.kind) || {}).own)) add('warn', 'A1-RING-FIXED-LOADS', 'immersion heaters, showers, storage heaters and similar loads need their own circuit, not the ring.');
    }
    // loads that need their own circuit
    const own = c.loads.filter((x) => ['shower', 'cooker', 'ev_charger', 'immersion', 'pv_inverter', 'home_battery'].includes(x.p.type));
    if (own.length && (c.loads.length - own.length > 0 || own.length > 1) && c.kind !== 'ring') add('warn', 'A1-DEDICATED', `${own.map(refOf).join(', ')} should have a dedicated circuit with no sockets or other loads on it.`);
    // bathrooms
    c.loads.forEach((x) => {
      const z = x.props.zone, ip = parseInt(String(x.props.ip || '').replace(/^IPX?/i, '').slice(-1), 10);
      if (!z || z === 'outside') { if (isSocket(x) && z === 'outside') out.push({ level: 'info', rule: 'A6-BATH-SOCKET', part: x.p.id, sheetId: x.v.sheet.id, text: `${refOf(x)}: a 230 V socket in a bathroom must be at least 2.5 m from the edge of the bath or shower zone.` }); return; }
      if (isSocket(x)) out.push({ level: 'error', rule: 'A6-BATH-SOCKET', part: x.p.id, sheetId: x.v.sheet.id, text: `${refOf(x)}: 230 V sockets are not allowed in bathroom zones. Keep them at least 2.5 m from the edge of the bath or shower zone.` });
      const need = z === '0' ? 7 : 4;
      if (!isNaN(ip) && ip < need) out.push({ level: 'warn', rule: 'A6-BATH-ZONE', part: x.p.id, sheetId: x.v.sheet.id, text: `${refOf(x)}: zone ${z} needs at least IPX${need}; this item is IPX${ip}.` });
      else if (isNaN(ip) && !isSocket(x)) out.push({ level: 'info', rule: 'A6-BATH-ZONE', part: x.p.id, sheetId: x.v.sheet.id, text: `${refOf(x)} is in bathroom zone ${z}. Set its IP rating: zone ${z} needs at least IPX${need}, and only fixed equipment suitable for the zone.` });
    });
    // machines and motors
    c.loads.filter((x) => x.p.type === 'machine').forEach((x) => {
      const m = byName(MACHINES, x.props.kind) || {}, I = loadAmps(x), start = x.props.start || m.start;
      if ((x.props.supply || m.supply) === '13 A plug' && I > 13) out.push({ level: 'warn', rule: 'B4-13A', part: x.p.id, sheetId: x.v.sheet.id, text: `${refOf(x)} draws about ${r1(I)} A, more than a 13 A plug can supply. It needs a 16 A or 32 A dedicated socket and circuit.` });
      if (start === 'DOL' && c.curve === 'B' && c.In && 7 * I > 3 * c.In) add('warn', 'B2-B-CURVE-MOTOR', `a Type B breaker may trip when ${refOf(x)} starts (about ${Math.round(7 * I)} A for a moment). Use a Type C or D breaker sized for the motor, or a motor circuit breaker.`);
    });
  }

  function householdChecks(project) {
    const g = graph(project), sup = supplyOf(project, g), set = settingsOf(project), out = [];
    const circuits = g.devices.filter((d) => d.p.type === 'mcb' || d.p.type === 'rcbo').map((d) => circuitOf(project, g, d, sup, set));
    circuits.forEach((c) => circuitChecks(c, out));
    const add = (level, rule, text, part) => out.push({ level, rule, text, ...(part ? { part: part.p.id, sheetId: part.v.sheet.id } : {}) });
    if (!circuits.length) return { circuits, out, sup, set, demand: null };
    // installation level
    const rcds = new Set(circuits.map((c) => (c.rcd && c.rcd.it.p.type === 'rcd' ? c.rcd.it.p.id : c.rcd ? 'own' : 'none')));
    if (circuits.length > 1 && rcds.size === 1 && !rcds.has('own') && !rcds.has('none')) add('warn', 'A2-RCD-FRONTEND', 'all circuits share one RCD. One fault will turn off everything, including the lights. Split the circuits between RCDs or use RCBOs.');
    if (!g.parts.some((x) => x.p.type === 'spd')) add('info', 'A2-SPD', 'no surge protection device drawn. BS 7671 requires one unless the owner has declined it in writing, and always where a fire alarm or other safety service is fed.');
    g.parts.filter((x) => x.p.type === 'main_switch' && x.props.cu === 'plastic').forEach((x) => add('warn', 'A2-CU-CASE', `${refOf(x)}: a consumer unit inside a home must have a non-combustible (normally metal) case.`, x));
    const bonds = g.parts.filter((x) => x.p.type === 'bonding');
    if (!bonds.length) add('info', 'A7-MAIN-BOND', 'no main protective bonding drawn. Gas, water and oil pipes where they enter the building normally need bonding to the main earthing terminal.');
    else if (sup.earthing === 'TN-C-S') bonds.forEach((x) => { if ((parseFloat(x.props.size) || 0) < 10) add('warn', 'A7-MAIN-BOND', `${refOf(x)}: on a PME supply, main bonding is normally at least 10 mm².`, x); });
    // maximum demand, with the household diversity method
    const demand = maxDemand(circuits);
    if (demand.amps > sup.fuse) add('warn', 'C-DIVERSITY', `estimated maximum demand is about ${demand.amps} A, above the ${sup.fuse} A supply fuse. Ask the network operator about an upgrade, or use load management.`);
    else if (demand.amps > 0.8 * sup.fuse) add('info', 'C-DIVERSITY', `estimated maximum demand is about ${demand.amps} A, close to the ${sup.fuse} A supply fuse.`);
    // generation and storage
    const gen = g.parts.filter((x) => ['pv_inverter', 'home_battery'].includes(x.p.type));
    if (gen.length) {
      const perPhase = gen.reduce((a, x) => a + ((parseFloat(x.props.kw) || 0) * 1000) / (U0 * (String(x.props.phases) === '3' ? 3 : 1)), 0);
      if (perPhase > 16) add('warn', 'A10-G98', `total generation is about ${r1(perPhase)} A per phase, above 16 A, so the network operator must approve it (G99) before you connect.`);
      else add('info', 'A10-G98', `total generation is about ${r1(perPhase)} A per phase (16 A or less): a type-tested installation is notified to the network operator after connection (G98).`);
    }
    g.parts.filter((x) => x.p.type === 'pv_array').forEach((x) => {
      const ns = parseInt(x.props.strings, 10) || 1, isc = parseFloat(x.props.isc) || 0, mf = parseFloat(x.props.maxfuse) || 0, iscMax = 1.25 * isc;
      if (ns >= 3 && mf && 1.35 * mf < (ns - 1) * iscMax) add('warn', 'A10-STRINGFUSE', `${refOf(x)}: with ${ns} parallel strings, each string needs a fuse sized between ${r1(1.1 * iscMax)} A and ${mf} A.`, x);
      add('info', 'A10-DC-CABLE', `${refOf(x)}: PV string cable must carry at least ${r1(iscMax)} A (1.25 × the module short-circuit current), and DC parts must be rated for the array's open-circuit voltage in cold weather (about ${Math.round(1.2 * (parseFloat(x.props.voc) || 0) * (parseInt(x.props.modules, 10) || 1))} V).`, x);
    });
    g.parts.filter((x) => x.p.type === 'home_battery' && ['loft', 'understairs'].includes(x.props.where)).forEach((x) => add('warn', 'A10-BATT-LOFT', `${refOf(x)}: PAS 63100 advises against putting home batteries in lofts or under-stairs spaces.`, x));
    // colours of conductors, where wires are drawn as conductors
    const cols = new Set(view(project).flatMap((v) => v.wires.map((w) => (w.tracer ? '' : w.colour))));
    view(project).forEach((v) => v.wires.forEach((w) => { if (!w.tracer && ['green', 'yellow'].includes(w.colour)) out.push({ level: 'error', rule: 'A8-COLOURS', wire: w.id, sheetId: v.sheet.id, text: `${w.name}: green alone and yellow alone are never used in mains wiring. Protective conductors are green-and-yellow.` }); }));
    if ((cols.has('red') || cols.has('black')) && cols.has('brown') && cols.has('blue')) add('info', 'A8-MIXED', 'this drawing mixes old and new cable colours. Fit the notice: "CAUTION: This installation has wiring colours to two versions of BS 7671…" at the consumer unit.');
    // notifiable work
    const notif = [];
    if (circuits.some((c) => !c.existing)) notif.push('new circuits');
    if (g.parts.some((x) => x.p.type === 'main_switch' && x.props.existing !== 'existing')) notif.push('a new or replaced consumer unit');
    if (circuits.some((c) => !c.existing && c.loads.some((x) => x.props.zone && x.props.zone !== 'outside'))) notif.push('work in bathroom zones');
    if (notif.length) add('info', 'A9-PARTP', `${notif.join(', ').replace(/^./, (m) => m.toUpperCase())}: ${set.country === 'scotland' ? 'in Scotland, work may need a building warrant under the Building Standards (4.5 and 4.6).' : set.country === 'ni' ? 'Northern Ireland has no Part P, but have the work done by a registered electrician.' : 'this is notifiable work under Part P of the Building Regulations. It must be done or signed off by a registered electrician or building control.'} The installer issues an Electrical Installation Certificate.`);
    return { circuits, out, sup, set, demand };
  }

  /* Maximum demand with the household diversity method (IET On-Site Guide, older edition; guidance only). */
  function maxDemand(circuits) {
    const items = [];
    const light = circuits.filter((c) => c.kind === 'lighting').reduce((a, c) => a + c.lightsW / U0, 0);
    if (light) items.push(['Lighting (66 %)', 0.66 * light]);
    const sock = circuits.filter((c) => c.kind === 'ring' || c.kind === 'radial').map((c) => c.In).sort((a, b) => b - a);
    if (sock.length) items.push(['Socket circuits (largest + 40 % of the rest)', sock[0] + 0.4 * sock.slice(1).reduce((a, b) => a + b, 0)]);
    const cook = circuits.filter((c) => c.kind === 'cooker').reduce((a, c) => a + c.Ib, 0);
    if (cook) items.push(['Cooking', cook]);
    const show = circuits.filter((c) => c.kind === 'shower').map((c) => c.Ib).sort((a, b) => b - a);
    if (show.length) items.push(['Showers (two largest + 25 % of the rest)', (show[0] || 0) + (show[1] || 0) + 0.25 * show.slice(2).reduce((a, b) => a + b, 0)]);
    const full = circuits.filter((c) => ['immersion', 'ev', 'heating'].includes(c.kind)).reduce((a, c) => a + c.Ib, 0);
    if (full) items.push(['Water heating, EV and heating (no diversity)', full]);
    const other = circuits.filter((c) => ['fixed', 'machine', 'other', 'outdoor', 'smoke'].includes(c.kind)).reduce((a, c) => a + c.Ib, 0);
    if (other) items.push(['Other fixed loads (first 10 A + 50 % of the rest)', other <= 10 ? other : 10 + 0.5 * (other - 10)]);
    return { items: items.map(([k, v]) => [k, r1(v)]), amps: Math.round(items.reduce((a, [, v]) => a + v, 0)) };
  }

  /* ---------------- Factory and control panel checks (selected BS EN 60204-1 recommendations) ---------------- */
  function factoryChecks(project) {
    const out = [], views = view(project), net = Loom.buildNet(project, { switches: 'closed', relays: 'closed', protect: true });
    const P_ = (v, p, pin_) => net.uf.find(net.k(v.sheet, p.id, pin_));
    const all = []; views.forEach((v) => v.parts.forEach((p) => all.push({ v, p, d: Loom.partDef(v, p.type) || {}, props: Loom.resolved(v, p).props || {} })));
    const add = (level, rule, text, it, w) => out.push({ level, rule, text, ...(it ? { part: it.p.id, sheetId: it.v.sheet.id } : {}), ...(w ? { wire: w.id, sheetId: w._s } : {}) });
    // wire colours by what the wire is for
    const netOfPins = (type, pins) => new Set(all.filter((x) => x.p.type === type).flatMap((x) => pins.map((q) => P_(x.v, x.p, q))));
    const dcNets = netOfPins('psu24', ['+', '-']), acCtl = netOfPins('ctrl_tx', ['X1', 'X2']);
    const power = new Set([...netOfPins('contactor', ['L1', 'L2', 'L3', 'T1', 'T2', 'T3']), ...netOfPins('motor3', ['U', 'V', 'W']), ...netOfPins('isolator3', ['L1', 'L2', 'L3', 'T1', 'T2', 'T3'])]);
    const pe = new Set(all.flatMap((x) => Loom.resolved(x.v, x.p).pins.filter((q) => q.id === 'PE').map((q) => P_(x.v, x.p, q.id))));
    const wrong = { pe: [], dc: [], ac: [], pw: [] };
    views.forEach((v) => v.wires.forEach((w) => {
      const n = net.uf.find(net.k(v.sheet, w.from.part, w.from.pin)), col = w.colour, gy = (col === 'green' && w.tracer === 'yellow') || (col === 'yellow' && w.tracer === 'green');
      const ww = { ...w, _s: v.sheet.id };
      if (pe.has(n) && !gy) wrong.pe.push(ww);
      else if (!pe.has(n) && !w.tracer && ['green', 'yellow'].includes(col)) add('error', 'B1-COLOURS', `${w.name}: green alone or yellow alone must not be used. Green-and-yellow is only for protective earth.`, null, ww);
      else if (dcNets.has(n) && col !== 'blue' && col !== 'lightblue') wrong.dc.push(ww);
      else if (acCtl.has(n) && col !== 'red') wrong.ac.push(ww);
      else if (power.has(n) && col !== 'black') wrong.pw.push(ww);
    }));
    const list = (ws) => ws.slice(0, 6).map((w) => w.name).join(', ') + (ws.length > 6 ? ` and ${ws.length - 6} more` : '');
    if (wrong.pe.length) add('error', 'B1-COLOURS', `${list(wrong.pe)}: protective earth (PE) conductors must be green-and-yellow.`, null, wrong.pe[0]);
    if (wrong.dc.length) add('info', 'B1-COLOURS', `${list(wrong.dc)}: under EN 60204-1, DC control wiring is normally blue.`, null, wrong.dc[0]);
    if (wrong.ac.length) add('info', 'B1-COLOURS', `${list(wrong.ac)}: under EN 60204-1, AC control wiring is normally red.`, null, wrong.ac[0]);
    if (wrong.pw.length) add('info', 'B1-COLOURS', `${list(wrong.pw)}: power circuits are normally black.`, null, wrong.pw[0]);
    // buttons and emergency stops
    all.forEach((x) => {
      if (x.p.type === 'estop' && String(x.props.category) === '2') add('error', 'B1-ESTOP', `${refOf(x)}: an emergency stop must be stop category 0 or 1. Category 2 leaves power on.`, x);
      else if (x.p.type === 'estop') add('info', 'B1-ESTOP', `${refOf(x)} is drawn as stop category ${x.props.category}. The category, and whether a safety relay is needed, come from the machine's risk assessment.`, x);
      if (x.p.type === 'pb_start' && x.props.colour === 'red') add('error', 'B1-PB', `${refOf(x)}: a start button must never be red.`, x);
      if (x.p.type === 'pb_stop' && x.props.colour === 'green') add('error', 'B1-PB', `${refOf(x)}: a stop button must never be green.`, x);
    });
    // control transformer
    const acCoils = all.filter((x) => x.p.type === 'contactor' && /AC/.test(x.props.coilV || '')), devices = all.filter((x) => ['pb_start', 'pb_stop', 'estop', 'aux_contact'].includes(x.p.type));
    if (acCoils.length && (devices.length > 2 || acCoils.length > 1) && !all.some((x) => x.p.type === 'ctrl_tx')) add('warn', 'B1-CTRL-XFMR', 'AC control circuits should be fed from a control transformer with separate windings, at 230 V or below. 24 V DC from a power supply is common.');
    // motors: full-load current, protection and starters, following the power wiring back from the motor
    // walk with every switch and contactor open, so each device in the chain is a separate step
    const open = Loom.buildNet(project, { switches: 'open', relays: 'open', protect: true }), O_ = (v, p, pin_) => open.uf.find(open.k(v.sheet, p.id, pin_));
    const STEP = ['overload', 'contactor', 'mpcb', 'mcb3', 'isolator3', 'vfd'];
    const hop = (it, pinIds) => { const nets = pinIds.map((q) => O_(it.v, it.p, q)); return all.filter((x) => x !== it && STEP.includes(x.p.type) && ['T1', 'T2', 'T3', 'U', 'V', 'W'].some((q) => Loom.resolved(x.v, x.p).pins.some((pp) => pp.id === q) && nets.includes(O_(x.v, x.p, q)))); };
    all.filter((x) => x.p.type === 'motor3').forEach((m) => {
      const flc = parseFloat(m.props.flc) || motorFLC(m.props.kw, 3), start = m.props.start || 'DOL';
      if (!parseFloat(m.props.flc)) add('info', 'B2-FLC', `${refOf(m)}: estimated full-load current ${flc} A for ${m.props.kw} kW at 400 V. Check against the motor rating plate.`, m);
      // follow the power wiring back from the motor, one device at a time
      const chain = [], seenIt = new Set([m]);
      let front = [{ it: m, pins: ['U', 'V', 'W'] }];
      for (let i = 0; i < 6 && front.length; i++) {
        const next = [];
        front.forEach((f) => hop(f.it, f.pins).forEach((x) => { if (!seenIt.has(x)) { seenIt.add(x); chain.push(x); if (x.p.type !== 'vfd') next.push({ it: x, pins: ['L1', 'L2', 'L3'] }); } }));
        front = next;
      }
      const ols = chain.filter((x) => x.p.type === 'overload' || x.p.type === 'mpcb'), k = chain.find((x) => x.p.type === 'contactor'), vfd = chain.find((x) => x.p.type === 'vfd');
      const want = start === 'Star-delta' ? 0.58 * flc : flc;
      ols.filter((ol) => parseFloat(ol.props.setting)).forEach((ol) => {
        const set_ = parseFloat(ol.props.setting);
        if (Math.abs(set_ - want) > 0.15 * want) add('warn', 'B2-OVERLOAD', `${refOf(ol)} is set to ${set_} A but ${refOf(m)} needs about ${r1(want)} A${start === 'Star-delta' ? ' (0.58 × full-load current, relay in the delta)' : ' (its full-load current)'}.`, ol);
      });
      if (!ols.length && !vfd) add('warn', 'B2-OVERLOAD', `${refOf(m)} has no overload relay or motor circuit breaker in its power wiring.`, m);
      if (k) {
        const ac3 = parseFloat(k.props.ac3) || 0;
        if (ac3 && ac3 < flc) add('warn', 'B2-CONTACTOR', `${refOf(k)}: its AC-3 rating (${ac3} A) is below ${refOf(m)}'s full-load current (${flc} A).`, k);
        if (m.props.duty === 'inching') add('info', 'B2-CONTACTOR', `${refOf(k)}: for inching or plugging, size the contactor on its AC-4 rating, which is lower than AC-3.`, k);
      }
      if (start === 'DOL' && (parseFloat(m.props.kw) || 0) > 5.5) add('info', 'B2-DOL-START', `${refOf(m)} will draw about 6–8 times its running current when it starts direct on line. Check the supply can take it, or use a soft starter or drive.`, m);
    });
    all.filter((x) => x.p.type === 'vfd').forEach((x) => add('info', 'B2-VFD-RCD', `${refOf(x)}: if this drive is on an RCD, it normally needs Type F (single-phase drives) or Type B (three-phase drives). Check with the drive maker.`, x));
    return out;
  }

  /* ---------------- Reports ---------------- */
  function circuitRows(project) {
    const h = householdChecks(project);
    const st = (c) => { const lv = h.out.filter((x) => x.part === c.dev.p.id); return lv.some((x) => x.level === 'error') ? 'fix' : lv.some((x) => x.level === 'warn') ? 'check' : 'ok'; };
    return [['Way', 'Circuit', 'Device', 'RCD', 'AFDD', 'Cable mm²', 'cpc mm²', 'Method', 'Length m', 'Design A', 'Cable A (derated)', 'Volt drop %', 'Zs Ω', 'Max Zs Ω', 'Status']]
      .concat(h.circuits.map((c) => [c.ref, c.kind, `${c.curve}${c.In}${c.three ? ' 3P' : ''}`, c.rcd ? `${c.rcd.mA} mA ${c.rcd.type}` : '', c.afdd ? 'yes' : '', c.minSize, c.cab[0] ? c.cab[0].cpc : '', c.worst ? c.worst.method : '', c.L == null ? '' : r1(c.L), c.Ib, c.worst ? r1(c.worst.iz) : '', c.vdPct == null ? '' : c.vdPct, c.zs == null ? '' : c.zs, c.zsMax == null ? '' : c.zsMax, st(c)]));
  }
  function motorRows(project) {
    const rows = [['Motor', 'Sheet', 'kW', 'Full-load A', 'Starting', 'Starting A (about)']];
    view(project).forEach((v) => v.parts.filter((p) => p.type === 'motor3').forEach((p) => {
      const pr = Loom.resolved(v, p).props, flc = parseFloat(pr.flc) || motorFLC(pr.kw, 3), s = STARTING[pr.start || 'DOL'] || [1, 1];
      rows.push([p.label || 'M', v.sheet.name, pr.kw, flc, pr.start || 'DOL', `${Math.round(flc * s[0])}–${Math.round(flc * s[1])}`]);
    }));
    return rows;
  }
  /* Terminal plan: every terminal strip, each terminal with the wires on both sides. */
  function terminalRows(project) {
    const rows = [['Strip', 'Terminal', 'Sheet', 'Side A wire', 'Side A goes to', 'Side B wire', 'Side B goes to']];
    view(project).forEach((v) => v.parts.filter((p) => p.type === 'terminal_block').forEach((p) => {
      const n = (Loom.resolved(v, p).props.ways | 0) || 0;
      for (let i = 1; i <= n; i++) {
        const side = (pinId) => v.wires.filter((w) => (w.from.part === p.id && w.from.pin === pinId) || (w.to.part === p.id && w.to.pin === pinId)).map((w) => ({ w, other: w.from.part === p.id && w.from.pin === pinId ? w.to : w.from }));
        const a = side('A' + i), b = side('B' + i);
        rows.push([p.label || 'X', `${p.label || 'X'}:${i}`, v.sheet.name, a.map((x) => x.w.name).join(' '), a.map((x) => Loom.pinName(v, x.other)).join(' '), b.map((x) => x.w.name).join(' '), b.map((x) => Loom.pinName(v, x.other)).join(' ')]);
      }
    }));
    return rows;
  }
  /* PLC input and output list: address, wire and what it connects to. */
  function plcRows(project) {
    const rows = [['Address', 'Module', 'Sheet', 'Wire', 'Connected to']];
    const net = Loom.buildNet(project, { switches: 'open', relays: 'open', protect: true });
    const all = []; view(project).forEach((v) => v.parts.forEach((p) => all.push({ v, p })));
    all.filter((x) => x.p.type === 'plc_in' || x.p.type === 'plc_out').forEach((x) => {
      Loom.resolved(x.v, x.p).pins.filter((q) => q.id !== 'COM').forEach((q) => {
        const n = net.uf.find(net.k(x.v.sheet, x.p.id, q.id));
        const ws = x.v.wires.filter((w) => (w.from.part === x.p.id && w.from.pin === q.id) || (w.to.part === x.p.id && w.to.pin === q.id));
        const to = all.filter((o) => o !== x).flatMap((o) => Loom.resolved(o.v, o.p).pins.filter((pp) => net.uf.find(net.k(o.v.sheet, o.p.id, pp.id)) === n).map((pp) => `${o.p.label || o.p.type}:${pp.id}`));
        rows.push([q.id, x.p.label || 'PLC', x.v.sheet.name, ws.map((w) => w.name).join(' '), [...new Set(to)].join(' ')]);
      });
    });
    return rows;
  }
  /* Number wires by potential: every wire on one net gets the same number (sheet number then a count). */
  function numberByPotential(project, opts = {}) {
    const net = Loom.buildNet(project, { switches: 'open', relays: 'open', protect: false });
    let n = 0;
    Loom.views(project).forEach((v) => {
      const seen = new Map(); let i = opts.start || 1;
      v.wires.forEach((w) => {
        const k = net.uf.find(net.k(v.sheet, w.from.part, w.from.pin));
        if (!seen.has(k)) seen.set(k, `${v.sheetNo}${String(i++).padStart(2, '0')}`);
        w.name = seen.get(k); n++;
      });
    });
    project.settings.wireNumbering = 'potential';
    return n;
  }

  /* ---------------- Hook into checks, reports and project types ---------------- */
  const isMains = (project) => ['household', 'mixed'].includes((project.settings || {}).projectType);
  const isFactory = (project) => ['factory', 'mixed'].includes((project.settings || {}).projectType);
  const VEHICLE_ONLY = /guide figure|Guide maximum|consider a heavier gauge|has no earth return|with no fuse in between/;
  const baseValidate = Loom.validate;
  Loom.validate = function (d) {
    let base = baseValidate(d);
    const project = d && d.project ? d.project : d;
    if (!project || !Array.isArray(project.sheets)) return base;
    const type = (project.settings || {}).projectType;
    if (type === 'household' || type === 'factory') base = base.filter((c) => !VEHICLE_ONLY.test(c.text || ''));
    // the last socket or light on a radial has nothing on its loop-out terminal
    base = base.filter((c) => !(c.level === 'info' && c.part && / pin out not connected\.$/.test(c.text || '') && view(project).some((v) => v.parts.some((p) => p.id === c.part && PASS.includes(p.type)))));
    if (project.settings && project.settings.wireNumbering === 'potential') base = base.filter((c) => !/named .* twice|same name/i.test(c.text || ''));
    let extra = [];
    if (isMains(project) || (type === 'factory' && view(project).some((v) => v.parts.some((p) => p.type === 'mcb' || p.type === 'rcbo')))) extra = extra.concat(householdChecks(project).out);
    if (isFactory(project)) extra = extra.concat(factoryChecks(project));
    return d && d.sheet ? base.concat(extra.filter((c) => !c.sheetId || c.sheetId === d.sheet.id)) : base.concat(extra);
  };
  const extraReports = { circuits: circuitRows, motors: motorRows, terminals: terminalRows, plcio: plcRows };
  Object.keys(extraReports).forEach((k) => { if (!Loom.REPORTS.includes(k)) Loom.REPORTS.push(k); });
  const baseRows = Loom.reportRows;
  Loom.reportRows = function (d, kind, o) { return extraReports[kind] ? extraReports[kind](d && d.project ? d.project : d) : baseRows(d, kind, o); };
  if (Loom.PDF_TABLES) {
    Object.assign(Loom.PDF_TABLES, {
      circuits: { title: 'Circuit schedule (household)', cols: ['Way', 'Circuit', 'Device', 'RCD', 'AFDD', 'Cable mm²', 'cpc mm²', 'Method', 'Length m', 'Design A', 'Cable A (derated)', 'Volt drop %', 'Zs Ω', 'Max Zs Ω', 'Status'], ref: 'Way' },
      motors: { title: 'Motors', cols: ['Motor', 'Sheet', 'kW', 'Full-load A', 'Starting', 'Starting A (about)'], ref: 'Motor', sheet: 'Sheet' },
      terminals: { title: 'Terminal plan', cols: ['Strip', 'Terminal', 'Sheet', 'Side A wire', 'Side A goes to', 'Side B wire', 'Side B goes to'], ref: 'Strip', sheet: 'Sheet' },
      plcio: { title: 'PLC inputs and outputs', cols: ['Address', 'Module', 'Sheet', 'Wire', 'Connected to'], ref: 'Module', sheet: 'Sheet' },
    });
  }
  Loom.projectTypeHooks.push((project, type) => {
    if (type === 'household' || type === 'factory' || type === 'mixed') {
      project.settings.mains = { building: 'dwelling', country: 'england', ambient: 30, method: 'C', ...(project.settings.mains || {}) };
      if (!project.settings.standard || project.settings.standard === 'lr') project.settings.standard = 'din';
      if (type === 'household' && [12, 24, 48].includes(parseFloat(project.settings.volts) || 12)) project.settings.volts = 230;
    }
  });

  /* ---------------- Starter circuits ---------------- */
  if (Loom.defineTemplate) {
    Loom.defineTemplate('cu-rcbo', 'Consumer unit with RCBOs', 'household', 'Supply, main switch and surge protection feeding a socket ring, lighting with smoke alarms, an electric shower and a cooker, each on a 30 mA RCBO. Cable sizes and lengths are examples to change, not a design.', (a) => {
      const sup = a.part('supply_cutout', 0, 0, { props: { fuse: '100', earthing: 'TN-C-S' } });
      const q = a.part('main_switch', 140, 0, { props: { rating: '100', cu: 'metal' } });
      const spd = a.part('spd', 220, 60, { props: { spdType: '2' } });
      const cb = (y, curve, rating, circuit) => a.part('rcbo', 320, y, { props: { curve, rating, circuit, mA: '30', rcdType: 'A' } });
      const c1 = cb(0, 'B', '32', 'ring'), c2 = cb(140, 'B', '6', 'lighting'), c3 = cb(260, 'B', '40', 'shower'), c4 = cb(380, 'B', '32', 'cooker');
      const T = { colour: 'grey' };
      a.wire(sup, 'out', q, 'in', { ...T, gauge: '25', length: 2 });
      a.wire(q, 'out', spd, 'L', { ...T, gauge: '16', length: 0.3 });
      a.wire(q, 'out', c1, 'in', { ...T, gauge: '16', length: 0.2 });
      [[c1, c2], [c2, c3], [c3, c4]].forEach(([x, y]) => a.wire(x, 'in', y, 'in', { ...T, gauge: '16', length: 0.1, notes: 'Busbar' }));
      const so = [440, 520, 600, 680].map((x) => a.part('socket', x, 0, { props: { kind: 'twin' } }));
      a.wire(c1, 'out', so[0], 'in', { ...T, gauge: '2.5', length: 8, circuit: 'Sockets' });
      so.slice(1).forEach((x, i) => a.wire(so[i], 'out', x, 'in', { ...T, gauge: '2.5', length: 6, circuit: 'Sockets' }));
      a.wire(so[3], 'out', c1, 'out', { ...T, gauge: '2.5', length: 10, circuit: 'Sockets' });
      const sw = a.part('switch_light', 440, 140), l1 = a.part('light', 520, 140, { props: { watts: '10', count: '4' } }), l2 = a.part('light', 600, 140, { props: { watts: '10', count: '3' } }), sa = a.part('smoke_alarm', 680, 140);
      a.wire(c2, 'out', sw, 'in', { ...T, gauge: '1.5', length: 10, circuit: 'Lights' });
      a.wire(sw, 'out', l1, 'in', { ...T, gauge: '1.5', length: 4, circuit: 'Lights' });
      a.wire(l1, 'out', l2, 'in', { ...T, gauge: '1.5', length: 5, circuit: 'Lights' });
      a.wire(l2, 'out', sa, 'in', { ...T, gauge: '1.5', length: 4, circuit: 'Lights' });
      const sh = a.part('shower', 440, 260, { props: { kw: '9.5', ratedV: '240', zone: '1', ip: 'IPX4' } });
      a.wire(c3, 'out', sh, 'in', { ...T, gauge: '10', length: 15, circuit: 'Shower' });
      const ck = a.part('cooker', 440, 380, { props: { kw: '10', socket: 'no' } });
      a.wire(c4, 'out', ck, 'in', { ...T, gauge: '6.0', length: 10, circuit: 'Cooker' });
    });
    Loom.defineTemplate('dol-starter', 'Motor starter, direct on line', 'factory', 'Three-phase motor through an isolator, motor circuit breaker and contactor, with emergency stop, stop and start buttons, a hold-in contact and a running lamp on 24 V DC. Size the parts from the motor rating plate.', (a) => {
      const net = (x, y, text) => a.part('net_label', x, y, { label: '', props: { text } });
      const l = [net(-140, 0, 'L1'), net(-140, 20, 'L2'), net(-140, 40, 'L3')], pe = net(-140, 60, 'PE'), n = net(-140, 260, 'N'), l1b = net(-140, 240, 'L1');
      const q1 = a.part('isolator3', 0, 0, { props: { rating: '25' } }), q2 = a.part('mpcb', 120, 0, { props: { range: '4–6.3', setting: '5' } });
      const k1 = a.part('contactor', 240, 0, { props: { ac3: '9', coilV: '24V DC' } }), m1 = a.part('motor3', 420, 0, { props: { kw: '2.2' } });
      const PW = { colour: 'black', gauge: '2.5', circuit: 'Motor M1' };
      ['1', '2', '3'].forEach((i, j) => { a.wire(l[j], 'R', q1, 'L' + i, PW); a.wire(q1, 'T' + i, q2, 'L' + i, PW); a.wire(q2, 'T' + i, k1, 'L' + i, PW); });
      a.wire(k1, 'T1', m1, 'U', PW); a.wire(k1, 'T2', m1, 'V', PW); a.wire(k1, 'T3', m1, 'W', PW);
      a.wire(pe, 'R', m1, 'PE', { colour: 'green', tracer: 'yellow', gauge: '2.5', circuit: 'Motor M1' });
      const g1 = a.part('psu24', 0, 200, { props: { volts: '24', amps: '2.5' } });
      a.wire(l1b, 'R', g1, 'L', { colour: 'black', gauge: '1.5', circuit: '24 V supply' });
      a.wire(n, 'R', g1, 'N', { colour: 'lightblue', gauge: '1.5', circuit: '24 V supply' });
      a.wire(net(-140, 280, 'PE'), 'R', g1, 'PE', { colour: 'green', tracer: 'yellow', gauge: '1.5', circuit: '24 V supply' });
      const s0 = a.part('estop', 140, 180, { props: { category: '0' } }), s1 = a.part('pb_stop', 240, 180), s2 = a.part('pb_start', 340, 180);
      const k1a = a.part('aux_contact', 340, 260, { label: k1.label, props: { kind: 'NO', pins: '13-14' } }), h1 = a.part('pilot', 480, 260, { props: { colour: 'green' } });
      const CT = { colour: 'blue', gauge: '0.75', circuit: 'Motor M1 control' };
      a.wire(g1, '+', s0, '11', CT); a.wire(s0, '12', s1, '11', CT); a.wire(s1, '12', s2, '13', CT);
      a.wire(s2, '13', k1a, '1', CT); a.wire(s2, '14', k1a, '2', CT);
      a.wire(s2, '14', k1, 'A1', CT); a.wire(k1, 'A2', g1, '-', CT);
      a.wire(k1a, '2', h1, 'X1', CT); a.wire(h1, 'X2', g1, '-', CT);
    });
  }

  Object.assign(Loom, {
    MAINS_RULESET: RULESET, FACTORY_RULESET: FACTORY_RULES, TE_RATING, INSTALL_METHODS: METHODS, INSULATION_CONTACT: INSUL, MV_A_M, TE_CPC, ZE_DEFAULT, MOTOR_FLC, STARTING, APPLIANCES, MACHINES,
    motorFLC, rateCable, BUILDING_TYPES: BUILDINGS, COUNTRIES, householdChecks, maxDemand, factoryChecks, numberByPotential, circuitRows, terminalRows, plcRows, motorRows, loadAmps: (it) => loadAmps(it),
  });
  return Loom;
});
