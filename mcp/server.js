#!/usr/bin/env node
/*
 * LoomWright Claude add-on: an MCP server that lets Claude create and edit
 * LoomWright projects (.loom files) from plain-English descriptions, turn
 * a picture of a component into a custom library component, and use the
 * app's checks, build lists, revision history and live circuit test.
 * Entirely optional; the LoomWright app works without it.
 *
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

// The core library: copied into ./core when packaged, or read from the app in a checkout.
const L = (() => {
  for (const p of ['core/loom.js', '../app/core/loom.js']) {
    const f = path.join(__dirname, p);
    if (fs.existsSync(f)) return require(f);
  }
  throw new Error('Could not find the LoomWright core (core/loom.js).');
})();

const HOME_DIR = process.env.LOOMWRIGHT_DIR || path.join(os.homedir(), 'Documents', 'LoomWright');
const APP_ID = 'org.loomwright.app';
/* The desktop app keeps "My components" in library.json in its app data folder
   (Tauri's app_data_dir). Claude saves picture-made components there too. */
function libraryPath() {
  if (process.env.LOOMWRIGHT_LIBRARY) return process.env.LOOMWRIGHT_LIBRARY;
  const home = os.homedir();
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), APP_ID, 'library.json');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', APP_ID, 'library.json');
  return path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), APP_ID, 'library.json');
}
function loadLibrary() {
  try { const d = JSON.parse(fs.readFileSync(libraryPath(), 'utf8')); return { parts: d.parts || [], colours: d.colours || [] }; }
  catch (e) { return { parts: [], colours: [] }; }
}
function saveLibrary(lib) {
  const full = libraryPath();
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const tmp = full + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(lib, null, 2));
  fs.renameSync(tmp, full);
  return full;
}

/* ---------------- file helpers ---------------- */
function resolvePath(p) {
  if (!p) throw new Error('A file path is required, e.g. "defender-lighting.loom".');
  let full = p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
  if (!path.isAbsolute(full)) full = path.join(HOME_DIR, full);
  if (!/\.(loom|json)$/i.test(full)) full += '.loom';
  return full;
}
function load(p) {
  const full = resolvePath(p);
  if (!fs.existsSync(full)) throw new Error(`No project at ${full}. Create one with create_diagram or build_diagram first.`);
  return { full, project: L.normalise(JSON.parse(fs.readFileSync(full, 'utf8'))) };
}
/* One sheet of a project. With create, an unknown sheet name makes a new sheet. */
function sheetView(project, sheet, create) {
  if (sheet == null || sheet === '') return L.view(project, 0);
  const ref = String(sheet).trim();
  const hit = project.sheets.find((s) => s.id === ref || s.name.toLowerCase() === ref.toLowerCase()) || (/^\d+$/.test(ref) ? project.sheets[+ref - 1] : null);
  if (hit) return L.view(project, hit);
  if (!create) throw new Error(`No sheet "${sheet}". Sheets: ${project.sheets.map((s, i) => `${i + 1} "${s.name}"`).join(', ')}`);
  const s = L.newSheet(ref); project.sheets.push(s);
  return L.view(project, s);
}
function save(full, project) {
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const tmp = full + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify({ ...project, app: 'LoomWright MCP ' + L.VERSION }, null, 2));
  fs.renameSync(tmp, full);
}
const sheetArg = z.union([z.string(), z.number()]).optional().describe('Sheet number (1, 2...) or name. Defaults to sheet 1.');
const ok = (text, extra) => ({ content: [{ type: 'text', text: extra ? text + '\n\n' + JSON.stringify(extra, null, 2) : text }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: String(e && e.message ? e.message : e) }] });
const wrap = (fn) => async (args) => { try { return await fn(args); } catch (e) { return fail(e); } };

