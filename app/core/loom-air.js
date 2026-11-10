/*
 * LoomWright compressed air planning: a system's compressors, receivers, air treatment,
 * pipework, drops and tools, and what follows from them: air demand, flow, pressure drop
 * and air speed in each pipe, pressure at each tool, receiver size, compressor duty,
 * running cost, leak cost and condensate, with plain-English checks (rules D1 to D7).
 *
 * Every figure is a planning estimate from published rules of thumb and the numbers the
 * user types in. It is not proof that a pressure system is safe: see AIR_DISCLAIMER.
 * Tags in the comments say how firm each figure is: exact (quoted from a source),
 * typical (a usual value), derived (worked out from sources) or estimate / placeholder.
 *
 * A system is plain JSON, kept in project.air (an array of systems):
 *   { id, name, settings: { use, quality, tariff, hours, ambient, altitude, rh, leakPct, growthPct, simultaneity },
 *     compressors: [{ id, name, kind, fad, basis, kw, cutIn, cutOut }],
 *     receivers:   [{ id, name, litres, ps, safetyValve, drain }],
 *     treatment:   [{ id, kind, name, rated, dp, before, purge }],
 *     pipes:       [{ id, parent, name, material, size, length, role, ring, fittings: { elbow, bend, teeRun, teeBranch, valve, coupling } }],
 *     drops:       [{ id, pipe, name, takeoff, drainLeg, outlets, frl: { rated, dp, set, lubricator } | null,
 *                     hose: { size, length, coupling, couplings, safety }, tools: [{ id, kind, name, lpm, util, bar, cont, paint, cyl }] }] }
 * Flows are free air (FAD) in l/min, pressures bar gauge, lengths m, volumes litres.
 *
 * Extends window.Loom; needs loom-core.js first. No DOM, so it also runs in Node.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./loom-core.js'));
  else factory(root.Loom);
})(typeof self !== 'undefined' ? self : this, function (Loom) {
  'use strict';

  /* ---------------- Units and reference conditions (D7) ---------------- */
  const P_STD = 1.01325;      // bar(a) at sea level [exact]
  const T0C = 273.15;
  const CFM = 28.3168;        // l/min in 1 cfm [exact]
  const PSI = 14.5038;        // psi in 1 bar [exact]
  /* Air pressure at an altitude, standard atmosphere [derived]. h in m, result bar(a). */
  function atmAt(h) { return P_STD * Math.pow(1 - 2.25577e-5 * Math.min(10000, +h || 0), 5.25588); }
  const units = {
    cfmToLpm: (v) => v * CFM, lpmToCfm: (v) => v / CFM,
    lpsToLpm: (v) => v * 60, lpmToLps: (v) => v / 60,
    m3minToLpm: (v) => v * 1000, lpmToM3min: (v) => v / 1000,
    cfmToLps: (v) => v * 0.471947, lpsToCfm: (v) => v * 2.11888,
    barToPsi: (v) => v * PSI, psiToBar: (v) => v / PSI, kgfToBar: (v) => v * 0.980665,
    gaugeToAbs: (g, alt) => g + atmAt(alt), absToGauge: (a, alt) => a - atmAt(alt),
    kwToHp: (v) => v / 0.7457, hpToKw: (v) => v * 0.7457,
    /* FAD to Normal (0 °C, 1.01325 bar a) and to the actual volume in the pipe [derived, ideal gas] */
    fadToNormal: (v, pIn = 1, tIn = 20) => v * (pIn / P_STD) * (T0C / (tIn + T0C)),
    fadToLine: (v, pLineAbs, pIn = P_STD, tIn = 20, tLine = tIn) => v * (pIn / pLineAbs) * ((tLine + T0C) / (tIn + T0C)),
  };

  /* ---------------- Limits used by the checks ---------------- */
  const LIMITS = {
    networkDp: 0.1,      // bar, compressor or receiver outlet to the furthest point [exact, Atlas Copco]
    totalPct: 10,        // % of discharge pressure lost before the point of use [exact, BCAS / NRCan]
    dropDp: 0.6,         // bar, pipe end to tool including FRL, couplings and hose [exact, Atlas Copco air tool guide]
    vMain: 9,            // m/s, mains and headers, never above [exact, BCAS]
    vMainGood: 6,        // m/s, keeps water and dirt in the drain legs [exact, BCAS]
    vBranch: 15,         // m/s [typical]
    vDrop: 15,           // m/s [typical]
    toolBar: 6.3,        // bar at the tool for rated output [exact]
    pistonDuty: 0.6,     // piston compressors 50 to 60 % duty [exact]
    cycleSeconds: 30,    // at most one load cycle per 30 s [exact, Atlas Copco]
    leakGood: 10,        // % leakage of a well-run system [exact]
    pssr: 250,           // bar·litres: below this in every vessel, no written scheme needed [exact, PSSR Sch 1 Pt II]
    pressureMargin: 0.5, // bar above the highest need before the setting counts as too high [rule D2-PRESSURE]
    energyPerBar: 7,     // % more energy per bar of generation pressure [exact, BCAS / BOGE]
    displacementToFad: 0.65, // small piston FAD as a share of displacement [derived, typical 60 to 70 %]
    unloadedPower: 0.25, // load/unload screw at zero flow, share of full-load power [exact range 15 to 30 %; middle-high value used]
    leakKwPerLps: 0.35,  // specific power for leak cost when the compressor's own is unknown [typical]
    flowFormulaMax: 1,   // bar: the empirical pipe formula is not valid above about this drop [exact]
    frlDp: 0.2,          // bar lost by a filter-regulator at its rated flow [estimate; FRL, couplings and hose together 0.6 to 1.0]
  };

  /* Specific power, package kW per m³/min of FAD, for when a compressor's kW is not given. */
  const SPECIFIC_POWER = { piston: 9.2, screw: 6.75, 'screw-vsd': 5.9 }; // derived SIP 2.2 kW; typical 6 to 7.5; CAGI example

  const COMPRESSOR_KINDS = {
    piston: { name: 'Piston', defaults: { kw: 2.2, fad: 240, cutIn: 8, cutOut: 10 } },
    screw: { name: 'Screw, fixed speed (load/unload)', defaults: { kw: 7.5, fad: 1100, cutIn: 7, cutOut: 7.5 } },
    'screw-vsd': { name: 'Screw, variable speed (VSD)', defaults: { kw: 7.5, fad: 1250, cutIn: 7, cutOut: 7.2 } },
  };

  /* ---------------- Pipe and hose data (D1) ---------------- */
  /* sizes: [key, label, internal diameter mm, nominal mm for the metal fittings table, aluminium OD for push-fit fittings] */
  const PIPES = {
    aluminium: { name: 'Aluminium (push-fit)', conf: 'maker data (BOGE easifit)', maxBar: 12.5, sizes: [['20', '20 mm (17 ID)', 17, 15, 20], ['25', '25 mm (22 ID)', 22, 20, 25], ['32', '32 mm (29 ID)', 29, 25, 32], ['40', '40 mm (37 ID)', 37, 32, 40], ['50', '50 mm (46 ID)', 46, 40, 50], ['63', '63 mm (59 ID)', 59, 50, 63]] },
    steel: { name: 'Steel, EN 10255 medium', conf: 'derived from OD and wall', sizes: [['DN15', 'DN15 (1/2")', 16.5, 15], ['DN20', 'DN20 (3/4")', 22.0, 20], ['DN25', 'DN25 (1")', 27.8, 25], ['DN32', 'DN32 (1 1/4")', 36.5, 32], ['DN40', 'DN40 (1 1/2")', 42.4, 40], ['DN50', 'DN50 (2")', 53.6, 50], ['DN65', 'DN65 (2 1/2")', 69.4, 65], ['DN80', 'DN80 (3")', 81.5, 80]] },
    copper: { name: 'Copper, EN 1057', conf: 'common wall thickness, check yours', sizes: [['15', '15 mm (13.6 ID)', 13.6, 15], ['22', '22 mm (20.2 ID)', 20.2, 20], ['28', '28 mm (26.2 ID)', 26.2, 25], ['35', '35 mm (32.6 ID)', 32.6, 32], ['42', '42 mm (39.6 ID)', 39.6, 40], ['54', '54 mm (51.6 ID)', 51.6, 50]] },
    hose: { name: 'Air hose', conf: 'typical bore', sizes: [['1/4"', '1/4" (6.4 ID)', 6.4, 15], ['5/16"', '5/16" (8 ID)', 8, 15], ['3/8"', '3/8" (9.5 ID)', 9.5, 15], ['1/2"', '1/2" (12.7 ID)', 12.7, 15]] },
    pvc: { name: 'PVC water pipe (never use)', conf: 'not for compressed air', sizes: [['20', '20 mm', 16.2, 15], ['25', '25 mm', 20.4, 20], ['32', '32 mm', 26.2, 25], ['40', '40 mm', 32.6, 32]] },
  };
  /* Equivalent lengths of metal fittings, m, by nominal size [exact]: bend (long radius), elbow, tee run, tee side outlet. */
  const FIT_METAL = { 15: [0.15, 0.25, 0.2, 0.5], 20: [0.2, 0.4, 0.3, 0.7], 25: [0.25, 0.5, 0.4, 1.4], 32: [0.35, 0.65, 0.5, 1.8], 40: [0.5, 0.8, 0.7, 2.4], 50: [0.6, 1.0, 0.85, 2.7], 65: [0.8, 1.4, 1.1, 3.6], 80: [1.0, 1.8, 1.3, 4.6], 100: [1.2, 2.4, 1.6, 5.7] };
  /* Aluminium push-fit, m, by tube OD [exact]: coupling, elbow, tee straight, tee branch, reducer. */
  const FIT_ALU = { 20: [0.15, 0.40, 0.20, 0.60, 0.20], 25: [0.20, 0.50, 0.30, 0.80, 0.25], 32: [0.25, 0.60, 0.40, 1.10, 0.35], 40: [0.30, 0.80, 0.50, 1.40, 0.45], 50: [0.40, 0.95, 0.70, 1.70, 0.60], 63: [0.50, 1.25, 0.95, 2.30, 0.75] };
  const ALU_ID = { 20: 17, 25: 22, 32: 29, 40: 37, 50: 46, 63: 59 };
  const VALVE_EQ = 0.3; // full-bore ball valve, m [placeholder, no reliable figure found]
  const FITTINGS = [['elbow', 'Elbows'], ['bend', 'Bends'], ['teeRun', 'Tees, straight through'], ['teeBranch', 'Tees, off the side'], ['valve', 'Ball valves'], ['coupling', 'Couplings']];

  /* Hose bores, mm [typical], in size order. */
  const HOSES = [['1/4"', 6.4], ['5/16"', 8], ['3/8"', 9.5], ['1/2"', 12.7]];
  /* Quick couplings: pressure lost at 600 l/min, bar. 1/4" is an estimate; 3/8" has about one-sixth
     of its loss [exact ratio]; 1/2" is scaled from 3/8" by bore to the fourth power [estimate].
     The loss goes with the square of the flow. A safety coupling passes about 20 % less [exact]. */
  const COUPLINGS = { none: 0, '1/4"': 0.25, '3/8"': 0.25 / 6, '1/2"': 0.25 / 6 / 3.16 };
  const COUPLING_REF = 600;
  const SAFETY_FACTOR = 1 / (0.8 * 0.8);

  /* ---------------- Air treatment (D4) ---------------- */
  /* rank: the usual order, compressor → aftercooler → separator → receiver (3) → pre-filter → dryer → after-filters.
     dp: pressure lost at the rated flow, bar. Dryers [exact range], filters 0.1 to 0.2 new [typical], others [placeholder]. */
  const TREATMENT = {
    aftercooler: { name: 'Aftercooler', rank: 1, before: true, dp: 0.1, conf: 'placeholder' },
    separator: { name: 'Water separator', rank: 2, before: true, dp: 0.1, conf: 'placeholder' },
    prefilter: { name: 'Pre-filter (general purpose)', rank: 4, dp: 0.15, conf: 'typical, new element' },
    'dryer-ref': { name: 'Refrigerant dryer (+3 °C dew point)', rank: 5, dp: 0.16, pdp: 3, conf: 'typical, at full flow' },
    'dryer-des': { name: 'Desiccant dryer (−40 °C dew point)', rank: 5, dp: 0.3, pdp: -40, purge: 15, conf: 'typical' },
    'filter-coalescing': { name: 'Coalescing filter (oil, 1 µm)', rank: 6, dp: 0.15, conf: 'typical, new element' },
    'filter-fine': { name: 'Fine coalescing filter (0.01 µm)', rank: 7, dp: 0.15, conf: 'typical, new element' },
    'filter-carbon': { name: 'Carbon filter (oil vapour)', rank: 8, dp: 0.15, conf: 'typical, new element' },
  };
  /* Refrigerant dryer capacity correction factors [exact, Beko]: pressure bar g, inlet °C, ambient °C. */
  const DRYER_P = [[5, 0.86], [7, 1.0], [10, 1.14]];
  const DRYER_TIN = [[35, 1.0], [40, 0.84], [45, 0.70]];
  const DRYER_AMB = [[25, 1.0], [35, 0.91], [40, 0.85]];
  const DRYER_INLET_RISE = 10; // dryer inlet taken as this much above room temperature [estimate]
  /* Water in saturated air, g/m³ [exact]. */
  const SATURATION = [[-40, 0.117], [-20, 0.88], [0, 4.87], [3, 5.95], [5, 6.79], [10, 9.36], [15, 12.7], [20, 17.1], [25, 22.8], [30, 30.1], [35, 39.3], [40, 50.7]];
  const QUALITY = { general: { name: 'General (no dryer needed)', rank: 0 }, dry: { name: 'Dry (dew point +3 °C, refrigerant dryer)', rank: 1 }, 'very-dry': { name: 'Very dry (dew point −40 °C, desiccant dryer)', rank: 2 } };

  /* ---------------- Tool air use (D6) ---------------- */
  /* lpm: free air while the tool runs, l/min. util: default share of time it runs, %. bar: inlet pressure it needs.
     cont: a continuous-use tool (sanders, grinders, blasting, spray guns). paint: a spray gun.
     conf: how firm the figure is. Where a source gives only the average at 25 % use, the running figure is 4 × that. */
  const TOOL_GROUPS = ['Wrenches and ratchets', 'Grinders and sanders', 'Spray guns', 'Blasting', 'Other tools', 'Machines'];
  const TOOLS = [
    { id: 'impact-38', group: 0, name: 'Impact wrench 3/8"', lpm: 566, util: 25, conf: 'typical, at full use' },
    { id: 'impact-12', group: 0, name: 'Impact wrench 1/2"', lpm: 850, util: 25, conf: 'typical, at full use (one maker: 720)' },
    { id: 'impact-34', group: 0, name: 'Impact wrench 3/4"', lpm: 991, util: 25, conf: 'typical, at full use' },
    { id: 'impact-1', group: 0, name: 'Impact wrench 1"', lpm: 1274, util: 25, conf: 'typical, at full use' },
    { id: 'ratchet-14', group: 0, name: 'Air ratchet 1/4"', lpm: 340, util: 25, conf: 'estimate: 4 × the average' },
    { id: 'ratchet-38', group: 0, name: 'Air ratchet 3/8"', lpm: 452, util: 25, conf: 'estimate: 4 × the average' },
    { id: 'die-small', group: 1, name: 'Die grinder 1/4", small', lpm: 425, util: 25, cont: true, conf: 'typical, at full use' },
    { id: 'die-medium', group: 1, name: 'Die grinder 1/4", medium', lpm: 680, util: 25, cont: true, conf: 'typical, at full use' },
    { id: 'angle-7', group: 1, name: 'Angle or disc grinder 7"', lpm: 908, util: 25, cont: true, conf: 'estimate: 4 × the average' },
    { id: 'vertical-7', group: 1, name: 'Vertical grinder, 7" pad', lpm: 1982, util: 25, cont: true, conf: 'typical, at full use' },
    { id: 'da-sander', group: 1, name: 'Dual-action (DA) sander', lpm: 368, util: 25, cont: true, conf: 'typical; sources differ, check the maker\'s figure' },
    { id: 'orbital', group: 1, name: 'Orbital sander', lpm: 255, util: 25, cont: true, conf: 'typical; sources differ, check the maker\'s figure' },
    { id: 'pad-5', group: 1, name: 'Sander, 5" pad, heavy duty', lpm: 991, util: 25, cont: true, conf: 'typical, at full use' },
    { id: 'spray-basic', group: 2, name: 'Spray gun, basic', lpm: 99, util: 25, bar: 3.1, cont: true, paint: true, conf: 'typical, at 20 to 45 psi' },
    { id: 'spray-commercial', group: 2, name: 'Spray gun, commercial', lpm: 198, util: 25, bar: 4.8, cont: true, paint: true, conf: 'typical, at 30 to 70 psi' },
    { id: 'spray-production', group: 2, name: 'Spray gun, production', lpm: 566, util: 25, bar: 4.8, cont: true, paint: true, conf: 'typical; check the maker\'s inlet pressure' },
    { id: 'hvlp-460', group: 2, name: 'HVLP gun, 460 l/min at 1.75 bar', lpm: 460, util: 25, bar: 1.75, cont: true, paint: true, conf: 'maker\'s figure (DeVilbiss GTi Pro Lite HV30)' },
    { id: 'hvlp-350', group: 2, name: 'HVLP gun, 350 l/min', lpm: 350, util: 25, bar: 1.75, cont: true, paint: true, conf: 'maker\'s figure (DeVilbiss HV25)' },
    { id: 'hvlp-290', group: 2, name: 'HVLP gun, 290 l/min at 2 bar', lpm: 290, util: 25, bar: 2.0, cont: true, paint: true, conf: 'maker\'s figure (SATAjet X 5500)' },
    { id: 'blast-2', group: 3, name: 'Blast pot, No. 2 nozzle (1/8")', lpm: 481, util: 25, bar: 5.5, cont: true, conf: 'typical, at 80 psi' },
    { id: 'blast-3', group: 3, name: 'Blast pot, No. 3 nozzle (3/16")', lpm: 1076, util: 25, bar: 5.5, cont: true, conf: 'typical, at 80 psi' },
    { id: 'blast-4', group: 3, name: 'Blast pot, No. 4 nozzle (1/4")', lpm: 1926, util: 25, bar: 5.5, cont: true, conf: 'typical, at 80 psi' },
    { id: 'blast-cabinet', group: 3, name: 'Blast cabinet (maker\'s figure)', lpm: 0, util: 25, cont: true, conf: 'no reliable figure: use the maker\'s data' },
    { id: 'blow-gun', group: 4, name: 'Blow gun', lpm: 340, util: 25, conf: 'estimate: 4 × the average' },
    { id: 'tyre', group: 4, name: 'Tyre inflator', lpm: 228, util: 25, conf: 'estimate: 4 × the average' },
    { id: 'hammer-light', group: 4, name: 'Air hammer, light', lpm: 452, util: 25, conf: 'estimate: 4 × the average' },
    { id: 'chipping', group: 4, name: 'Chipping hammer', lpm: 934, util: 25, conf: 'typical, at full use' },
    { id: 'brad', group: 4, name: 'Brad nailer', lpm: 57, util: 25, conf: 'estimate: 4 × the average' },
    { id: 'framing', group: 4, name: 'Framing nailer', lpm: 283, util: 25, conf: 'estimate: 4 × the average' },
    { id: 'plasma-builtin', group: 4, name: 'Plasma cutter, built-in compressor', lpm: 0, util: 25, conf: 'maker\'s figure: no outside air' },
    { id: 'cylinder', group: 5, name: 'Pneumatic cylinder', lpm: 27, util: 100, conf: 'worked out from the cylinder size' },
    { id: 'machine', group: 5, name: 'Machine (maker\'s figure)', lpm: 0, util: 100, conf: 'use the machine\'s installation guide' },
    { id: 'other', group: 4, name: 'Other tool (maker\'s figure)', lpm: 0, util: 25, conf: 'use the maker\'s figure' },
  ];
  const toolById = (id) => TOOLS.find((x) => x.id === id) || null;

  /* ---------------- Small helpers ---------------- */
  const numOr = (v, d) => { const n = typeof v === 'string' ? parseFloat(v) : v; return typeof n === 'number' && isFinite(n) ? n : d; };
  const posOr = (v, d) => { const n = numOr(v, NaN); return isFinite(n) && n >= 0 ? n : d; };
  const round = (v, n = 0) => { const k = Math.pow(10, n); return Math.round(v * k) / k; };
  /* 1234.5 → "1,235"; fmt(0.0994, 3) → "0.099" */
  function fmt(v, n = 0) {
    if (v == null || !isFinite(v)) return '–';
    const s = round(v, n).toFixed(n), neg = s[0] === '-', [a, b] = (neg ? s.slice(1) : s).split('.');
    return (neg && +s !== 0 ? '−' : '') + a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? '.' + b : '');
  }
  const fbar = (v) => fmt(v, Math.abs(v) < 1 ? 3 : 2);
  const money = (v) => '£' + fmt(v, 0);
  const lin = (a, b, x) => a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  /* Straight-line look-up in a table of [x, y], kept flat or carried on past either end. */
  function interp(tbl, x, low, high) {
    if (x <= tbl[0][0]) return low ? lin(tbl[0], tbl[1], x) : tbl[0][1];
    for (let i = 1; i < tbl.length; i++) if (x <= tbl[i][0]) return lin(tbl[i - 1], tbl[i], x);
    return high ? lin(tbl[tbl.length - 2], tbl[tbl.length - 1], x) : tbl[tbl.length - 1][1];
  }
  function uniq(list, prefix) { let i = list.length + 1; while (list.some((x) => x.id === prefix + i)) i++; return prefix + i; }
  const sizeOf = (material, key) => {
    const m = PIPES[material] || PIPES.aluminium;
    const s = m.sizes.find((x) => x[0] === String(key)) || m.sizes[0];
    return { key: s[0], label: s[1], id: s[2], nom: s[3], od: s[4] || null };
  };
  const hoseBore = (key) => (HOSES.find((h) => h[0] === key) || HOSES[2])[1];
  const hoseIndex = (key) => Math.max(0, HOSES.findIndex((h) => h[0] === key));

  /* ---------------- Formulas ---------------- */
  /* Pressure drop in a pipe, bar. Atlas Copco empirical formula [exact variables; 450 and 1.85 typical]:
     Δp = 450 × qc^1.85 × l / (d^5 × p), qc FAD l/s, l equivalent length m, d internal diameter mm, p inlet bar(a). */
  function pipeDrop(qLps, lengthM, dMm, pAbs) {
    if (!(qLps > 0) || !(lengthM > 0)) return 0;
    if (!(dMm > 0) || !(pAbs > 0)) return Infinity;
    return (450 * Math.pow(qLps, 1.85) * lengthM) / (Math.pow(dMm, 5) * pAbs);
  }
  /* The internal diameter that gives a pressure drop, mm (the same formula turned round). */
  function pipeBore(qLps, lengthM, dpBar, pAbs) { return Math.pow((450 * Math.pow(qLps, 1.85) * lengthM) / (dpBar * pAbs), 0.2); }
  /* Air speed in a pipe, m/s [derived]: v = q_FAD × (p_atm / p_abs) × (T_line / T_in) / A. */
  function velocity(qLps, dMm, pAbs, pAtm = P_STD, tIn = 20, tLine = tIn) {
    if (!(qLps > 0) || !(dMm > 0)) return 0;
    const a = (Math.PI * Math.pow(dMm / 1000, 2)) / 4;
    return ((qLps / 1000) * (pAtm / pAbs) * ((tLine + T0C) / (tIn + T0C))) / a;
  }
  /* Free air a cylinder uses, l/min [derived from the method in the sources]. */
  function cylinderLpm(c) {
    const D = posOr(c && c.bore, 0), d = Math.min(D, posOr(c && c.rod, 0)), S = posOr(c && c.stroke, 0), n = posOr(c && c.cpm, 0), p = posOr(c && c.bar, 6);
    const a1 = (Math.PI / 4) * D * D * S, a2 = c && c.single ? 0 : (Math.PI / 4) * (D * D - d * d) * S;
    return ((a1 + a2) * n * ((p + P_STD) / P_STD)) / 1e6;
  }
  /* Receiver for a load/unload compressor, litres [Atlas Copco; 0.25 derived]:
     V = 0.25 × qC × p1 × T0 / (fmax × (pU − pL) × T1). qC l/s, p1 inlet bar(a), T in K, fmax per second. */
  function receiverSize(qLps, band, pIn = P_STD, tIn = 20, tRec = tIn + 20, fmax = 1 / LIMITS.cycleSeconds) {
    if (!(band > 0)) return Infinity;
    return (0.25 * qLps * pIn * (tRec + T0C)) / (fmax * band * (tIn + T0C));
  }
  /* Most load cycles an hour for a receiver volume (the same formula turned round). */
  function cyclesPerHour(qLps, band, litres, pIn = P_STD, tIn = 20, tRec = tIn + 20) {
    if (!(band > 0) || !(litres > 0)) return Infinity;
    return (3600 * 0.25 * qLps * pIn * (tRec + T0C)) / (litres * band * (tIn + T0C));
  }
  /* A local receiver for a short peak, litres [Atlas Copco]: V = q × t / (p1 − p2); q l/s, t s. Ignores the compressor's supply. */
  function peakReceiver(qLps, seconds, p1, p2) { return p1 > p2 ? (qLps * seconds) / (p1 - p2) : Infinity; }
  /* How long a receiver alone keeps up a flow, s: t = V × (p1 − p2) / q. */
  function receiverSeconds(litres, p1, p2, qLps) { return qLps > 0 ? Math.max(0, (litres * (p1 - p2)) / qLps) : Infinity; }
  /* Water held by saturated air, g/m³: log-linear between table points. */
  function saturation(tC) {
    const tbl = SATURATION.map(([t, g]) => [t, Math.log(g)]);
    return Math.exp(interp(tbl, tC, false, true));
  }
  /* Condensate from compressing and cooling air, g/h [derived method]. fadLpm free air; out: saturated at tOut. */
  function condensate(fadLpm, tIn, rh, pAbs, tOut, pAtm = P_STD) {
    const m3h = (fadLpm * 60) / 1000;
    const inn = m3h * (rh / 100) * saturation(tIn);
    const out = m3h * (pAtm / pAbs) * ((tOut + T0C) / (tIn + T0C)) * saturation(tOut);
    return Math.max(0, inn - out);
  }
  /* Refrigerant dryer capacity factor at the working pressure, inlet and room temperatures. */
  function dryerFactor(pBarG, tInlet, tAmbient) {
    return Math.max(0.2, interp(DRYER_P, pBarG, true, false) * interp(DRYER_TIN, tInlet, false, true) * interp(DRYER_AMB, tAmbient, false, true));
  }
  /* Leaks. Choked flow through a hole, l/s free air [derived]: Q ≈ 0.154 × Cd × d² × p_abs. */
  function leakHole(dMm, pBarG, sharp, pAtm = P_STD) { return 0.154 * (sharp ? 0.61 : 0.97) * dMm * dMm * (pBarG + pAtm); }
  /* Load/unload test with every tool off [exact]: leakage % = T × 100 / (T + t); flow = FAD × T / (T + t). */
  function leakLoadTest(onSeconds, offSeconds, fadLpm) {
    const T = posOr(onSeconds, 0), tt = posOr(offSeconds, 0);
    if (!(T + tt > 0)) return { pct: 0, lpm: 0 };
    return { pct: (T * 100) / (T + tt), lpm: (posOr(fadLpm, 0) * T) / (T + tt) };
  }
  /* Pressure decay test [exact, SI form derived]: Q l/s = V × (p1 − p2) / (T × 1.013) × 1.25. */
  function leakDecayTest(litres, p1, p2, seconds) {
    if (!(seconds > 0) || !(litres > 0) || !(p1 > p2)) return { lpm: 0 };
    return { lpm: ((litres * (p1 - p2)) / (seconds * 1.013)) * 1.25 * 60 };
  }
  /* Quick coupling pressure loss at a flow, bar [estimate]. */
  function couplingDrop(size, lpm, count = 1, safety = false) {
    const k = COUPLINGS[size] || 0;
    return k * Math.pow(Math.max(0, lpm) / COUPLING_REF, 2) * Math.max(0, count) * (safety ? SAFETY_FACTOR : 1);
  }
  /* A part's pressure loss at a flow, from its loss at the rated flow; it goes with the square of the flow. */
  const ratedDrop = (dp, rated, q) => (rated > 0 ? posOr(dp, 0) * Math.pow(Math.max(0, q) / rated, 2) : 0);
  /* Fittings as extra pipe length, m. */
  function fittingLength(material, sizeKey, f) {
    const s = sizeOf(material, sizeKey), fit = f || {};
    const metal = FIT_METAL[s.nom] || FIT_METAL[15];
    let alu = s.od && FIT_ALU[s.od];
    if (!alu) { // nearest aluminium push-fit size by bore, for couplings on other pipe
      const od = Object.keys(ALU_ID).map(Number).reduce((b, k) => (Math.abs(ALU_ID[k] - s.id) < Math.abs(ALU_ID[b] - s.id) ? k : b), 20);
      alu = FIT_ALU[od];
    }
    const isAlu = material === 'aluminium';
    const each = { elbow: isAlu ? alu[1] : metal[1], bend: metal[0], teeRun: isAlu ? alu[2] : metal[2], teeBranch: isAlu ? alu[3] : metal[3], valve: VALVE_EQ, coupling: alu[0] };
    return Object.keys(each).reduce((t, k) => t + posOr(fit[k], 0) * each[k], 0);
  }

  /* ---------------- New items, with defaults a first-time user can keep ---------------- */
  const DEFAULT_SETTINGS = { use: 'work', quality: 'general', tariff: 0.25, hours: 2000, ambient: 20, altitude: 0, rh: 70, leakPct: 10, growthPct: 10, simultaneity: 100 };
  function newSystem(name, o = {}) {
    const sys = { id: o.id || Loom.uid('air'), name: name || 'Compressed air system', settings: { ...DEFAULT_SETTINGS }, compressors: [], receivers: [], treatment: [], pipes: [], drops: [] };
    if (o.empty) return sys;
    addCompressor(sys); addReceiver(sys);
    const main = addPipe(sys, null, { name: 'Main' });
    addDrop(sys, main.id);
    return sys;
  }
  function addCompressor(sys, kind = 'piston') {
    const k = COMPRESSOR_KINDS[kind] ? kind : 'piston';
    const c = { id: uniq(sys.compressors, 'c'), name: 'Compressor ' + (sys.compressors.length + 1), kind: k, basis: 'fad', ...COMPRESSOR_KINDS[k].defaults };
    sys.compressors.push(c); return c;
  }
  /* Change a compressor's kind; figures still at the old kind's defaults move to the new kind's. */
  function setCompressorKind(c, kind) {
    const was = (COMPRESSOR_KINDS[c.kind] || {}).defaults || {}, now = (COMPRESSOR_KINDS[kind] || COMPRESSOR_KINDS.piston).defaults;
    Object.keys(now).forEach((k) => { if (c[k] == null || c[k] === was[k]) c[k] = now[k]; });
    c.kind = COMPRESSOR_KINDS[kind] ? kind : 'piston';
    return c;
  }
  function addReceiver(sys) {
    const r = { id: uniq(sys.receivers, 'r'), name: 'Receiver ' + (sys.receivers.length + 1), litres: 100, ps: 11, safetyValve: true, drain: true };
    sys.receivers.push(r); return r;
  }
  function addTreatment(sys, kind = 'prefilter') {
    const d = TREATMENT[kind] || TREATMENT.prefilter, fad = sys.compressors.reduce((t, c) => t + fadOf(c), 0);
    const it = { id: uniq(sys.treatment, 't'), kind: TREATMENT[kind] ? kind : 'prefilter', name: '', rated: Math.max(500, Math.ceil((fad * 1.2) / 100) * 100), dp: d.dp, before: !!d.before };
    if (d.purge) it.purge = d.purge;
    sys.treatment.push(it); return it;
  }
  function addPipe(sys, parent, o = {}) {
    const p = { id: uniq(sys.pipes, 'p'), parent: parent || null, name: o.name || 'Pipe ' + (sys.pipes.length + 1), material: 'aluminium', size: '20', length: 10, role: parent ? 'branch' : 'main', ring: false, fittings: { elbow: 2, bend: 0, teeRun: 0, teeBranch: parent ? 1 : 0, valve: 0, coupling: 0 } };
    const up = parent && sys.pipes.find((x) => x.id === parent);
    if (up) { p.material = up.material; p.size = up.size; }
    Object.assign(p, o);
    sys.pipes.push(p); return p;
  }
  function addDrop(sys, pipe, o = {}) {
    const d = { id: uniq(sys.drops, 'd'), pipe: pipe || null, name: 'Drop ' + (sys.drops.length + 1), takeoff: 'top', drainLeg: false, outlets: 1,
      frl: { rated: 1500, dp: 0.2, set: null, lubricator: false }, hose: { size: '3/8"', length: 5, coupling: '1/4"', couplings: 1, safety: false }, tools: [], ...o };
    sys.drops.push(d); return d;
  }
  function addTool(drop, kind = 'other', o = {}) {
    const lib = toolById(kind) || toolById('other');
    const all = drop.tools || (drop.tools = []);
    const t = { id: uniq(all, 'k'), kind: lib.id, name: lib.name, lpm: lib.lpm, util: lib.util, bar: lib.bar || LIMITS.toolBar, cont: !!lib.cont, paint: !!lib.paint };
    if (lib.id === 'cylinder') { t.cyl = { bore: 50, rod: 0, stroke: 100, cpm: 10, bar: 6, single: false }; t.lpm = round(cylinderLpm(t.cyl)); t.bar = t.cyl.bar; }
    Object.assign(t, o);
    all.push(t); return t;
  }
  /* Remove a pipe; its branches and drops move up to its parent. */
  function removePipe(sys, id) {
    const p = sys.pipes.find((x) => x.id === id); if (!p) return;
    sys.pipes.forEach((x) => { if (x.parent === id) x.parent = p.parent || null; });
    sys.drops.forEach((d) => { if (d.pipe === id) d.pipe = p.parent || null; });
    sys.pipes = sys.pipes.filter((x) => x !== p);
  }

  /* ---------------- Examples ---------------- */
  function example(which) {
    if (which === 'factory') {
      const s = newSystem('Workshop air', { empty: true });
      Object.assign(s.settings, { use: 'work', quality: 'dry', hours: 2000, simultaneity: 70, growthPct: 15 });
      addCompressor(s, 'screw'); Object.assign(s.compressors[0], { name: 'Screw compressor', kw: 11, fad: 1600 });
      Object.assign(addReceiver(s), { name: 'Main receiver', litres: 500, ps: 11 });
      Object.assign(addTreatment(s, 'prefilter'), { rated: 2000 });
      Object.assign(addTreatment(s, 'dryer-ref'), { rated: 2000 });
      Object.assign(addTreatment(s, 'filter-coalescing'), { rated: 2000 });
      const ring = addPipe(s, null, { name: 'Ring main', size: '32', length: 60, ring: true, fittings: { elbow: 4, bend: 0, teeRun: 6, teeBranch: 0, valve: 2, coupling: 6 } });
      const a = addPipe(s, ring.id, { name: 'Bay A branch', size: '25', length: 12 });
      const b = addPipe(s, ring.id, { name: 'Bay B branch', size: '25', length: 15 });
      const d1 = addDrop(s, a.id, { name: 'Bench 1' }); addTool(d1, 'impact-12'); addTool(d1, 'die-small');
      const d2 = addDrop(s, a.id, { name: 'Bench 2', outlets: 2 }); addTool(d2, 'da-sander'); addTool(d2, 'blow-gun');
      const d3 = addDrop(s, b.id, { name: 'Paint booth', hose: { size: '3/8"', length: 8, coupling: '3/8"', couplings: 1, safety: false } }); addTool(d3, 'hvlp-460');
      const d4 = addDrop(s, b.id, { name: 'Press', frl: { rated: 1500, dp: 0.2, set: 6.2, lubricator: true }, hose: { size: '3/8"', length: 3, coupling: '3/8"', couplings: 1, safety: false } }); addTool(d4, 'cylinder', { name: 'Press cylinder' });
      return s;
    }
    const s = newSystem('Home garage', { empty: true });
    Object.assign(s.settings, { use: 'home', hours: 200, simultaneity: 50 });
    addCompressor(s, 'piston'); s.compressors[0].name = 'Piston compressor';
    Object.assign(addReceiver(s), { name: 'Tank', litres: 100, ps: 11 });
    const m = addPipe(s, null, { name: 'Main', length: 12 });
    const end = addPipe(s, m.id, { name: 'Main, far end', length: 8, role: 'main', fittings: { elbow: 2, bend: 0, teeRun: 1, teeBranch: 0, valve: 0, coupling: 0 } });
    const d1 = addDrop(s, m.id, { name: 'Bench' }); addTool(d1, 'da-sander');
    const d2 = addDrop(s, end.id, { name: 'Door' }); addTool(d2, 'impact-12');
    return s;
  }

  /* ---------------- The calculation ---------------- */
  const fadOf = (c) => posOr(c.fad, 0) * (c.basis === 'displacement' ? LIMITS.displacementToFad : 1);
  const kwOf = (c) => (posOr(c.kw, 0) > 0 ? posOr(c.kw, 0) : (fadOf(c) / 1000) * (SPECIFIC_POWER[c.kind] || SPECIFIC_POWER.piston));
  const toolLpm = (t) => (t.cyl ? cylinderLpm(t.cyl) : posOr(t.lpm, 0));
  const isPaint = (t) => !!t.paint;
  const settingsOf = (sys) => { const s = { ...DEFAULT_SETTINGS, ...((sys && sys.settings) || {}) }; Object.keys(DEFAULT_SETTINGS).forEach((k) => { if (typeof DEFAULT_SETTINGS[k] === 'number') s[k] = numOr(s[k], DEFAULT_SETTINGS[k]); }); return s; };

  /* Everything worked out for one system. Plain data, for the planner, exports and the Claude add-on. */
  function airReport(system) {
    const sys = system || {};
    const st = settingsOf(sys), pAtm = atmAt(st.altitude), tAmb = st.ambient;
    const comps = (sys.compressors || []).map((c) => ({ id: c.id, name: c.name || c.id, kind: COMPRESSOR_KINDS[c.kind] ? c.kind : 'piston', basis: c.basis === 'displacement' ? 'displacement' : 'fad', entered: posOr(c.fad, 0), fad: fadOf(c), kw: kwOf(c), kwEstimated: !(posOr(c.kw, 0) > 0), cutIn: numOr(c.cutIn, 7), cutOut: numOr(c.cutOut, 8) }));
    const fad = comps.reduce((t, c) => t + c.fad, 0), kw = comps.reduce((t, c) => t + c.kw, 0);
    const pSupply = comps.length ? Math.min(...comps.map((c) => c.cutIn)) : 7;
    const pTop = comps.length ? Math.max(...comps.map((c) => c.cutOut)) : 8;
    const sp = fad > 0 && kw > 0 ? kw / (fad / 60) : LIMITS.leakKwPerLps; // kW per l/s
    const pipes = (sys.pipes || []).filter((p) => p && p.id), drops = (sys.drops || []).filter((d) => d && d.id);
    const treat = (sys.treatment || []).filter((x) => x && TREATMENT[x.kind]);
    const recs = (sys.receivers || []).map((r) => ({ id: r.id, name: r.name || r.id, litres: posOr(r.litres, 0), ps: posOr(r.ps, 0), safetyValve: r.safetyValve !== false, drain: r.drain !== false }));
    recs.forEach((r) => { r.psv = r.ps * r.litres; r.pssr = r.psv >= LIMITS.pssr; });
    const simult = Math.max(0, st.simultaneity) / 100;

    /* --- demand --- */
    const toolRows = [];
    drops.forEach((d) => (d.tools || []).forEach((t) => {
      const lpm = toolLpm(t), util = Math.min(100, posOr(t.util, 25));
      toolRows.push({ id: t.id, drop: d.id, dropName: d.name || d.id, name: t.name || (toolById(t.kind) || {}).name || 'Tool', kind: t.kind, lpm, util, avg: (lpm * util) / 100, bar: posOr(t.bar, LIMITS.toolBar), cont: !!t.cont, paint: isPaint(t) });
    }));
    const sumAvg = toolRows.reduce((s, r) => s + r.avg, 0);
    const q = sumAvg * simult, leak = (q * st.leakPct) / 100, growth = (q * st.growthPct) / 100;
    const purge = treat.filter((x) => x.kind === 'dryer-des').reduce((s, x) => s + (posOr(x.rated, 0) * posOr(x.purge, TREATMENT['dryer-des'].purge)) / 100, 0);
    const average = q + leak + purge, design = q + leak + growth + purge;
    const scale = 1 + (st.leakPct + st.growthPct) / 100;

    /* --- each drop's peak: its outlets each run their hungriest tool --- */
    const dropInfo = new Map();
    drops.forEach((d) => {
      const lpms = (d.tools || []).map(toolLpm).sort((a, b) => b - a);
      const outlets = Math.max(1, Math.round(posOr(d.outlets, 1)));
      const peak = lpms.slice(0, outlets).reduce((s, v) => s + v, 0);
      const avg = (d.tools || []).reduce((s, t) => s + (toolLpm(t) * Math.min(100, posOr(t.util, 25))) / 100, 0) * simult * scale;
      dropInfo.set(d.id, { peak, avg });
    });

    /* --- pipe tree --- */
    const byId = new Map(pipes.map((p) => [p.id, p]));
    const parentOf = (p) => (p.parent && byId.has(p.parent) && p.parent !== p.id ? p.parent : null);
    const kids = new Map(pipes.map((p) => [p.id, []])), roots = [];
    // a parent chain that loops back is cut where it loops
    const loops = new Set();
    pipes.forEach((p) => { const seen = new Set([p.id]); let u = parentOf(p); while (u) { if (u === p.id) { loops.add(p.id); break; } if (seen.has(u)) break; seen.add(u); u = parentOf(byId.get(u)); } });
    pipes.forEach((p) => { const u = loops.has(p.id) ? null : parentOf(p); if (u) kids.get(u).push(p.id); else roots.push(p.id); });
    const order = [], depth = new Map();
    const walk = (id, dpt) => { if (depth.has(id)) return; depth.set(id, dpt); order.push(id); kids.get(id).forEach((k) => walk(k, dpt + 1)); };
    roots.forEach((id) => walk(id, 0));
    const dropsOn = new Map(pipes.map((p) => [p.id, []])), atSupply = [];
    drops.forEach((d) => { if (d.pipe && dropsOn.has(d.pipe)) dropsOn.get(d.pipe).push(d.id); else atSupply.push(d.id); });
    const below = (id) => { const out = [...dropsOn.get(id)]; kids.get(id).forEach((k) => out.push(...below(k))); return out; };

    /* --- treatment after the receiver: pressure lost before the pipework --- */
    const peakAll = Math.max(0, ...[...dropInfo.values()].map((x) => x.peak));
    const netFlow = Math.max(design, peakAll);
    const treatRows = treat.map((x) => {
      const d = TREATMENT[x.kind], rated = posOr(x.rated, 0), before = x.before != null ? !!x.before : !!d.before;
      const flow = before ? fad : netFlow, dp = ratedDrop(numOr(x.dp, d.dp), rated, flow);
      const row = { id: x.id, kind: x.kind, name: x.name || d.name, rated, before, flow, dp, rank: d.rank };
      if (x.kind === 'dryer-ref') { row.inlet = tAmb + DRYER_INLET_RISE; row.factor = dryerFactor(pSupply, row.inlet, tAmb); row.capacity = rated * row.factor; }
      if (x.kind === 'dryer-des') row.capacity = rated;
      return row;
    });
    const treatDp = treatRows.filter((x) => !x.before).reduce((s, x) => s + x.dp, 0);
    const p0 = pSupply - treatDp;

    /* --- flow, pressure drop and speed in each pipe --- */
    const pipeRows = new Map();
    order.forEach((id) => {
      const p = byId.get(id), sz = sizeOf(p.material, p.size), len = posOr(p.length, 0);
      const eq = len + fittingLength(p.material, sz.key, p.fittings);
      const ds = below(id).map((x) => dropInfo.get(x));
      const share = ds.reduce((s, x) => s + x.avg, 0), peak = Math.max(0, ...ds.map((x) => x.peak));
      const flow = Math.max(share, peak);
      const up = parentOf(p) && !loops.has(id) ? pipeRows.get(parentOf(p)) : null;
      const pIn = up ? up.pOut : p0, pAbs = Math.max(0.05, pIn + pAtm);
      const qEff = (p.ring ? flow / 2 : flow) / 60, lEff = p.ring ? eq / 2 : eq; // a ring: two halves, each half the flow over half the length
      const dp = pipeDrop(qEff, lEff, sz.id, pAbs);
      const v = velocity(qEff, sz.id, pAbs, pAtm, tAmb);
      const role = ['main', 'branch', 'drop'].includes(p.role) ? p.role : 'main';
      pipeRows.set(id, { id, name: p.name || id, parent: up ? up.id : null, depth: depth.get(id), material: PIPES[p.material] ? p.material : 'aluminium', size: sz.key, sizeLabel: sz.label, bore: sz.id, length: len, eqLength: eq, ring: !!p.ring, role, flow, share, peak, pIn, dp, pOut: Math.max(0, pIn - dp), velocity: v, vLimit: role === 'main' ? LIMITS.vMain : role === 'drop' ? LIMITS.vDrop : LIMITS.vBranch, volume: (Math.PI * sz.id * sz.id * len) / 4 / 1000, drops: dropsOn.get(id), kids: kids.get(id) });
    });
    const pipeVolume = [...pipeRows.values()].reduce((s, r) => s + r.volume, 0);
    const recVolume = recs.reduce((s, r) => s + r.litres, 0);

    /* --- each drop and tool --- */
    const dropRows = drops.map((d) => {
      const pr = d.pipe && pipeRows.get(d.pipe), pDrop = pr ? pr.pOut : p0, info = dropInfo.get(d.id);
      const frl = d.frl && posOr(d.frl.rated, 0) > 0 ? d.frl : null;
      const dpFrl = frl ? ratedDrop(numOr(frl.dp, LIMITS.frlDp), posOr(frl.rated, 0), info.peak) : 0;
      const set = frl && posOr(frl.set, 0) > 0 ? posOr(frl.set, 0) : null;
      const pFrl = pDrop - dpFrl, pReg = set != null ? Math.min(set, pFrl) : pFrl;
      const h = d.hose || {}, hLen = posOr(h.length, 0), hBore = hoseBore(h.size), cpl = COUPLINGS[h.coupling] != null ? h.coupling : 'none';
      const tools = (d.tools || []).map((t) => {
        const lpm = toolLpm(t), bar = posOr(t.bar, LIMITS.toolBar);
        const dpC = couplingDrop(cpl, lpm, posOr(h.couplings, 1), !!h.safety);
        const dpH = pipeDrop(lpm / 60, hLen, hBore, Math.max(0.05, pReg - dpC + pAtm));
        const pTool = pReg - dpC - dpH;
        const dpHopen = pipeDrop(lpm / 60, hLen, hBore, Math.max(0.05, pFrl - dpC + pAtm));
        const pOpen = pFrl - dpC - dpHopen; // with the regulator wide open
        const after = dpFrl + dpC + dpH;
        let burst = null;
        if (lpm > fad && recVolume + pipeVolume > 0) {
          const p2 = bar + (pSupply - pOpen);
          burst = receiverSeconds(recVolume + pipeVolume, pSupply, p2, (lpm - fad) / 60);
        }
        return { id: t.id, name: t.name || 'Tool', kind: t.kind, lpm, util: Math.min(100, posOr(t.util, 25)), bar, cont: !!t.cont, paint: isPaint(t), dpFrl, dpCoupling: dpC, dpHose: dpH, after, pTool, pOpen, lossFromSupply: pSupply - pOpen, burst };
      });
      return { id: d.id, name: d.name || d.id, pipe: pr ? pr.id : null, pipeName: pr ? pr.name : 'receiver outlet', pDrop, dpNetwork: p0 - pDrop, peak: info.peak, avg: info.avg, frl: frl ? { rated: posOr(frl.rated, 0), dp: dpFrl, set, lubricator: !!frl.lubricator } : null, hose: { size: h.size || '3/8"', length: hLen, bore: hBore, coupling: cpl, couplings: posOr(h.couplings, 1), safety: !!h.safety }, takeoff: d.takeoff || 'top', drainLeg: !!d.drainLeg, outlets: Math.max(1, Math.round(posOr(d.outlets, 1))), tools };
    });

    /* --- receiver size for load/unload or stop/start compressors --- */
    const cyclers = comps.filter((c) => c.kind !== 'screw-vsd' && c.fad > 0);
    const lead = cyclers.slice().sort((a, b) => b.fad - a.fad)[0] || null;
    const receiver = { have: recVolume, pipeVolume, total: recVolume + pipeVolume, needed: null, cycles: null, band: null, compressor: null, vsdOnly: comps.length > 0 && !cyclers.length };
    if (lead) {
      receiver.band = lead.cutOut - lead.cutIn; receiver.compressor = lead.name;
      receiver.needed = receiverSize(lead.fad / 60, receiver.band, pAtm, tAmb);
      receiver.cycles = cyclesPerHour(lead.fad / 60, receiver.band, receiver.total, pAtm, tAmb);
    }

    /* --- duty, energy, pressure setting, leaks --- */
    const duty = fad > 0 ? average / fad : Infinity;
    let left = average, kwh = 0;
    const compEnergy = comps.map((c) => { // lead/lag: the first compressor takes the demand up to its output, then the next
      const take = Math.min(left, c.fad); left -= take;
      const load = c.fad > 0 ? take / c.fad : 0;
      const factor = c.kind === 'screw' ? load + (1 - load) * LIMITS.unloadedPower : load;
      const e = c.kw * factor * st.hours; kwh += e;
      return { id: c.id, name: c.name, load, kwh: e, cost: e * st.tariff };
    });
    const cost = kwh * st.tariff;
    let needed = null;
    dropRows.forEach((d) => d.tools.forEach((t) => { const n = t.bar + t.lossFromSupply; if (needed == null || n > needed) needed = n; }));
    const pressure = { supply: pSupply, top: pTop, needed: needed == null ? null : needed + LIMITS.pressureMargin, excess: 0, extraPct: 0, extraCost: 0 };
    if (pressure.needed != null) { pressure.excess = Math.max(0, pSupply - pressure.needed); pressure.extraPct = pressure.excess * LIMITS.energyPerBar; pressure.extraCost = (cost * pressure.extraPct) / (100 + pressure.extraPct); }
    const leakCost = (leak / 60) * sp * st.hours * st.tariff;

    /* --- water --- */
    const dryers = treatRows.filter((x) => x.kind === 'dryer-ref' || x.kind === 'dryer-des');
    const finalT = dryers.length ? Math.min(...dryers.map((x) => TREATMENT[x.kind].pdp)) : tAmb;
    const gph = condensate(average, tAmb, st.rh, pSupply + pAtm, finalT, pAtm);
    const water = { gph, lph: gph / 1000, perDay: (gph * 8) / 1000, finalT, dried: !!dryers.length };

    const rep = {
      name: sys.name || 'Compressed air system', settings: st, pAtm, supply: pSupply, afterTreatment: p0,
      compressors: comps, fad, kw, specificPower: sp,
      demand: { tools: toolRows, sumAvg, simultaneity: st.simultaneity, q, leak, growth, purge, average, design, peak: peakAll, fad },
      duty, receivers: recs, receiver, treatment: treatRows, treatmentDp: treatDp,
      pipes: order.map((id) => pipeRows.get(id)), atSupply, drops: dropRows,
      energy: { kwh, cost, compressors: compEnergy, perBarPct: LIMITS.energyPerBar, leakLpm: leak, leakCost, specificPower: sp, tariff: st.tariff, hours: st.hours },
      pressure, water, limits: LIMITS, disclaimer: AIR_DISCLAIMER.short,
    };
    rep.checks = checksFor(sys, rep);
    return rep;
  }

  /* ---------------- Checks (D1 to D6) ---------------- */
  function checksFor(sys, R) {
    const out = [], st = R.settings;
    const add = (level, rule, text, where) => out.push({ level, rule, text, where: where || { kind: 'system', label: R.name } });
    const W = {
      comp: (c) => ({ kind: 'compressor', id: c.id, label: c.name }), rec: (r) => ({ kind: 'receiver', id: r.id, label: r.name }),
      tr: (x) => ({ kind: 'treatment', id: x.id, label: x.name }), pipe: (p) => ({ kind: 'pipe', id: p.id, label: p.name }),
      drop: (d) => ({ kind: 'drop', id: d.id, label: d.name }), tool: (d, t) => ({ kind: 'tool', id: t.id, drop: d.id, label: d.name + ' › ' + t.name }),
    };
    if (!R.compressors.length) add('error', 'D2-UNDERSIZE', 'Add a compressor so the planner can work out the air supply.');
    // D2: compressor figures
    R.compressors.forEach((c) => {
      if (!(c.cutOut > c.cutIn)) add('error', 'D2-BAND', `The cut-out pressure (${fmt(c.cutOut, 1)} bar) must be above the cut-in pressure (${fmt(c.cutIn, 1)} bar).`, W.comp(c));
      if (c.basis === 'displacement') add('info', 'D2-FAD', `This is a displacement figure. Real free-air delivery is usually only about 60–70 % of it. The planner uses ${fmt(c.fad)} l/min (65 %).`, W.comp(c));
      else if (c.kind === 'piston' && !c.kwEstimated && c.entered / c.kw > 140) add('warn', 'D2-FAD', `${fmt(c.entered)} l/min from ${fmt(c.kw, 1)} kW looks like a displacement figure. Real free-air delivery is usually only about 60–70 % of it. If the box says "displacement" or "air intake", set the figure to displacement.`, W.comp(c));
      if (c.kwEstimated && c.fad > 0) add('info', 'D2-POWER', `No motor power given, so ${fmt(c.kw, 1)} kW is assumed from typical figures for this kind of compressor.`, W.comp(c));
    });
    // D6 / D2: demand against supply
    if (R.compressors.length && R.demand.tools.length) {
      if (R.demand.design > R.fad) add('error', 'D6-DEMAND', `Your tools need about ${fmt(R.demand.design)} l/min but the compressor gives ${fmt(R.fad)} l/min. This includes ${fmt(st.leakPct)} % for leaks and ${fmt(st.growthPct)} % for growth.`);
      if (R.compressors.some((c) => c.kind === 'piston') && R.duty > LIMITS.pistonDuty && R.demand.average <= R.fad) add('warn', 'D2-DUTY', `Your air use needs this piston compressor to run about ${fmt(R.duty * 100)} % of the time, more than 60 %. It will overheat and wear quickly. Choose a larger unit or a screw compressor.`, W.comp(R.compressors.find((c) => c.kind === 'piston')));
      R.drops.forEach((d) => d.tools.forEach((t) => {
        if (t.cont && t.lpm > R.fad) add('warn', 'D6-CONTINUOUS-TOOL', `${t.name} uses air continuously at ${fmt(t.lpm)} l/min, more than the compressor delivers (${fmt(R.fad)} l/min). Pressure will drop while you work.`, W.tool(d, t));
      }));
    }
    if (R.pressure.excess > 0.25) add('info', 'D2-PRESSURE', `Your compressor is set about ${fmt(R.pressure.excess, 1)} bar higher than needed. That costs about ${fmt(R.pressure.extraPct)} % more electricity${R.pressure.extraCost >= 1 ? ` (around ${money(R.pressure.extraCost)} a year)` : ''}. Lower it in small steps and check your tools still work well.`);
    if (st.ambient > 25 && R.compressors.length) add('info', 'D2-INLET', 'Every 5 °C cooler intake air saves about 1 % of the energy. Draw intake air from the coolest place you can.');
    // D3: receivers and pressure systems
    if (R.receiver.needed != null && R.receiver.band > 0 && R.receiver.total < R.receiver.needed) add('warn', 'D3-RECEIVER', `The receiver is too small for this compressor. It will load and unload too often (more than once every 30 s). Receivers and pipework hold about ${fmt(R.receiver.total)} litres; about ${fmt(R.receiver.needed)} litres is needed.`, R.receivers[0] ? W.rec(R.receivers[0]) : null);
    if (R.receiver.vsdOnly) add('info', 'D3-RECEIVER', 'A variable speed compressor needs a much smaller receiver than the load/unload formula gives. Use the maker\'s figure.');
    if (!R.receivers.length && R.compressors.length) add('warn', 'D3-RECEIVER', 'Add a receiver (air tank). Almost every system needs one to even out the demand.');
    R.receivers.forEach((r) => {
      if (!r.safetyValve || !r.drain) add('error', 'D3-SAFETY', `Every air receiver needs a safety valve and a condensate drain. This one has no ${!r.safetyValve && !r.drain ? 'safety valve or drain' : !r.safetyValve ? 'safety valve' : 'drain'}.`, W.rec(r));
      if (r.ps > 0 && R.pressure.top > r.ps) add('error', 'D3-RATING', `The compressor cuts out at ${fmt(R.pressure.top, 1)} bar, above this receiver's rated pressure (PS) of ${fmt(r.ps, 1)} bar. Never go over a vessel's rated pressure.`, W.rec(r));
      if (!(r.ps > 0)) add('warn', 'D3-RATING', 'Enter the receiver\'s maximum allowable pressure (PS) from its data plate.', W.rec(r));
      if (st.use === 'work' && r.pssr) add('info', 'D3-PSSR', `If this is used at work, this receiver (${fmt(r.ps, 1)} bar × ${fmt(r.litres)} l = ${fmt(r.psv)} bar·l) is likely to be in scope of the Pressure Systems Safety Regulations 2000. A competent person must then draw up a written scheme of examination before first use, and examinations must be done to it.`, W.rec(r));
    });
    if (R.compressors.length || R.receivers.length) {
      if (st.use === 'work' && !R.receivers.some((r) => r.pssr)) add('info', 'D3-PSSR', 'If this is used at work, the Pressure Systems Safety Regulations 2000 apply: set safe operating limits and keep the safety valves working. A written scheme of examination is not needed while every vessel is under 250 bar·l.');
      if (st.use !== 'work') add('info', 'D3-PSSR', 'At home, follow the maker\'s instructions, keep the safety valve working, drain the receiver, and never go over its rated pressure. If this is used at work, the Pressure Systems Safety Regulations 2000 apply.');
    }
    // D4: treatment
    const paint = R.demand.tools.some((t) => t.paint);
    const need = Math.max((QUALITY[st.quality] || QUALITY.general).rank, paint ? 1 : 0);
    const dryerKinds = R.treatment.filter((x) => x.kind === 'dryer-ref' || x.kind === 'dryer-des').map((x) => x.kind);
    if (need >= 1 && !dryerKinds.length) add('warn', 'D4-DRYER', 'Spray painting and most tools need dry air. Add a refrigerant dryer after the receiver.');
    if (need >= 2 && dryerKinds.length && !dryerKinds.includes('dryer-des')) add('warn', 'D4-DRYER', 'Very dry air (dew point −40 °C) needs a desiccant dryer. A refrigerant dryer only reaches about +3 °C.');
    R.treatment.forEach((x) => {
      if (x.capacity != null && x.capacity < R.fad) add('warn', 'D4-DRYER-SIZE', x.kind === 'dryer-ref' ? `At your temperatures this dryer can handle only ${fmt(x.capacity)} l/min, less than your compressor delivers (${fmt(R.fad)} l/min).` : `This dryer is rated for ${fmt(x.capacity)} l/min, less than your compressor delivers (${fmt(R.fad)} l/min).`, W.tr(x));
      else if (!x.before && x.rated > 0 && x.flow > x.rated) add('warn', 'D4-SIZE', `About ${fmt(x.flow)} l/min passes through here, more than its rating of ${fmt(x.rated)} l/min. Its pressure loss goes up quickly.`, W.tr(x));
    });
    const seq = R.treatment.filter((x) => x.before).map((x) => x.rank).concat(R.receivers.length ? [3] : [], R.treatment.filter((x) => !x.before).map((x) => x.rank));
    if (seq.some((v, i) => i > 0 && v < seq[i - 1])) add('warn', 'D4-ORDER', 'The air treatment is not in the usual order: compressor, aftercooler and separator, receiver, pre-filter, dryer, then after-filters. Oil and water reaching a dryer or fine filter early shortens its life.');
    if (R.water.perDay >= 0.05) add('info', 'D4-DRAINS', `This system will make about ${fmt(R.water.perDay, R.water.perDay < 10 ? 1 : 0)} litres of water in an 8-hour day. Fit drains at the receiver, dryer, filters and low points.`);
    R.drops.forEach((d) => { if (d.frl && d.frl.lubricator && d.tools.some((t) => t.paint)) add('error', 'D4-PAINT-LUBE', 'Do not put a lubricator in the line to a spray gun. Oil will ruin the paint finish.', W.drop(d)); });
    // D1: pipework
    R.pipes.forEach((p) => {
      const src = (sys.pipes || []).find((x) => x.id === p.id) || {};
      if (src.material === 'pvc') add('error', 'D1-PVC', 'Never use PVC water pipe for compressed air. It can shatter.', W.pipe(p));
      if (src.material === 'aluminium' && R.pressure.top > PIPES.aluminium.maxBar) add('warn', 'D1-RATING', `Aluminium push-fit fittings are typically rated to 12.5 bar, below the ${fmt(R.pressure.top, 1)} bar cut-out. Check the maker's rating.`, W.pipe(p));
      if (p.velocity > p.vLimit) add('warn', 'D1-VEL', p.role === 'main' ? `Air speed in this pipe is ${fmt(p.velocity, 1)} m/s. Above about 9 m/s water and dirt get carried to your tools.` : `Air speed in this ${p.role} is ${fmt(p.velocity, 1)} m/s, above about 15 m/s. Use a larger size.`, W.pipe(p));
      if (p.dp > LIMITS.flowFormulaMax) add('error', 'D1-DP-NETWORK', `This pipe loses about ${fmt(p.dp, 1)} bar or more. It is far too small for ${fmt(p.flow)} l/min.`, W.pipe(p));
    });
    R.drops.forEach((d) => {
      if (d.dpNetwork > LIMITS.networkDp + 1e-9) add('warn', 'D1-DP-NETWORK', `Pipework pressure drop to this drop is ${fbar(d.dpNetwork)} bar. Atlas Copco recommends 0.1 bar or less. Use a larger pipe or a ring main.`, W.drop(d));
      if (d.takeoff === 'bottom' && !d.drainLeg) add('info', 'D1-TAKEOFF', 'Take drops from the top of the main so water does not run into your tools.', W.drop(d));
      if (d.frl && d.frl.rated < d.peak) add('warn', 'D6-FRL-CAPACITY', `This filter-regulator cannot pass enough air for the tools on this drop (${fmt(d.peak)} l/min against its ${fmt(d.frl.rated)} l/min rating).`, W.drop(d));
      d.tools.forEach((t) => {
        if (t.pTool < t.bar - 1e-9) {
          const reg = d.frl && d.frl.set != null && d.frl.set < t.bar + t.dpCoupling + t.dpHose + 0.05;
          add('warn', 'D1-TOOL-P', `${t.name} will get only ${fmt(Math.max(0, t.pTool), 2)} bar. It needs ${fmt(t.bar, 1)} bar for full output${t.bar >= 6 ? '. Each 1 bar short costs about 25–30 % of its output' : ''}.${reg ? ` The regulator is set to ${fmt(d.frl.set, 1)} bar, and the hose and couplings lose ${fbar(t.dpCoupling + t.dpHose)} bar after it.` : ''}`, W.tool(d, t));
        }
        if (R.supply > 0 && t.lossFromSupply > (R.supply * LIMITS.totalPct) / 100) add('warn', 'D1-DP-TOTAL', `Over 10 % of your compressor pressure is lost before it reaches ${t.name} (${fbar(t.lossFromSupply)} of ${fmt(R.supply, 1)} bar).`, W.tool(d, t));
        else if (t.after > LIMITS.dropDp) add('info', 'D1-DROP', `The filter-regulator, couplings and hose lose ${fbar(t.after)} bar for ${t.name}. Aim for 0.6 bar or less.`, W.tool(d, t));
        if (t.lpm > 0) {
          const base = t.lpm <= 250 ? 0 : t.lpm <= 800 ? 2 : 3, len = d.hose.length;
          const steps = len <= 5 ? 0 : len <= 10 ? 1 : len <= 20 ? 2 : 3, want = Math.min(HOSES.length - 1, base + steps);
          if (len > 5 && hoseIndex(d.hose.size) < want) add('info', 'D1-HOSE', `The ${fmt(len, 1)} m hose is long for ${t.name}. Keep tool hoses to 3–5 m, or go up a size: one size for 5–10 m, two at about 20 m. A ${HOSES[want][0]} hose would suit it.`, W.tool(d, t));
          if (d.hose.coupling === '1/4"' && t.lpm > 400) add('info', 'D1-HOSE', `1/4" quick couplings restrict tools that use over about 400 l/min, such as ${t.name}. A 3/8" coupling loses about one-sixth as much pressure.`, W.tool(d, t));
        }
      });
    });
    // D5: leaks
    if (st.leakPct > LIMITS.leakGood) add('warn', 'D5-LEAK-ALLOW', `About ${fmt(st.leakPct)} % of your air is leaking away, costing roughly ${money(R.energy.leakCost)} a year. Well-run systems lose under 10 %.`);
    const rank = { error: 0, warn: 1, info: 2 };
    return out.sort((a, b) => rank[a.level] - rank[b.level]);
  }
  function airChecks(system) { return airReport(system).checks; }

  /* ---------------- Rows for a CSV report ---------------- */
  function airRows(system, rep) {
    const R = rep || airReport(system), st = R.settings, rows = [];
    const lvl = { error: 'Problem', warn: 'Warning', info: 'Note' };
    rows.push(['LoomWright compressed air plan', R.name]);
    rows.push(['Disclaimer', AIR_DISCLAIMER.text]);
    rows.push([]);
    rows.push(['Summary', 'Value', 'Unit', 'How firm']);
    rows.push(['Use', st.use === 'work' ? 'At work' : 'At home', '', '']);
    rows.push(['Compressor output (FAD)', round(R.fad), 'l/min', R.compressors.some((c) => c.basis === 'displacement') ? 'estimate from displacement' : 'as entered']);
    rows.push(['Design demand', round(R.demand.design), 'l/min', 'estimate']);
    rows.push(['Average demand (with leaks)', round(R.demand.average), 'l/min', 'estimate']);
    rows.push(['Biggest drop running flat out', round(R.demand.peak), 'l/min', 'estimate']);
    rows.push(['Compressor running', isFinite(R.duty) ? round(R.duty * 100) : '', '% of the time', 'estimate']);
    rows.push(['Supply pressure (cut-in)', R.supply, 'bar g', 'as entered']);
    rows.push(['Pressure lost in air treatment', round(R.treatmentDp, 3), 'bar', 'typical']);
    rows.push(['Receivers and pipework', round(R.receiver.total), 'litres', '']);
    rows.push(['Receiver needed (load/unload)', R.receiver.needed != null && isFinite(R.receiver.needed) ? round(R.receiver.needed) : '', 'litres', 'formula']);
    rows.push(['Electricity', round(R.energy.kwh), 'kWh a year', 'estimate']);
    rows.push(['Running cost', round(R.energy.cost), '£ a year', 'estimate']);
    rows.push(['Cost of leaks', round(R.energy.leakCost), '£ a year', 'estimate']);
    rows.push(['Extra cost of the pressure setting', round(R.pressure.extraCost), '£ a year', 'estimate']);
    rows.push(['Condensate', round(R.water.perDay, 2), 'litres in an 8-hour day', 'estimate']);
    rows.push([]);
    rows.push(['Pipework', 'From', 'Material', 'Size', 'Length m', 'With fittings m', 'Ring', 'Flow l/min', 'Pressure in bar g', 'Pressure lost bar', 'Air speed m/s', 'Speed limit m/s']);
    R.pipes.forEach((p) => rows.push([p.name, p.parent ? (R.pipes.find((x) => x.id === p.parent) || {}).name : 'Receiver', PIPES[p.material].name, p.sizeLabel, p.length, round(p.eqLength, 1), p.ring ? 'yes' : '', round(p.flow), round(p.pIn, 2), round(p.dp, 3), round(p.velocity, 1), p.vLimit]));
    rows.push([]);
    rows.push(['Tool', 'Drop', 'Air while running l/min', 'Use %', 'Needs bar g', 'At the drop bar g', 'FRL loss bar', 'Coupling loss bar', 'Hose loss bar', 'At the tool bar g', 'Receiver alone, s']);
    R.drops.forEach((d) => d.tools.forEach((t) => rows.push([t.name, d.name, round(t.lpm), t.util, t.bar, round(d.pDrop, 2), round(t.dpFrl, 3), round(t.dpCoupling, 3), round(t.dpHose, 3), round(t.pTool, 2), t.burst == null ? '' : isFinite(t.burst) ? round(t.burst) : ''])));
    rows.push([]);
    rows.push(['Check', 'Rule', 'Where', 'Message']);
    R.checks.forEach((c) => rows.push([lvl[c.level], c.rule, c.where ? c.where.label : '', c.text]));
    return rows;
  }

  /* ---------------- Disclaimer ---------------- */
  const AIR_DISCLAIMER = {
    title: 'Compressed air planner',
    short: 'Planning estimates only. They do not show that a compressed air system is safe. If it is used at work, the Pressure Systems Safety Regulations 2000 apply. No responsibility is accepted for its use.',
    full: [
      'The compressed air planner is a basic planning tool. Pipe sizes, pressure drops, air speeds, receiver sizes, running costs, leak costs and water figures are estimates. They come from published rules of thumb and the numbers you type in, and they can be wrong. They do not show that a pressure system is safe, or that it meets any regulation.',
      'If the system is used at work, the Pressure Systems Safety Regulations 2000 apply. You need safe operating limits and working safety valves. For most receivers you also need a written scheme of examination, drawn up by a competent person before first use, and examinations done to it.',
      'Use only pipe, fittings, hoses and vessels rated for the pressure and temperature. Never use PVC water pipe for compressed air: it can shatter.',
      'At home, follow the maker\'s instructions, keep the safety valve working, drain the receiver, and never go over its rated pressure.',
      'See the HSE leaflet INDG261, Pressure systems: a brief guide to safety. Have a competent person design, install and examine the system.',
      'LoomWright is provided as it is, without any warranty. As far as the law allows, its authors and contributors accept no responsibility for any loss, damage, injury or death arising from its use.',
    ],
  };
  AIR_DISCLAIMER.text = AIR_DISCLAIMER.full.join(' ');

  const AIR = {
    LIMITS, PIPES, FITTINGS, FIT_METAL, FIT_ALU, HOSES, COUPLINGS, TREATMENT, QUALITY, TOOLS, TOOL_GROUPS, COMPRESSOR_KINDS, SPECIFIC_POWER, SATURATION, DEFAULT_SETTINGS,
    units, atmAt, pipeDrop, pipeBore, velocity, cylinderLpm, receiverSize, cyclesPerHour, peakReceiver, receiverSeconds, saturation, condensate, dryerFactor,
    leakHole, leakLoadTest, leakDecayTest, couplingDrop, fittingLength, sizeOf, toolById, fadOf,
    newSystem, addCompressor, setCompressorKind, addReceiver, addTreatment, addPipe, addDrop, addTool, removePipe, example,
    report: airReport, checks: airChecks, rows: airRows, fmt,
  };
  Object.assign(Loom, { air: AIR, AIR_DISCLAIMER, airReport, airChecks, airRows });
  return Loom;
});
