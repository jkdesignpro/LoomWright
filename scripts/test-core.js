// Core library checks: every symbol sits on the grid, projects with sheets work,
// and the example project is valid.
// Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('assert');
const L = require('../app/core/loom-core.js');
const sample = require('../app/sample.js');

// every library symbol
const project = L.newDoc('test');
const d = L.view(project, 0);
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

// the example project
const s = sample();
assert.strictEqual(s.sheets.length, 2, 'example has two sheets');
const vs = L.views(s);
vs.forEach((v) => assert.ok(v.wires.every((w) => L.wirePoints(v, w)), `sheet ${v.sheetNo}: every wire resolves`));
assert.deepStrictEqual(L.validate(s).filter((c) => c.level === 'error'), [], 'example has no errors');
vs.forEach((v) => assert.ok(L.exportSVG(v).includes(`${v.sheetNo} of 2`), 'title block shows the sheet number'));
const names = L.wireList(s).map((r) => r.name);
assert.strictEqual(new Set(names).size, names.length, 'wire numbers are unique across sheets');
const nr = L.colourUsage(s).find((e) => e.code === 'NR');
assert.ok(nr && nr.uses.length === 2 && new Set(nr.uses.map((u) => u.harness)).size === 2, 'brown/red is reused in two harnesses');

// file round trip, and version 1 files open as one sheet
const round = L.normalise(JSON.parse(JSON.stringify(s)));
assert.strictEqual(L.wireList(round).length, L.wireList(s).length, 'round trip keeps wires');
const v1 = L.normalise({ format: L.FORMAT, version: 1, title: 'Old', parts: s.sheets[0].parts, wires: s.sheets[0].wires });
assert.strictEqual(v1.sheets.length, 1, 'v1 file becomes one sheet');
assert.strictEqual(v1.sheets[0].wires.length, s.sheets[0].wires.length, 'v1 wires kept');

// sheet lookup
assert.strictEqual(L.view(s, 1).sheet, s.sheets[1], 'numeric index is 0-based');
assert.strictEqual(L.view(s, '2').sheet, s.sheets[1], 'string number is 1-based');
assert.strictEqual(L.view(s, s.sheets[1].name).sheet, s.sheets[1], 'lookup by name');

// colour codes
assert.strictEqual(L.wireCode({ settings: { standard: 'lr' } }, { colour: 'brown', tracer: 'red' }), 'NR');
assert.strictEqual(L.wireCode({ settings: { standard: 'din' } }, { colour: 'brown', tracer: 'red' }), 'BN/RD');
assert.strictEqual(L.wireCode({ settings: { standard: 'sae' } }, { colour: 'brown', tracer: 'red' }), 'BRN/RED');
console.log(`ok: ${n} components, example project with ${s.sheets.length} sheets and ${L.wireList(s).length} wires`);
