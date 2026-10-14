import test from 'node:test';
import assert from 'node:assert/strict';
import { planEnsure, executeEnsure, sha256Of, sha256OfFile } from '../scripts/lib/ensure.mjs';
import { RENDERERS } from '../scripts/lib/registry.mjs';
import { installedState, loadLedger } from '../scripts/lib/ledger.mjs';
import { toolsPath } from '../scripts/lib/tools-dir.mjs';

const DIR = '/tools';
const empty = { schemaVersion: 1, entries: {} };
const satisfied = {
  schemaVersion: 1,
  entries: {
    plantuml: {
      id: 'plantuml', kind: 'jar', version: '1.2026.8', packages: [],
      artifacts: [{ path: 'bin/plantuml.jar', sha256: 'x', bytes: 1 }],
      installedAt: '2026-10-14T00:00:00.000Z', hostNode: '22.0.0',
    },
  },
};

test('already-pinned renderer plans nothing', () => {
  const plan = planEnsure(RENDERERS.plantuml, satisfied, DIR);
  assert.equal(plan.action, 'noop');
  assert.deepEqual(plan.steps, []);
});

test('jar renderer plans one download into the pinned relative path', () => {
  const plan = planEnsure(RENDERERS.plantuml, empty, DIR);
  assert.equal(plan.action, 'install');
  assert.deepEqual(plan.steps, [
    { type: 'download', url: RENDERERS.plantuml.url, dest: 'bin/plantuml.jar' },
  ]);
});

test('structurizr plans download plus unpack', () => {
  const plan = planEnsure(RENDERERS.structurizr, empty, DIR);
  assert.deepEqual(plan.steps.map((s) => s.type), ['download', 'unpack']);
  assert.equal(plan.steps[1].dir, 'bin/structurizr');
});

test('npm renderer plans an install prefix-scoped at the tools dir', () => {
  const plan = planEnsure(RENDERERS.mermaid, empty, DIR);
  assert.deepEqual(plan.steps, [
    { type: 'npm-install', args: ['install', '--no-audit', '--no-fund', '--prefix', DIR, '@mermaid-js/mermaid-cli@12.0.0'] },
  ]);
});

test('drawio plans an install plus native rebuild', () => {
  const plan = planEnsure(RENDERERS.drawio, empty, DIR);
  assert.deepEqual(plan.steps.map((s) => s.type), ['npm-install', 'npm-rebuild']);
  assert.deepEqual(plan.steps[1].args, ['rebuild', 'drawio-headless', '--foreground-scripts', '--prefix', DIR]);
});

test('wasm renderer plans npm install only', () => {
  const plan = planEnsure(RENDERERS.graphviz, empty, DIR);
  assert.deepEqual(plan.steps.map((s) => s.type), ['npm-install']);
});

test('entryDraft carries the pinned version so the ledger records intent', () => {
  const plan = planEnsure(RENDERERS.d2, empty, DIR);
  assert.equal(plan.entryDraft.version, '0.1.33');
  assert.deepEqual(plan.entryDraft.packages, ['@terrastruct/d2@0.1.33']);
});

