import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveToolsDir, assertToolsDirSafe } from '../scripts/lib/tools-dir.mjs';

test('env override wins and is resolved to an absolute path', () => {
  const r = resolveToolsDir({ SOFTWARE_DIAGRAMS_TOOLS: 'custom/tools' }, '/home/u');
  assert.equal(r.source, 'env');
  assert.ok(path.isAbsolute(r.dir));
  assert.match(r.dir, /custom[\\/]tools$/);
});

test('default is ~/.cache/software-diagrams/tools', () => {
  const r = resolveToolsDir({}, '/home/u');
  assert.equal(r.source, 'default');
  assert.equal(r.dir, path.join('/home/u', '.cache', 'software-diagrams', 'tools'));
});

test('empty-string override is ignored, not treated as a path', () => {
  const r = resolveToolsDir({ SOFTWARE_DIAGRAMS_TOOLS: '   ' }, '/home/u');
  assert.equal(r.source, 'default');
});

test('refusing a plugin cache path is fatal on both hosts', () => {
  const claude = path.join('.claude', 'plugins', 'cache', 'mp', 'p', '1.0.0', 'tools');
  const codex = path.join('.codex', 'plugins', 'cache', 'mp', 'p', 'abc123', 'tools');
  for (const bad of [path.join('/home/u', claude), path.join('/home/u', codex)]) {
    assert.throws(() => assertToolsDirSafe(bad), /plugin cache/);
  }
});

test('refusing a node_modules path is fatal', () => {
  const bad = path.join('/home/u/project', 'node_modules', 'software-diagrams', 'tools');
  assert.throws(() => assertToolsDirSafe(bad), /node_modules/);
});

test('the default location is accepted', () => {
  assert.doesNotThrow(() => assertToolsDirSafe(path.join('/home/u', '.cache', 'software-diagrams', 'tools')));
});