/* ---------------- domain helpers ---------------- */
function resolveColour(doc, s) {
  if (!s) return '';
  const q = String(s).trim().toLowerCase();
  const all = L.allColours(doc);
  const hit = all.find((c) => c.id.toLowerCase() === q) || all.find((c) => c.name.toLowerCase() === q)
    || all.find((c) => c.custom && (c.code || '').toLowerCase() === q)
    || all.find((c) => [c.lr, c.din, c.sae].some((x) => x && x.toLowerCase() === q))
    || all.find((c) => c.name.toLowerCase().split(/[\s/]+/).includes(q));
  if (!hit) throw new Error(`Unknown colour "${s}". Use a name like brown, a code like N/BN/BRN, or add a custom colour first. Available: ${all.map((c) => c.id).join(', ')}`);
  return hit.id;
}
/* Accept "brown/red", "NR" (Land Rover), "BN/RD", or separate colour + tracer */
function parseColours(doc, colour, tracer, tracer2) {
  let parts = [];
  if (colour && /[\/\s-]/.test(colour.trim()) && !L.allColours(doc).some((c) => c.name.toLowerCase() === colour.trim().toLowerCase())) parts = colour.split(/[\/-]|\s+with\s+|\s+/i).filter(Boolean);
  else if (colour) {
    try { parts = [resolveColour(doc, colour)]; } catch (e) {
      // Try Land Rover style run-together codes like "NR", "LGB"
      const codes = L.COLOURS.map((c) => c.lr).filter(Boolean).sort((a, b) => b.length - a.length);
      let rest = colour.trim().toUpperCase(); const out = [];
      while (rest.length) { const c = codes.find((x) => rest.startsWith(x)); if (!c) throw e; out.push(L.COLOURS.find((x) => x.lr === c).id); rest = rest.slice(c.length); }
      parts = out;
    }
  }
  if (tracer) parts[1] = tracer;
  if (tracer2) parts[2] = tracer2;
  const ids = parts.map((p) => (L.allColours(doc).some((c) => c.id === p) ? p : resolveColour(doc, p)));
  return { colour: ids[0] || 'red', tracer: ids[1] || '', tracer2: ids[2] || '' };
}
function gauge(g) {
  if (g == null || g === '') return '1.0';
  const s = String(g).trim().toLowerCase();
  const awg = /^(\d+(?:\/0)?)\s*awg$/.exec(s);
  if (awg) { const hit = L.GAUGES.find((x) => x.awg === awg[1]); if (hit) return hit.mm2; }
  const n = parseFloat(s);
  if (isNaN(n)) throw new Error(`Gauge "${g}" not understood. Use mm² like 1.5 or AWG like "14 awg".`);
  const hit = L.GAUGES.find((x) => parseFloat(x.mm2) === n);
  return hit ? hit.mm2 : String(n);
}
function summary(project) {
  const s = project.settings;
  const lines = [`Project: ${project.title}`, `System voltage: ${s.volts || 12} V`, `Colour standard: ${L.STANDARDS[s.standard].name}`, `Harnesses: ${project.harnesses.join(', ') || 'none'}`];
  if (s.stock && s.stock.length) lines.push(`Colours in stock${s.stockOnly ? ' (only these are offered)' : ''}: ${s.stock.join(', ')}`);
  L.views(project).forEach((v, i) => { lines.push('', `=== Sheet ${i + 1}: ${v.sheet.name} ===`); lines.push(sheetSummary(v)); });
  return lines.join('\n');
}
function sheetSummary(doc) {
  const lines = [`Parts (${doc.parts.length}):`];
  doc.parts.forEach((p) => {
    const r = L.resolved(doc, p);
    const d = r.def || { name: p.type };
    const props = Object.entries(r.props || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${v}`).join(', ');
    lines.push(`  ${p.label || '(no ref)'} [${p.type}] ${d.name}${props ? ' (' + props + ')' : ''} at ${p.x},${p.y} pins: ${r.pins.map((q) => q.id).join(' ')}`);
  });
  lines.push(`Wires (${doc.wires.length}):`);
  L.wireList(doc).forEach((w) => lines.push(`  ${w.name}: ${w.from} -> ${w.to}  ${w.code} (${w.colour}) ${w.gauge}mm²${w.length ? ' ' + w.length + 'm' : ''}${w.current ? ' ' + w.current + 'A' : ''}${w.circuit ? ' [' + w.circuit + ']' : ''}${w.harness ? ' {' + w.harness + '}' : ''}`));
  return lines.join('\n');
}
function wireOpts(doc, a) {
  const c = parseColours(doc, a.colour, a.tracer, a.tracer2);
  if (a.harness) addHarness(doc, a.harness);
  return { ...c, gauge: gauge(a.gauge), length: a.length != null ? String(a.length) : '', current: a.current != null ? String(a.current) : '', circuit: a.circuit || '', harness: a.harness || '', notes: a.notes || '', name: a.name };
}
function addHarness(doc, h) { h = String(h || '').trim(); if (h && !doc.harnesses.includes(h)) doc.harnesses.push(h); }
/* A component from the user's library is copied into the project when used. */
function ensureCustom(doc, type) {
  if (L.LIBRARY[type] || doc.customParts.some((c) => c.id === type)) return;
  const fromLib = loadLibrary().parts.find((c) => c.id === type);
  if (fromLib) doc.customParts.push({ ...fromLib, custom: true, cat: 'My components' });
}
function placePart(doc, a) {
  ensureCustom(doc, a.type);
  const unplaced = a.x == null || a.y == null;
  const p = L.addPart(doc, a.type, { x: a.x || 0, y: a.y || 0, rot: Math.round((a.rotation || 0) / 90), label: a.ref, props: a.props || {} });
  if (unplaced) p._unplaced = true;
  return p;
}
function layoutNew(doc) {
  if (doc.parts.some((p) => p._unplaced)) L.autoLayout(doc, { onlyUnplaced: true });
  doc.parts.forEach((p) => delete p._unplaced);
}

/* ---------------- server ---------------- */
const server = new McpServer({ name: 'loomwright', version: L.VERSION }, {
  instructions: [
    'LoomWright makes wiring diagrams for vehicles (12V/24V automotive) and electronics. A project is a .loom file holding one or more sheets; relative paths are saved in ' + HOME_DIR + '.',
    'For text-to-diagram, prefer one build_diagram call per sheet: list every part with a short ref (F1, K1, S1...) and a type from list_components, then every wire as "REF:PIN" ends. Pass sheet to put it on a named sheet (created if new). Carry circuits between sheets with offpage parts.',
    'Wires can carry a harness (the loom they run in, e.g. "Engine bay"). The user may stock only a few cable colours and reuse them for different circuits in different harnesses; respect the stocked colours from get_diagram and use colour_usage to show reuse.',
    'When the user shares a picture of a component (pinout, datasheet symbol, connector face), trace it with define_component using shapes and pin positions, and save_to_library: true so it appears in My components in the app.',
    'Use describe_component to see a part\'s pin ids before wiring it (relays use DIN numbers 30, 85, 86, 87, 87a).',
    'Always give wires a colour (and tracer where useful), a size in mm², and where known a length in metres and current in amps, so LoomWright can check fuse sizing and voltage drop. Earth every load.',
    'After building, call check_diagram and fix warnings, then load_budget to check fuse and relay loading. Tell the user they can open the file in LoomWright; the desktop app reloads it live when you change it.',
    'Connectors: use part type "conn" with props series (see list_connector_series), ways, gender and mate (the reference of the other half). Mated connectors join cavity for cavity, so circuits trace through them.',
    'Build details: update_wire takes insulation, a multicore cable, and end_a/end_b with terminal, method, strip length, sleeve and seal. update_part takes part number, supplier, cost and fitted location. These feed the cut list, connector tables, costed parts list and build pack (report and export tools).',
    'Revision history: when the user signs off a change, call issue_revision with a short description. compare_revisions shows what changed since any revision, and project_settings clouds marks it on the drawing.',
    'Use trace_circuit to follow a circuit across sheets and test_circuit to check what a switch or relay powers. The test checks connections only, never claim it proves voltages or currents.',
    'Never invent pinouts or part numbers for a specific vehicle, ECU or module from memory. Ask for the documentation or a picture, and say part numbers must be checked against the maker.',
  ].join('\n'),
});


function withLibrary(project) {
  // project custom parts plus the user's library, for listing
  const lib = loadLibrary().parts.filter((c) => !project || !project.customParts.some((x) => x.id === c.id));
  return { customParts: [...((project && project.customParts) || []), ...lib.map((c) => ({ ...c, custom: true, cat: 'My components' }))] };
}

server.registerTool('list_components', {
  title: 'List components',
  description: 'List the component library: built-in parts, the user\'s saved components ("My components") and any custom components in a project. Filter by category or search text.',
  inputSchema: { search: z.string().optional().describe('Text to search names and categories, e.g. "relay"'), category: z.string().optional(), path: z.string().optional().describe('Include custom components from this project') },
}, wrap(async ({ search, category, path: p }) => {
  const doc = withLibrary(p ? load(p).project : null);
  let items = L.libraryList(doc);
  if (category) items = items.filter((i) => i.category.toLowerCase() === category.toLowerCase());
  if (search) { const q = search.toLowerCase(); items = items.filter((i) => (i.name + ' ' + i.category + ' ' + i.id).toLowerCase().includes(q)); }
  return ok(items.map((i) => `${i.id} — ${i.name} [${i.category}] pins: ${i.pins.map((x) => x.id).join(', ')}${i.props.length ? ' | fields: ' + i.props.map((x) => `${x.key}=${x.default}`).join(', ') : ''}`).join('\n') || 'No components match.');
}));

server.registerTool('describe_component', {
  title: 'Describe component',
  description: 'Show one component type: its pins (ids and meaning) and editable fields.',
  inputSchema: { type: z.string(), path: z.string().optional() },
}, wrap(async ({ type, path: p }) => {
  const doc = withLibrary(p ? load(p).project : null);
  const item = L.libraryList(doc).find((i) => i.id === type);
  if (!item) throw new Error(`Unknown component type "${type}". Use list_components.`);
  return ok(`${item.name} (${item.id}), category ${item.category}, reference prefix ${item.prefix || 'none'}`, { pins: item.pins, fields: item.props });
}));

server.registerTool('list_wire_colours', {
  title: 'List wire colours',
  description: 'List wire colours with their codes in the Land Rover/British, DIN/IEC and SAE standards, plus custom colours, and which colours the user stocks.',
  inputSchema: { path: z.string().optional() },
}, wrap(async ({ path: p }) => {
  const doc = p ? load(p).project : null;
  const stock = new Set((doc && doc.settings.stock) || []);
  return ok(L.allColours(doc).map((c) => (c.custom ? `${c.id} — ${c.name} (custom code ${c.code}, ${c.hex})` : `${c.id} — ${c.name}: LR ${c.lr || '-'}, DIN ${c.din || '-'}, SAE ${c.sae || '-'}`) + (stock.has(c.id) ? '  [in stock]' : '')).join('\n'));
}));

const partShape = z.object({
  ref: z.string().optional().describe('Reference such as F1, K2, S3. Auto-numbered when omitted.'),
  type: z.string().describe('Component type id from list_components'),
  props: z.record(z.any()).optional().describe('Field values, e.g. {"rating":"15A"}'),
  x: z.number().optional(), y: z.number().optional(), rotation: z.number().optional().describe('0, 90, 180 or 270'),
});
const wireShape = z.object({
  from: z.string().describe('REF:PIN, e.g. "F1:2" or "K1:87"'),
  to: z.string().describe('REF:PIN'),
  colour: z.string().optional().describe('Colour name, id or code. "brown/red", "NR" or "BN/RD" set a tracer too.'),
  tracer: z.string().optional(), tracer2: z.string().optional(),
  gauge: z.union([z.string(), z.number()]).optional().describe('mm², e.g. 1.5, or "14 awg"'),
  length: z.number().optional().describe('metres'), current: z.number().optional().describe('amps'),
  circuit: z.string().optional().describe('What the wire is for, e.g. "Spot lamps"'),
  harness: z.string().optional().describe('The loom it runs in, e.g. "Engine bay". Added to the project\'s harness list.'),
  notes: z.string().optional(), name: z.string().optional().describe('Wire number; auto W1, W2... when omitted'),
});

const endShape = z.object({
  term: z.string().optional().describe('Terminal id or name, e.g. ring_m6_red or dt16_socket'),
  method: z.string().optional().describe('crimp, crimp_solder, solder, screw or ferrule'), strip: z.union([z.string(), z.number()]).optional().describe('Strip length in mm'),
  shrink: z.string().optional().describe('Heat-shrink or sleeve, e.g. "3:1 adhesive 6 mm"'), seal: z.string().optional().describe('seal, plug or gel'),
});

server.registerTool('create_diagram', {
  title: 'Create project',
  description: 'Create a new, empty LoomWright project file with one sheet.',
  inputSchema: {
    path: z.string().describe('File name or path, e.g. "defender-aux.loom"'), title: z.string(), project: z.string().optional().describe('Vehicle or client name for the title block'),
    standard: z.enum(['lr', 'din', 'sae', 'custom']).optional().describe('Wire colour code standard; lr = Land Rover/British'),
    volts: z.number().optional().describe('System voltage for voltage-drop checks: 12 (default), 24 or 48'),
    sheet: z.string().optional().describe('Name of the first sheet'), harnesses: z.array(z.string()).optional(), overwrite: z.boolean().optional(),
  },
}, wrap(async ({ path: p, title, project, standard, volts, sheet, harnesses, overwrite }) => {
  const full = resolvePath(p);
  if (fs.existsSync(full) && !overwrite) throw new Error(`${full} already exists. Pass overwrite: true to replace it, or edit it with the other tools.`);
  const doc = L.newDoc(title);
  if (project) doc.meta.project = project;
  if (standard) doc.settings.standard = standard;
  if (volts) doc.settings.volts = volts;
  if (sheet) doc.sheets[0].name = sheet;
  (harnesses || []).forEach((h) => addHarness(doc, h));
  save(full, doc);
  return ok(`Created ${full}`);
}));

server.registerTool('build_diagram', {
  title: 'Build a sheet from a description',
  description: 'Text-to-diagram in one call: add many parts and wires to one sheet, lay them out automatically, and save. Creates the project if it does not exist, and the sheet if the name is new. Parts without x/y are placed automatically.',
  inputSchema: {
    path: z.string(), title: z.string().optional(), project: z.string().optional(), standard: z.enum(['lr', 'din', 'sae', 'custom']).optional(),
    volts: z.number().optional().describe('System voltage: 12, 24 or 48'),
    sheet: z.union([z.string(), z.number()]).optional().describe('Sheet number or name. A new name adds a sheet.'),
    parts: z.array(partShape).default([]), wires: z.array(wireShape).default([]),
    replace: z.boolean().optional().describe('Clear this sheet first (or, with no sheet given, start a new project)'),
  },
}, wrap(async (a) => {
  const full = resolvePath(a.path);
  const exists = fs.existsSync(full);
  let project = exists && !(a.replace && a.sheet == null) ? L.normalise(JSON.parse(fs.readFileSync(full, 'utf8'))) : L.newDoc(a.title || path.basename(full, path.extname(full)));
  if (!exists && a.sheet != null && !/^\d+$/.test(String(a.sheet))) project.sheets[0].name = String(a.sheet);
  if (a.title) project.title = a.title;
  if (a.project) project.meta.project = a.project;
  if (a.standard) project.settings.standard = a.standard;
  if (a.volts) project.settings.volts = a.volts;
  const doc = sheetView(project, a.sheet, true);
  if (a.replace && a.sheet != null) { doc.parts = []; doc.wires = []; }
  const errors = [];
  a.parts.forEach((pt, i) => { try { if (pt.ref && L.findPart(doc, pt.ref)) throw new Error(`ref ${pt.ref} already exists on this sheet`); placePart(doc, pt); } catch (e) { errors.push(`part ${i + 1} (${pt.ref || pt.type}): ${e.message}`); } });
  layoutNew(doc);
  a.wires.forEach((w, i) => { try { L.addWire(doc, w.from, w.to, wireOpts(doc, w)); } catch (e) { errors.push(`wire ${i + 1} (${w.from} -> ${w.to}): ${e.message}`); } });
  save(full, project);
  const checks = L.validate(doc).filter((c) => c.level !== 'info');
  return ok(`Saved ${full}, sheet ${doc.sheetNo} "${doc.sheet.name}" with ${doc.parts.length} parts and ${doc.wires.length} wires.${errors.length ? '\n\nSkipped:\n- ' + errors.join('\n- ') : ''}${checks.length ? '\n\nChecks:\n- ' + checks.map((c) => c.text).join('\n- ') : '\n\nNo design warnings on this sheet.'}`);
}));

server.registerTool('get_diagram', {
  title: 'Read project',
  description: 'Read a project: every sheet with its parts (refs, types, fields, positions, pins) and wires, plus harnesses and stocked colours.',
  inputSchema: { path: z.string(), sheet: sheetArg.describe('Only this sheet') },
}, wrap(async ({ path: p, sheet }) => {
  const { full, project } = load(p);
  if (sheet != null) { const v = sheetView(project, sheet); return ok(`File: ${full}\nSheet ${v.sheetNo} of ${project.sheets.length}: ${v.sheet.name}\n` + sheetSummary(v)); }
  return ok(`File: ${full}\n` + summary(project));
}));

server.registerTool('add_sheet', {
  title: 'Add, rename, move or delete a sheet',
  description: 'Manage the sheets of a project. Add a sheet (optionally as a copy of another), rename one, move it to a new position, or delete it.',
  inputSchema: {
    path: z.string(), action: z.enum(['add', 'rename', 'move', 'delete']).default('add'),
    sheet: sheetArg.describe('The sheet to rename, move, delete or copy'), name: z.string().optional().describe('Name for a new sheet, or the new name'),
    position: z.number().optional().describe('1-based position for move'), copy: z.boolean().optional().describe('With add: copy the given sheet'),
  },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  let msg;
  if (a.action === 'add') {
    const s = L.newSheet(a.name || 'Sheet ' + (project.sheets.length + 1));
    if (a.copy) {
      const src = sheetView(project, a.sheet).sheet, map = {};
      s.parts = src.parts.map((q) => { const c = JSON.parse(JSON.stringify(q)); c.id = L.uid('p'); map[q.id] = c.id; return c; });
      s.wires = src.wires.map((w) => { const c = JSON.parse(JSON.stringify(w)); c.id = L.uid('w'); c.from.part = map[w.from.part]; c.to.part = map[w.to.part]; c.name = ''; return c; });
      project.sheets.push(s);
      const v = L.view(project, s); s.wires.forEach((w) => { w.name = L.nextWireName(v); });
    } else project.sheets.push(s);
    msg = `Added sheet ${project.sheets.length} "${s.name}".`;
  } else {
    const v = sheetView(project, a.sheet);
    if (a.action === 'rename') { if (!a.name) throw new Error('Give the new name.'); v.sheet.name = a.name; msg = `Renamed sheet ${v.sheetNo} to "${a.name}".`; }
    if (a.action === 'move') { const i = project.sheets.indexOf(v.sheet); project.sheets.splice(i, 1); const j = Math.max(0, Math.min(project.sheets.length, (a.position || 1) - 1)); project.sheets.splice(j, 0, v.sheet); msg = `Moved "${v.sheet.name}" to position ${j + 1}.`; }
    if (a.action === 'delete') { if (project.sheets.length < 2) throw new Error('A project needs at least one sheet.'); project.sheets.splice(project.sheets.indexOf(v.sheet), 1); msg = `Deleted sheet "${v.sheet.name}".`; }
  }
  save(full, project);
  return ok(msg + '\nSheets: ' + project.sheets.map((s, i) => `${i + 1} "${s.name}"`).join(', '));
}));

server.registerTool('add_part', {
  title: 'Add part',
  description: 'Add one component to a sheet. Without x/y it is placed below the existing drawing.',
  inputSchema: { path: z.string(), sheet: sheetArg, ...partShape.shape },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  const doc = sheetView(project, a.sheet);
  if (a.ref && L.findPart(doc, a.ref)) throw new Error(`A part called ${a.ref} already exists on this sheet.`);
  const p = placePart(doc, a); layoutNew(doc); save(full, project);
  return ok(`Added ${p.label || p.type} (${a.type}) to sheet ${doc.sheetNo} at ${p.x},${p.y}. Pins: ${L.resolved(doc, p).pins.map((q) => q.id).join(', ')}`);
}));

server.registerTool('add_wire', {
  title: 'Add wire',
  description: 'Connect two pins on the same sheet with a wire. To continue a circuit on another sheet, wire to an offpage part on each sheet.',
  inputSchema: { path: z.string(), sheet: sheetArg, ...wireShape.shape },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  const doc = sheetView(project, a.sheet);
  const w = L.addWire(doc, a.from, a.to, wireOpts(doc, a)); save(full, project);
  return ok(`Added ${w.name}: ${L.pinName(doc, w.from)} -> ${L.pinName(doc, w.to)} ${L.wireCode(doc, w)} ${w.gauge}mm²${w.harness ? ' in ' + w.harness : ''}`);
}));

server.registerTool('update_part', {
  title: 'Update part',
  description: 'Change a part\'s reference, fields, position, rotation, or its build details: part number, supplier, unit cost and where it is fitted on the vehicle.',
  inputSchema: {
    path: z.string(), sheet: sheetArg, ref: z.string().describe('Current reference, e.g. F1'), newRef: z.string().optional(), props: z.record(z.any()).optional(), x: z.number().optional(), y: z.number().optional(), rotation: z.number().optional(),
    mpn: z.string().optional().describe('Manufacturer part number'), supplier: z.string().optional(), cost: z.number().optional().describe('Unit price in the project currency'), location: z.string().optional().describe('Where it is fitted, e.g. "Engine bay, left inner wing"'),
  },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  const doc = sheetView(project, a.sheet);
  const p = L.findPart(doc, a.ref); if (!p) throw new Error(`No part called ${a.ref} on sheet ${doc.sheetNo}`);
  if (a.newRef) p.label = a.newRef;
  if (a.props) p.props = { ...p.props, ...a.props };
  if (a.x != null) p.x = L.snap(a.x);
  if (a.y != null) p.y = L.snap(a.y);
  if (a.rotation != null) p.rot = ((Math.round(a.rotation / 90) % 4) + 4) % 4;
  ['mpn', 'supplier', 'location'].forEach((k) => { if (a[k] != null) p[k] = a[k]; });
  if (a.cost != null) p.cost = a.cost;
  L.pruneWires(doc); save(full, project);
  return ok(`Updated ${p.label}.`);
}));

server.registerTool('update_wire', {
  title: 'Update wire',
  description: 'Change a wire\'s colour, tracer, size, length, current, circuit, harness, notes or number, and its build details: insulation, the multicore cable it runs in, and how each end is finished (terminal, crimp or solder, strip length, heat-shrink, seal). Identify it by wire number (W3) or by its two ends. Wire numbers are searched on every sheet.',
  inputSchema: {
    path: z.string(), sheet: sheetArg, wire: z.string().describe('Wire number like W3, or "F1:2 -> K1:30"'), colour: z.string().optional(), tracer: z.string().optional(), tracer2: z.string().optional(), gauge: z.union([z.string(), z.number()]).optional(), length: z.number().optional(), current: z.number().optional(), circuit: z.string().optional(), harness: z.string().optional(), notes: z.string().optional(), name: z.string().optional(),
    insulation: z.string().optional().describe('Insulation id or name from list_connector_series, e.g. flry_b'), cable: z.string().optional().describe('Name of a cable from define_cable; "" for a single core'),
    end_a: endShape.optional().describe('The "from" end'), end_b: endShape.optional().describe('The "to" end'),
  },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  const { doc, w } = findWireIn(project, a.sheet, a.wire);
  if (a.colour || a.tracer || a.tracer2) { const c = parseColours(doc, a.colour || w.colour, a.tracer, a.tracer2); w.colour = c.colour; if (c.tracer || a.tracer != null) w.tracer = c.tracer; if (c.tracer2) w.tracer2 = c.tracer2; }
  if (a.gauge != null) w.gauge = gauge(a.gauge);
  ['length', 'current'].forEach((k) => { if (a[k] != null) w[k] = String(a[k]); });
  ['circuit', 'notes', 'name', 'harness'].forEach((k) => { if (a[k] != null) w[k] = a[k]; });
  if (a.harness) addHarness(project, a.harness);
  if (a.insulation != null) w.insulation = pick(L.INSULATION, a.insulation, 'insulation');
  if (a.cable != null) {
    if (!a.cable) w.cable = '';
    else { const c = (project.cables || []).find((x) => x.id === a.cable || x.name.toLowerCase() === a.cable.toLowerCase()); if (!c) throw new Error(`No cable ${a.cable}. Add it with define_cable.`); w.cable = c.id; }
  }
  [['end_a', 'from'], ['end_b', 'to']].forEach(([k, side]) => {
    const e = a[k]; if (!e) return;
    w.ends = w.ends || {}; const cur = w.ends[side] = { ...(w.ends[side] || {}) };
    if (e.term != null) cur.term = pick(L.TERMINALS, e.term, 'terminal');
    if (e.method != null) cur.method = pick(pairs(L.METHODS), e.method, 'method');
    if (e.seal != null) cur.seal = pick(pairs(L.SEALS), e.seal, 'seal');
    if (e.strip != null) cur.strip = String(e.strip);
    if (e.shrink != null) cur.shrink = e.shrink;
  });
  save(full, project);
  const warn = [w.ends && w.ends.from, w.ends && w.ends.to].filter((e) => e && e.term).map((e) => L.TERMINALS.find((x) => x.id === e.term)).filter((t) => t && (parseFloat(w.gauge) < t.min || parseFloat(w.gauge) > t.max)).map((t) => `${t.name} does not suit ${w.gauge} mm².`);
  return ok(`Updated ${w.name} on sheet ${doc.sheetNo}: ${L.wireCode(doc, w)} ${w.gauge}mm²${warn.length ? '\n' + warn.join('\n') : ''}`);
}));
function findWire(doc, s) {
  const byName = doc.wires.find((w) => (w.name || '').toLowerCase() === String(s).toLowerCase() || w.id === s);
  if (byName) return byName;
  const m = /^(.+?)\s*(?:->|to|—|-)\s*(.+)$/i.exec(String(s));
  if (m) {
    const a = L.parseEnd(doc, m[1].trim()), b = L.parseEnd(doc, m[2].trim());
    const w = doc.wires.find((x) => (x.from.part === a.part && x.from.pin === a.pin && x.to.part === b.part && x.to.pin === b.pin) || (x.to.part === a.part && x.to.pin === a.pin && x.from.part === b.part && x.from.pin === b.pin));
    if (w) return w;
  }
  throw new Error(`No wire "${s}". Use get_diagram to see wire numbers.`);
}
function findWireIn(project, sheet, s) {
  if (sheet != null) { const doc = sheetView(project, sheet); return { doc, w: findWire(doc, s) }; }
  for (const doc of L.views(project)) { try { return { doc, w: findWire(doc, s) }; } catch (e) { /* next sheet */ } }
  throw new Error(`No wire "${s}" on any sheet. Use get_diagram to see wire numbers.`);
}

server.registerTool('remove', {
  title: 'Remove parts or wires',
  description: 'Delete parts (and their wires) and/or wires from one sheet.',
  inputSchema: { path: z.string(), sheet: sheetArg, parts: z.array(z.string()).optional().describe('Part refs'), wires: z.array(z.string()).optional().describe('Wire numbers') },
}, wrap(async ({ path: p, sheet, parts = [], wires = [] }) => {
  const { full, project } = load(p);
  const doc = sheetView(project, sheet);
  const ids = new Set(parts.map((r) => { const q = L.findPart(doc, r); if (!q) throw new Error(`No part ${r} on sheet ${doc.sheetNo}`); return q.id; }));
  const wids = new Set(wires.map((r) => findWire(doc, r).id));
  const before = [doc.parts.length, doc.wires.length];
  doc.parts = doc.parts.filter((q) => !ids.has(q.id));
  doc.wires = doc.wires.filter((w) => !wids.has(w.id) && !ids.has(w.from.part) && !ids.has(w.to.part));
  save(full, project);
  return ok(`Removed ${before[0] - doc.parts.length} parts and ${before[1] - doc.wires.length} wires.`);
}));

server.registerTool('add_custom_colour', {
  title: 'Add custom wire colour',
  description: 'Add a custom wire colour with its own name, code and hex colour to a project, for looms that do not follow a standard.',
  inputSchema: { path: z.string(), name: z.string(), code: z.string().describe('Short code shown on the drawing'), hex: z.string().regex(/^#?[0-9a-fA-F]{6}$/), stock: z.boolean().optional().describe('Also mark it as a colour the user stocks') },
}, wrap(async ({ path: p, name, code, hex, stock }) => {
  const { full, project } = load(p);
  const id = 'c_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const c = { id, custom: true, name, code, hex: hex.startsWith('#') ? hex : '#' + hex };
  const i = project.customColours.findIndex((x) => x.id === id);
  if (i >= 0) project.customColours[i] = c; else project.customColours.push(c);
  if (stock && !project.settings.stock.includes(id)) project.settings.stock.push(id);
  save(full, project);
  return ok(`Colour ${name} (${code}) is available as "${id}".`);
}));

server.registerTool('set_colour_stock', {
  title: 'Set the colours the user stocks',
  description: 'Record which cable colours the user actually has. With only: true, the app offers just these colours in wire pickers, so colours get reused for different circuits.',
  inputSchema: { path: z.string(), colours: z.array(z.string()).describe('Colour names, ids or codes, e.g. ["red","black","brown","green","purple"]'), only: z.boolean().optional() },
}, wrap(async ({ path: p, colours, only }) => {
  const { full, project } = load(p);
  project.settings.stock = [...new Set(colours.map((c) => resolveColour(project, c)))];
  if (only != null) project.settings.stockOnly = only;
  save(full, project);
  return ok(`Stock: ${project.settings.stock.join(', ')}${project.settings.stockOnly ? ' (only these are offered in the app)' : ''}.`);
}));

server.registerTool('colour_usage', {
  title: 'Colour usage',
  description: 'Show every job each colour combination does across the project: circuits, harnesses, sheets and wire numbers. Flags a colour used for different circuits inside the same harness.',
  inputSchema: { path: z.string(), sheet: sheetArg.describe('Only this sheet; whole project when omitted') },
}, wrap(async ({ path: p, sheet }) => {
  const { project } = load(p);
  const rows = L.colourUsage(sheet != null ? sheetView(project, sheet) : project);
  const lines = rows.map((e) => {
    const byH = {}; e.uses.forEach((u) => { (byH[u.harness] = byH[u.harness] || new Set()).add(u.circuit); });
    return `${e.code} (${e.colour}), ${e.wires} wire${e.wires === 1 ? '' : 's'}:\n` + e.uses.map((u) => `  - ${u.circuit || 'no circuit'}${u.harness ? ' in ' + u.harness : ''}${u.sheets.length ? ' [' + u.sheets.join(', ') + ']' : ''}: ${u.wires.join(', ')}${u.harness && byH[u.harness].size > 1 ? '  << same harness as another circuit' : ''}`).join('\n');
  });
  return ok(lines.join('\n') || 'No wires yet.');
}));

const shapeSchema = z.object({
  t: z.enum(['line', 'rect', 'circle', 'path', 'text']),
  x1: z.number().optional(), y1: z.number().optional(), x2: z.number().optional(), y2: z.number().optional(),
  x: z.number().optional(), y: z.number().optional(), width: z.number().optional().describe('rect width'), h: z.number().optional().describe('rect height'), rx: z.number().optional(),
  cx: z.number().optional(), cy: z.number().optional(), r: z.number().optional(),
  d: z.string().optional().describe('SVG path data'),
  text: z.string().optional().describe('May show a field, e.g. "{rating}"'), size: z.number().optional().describe('text size, 6 to 12'), anchor: z.enum(['start', 'middle', 'end']).optional(), weight: z.number().optional(),
  w: z.number().optional().describe('line/circle/path stroke width (default 2)'), sw: z.number().optional().describe('rect stroke width (default 2)'),
  fill: z.enum(['paper', 'none', 'ink']).optional(), dash: z.string().optional().describe('e.g. "4 3"'),
}).passthrough();

server.registerTool('define_component', {
  title: 'Define custom component (also from a picture)',
  description: [
    'Create a custom component for parts not in the library: a specific ECU, switch panel, controller, connector or module.',
    'Simple mode: give left/right pin lists and a labelled box is drawn.',
    'Drawn mode, e.g. from a picture of a pinout or schematic symbol the user attached: give width, height, shapes and pins with x/y. Coordinates are in drawing units with the origin at the top-left of the symbol; 10 units is one grid step and a typical part is 60 to 160 wide.',
    'Put pins on the outline at multiples of 10 (20 apart is easiest to wire); keep width and height multiples of 20. Use 2-unit strokes, text size 7 to 10, and fill "paper" for bodies.',
    'Copy the pin numbers and names exactly from the picture. Set save_to_library to put it in the user\'s My components in the app; give path to also add it to a project.',
  ].join(' '),
  inputSchema: {
    path: z.string().optional().describe('Project to add the component to'), save_to_library: z.boolean().optional().describe('Save to My components in the LoomWright app (default true when no path)'),
    name: z.string(), prefix: z.string().default('U').describe('Reference prefix, e.g. U, K, S, X'), text: z.string().optional().describe('Simple mode: text inside the box; defaults to the name'),
    sub: z.string().optional().describe('Text under the symbol, may use fields, e.g. "{part}"'),
    left: z.array(z.object({ id: z.string(), name: z.string().optional() })).default([]).describe('Simple mode: pins on the left, top to bottom'),
    right: z.array(z.object({ id: z.string(), name: z.string().optional() })).default([]).describe('Simple mode: pins on the right, top to bottom'),
    width: z.number().optional().describe('Drawn mode: symbol width'), height: z.number().optional().describe('Drawn mode: symbol height'),
    shapes: z.array(shapeSchema).optional().describe('Drawn mode: the symbol drawing'),
    pins: z.array(z.object({ id: z.string(), x: z.number(), y: z.number(), name: z.string().optional() })).optional().describe('Drawn mode: pins with positions on the outline'),
    fields: z.record(z.string()).optional().describe('Editable fields with defaults, e.g. {"part":"BTS7960"}'),
  },
}, wrap(async (a) => {
  const { L: Ln, R, T } = L.shapes;
  let w, h, shapes, pins;
  if (a.shapes && a.shapes.length) {
    if (!a.pins || !a.pins.length) throw new Error('Drawn mode needs pins with x and y.');
    const r20 = (v) => Math.max(20, Math.ceil(v / 20) * 20);
    w = r20(a.width || Math.max(...a.pins.map((p) => p.x), 40)); h = r20(a.height || Math.max(...a.pins.map((p) => p.y), 40));
    shapes = a.shapes.map((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v != null)));
    pins = a.pins.map((p) => ({ id: String(p.id), x: L.snap(p.x), y: L.snap(p.y), n: p.name || String(p.id) }));
    const off = pins.filter((p) => p.x < 0 || p.y < 0 || p.x > w || p.y > h);
    if (off.length) throw new Error(`Pins outside the ${w}×${h} symbol: ${off.map((p) => p.id).join(', ')}`);
  } else {
    if (!a.left.length && !a.right.length) throw new Error('Give left/right pins (simple mode) or shapes and pins (drawn mode).');
    const n = Math.max(1, a.left.length, a.right.length); h = n * 20 + 20; w = 160;
    shapes = [R(10, 0, 140, h, { rx: 4 }), T(80, h / 2 + 4, a.text || a.name, { size: 10, weight: 600 })];
    pins = [];
    a.left.forEach((pn, i) => { const y = 20 + i * 20; shapes.push(Ln(0, y, 10, y), T(14, y + 3, pn.name || pn.id, { size: 7, anchor: 'start' })); pins.push({ id: pn.id, x: 0, y, n: pn.name || pn.id }); });
    a.right.forEach((pn, i) => { const y = 20 + i * 20; shapes.push(Ln(150, y, 160, y), T(146, y + 3, pn.name || pn.id, { size: 7, anchor: 'end' })); pins.push({ id: pn.id, x: w, y, n: pn.name || pn.id }); });
  }
  if (new Set(pins.map((p) => p.id)).size !== pins.length) throw new Error('Pin ids must be unique.');
  const id = 'c_' + a.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const def = { id, custom: true, cat: 'My components', name: a.name, prefix: a.prefix, sub: a.sub || '', props: Object.entries(a.fields || {}).map(([k, d]) => ({ k, l: k, d })), w, h, pins, shapes };
  const out = [];
  const toLib = a.save_to_library != null ? a.save_to_library : !a.path;
  if (toLib) {
    const lib = loadLibrary();
    const i = lib.parts.findIndex((x) => x.id === id);
    if (i >= 0) lib.parts[i] = def; else lib.parts.push(def);
    out.push(`Saved to My components (${saveLibrary(lib)}). It shows in the LoomWright Parts pane when you switch back to the app.`);
  }
  if (a.path) {
    const { full, project } = load(a.path);
    const i = project.customParts.findIndex((x) => x.id === id);
    if (i >= 0) project.customParts[i] = def; else project.customParts.push(def);
    save(full, project);
    out.push(`Added to ${full}.`);
  }
  const svgFile = path.join(os.tmpdir(), id + '.svg');
  try { const pad = 10; fs.writeFileSync(svgFile, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" width="${(w + pad * 2) * 3}" height="${(h + pad * 2) * 3}"><rect x="${-pad}" y="${-pad}" width="${w + pad * 2}" height="${h + pad * 2}" fill="#fff"/>${L.symbolSVG({ w, h, pins, shapes, props: L.defaultProps(def) })}${pins.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="#2f6fde"/><text x="${p.x}" y="${p.y - 4}" font-size="5" fill="#2f6fde" text-anchor="middle">${L.esc(p.id)}</text>`).join('')}</svg>`); } catch (e) { /* preview is optional */ }
  return ok(`Component type "${id}" (${w}×${h}) with pins ${pins.map((p) => p.id).join(', ')}. ${out.join(' ')} Preview: ${svgFile}. Place it with add_part or build_diagram using type "${id}".`);
}));

server.registerTool('auto_layout', {
  title: 'Auto layout',
  description: 'Re-arrange every part on a sheet into columns: power, protection, switches, relays, loads, with earths along the bottom. Clears manual wire bends.',
  inputSchema: { path: z.string(), sheet: sheetArg },
}, wrap(async ({ path: p, sheet }) => {
  const { full, project } = load(p);
  const doc = sheetView(project, sheet);
  L.autoLayout(doc); doc.wires.forEach((w) => { delete w.points; delete w.dx; });
  save(full, project);
  return ok(`Laid out ${doc.parts.length} parts on sheet ${doc.sheetNo}.`);
}));

server.registerTool('check_diagram', {
  title: 'Check project',
  description: 'Run design checks on every sheet (or one): unconnected pins, fuse rating against wire size, current against wire size, voltage drop over 3%.',
  inputSchema: { path: z.string(), sheet: sheetArg.describe('Only this sheet'), includeInfo: z.boolean().optional() },
}, wrap(async ({ path: p, sheet, includeInfo }) => {
  const { project } = load(p);
  const out = L.validate(sheet != null ? sheetView(project, sheet) : project).filter((c) => includeInfo || c.level !== 'info');
  return ok(out.length ? out.map((c) => `[${c.level}] ${c.text}`).join('\n') : 'No problems found.');
}));

server.registerTool('wire_list', {
  title: 'Wire list',
  description: 'Get the wire list (with sheet and harness), parts list and cable totals for buying cable.',
  inputSchema: { path: z.string(), sheet: sheetArg.describe('Only this sheet') },
}, wrap(async ({ path: p, sheet }) => {
  const { project } = load(p);
  const d = sheet != null ? sheetView(project, sheet) : project;
  return ok('Wire list', { wires: L.wireList(d), parts: L.bom(d), cable: L.cableTotals(d) });
}));

server.registerTool('export_svg', {
  title: 'Export SVG',
  description: 'Export sheets, with title block and colour key, as SVG images. One file per sheet.',
  inputSchema: { path: z.string(), sheet: sheetArg.describe('Only this sheet; every sheet when omitted'), out: z.string().optional().describe('Output path for a single sheet; defaults next to the project') },
}, wrap(async ({ path: p, sheet, out }) => {
  const { full, project } = load(p);
  const vs = sheet != null ? [sheetView(project, sheet)] : L.views(project);
  const base = full.replace(/\.(loom|json)$/i, '');
  const written = vs.map((v) => {
    const target = out && vs.length === 1 ? (path.isAbsolute(out) ? out : path.join(path.dirname(full), out)) : vs.length === 1 && project.sheets.length === 1 ? base + '.svg' : `${base}-${v.sheetNo}.svg`;
    fs.writeFileSync(target, L.exportSVG(v));
    return target;
  });
  return ok(`Wrote ${written.join(', ')}`);
}));

/* ---------------- reference data ---------------- */
const pick = (list, value, what) => {
  if (value == null) return undefined;
  const q = String(value).trim().toLowerCase();
  if (!q || q === 'none' || q === 'not set') return '';
  const hit = list.find((x) => String(x.id).toLowerCase() === q) || list.find((x) => x.name.toLowerCase() === q) || list.find((x) => x.name.toLowerCase().includes(q));
  if (!hit) throw new Error(`Unknown ${what} "${value}". Use list_connector_series to see the choices.`);
  return hit.id;
};
const pairs = (list) => list.map(([id, name]) => ({ id, name }));

server.registerTool('list_connector_series', {
  title: 'Connector series, terminals and materials',
  description: 'List the connector series LoomWright knows (Deutsch DT/DTM/DTP, Superseal, Econoseal, Metri-Pack, Anderson and more) with ways, ratings and housing part numbers, plus terminals, wire insulation types, sleeving, termination methods, seals and cable types. Use the ids with add_part (type "conn", props series/ways/gender/mate) and update_wire (insulation, end_a/end_b).',
  inputSchema: {},
}, wrap(async () => {
  const lines = ['Connector series (part type "conn"; props: series, ways, gender plug|receptacle, mate, mpn):'];
  L.SERIES.forEach((s) => lines.push(`  ${s.id} — ${s.name}${s.ways ? ', ways ' + s.ways.join('/') : ''}${s.rating ? ', ' + s.rating : ''}${s.sealed ? ', sealed' : ''}${s.housing && s.ways ? `, e.g. ${s.housing(s.ways[0], 'plug')} / ${s.housing(s.ways[0], 'receptacle')}` : ''}`));
  lines.push('', 'Terminals (end_a/end_b term):');
  L.TERMINALS.filter((x) => x.id).forEach((x) => lines.push(`  ${x.id} — ${x.name}${x.max < 999 ? ` (${x.min}–${x.max} mm²)` : ''}`));
  lines.push('', 'Insulation (update_wire insulation):');
  L.INSULATION.filter((x) => x.id).forEach((x) => lines.push(`  ${x.id} — ${x.name}${x.temp ? ', ' + x.temp : ''}`));
  lines.push('', 'Sleeving (harness_formboard sleeve):');
  L.SLEEVING.filter((x) => x.id).forEach((x) => lines.push(`  ${x.id} — ${x.name}${x.sizes ? ', sizes ' + x.sizes.join('/') + ' mm' : ''}`));
  lines.push('', 'Termination methods: ' + L.METHODS.filter((m) => m[0]).map((m) => `${m[0]} (${m[1]})`).join(', '));
  lines.push('Seals: ' + L.SEALS.filter((m) => m[0]).map((m) => `${m[0]} (${m[1]})`).join(', '));
  lines.push('Cable types (define_cable): ' + L.CABLE_TYPES.map((m) => `${m[0]} (${m[1]})`).join(', '));
  lines.push('', 'Part numbers are a guide. Check them against the maker\'s current catalogue before ordering.');
  return ok(lines.join('\n'));
}));

server.registerTool('define_cable', {
  title: 'Multicore or screened cable',
  description: 'Add or change a multicore, twisted or screened cable and put wires in it as its cores. The cable report then shows used and spare cores.',
  inputSchema: {
    path: z.string(), name: z.string().describe('Cable name, e.g. C1 or "Rear lights 7-core"'),
    type: z.enum(['single', 'multicore', 'twisted', 'screened', 'twisted_screened']).optional(), cores: z.number().optional(), mpn: z.string().optional(),
    wires: z.array(z.string()).optional().describe('Wire numbers that run in this cable'), remove: z.boolean().optional().describe('Delete the cable (its wires become single cores)'),
  },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  project.cables = project.cables || [];
  let c = project.cables.find((x) => x.id === a.name || x.name.toLowerCase() === a.name.toLowerCase());
  if (a.remove) {
    if (!c) throw new Error(`No cable ${a.name}.`);
    project.cables = project.cables.filter((x) => x !== c);
    L.views(project).forEach((v) => v.wires.forEach((w) => { if (w.cable === c.id) w.cable = ''; }));
    save(full, project); return ok(`Removed cable ${c.name}.`);
  }
  if (!c) { c = { id: L.uid('cab'), name: a.name, type: 'multicore', cores: 2, mpn: '' }; project.cables.push(c); }
  if (a.type) c.type = a.type;
  if (a.cores != null) c.cores = a.cores;
  if (a.mpn != null) c.mpn = a.mpn;
  (a.wires || []).forEach((n) => { findWireIn(project, null, n).w.cable = c.id; });
  save(full, project);
  const r = L.cableReport(project).find((x) => x.id === c.id);
  return ok(`Cable ${r.name}: ${r.typeName}, ${r.cores || '?'} cores, ${r.used} used${r.spare != null ? ', ' + r.spare + ' spare' : ''}${r.wires.length ? ' (' + r.wires.join(', ') + ')' : ''}.${r.cores && r.used > r.cores ? ' More wires than cores.' : ''}`);
}));

/* ---------------- circuits ---------------- */
server.registerTool('trace_circuit', {
  title: 'Trace a circuit',
  description: 'Follow a wire or pin through the whole project: every pin and wire electrically joined to it, across sheets, off-page links, net labels and mated connectors. Switches and relays are treated as open.',
  inputSchema: { path: z.string(), sheet: sheetArg.describe('Sheet of the pin; wire numbers are searched on every sheet'), from: z.string().describe('Wire number like W3, or a pin like "K1:87"') },
}, wrap(async (a) => {
  const { project } = load(a.path);
  let sheetId, end;
  if (/:/.test(a.from)) {
    const docs = a.sheet != null ? [sheetView(project, a.sheet)] : L.views(project);
    for (const v of docs) { try { end = L.parseEnd(v, a.from.trim()); sheetId = v.sheet.id; break; } catch (e) { /* next sheet */ } }
    if (!end) throw new Error(`No pin ${a.from} on ${a.sheet != null ? 'that sheet' : 'any sheet'}.`);
  } else { const { doc, w } = findWireIn(project, a.sheet, a.from); sheetId = doc.sheet.id; end = w.from; }
  const n = L.netOf(project, sheetId, end);
  if (!n) return ok(`${a.from} is not connected to anything.`);
  const bySheet = {};
  n.pins.forEach((p) => { (bySheet[p.sheet.name] = bySheet[p.sheet.name] || { pins: [], wires: [] }).pins.push(p.label); });
  n.wires.forEach((x) => { const v = L.view(project, x.sheet); (bySheet[x.sheet.name] = bySheet[x.sheet.name] || { pins: [], wires: [] }).wires.push(`${x.wire.name} ${L.pinName(v, x.wire.from)} -> ${L.pinName(v, x.wire.to)} ${L.wireCode(v, x.wire)} ${x.wire.gauge}mm²${x.wire.harness ? ' {' + x.wire.harness + '}' : ''}`); });
  const lines = [`Net "${n.name}": ${n.pins.length} pins, ${n.wires.length} wires${n.earth ? ' (earth)' : ''}.`];
  Object.entries(bySheet).forEach(([s, x]) => { lines.push('', `${s}:`, '  pins: ' + x.pins.join(', ')); x.wires.forEach((w) => lines.push('  ' + w)); });
  return ok(lines.join('\n'));
}));

server.registerTool('test_circuit', {
  title: 'Live circuit test',
  description: 'Switch parts on and off and see what would be powered: which loads run, which relays pull in, which wires are live, and any short to earth. Without set, lists the parts that can be switched and their states. Fuses can be set to Blown. Checks connections only, not voltages or currents.',
  inputSchema: { path: z.string(), set: z.record(z.union([z.string(), z.number()])).optional().describe('Part reference to state name or number, e.g. {"S1":"On","S2":"Up","F2":"Blown"}') },
}, wrap(async (a) => {
  const { project } = load(a.path);
  const sw = [];
  L.views(project).forEach((v) => v.parts.forEach((p) => { const st = L.partStates(v, p); if (st && p.label && !sw.some((x) => x.key === st.key)) sw.push({ ...st, ref: p.label, sheet: v.sheet.name }); }));
  const list = sw.map((x) => `  ${x.ref}: ${x.states.map((s, i) => (i === x.def ? `[${s}]` : s)).join(' | ')}`).join('\n');
  if (!a.set || !Object.keys(a.set).length) return ok(`Parts you can switch (default state in brackets):\n${list || '  none'}`);
  const state = {};
  Object.entries(a.set).forEach(([ref, val]) => {
    const x = sw.find((s) => s.ref.toLowerCase() === ref.toLowerCase());
    if (!x) throw new Error(`${ref} cannot be switched. Switchable parts:\n${list}`);
    const i = typeof val === 'number' ? val : x.states.findIndex((s) => String(s).toLowerCase() === String(val).toLowerCase());
    if (i < 0 || i >= x.states.length) throw new Error(`${ref} has no state "${val}". States: ${x.states.join(', ')}`);
    state[x.key] = i;
  });
  const r = L.simulate(project, state);
  const loads = [], relays = [...r.relays].map((k) => k.split('|')[1]);
  const live = {};
  L.views(project).forEach((v) => {
    v.parts.forEach((p) => { const n = `${p.label || p.type} (${(L.partDef(v, p.type) || {}).name})`; if (r.loads.has(p.id) && !relays.includes(p.label) && !loads.includes(n)) loads.push(n); });
    v.wires.forEach((w) => { if (r.wires.has(w.id)) (live[v.sheet.name] = live[v.sheet.name] || []).push(w.name); });
  });
  const lines = [`Set: ${Object.entries(a.set).map(([k, v]) => `${k}=${v}`).join(', ')}`];
  if (r.shorts.length) lines.push(`SHORT TO EARTH from ${r.shorts.join(', ')}: a fuse would blow.`);
  lines.push(`Running: ${loads.join(', ') || 'nothing'}`, `Relays pulled in: ${relays.join(', ') || 'none'}`, 'Live wires:');
  Object.entries(live).forEach(([s, ws]) => lines.push(`  ${s}: ${ws.join(', ')}`));
  if (!Object.keys(live).length) lines.push('  none');
  lines.push('', 'This checks connections only, not voltages or currents.');
  return ok(lines.join('\n'));
}));

server.registerTool('load_budget', {
  title: 'Fuses, relays and load budget',
  description: 'The fuse and relay schedule and load budget: for each fuse, breaker and fuse box way, the loads it feeds, their total current against its rating, and the smallest wire; for relays, the load on the contacts; for batteries, alternators and DC-DC chargers, what hangs off them and hours of running. Worst case, everything switched on.',
  inputSchema: { path: z.string() },
}, wrap(async ({ path: p }) => {
  const { project } = load(p);
  const sc = L.schedule(project), lines = [`System voltage ${sc.volts} V. Loads all on together (worst case).`, '', 'Fuses and breakers:'];
  const ld = (l) => l.map((x) => `${x.ref} ${x.amps}A`).join(', ') || '—';
  sc.fuses.forEach((f) => lines.push(`  ${f.ref} (${f.sheet}): ${f.load} A of ${f.rating ?? '?'} A${f.pct != null ? ` (${f.pct}%)` : ''} ${f.status.toUpperCase()}${f.smallest ? `, smallest wire ${f.smallest} mm²` : ''}; feeds ${ld(f.loads)}${f.circuits.length ? '; circuits ' + f.circuits.join(', ') : ''}`));
  if (!sc.fuses.length) lines.push('  none');
  lines.push('', 'Relays:');
  sc.relays.forEach((f) => lines.push(`  ${f.ref} (${f.sheet}): contacts carry ${f.load} A of ${f.rating} A (${f.pct}%) ${f.status.toUpperCase()}; switches ${ld(f.loads)}`));
  if (!sc.relays.length) lines.push('  none');
  lines.push('', 'Supplies:');
  sc.supplies.forEach((f) => lines.push(`  ${f.ref} ${f.type} (${f.sheet}): ${f.load} A${f.rating ? ` of ${f.rating.toFixed ? +f.rating.toFixed(1) : f.rating} A (${f.pct}%)` : ''}${f.capacity ? `, ${f.capacity} Ah` : ''}${f.hours != null ? `, about ${f.hours} h at full load using 50% of the battery` : ''}; feeds ${ld(f.loads)}`));
  if (!sc.supplies.length) lines.push('  none');
  return ok(lines.join('\n'));
}));

/* ---------------- build lists ---------------- */
server.registerTool('report', {
  title: 'Build lists and reports',
  description: 'Get a build list for the whole project as CSV text, or save it as a .csv file: wires, bom (parts with prices and totals), cable (metres to buy by colour and size), usage (colour reuse), fuses (fuse schedule and load budget), connectors (connector cavity tables), cut (cut list by harness with terminals, strip lengths and seals), labels (a label for each wire end), locations (where each part is fitted), nets (every electrical net).',
  inputSchema: { path: z.string(), kind: z.enum(['wires', 'bom', 'cable', 'usage', 'fuses', 'connectors', 'cut', 'labels', 'locations', 'nets']), out: z.string().optional().describe('Save as this .csv file (relative to the project) instead of returning the text'), single: z.boolean().optional().describe('labels: one label per wire instead of one per end') },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  const text = L.toCSV(L.reportRows(project, a.kind, { single: a.single }));
  if (a.out) { const target = path.isAbsolute(a.out) ? a.out : path.join(path.dirname(full), a.out); fs.writeFileSync(target, '﻿' + text); return ok(`Wrote ${target}`); }
  return ok(text);
}));

/* ---------------- revision history ---------------- */
const unrecorded = (project) => { const last = project.revisions[project.revisions.length - 1]; return last ? L.compareRevisions(project, last.id, 'current').count : null; };
server.registerTool('issue_revision', {
  title: 'Issue a revision',
  description: 'Record the project as it is now as a numbered revision (A, B, C...), with a description of what changed. Each revision keeps a full copy of the drawing, so any two can be compared later and the project can go back to one. The revision table on the sheets shows the latest revisions.',
  inputSchema: { path: z.string(), description: z.string().describe('What changed in this revision, e.g. "Added rear work lamp"'), by: z.string().optional(), rev: z.string().optional().describe('Revision letter or number; the next one when omitted'), date: z.string().optional().describe('YYYY-MM-DD; today when omitted') },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  const prev = project.revisions[project.revisions.length - 1];
  const r = L.issueRevision(project, { description: a.description, by: a.by, rev: a.rev, date: a.date });
  save(full, project);
  const lines = prev ? L.describeDiff(L.compareRevisions(project, prev.id, r.id)) : [];
  return ok(`Issued revision ${r.rev} (${r.date})${prev ? `. Changes since ${prev.rev}:\n- ${lines.join('\n- ') || 'none'}` : ', the first issue.'}`);
}));

server.registerTool('list_revisions', {
  title: 'Revision history',
  description: 'List the revisions issued for a project, newest first, with the number of changes in each, and whether the drawing has changed since the latest one.',
  inputSchema: { path: z.string() },
}, wrap(async ({ path: p }) => {
  const { project } = load(p);
  const revs = project.revisions;
  if (!revs.length) return ok('No revisions issued yet. Use issue_revision to record one.');
  const lines = revs.map((r, i) => `${r.rev}  ${r.date}  ${r.by || ''}  ${r.description || ''}${i ? `  (${L.compareRevisions(project, revs[i - 1].id, r.id).count} changes)` : '  (first issue)'}`).reverse();
  const n = unrecorded(project);
  return ok(lines.join('\n') + `\n\n${n ? `${n} change${n > 1 ? 's' : ''} since ${revs[revs.length - 1].rev} not yet issued.` : `No changes since ${revs[revs.length - 1].rev}.`}`);
}));

server.registerTool('compare_revisions', {
  title: 'Compare revisions',
  description: 'List what changed between two revisions, or between a revision and the drawing as it is now: parts and wires added, removed or changed on each sheet, colour, size and length changes, sheets added or renamed.',
  inputSchema: { path: z.string(), from: z.string().optional().describe('Older revision letter; the latest revision when omitted'), to: z.string().optional().describe('Newer revision letter, or "current" (default)') },
}, wrap(async (a) => {
  const { project } = load(a.path);
  const last = project.revisions[project.revisions.length - 1];
  const from = a.from || (last && last.rev);
  if (!from) throw new Error('No revisions issued yet.');
  const d = L.compareRevisions(project, from, a.to || 'current');
  const lines = L.describeDiff(d);
  return ok(`${from} → ${a.to || 'now'}: ${d.count} change${d.count === 1 ? '' : 's'}${lines.length ? '\n- ' + lines.join('\n- ') : ''}`);
}));

server.registerTool('restore_revision', {
  title: 'Go back to a revision',
  description: 'Put the drawing back to how it was at a revision. The revision list is kept. If the drawing has changes that were never issued, they are lost, so this needs confirm: true in that case; issue a revision first to keep them.',
  inputSchema: { path: z.string(), rev: z.string(), confirm: z.boolean().optional() },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  if (!L.revisionById(project, a.rev)) throw new Error(`No revision ${a.rev}. Revisions: ${project.revisions.map((r) => r.rev).join(', ') || 'none'}`);
  const n = unrecorded(project);
  if (n && !a.confirm) throw new Error(`The drawing has ${n} change${n > 1 ? 's' : ''} since the latest revision that would be lost. Issue a revision first, or pass confirm: true.`);
  L.restoreRevision(project, a.rev);
  save(full, project);
  return ok(`The drawing is back to revision ${a.rev}. The revision list is unchanged.`);
}));

/* ---------------- harness formboard ---------------- */
server.registerTool('harness_formboard', {
  title: 'Harness formboard',
  description: 'The formboard for one harness: its ends (connectors and parts) and breakout points joined by branches, with each branch\'s length, the wires through it and the bundle diameter. Set branch lengths (mm) and sleeving, then copy the routed lengths onto the wires. A starting layout is made the first time; reshape it in the app\'s Formboard view.',
  inputSchema: {
    path: z.string(), harness: z.string(),
    lengths: z.record(z.number()).optional().describe('Branch length in mm, keyed by branch id or "FROM-TO" end labels, e.g. {"K1-S1": 450}'),
    sleeve: z.record(z.string()).optional().describe('Sleeving id per branch (same keys), e.g. {"b1":"braid"}'),
    apply_lengths: z.boolean().optional().describe('Copy the routed length of each wire onto it'), end_allowance_mm: z.number().optional().describe('Extra at each end when copying lengths (default 50)'),
  },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  const hs = [...new Set(L.wireList(project).map((w) => w.harness).filter(Boolean))];
  if (!hs.includes(a.harness)) throw new Error(`No wires in harness "${a.harness}". Harnesses with wires: ${hs.join(', ') || 'none'}`);
  let fb = L.formboard(project, a.harness);
  const lab = (id) => (fb.nodes.find((n) => n.id === id) || {}).label || 'point ' + id;
  const branchFor = (k) => {
    const b = fb.layout.branches.find((x) => x.id === k);
    if (b) return b;
    const [x, y] = String(k).split(/\s*-\s*|\s*→\s*/).map((s) => s.trim().toLowerCase());
    const hit = fb.layout.branches.find((q) => { const p = lab(q.a).toLowerCase(), r = lab(q.b).toLowerCase(); return (p === x && r === y) || (p === y && r === x); });
    if (!hit) throw new Error(`No branch "${k}". Branches: ${fb.layout.branches.map((q) => `${q.id} (${lab(q.a)}-${lab(q.b)})`).join(', ')}`);
    return hit;
  };
  Object.entries(a.lengths || {}).forEach(([k, mm]) => { branchFor(k).length = Math.round(mm); });
  Object.entries(a.sleeve || {}).forEach(([k, s]) => { branchFor(k).sleeve = pick(L.SLEEVING, s, 'sleeving'); });
  let applied = null;
  if (a.apply_lengths) applied = L.applyFormboardLengths(project, a.harness, a.end_allowance_mm != null ? a.end_allowance_mm : 50);
  fb = L.formboard(project, a.harness);
  save(full, project);
  const sl = (b) => [(L.SLEEVING.find((s) => s.id === b.sleeve) || {}).name, b.sleeveSize && b.sleeveSize + ' mm'].filter((x) => x && x !== 'None').join(' ');
  const lines = [`Harness ${a.harness}: ${fb.total} m of trunk and branches.`, '', 'Branches:'];
  fb.branches.forEach((b) => lines.push(`  ${b.id}: ${lab(b.a)} - ${lab(b.b)}, ${b.length ? b.length + ' mm' : 'no length'}, ${b.count} wire${b.count === 1 ? '' : 's'}, bundle ${b.diameter} mm${sl(b) ? ', ' + sl(b) : ''}`));
  lines.push('', 'Wires:');
  fb.wires.forEach((w) => lines.push(`  ${w.name} ${w.code} ${w.gauge}mm² ${w.from || '?'} -> ${w.to || '?'}: ${w.routed ? (w.mm ? w.mm + ' mm routed' : 'routed, branches need lengths') : 'not routed'}${w.was ? `, wire length ${w.was} m` : ''}`));
  if (applied != null) lines.push('', `Copied routed lengths to ${applied} wire${applied === 1 ? '' : 's'}, with ${a.end_allowance_mm != null ? a.end_allowance_mm : 50} mm extra at each end.`);
  return ok(lines.join('\n'));
}));

/* ---------------- settings ---------------- */
server.registerTool('project_settings', {
  title: 'Project and sheet settings',
  description: 'Read or change project settings: title block details, system voltage, colour code standard, paper size and orientation (for the whole project or one sheet), black-and-white drawings, cross-references, junction dots, wire label style, revision clouds, currency and cut allowance. Returns the settings after the change.',
  inputSchema: {
    path: z.string(), title: z.string().optional(), project: z.string().optional().describe('Vehicle or client name'), drawnBy: z.string().optional(), notes: z.string().optional(),
    volts: z.number().optional(), standard: z.enum(['lr', 'din', 'sae', 'custom']).optional(),
    page: z.enum(['fit', 'A4', 'A3', 'A2', 'A1']).optional().describe('Paper size for every sheet; "fit" sizes the sheet to the drawing'), orientation: z.enum(['landscape', 'portrait']).optional(),
    sheet: sheetArg.describe('Set sheet_page / sheet_orientation on this sheet'), sheet_page: z.enum(['', 'fit', 'A4', 'A3', 'A2', 'A1']).optional().describe('This sheet only; "" uses the project setting'), sheet_orientation: z.enum(['', 'landscape', 'portrait']).optional(),
    bw: z.boolean().optional().describe('Black-and-white drawings with colour codes written on the wires'), xrefs: z.boolean().optional().describe('Show where off-page links continue (sheet and zone)'), junctions: z.boolean().optional(),
    labels: z.enum(['full', 'code', 'none']).optional().describe('Wire labels: full (number, colour, size), code (colour code only) or none'), titleBlock: z.boolean().optional(), colourKey: z.boolean().optional(),
    clouds: z.string().optional().describe('Draw revision clouds round what changed since this revision letter; "" for none'),
    currency: z.string().optional(), cutAllowance: z.number().optional().describe('Metres added to each wire in the cut list'),
  },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  const s = project.settings, m = project.meta;
  if (a.title != null) project.title = a.title;
  ['project', 'drawnBy', 'notes'].forEach((k) => { if (a[k] != null) m[k] = a[k]; });
  ['volts', 'standard', 'page', 'orientation', 'bw', 'xrefs', 'junctions', 'labels', 'titleBlock', 'colourKey', 'currency', 'cutAllowance'].forEach((k) => { if (a[k] != null) s[k] = a[k]; });
  if (a.clouds != null) { if (a.clouds && !L.revisionById(project, a.clouds)) throw new Error(`No revision ${a.clouds}.`); s.clouds = a.clouds; }
  if (a.sheet_page != null || a.sheet_orientation != null) {
    const v = sheetView(project, a.sheet);
    if (a.sheet_page != null) { if (a.sheet_page) v.sheet.page = a.sheet_page; else delete v.sheet.page; }
    if (a.sheet_orientation != null) { if (a.sheet_orientation) v.sheet.orientation = a.sheet_orientation; else delete v.sheet.orientation; }
  }
  save(full, project);
  const sheets = project.sheets.map((x, i) => `${i + 1} "${x.name}"${x.page || x.orientation ? ` (${[x.page, x.orientation].filter(Boolean).join(' ')})` : ''}`).join(', ');
  return ok(`Settings for ${project.title}`, { meta: m, settings: { ...s, stock: undefined, cableCosts: undefined }, sheets });
}));

/* ---------------- export and import ---------------- */
const writeOut = (full, out, suffix, text) => {
  const target = out ? (path.isAbsolute(out) ? out : path.join(path.dirname(full), out)) : full.replace(/\.(loom|json)$/i, '') + suffix;
  fs.writeFileSync(target, text);
  return target;
};
server.registerTool('export', {
  title: 'Export',
  description: 'Write the project in another format next to it (or to out): dxf (each sheet for CAD), wireviz (YAML for the WireViz harness tool, optionally one harness), html (a read-only page anyone can open in a browser, with clickable nets), pack (the build pack: drawings, revision history, wire, cut and connector lists, fuses, parts and costs, checks, ready to print), formboard_dxf (one harness formboard at 1:1 in mm). For CSV lists use report; for SVG use export_svg.',
  inputSchema: { path: z.string(), format: z.enum(['dxf', 'wireviz', 'html', 'pack', 'formboard_dxf']), sheet: sheetArg.describe('dxf: only this sheet'), harness: z.string().optional().describe('wireviz: only this harness; formboard_dxf: required'), out: z.string().optional(), bw: z.boolean().optional().describe('pack: black-and-white drawings'), labels: z.boolean().optional().describe('pack: include wire labels') },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  let written;
  if (a.format === 'dxf') {
    const vs = a.sheet != null ? [sheetView(project, a.sheet)] : L.views(project);
    written = vs.map((v) => writeOut(full, vs.length === 1 ? a.out : null, project.sheets.length > 1 ? `-${v.sheetNo}.dxf` : '.dxf', L.exportDXF(v)));
  } else if (a.format === 'wireviz') {
    if (!L.hasYAML) throw new Error('WireViz export needs js-yaml, which is missing from this install.');
    written = [writeOut(full, a.out, a.harness ? `-${a.harness.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.yml` : '.yml', L.exportWireViz(project, { harness: a.harness }))];
  } else if (a.format === 'html') {
    written = [writeOut(full, a.out, '-view.html', L.shareHTML(project))];
  } else if (a.format === 'pack') {
    const body = L.buildPackHTML(project, { bw: a.bw, labels: a.labels });
    written = [writeOut(full, a.out, '-build-pack.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${L.esc(project.title)} build pack</title><style>@page{size:A4;margin:12mm}body{margin:0;padding:12mm;background:#fff}@media print{body{padding:0}}${L.PACK_CSS}</style></head><body>${body}</body></html>`)];
  } else {
    if (!a.harness) throw new Error('Give the harness for formboard_dxf.');
    const dxf = L.exportFormboardDXF(project, a.harness);
    save(full, project); // keeps the layout made for a new harness
    written = [writeOut(full, a.out, `-${a.harness.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-formboard.dxf`, dxf)];
  }
  return ok(`Wrote ${written.join(', ')}`);
}));

