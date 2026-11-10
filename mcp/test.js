// Smoke test: start the server over stdio and build a small diagram.
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-'));
  const t = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, 'server.js')], env: { ...process.env, LOOMWRIGHT_DIR: dir } });
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
  console.log(await call('export_svg', { path: 'test-horns' }));
  fs.copyFileSync(path.join(dir, 'test-horns.svg'), path.join(os.tmpdir(), 'mcp-test.svg'));
  await c.close();
  console.log('MCP smoke test passed');
})().catch((e) => { console.error(e); process.exit(1); });
