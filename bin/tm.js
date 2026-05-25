#!/usr/bin/env node
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
const tsx = path.join(root, 'node_modules', '.bin', 'tsx');
const cli = path.join(root, 'src', 'cli.ts');
const result = spawnSync(tsx, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env,
});
process.exit(result.status ?? 0);
