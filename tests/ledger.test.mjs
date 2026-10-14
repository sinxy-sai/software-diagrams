import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLedger, saveLedger, recordInstall, isSatisfied } from '../scripts/lib/ledger.mjs';
import { RENDERERS } from '../scripts/lib/registry.mjs';

function fakeFs() {
  const files = new Map();
  return {
    files,
    existsSync: (p) => files.has(p),
    readFileSync: (p) => { if (!files.has(p)) throw new Error(`ENOENT ${p}`); return files.get(p); },
    writeFileSync: (p, data) => files.set(p, String(data)),
    mkdirSync: () => {},
  };
}

const entry = {
  id: 'plantuml', kind: 'jar', version: '1.2026.8', packages: [],
  artifacts: [{ path: 'bin/plantuml.jar', sha256: 'aa'.repeat(32), bytes: 25000000 }],
  installedAt: '2026-10-14T00:00:00.000Z', hostNode: '22.0.0',
};

test('missing ledger loads as empty without throwing', () => {
  const fsx = fakeFs();
  assert.deepEqual(loadLedger('/tools', fsx), { schemaVersion: 1, entries: {} });
});

test('save then load round-trips and is valid JSON', () => {
  const fsx = fakeFs();
  saveLedger('/tools', recordInstall({ schemaVersion: 1, entries: {} }, entry), fsx);
  const loaded = loadLedger('/tools', fsx);
  assert.deepEqual(loaded.entries.plantuml, entry);
  assert.match(fsx.files.get('/tools/installed.json'), /"plantuml"/);
});

test('recordInstall replaces an older entry for the same renderer', () => {
  const base = recordInstall({ schemaVersion: 1, entries: {} }, entry);
  const next = recordInstall(base, { ...entry, version: '1.2026.9' });
  assert.equal(Object.keys(next.entries).length, 1);
  assert.equal(next.entries.plantuml.version, '1.2026.9');
});

test('corrupt ledger is reported with its path, not swallowed', () => {
  const fsx = fakeFs();
  fsx.files.set('/tools/installed.json', '{not json');
  assert.throws(() => loadLedger('/tools', fsx), /installed\.json/);
});

test('satisfied when registry version and artifacts match', () => {
  assert.deepEqual(isSatisfied(entry, RENDERERS.plantuml), { ok: true });
});

test('stale when the registry moved to a newer pin', () => {
  const stale = { ...entry, version: '1.2025.1' };
  const r = isSatisfied(stale, RENDERERS.plantuml);
  assert.equal(r.ok, false);
  assert.match(r.reason, /version 1\.2025\.1 .*1\.2026\.8/);
});

test('npm renderer with fewer installed packages than pinned is stale', () => {
  const mmd = {
    id: 'mermaid', kind: 'npm', version: '12.0.0',
    packages: ['@mermaid-js/mermaid-cli@11.0.0'], artifacts: [],
    installedAt: '2026-10-14T00:00:00.000Z', hostNode: '22.0.0',
  };
  const r = isSatisfied(mmd, RENDERERS.mermaid);
  assert.equal(r.ok, false);
  assert.match(r.reason, /packages/);
});

test('wasm renderer reports the registry version, not the package version', () => {
  const gv = {
    id: 'graphviz', kind: 'wasm', version: '1.28.0',
    packages: ['@hpcc-js/wasm-graphviz@1.28.0'], artifacts: [],
    installedAt: '2026-10-14T00:00:00.000Z', hostNode: '22.0.0',
  };
  const r = isSatisfied(gv, RENDERERS.graphviz);
  assert.equal(r.ok, false);
  assert.match(r.reason, /1\.29\.2/);
});
