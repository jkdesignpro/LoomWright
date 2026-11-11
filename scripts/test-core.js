// Core library checks: every symbol sits on the grid, projects with sheets work,
// and the example project is valid.
// Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: AGPL-3.0-or-later
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

// 0.4: circuit solver, fault finding, planning, starter circuits, tidy routing, PDF
{
  const p = sample();
  const sol = L.solveCircuit(p);
  assert.ok(sol.ok && sol.loads.length > 0, 'the example solves');
  sol.loads.forEach((x) => assert.ok(x.volts >= 0 && x.volts < 16, `${x.ref}: sensible voltage ${x.volts}`));
  assert.ok(L.loadVoltages(p).length > 0, 'voltage at each load');
  const targets = L.faultTargets(p);
  assert.ok(targets.length > 0, 'fault targets');
  L.FAULT_SYMPTOMS.forEach((sy) => {
    const f = L.faultFind(p, targets.find((x) => x.kind === 'load').ref, sy.id);
    assert.ok(f.steps.length > 0, `fault sheet "${sy.id}" has steps`);
    assert.ok(L.faultSheetHTML(f, { project: p }).includes('<'), 'fault sheet renders');
  });
  const v = L.views(p)[1];
  assert.ok(L.suggestColours(p, v.sheet.id, v.wires[0]).suggestions.length > 0, 'colour suggestions');
  const sl = L.shoppingList(p, { cable: [{ gauge: '0.75', colour: 'black', metres: 100 }], items: [] });
  assert.ok(sl.cable.length > 0 && sl.parts.length > 0, 'shopping list');
  const w0 = v.wires[0];
  w0.build = L.setBuild(w0, { cut: true, test: 'pass' });
  assert.ok(L.buildProgress(p).harnesses.some((h) => h.cut > 0), 'build progress counts a cut wire');
  // starter circuits draw cleanly on an empty sheet
  L.templateList().forEach((tp) => {
    const b = L.templateBlock(tp.id, p);
    const ids = new Set(b.parts.map((x) => x.id));
    b.wires.forEach((w) => assert.ok(ids.has(w.from.part) && ids.has(w.to.part), `${tp.id}: wire ends on its own parts`));
  });
  // tidy routing keeps every wire connected and square
  const q = sample(), tv = L.view(q, 1);
  const routed = L.tidyWires(tv, []);
  assert.ok(routed > 0, 'tidy routes wires');
  tv.wires.forEach((w) => {
    const pts = L.wirePoints(tv, w);
    assert.ok(pts, `${w.name}: still connected`);
    for (let i = 1; i < pts.length; i++) assert.ok(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y, `${w.name}: square corners`);
  });
  // PDF: a valid file with bookmarks, links and a correct cross-reference table
  const pdf = Buffer.from(L.projectPDF(p, { date: '2026-11-10' })).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.4') && pdf.trimEnd().endsWith('%%EOF'), 'PDF header and trailer');
  assert.ok(pdf.includes('/Outlines') && pdf.includes('/Subtype /Link'), 'PDF has bookmarks and links');
  const xref = Number(/startxref\n(\d+)/.exec(pdf)[1]);
  const rows = pdf.slice(xref).split('\n').slice(3).filter((r) => / 00000 n /.test(r));
  rows.forEach((r, i) => assert.ok(pdf.startsWith(`${i + 1} 0 obj`, Number(r.slice(0, 10))), `PDF object ${i + 1} offset`));
  assert.strictEqual(pdf.match(/\/Type \/Page /g).length, 3 + 5, 'three sheets and five table pages');
  // disclaimers
  assert.strictEqual(L.disclaimerFor(p).mains, false, 'vehicle projects get the general note');
  p.settings.projectType = 'household';
  assert.ok(L.disclaimerFor(p).mains && L.exportSVG(L.view(p, 0)).includes('BS 7671'), 'household drawings carry the disclaimer');
}

