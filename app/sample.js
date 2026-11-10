/*
 * Example diagram shown on first launch: dual battery + auxiliary lighting.
 * Copyright (C) 2026 Loomwright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core/loom-core.js'));
  else root.LoomSample = factory(root.Loom);
})(typeof self !== 'undefined' ? self : this, function (Loom) {
  'use strict';
  return function sample() {
    const d = Loom.newDoc('Dual battery and auxiliary lighting');
    d.meta.project = 'Defender 110 (example)';
    d.meta.drawnBy = '';
    const P = (type, x, y, opts = {}) => Loom.addPart(d, type, { x, y, ...opts });
    P('battery', 40, 100, { label: 'BAT1', props: { ah: '95Ah' } });
    P('fuse_maxi', 160, 110, { label: 'F1', props: { rating: '40A' } });
    P('dcdc', 300, 100, { label: 'U1', props: { amps: '25A' } });
    P('fuse_maxi', 460, 110, { label: 'F2', props: { rating: '40A' } });
    P('battery_aux', 560, 200, { label: 'BAT2', props: { ah: '100Ah' } });
    P('fuse_maxi', 700, 210, { label: 'F3', props: { rating: '80A', style: 'MIDI' } });
    P('fuse_box', 840, 150, { label: 'FB1', props: { ways: 6, ratings: '20A,15A,5A,10A,10A,5A' } });
    P('relay4', 1040, 110, { label: 'K1' });
    P('led_bar', 1200, 110, { label: 'H1', props: { watts: '2 × 60W' } });
    P('switch_rocker_lit', 1000, 290, { label: 'S1', props: { legend: 'SPOTS' } });
    P('load', 1000, 400, { label: 'L1', props: { text: 'FRIDGE', amps: '5A' } });
    P('net_label', 160, 150, { label: 'N1', props: { text: 'IGN 15 (+12V)' } });
    const E = (x, y) => P('ground_chassis', x, y);
    const e1 = E(0, 150), e2 = E(380, 190), e3 = E(500, 250), e4 = E(1100, 200), e5 = E(1060, 360), e6 = E(1100, 440), e7 = E(1160, 170);
    P('note', 40, 330, { props: { text: 'Example: dual battery and auxiliary lighting.\nReplace with your own circuits. Values are illustrative.', size: 11 } });

    const W = (a, b, o) => Loom.addWire(d, a, b, o);
    W('BAT1:+', 'F1:1', { colour: 'red', gauge: '10', length: 0.5, current: 25, circuit: 'Charging' });
    W('F1:2', 'U1:IN', { colour: 'red', gauge: '10', length: 4.5, current: 25, circuit: 'Charging' });
    W('U1:OUT', 'F2:1', { colour: 'red', gauge: '10', length: 0.5, current: 25, circuit: 'Charging' });
    W('F2:2', 'BAT2:+', { colour: 'red', gauge: '10', length: 0.5, current: 25, circuit: 'Charging' }).dx = 60;
    W('BAT2:+', 'F3:1', { colour: 'red', gauge: '16', length: 0.3, circuit: 'Aux feed' });
    W('F3:2', 'FB1:IN', { colour: 'red', gauge: '16', length: 0.6, current: 45, circuit: 'Aux feed' });
    W('N1:R', 'U1:IGN', { colour: 'white', gauge: '0.75', length: 2, circuit: 'Charging' });
    W('BAT1:-', e1.label + ':G', { colour: 'black', gauge: '16', length: 0.4 });
    W('U1:GND', e2.label + ':G', { colour: 'black', gauge: '10', length: 0.5 });
    W('BAT2:-', e3.label + ':G', { colour: 'black', gauge: '16', length: 0.4 });
    W('FB1:1', 'K1:30', { colour: 'brown', tracer: 'red', gauge: '2.5', length: 1, current: 10, circuit: 'Spot lamps' });
    W('K1:87', 'H1:+', { colour: 'purple', tracer: 'white', gauge: '2.5', length: 3.5, current: 10, circuit: 'Spot lamps' });
    W('H1:-', e7.label + ':G', { colour: 'black', gauge: '2.5', length: 1 });
    W('K1:85', e4.label + ':G', { colour: 'black', gauge: '0.75', length: 0.3 });
    W('FB1:3', 'S1:2', { colour: 'green', gauge: '0.75', length: 2, circuit: 'Spot lamps' });
    const sw = W('S1:3', 'K1:86', { colour: 'green', tracer: 'yellow', gauge: '0.75', length: 2, circuit: 'Spot lamps' });
    sw.points = [{ x: 1100, y: 250 }, { x: 1020, y: 250 }, { x: 1020, y: 170 }];
    W('S1:8', e5.label + ':G', { colour: 'black', gauge: '0.75', length: 0.5 });
    W('FB1:3', 'S1:7', { colour: 'green', gauge: '0.5', length: 2, circuit: 'Panel lights' });
    W('FB1:4', 'L1:+', { colour: 'brown', tracer: 'blue', gauge: '2.5', length: 4, current: 5, circuit: 'Fridge' }).dx = 10;
    W('L1:-', e6.label + ':G', { colour: 'black', gauge: '2.5', length: 0.5 });
    return d;
  };
});
