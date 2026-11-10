// Smoke test: start the server over stdio and build a small diagram.
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-'));
  const t = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, 'server.js')], env: { ...process.env, LOOMWRIGHT_DIR: dir, LOOMWRIGHT_LIBRARY: path.join(dir, 'library.json') } });
  const c = new Client({ name: 'test', version: '1' });
  await c.connect(t);
  const tools = await c.listTools();
  console.log('tools:', tools.tools.map((x) => x.name).join(', '));
  const call = async (name, args) => { const r = await c.callTool({ name, arguments: args }); const txt = r.content.map((x) => x.text).join('\n'); if (r.isError) throw new Error(name + ': ' + txt); return txt; };
  console.log(await call('build_diagram', {
    path: 'test-horns.loom', title: 'Horn circuit', project: 'Test', standard: 'lr',
    parts: [{ ref: 'BAT1', type: 'battery' }, { ref: 'F1', type: 'fuse', props: { rating: '15A' } }, { ref: 'K1', type: 'relay4' }, { ref: 'S1', type: 'switch_push_no' }, { ref: 'B1', type: 'horn' }, { ref: 'E1', type: 'ground_chassis' }, { ref: 'E2', type: 'ground_chassis' }],
    wires: [
      { from: 'BAT1:+', to: 'F1:1', colour: 'brown', gauge: 2.5, length: 1, current: 8 },
      { from: 'F1:2', to: 'K1:30', colour: 'NR', gauge: 1.5, length: 0.5 },
      { from: 'K1:87', to: 'B1:1', colour: 'purple/black', gauge: '14 awg', length: 1.5, current: 8 },
      { from: 'B1:2', to: 'E1:G', colour: 'black', gauge: 1.5 },
      { from: 'F1:2', to: 'S1:1', colour: 'N', gauge: 0.5 },
      { from: 'S1:2', to: 'K1:86', colour: 'purple', gauge: 0.5 },
      { from: 'K1:85', to: 'E2:G', colour: 'B', gauge: 0.5 },
      { from: 'BAT1:-', to: 'E1:G', colour: 'black', gauge: 16 },
    ],
  }));
  console.log(await call('add_custom_colour', { path: 'test-horns', name: 'Bronze green', code: 'BG', hex: '#4b5a3c' }));
  console.log(await call('update_wire', { path: 'test-horns', wire: 'W3', colour: 'bronze green', tracer: 'white' }));
  console.log(await call('define_component', { path: 'test-horns', name: 'Horn controller', left: [{ id: '1', name: '+12V' }, { id: '2', name: 'GND' }], right: [{ id: '3', name: 'OUT' }] }));
  console.log(await call('add_part', { path: 'test-horns', type: 'c_horn_controller', ref: 'U1' }));
  console.log((await call('get_diagram', { path: 'test-horns' })).split('\n').slice(0, 14).join('\n'));
  console.log(await call('check_diagram', { path: 'test-horns' }));
  // a second sheet, harnesses and colour reuse
  console.log(await call('build_diagram', {
    path: 'test-horns', sheet: 'Rear lights',
    parts: [{ ref: 'F5', type: 'fuse', props: { rating: '10A' } }, { ref: 'H1', type: 'lamp' }, { ref: 'E5', type: 'ground_chassis' }],
    wires: [{ from: 'F5:2', to: 'H1:1', colour: 'purple', gauge: 1, harness: 'Rear body', circuit: 'Work lamp' }, { from: 'H1:2', to: 'E5:G', colour: 'black', gauge: 1, harness: 'Rear body' }],
  }));
  console.log(await call('update_wire', { path: 'test-horns', wire: 'W6', harness: 'Engine bay', circuit: 'Horn switch' }));
  const usage = await call('colour_usage', { path: 'test-horns' });
  console.log(usage);
  if (!/Work lamp in Rear body/.test(usage)) throw new Error('colour usage misses the reuse');
  console.log(await call('set_colour_stock', { path: 'test-horns', colours: ['red', 'black', 'brown', 'purple'], only: true }));
  // picture-to-component: a drawn symbol saved to the user library
  console.log(await call('define_component', {
    name: 'Switch panel 3-way', prefix: 'SP', width: 120, height: 80,
    shapes: [{ t: 'rect', x: 10, y: 0, width: 100, h: 80, rx: 4 }, { t: 'text', x: 60, y: 44, text: 'SWITCH PANEL', size: 8, weight: 600 }, { t: 'line', x1: 0, y1: 20, x2: 10, y2: 20 }, { t: 'line', x1: 110, y1: 20, x2: 120, y2: 20 }, { t: 'line', x1: 110, y1: 40, x2: 120, y2: 40 }, { t: 'line', x1: 110, y1: 60, x2: 120, y2: 60 }],
    pins: [{ id: 'B+', x: 0, y: 20, name: 'Feed' }, { id: '1', x: 120, y: 20 }, { id: '2', x: 120, y: 40 }, { id: '3', x: 120, y: 60 }],
  }));
  const lib = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
  if (!lib.parts.some((x) => x.id === 'c_switch_panel_3_way')) throw new Error('component not saved to library');
  if (!/c_switch_panel_3_way/.test(await call('list_components', { search: 'switch panel' }))) throw new Error('library component not listed');
  console.log(await call('add_part', { path: 'test-horns', sheet: 2, type: 'c_switch_panel_3_way', ref: 'SP1' }));
  console.log(await call('add_wire', { path: 'test-horns', sheet: 'Rear lights', from: 'SP1:1', to: 'F5:1', colour: 'red', gauge: 1, harness: 'Rear body' }));
  console.log(await call('check_diagram', { path: 'test-horns' }));
  const g = await call('get_diagram', { path: 'test-horns' });
  if (!/Sheet 2: Rear lights/.test(g) || !/SP1/.test(g)) throw new Error('sheet 2 missing');
  console.log(await call('add_sheet', { path: 'test-horns', action: 'add', name: 'Copy', sheet: 1, copy: true }));
  console.log(await call('export_svg', { path: 'test-horns' }));
  fs.copyFileSync(path.join(dir, 'test-horns-1.svg'), path.join(os.tmpdir(), 'mcp-test.svg'));
  fs.copyFileSync(path.join(dir, 'test-horns-2.svg'), path.join(os.tmpdir(), 'mcp-test-2.svg'));
  await c.close();
  console.log('MCP smoke test passed');
})().catch((e) => { console.error(e); process.exit(1); });