// 0.4: household and factory wiring (guidance checks, not certification)
{
  const tplProject = (id, type) => { const b = L.templateBlock(id), p = L.newDoc(id); L.applyProjectType(p, type); p.sheets[0].parts = b.parts; p.sheets[0].wires = b.wires; return p; };
  const rules = (list) => list.map((c) => c.rule).filter(Boolean);
  // a sensible consumer unit raises no errors or warnings
  const h = tplProject('cu-rcbo', 'household'), hv = L.view(h, 0);
  const hc = L.householdChecks(h);
  assert.strictEqual(hc.circuits.length, 4, 'four circuits found');
  const ring = hc.circuits.find((c) => c.kind === 'ring');
  assert.ok(ring && ring.ring, 'the ring is a closed loop');
  assert.ok(!hc.out.some((c) => c.level !== 'info'), 'the starter consumer unit has no errors: ' + hc.out.filter((c) => c.level !== 'info').map((c) => c.text).join('; '));
  assert.ok(L.validate(h).every((c) => !/has no earth return|guide figure/.test(c.text)), 'vehicle cable rules are not applied to household projects');
  assert.strictEqual(L.reportRows(h, 'circuits').length, 5, 'circuit schedule has a row per circuit');
  // breaking the ring is an error
  const close = hv.wires.find((w) => w.to.part === ring.dev.p.id && w.to.pin === 'out');
  hv.wires.splice(hv.wires.indexOf(close), 1);
  assert.ok(rules(L.householdChecks(h).out).includes('A1-RING-CLOSED'), 'an open ring is found');
  hv.wires.push(close);
  // a socket circuit without a 30 mA RCD, a long thin radial, and a TT supply without RCDs
  const cb = hv.parts.find((p) => p.type === 'rcbo' && p.props.circuit === 'ring');
  cb.type = 'mcb';
  assert.ok(rules(L.householdChecks(h).out).includes('A2-RCD-SOCKETS'), 'sockets without RCD protection are found');
  const lights = hv.parts.find((p) => p.type === 'rcbo' && p.props.circuit === 'lighting');
  hv.wires.filter((w) => w.circuit === 'Lights').forEach((w) => { w.length = '60'; });
  lights.props.rating = '32'; lights.props.circuit = '';
  assert.ok(rules(L.householdChecks(h).out).includes('A3-ZS'), 'a long circuit on a big breaker fails the earth loop check');
  hv.parts.find((p) => p.type === 'supply_cutout').props.earthing = 'TT';
  assert.ok(rules(L.householdChecks(h).out).includes('A3-TT-RCD'), 'TT circuits need RCDs');
  assert.ok(L.disclaimerFor(h).mains && L.exportSVG(hv).includes('BS 7671'), 'household drawings carry the disclaimer');
  // loads library
  assert.ok(L.APPLIANCES.length > 10 && L.MACHINES.length > 5, 'loads library');
  assert.ok(Math.abs(L.motorFLC(2.2, 3) - 5) < 0.2, 'three-phase full-load current estimate');
  assert.strictEqual(L.rateCable({ gauge: '2.5', method: 'C' }).iz, 27, 'cable rating from the table');
  assert.ok(L.rateCable({ gauge: '2.5', method: 'C', insul: 'surrounded', length: '2' }).iz < 14, 'insulation halves the rating');

  // factory: the starter works in the live test, and a wrong setting is found
  const f = tplProject('dol-starter', 'factory'), fv = L.view(f, 0);
  assert.deepStrictEqual(L.factoryChecks(f).filter((c) => c.level !== 'info').map((c) => c.text), [], 'the starter has no errors');
  const start = fv.parts.find((p) => p.type === 'pb_start'), k = fv.parts.find((p) => p.type === 'contactor');
  assert.ok(L.simulate(f, { [L.partKey(start)]: 1 }).relays.has(L.partKey(k)), 'pressing start pulls in the contactor');
  assert.ok(!L.simulate(f, {}).relays.has(L.partKey(k)), 'the contactor is off at rest');
  const aux = fv.parts.find((p) => p.type === 'aux_contact');
  const on = L.buildNet(f, { relays: new Set([L.partKey(k)]), switches: 'state', state: {} });
  assert.strictEqual(on.uf.find(on.k(fv.sheet, aux.id, '1')), on.uf.find(on.k(fv.sheet, aux.id, '2')), 'the hold-in contact follows its coil');
  fv.parts.find((p) => p.type === 'mpcb').props.setting = '9';
  start.props.colour = 'red';
  fv.wires.find((w) => w.tracer === 'yellow').tracer = '';
  const fr = rules(L.factoryChecks(f));
  ['B2-OVERLOAD', 'B1-PB', 'B1-COLOURS'].forEach((r) => assert.ok(fr.includes(r), `factory check ${r}`));
  assert.ok(L.reportRows(f, 'motors').length === 2 && L.reportRows(f, 'plcio').length === 1, 'motor and PLC lists');
  // wire numbers by potential: the three wires either side of the hold-in contact share two numbers
  L.numberByPotential(f);
  const names = new Set(fv.wires.filter((w) => [w.from.part, w.to.part].includes(aux.id)).map((w) => w.name));
  assert.strictEqual(names.size, 2, 'wires on one potential share a number');
  // the hold-in contact keeps the motor running after start is released, and stop drops it out
  const motor = fv.parts.find((p) => p.type === 'motor3'), stop = fv.parts.find((p) => p.type === 'pb_stop');
  const pressed = L.simulate(f, { [L.partKey(start)]: 1 });
  assert.ok(pressed.loads.has(motor.id), 'the motor runs from the L1, L2 and L3 labels');
  const held = L.simulate(f, {}, { relays: pressed.relays });
  assert.ok(held.relays.has(L.partKey(k)) && held.loads.has(motor.id), 'the hold-in contact latches');
  assert.ok(!L.simulate(f, { [L.partKey(stop)]: 1 }, { relays: held.relays }).relays.has(L.partKey(k)), 'stop drops the contactor out');
  {
    // household: the light switch turns the lights off but not the smoke alarm
    const hcu = tplProject('cu-rcbo', 'household'), hv = L.view(hcu, 0);
    const sw = hv.parts.find((p) => p.type === 'switch_light'), sa = hv.parts.find((p) => p.type === 'smoke_alarm');
    const lights = hv.parts.filter((p) => p.type === 'light').map((p) => p.id);
    assert.ok(lights.every((id) => L.simulate(hcu, {}).loads.has(id)), 'lights run with the switch on');
    const off = L.simulate(hcu, { [L.partKey(sw)]: 1 });
    assert.ok(lights.every((id) => !off.loads.has(id)) && off.loads.has(sa.id), 'the switch turns off the lights, not the smoke alarm');
  }
  const fpdf = Buffer.from(L.projectPDF(f, { tables: ['motors', 'terminals', 'plcio'] })).toString('latin1');
  assert.ok(fpdf.includes('/Outlines'), 'factory PDF builds');
}

