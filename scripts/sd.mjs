#!/usr/bin/env node
// sd.mjs — the single CLI entry for the software-diagrams plugin.
// Landed so far: doctor, ensure. render/validate/reset arrive with their modules.
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolveToolsDir, assertToolsDirSafe, ToolsDirError } from './lib/tools-dir.mjs';
import { RENDERERS, rendererFor, rendererIds } from './lib/registry.mjs';
import { installedState, isSatisfied } from './lib/ledger.mjs';
import { executeEnsure } from './lib/ensure.mjs';

const fsx = fs;

// npm is a .cmd shim on Windows; Node refuses to spawn .cmd without a shell,
// and a shell needs the arguments quoted by hand. Everything else is a real
// executable and spawns directly.
function makeRun() {
  return (command, args, opts = {}) => {
    const needsShell = process.platform === 'win32' && /^(npm|npx)$/.test(command);
    const quote = (a) => (/\s/.test(a) ? `"${a}"` : a);
    const result = needsShell
      ? spawnSync([command, ...args.map(quote)].join(' '), {
          ...opts, shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
        })
      : spawnSync(command, args, {
          ...opts, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
        });
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? (result.error ? String(result.error.message) : ''),
    };
  };
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function resolveDir() {
  const { dir, source } = resolveToolsDir(process.env, os.homedir());
  assertToolsDirSafe(dir);
  return { dir, source };
}

function remedy(dir) {
  return `If ${dir} is not writable (sandbox or permissions), set SOFTWARE_DIAGRAMS_TOOLS to a writable directory and re-run.`;
}

let javaChecked = null;
function hasJava(run) {
  if (javaChecked === null) javaChecked = run('java', ['-version']).status === 0;
  return javaChecked;
}

function cmdDoctor() {
  const run = makeRun();
  let dir, source;
  try {
    ({ dir, source } = resolveDir());
  } catch (error) {
    if (error instanceof ToolsDirError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
  console.log(`tools dir: ${dir} (from ${source === 'env' ? '$SOFTWARE_DIAGRAMS_TOOLS' : 'default'})\n`);
  const state = installedState(dir, fsx);
  let allReady = true;
  for (const id of rendererIds()) {
    const renderer = RENDERERS[id];
    const entry = state[id];
    let status, detail;
    if (renderer.requiresJava && !hasJava(run)) {
      status = 'blocked';
      detail = 'Java 17+ not found on PATH';
    } else if (!entry) {
      status = 'missing';
      detail = renderer.kind === 'jar'
        ? `downloads ${renderer.archive}${renderer.unpack ? ' and unpacks it' : ''}`
        : `npm install ${renderer.packages.join(' ')}`;
    } else if (entry.brokenArtifacts) {
      status = 'blocked';
      detail = `recorded files are gone: ${entry.brokenArtifacts.join(', ')}`;
    } else {
      const check = isSatisfied(entry, renderer);
      status = check.ok ? 'ready' : 'stale';
      detail = check.ok ? `installed ${entry.version}` : check.reason;
    }
    if (status !== 'ready') allReady = false;
    console.log(`${id.padEnd(11)} ${status.padEnd(8)} ${detail}`);
  }
  console.log(`\ninstall one:  node scripts/sd.mjs ensure <renderer>`);
  console.log('install all:  node scripts/sd.mjs ensure --all');
  return allReady ? 0 : 1;
}

async function cmdEnsure(argv) {
  const run = makeRun();
  let dir;
  try {
    ({ dir } = resolveDir());
  } catch (error) {
    if (error instanceof ToolsDirError) { console.error(error.message); return 1; }
    throw error;
  }

  const targets = [];
  if (argv.includes('--all')) {
    for (const id of rendererIds()) targets.push(RENDERERS[id]);
  } else {
    for (const name of argv) {
      const renderer = rendererFor(name);
      if (!renderer) {
        console.error(`unknown renderer: ${name}\nknown renderers: ${rendererIds().join(', ')}`);
        return 1;
      }
      targets.push(renderer);
    }
  }
  if (targets.length === 0) {
    console.error('usage: sd.mjs ensure <renderer> [<renderer> ...] | --all');
    return 1;
  }

  let failed = 0;
  for (const renderer of targets) {
    if (renderer.requiresJava && !hasJava(run)) {
      console.error(`${renderer.id}: blocked — Java 17+ is required but was not found on PATH.`);
      failed += 1;
      continue;
    }
    try {
      const result = await executeEnsure(renderer, { dir, fsx, run, fetchBuffer, ledger: undefined });
      console.log(result.action === 'noop'
        ? `${renderer.id}: already ready in ${dir}`
        : `${renderer.id}: installed into ${dir} (${result.entry.artifacts.map((a) => a.path).join(', ')})`);
    } catch (error) {
      failed += 1;
      console.error(`${renderer.id}: ${error.message}\n${remedy(dir)}`);
    }
  }
  return failed ? 1 : 0;
}

function usage() {
  console.log(`usage: node scripts/sd.mjs <command>
  doctor                 report each renderer: ready | stale | missing | blocked
  ensure <r>|--all       install renderer(s) into the tools directory
commands landing next:   render, validate, reset`);
  return 1;
}

const [command, ...rest] = process.argv.slice(2);
let code;
if (command === 'doctor') code = cmdDoctor();
else if (command === 'ensure') code = await cmdEnsure(rest);
else code = usage();
process.exit(code);
