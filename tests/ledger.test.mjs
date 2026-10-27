import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LEDGER_FILENAME,
  LEDGER_SCHEMA_VERSION,
  emptyLedger,
  installedState,
  isSatisfied,
  loadLedger,
  recordInstall,
  recordRemoval,
  saveLedger,
} from '../skills/software-diagrams/scripts/lib/ledger.mjs';
import { toolsPath } from '../skills/software-diagrams/scripts/lib/tools-dir.mjs';

// The ledger hands every path to fsx in forward-slash form so a tools directory
// written on Windows is readable on macOS/Linux. Tests compare in the same form.
const norm = (value) => String(value).split(path.sep).join('/');
const ledgerPath = (dir) => norm(toolsPath(dir, LEDGER_FILENAME));

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-ledger-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeLedgerFile(dir, text) {
  fs.writeFileSync(toolsPath(dir, LEDGER_FILENAME), text, 'utf8');
}

const NPM_RENDERER = { id: 'demo', kind: 'npm', runtime: 'node', packages: ['demo-cli@1.2.3'] };
const TWO_PACKAGE_RENDERER = {
  id: 'demo2',
  kind: 'npm',
  runtime: 'wasm',
  packages: ['alpha@1.0.0', 'beta@2.0.0'],
};
const JAR_RENDERER = { id: 'demojar', kind: 'jar', runtime: 'jar', version: '1.2.3' };

// An in-memory fsx used only where the test must inject a failure into the
// write sequence; everything else runs against a real temporary directory.
function memoryFs() {
  const files = new Map();
  return {
    files,
    existsSync: (target) => files.has(norm(target)),
    mkdirSync: () => {},
    writeFileSync: (target, data) => {
      files.set(norm(target), String(data));
    },
    readFileSync: (target, encoding) => {
      const key = norm(target);
      if (!files.has(key)) throw new Error(`ENOENT: no such file or directory, open '${key}'`);
      return encoding ? files.get(key) : Buffer.from(files.get(key));
    },
    renameSync: (from, to) => {
      const source = norm(from);
      const target = norm(to);
      if (!files.has(source)) throw new Error(`ENOENT: no such file or directory, rename '${source}'`);
      files.set(target, files.get(source));
      files.delete(source);
    },
  };
}

test('emptyLedger is a fresh schema-version-1 ledger', () => {
  assert.equal(LEDGER_FILENAME, 'installed.json');
  assert.equal(LEDGER_SCHEMA_VERSION, 1);
  assert.deepEqual(emptyLedger(), { schemaVersion: 1, entries: {} });
  assert.notEqual(emptyLedger().entries, emptyLedger().entries, 'callers must not share entries');
});

