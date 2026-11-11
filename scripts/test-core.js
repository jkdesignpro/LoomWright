// Core library checks: every symbol sits on the grid, projects with sheets work,
// and the example project is valid.
// Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('assert');
const L = require('../app/core/loom.js');
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
assert.strictEqual(s.sheets.length, 3, 'example has three sheets');
const vs = L.views(s);
vs.forEach((v) => assert.ok(v.wires.every((w) => L.wirePoints(v, w)), `sheet ${v.sheetNo}: every wire resolves`));
assert.deepStrictEqual(L.validate(s).filter((c) => c.level === 'error'), [], 'example has no errors');
vs.forEach((v) => assert.ok(L.exportSVG(v).includes(`${v.sheetNo} of 3`), 'title block shows the sheet number'));
const names = L.wireList(s).map((r) => r.name);
assert.strictEqual(new Set(names).size, names.length, 'wire numbers are unique across sheets');
const nr = L.colourUsage(s).find((e) => e.code === 'NR');
assert.ok(nr && nr.uses.length >= 2 && new Set(nr.uses.map((u) => u.harness)).size >= 2, 'brown/red is reused in more than one harness');

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

// voltage drop checks follow the system voltage
{
  const t = L.newDoc('drop'); const v = L.view(t, 0);
  L.addPart(v, 'battery', { label: 'B1' }); L.addPart(v, 'lamp', { label: 'H1' });
  L.addWire(v, 'B1:+', 'H1:1', { colour: 'red', gauge: '1.0', length: 6, current: 5 });
  const warns = () => L.validate(t).filter((c) => /voltage drop/.test(c.text)).length;
  assert.strictEqual(warns(), 1, '1.0mm² at 5A over 6m is over 3% of 12V');
  t.settings.volts = '24';
  assert.strictEqual(warns(), 0, 'the same wire is under 3% of 24V');
}

// colour codes
assert.strictEqual(L.wireCode({ settings: { standard: 'lr' } }, { colour: 'brown', tracer: 'red' }), 'NR');
assert.strictEqual(L.wireCode({ settings: { standard: 'din' } }, { colour: 'brown', tracer: 'red' }), 'BN/RD');
assert.strictEqual(L.wireCode({ settings: { standard: 'sae' } }, { colour: 'brown', tracer: 'red' }), 'BRN/RED');
// revision history: issue, change, compare, clouds, restore
{
  const p = sample();
  p.revisions = []; p.meta.revision = 'A';
  const a = L.issueRevision(p, { description: 'First issue', by: 'test', date: '2026-01-01' });
  assert.strictEqual(a.rev, 'A', 'first issue keeps the current letter');
  const sheet = p.sheets[0], v = L.view(p, sheet);
  const w = sheet.wires[0], oldColour = w.colour;
  w.colour = oldColour === 'green' ? 'blue' : 'green';
  const added = L.addPart(v, 'lamp', { label: 'H99' });
  const d = L.compareRevisions(p, 'A', 'current');
  const lines = L.describeDiff(d);
  assert.ok(lines.some((x) => x.includes('added H99')), 'compare lists the new part');
  assert.ok(lines.some((x) => x.includes(`wire ${w.name}`) && x.includes('colour')), 'compare lists the colour change');
  const c = L.cloudsFor(p, 'A', sheet.id);
  assert.ok(c.parts.has(added.id) && c.wires.has(w.id), 'revision clouds mark what changed');
  assert.strictEqual(c.rev, 'B', 'clouds are tagged with the next letter');
  const plain = L.exportSVG(L.view(p, sheet));
  p.settings.clouds = 'A';
  const clouded = L.exportSVG(L.view(p, sheet));
  assert.ok(clouded.length > plain.length && clouded.includes('#c0392b'), 'clouds drawn on the sheet');
  const b = L.issueRevision(p, { description: 'Added work lamp' });
  assert.strictEqual(b.rev, 'B', 'next issue moves the letter on');
  assert.strictEqual(L.nextRevision('Z'), 'AA'); assert.strictEqual(L.nextRevision('P3'), 'P4');
  L.restoreRevision(p, 'A');
  assert.strictEqual(p.sheets[0].wires[0].colour, oldColour, 'restore puts the colour back');
  assert.ok(!p.sheets[0].parts.some((x) => x.label === 'H99'), 'restore removes the new part');
  assert.strictEqual(p.revisions.length, 2, 'restore keeps the revision list');
  const rt = L.normalise(JSON.parse(JSON.stringify(p)));
  assert.strictEqual(rt.revisions.length, 2, 'revisions are saved in the file');
}