// ---------------------------------------------------------------------------
// Electronics: boards, checks between boards, power budget, signals, templates
// ---------------------------------------------------------------------------
{
  const pins = (type) => L.resolved({}, { type, props: {} }).pins;
  // every header pin is drawn, in the maker's count
  [['arduino_uno_r3', 32], ['arduino_nano', 30], ['rpi_header', 40], ['esp32_devkitc', 38], ['esp32_s3_devkitc1', 44]].forEach(([t, count]) => {
    assert.strictEqual(pins(t).length, count, `${t}: ${count} header pins`);
    assert.ok(/^Pinout from .+ documentation; check against your board's revision\.$/.test(L.LIBRARY[t].note), `${t}: part note`);
    assert.ok(/^https:\/\//.test(L.LIBRARY[t].src), `${t}: source link`);
  });
  // Raspberry Pi: physical pin numbers, odd pins on the left, and GPIO names find the right pin
  const pi = pins('rpi_header');
  assert.deepStrictEqual(pi.filter((x) => x.k === 'gnd').map((x) => +x.id).sort((a, c) => a - c), [6, 9, 14, 20, 25, 30, 34, 39], 'Pi ground pins');
  assert.ok(pi.filter((x) => +x.id % 2).every((x) => x.x === 0), 'Pi odd pins on the left');
  const e = L.newDoc('elec');
  L.applyProjectType(e, 'electronics');
  const v = L.view(e, 0);
  const uno = L.addPart(v, 'arduino_uno_r3', { x: 0, y: 0, props: { mA: '50' } });
  const esp = L.addPart(v, 'esp32_devkitc', { x: 400, y: 0 });
  const rpi = L.addPart(v, 'rpi_header', { x: 800, y: 0 });
  assert.strictEqual(L.addWire(v, `${rpi.label}:GPIO17`, `${uno.label}:D7`).from.pin, '11', 'GPIO17 is Pi pin 11');
  v.wires.length = 0;
  // GND is the board's earth return; 5V and VIN are its supply pins
  const b = L.behaviour(v, uno);
  assert.ok(b.kind === 'load' && b.earth.includes('GND') && b.power.includes('VIN') && !b.power.includes('3V3'), 'a board is a load returned on GND');
  // TX to TX is a crossover mistake; TX to RX is right
  L.addWire(v, `${uno.label}:TX`, `${esp.label}:TX`, { signal: 'uart_tx' });
  const tx = L.validate(e).filter((c) => /both TX/.test(c.text));
  assert.strictEqual(tx.length, 1, 'TX wired to TX is flagged');
  assert.strictEqual(tx[0].level, 'warn', 'TX to TX is a warning');
  v.wires[0].to.pin = 'RX';
  assert.ok(!L.validate(e).some((c) => /both (TX|RX)/.test(c.text)), 'TX to RX is not flagged');
  assert.ok(L.validate(e).some((c) => /grounds are not joined/.test(c.text)), 'a signal with no ground between the boards is flagged');
  // 5 V into a 3.3 V board
  const ps = L.addPart(v, 'dc_supply', { x: -200, y: 0, props: { volts: '5V', amps: '1A' } });
  L.addWire(v, `${ps.label}:+`, `${rpi.label}:GPIO4`);
  assert.ok(L.validate(e).some((c) => c.level === 'error' && /3\.3 V pin/.test(c.text) && c.part === rpi.id), '5 V on a Pi GPIO pin is an error');
  // the checks only run in electronics and mixed projects
  e.settings.projectType = 'vehicle';
  assert.ok(!L.validate(e).some((c) => /both TX|3\.3 V pin/.test(c.text)), 'vehicle projects skip the electronics checks');
  e.settings.projectType = 'electronics';
  // power budget: a 5 V supply feeds the UNO, whose 3V3 output feeds a sensor
  v.wires.length = 0;
  const s1 = L.addPart(v, 'module_i2c', { x: 200, y: 400, props: { mA: '2' } });
  const s2 = L.addPart(v, 'module_i2c', { x: 200, y: 600, props: { mA: '10' } });
  [[ps, '+', uno, '5V'], [ps, '-', uno, 'GND'], [uno, '5V', s1, 'VCC'], [uno, 'GND', s1, 'GND'], [uno, '3V3', s2, 'VCC'], [uno, 'GND.2', s2, 'GND'], [uno, 'A4', s1, 'SDA'], [uno, 'A5', s1, 'SCL']]
    .forEach(([a, ap, c, cp]) => L.addWire(v, `${a.label}:${ap}`, `${c.label}:${cp}`));
  const pw = L.electronicsPower(e);
  const main = pw.find((x) => x.supply === ps.label), r3 = pw.find((x) => x.supply === uno.label && x.pin === '3V3');
  assert.strictEqual(main.load, 62, 'the 5 V rail carries the UNO (50 mA + 10 mA from its 3V3) and the sensor (2 mA)');
  assert.strictEqual(main.rating, 1000, 'the supply rating is its 1A');
  assert.strictEqual(r3.rating, 50, 'the UNO 3V3 rating is 50 mA');
  assert.strictEqual(r3.load, 10, 'the 3V3 rail feeds the second sensor');
  assert.ok(L.REPORTS.includes('power'), 'power is a report');
  const rows = L.reportRows(e, 'power');
  assert.strictEqual(rows[0][1], 'Supply', 'power report header');
  assert.strictEqual(rows.length, 1 + pw.length, 'one row per rail');
  assert.ok(!L.validate(e).some((c) => c.level !== 'info' && c.part === ps.id), 'a DC supply needs no fuse and its − counts as ground');
  // the wire list carries the signal in electronics projects only
  v.wires[6].signal = 'i2c_sda';
  const wr = L.reportRows(e, 'wires');
  assert.strictEqual(wr[0][wr[0].indexOf('Circuit') + 1], 'Signal', 'Signal column after Circuit');
  assert.ok(wr.some((r) => r.includes('I2C SDA')), 'signal name in the wire list');
  assert.ok(!L.reportRows(sample(), 'wires')[0].includes('Signal'), 'vehicle wire lists have no Signal column');
  assert.ok(L.SIGNALS.some((x) => x.id === 'can_h') && L.SIGNALS.some((x) => x.id === 'rs485_a'), 'signal list');
  // connector series for electronics, with their own cavity names where they have them
  ['jst_xh', 'jst_ph', 'jst_sh', 'kk254', 'microfit3', 'minifit_jr', 'xt60', 'barrel_5521', 'usbc_power', 'm8', 'm12a', 'screw_50'].forEach((id) => assert.ok(L.SERIES.some((x) => x.id === id), `series ${id}`));
  const m8 = L.addPart(v, 'conn', { x: 0, y: 900, props: { series: 'm8', ways: 3 } });
  assert.deepStrictEqual(L.resolved(v, m8).pins.map((x) => x.id), ['1', '3', '4'], 'M8 3-pin uses cavities 1, 3 and 4');
  // the starter circuits come out clean
  L.templateList('electronics').forEach((tp) => {
    const q = L.newDoc('t');
    L.applyProjectType(q, 'electronics');
    const blk = L.templateBlock(tp.id, q), tv = L.view(q, 0);
    blk.parts.forEach((x) => { assert.ok(x.x % 10 === 0 && x.y % 10 === 0, `${tp.id}: ${x.label || x.type} on the grid`); tv.parts.push(x); });
    blk.wires.forEach((x) => tv.wires.push(x));
    assert.deepStrictEqual(L.validate(q).filter((c) => c.level !== 'info').map((c) => c.text), [], `${tp.id}: no warnings`);
  });
  assert.ok(L.templateList('electronics').length >= 2, 'electronics starter circuits');
}

// a custom component with real parts inside (relay and fuse box): trace, live test and fuse loads go through it
{
  const q = L.newDoc('inside'), v = L.view(q, 0);
  q.customParts.push({ id: 'c_box', custom: true, cat: 'My components', name: 'Relay box', prefix: 'FB', w: 80, h: 80,
    props: [{ k: 'f1', l: 'F1', d: '' }, { k: 'f2', l: 'F2', d: '' }],
    pins: [{ id: 'B+', x: 0, y: 40 }, { id: 'F1', x: 80, y: 20 }, { id: 'K OUT', x: 80, y: 40 }, { id: 'K SW', x: 80, y: 60 }, { id: 'K GND', x: 80, y: 80 }],
    shapes: [{ t: 'rect', x: 10, y: 0, width: 60, h: 80 }],
    inside: { parts: [{ id: 'F1', type: 'fuse', props: { rating: '{f1}' } }, { id: 'F2', type: 'fuse', props: { rating: '{f2}' } }, { id: 'K', type: 'relay4' }],
      links: [['B+', 'F1.1'], ['B+', 'F2.1'], ['F1.2', 'F1'], ['F2.2', 'K.30'], ['K.87', 'K OUT'], ['K.86', 'K SW'], ['K.85', 'K GND']] } });
  const bat = L.addPart(v, 'battery', { x: 0, y: 0 }), box = L.addPart(v, 'c_box', { x: 100, y: 0, props: { f1: '5A', f2: '15A' } });
  const sw = L.addPart(v, 'switch_spst', { x: 300, y: 0 }), la = L.addPart(v, 'lamp', { x: 400, y: 0, props: { watts: '55W' } }), lb = L.addPart(v, 'lamp', { x: 400, y: 100, props: { watts: '21W' } }), g = L.addPart(v, 'ground_chassis', { x: 500, y: 0 });
  let wn = 0; const W = (a, ap, b, bp, gauge = '1.0') => v.wires.push({ id: 'iw' + (++wn), name: 'IW' + wn, from: { part: a.id, pin: ap }, to: { part: b.id, pin: bp }, colour: 'R', gauge, length: '1' });
  W(bat, '+', box, 'B+', '6.0'); W(bat, '-', g, 'G', '6.0'); W(bat, '+', sw, '1'); W(sw, '2', box, 'K SW'); W(box, 'K GND', g, 'G');
  W(box, 'K OUT', la, '1', '0.5'); W(la, '2', g, 'G'); W(box, 'F1', lb, '1'); W(lb, '2', g, 'G');
  assert.deepStrictEqual(L.insideParts(v, box).parts.map((x) => x.label), [box.label + '/F1', box.label + '/F2', box.label + '/K'], 'inside parts take the box reference');
  assert.deepStrictEqual([...L.simulate(q, {}).loads].sort(), [lb.id], 'spare fuse output is live, relay output is not');
  const on = L.simulate(q, { [L.partKey(sw)]: 1 });
  assert.ok(on.loads.has(la.id) && on.relays.has('relay4|' + box.label + '/K'), 'switch pulls the relay in the box and lights the lamp');
  const sc = L.schedule(q), f2 = sc.fuses.find((f) => f.ref === box.label + '/F2');
  assert.ok(f2 && f2.rating === 15 && f2.part === box.id && f2.loads.some((x) => x.ref === la.label), 'fuse inside the box carries the lamp load');
  assert.ok(L.validate(q).some((c) => c.text.includes(box.label + '/F2 (15A) feeds IW6')), 'fuse inside the box is checked against the wire it feeds');
}

// editing a custom component keeps its circuit: wires follow renamed pins, only wires on removed pins are reported
{
  const q = L.newDoc('edit'), v = L.view(q, 0);
  const d1 = { id: 'c_sw', custom: true, cat: 'My components', name: 'Panel', prefix: 'S', w: 60, h: 40, rev: 1, pins: [{ id: '1', x: 0, y: 20 }, { id: '2', x: 60, y: 20 }, { id: '3', x: 60, y: 40 }], shapes: [{ t: 'rect', x: 10, y: 0, width: 40, h: 40 }] };
  L.updateCustomPart(q, d1);
  const sp = L.addPart(v, 'c_sw', { x: 0, y: 0 }), la = L.addPart(v, 'lamp', { x: 200, y: 0 }), lb = L.addPart(v, 'lamp', { x: 200, y: 100 });
  v.wires.push({ id: 'e1', name: 'E1', from: { part: sp.id, pin: '2' }, to: { part: la.id, pin: '1' } }, { id: 'e2', name: 'E2', from: { part: lb.id, pin: '1' }, to: { part: sp.id, pin: '3' } });
  const d2 = { ...d1, rev: 2, pins: [{ id: 'IN', x: 0, y: 20 }, { id: 'OUT', x: 60, y: 20 }], renames: [{ rev: 2, map: { 1: 'IN', 2: 'OUT' } }] };
  const lost = L.updateCustomPart(q, d2);
  assert.strictEqual(v.wires[0].from.pin, 'OUT', 'wire follows the renamed pin');
  assert.deepStrictEqual(lost.map((x) => x.wire.id), ['e2'], 'only the wire on the removed pin is reported');
  // a later rename is applied once, even when the project is updated again
  const d3 = { ...d2, rev: 3, pins: [{ id: 'IN', x: 0, y: 20 }, { id: '1', x: 60, y: 20 }], renames: [...d2.renames, { rev: 3, map: { OUT: '1' } }] };
  L.updateCustomPart(q, d3); L.updateCustomPart(q, d3);
  assert.strictEqual(v.wires[0].from.pin, '1', 'renames apply once, in order');
}

console.log(`ok: ${n} components, example project with ${s.sheets.length} sheets and ${L.wireList(s).length} wires`);
