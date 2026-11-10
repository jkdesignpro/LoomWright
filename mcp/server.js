#!/usr/bin/env node
/*
 * Loomwright Claude add-on: an MCP server that lets Claude create and edit
 * Loomwright wiring diagrams (.loom files) from plain-English descriptions.
 * Entirely optional; the Loomwright app works without it.
 *
 * Copyright (C) 2026 Loomwright contributors. SPDX-License-Identifier: GPL-3.0-or-later
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

const HOME_DIR = process.env.LOOMWRIGHT_DIR || path.join(os.homedir(), 'Documents', 'Loomwright');

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
  if (!fs.existsSync(full)) throw new Error(`No diagram at ${full}. Create one with create_diagram or build_diagram first.`);
  return { full, doc: L.normalise(JSON.parse(fs.readFileSync(full, 'utf8'))) };
}
function save(full, doc) {
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const tmp = full + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify({ ...doc, app: 'Loomwright MCP ' + L.VERSION }, null, 2));
  fs.renameSync(tmp, full);
}
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
function summary(doc) {
  const lines = [`Title: ${doc.title}`, `Colour standard: ${L.STANDARDS[doc.settings.standard].name}`, `Parts (${doc.parts.length}):`];
  doc.parts.forEach((p) => {
    const r = L.resolved(doc, p);
    const d = r.def || { name: p.type };
    const props = Object.entries(r.props || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${v}`).join(', ');
    lines.push(`  ${p.label || '(no ref)'} [${p.type}] ${d.name}${props ? ' (' + props + ')' : ''} at ${p.x},${p.y} pins: ${r.pins.map((q) => q.id).join(' ')}`);
  });
  lines.push(`Wires (${doc.wires.length}):`);
  L.wireList(doc).forEach((w) => lines.push(`  ${w.name}: ${w.from} -> ${w.to}  ${w.code} (${w.colour}) ${w.gauge}mm²${w.length ? ' ' + w.length + 'm' : ''}${w.current ? ' ' + w.current + 'A' : ''}${w.circuit ? ' [' + w.circuit + ']' : ''}`));
  return lines.join('\n');
}
function wireOpts(doc, a) {
  const c = parseColours(doc, a.colour, a.tracer, a.tracer2);
  return { ...c, gauge: gauge(a.gauge), length: a.length != null ? String(a.length) : '', current: a.current != null ? String(a.current) : '', circuit: a.circuit || '', notes: a.notes || '', name: a.name };
}
function placePart(doc, a) {
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
    'Loomwright makes wiring diagrams for vehicles (12V/24V automotive) and electronics. Diagrams are .loom files; relative paths are saved in ' + HOME_DIR + '.',
    'For text-to-diagram, prefer one build_diagram call: list every part with a short ref (F1, K1, S1...) and a type from list_components, then every wire as "REF:PIN" ends.',
    'Use describe_component to see a part\'s pin ids before wiring it (relays use DIN numbers 30, 85, 86, 87, 87a).',
    'Always give wires a colour (and tracer where useful), a size in mm², and where known a length in metres and current in amps, so Loomwright can check fuse sizing and voltage drop. Earth every load.',
    'After building, call check_diagram and fix warnings. Tell the user they can open the file in Loomwright; the desktop app reloads it live when you change it.',
  ].join('\n'),
});

server.registerTool('list_components', {
  title: 'List components',
  description: 'List the component library (built-in parts plus any custom components saved in a diagram). Filter by category or search text.',
  inputSchema: { search: z.string().optional().describe('Text to search names and categories, e.g. "relay"'), category: z.string().optional(), path: z.string().optional().describe('Include custom components from this diagram') },
}, wrap(async ({ search, category, path: p }) => {
  const doc = p ? load(p).doc : null;
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
  const doc = p ? load(p).doc : null;
  const item = L.libraryList(doc).find((i) => i.id === type);
  if (!item) throw new Error(`Unknown component type "${type}". Use list_components.`);
  return ok(`${item.name} (${item.id}), category ${item.category}, reference prefix ${item.prefix || 'none'}`, { pins: item.pins, fields: item.props });
}));

server.registerTool('list_wire_colours', {
  title: 'List wire colours',
  description: 'List wire colours with their codes in the Land Rover/British, DIN/IEC and SAE standards, plus custom colours in a diagram.',
  inputSchema: { path: z.string().optional() },
}, wrap(async ({ path: p }) => {
  const doc = p ? load(p).doc : null;
  return ok(L.allColours(doc).map((c) => c.custom ? `${c.id} — ${c.name} (custom code ${c.code}, ${c.hex})` : `${c.id} — ${c.name}: LR ${c.lr || '-'}, DIN ${c.din || '-'}, SAE ${c.sae || '-'}`).join('\n'));
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
  circuit: z.string().optional(), notes: z.string().optional(), name: z.string().optional().describe('Wire number; auto W1, W2... when omitted'),
});

server.registerTool('create_diagram', {
  title: 'Create diagram',
  description: 'Create a new, empty Loomwright diagram file.',
  inputSchema: { path: z.string().describe('File name or path, e.g. "defender-aux-lights.loom"'), title: z.string(), project: z.string().optional().describe('Vehicle or project name for the title block'), standard: z.enum(['lr', 'din', 'sae', 'custom']).optional().describe('Wire colour code standard; lr = Land Rover/British'), overwrite: z.boolean().optional() },
}, wrap(async ({ path: p, title, project, standard, overwrite }) => {
  const full = resolvePath(p);
  if (fs.existsSync(full) && !overwrite) throw new Error(`${full} already exists. Pass overwrite: true to replace it, or edit it with the other tools.`);
  const doc = L.newDoc(title);
  if (project) doc.meta.project = project;
  if (standard) doc.settings.standard = standard;
  save(full, doc);
  return ok(`Created ${full}`);
}));

server.registerTool('build_diagram', {
  title: 'Build diagram from a description',
  description: 'Text-to-diagram in one call: add many parts and wires at once, lay them out automatically, and save. Creates the file if it does not exist. Parts without x/y are placed automatically.',
  inputSchema: {
    path: z.string(), title: z.string().optional(), project: z.string().optional(), standard: z.enum(['lr', 'din', 'sae', 'custom']).optional(),
    parts: z.array(partShape).default([]), wires: z.array(wireShape).default([]),
    replace: z.boolean().optional().describe('Start from an empty diagram instead of adding to the existing one'),
  },
}, wrap(async (a) => {
  const full = resolvePath(a.path);
  let doc = !a.replace && fs.existsSync(full) ? L.normalise(JSON.parse(fs.readFileSync(full, 'utf8'))) : L.newDoc(a.title || path.basename(full, path.extname(full)));
  if (a.title) doc.title = a.title;
  if (a.project) doc.meta.project = a.project;
  if (a.standard) doc.settings.standard = a.standard;
  const errors = [];
  a.parts.forEach((pt, i) => { try { if (pt.ref && L.findPart(doc, pt.ref)) throw new Error(`ref ${pt.ref} already exists`); placePart(doc, pt); } catch (e) { errors.push(`part ${i + 1} (${pt.ref || pt.type}): ${e.message}`); } });
  layoutNew(doc);
  a.wires.forEach((w, i) => { try { L.addWire(doc, w.from, w.to, wireOpts(doc, w)); } catch (e) { errors.push(`wire ${i + 1} (${w.from} -> ${w.to}): ${e.message}`); } });
  save(full, doc);
  const checks = L.validate(doc).filter((c) => c.level !== 'info');
  return ok(`Saved ${full} with ${doc.parts.length} parts and ${doc.wires.length} wires.${errors.length ? '\n\nSkipped:\n- ' + errors.join('\n- ') : ''}${checks.length ? '\n\nChecks:\n- ' + checks.map((c) => c.text).join('\n- ') : '\n\nNo design warnings.'}`);
}));

server.registerTool('get_diagram', {
  title: 'Read diagram',
  description: 'Read a diagram: parts with refs, types, fields, positions and pins, and all wires.',
  inputSchema: { path: z.string() },
}, wrap(async ({ path: p }) => { const { full, doc } = load(p); return ok(`File: ${full}\n` + summary(doc)); }));

server.registerTool('add_part', {
  title: 'Add part',
  description: 'Add one component. Without x/y it is placed below the existing drawing.',
  inputSchema: { path: z.string(), ...partShape.shape },
}, wrap(async (a) => {
  const { full, doc } = load(a.path);
  if (a.ref && L.findPart(doc, a.ref)) throw new Error(`A part called ${a.ref} already exists.`);
  const p = placePart(doc, a); layoutNew(doc); save(full, doc);
  return ok(`Added ${p.label || p.type} (${a.type}) at ${p.x},${p.y}. Pins: ${L.resolved(doc, p).pins.map((q) => q.id).join(', ')}`);
}));

server.registerTool('add_wire', {
  title: 'Add wire',
  description: 'Connect two pins with a wire.',
  inputSchema: { path: z.string(), ...wireShape.shape },
}, wrap(async (a) => {
  const { full, doc } = load(a.path);
  const w = L.addWire(doc, a.from, a.to, wireOpts(doc, a)); save(full, doc);
  return ok(`Added ${w.name}: ${L.pinName(doc, w.from)} -> ${L.pinName(doc, w.to)} ${L.wireCode(doc, w)} ${w.gauge}mm²`);
}));

server.registerTool('update_part', {
  title: 'Update part',
  description: 'Change a part\'s reference, fields, position or rotation.',
  inputSchema: { path: z.string(), ref: z.string().describe('Current reference, e.g. F1'), newRef: z.string().optional(), props: z.record(z.any()).optional(), x: z.number().optional(), y: z.number().optional(), rotation: z.number().optional() },
}, wrap(async (a) => {
  const { full, doc } = load(a.path);
  const p = L.findPart(doc, a.ref); if (!p) throw new Error(`No part called ${a.ref}`);
  if (a.newRef) p.label = a.newRef;
  if (a.props) p.props = { ...p.props, ...a.props };
  if (a.x != null) p.x = L.snap(a.x); if (a.y != null) p.y = L.snap(a.y);
  if (a.rotation != null) p.rot = ((Math.round(a.rotation / 90) % 4) + 4) % 4;
  L.pruneWires(doc); save(full, doc);
  return ok(`Updated ${p.label}.`);
}));

server.registerTool('update_wire', {
  title: 'Update wire',
  description: 'Change a wire\'s colour, tracer, size, length, current, circuit, notes or number. Identify it by wire number (W3) or by its two ends.',
  inputSchema: { path: z.string(), wire: z.string().describe('Wire number like W3, or "F1:2 -> K1:30"'), colour: z.string().optional(), tracer: z.string().optional(), tracer2: z.string().optional(), gauge: z.union([z.string(), z.number()]).optional(), length: z.number().optional(), current: z.number().optional(), circuit: z.string().optional(), notes: z.string().optional(), name: z.string().optional() },
}, wrap(async (a) => {
  const { full, doc } = load(a.path);
  const w = findWire(doc, a.wire);
  if (a.colour || a.tracer || a.tracer2) { const c = parseColours(doc, a.colour || w.colour, a.tracer, a.tracer2); w.colour = c.colour; if (c.tracer || a.tracer != null) w.tracer = c.tracer; if (c.tracer2) w.tracer2 = c.tracer2; }
  if (a.gauge != null) w.gauge = gauge(a.gauge);
  ['length', 'current'].forEach((k) => { if (a[k] != null) w[k] = String(a[k]); });
  ['circuit', 'notes', 'name'].forEach((k) => { if (a[k] != null) w[k] = a[k]; });
  save(full, doc);
  return ok(`Updated ${w.name}: ${L.wireCode(doc, w)} ${w.gauge}mm²`);
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

server.registerTool('remove', {
  title: 'Remove parts or wires',
  description: 'Delete parts (and their wires) and/or wires.',
  inputSchema: { path: z.string(), parts: z.array(z.string()).optional().describe('Part refs'), wires: z.array(z.string()).optional().describe('Wire numbers') },
}, wrap(async ({ path: p, parts = [], wires = [] }) => {
  const { full, doc } = load(p);
  const ids = new Set(parts.map((r) => { const q = L.findPart(doc, r); if (!q) throw new Error(`No part ${r}`); return q.id; }));
  const wids = new Set(wires.map((r) => findWire(doc, r).id));
  const before = [doc.parts.length, doc.wires.length];
  doc.parts = doc.parts.filter((q) => !ids.has(q.id));
  doc.wires = doc.wires.filter((w) => !wids.has(w.id) && !ids.has(w.from.part) && !ids.has(w.to.part));
  save(full, doc);
  return ok(`Removed ${before[0] - doc.parts.length} parts and ${before[1] - doc.wires.length} wires.`);
}));

server.registerTool('add_custom_colour', {
  title: 'Add custom wire colour',
  description: 'Add a custom wire colour with its own name, code and hex colour to a diagram, for looms that do not follow a standard.',
  inputSchema: { path: z.string(), name: z.string(), code: z.string().describe('Short code shown on the drawing'), hex: z.string().regex(/^#?[0-9a-fA-F]{6}$/) },
}, wrap(async ({ path: p, name, code, hex }) => {
  const { full, doc } = load(p);
  const id = 'c_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const c = { id, custom: true, name, code, hex: hex.startsWith('#') ? hex : '#' + hex };
  const i = doc.customColours.findIndex((x) => x.id === id);
  if (i >= 0) doc.customColours[i] = c; else doc.customColours.push(c);
  save(full, doc);
  return ok(`Colour ${name} (${code}) is available as "${id}".`);
}));

server.registerTool('define_component', {
  title: 'Define custom component',
  description: 'Create a custom component in a diagram, for parts not in the library (a specific ECU, switch panel, controller...). Give pins on the left and right; a labelled box symbol is drawn automatically.',
  inputSchema: {
    path: z.string(), name: z.string(), prefix: z.string().default('U').describe('Reference prefix, e.g. U, K, S'), text: z.string().optional().describe('Text inside the box; defaults to the name'),
    left: z.array(z.object({ id: z.string(), name: z.string().optional() })).default([]).describe('Pins on the left, top to bottom'),
    right: z.array(z.object({ id: z.string(), name: z.string().optional() })).default([]).describe('Pins on the right, top to bottom'),
    fields: z.record(z.string()).optional().describe('Editable fields with defaults, e.g. {"part":"BTS7960"}'),
  },
}, wrap(async (a) => {
  const { full, doc } = load(a.path);
  const n = Math.max(1, a.left.length, a.right.length), h = n * 20 + 20, w = 160;
  const { L: Ln, R, T } = L.shapes;
  const shapes = [R(10, 0, 140, h, { rx: 4 }), T(80, h / 2 + 4, a.text || a.name, { size: 10, weight: 600 })];
  const pins = [];
  a.left.forEach((pn, i) => { const y = 20 + i * 20; shapes.push(Ln(0, y, 10, y), T(14, y + 3, pn.name || pn.id, { size: 7, anchor: 'start' })); pins.push({ id: pn.id, x: 0, y, n: pn.name || pn.id }); });
  a.right.forEach((pn, i) => { const y = 20 + i * 20; shapes.push(Ln(150, y, 160, y), T(146, y + 3, pn.name || pn.id, { size: 7, anchor: 'end' })); pins.push({ id: pn.id, x: w, y, n: pn.name || pn.id }); });
  if (new Set(pins.map((p) => p.id)).size !== pins.length) throw new Error('Pin ids must be unique.');
  const id = 'c_' + a.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const def = { id, custom: true, cat: 'My components', name: a.name, prefix: a.prefix, sub: '', props: Object.entries(a.fields || {}).map(([k, d]) => ({ k, l: k, d })), w, h, pins, shapes };
  const i = doc.customParts.findIndex((x) => x.id === id);
  if (i >= 0) doc.customParts[i] = def; else doc.customParts.push(def);
  save(full, doc);
  return ok(`Defined component type "${id}" with pins ${pins.map((p) => p.id).join(', ')}. Add it with add_part or build_diagram using type "${id}".`);
}));

server.registerTool('auto_layout', {
  title: 'Auto layout',
  description: 'Re-arrange every part into columns: power, protection, switches, relays, loads, with earths along the bottom. Clears manual wire bends.',
  inputSchema: { path: z.string() },
}, wrap(async ({ path: p }) => {
  const { full, doc } = load(p);
  L.autoLayout(doc); doc.wires.forEach((w) => { delete w.points; delete w.dx; });
  save(full, doc);
  return ok(`Laid out ${doc.parts.length} parts.`);
}));

server.registerTool('check_diagram', {
  title: 'Check diagram',
  description: 'Run design checks: unconnected pins, fuse rating against wire size, current against wire size, voltage drop over 3%.',
  inputSchema: { path: z.string(), includeInfo: z.boolean().optional() },
}, wrap(async ({ path: p, includeInfo }) => {
  const { doc } = load(p);
  const out = L.validate(doc).filter((c) => includeInfo || c.level !== 'info');
  return ok(out.length ? out.map((c) => `[${c.level}] ${c.text}`).join('\n') : 'No problems found.');
}));

server.registerTool('wire_list', {
  title: 'Wire list',
  description: 'Get the wire list, parts list and cable totals (for buying cable) as text.',
  inputSchema: { path: z.string() },
}, wrap(async ({ path: p }) => {
  const { doc } = load(p);
  return ok('Wire list', { wires: L.wireList(doc), parts: L.bom(doc), cable: L.cableTotals(doc) });
}));

server.registerTool('export_svg', {
  title: 'Export SVG',
  description: 'Export the diagram, with title block and colour key, as an SVG image.',
  inputSchema: { path: z.string(), out: z.string().optional().describe('Output path; defaults to the diagram path with .svg') },
}, wrap(async ({ path: p, out }) => {
  const { full, doc } = load(p);
  const target = out ? (path.isAbsolute(out) ? out : path.join(path.dirname(full), out)) : full.replace(/\.(loom|json)$/i, '.svg');
  fs.writeFileSync(target, L.exportSVG(doc));
  return ok(`Wrote ${target}`);
}));

if (require.main === module) {
  server.connect(new StdioServerTransport()).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { server, resolveColour, parseColours, gauge };