// nets, trace and the live test
{
  const p = sample();
  const nets = L.nets(p);
  const earth = nets.find((x) => x.earth);
  assert.ok(earth && earth.name === 'EARTH' && earth.wires.length > 5, 'earth net found across sheets');
  const w = p.sheets[1].wires[0];
  const net = L.netOf(p, p.sheets[1].id, w.from);
  assert.ok(net && net.wires.some((x) => x.wire.id === w.id), 'a wire belongs to its net');
  const off = L.simulate(p, {});
  const keys = [];
  p.sheets.forEach((sh) => sh.parts.forEach((x) => { const st = L.partStates(L.view(p, sh), x); if (st && x.type !== 'fuse_maxi') keys.push(st); }));
  const on = {}; keys.forEach((k) => { on[k.key] = k.states.length - 1; });
  const live = L.simulate(p, on);
  assert.ok(live.wires.size > off.wires.size, 'switching on powers more wires');
  assert.ok(live.loads.size > off.loads.size, 'switching on runs more loads');
  assert.deepStrictEqual(live.shorts, [], 'the example has no shorts');
  const blown = {}; ['fuse_maxi|F1', 'fuse_maxi|F2', 'fuse_maxi|F3'].forEach((k) => { blown[k] = 1; });
  assert.ok(L.simulate(p, { ...on, ...blown }).wires.size < live.wires.size, 'blown fuses cut power');
}

// fuse schedule and load budget
{
  const p = sample(), sch = L.schedule(p);
  assert.ok(sch.fuses.length >= 3 && sch.fuses.every((f) => f.status !== 'over'), 'example fuses are within rating');
  assert.ok(sch.supplies.length >= 1, 'supplies are listed');
  assert.ok(L.projectChecks(p).every((c) => c.level !== 'error'), 'no project-level errors');
}

// build lists
{
  const p = sample();
  const cut = L.cutList(p), rows = cut.flatMap((h) => h.rows);
  assert.strictEqual(rows.length, L.wireList(p).length, 'cut list has every wire');
  assert.ok(rows.every((r) => !r.length || r.cut >= r.length), 'cut length includes the allowance');
  const conn = L.connectorTables(p);
  assert.ok(conn.some((c) => c.series === 'Deutsch DT' && c.mate), 'connector table shows series and mate');
  assert.strictEqual(L.wireLabels(p).length, L.wireList(p).length * 2, 'a label for each end');
  assert.ok(L.costedBom(p).parts.length > 0, 'costed BOM');
  assert.ok(L.locations(p).length > 0, 'locations list');
  const pack = L.buildPackHTML(p, {});
  assert.ok(pack.includes('class="pack"') && pack.includes('Cut lists by harness') && pack.length > 10000, 'build pack HTML');
}

// formboard
{
  const p = sample(), h = p.harnesses[1];
  const fb = L.formboard(p, h);
  assert.ok(fb.layout.nodes.length > 2 && fb.layout.branches.length > 1, 'formboard layout made');
  fb.layout.branches.forEach((b) => { b.length = 250; });
  const changed = L.applyFormboardLengths(p, h, 50);
  assert.ok(changed > 0 || (changed && changed.length), 'routed lengths copied to the wires');
  assert.ok(L.exportFormboardDXF(p, h).includes('SECTION'), 'formboard DXF');
}

// import and export
{
  const p = sample();
  assert.ok(L.exportDXF(L.view(p, 0)).includes('ENTITIES'), 'DXF export');
  assert.ok(L.shareHTML(p).includes('<svg'), 'share page');
  if (L.hasYAML) {
    const y = L.exportWireViz(p);
    assert.ok(/connectors:/.test(y) && /cables:/.test(y), 'WireViz YAML');
    const q = L.newDoc('wv');
    L.importWireViz(q, y);
    assert.ok(L.wireList(q).length > 0, 'WireViz YAML imports back');
  }
  const q = L.newDoc('csv');
  const r = L.importWireList(q, 'name,from,to,colour,gauge,length\nW1,BAT1:+,F1:1,red,6.0,0.3\nW2,F1:2,H1:1,brown/red,1.0,2\n');
  const wl = L.wireList(q);
  assert.strictEqual(wl.length, 2, 'CSV wire list imports two wires');
  assert.ok(wl.some((x) => x.tracer === 'red' || /NR|Brown/.test(x.code + x.colour)), 'tracer colour parsed');
  assert.ok(r, 'import reports what it did');
}

console.log(`ok: ${n} components, example project with ${s.sheets.length} sheets and ${L.wireList(s).length} wires`);
