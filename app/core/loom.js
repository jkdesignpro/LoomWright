/*
 * LoomWright core for Node (the Claude add-on and the tests): loads every core
 * module and returns the one Loom object. The browser loads the files with
 * script tags instead.
 *
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
'use strict';
require('./loom-core.js');
require('./loom-data.js');
require('./loom-nets.js');
require('./loom-reports.js');
require('./loom-io.js');
require('./loom-circuit.js');
require('./loom-plan.js');
module.exports = require('./loom-core.js');
