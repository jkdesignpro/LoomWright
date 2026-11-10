/*
 * LoomWright starter circuits: ready-drawn, editable circuits to drop onto a sheet.
 * Each one is built from library parts so pins and references are always valid.
 * Values (fuse ratings, wire sizes, lengths) are typical starting points, not a design:
 * check them against the maker's instructions for the parts you fit.
 *
 * Extends window.Loom; needs loom-core.js and loom-data.js first.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./loom-data.js'); module.exports = factory(require('./loom-core.js')); }
  else factory(root.Loom);
})(typeof self !== 'undefined' ? self : this, function (Loom) {
  'use strict';
  const TEMPLATES = [];
  /* def(id, name, kind, description, draw): draw(api) places parts and wires with
     api.part(type, x, y, opts) and api.wire(fromPart, fromPin, toPart, toPin, opts). */
  function def(id, name, kind, description, draw) { TEMPLATES.push({ id, name, kind, description, draw }); }

  // ---------------- vehicle (12 V) ----------------
  def('spots', 'Spot lamps with relay', 'vehicle', 'Light bar or spot lamps switched by a relay from an illuminated dash switch. Take the switch feed from main beam instead if the lamps must only work with high beam.', (a) => {
    const feed = a.part('net_label', -120, 0, { label: '', props: { text: 'BATT +' } });
    const ign = a.part('net_label', -120, 160, { label: '', props: { text: 'IGN' } });
    const f1 = a.part('fuse', 80, -10, { props: { rating: '20A' } });
    const f2 = a.part('fuse', 80, 150, { props: { rating: '5A' } });
    const k = a.part('relay4', 220, -20, { props: { rating: '30A' } });
    const h = a.part('led_bar', 420, -30, { props: { watts: '2 × 60W' } });
    const s = a.part('switch_rocker_lit', 220, 160, { props: { legend: 'SPOTS' } });
    const e1 = a.part('ground_chassis', 360, 60), e2 = a.part('ground_chassis', 340, 220), e3 = a.part('ground_chassis', 560, 40);
    a.wire(feed, 'R', f1, '1', { gauge: '2.5', colour: 'brown', circuit: 'Spot lamps', length: 0.5 });
    a.wire(f1, '2', k, '30', { gauge: '2.5', colour: 'brown', tracer: 'red', circuit: 'Spot lamps', length: 1, current: 10 });
    a.wire(k, '87', h, '+', { gauge: '2.5', colour: 'purple', tracer: 'white', circuit: 'Spot lamps', length: 3.5, current: 10 });
    a.wire(h, '-', e3, 'G', { gauge: '2.5', colour: 'black', circuit: 'Spot lamps', length: 1 });
    a.wire(k, '85', e1, 'G', { gauge: '0.75', colour: 'black', circuit: 'Spot lamps', length: 0.3 });
    a.wire(ign, 'R', f2, '1', { gauge: '0.75', colour: 'white', circuit: 'Spot lamps switch', length: 0.5 });
    a.wire(f2, '2', s, '2', { gauge: '0.75', colour: 'green', circuit: 'Spot lamps switch', length: 2 });
    a.wire(s, '3', k, '86', { gauge: '0.75', colour: 'green', tracer: 'yellow', circuit: 'Spot lamps switch', length: 2 });
    a.wire(f2, '2', s, '7', { gauge: '0.5', colour: 'green', circuit: 'Switch lamp', length: 2 });
    a.wire(s, '8', e2, 'G', { gauge: '0.5', colour: 'black', circuit: 'Switch lamp', length: 0.5 });
  });
  def('split-vsr', 'Split charge with VSR', 'vehicle', 'Second battery charged through a voltage sensitive relay, fused at both batteries.', (a) => {
    const b1 = a.part('battery', 0, 0, { props: { volts: '12V', ah: '95Ah' } });
    const b2 = a.part('battery_aux', 520, 0, { props: { volts: '12V', ah: '100Ah' } });
    const f1 = a.part('fuse_maxi', 100, 10, { props: { rating: '80A', style: 'MIDI' } });
    const f2 = a.part('fuse_maxi', 380, 10, { props: { rating: '80A', style: 'MIDI' } });
    const v = a.part('vsr', 230, 0, { props: { amps: '140A' } });
    const e1 = a.part('ground_chassis', -20, 100), e2 = a.part('ground_chassis', 260, 120), e3 = a.part('ground_chassis', 500, 100);
    a.wire(b1, '+', f1, '1', { gauge: '16', colour: 'red', circuit: 'Split charge', length: 0.3 });
    a.wire(f1, '2', v, 'A', { gauge: '16', colour: 'red', circuit: 'Split charge', length: 0.5, current: 60 });
    a.wire(v, 'B', f2, '1', { gauge: '16', colour: 'red', circuit: 'Split charge', length: 3.5, current: 60 });
    a.wire(f2, '2', b2, '+', { gauge: '16', colour: 'red', circuit: 'Split charge', length: 0.3 });
    a.wire(v, 'GND', e2, 'G', { gauge: '1.0', colour: 'black', circuit: 'Split charge', length: 0.5 });
    a.wire(b1, '-', e1, 'G', { gauge: '16', colour: 'black', length: 0.4 });
    a.wire(b2, '-', e3, 'G', { gauge: '16', colour: 'black', length: 0.4 });
  });
  def('split-dcdc', 'Split charge with DC-DC charger', 'vehicle', 'Second battery charged by a DC-DC charger that starts with the ignition. Size the cable and fuses to the charger maker\'s table.', (a) => {
    const b1 = a.part('battery', 0, 0, { props: { volts: '12V', ah: '95Ah' } });
    const b2 = a.part('battery_aux', 560, 0, { props: { volts: '12V', ah: '100Ah' } });
    const f1 = a.part('fuse_maxi', 100, 10, { props: { rating: '40A', style: 'MIDI' } });
    const f2 = a.part('fuse_maxi', 420, 10, { props: { rating: '40A', style: 'MIDI' } });
    const u = a.part('dcdc', 240, 0, { props: { amps: '25A' } });
    const ign = a.part('net_label', 120, 120, { label: '', props: { text: 'IGN' } });
    const e1 = a.part('ground_chassis', -20, 100), e2 = a.part('ground_chassis', 380, 120), e3 = a.part('ground_chassis', 540, 100);
    a.wire(b1, '+', f1, '1', { gauge: '10', colour: 'red', circuit: 'Aux charging', length: 0.5 });
    a.wire(f1, '2', u, 'IN', { gauge: '10', colour: 'red', circuit: 'Aux charging', length: 4, current: 25 });
    a.wire(u, 'OUT', f2, '1', { gauge: '10', colour: 'red', circuit: 'Aux charging', length: 0.5, current: 25 });
    a.wire(f2, '2', b2, '+', { gauge: '10', colour: 'red', circuit: 'Aux charging', length: 0.5 });
    a.wire(ign, 'R', u, 'IGN', { gauge: '0.75', colour: 'white', circuit: 'Aux charging', length: 2 });
    a.wire(u, 'GND', e2, 'G', { gauge: '10', colour: 'black', circuit: 'Aux charging', length: 0.5 });
    a.wire(b1, '-', e1, 'G', { gauge: '16', colour: 'black', length: 0.4 });
    a.wire(b2, '-', e3, 'G', { gauge: '16', colour: 'black', length: 0.4 });
  });
  def('winch', 'Winch with isolator', 'vehicle', 'Electric winch and control box on heavy cable with an isolator and a fuse or breaker. Use the cable and fuse sizes the winch maker gives for your cable run.', (a) => {
    const b = a.part('battery', 0, 0, { props: { volts: '12V', ah: '95Ah' } });
    const iso = a.part('isolator', 100, 0, { props: { amps: '500A' } });
    const f = a.part('fuse_maxi', 200, 10, { props: { rating: '400A', style: 'ANL' } });
    const c = a.part('winch_control', 340, -20);
    const m = a.part('winch', 600, -10, { props: { lbs: '9500lb' } });
    const e1 = a.part('ground_chassis', -20, 100);
    a.wire(b, '+', iso, '1', { gauge: '35', colour: 'red', circuit: 'Winch', length: 0.5, notes: 'Winch cable: check the size against the winch maker\'s table' });
    a.wire(iso, '2', f, '1', { gauge: '35', colour: 'red', circuit: 'Winch', length: 0.3 });
    a.wire(f, '2', c, '+', { gauge: '35', colour: 'red', circuit: 'Winch', length: 3 });
    a.wire(c, '-', b, '-', { gauge: '35', colour: 'black', circuit: 'Winch', length: 3.5 });
    a.wire(c, 'A', m, 'A', { gauge: '35', colour: 'black', tracer: 'yellow', circuit: 'Winch', length: 0.6 });
    a.wire(c, 'F1', m, 'F1', { gauge: '35', colour: 'black', tracer: 'red', circuit: 'Winch', length: 0.6 });
    a.wire(c, 'F2', m, 'F2', { gauge: '35', colour: 'black', tracer: 'green', circuit: 'Winch', length: 0.6 });
    a.wire(m, '-', c, '-', { gauge: '35', colour: 'black', circuit: 'Winch', length: 0.6 });
    a.wire(b, '-', e1, 'G', { gauge: '35', colour: 'black', length: 0.4 });
  });
  def('compressor', 'Air compressor with pressure switch', 'vehicle', 'On-board compressor on a relay, switched from the dash and cut off by its pressure switch on the relay coil earth.', (a) => {
    const feed = a.part('net_label', -120, 0, { label: '', props: { text: 'BATT +' } });
    const ign = a.part('net_label', -120, 160, { label: '', props: { text: 'IGN' } });
    const f1 = a.part('fuse_maxi', 80, -10, { props: { rating: '60A', style: 'MIDI' } });
    const f2 = a.part('fuse', 80, 150, { props: { rating: '5A' } });
    const k = a.part('relay4', 240, -20, { props: { rating: '70A' } });
    const m = a.part('compressor', 440, -20, { props: { amps: '45A' } });
    const s = a.part('contura', 240, 140, { props: { legend: 'COMPRESSOR', action: 'ON-OFF' } });
    const ps = a.part('switch_pressure', 380, 60, { props: { what: 'Air tank, cuts out at set pressure' } });
    const e1 = a.part('ground_chassis', 480, 120), e2 = a.part('ground_chassis', 520, 60), e3 = a.part('ground_chassis', 360, 260);
    a.wire(feed, 'R', f1, '1', { gauge: '10', colour: 'brown', circuit: 'Compressor', length: 0.5 });
    a.wire(f1, '2', k, '30', { gauge: '10', colour: 'brown', circuit: 'Compressor', length: 1, current: 45 });
    a.wire(k, '87', m, '+', { gauge: '10', colour: 'red', circuit: 'Compressor', length: 1.5, current: 45 });
    a.wire(m, '-', e2, 'G', { gauge: '10', colour: 'black', circuit: 'Compressor', length: 0.5 });
    a.wire(k, '85', ps, '1', { gauge: '0.75', colour: 'black', tracer: 'white', circuit: 'Compressor', length: 1 });
    a.wire(ps, '2', e1, 'G', { gauge: '0.75', colour: 'black', circuit: 'Compressor', length: 0.3 });
    a.wire(ign, 'R', f2, '1', { gauge: '0.75', colour: 'white', circuit: 'Compressor switch', length: 0.5 });
    a.wire(f2, '2', s, '2', { gauge: '0.75', colour: 'green', circuit: 'Compressor switch', length: 2 });
    a.wire(s, '3', k, '86', { gauge: '0.75', colour: 'green', tracer: 'blue', circuit: 'Compressor switch', length: 2 });
    a.wire(f2, '2', s, '7', { gauge: '0.5', colour: 'green', circuit: 'Switch lamp', length: 2 });
    a.wire(s, '8', e3, 'G', { gauge: '0.5', colour: 'black', circuit: 'Switch lamp', length: 0.5 });
  });
  def('camera', 'Reversing camera and monitor', 'vehicle', 'Camera powered from the reversing lamp feed; the monitor runs on ignition and switches to the camera on the same feed.', (a) => {
    const rev = a.part('net_label', -120, 0, { label: '', props: { text: 'REVERSE LAMP' } });
    const ign = a.part('net_label', -120, 140, { label: '', props: { text: 'IGN' } });
    const f1 = a.part('fuse', 100, -10, { props: { rating: '2A' } });
    const f2 = a.part('fuse', 100, 130, { props: { rating: '3A' } });
    const cam = a.part('module', 240, -20, { label: 'U1', props: { left: 2, right: 1, names: '+12V,GND,VIDEO', text: 'CAMERA', amps: '0.3A' } });
    const mon = a.part('module', 460, 100, { label: 'U2', props: { left: 4, right: 0, names: '+12V,GND,VIDEO IN,TRIGGER', text: 'MONITOR', amps: '0.8A' } });
    const e1 = a.part('ground_chassis', 180, 60), e2 = a.part('ground_chassis', 400, 220);
    a.wire(rev, 'R', f1, '1', { gauge: '0.5', colour: 'green', tracer: 'brown', circuit: 'Reversing camera', length: 0.5 });
    a.wire(f1, '2', cam, 'L1', { gauge: '0.5', colour: 'green', tracer: 'brown', circuit: 'Reversing camera', length: 4 });
    a.wire(cam, 'L2', e1, 'G', { gauge: '0.5', colour: 'black', circuit: 'Reversing camera', length: 0.5 });
    a.wire(cam, 'R1', mon, 'L3', { gauge: '0.5', colour: 'yellow', circuit: 'Reversing camera video', length: 5, notes: 'Screened video cable' });
    a.wire(f1, '2', mon, 'L4', { gauge: '0.5', colour: 'green', tracer: 'brown', circuit: 'Reversing camera', length: 4 });
    a.wire(ign, 'R', f2, '1', { gauge: '0.5', colour: 'white', circuit: 'Monitor', length: 0.5 });
    a.wire(f2, '2', mon, 'L1', { gauge: '0.5', colour: 'green', circuit: 'Monitor', length: 2 });
    a.wire(mon, 'L2', e2, 'G', { gauge: '0.5', colour: 'black', circuit: 'Monitor', length: 0.5 });
  });

  /* Build a template as a block: { id, name, kind, description, parts, wires }. */
  function templateBlock(id, base) {
    const tpl = TEMPLATES.find((x) => x.id === id || x.name.toLowerCase() === String(id).toLowerCase());
    if (!tpl) throw new Error(`No starter circuit "${id}". Try: ${TEMPLATES.map((x) => x.id).join(', ')}`);
    const project = Loom.newDoc('template');
    if (base && base.settings) project.settings = { ...project.settings, standard: base.settings.standard, volts: base.settings.volts };
    const v = Loom.view(project, 0);
    const api = {
      part(type, x, y, opts = {}) { const o = { x, y, props: opts.props || {} }; if (opts.label != null) o.label = opts.label; if (opts.rot) o.rot = opts.rot; return Loom.addPart(v, type, o); },
      wire(a, ap, b, bp, opts = {}) { return Loom.addWire(v, { part: a.id, pin: ap }, { part: b.id, pin: bp }, { ...opts, length: opts.length != null ? String(opts.length) : '', current: opts.current != null ? String(opts.current) : '' }); },
    };
    tpl.draw(api);
    // net labels and pins are given their own references by the editor on insert
    return { id: 'tpl:' + tpl.id, name: tpl.name, kind: tpl.kind, description: tpl.description, parts: v.parts, wires: v.wires };
  }
  const templateList = (kind) => TEMPLATES.filter((x) => !kind || x.kind === kind).map(({ id, name, kind: k, description }) => ({ id, name, kind: k, description }));

  Object.assign(Loom, { TEMPLATES, defineTemplate: def, templateBlock, templateList });
  return Loom;
});
