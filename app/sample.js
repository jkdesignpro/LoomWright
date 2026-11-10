/*
 * Example project shown on first launch: dual battery charging on sheet 1,
 * auxiliary lighting and accessories on sheet 2.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core/loom-core.js'));
  else root.LoomSample = factory(root.Loom);
})(typeof self !== 'undefined' ? self : this, function (Loom) {
  'use strict';
  return function sample() {
    const project = Loom.newDoc('Defender 110 auxiliary electrics (example)');
    project.meta.project = 'Defender 110';
    project.harnesses = ['Engine bay', 'Dash', 'Rear body'];
    project.sheets[0].name = 'Charging and aux supply';
    project.sheets.push(Loom.newSheet('Auxiliary lighting and accessories'));

    // ---- Sheet 1: charging ----
    let d = Loom.view(project, 0);
    let P = (type, x, y, opts = {}) => Loom.addPart(d, type, { x, y, ...opts });
    P('battery', 40, 100, { label: 'BAT1', props: { ah: '95Ah' } });
    P('fuse_maxi', 160, 110, { label: 'F1', props: { rating: '40A' } });
    P('dcdc', 300, 100, { label: 'U1', props: { amps: '25A' } });
    P('fuse_maxi', 460, 110, { label: 'F2', props: { rating: '40A' } });
    P('battery_aux', 560, 200, { label: 'BAT2', props: { ah: '100Ah' } });
    P('fuse_maxi', 700, 210, { label: 'F3', props: { rating: '80A', style: 'MIDI' } });
    P('net_label', 160, 150, { label: 'N1', props: { text: 'IGN 15 (+12V)' } });
    P('offpage', 840, 210, { label: 'REF1', props: { text: 'TO FB1 SHEET 2' } });
    let E = (x, y) => P('ground_chassis', x, y);
    const e1 = E(0, 150), e2 = E(380, 190), e3 = E(500, 250);
    P('note', 40, 330, { props: { text: 'Example project. Replace with your own circuits; values are illustrative.', size: 11 } });
    let W = (a, b, o) => Loom.addWire(d, a, b, o);
    W('BAT1:+', 'F1:1', { colour: 'red', gauge: '10', length: 0.5, current: 25, circuit: 'Charging', harness: 'Engine bay' });
    W('F1:2', 'U1:IN', { colour: 'red', gauge: '10', length: 4.5, current: 25, circuit: 'Charging', harness: 'Engine bay' });
    W('U1:OUT', 'F2:1', { colour: 'red', gauge: '10', length: 0.5, current: 25, circuit: 'Charging', harness: 'Rear body' });
    W('F2:2', 'BAT2:+', { colour: 'red', gauge: '10', length: 0.5, current: 25, circuit: 'Charging', harness: 'Rear body' }).dx = 60;
    W('BAT2:+', 'F3:1', { colour: 'red', gauge: '16', length: 0.3, circuit: 'Aux supply', harness: 'Rear body' });
    W('F3:2', 'REF1:L', { colour: 'red', gauge: '16', length: 0.6, current: 45, circuit: 'Aux supply', harness: 'Rear body' });
    W('N1:R', 'U1:IGN', { colour: 'white', gauge: '0.75', length: 2, circuit: 'Charging', harness: 'Engine bay' });
    W('BAT1:-', e1.label + ':G', { colour: 'black', gauge: '16', length: 0.4, harness: 'Engine bay' });
    W('U1:GND', e2.label + ':G', { colour: 'black', gauge: '10', length: 0.5, harness: 'Rear body' });
    W('BAT2:-', e3.label + ':G', { colour: 'black', gauge: '16', length: 0.4, harness: 'Rear body' });

    // ---- Sheet 2: loads ----
    d = Loom.view(project, 1);
    P = (type, x, y, opts = {}) => Loom.addPart(d, type, { x, y, ...opts });
    E = (x, y) => P('ground_chassis', x, y);
    W = (a, b, o) => Loom.addWire(d, a, b, o);
    P('offpage', 0, 210, { label: 'REF2', props: { text: 'FROM F3 SHEET 1' } });
    P('fuse_box', 140, 150, { label: 'FB1', props: { ways: 6, ratings: '20A,15A,5A,10A,10A,5A' } });
    P('relay4', 340, 110, { label: 'K1' });
    P('led_bar', 500, 110, { label: 'H1', props: { watts: '2 × 60W' } });
    P('switch_rocker_lit', 300, 290, { label: 'S1', props: { legend: 'SPOTS' } });
    P('load', 300, 400, { label: 'L1', props: { text: 'FRIDGE', amps: '5A' } });
    const e4 = E(400, 200), e5 = E(360, 360), e6 = E(400, 440), e7 = E(460, 170);
    W('REF2:R', 'FB1:IN', { colour: 'red', gauge: '16', length: 0.2, circuit: 'Aux supply', harness: 'Rear body' });
    // Brown/red is reused: spot lamp feed in the engine bay, fridge feed in the rear body.
    W('FB1:1', 'K1:30', { colour: 'brown', tracer: 'red', gauge: '2.5', length: 1, current: 10, circuit: 'Spot lamps', harness: 'Engine bay' });
    W('K1:87', 'H1:+', { colour: 'purple', tracer: 'white', gauge: '2.5', length: 3.5, current: 10, circuit: 'Spot lamps', harness: 'Engine bay' });
    W('H1:-', e7.label + ':G', { colour: 'black', gauge: '2.5', length: 1, harness: 'Engine bay' });
    W('K1:85', e4.label + ':G', { colour: 'black', gauge: '0.75', length: 0.3, harness: 'Engine bay' });
    W('FB1:3', 'S1:2', { colour: 'green', gauge: '0.75', length: 2, circuit: 'Spot lamps', harness: 'Dash' });
    const sw = W('S1:3', 'K1:86', { colour: 'green', tracer: 'yellow', gauge: '0.75', length: 2, circuit: 'Spot lamps', harness: 'Dash' });
    sw.points = [{ x: 400, y: 250 }, { x: 320, y: 250 }, { x: 320, y: 170 }];
    W('S1:8', e5.label + ':G', { colour: 'black', gauge: '0.75', length: 0.5, harness: 'Dash' });
    W('FB1:3', 'S1:7', { colour: 'green', gauge: '0.5', length: 2, circuit: 'Panel lights', harness: 'Dash' });
    W('FB1:4', 'L1:+', { colour: 'brown', tracer: 'red', gauge: '2.5', length: 4, current: 5, circuit: 'Fridge', harness: 'Rear body' }).dx = 10;
    W('L1:-', e6.label + ':G', { colour: 'black', gauge: '2.5', length: 0.5, harness: 'Rear body' });
    return project;
  };
});
