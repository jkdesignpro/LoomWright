/*
 * LoomWright reference data: connector series, terminals, cable insulation,
 * sleeving, and connector parts built from them. Extends window.Loom.
 *
 * Part numbers are given where they are well established. Always check them
 * against the maker's current catalogue before ordering.
 *
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

  /* ---------------- Terminals (what goes on the end of a wire) ---------------- */
  // min/max are conductor sizes in mm². contact marks a connector contact.
  const TERMINALS = [
    { id: '', name: 'Not set', min: 0, max: 999 },
    { id: 'bare', name: 'Bare / tinned end', min: 0, max: 999 },
    { id: 'ferrule', name: 'Bootlace ferrule', min: 0.25, max: 50 },
    { id: 'solder', name: 'Soldered joint', min: 0, max: 999 },
    { id: 'butt', name: 'Butt splice', min: 0.5, max: 6 },
    { id: 'ring_m4_red', name: 'Ring M4, red (0.5–1.5)', min: 0.5, max: 1.5 },
    { id: 'ring_m5_red', name: 'Ring M5, red (0.5–1.5)', min: 0.5, max: 1.5 },
    { id: 'ring_m6_red', name: 'Ring M6, red (0.5–1.5)', min: 0.5, max: 1.5 },
    { id: 'ring_m5_blue', name: 'Ring M5, blue (1.5–2.5)', min: 1.5, max: 2.5 },
    { id: 'ring_m6_blue', name: 'Ring M6, blue (1.5–2.5)', min: 1.5, max: 2.5 },
    { id: 'ring_m8_blue', name: 'Ring M8, blue (1.5–2.5)', min: 1.5, max: 2.5 },
    { id: 'ring_m6_yellow', name: 'Ring M6, yellow (4–6)', min: 4, max: 6 },
    { id: 'ring_m8_yellow', name: 'Ring M8, yellow (4–6)', min: 4, max: 6 },
    { id: 'ring_m10_yellow', name: 'Ring M10, yellow (4–6)', min: 4, max: 6 },
    { id: 'lug_10_m8', name: 'Tube lug 10 mm², M8', min: 10, max: 10 },
    { id: 'lug_16_m8', name: 'Tube lug 16 mm², M8', min: 16, max: 16 },
    { id: 'lug_16_m10', name: 'Tube lug 16 mm², M10', min: 16, max: 16 },
    { id: 'lug_25_m8', name: 'Tube lug 25 mm², M8', min: 25, max: 25 },
    { id: 'lug_25_m10', name: 'Tube lug 25 mm², M10', min: 25, max: 25 },
    { id: 'lug_35_m8', name: 'Tube lug 35 mm², M8', min: 35, max: 35 },
    { id: 'lug_35_m10', name: 'Tube lug 35 mm², M10', min: 35, max: 35 },
    { id: 'lug_50_m10', name: 'Tube lug 50 mm², M10', min: 50, max: 50 },
    { id: 'lug_70_m10', name: 'Tube lug 70 mm², M10', min: 70, max: 70 },
    { id: 'spade_f63_red', name: 'Female spade 6.3, red (0.5–1.5)', min: 0.5, max: 1.5 },
    { id: 'spade_f63_blue', name: 'Female spade 6.3, blue (1.5–2.5)', min: 1.5, max: 2.5 },
    { id: 'spade_f63_yellow', name: 'Female spade 6.3, yellow (4–6)', min: 4, max: 6 },
    { id: 'spade_m63_red', name: 'Male spade 6.3, red (0.5–1.5)', min: 0.5, max: 1.5 },
    { id: 'spade_m63_blue', name: 'Male spade 6.3, blue (1.5–2.5)', min: 1.5, max: 2.5 },
    { id: 'spade_f28', name: 'Female spade 2.8 (0.5–1.0)', min: 0.35, max: 1.0 },
    { id: 'spade_f48', name: 'Female spade 4.8 (0.5–1.5)', min: 0.5, max: 1.5 },
    { id: 'bullet_m47', name: 'Bullet 4.7 male (0.5–2.0)', min: 0.5, max: 2.0 },
    { id: 'bullet_f47', name: 'Bullet 4.7 female (0.5–2.0)', min: 0.5, max: 2.0 },
    { id: 'dt16_pin', name: 'Deutsch size 16 pin 0460-202-16141', min: 0.5, max: 2.0, contact: 'pin' },
    { id: 'dt16_socket', name: 'Deutsch size 16 socket 0462-201-16141', min: 0.5, max: 2.0, contact: 'socket' },
    { id: 'dt20_pin', name: 'Deutsch size 20 pin 0460-202-20141', min: 0.35, max: 1.5, contact: 'pin' },
    { id: 'dt20_socket', name: 'Deutsch size 20 socket 0462-201-20141', min: 0.35, max: 1.5, contact: 'socket' },
    { id: 'dt12_pin', name: 'Deutsch size 12 pin 0460-204-12141', min: 2.0, max: 6.0, contact: 'pin' },
    { id: 'dt12_socket', name: 'Deutsch size 12 socket 0462-203-12141', min: 2.0, max: 6.0, contact: 'socket' },
    { id: 'ss15_tab', name: 'Superseal 1.5 tab (male)', min: 0.5, max: 1.5, contact: 'pin' },
    { id: 'ss15_rec', name: 'Superseal 1.5 receptacle (female)', min: 0.5, max: 1.5, contact: 'socket' },
    { id: 'mp150_m', name: 'Metri-Pack 150 male', min: 0.35, max: 0.8, contact: 'pin' },
    { id: 'mp150_f', name: 'Metri-Pack 150 female', min: 0.35, max: 0.8, contact: 'socket' },
    { id: 'mp280_m', name: 'Metri-Pack 280 male', min: 0.8, max: 3.0, contact: 'pin' },
    { id: 'mp280_f', name: 'Metri-Pack 280 female', min: 0.8, max: 3.0, contact: 'socket' },
    { id: 'eco_m', name: 'Econoseal J tab', min: 0.5, max: 2.0, contact: 'pin' },
    { id: 'eco_f', name: 'Econoseal J receptacle', min: 0.5, max: 2.0, contact: 'socket' },
    { id: 'sb50_10', name: 'Anderson SB50 contact 10 AWG (6 mm²)', min: 4, max: 6, contact: 'both' },
    { id: 'sb50_6', name: 'Anderson SB50 contact 6 AWG (16 mm²)', min: 10, max: 16, contact: 'both' },
    { id: 'sb120_2', name: 'Anderson SB120 contact 2 AWG (35 mm²)', min: 25, max: 35, contact: 'both' },
    { id: 'sb175_10', name: 'Anderson SB175 contact 1/0 AWG (50 mm²)', min: 35, max: 50, contact: 'both' },
    { id: 'pp30', name: 'Anderson Powerpole 30 A contact', min: 0.5, max: 4, contact: 'both' },
    { id: 'pp45', name: 'Anderson Powerpole 45 A contact', min: 1.5, max: 6, contact: 'both' },
  ];

  /* ---------------- Connector series ---------------- */
  // ways: allowed cavity counts. housing(ways, gender) gives a part number where known.
  const SERIES = [
    { id: 'generic', name: 'Generic connector', ways: null, pin: '', socket: '', sealed: false, rating: '' },
    { id: 'dt', name: 'Deutsch DT', ways: [2, 3, 4, 6, 8, 12], pin: 'dt16_pin', socket: 'dt16_socket', sealed: true, rating: '13 A per contact, 0.5–2.0 mm²',
      housing: (n, g) => (g === 'receptacle' ? `DT04-${n}P` : `DT06-${n}S`), lock: (n, g) => (g === 'receptacle' ? `W${n}P` : `W${n}S`), plug: '114017 cavity plug' },
    { id: 'dtm', name: 'Deutsch DTM', ways: [2, 3, 4, 6, 8, 12], pin: 'dt20_pin', socket: 'dt20_socket', sealed: true, rating: '7.5 A per contact, 0.35–1.5 mm²',
      housing: (n, g) => (g === 'receptacle' ? `DTM04-${n}P` : `DTM06-${n}S`), lock: (n, g) => (g === 'receptacle' ? `WM${n}P` : `WM${n}S`), plug: '0413-204-2005 cavity plug' },
    { id: 'dtp', name: 'Deutsch DTP', ways: [2, 4], pin: 'dt12_pin', socket: 'dt12_socket', sealed: true, rating: '25 A per contact, 2.0–6.0 mm²',
      housing: (n, g) => (g === 'receptacle' ? `DTP04-${n}P` : `DTP06-${n}S`), plug: '' },
    { id: 'superseal15', name: 'TE Superseal 1.5', ways: [1, 2, 3, 4, 5, 6], pin: 'ss15_tab', socket: 'ss15_rec', sealed: true, rating: '14 A, 0.5–1.5 mm²',
      // receptacle side holds the tabs (tab housing); plug side holds the receptacle contacts
      housing: (n, g) => (g === 'receptacle' ? ({ 1: '282079-2', 2: '282080-1', 3: '282087-1', 4: '282088-1', 5: '282089-1', 6: '282090-1' })[n] : ({ 1: '282103-1', 2: '282104-1', 3: '282105-1', 4: '282106-1', 5: '282107-1', 6: '282108-1' })[n]) || '', plug: 'cavity plug' },
    { id: 'econoseal_j', name: 'TE Econoseal J Mark II', ways: [1, 2, 3, 4, 6, 8, 10, 12], pin: 'eco_m', socket: 'eco_f', sealed: true, rating: '20 A, 0.5–2.0 mm²', housing: () => '', plug: 'cavity plug' },
    { id: 'mp150', name: 'Aptiv Metri-Pack 150', ways: [1, 2, 3, 4, 5, 6], pin: 'mp150_m', socket: 'mp150_f', sealed: true, rating: '14 A, 0.35–0.8 mm²', housing: () => '' },
    { id: 'mp280', name: 'Aptiv Metri-Pack 280', ways: [1, 2, 3, 4, 6], pin: 'mp280_m', socket: 'mp280_f', sealed: true, rating: '30 A, 0.8–3.0 mm²', housing: () => '' },
    { id: 'bullet47', name: 'Bullet 4.7 mm (classic Land Rover)', ways: [1, 2, 3, 4], pin: 'bullet_m47', socket: 'bullet_f47', sealed: false, rating: '15 A, 0.5–2.0 mm²', housing: (n) => `${n}-way bullet sleeve` },
    { id: 'spade63', name: 'Spade 6.3 mm (Lucar)', ways: [1, 2, 3, 4], pin: 'spade_m63_red', socket: 'spade_f63_red', sealed: false, rating: '20 A', housing: () => '' },
    { id: 'sb50', name: 'Anderson SB50', ways: [2], pin: 'sb50_10', socket: 'sb50_10', sealed: false, rating: '50 A (hermaphroditic)', housing: () => 'SB50 housing 6331G1 (grey)' },
    { id: 'sb120', name: 'Anderson SB120', ways: [2], pin: 'sb120_2', socket: 'sb120_2', sealed: false, rating: '120 A (hermaphroditic)', housing: () => 'SB120 housing' },
    { id: 'sb175', name: 'Anderson SB175', ways: [2], pin: 'sb175_10', socket: 'sb175_10', sealed: false, rating: '175 A (hermaphroditic)', housing: () => 'SB175 housing' },
    { id: 'powerpole', name: 'Anderson Powerpole', ways: [1, 2, 3, 4], pin: 'pp30', socket: 'pp30', sealed: false, rating: '30 A or 45 A (hermaphroditic)', housing: () => 'PP15/45 housing' },
  ];
  const seriesById = (id) => SERIES.find((s) => s.id === id) || SERIES[0];
  const nearestWays = (s, n) => (s.ways ? s.ways.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), s.ways[0]) : Math.max(1, Math.min(64, n | 0)));

  /* ---------------- Cable insulation and sleeving ---------------- */
  const INSULATION = [
    { id: '', name: 'Not set', wall: 0.6, temp: '' },
    { id: 'flry_b', name: 'Thin-wall FLRY-B', wall: 0.28, temp: '105 °C' },
    { id: 'fly', name: 'Standard PVC (FLY)', wall: 0.6, temp: '70–105 °C' },
    { id: 'txl', name: 'TXL (thin XLPE)', wall: 0.2, temp: '125 °C' },
    { id: 'gxl', name: 'GXL (XLPE)', wall: 0.4, temp: '125 °C' },
    { id: 'sxl', name: 'SXL (heavy XLPE)', wall: 0.8, temp: '125 °C' },
    { id: 'tefzel', name: 'Tefzel / ETFE (Spec 55)', wall: 0.2, temp: '150 °C' },
    { id: 'silicone', name: 'Silicone', wall: 0.8, temp: '180 °C' },
    { id: 'battery', name: 'Battery / welding cable', wall: 1.2, temp: '90 °C' },
  ];
  const SLEEVING = [
    { id: '', name: 'None' },
    { id: 'conduit', name: 'Convoluted conduit', sizes: [7, 10, 13, 17, 21, 29, 36] },
    { id: 'conduit_split', name: 'Split convoluted conduit', sizes: [7, 10, 13, 17, 21, 29, 36] },
    { id: 'braid', name: 'Braided PET sleeve', sizes: [6, 10, 13, 19, 25, 32] },
    { id: 'heatshrink', name: 'Heat-shrink sleeve (DR-25 type)', sizes: [6, 9, 12, 18, 24, 32] },
    { id: 'cloth', name: 'Cloth harness tape', sizes: null },
    { id: 'pvc_tape', name: 'PVC tape', sizes: null },
  ];
  /* Outside diameter in mm of one insulated wire, from size and insulation. */
  function wireOD(mm2, insulation) {
    const a = parseFloat(mm2) || 1, ins = INSULATION.find((x) => x.id === (insulation || '')) || INSULATION[0];
    return Math.sqrt((4 * a) / Math.PI) * 1.15 + 2 * ins.wall;
  }
  /* Bundle diameter for a list of wires, with a packing allowance. */
  function bundleDiameter(wires) {
    const s = wires.reduce((acc, w) => acc + wireOD(w.gauge, w.insulation) ** 2, 0);
    return s ? Math.sqrt(s) * 1.15 : 0;
  }
  function suggestSleeve(kind, dia) {
    const sl = SLEEVING.find((x) => x.id === kind);
    if (!sl || !sl.sizes) return '';
    const need = dia * 1.25, size = sl.sizes.find((x) => x >= need);
    return size ? `${size} mm` : `over ${sl.sizes[sl.sizes.length - 1]} mm`;
  }

  /* ---------------- Connector parts ---------------- */
  function seriesConnector(p) {
    const s = seriesById(p.series), n = nearestWays(s, parseInt(p.ways, 10) || 2), rec = p.gender === 'receptacle';
    const h = n * 20 + 20, shapes = [], pins = [];
    // receptacle (pins) drawn square; plug (sockets) drawn with a rounded nose
    shapes.push(rec ? R(8, 4, 30, h - 8, { sw: 1.8 }) : P(`M8 4 H30 a8 8 0 0 1 8 8 V${h - 12} a8 8 0 0 1 -8 8 H8 Z`, { fill: 'paper', w: 1.8 }));
    for (let i = 0; i < n; i++) {
      const y = 20 + i * 20;
      shapes.push(L(0, y, 8, y), T(14, y + 3, i + 1, { size: 7, anchor: 'start' }));
      shapes.push(rec ? L(26, y, 34, y, { w: 2.4 }) : C(30, y, 3, { fill: 'none', w: 1.4 }));
      pins.push(pin(i + 1, 0, y, `Cavity ${i + 1}`));
    }
    return { w: 40, h, pins, shapes };
  }
  lib.conn = {
    id: 'conn', name: 'Connector (series)', cat: 'Wiring & connectors', prefix: 'X', tags: 'deutsch dt dtm dtp superseal econoseal metri-pack anderson powerpole bullet lucar spade',
    props: [
      { k: 'series', l: 'Series', d: 'dt', type: 'select', options: SERIES.map((s) => [s.id, s.name]) },
      { k: 'ways', l: 'Ways', d: 4, type: 'int', min: 1, max: 64 },
      { k: 'gender', l: 'Side', d: 'plug', type: 'select', options: [['plug', 'Plug (sockets)'], ['receptacle', 'Receptacle (pins)']] },
      { k: 'mpn', l: 'Housing part no.', d: '' },
      { k: 'mate', l: 'Mates with (reference)', d: '' },
    ],
    sub: '{seriesName} {mpnShown}',
    gen(p) { return seriesConnector(p); },
    derive(p) {
      const s = seriesById(p.series), n = nearestWays(s, parseInt(p.ways, 10) || 2);
      return { ways: n, seriesName: s.id === 'generic' ? '' : s.name.replace(/^(TE|Aptiv|Anderson) /, ''), mpnShown: p.mpn || (s.housing ? s.housing(n, p.gender) || '' : '') };
    },
  };
  lib.contura = {
    id: 'contura', name: 'Rocker switch, 8 pin (Contura style)', cat: 'Switches', prefix: 'S', w: 80, h: 100, tags: 'carling contura rocker',
    props: [{ k: 'legend', l: 'Legend', d: 'WORK LIGHTS' }, { k: 'action', l: 'Action', d: 'ON-OFF' }], sub: '{legend}',
    pins: [pin(1, 0, 20, '1'), pin(2, 0, 40, '2 (common, pole 1)'), pin(3, 0, 60, '3'), pin(4, 80, 20, '4'), pin(5, 80, 40, '5 (common, pole 2)'), pin(6, 80, 60, '6'), pin(7, 0, 80, '7 lamp (see datasheet)'), pin(8, 80, 80, '8 lamp (see datasheet)')],
    shapes: [R(8, 4, 64, 92, { rx: 6 }), ...[20, 40, 60].flatMap((y) => [L(0, y, 8, y), L(72, y, 80, y)]), L(0, 80, 8, 80), L(72, 80, 80, 80),
      L(14, 40, 30, 28, { w: 1.8 }), C(14, 40, 2), C(32, 20, 2), C(32, 60, 2), L(66, 40, 50, 28, { w: 1.8 }), C(66, 40, 2), C(48, 20, 2), C(48, 60, 2),
      L(8, 20, 32, 20, { w: 1 }), L(8, 60, 32, 60, { w: 1 }), L(8, 40, 14, 40, { w: 1 }), L(72, 20, 48, 20, { w: 1 }), L(72, 60, 48, 60, { w: 1 }), L(72, 40, 66, 40, { w: 1 }),
      C(40, 80, 6, { w: 1.4 }), L(36, 76, 44, 84, { w: 1 }), L(44, 76, 36, 84, { w: 1 }), L(8, 80, 34, 80, { w: 1 }), L(46, 80, 72, 80, { w: 1 }),
      T(16, 16, '1', { size: 6 }), T(16, 36, '2', { size: 6 }), T(16, 66, '3', { size: 6 }), T(64, 16, '4', { size: 6 }), T(64, 36, '5', { size: 6 }), T(64, 66, '6', { size: 6 }), T(16, 92, '7', { size: 6 }), T(64, 92, '8', { size: 6 })],
  };

  /* Classic British parts found on older Land Rovers. Terminal names are the
     ones stamped on the parts; check yours before wiring. */
  lib.relay_6ra = {
    id: 'relay_6ra', name: 'Lucas 6RA relay', cat: 'Relays & control', prefix: 'K', w: 80, h: 80, tags: 'land rover lucas classic series defender',
    props: [{ k: 'rating', l: 'Contact rating', d: '17A' }], sub: '{rating}',
    pins: [pin('W1', 0, 20, 'W1 coil'), pin('W2', 0, 60, 'W2 coil'), pin('C1', 80, 20, 'C1 contact'), pin('C2', 80, 60, 'C2 contact')],
    shapes: [R(8, 4, 64, 72, { rx: 3 }), L(0, 20, 8, 20), L(0, 60, 8, 60), L(72, 20, 80, 20), L(72, 60, 80, 60),
      R(16, 28, 14, 24, { sw: 1.6 }), L(23, 20, 23, 28, { w: 1.2 }), L(23, 52, 23, 60, { w: 1.2 }), L(8, 20, 23, 20, { w: 1.2 }), L(8, 60, 23, 60, { w: 1.2 }), L(17, 50, 29, 30, { w: 1.2 }),
      L(72, 20, 56, 20, { w: 1.2 }), L(56, 20, 56, 32, { w: 1.2 }), L(56, 32, 48, 46, { w: 1.8 }), C(56, 32, 2), L(56, 48, 56, 60, { w: 1.2 }), L(56, 60, 72, 60, { w: 1.2 }), C(56, 48, 2), L(30, 40, 50, 40, { w: 1, dash: '3 2' }),
      T(14, 16, 'W1', { size: 6 }), T(14, 72, 'W2', { size: 6 }), T(66, 16, 'C1', { size: 6 }), T(66, 72, 'C2', { size: 6 })],
  };
  lib.fuse_box_lucas = {
    id: 'fuse_box_lucas', name: 'Lucas-style 4-way fuse box (glass fuses)', cat: 'Protection', prefix: 'FB', w: 80, h: 100, tags: 'land rover lucas classic series defender 7fj glass',
    props: [{ k: 'ratings', l: 'Ratings, top to bottom', d: '35A,35A,25A,25A' }], sub: '{ratings}',
    pins: [1, 3, 5, 7].map((n, i) => pin(n, 0, 20 + i * 20, `${n} supply side, fuse ${i + 1}`)).concat([2, 4, 6, 8].map((n, i) => pin(n, 80, 20 + i * 20, `${n} load side, fuse ${i + 1}`))),
    shapes: [R(8, 4, 64, 92, { rx: 3 }), ...[0, 1, 2, 3].flatMap((i) => { const y = 20 + i * 20; return [L(0, y, 20, y), L(60, y, 80, y), R(20, y - 4, 40, 8, { sw: 1.2, rx: 4 }), L(22, y, 58, y, { w: 1 }), T(14, y - 4, String(i * 2 + 1), { size: 6 }), T(66, y - 4, String(i * 2 + 2), { size: 6 })]; })],
  };

  /* Electronic power distribution module (PDM): outputs switched by inputs, each with its own current limit.
     Generic: set the channel limits and which input switches each output from the maker's configuration. */
  lib.pdm = {
    id: 'pdm', name: 'Power distribution module (electronic)', cat: 'Protection', prefix: 'PDM', tags: 'pdm solid state fuse box programmable can keypad power module',
    props: [
      { k: 'outputs', l: 'Outputs', d: 8, type: 'int', min: 1, max: 32 },
      { k: 'inputs', l: 'Inputs', d: 4, type: 'int', min: 0, max: 16 },
      { k: 'limits', l: 'Output limits, amps (comma list)', d: '15,15,15,15,10,10,5,5' },
      { k: 'control', l: 'What switches each output (IN1, IN2… or ALWAYS)', d: 'IN1,IN2,IN3,IN4,ALWAYS,ALWAYS,IN1,IN2' },
      { k: 'active', l: 'Inputs switch on when', d: 'high', type: 'select', options: [['high', 'fed with + (active high)'], ['low', 'earthed (active low)']] },
      { k: 'can', l: 'CAN bus pins', d: 'yes', type: 'select', options: [['yes', 'Yes'], ['no', 'No']] },
    ],
    sub: '{outputs} outputs',
    gen(p) {
      const no = Math.max(1, parseInt(p.outputs, 10) || 1), ni = Math.max(0, parseInt(p.inputs, 10) || 0), can = p.can !== 'no';
      const limits = String(p.limits || '').split(',').map((x) => x.trim()), ctl = String(p.control || '').split(',').map((x) => x.trim().toUpperCase());
      const left = [['BAT', 'Battery + (main feed)'], ['GND', 'Ground']].concat(seq(ni, (i) => ['IN' + (i + 1), 'Input ' + (i + 1)])).concat(can ? [['CANH', 'CAN high'], ['CANL', 'CAN low']] : []);
      const n = Math.max(left.length, no), h = n * 20 + 20, w = 140;
      const shapes = [R(10, 0, 120, h, { rx: 4 }), T(70, 14, 'PDM', { size: 9, weight: 700 })];
      const pins = [];
      left.forEach(([id, nm], i) => { const y = 20 + i * 20; shapes.push(L(0, y, 10, y, { w: id === 'BAT' ? 3 : 2 }), T(14, y + 3, id, { size: 7, anchor: 'start' })); pins.push(pin(id, 0, y, nm)); });
      for (let i = 0; i < no; i++) {
        const y = 20 + i * 20, id = 'OUT' + (i + 1), lim = limits[i] ? limits[i].replace(/a$/i, '') + 'A' : '', c = ctl[i] || 'ALWAYS';
        shapes.push(L(130, y, 140, y), T(126, y + 3, `${id}${lim ? ' ' + lim : ''}`, { size: 7, anchor: 'end' }), T(72, y + 3, c === 'ALWAYS' ? '' : c, { size: 6, anchor: 'middle', color: '#5b625e' }));
        pins.push(pin(id, w, y, `Output ${i + 1}${lim ? ' (' + lim + ')' : ''}, ${c === 'ALWAYS' ? 'always on' : 'switched by ' + c}`));
      }
      return { w, h, pins, shapes };
    },
  };
  /* CAN bus terminating resistor (one at each end of the bus). */
  lib.can_term = {
    id: 'can_term', name: 'CAN bus terminator (120 Ω)', cat: 'Electronics', prefix: 'RT', w: 60, h: 40, tags: 'can bus termination resistor 120 ohm',
    props: [{ k: 'value', l: 'Value', d: '120Ω' }], sub: '{value}',
    pins: [pin('CANH', 0, 10, 'CAN high'), pin('CANL', 0, 30, 'CAN low')],
    shapes: [R(14, 4, 40, 32, { rx: 3 }), L(0, 10, 14, 10), L(0, 30, 14, 30), L(24, 10, 34, 10, { w: 1.2 }), L(24, 30, 34, 30, { w: 1.2 }), L(34, 6, 34, 34, { w: 1.2 }), R(30, 14, 8, 12, { sw: 1.2 }), T(46, 23, 'T', { size: 8, weight: 600 })],
  };

  /* ---------------- Behaviour of parts in a circuit ---------------- */
  // links: pin pairs that are always joined (wiring parts).
  // switched(p, state): pin pairs joined in the given state.
  // load: pins of a consumer; earthPins identify its return side.
  const PROTECT = ['fuse', 'fuse_maxi', 'fusible_link', 'breaker'];
  function seq(n, f) { return Array.from({ length: n }, (_, i) => f(i)); }
  function behaviour(doc, p) {
    const r = Loom.resolved(doc, p), ids = r.pins.map((x) => x.id), t = p.type;
    const B = { links: [], switched: null, kind: 'other', states: null };
    const pr = r.props || {};
    if (t === 'splice') return B;
    if (t === 'busbar') { B.links = ids.slice(1).map((id) => [ids[0], id]); B.kind = 'wiring'; return B; }
    if (t === 'terminal_block' || t === 'connector') { B.links = seq(ids.length / 2, (i) => ['A' + (i + 1), 'B' + (i + 1)]); B.kind = 'wiring'; return B; }
    if (t === 'grommet') { B.links = [['A', 'B']]; B.kind = 'wiring'; return B; }
    if (t === 'offpage' || t === 'net_label') { B.links = [['L', 'R']]; B.kind = 'wiring'; return B; }
    if (t === 'shunt' || t === 'ammeter') { B.links = t === 'shunt' ? [['BAT', 'LOAD']] : [['+', '-']]; B.kind = 'wiring'; return B; }
    if (/^ground|earth_stud/.test(t)) { B.kind = 'earth'; return B; }
    if (t === 'battery' || t === 'battery_aux') { B.kind = 'source'; B.source = '+'; B.ret = '-'; return B; }
    if (t === 'alternator') { B.kind = 'source'; B.source = 'B+'; B.ret = '-'; B.states = ['Engine off', 'Engine running']; B.sourceWhen = (s) => s === 1; return B; }
    if (t === 'solar') { B.kind = 'source'; B.source = '+'; B.ret = '-'; B.states = ['Dark', 'Sun']; B.sourceWhen = (s) => s === 1; return B; }
    if (t === 'dcdc') { B.kind = 'converter'; B.input = 'IN'; B.output = 'OUT'; B.enable = 'IGN'; B.ret = 'GND'; return B; }
    if (PROTECT.includes(t)) { B.kind = 'protect'; B.states = ['OK', 'Blown']; B.switched = (s) => (s === 1 ? [] : [['1', '2']]); B.rating = parseAmps(pr.rating); return B; }
    if (t === 'fuse_box') { B.kind = 'protect'; B.switched = () => ids.filter((x) => x !== 'IN').map((x) => ['IN', x]); return B; }
    if (t === 'isolator') { B.kind = 'switch'; B.states = ['Off', 'On']; B.def = 1; B.switched = (s) => (s ? [['1', '2']] : []); return B; }
    if (['switch_spst', 'switch_push_no', 'switch_pressure', 'switch_temp'].includes(t)) { B.kind = 'switch'; B.states = ['Open', 'Closed']; B.switched = (s) => (s ? [['1', '2']] : []); return B; }
    if (t === 'switch_push_nc') { B.kind = 'switch'; B.states = ['Closed', 'Pressed (open)']; B.switched = (s) => (s ? [] : [['1', '2']]); return B; }
    if (t === 'switch_door') { B.kind = 'switch'; B.states = ['Door shut', 'Door open']; B.earthWhen = (s) => s === 1; return B; }
    if (t === 'switch_spdt') { B.kind = 'switch'; B.states = ['Position 1', 'Position 2']; B.switched = (s) => [['C', s ? '2' : '1']]; return B; }
    if (t === 'switch_dpdt') { B.kind = 'switch'; B.states = ['Position A', 'Position B']; B.switched = (s) => (s ? [['C1', '1B'], ['C2', '2B']] : [['C1', '1A'], ['C2', '2A']]); return B; }
    if (t === 'switch_rocker_lit') { B.kind = 'switch'; B.states = ['Off', 'On']; B.switched = (s) => (s ? [['2', '3']] : []); B.lamp = ['7', '8']; return B; }
    if (t === 'contura') { B.kind = 'switch'; B.states = ['Down', 'Off', 'Up']; B.def = 1; B.switched = (s) => (s === 0 ? [['2', '3'], ['5', '6']] : s === 2 ? [['2', '1'], ['5', '4']] : []); B.lamp = ['7', '8']; return B; }
    if (t === 'switch_rotary') { const n = parseInt(pr.positions, 10) || 3; B.kind = 'switch'; B.states = ['Off', ...seq(n, (i) => 'Position ' + (i + 1))]; B.switched = (s) => (s ? [['C', String(s)]] : []); return B; }
    if (t === 'ignition_switch') { B.kind = 'switch'; B.states = ['0 Off', 'I Accessory', 'II Ignition', 'III Start']; B.switched = (s) => [s === 1 || s === 2 ? ['30', '75'] : null, s >= 2 ? ['30', '15'] : null, s === 3 ? ['30', '50'] : null].filter(Boolean); return B; }
    if (t === 'relay4' || t === 'timer_relay') { B.kind = 'relay'; B.coil = ['86', '85']; B.contacts = (on) => (on ? [['30', '87']] : []); B.rating = parseAmps(pr.rating) || 30; return B; }
    if (t === 'relay5') { B.kind = 'relay'; B.coil = ['86', '85']; B.contacts = (on) => (on ? [['30', '87']] : [['30', '87a']]); B.rating = parseAmps(pr.rating) || 30; return B; }
    if (t === 'relay_6ra') { B.kind = 'relay'; B.coil = ['W1', 'W2']; B.contacts = (on) => (on ? [['C1', 'C2']] : []); B.rating = parseAmps(pr.rating) || 17; return B; }
    if (t === 'fuse_box_lucas') { B.kind = 'protect'; B.switched = () => [['1', '2'], ['3', '4'], ['5', '6'], ['7', '8']]; B.multi = true; return B; }
    if (t === 'relay_ssr') { B.kind = 'relay'; B.coil = ['3', '4']; B.contacts = (on) => (on ? [['1', '2']] : []); B.rating = parseAmps(pr.rating) || 40; return B; }
    if (t === 'vsr') { B.kind = 'switch'; B.states = ['Open', 'Combined']; B.switched = (s) => (s ? [['A', 'B']] : []); B.ret = 'GND'; return B; }
    if (t === 'flasher') { B.kind = 'switch'; B.states = ['Off', 'Flashing (on)']; B.def = 1; B.switched = (s) => (s ? [['B', 'L']] : []); return B; }
    if (t === 'diode' || t === 'zener' || t === 'led') { B.kind = t === 'led' ? 'load' : 'diode'; if (t === 'led') { B.power = ['A']; B.earth = ['K']; } B.anode = 'A'; B.cathode = 'K'; return B; }
    if (t === 'pdm') {
      const no = Math.max(1, parseInt(pr.outputs, 10) || 1), ni = Math.max(0, parseInt(pr.inputs, 10) || 0);
      const limits = String(pr.limits || '').split(',').map((x) => parseAmps(x)), ctl = String(pr.control || '').split(',').map((x) => x.trim().toUpperCase());
      B.kind = 'pdm'; B.input = 'BAT'; B.ret = 'GND'; B.inputs = seq(ni, (i) => 'IN' + (i + 1));
      B.outputs = seq(no, (i) => ({ pin: 'OUT' + (i + 1), rating: limits[i] || null, control: ctl[i] || 'ALWAYS', active: pr.active === 'low' ? 'low' : 'high' }));
      return B;
    }
    if (t === 'can_term') { B.kind = 'other'; return B; }
    if (t === 'winch_control') { B.kind = 'switch'; B.states = ['Stop', 'Wind in', 'Wind out']; B.switched = (s) => (s ? [['+', 'A']] : []); B.ret = '-'; return B; }
    const def = r.def || {};
    if (def.cat === 'Annotation' || !ids.length) return B;
    if (['module', 'ic', 'regulator', 'npn', 'pnp', 'nmos', 'potentiometer', 'resistor', 'capacitor', 'capacitor_pol', 'inductor', 'conn', 'plug', 'sender', 'sensor3', 'socket_12v', 'socket_usb', 'inverter', 'starter_motor', 'gauge', 'voltmeter', 'switch_door'].includes(t) || def.custom) {
      // treated as a load if it has an obvious supply and earth pin
      const earth = ids.filter(isEarthPin), power = ids.filter((x) => !isEarthPin(x) && isSupplyPin(r, x));
      if (earth.length && power.length) { B.kind = 'load'; B.power = power; B.earth = earth; }
      if (t === 'starter_motor') { B.kind = 'load'; B.power = ['50']; B.earth = ['31']; B.through = ['30']; }
      return B;
    }
    // everything else consumes current between its supply pins and its earth pins
    let earth = ids.filter(isEarthPin), power = ids.filter((x) => !earth.includes(x));
    if (!earth.length && ids.length === 2) { earth = [ids[1]]; power = [ids[0]]; B.either = true; }
    if (earth.length && power.length) { B.kind = 'load'; B.power = power; B.earth = earth; }
    if (B.lamp) {/* handled by switch */}
    return B;
  }
  function isEarthPin(id) { return /^(-|−|31|31b|E|GND|G|K|85)$/i.test(String(id)) && String(id) !== 'G1'; }
  function isSupplyPin(r, id) { const pn = r.pins.find((x) => x.id === id); const s = (id + ' ' + ((pn && pn.n) || '')).toLowerCase(); return /\+|12v|24v|ign|supply|feed|batt|power|vcc|v\+|in\b|^1$|^l1/.test(s); }
  function parseAmps(s) { const m = /([\d.]+)\s*A?/i.exec(String(s || '')); return m ? parseFloat(m[1]) : null; }
  /* Current a part draws, from its fields (amps, or watts at the system voltage). */
  function partCurrent(doc, p) {
    const pr = Loom.resolved(doc, p).props || {}, v = parseFloat((doc.settings || {}).volts) || 12;
    if (pr.amps && /A/i.test(String(pr.amps)) && !/Ah/i.test(String(pr.amps))) return parseFloat(String(pr.amps)) || 0;
    if (p.type === 'load' && pr.amps) return parseFloat(pr.amps) || 0;
    if (pr.watts) {
      const s = String(pr.watts), mul = /(\d+)\s*[×x*]\s*([\d.]+)/.exec(s);
      const w = mul ? +mul[1] * parseFloat(mul[2]) : parseFloat(s);
      if (w) return w / v;
    }
    if (p.current) return parseFloat(p.current) || 0;
    return 0;
  }

  Object.assign(Loom, { TERMINALS, SERIES, INSULATION, SLEEVING, seriesById, nearestWays, wireOD, bundleDiameter, suggestSleeve, behaviour, partCurrent, parseAmps, isEarthPin, PROTECT });
  return Loom;
});