test('sha256Of is stable over the same bytes', () => {
  const a = sha256Of(Buffer.from('plantuml'));
  const b = sha256Of(Buffer.from('plantuml'));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('sha256OfFile hashes the bytes read through fsx', () => {
  const fsx = fakeFs();
  fsx.writeFileSync('/tools/bin/plantuml.jar', Buffer.from('plantuml'));
  assert.equal(sha256OfFile('/tools/bin/plantuml.jar', fsx), sha256Of(Buffer.from('plantuml')));
});

// --- executeEnsure: IO goes only through the injected seams ---

function fakeFs() {
  const files = new Map();
  const dirs = new Set();
  // Windows path.join yields backslashes; the fake keys everything with
  // forward slashes so write-side and ledger-side (Task 3 fsPath) lookups
  // meet on one form, exactly as real node:fs does on Windows.
  const key = (p) => String(p).split('\\').join('/');
  return {
    files,
    dirs,
    existsSync: (p) => files.has(key(p)) || dirs.has(key(p)),
    readFileSync: (p) => {
      if (!files.has(key(p))) throw new Error(`ENOENT ${p}`);
      return files.get(key(p));
    },
    writeFileSync: (p, data) => files.set(key(p), Buffer.isBuffer(data) ? data : Buffer.from(String(data))),
    mkdirSync: (p) => { dirs.add(key(p)); },
  };
}

function recordingRun(status = 0) {
  const calls = [];
  const run = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return { status, stderr: status === 0 ? '' : 'tool failed' };
  };
  return { calls, run };
}

test('executeEnsure downloads the jar, records the first-use checksum, and saves the ledger', async () => {
  const fsx = fakeFs();
  const fetched = [];
  const bytes = Buffer.from('jar-bytes');
  const { calls, run } = recordingRun();
  const res = await executeEnsure(RENDERERS.plantuml, {
    dir: DIR,
    fsx,
    run,
    fetchBuffer: async (url) => { fetched.push(url); return bytes; },
    // no ledger passed: executeEnsure must load it from disk itself
  });
  assert.equal(res.action, 'installed');
  assert.deepEqual(fetched, [RENDERERS.plantuml.url]);
  assert.deepEqual(calls, []);
  assert.ok(fsx.files.get('/tools/bin/plantuml.jar'));
  assert.equal(res.entry.artifacts[0].path, 'bin/plantuml.jar');
  assert.equal(res.entry.artifacts[0].sha256, sha256Of(bytes));
  assert.equal(res.entry.artifacts[0].bytes, bytes.length);
  const state = installedState(DIR, fsx);
  assert.deepEqual(state.plantuml.artifacts, res.entry.artifacts);
  assert.equal(state.plantuml.brokenArtifacts, undefined);
  // The recorded entry must satisfy the planner on a later run: the pinned
  // version derived here has to agree with what isSatisfied expects.
  assert.equal(planEnsure(RENDERERS.plantuml, loadLedger(DIR, fsx), DIR).action, 'noop');
});

test('executeEnsure runs npm with the prefix at the tools dir and records relative artifacts', async () => {
  const fsx = fakeFs();
  const { calls, run } = recordingRun();
  const res = await executeEnsure(RENDERERS.mermaid, {
    dir: DIR, fsx, run,
    fetchBuffer: async () => { throw new Error('must not fetch for an npm renderer'); },
    ledger: empty,
  });
  assert.equal(res.action, 'installed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'npm');
  assert.deepEqual(calls[0].args, ['install', '--no-audit', '--no-fund', '--prefix', DIR, '@mermaid-js/mermaid-cli@12.0.0']);
  assert.deepEqual(res.entry.artifacts, [{ path: 'node_modules', bytes: 0 }]);
});

test('executeEnsure unpacks with tar paths joined onto the tools dir, not cwd', async () => {
  const fsx = fakeFs();
  const { calls, run } = recordingRun();
  const res = await executeEnsure(RENDERERS.structurizr, {
    dir: DIR, fsx, run, platform: 'win32',
    fetchBuffer: async () => Buffer.from('zip-bytes'),
    ledger: empty,
  });
  assert.equal(res.action, 'installed');
  assert.equal(calls[0].cmd, 'tar');
  assert.deepEqual(calls[0].args, ['-xf', toolsPath(DIR, 'bin/structurizr-cli.zip'), '-C', toolsPath(DIR, 'bin/structurizr')]);
  assert.deepEqual(res.entry.artifacts.map((a) => a.path), ['bin/structurizr-cli.zip', 'bin/structurizr']);
  const state = installedState(DIR, fsx);
  assert.equal(state.structurizr.brokenArtifacts, undefined);
  assert.equal(planEnsure(RENDERERS.structurizr, loadLedger(DIR, fsx), DIR).action, 'noop');
});

test('executeEnsure unpacks zips with unzip on linux, where tar cannot read them', async () => {
  const fsx = fakeFs();
  const { calls, run } = recordingRun();
  const res = await executeEnsure(RENDERERS.structurizr, {
    dir: DIR, fsx, run, platform: 'linux',
    fetchBuffer: async () => Buffer.from('zip-bytes'),
    ledger: empty,
  });
  assert.equal(res.action, 'installed');
  assert.equal(calls[0].cmd, 'unzip');
  assert.deepEqual(calls[0].args, ['-o', toolsPath(DIR, 'bin/structurizr-cli.zip'), '-d', toolsPath(DIR, 'bin/structurizr')]);
});

test('executeEnsure throws on a failed npm step and leaves no ledger entry', async () => {
  const fsx = fakeFs();
  const { run } = recordingRun(1);
  await assert.rejects(
    executeEnsure(RENDERERS.mermaid, {
      dir: DIR, fsx, run,
      fetchBuffer: async () => Buffer.from('unused'),
      ledger: empty,
    }),
    /npm-install failed/,
  );
  assert.equal(fsx.files.has('/tools/installed.json'), false);
  assert.equal(fsx.files.has('/tools/bin/plantuml.jar'), false);
});

test('unpack failure error carries the tar remedy', async () => {
  const fsx = fakeFs();
  const { run } = recordingRun(1);
  await assert.rejects(
    executeEnsure(RENDERERS.structurizr, {
      dir: DIR, fsx, run, platform: 'win32',
      fetchBuffer: async () => Buffer.from('zip-bytes'),
      ledger: empty,
    }),
    /tar is required to unpack the Structurizr CLI/,
  );
  assert.equal(fsx.files.has('/tools/installed.json'), false);
});

test('unpack failure error names unzip on linux', async () => {
  const fsx = fakeFs();
  const { run } = recordingRun(1);
  await assert.rejects(
    executeEnsure(RENDERERS.structurizr, {
      dir: DIR, fsx, run, platform: 'linux',
      fetchBuffer: async () => Buffer.from('zip-bytes'),
      ledger: empty,
    }),
    /unzip is required to unpack the Structurizr CLI/,
  );
});

test('executeEnsure noop touches no IO seam', async () => {
  const tripwire = () => { throw new Error('IO seam must not be reached on noop'); };
  const res = await executeEnsure(RENDERERS.plantuml, {
    dir: DIR,
    fsx: { existsSync: tripwire, readFileSync: tripwire, writeFileSync: tripwire, mkdirSync: tripwire },
    run: tripwire,
    fetchBuffer: tripwire,
    ledger: satisfied,
  });
  assert.equal(res.action, 'noop');
  assert.equal(res.entry, satisfied.entries.plantuml);
});