server.registerTool('import', {
  title: 'Import',
  description: 'Bring wiring into a project from another format, onto a new sheet (or a named one): csv (a wire list from a spreadsheet; first row names the columns, ends as part:pin or From part/From pin columns), wireviz (a WireViz YAML file), kicad (a KiCad netlist .net), lengths (a CSV of wire number and measured length that updates existing wires). Parts not in the project are made as plain boxes with the pins used.',
  inputSchema: { path: z.string(), format: z.enum(['csv', 'wireviz', 'kicad', 'lengths']), file: z.string().optional().describe('File to read'), text: z.string().optional().describe('Or the content itself'), sheet: z.string().optional().describe('Name of the sheet to import onto') },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  let text = a.text;
  if (a.file) { const f = a.file.startsWith('~') ? path.join(os.homedir(), a.file.slice(1)) : path.isAbsolute(a.file) ? a.file : path.join(path.dirname(full), a.file); text = fs.readFileSync(f, 'utf8'); }
  if (!text) throw new Error('Give file or text.');
  let r, msg;
  if (a.format === 'lengths') { r = L.importLengths(project, text); msg = `Updated the length of ${r.updated} wire${r.updated === 1 ? '' : 's'} (${r.unit}).${r.missing.length ? ' Not found: ' + r.missing.join(', ') : ''}`; }
  else {
    r = a.format === 'csv' ? L.importWireList(project, text, { sheetName: a.sheet }) : a.format === 'wireviz' ? L.importWireViz(project, text, { sheetName: a.sheet }) : L.importKiCad(project, text, { sheetName: a.sheet });
    msg = `Imported ${r.wires} wire${r.wires === 1 ? '' : 's'} and ${r.parts} part${r.parts === 1 ? '' : 's'} onto sheet "${r.sheet}".`;
  }
  save(full, project);
  return ok(msg + (r.warnings && r.warnings.length ? '\n\nWarnings:\n- ' + r.warnings.join('\n- ') : ''));
}));

if (require.main === module) {
  server.connect(new StdioServerTransport()).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { server, resolveColour, parseColours, gauge, libraryPath };
