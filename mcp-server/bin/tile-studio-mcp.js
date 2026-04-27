#!/usr/bin/env node
// Bin shim — runs the TypeScript entry under tsx so we don't need a build step.
// Resolve relative to this file so `npm link` works in any cwd.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, '..', 'src', 'index.ts');

const child = spawn(
  process.execPath,
  ['--import', 'tsx', entry],
  { stdio: 'inherit', env: process.env }
);

child.on('exit', (code) => process.exit(code ?? 0));
