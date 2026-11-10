// Core library checks: every symbol sits on the grid and the example diagram is valid.
// Copyright (C) 2026 Loomwright contributors. SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('assert');
const L = require('../app/core/loom-core.js');
const sample = require('../app/sample.js');
const d = L.newDoc('test');
let n = 0;
for (const type of Object.keys(L.LIBRARY)) {
  const p = L.addPart(d, type);
  const r = L.resolved(d, p);
  assert.ok(r.w % 20 === 0 && r.h % 20 === 0, `${type}: size ${r.w}x${r.h} must be multiples of 20 so rotation keeps pins on the grid`);
  r.pins.forEach((pn) => assert.ok(pn.x % 10 === 0 && pn.y % 10 === 0, `${type}: pin ${pn.id} off grid`));
  const ids = r.pins.map((x) => x.id);
  assert.strictEqual(new Set(ids).size, ids.length, `${type}: duplicate pin ids`);
  assert.ok(L.symbolSVG(r).length > 0, `${type}: empty symbol`);
  n++;
}
const s = sample();
assert.ok(s.wires.every((w) => L.wirePoints(s, w)), 'sample: every wire resolves');
const errors = L.validate(s).filter((c) => c.level === 'error');
assert.deepStrictEqual(errors, [], 'sample has no errors');
assert.ok(L.exportSVG(s).startsWith('<svg'), 'export works');
const round = L.normalise(JSON.parse(JSON.stringify(s)));
assert.strictEqual(round.wires.length, s.wires.length, 'round trip keeps wires');
assert.strictEqual(L.wireCode({ settings: { standard: 'lr' } }, { colour: 'brown', tracer: 'red' }), 'NR');
assert.strictEqual(L.wireCode({ settings: { standard: 'din' } }, { colour: 'brown', tracer: 'red' }), 'BN/RD');
assert.strictEqual(L.wireCode({ settings: { standard: 'sae' } }, { colour: 'brown', tracer: 'red' }), 'BRN/RED');
console.log(`ok: ${n} components, example diagram with ${s.parts.length} parts and ${s.wires.length} wires`);
