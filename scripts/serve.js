// Tiny static server for trying the editor in a browser: node scripts/serve.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'app');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain' };
const port = +process.env.PORT || 5173;
http.createServer((req, res) => {
  const p = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([.][.][/\\])+/, '');
  let file = path.join(root, p === '/' ? 'index.html' : p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`Loomwright running at http://localhost:${port}`));