test('a missing ledger loads empty and is never created', (t) => {
  const dir = tempDir(t);
  assert.deepEqual(loadLedger(dir, fs), emptyLedger());
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('save is atomic and load round-trips an install entry', (t) => {
  const root = tempDir(t);
  const dir = path.join(root, 'nested', 'tools');
  const ledger = recordInstall(emptyLedger(), {
    id: 'demo',
    kind: 'npm',
    runtime: 'node',
    version: '1.2.3',
    packages: ['demo-cli@1.2.3'],
    artifacts: [{ path: 'node_modules', bytes: 0 }],
    installedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(fs.existsSync(dir), false, 'save must create the tools directory');
  saveLedger(dir, ledger, fs);
  assert.deepEqual(fs.readdirSync(dir), [LEDGER_FILENAME], 'the temp file must be renamed away');
  assert.deepEqual(loadLedger(dir, fs), ledger);
  assert.deepEqual(JSON.parse(fs.readFileSync(ledgerPath(dir), 'utf8')), ledger);
});

test('a crash between the temp write and the rename leaves the old ledger readable', (t) => {
  const dir = tempDir(t);
  const fsx = memoryFs();
  const file = ledgerPath(dir);
  const previous = { schemaVersion: LEDGER_SCHEMA_VERSION, entries: { keep: { id: 'keep', version: '1.0.0' } } };
  fsx.files.set(file, JSON.stringify(previous));

  fsx.renameSync = () => {
    throw new Error('EIO: simulated crash after the temp write');
  };

  assert.throws(() => saveLedger(dir, recordInstall(previous, { id: 'new', version: '2.0.0' }), fsx), /simulated crash/);
  assert.deepEqual(loadLedger(dir, fsx), previous, 'the previous ledger must still parse');
  assert.equal(fsx.files.get(file), JSON.stringify(previous), 'the final file must not be half written');
});

test('a newer ledger schema is rejected with a remedy', (t) => {
  const dir = tempDir(t);
  writeLedgerFile(dir, JSON.stringify({ schemaVersion: 2, entries: {} }));
  assert.throws(
    () => loadLedger(dir, fs),
    (error) => {
      assert.ok(error.message.includes(ledgerPath(dir)), error.message);
      assert.match(error.message, /uses ledger schemaVersion 2/);
      assert.match(error.message, /this build understands 1/);
      assert.match(error.message, /Delete the file or run: node sd\.mjs reset/);
      return true;
    },
  );
});

test('corrupt JSON is reported with the file path', (t) => {
  const dir = tempDir(t);
  writeLedgerFile(dir, '{ not json');
  assert.throws(
    () => loadLedger(dir, fs),
    (error) => {
      assert.match(error.message, /^cannot parse /);
      assert.ok(error.message.includes(ledgerPath(dir)), error.message);
      return true;
    },
  );
});

test('a ledger that is not a JSON object is rejected', (t) => {
  const dir = tempDir(t);
  for (const raw of ['null', '[]', '"ledger"', '42']) {
    writeLedgerFile(dir, raw);
    assert.throws(() => loadLedger(dir, fs), /expected a JSON object/, raw);
  }
});

test('entries must be an object', (t) => {
  const dir = tempDir(t);
  for (const value of [[], 'none', 7]) {
    writeLedgerFile(dir, JSON.stringify({ schemaVersion: 1, entries: value }));
    assert.throws(() => loadLedger(dir, fs), /entries must be an object/, String(value));
  }
  writeLedgerFile(dir, JSON.stringify({ schemaVersion: 1 }));
  assert.throws(() => loadLedger(dir, fs), /entries must be an object/, 'missing entries');
});

test('a legacy ledger without schemaVersion is accepted', (t) => {
  const dir = tempDir(t);
  writeLedgerFile(dir, JSON.stringify({ entries: { demo: { id: 'demo', version: '1.2.3' } } }));
  assert.deepEqual(loadLedger(dir, fs), {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    entries: { demo: { id: 'demo', version: '1.2.3' } },
  });
});

test('recordInstall and recordRemoval replace entries without mutating the input', () => {
  const base = emptyLedger();
  const installed = recordInstall(base, { id: 'demo', version: '1.2.3' });
  assert.deepEqual(base, emptyLedger(), 'the input ledger must not change');
  assert.deepEqual(installed.entries.demo, { id: 'demo', version: '1.2.3' });

  const replaced = recordInstall(installed, { id: 'demo', version: '2.0.0' });
  assert.equal(replaced.entries.demo.version, '2.0.0');
  assert.equal(installed.entries.demo.version, '1.2.3', 'the previous ledger must not change');

  const removed = recordRemoval(replaced, 'demo');
  assert.deepEqual(removed, { schemaVersion: LEDGER_SCHEMA_VERSION, entries: {} });
  assert.equal(replaced.entries.demo.version, '2.0.0', 'removal must not mutate the input');
  assert.deepEqual(recordRemoval(removed, 'unknown'), { schemaVersion: LEDGER_SCHEMA_VERSION, entries: {} });
});

test('isSatisfied rejects a missing entry and a version mismatch', () => {
  assert.deepEqual(isSatisfied(undefined, NPM_RENDERER), { ok: false, reason: 'no ledger entry' });
  assert.deepEqual(
    isSatisfied({ id: 'demo', version: '1.0.0', packages: ['demo-cli@1.2.3'] }, NPM_RENDERER),
    { ok: false, reason: 'installed 1.0.0, pinned 1.2.3' },
  );
});

test('isSatisfied rejects packages the registry pins but the ledger lacks', () => {
  assert.deepEqual(
    isSatisfied({ id: 'demo', version: '1.2.3', packages: [] }, NPM_RENDERER),
    { ok: false, reason: 'installed packages differ from pinned: missing demo-cli@1.2.3' },
  );
  assert.deepEqual(
    isSatisfied({ id: 'demo2', version: '1.0.0', packages: ['alpha@1.0.0'] }, TWO_PACKAGE_RENDERER),
    { ok: false, reason: 'installed packages differ from pinned: missing beta@2.0.0' },
  );
});

test('isSatisfied accepts extras and version-only jar entries', () => {
  assert.deepEqual(
    isSatisfied({ id: 'demo', version: '1.2.3', packages: ['demo-cli@1.2.3'] }, NPM_RENDERER),
    { ok: true },
  );
  assert.deepEqual(
    isSatisfied({ id: 'demo', version: '1.2.3', packages: ['demo-cli@1.2.3', 'left-pad@1.3.0'] }, NPM_RENDERER),
    { ok: true },
    'extra installed packages are tolerated',
  );
  assert.deepEqual(isSatisfied({ id: 'demojar', version: '1.2.3' }, JAR_RENDERER), { ok: true });
});

test('installedState flags missing artifacts and keeps intact entries', (t) => {
  const dir = tempDir(t);
  const ledger = {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    entries: {
      intact: { id: 'intact', version: '1.0.0', artifacts: [{ path: 'bin/intact.jar' }] },
      broken: {
        id: 'broken',
        artifacts: [{ path: 'bin/missing.jar' }, { path: 'bin/also-missing' }],
      },
      noPath: { id: 'noPath', artifacts: [{ bytes: 0 }] },
    },
  };
  fs.mkdirSync(toolsPath(dir, 'bin'), { recursive: true });
  fs.writeFileSync(toolsPath(dir, 'bin', 'intact.jar'), 'jar');
  saveLedger(dir, ledger, fs);

  const state = installedState(dir, fs);
  assert.deepEqual(state.intact, ledger.entries.intact);
  assert.equal('brokenArtifacts' in state.intact, false);
  assert.deepEqual(state.broken.brokenArtifacts, [
    norm(toolsPath(dir, 'bin', 'missing.jar')),
    norm(toolsPath(dir, 'bin', 'also-missing')),
  ]);
  assert.equal(state.broken.id, 'broken', 'the recorded entry is kept alongside the flag');
  assert.deepEqual(state.noPath, ledger.entries.noPath);
  assert.deepEqual(installedState(tempDir(t), fs), {});
});