// Copies the LoomWright core library (and the YAML reader it uses for WireViz files)
// into this package before it is packed, so the add-on runs on its own.
// Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs = require('fs'), path = require('path');
const here = path.join(__dirname, '..'), app = path.join(here, '..', 'app');
for (const [from, to] of [['core', 'core'], ['vendor', 'vendor']]) {
  const src = path.join(app, from), dst = path.join(here, to);
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });
  fs.readdirSync(src).forEach((f) => fs.copyFileSync(path.join(src, f), path.join(dst, f)));
}
console.log('Copied app/core and app/vendor into the package.');
