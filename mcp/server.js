#!/usr/bin/env node
/*
 * LoomWright Claude add-on: an MCP server that lets Claude create and edit
 * LoomWright projects (.loom files) from plain-English descriptions, and turn
 * a picture of a component into a custom library component.
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

const L = (() => {
  for (const p of ['./loom-core.js', '../app/core/loom-core.js']) {
    try { return require(path.join(__dirname, p)); } catch (e) { /* try next */ }
  }
  throw new Error('Could not find loom-core.js');
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
  const lines = [`Project: ${project.title}`, `Colour standard: ${L.STANDARDS[s.standard].name}`, `Harnesses: ${project.harnesses.join(', ') || 'none'}`];
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
    'After building, call check_diagram and fix warnings. Tell the user they can open the file in LoomWright; the desktop app reloads it live when you change it.',
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

server.registerTool('create_diagram', {
  title: 'Create project',
  description: 'Create a new, empty LoomWright project file with one sheet.',
  inputSchema: {
    path: z.string().describe('File name or path, e.g. "defender-aux.loom"'), title: z.string(), project: z.string().optional().describe('Vehicle or client name for the title block'),
    standard: z.enum(['lr', 'din', 'sae', 'custom']).optional().describe('Wire colour code standard; lr = Land Rover/British'),
    sheet: z.string().optional().describe('Name of the first sheet'), harnesses: z.array(z.string()).optional(), overwrite: z.boolean().optional(),
  },
}, wrap(async ({ path: p, title, project, standard, sheet, harnesses, overwrite }) => {
  const full = resolvePath(p);
  if (fs.existsSync(full) && !overwrite) throw new Error(`${full} already exists. Pass overwrite: true to replace it, or edit it with the other tools.`);
  const doc = L.newDoc(title);
  if (project) doc.meta.project = project;
  if (standard) doc.settings.standard = standard;
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
  description: 'Change a part\'s reference, fields, position or rotation.',
  inputSchema: { path: z.string(), sheet: sheetArg, ref: z.string().describe('Current reference, e.g. F1'), newRef: z.string().optional(), props: z.record(z.any()).optional(), x: z.number().optional(), y: z.number().optional(), rotation: z.number().optional() },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  const doc = sheetView(project, a.sheet);
  const p = L.findPart(doc, a.ref); if (!p) throw new Error(`No part called ${a.ref} on sheet ${doc.sheetNo}`);
  if (a.newRef) p.label = a.newRef;
  if (a.props) p.props = { ...p.props, ...a.props };
  if (a.x != null) p.x = L.snap(a.x);
  if (a.y != null) p.y = L.snap(a.y);
  if (a.rotation != null) p.rot = ((Math.round(a.rotation / 90) % 4) + 4) % 4;
  L.pruneWires(doc); save(full, project);
  return ok(`Updated ${p.label}.`);
}));

server.registerTool('update_wire', {
  title: 'Update wire',
  description: 'Change a wire\'s colour, tracer, size, length, current, circuit, harness, notes or number. Identify it by wire number (W3) or by its two ends. Wire numbers are searched on every sheet.',
  inputSchema: { path: z.string(), sheet: sheetArg, wire: z.string().describe('Wire number like W3, or "F1:2 -> K1:30"'), colour: z.string().optional(), tracer: z.string().optional(), tracer2: z.string().optional(), gauge: z.union([z.string(), z.number()]).optional(), length: z.number().optional(), current: z.number().optional(), circuit: z.string().optional(), harness: z.string().optional(), notes: z.string().optional(), name: z.string().optional() },
}, wrap(async (a) => {
  const { full, project } = load(a.path);
  const { doc, w } = findWireIn(project, a.sheet, a.wire);
  if (a.colour || a.tracer || a.tracer2) { const c = parseColours(doc, a.colour || w.colour, a.tracer, a.tracer2); w.colour = c.colour; if (c.tracer || a.tracer != null) w.tracer = c.tracer; if (c.tracer2) w.tracer2 = c.tracer2; }
  if (a.gauge != null) w.gauge = gauge(a.gauge);
  ['length', 'current'].forEach((k) => { if (a[k] != null) w[k] = String(a[k]); });
  ['circuit', 'notes', 'name', 'harness'].forEach((k) => { if (a[k] != null) w[k] = a[k]; });
  if (a.harness) addHarness(project, a.harness);
  save(full, project);
  return ok(`Updated ${w.name} on sheet ${doc.sheetNo}: ${L.wireCode(doc, w)} ${w.gauge}mm²`);
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

if (require.main === module) {
  server.connect(new StdioServerTransport()).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { server, resolveColour, parseColours, gauge, libraryPath };
