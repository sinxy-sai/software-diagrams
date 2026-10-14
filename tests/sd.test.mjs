import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SD = fileURLToPath(new URL('../scripts/sd.mjs', import.meta.url));

function sd(args, env = {}) {
  return spawnSync(process.execPath, [SD, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function freshToolsDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('doctor reports every renderer and exits 1 when none are installed', (t) => {
  const dir = freshToolsDir(t);
  const res = sd(['doctor'], { SOFTWARE_DIAGRAMS_TOOLS: dir });
  assert.equal(res.status, 1);
  const out = res.stdout;
  assert.match(out, new RegExp(`tools dir: ${dir.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}`));
  for (const id of ['mermaid', 'd2', 'graphviz', 'drawio']) {
    assert.match(out, new RegExp(`^${id}\\s+missing`, 'm'), `${id} should be missing`);
  }
  // jar renderers are missing, or blocked when Java is absent on this machine
  for (const id of ['plantuml', 'structurizr']) {
    assert.match(out, new RegExp(`^${id}\\s+(missing|blocked)`, 'm'), `${id} should be missing or blocked`);
  }
});

test('doctor refuses a tools dir inside the Claude Code plugin cache', () => {
  const cacheDir = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'mp', 'p', '0.1.0', 'tools');
  const res = sd(['doctor'], { SOFTWARE_DIAGRAMS_TOOLS: cacheDir });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /refusing tools dir inside the Claude Code plugin cache/);
});

test('bare invocation prints usage and exits 1', () => {
  const res = sd([]);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /usage: node scripts\/sd\.mjs <command>/);
});

test('ensure rejects an unknown renderer name without touching the network', (t) => {
  const dir = freshToolsDir(t);
  const res = sd(['ensure', 'not-a-renderer'], { SOFTWARE_DIAGRAMS_TOOLS: dir });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /unknown renderer: not-a-renderer/);
  assert.equal(fs.readdirSync(dir).length, 0);
});
