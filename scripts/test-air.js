// Compressed air planner checks: the formulas against the worked examples in the
// research notes, and the checks on a home garage and a workshop system.
// Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const assert = require('assert');
const L = require('../app/core/loom.js');
const A = L.air;
const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: got ${got}, expected ${want} ± ${tol}`);
const rules = (list) => list.map((c) => c.rule);
let n = 0;
const ok = () => n++;

// ---- units and reference conditions
near(A.units.cfmToLpm(1), 28.3168, 1e-4, '1 cfm in l/min'); ok();
near(A.units.lpmToCfm(1000), 35.3147, 1e-3, '1 m³/min in cfm'); ok();
near(A.units.barToPsi(6.3), 91.37, 0.01, '6.3 bar in psi'); ok();
near(A.units.psiToBar(90), 6.205, 0.001, '90 psi in bar'); ok();
near(A.atmAt(0), 1.01325, 1e-6, 'air pressure at sea level'); ok();
near(A.atmAt(300), 0.977, 0.001, 'air pressure at 300 m'); ok();
near(A.units.gaugeToAbs(7, 0), 8.01325, 1e-6, 'gauge to absolute'); ok();

// ---- D1: 1,000 l/min through 50 m of 22 mm bore at 8 bar(a) loses about 0.099 bar at about 5.5 m/s
near(A.pipeDrop(1000 / 60, 50, 22, 8), 0.099, 0.0005, 'Atlas Copco pressure drop example'); ok();
near(A.velocity(1000 / 60, 22, 8), 5.5, 0.1, 'air speed in the same pipe'); ok();
near(A.pipeBore(1000 / 60, 50, 0.099, 8), 22, 0.05, 'the formula turned round gives the bore back'); ok();
assert.strictEqual(A.pipeDrop(0, 50, 22, 8), 0, 'no flow, no drop'); ok();
// a ring main: two halves, each half the flow over half the length, about 0.14 of one line
const single = A.pipeDrop(10, 40, 22, 8), ring = A.pipeDrop(5, 20, 22, 8);
near(ring / single, 0.139, 0.002, 'ring main is about 1/8 of a single line'); ok();
// fittings as equivalent length: two 25 mm aluminium elbows and one tee branch = 0.5 + 0.5 + 0.8 m
near(A.fittingLength('aluminium', '25', { elbow: 2, teeBranch: 1 }), 1.8, 1e-9, 'aluminium fittings'); ok();
near(A.fittingLength('steel', 'DN25', { elbow: 1, bend: 1, teeRun: 1, teeBranch: 1 }), 0.5 + 0.25 + 0.4 + 1.4, 1e-9, 'steel fittings'); ok();
// couplings: a 3/8" coupling loses about one-sixth of a 1/4" one
near(A.couplingDrop('3/8"', 600) / A.couplingDrop('1/4"', 600), 1 / 6, 1e-9, 'coupling ratio'); ok();

// ---- D3: receiver for a load/unload compressor: qC 100 l/s, p1 1 bar(a), T0 313 K, T1 293 K, 0.5 bar band → about 1,600 l
near(A.receiverSize(100, 0.5, 1, 20, 40), 1600, 10, 'receiver example'); ok();
near(A.cyclesPerHour(100, 0.5, 1600, 1, 20, 40), 120, 1.5, 'at that size, one cycle every 30 s'); ok();
near(A.peakReceiver(10, 30, 7, 6), 300, 1e-9, 'local receiver for a short peak'); ok();

// ---- D6: double-acting cylinder, 50 mm bore, 100 mm stroke, 10 cycles a minute at 6 bar, rod ignored → about 27 l/min
near(A.cylinderLpm({ bore: 50, rod: 0, stroke: 100, cpm: 10, bar: 6 }), 27, 0.5, 'cylinder example'); ok();
assert.ok(A.cylinderLpm({ bore: 50, rod: 20, stroke: 100, cpm: 10, bar: 6 }) < 27, 'the rod side uses less'); ok();
near(A.cylinderLpm({ bore: 50, stroke: 100, cpm: 10, bar: 6, single: true }), 13.6, 0.1, 'single-acting is half'); ok();

// ---- D5: leaks. A 1/8" rounded hole at 100 psig loses about 25 cfm (US DOE table: 25.22)
near(A.units.lpsToCfm(A.leakHole(3.175, A.units.psiToBar(100))), 25.22, 1.3, 'leak through a 1/8" hole'); ok();
// order of magnitude: a 3 mm hole at 6 bar, 8,000 hours at £0.15/kWh costs well over £1,000 a year
const hole = A.leakHole(3, 6), cost = hole * 0.35 * 8000 * 0.15;
assert.ok(hole > 8 && hole < 15, `3 mm leak flow ${hole} l/s`); ok();
assert.ok(cost > 1000 && cost < 10000, `3 mm leak cost £${cost} a year`); ok();
const lt = A.leakLoadTest(20, 80, 1000);
near(lt.pct, 20, 1e-9, 'load/unload leak test'); ok();
near(lt.lpm, 200, 1e-9, 'load/unload leak flow'); ok();
near(A.leakDecayTest(1000, 7, 5, 60).lpm, (1000 * 2 / (60 * 1.013)) * 1.25 * 60, 1e-9, 'pressure decay test'); ok();

// ---- D4: water. 1 m³/min, 20 °C, 70 % RH, 7 bar(g): about 480 g/h at a 30 °C aftercooler, about 0.67 l/h with a +3 °C dryer
near(A.saturation(20), 17.1, 1e-9, 'saturated water at 20 °C'); ok();
near(A.condensate(1000, 20, 70, 8.013, 30), 480, 10, 'aftercooler condensate'); ok();
near(A.condensate(1000, 20, 70, 8.013, 3) / 1000, 0.67, 0.02, 'condensate with a refrigerant dryer'); ok();
near(A.dryerFactor(7, 35, 25), 1, 1e-9, 'dryer at its rating conditions'); ok();
near(A.dryerFactor(10, 45, 40), 1.14 * 0.70 * 0.85, 1e-9, 'dryer correction factors multiply'); ok();

// ---- the home garage: 2.2 kW piston, 100 l receiver, 20 m of 20 mm aluminium, two drops, a DA sander and an impact wrench
const garage = A.example('garage');
const R = L.airReport(garage);
assert.strictEqual(R.fad, 240, 'garage compressor FAD'); ok();
near(R.pipes.reduce((s, p) => s + p.length, 0), 20, 1e-9, '20 m of pipe'); ok();
assert.ok(R.receiver.needed > 10 && R.receiver.needed < 30 && R.receiver.total > R.receiver.needed, 'the 100 l receiver is big enough'); ok();
const g = rules(R.checks);
assert.ok(g.includes('D2-DUTY'), 'a piston running over 60 % of the time is flagged'); ok();
assert.ok(g.includes('D6-CONTINUOUS-TOOL'), 'a DA sander needing more than the compressor gives is flagged'); ok();
assert.ok(g.includes('D3-PSSR') && R.checks.find((c) => c.rule === 'D3-PSSR').text.startsWith('At home'), 'home use gets the home advice'); ok();
assert.ok(!g.includes('D3-SAFETY') && !g.includes('D1-PVC'), 'no safety errors in the example'); ok();
assert.ok(R.checks.every((c) => !/\b(compliant|certified)\b/i.test(c.text) && !/\bis safe\b/i.test(c.text)), 'checks never claim compliance or safety'); ok();
const wrench = R.drops.flatMap((d) => d.tools).find((t) => t.kind === 'impact-12');
assert.ok(wrench.pTool > 6.3 && wrench.pTool < 7.5, `impact wrench pressure ${wrench.pTool}`); ok();
assert.ok(wrench.burst > 0 && wrench.burst < 60, 'the receiver alone runs the wrench for a few seconds'); ok();
assert.ok(R.energy.cost > 0 && R.energy.leakCost > 0 && R.water.perDay > 0, 'energy, leak and water figures'); ok();

// ---- the same garage, made worse step by step
const bad = JSON.parse(JSON.stringify(garage));
bad.settings.use = 'work';
bad.receivers[0].safetyValve = false;
bad.pipes[0].material = 'pvc';
bad.compressors[0].cutOut = 12;
bad.settings.leakPct = 30;
bad.settings.simultaneity = 100;
bad.drops[0].tools[0].kind = 'spray-commercial'; bad.drops[0].tools[0].paint = true;
bad.drops[0].frl.lubricator = true;
bad.drops[1].takeoff = 'bottom';
bad.pipes[1].size = '20'; bad.pipes[1].length = 60;
const B = L.airReport(bad), b = rules(B.checks);
['D3-SAFETY', 'D1-PVC', 'D3-RATING', 'D3-PSSR', 'D5-LEAK-ALLOW', 'D6-DEMAND', 'D4-DRYER', 'D4-PAINT-LUBE', 'D1-TAKEOFF', 'D1-DP-NETWORK'].forEach((r) => { assert.ok(b.includes(r), `${r} is flagged`); ok(); });
assert.ok(B.checks.find((c) => c.rule === 'D3-PSSR').text.includes('1,100 bar·l'), 'PSSR card gives PS × V'); ok();
assert.strictEqual(B.checks[0].level, 'error', 'errors come first'); ok();
// displacement figures are taken at 65 %
bad.compressors[0].basis = 'displacement';
near(L.airReport(bad).fad, 240 * 0.65, 1e-9, 'displacement to FAD'); ok();

// ---- the workshop: screw compressor, dryer, ring main
const shop = L.airReport(A.example('factory'));
assert.ok(shop.pipes.some((p) => p.ring) && shop.treatment.some((x) => x.kind === 'dryer-ref'), 'workshop has a ring main and a dryer'); ok();
assert.ok(!rules(shop.checks).some((r) => ['D6-DEMAND', 'D3-SAFETY', 'D4-DRYER', 'D4-PAINT-LUBE'].includes(r)), 'workshop example has no supply or safety problems'); ok();
assert.ok(rules(shop.checks).includes('D3-PSSR'), 'a 500 l receiver at work gets the PSSR card'); ok();

// ---- CSV rows carry the disclaimer, and a project with air plans gets the strong disclaimer
const rows = L.airRows(garage);
assert.ok(rows[1][0] === 'Disclaimer' && rows[1][1].includes('Pressure Systems Safety Regulations 2000') && rows[1][1].includes('INDG261'), 'CSV starts with the disclaimer'); ok();
assert.ok(L.toCSV(rows).includes('D2-DUTY'), 'CSV lists the checks'); ok();
const p = L.newDoc('Air test');
assert.strictEqual(L.disclaimerFor(p).mains, false, 'no air plan, general note'); ok();
p.air = [garage];
assert.strictEqual(L.disclaimerFor(p).mains, true, 'air plans get the strong disclaimer'); ok();
assert.ok(JSON.stringify(L.normalise(JSON.parse(JSON.stringify(p))).air) === JSON.stringify(p.air), 'air plans survive a save and load'); ok();
assert.ok(JSON.stringify(L.airReport(garage)).length > 1000, 'the report is plain data'); ok();

// ---- tree edits: removing a pipe moves its drops and branches up
const t = A.example('garage');
A.removePipe(t, t.pipes[0].id);
assert.strictEqual(t.pipes[0].parent, null, 'branch moved up to the receiver'); ok();
assert.strictEqual(t.drops[0].pipe, null, 'drop moved to the receiver outlet'); ok();
// a parent loop does not hang the calculation
t.pipes.push({ id: 'x1', parent: 'x2', name: 'Loop A', material: 'aluminium', size: '20', length: 5 }, { id: 'x2', parent: 'x1', name: 'Loop B', material: 'aluminium', size: '20', length: 5 });
assert.ok(L.airReport(t).pipes.length === 3, 'looped pipes are still listed'); ok();

console.log(`ok: ${n} compressed air checks`);
