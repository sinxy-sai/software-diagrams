import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RENDERERS, pinnedVersion } from '../skills/software-diagrams/scripts/lib/registry.mjs';
import { executeEnsure, planEnsure, TOOLS_PACKAGE_JSON } from '../skills/software-diagrams/scripts/lib/ensure.mjs';
import { emptyLedger, loadLedger, recordInstall } from '../skills/software-diagrams/scripts/lib/ledger.mjs';
import { toolsPath } from '../skills/software-diagrams/scripts/lib/tools-dir.mjs';

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-ensure-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// The shared npm flags: installs must not use the user's cache (a confined
// sandbox forbids it) and must be quiet enough for a CLI.
function npmShared(dir) {
  return ['--no-audit', '--no-fund', '--loglevel=error', '--cache', toolsPath(dir, '.npm-cache')];
}

function recordedEntry(renderer) {
  return {
    id: renderer.id,
    kind: renderer.kind,
    runtime: renderer.runtime,
    version: pinnedVersion(renderer),
    packages: [...(renderer.packages ?? [])],
    artifacts: [{ path: 'node_modules', bytes: 0 }],
  };
}

// An in-memory fsx: executeEnsure's IO all flows through it, so a test can
// observe exactly which files an install created and a rollback removed.
function fakeFs() {
  const files = new Map();
  const dirs = new Set();
  const key = (target) => String(target).split(path.sep).join('/');
  const ancestors = (k) => {
    const parts = k.split('/');
    const out = [];
    for (let index = 1; index < parts.length; index += 1) out.push(parts.slice(0, index).join('/'));
    return out;
  };
  return {
    files,
    dirs,
    key,
    existsSync: (target) => files.has(key(target)) || dirs.has(key(target)),
    mkdirSync: (target) => {
      const k = key(target);
      for (const ancestor of ancestors(k)) dirs.add(ancestor);
      dirs.add(k);
    },
    writeFileSync: (target, data) => {
      const k = key(target);
      for (const ancestor of ancestors(k)) dirs.add(ancestor);
      files.set(k, data);
    },
    readFileSync: (target, encoding) => {
      const k = key(target);
      if (!files.has(k)) throw new Error(`ENOENT: no such file or directory, open '${k}'`);
      const raw = files.get(k);
      if (!encoding) return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      return Buffer.from(raw).toString(encoding);
    },
    unlinkSync: (target) => {
      const k = key(target);
      if (!files.has(k)) throw new Error(`ENOENT: no such file or directory, unlink '${k}'`);
      files.delete(k);
    },
    rmSync: (target, options = {}) => {
      const k = key(target);
      const prefix = `${k}/`;
      let removed = false;
      for (const file of [...files.keys()]) {
        if (file === k || file.startsWith(prefix)) {
          files.delete(file);
          removed = true;
        }
      }
      for (const dir of [...dirs]) {
        if (dir === k || dir.startsWith(prefix)) {
          dirs.delete(dir);
          removed = true;
        }
      }
      if (!removed && options.force !== true) throw new Error(`ENOENT: no such file or directory, rm '${k}'`);
    },
    renameSync: (from, to) => {
      const source = key(from);
      const target = key(to);
      if (!files.has(source)) throw new Error(`ENOENT: no such file or directory, rename '${source}'`);
      files.set(target, files.get(source));
      files.delete(source);
      for (const ancestor of ancestors(target)) dirs.add(ancestor);
    },
  };
}

function recordingRun(handler = () => ({ status: 0 })) {
  const calls = [];
  const run = (command, args = []) => {
    calls.push([command, ...args]);
    return handler(command, args, calls.length - 1) ?? { status: 0 };
  };
  run.calls = calls;
  return run;
}

function fetcher(data) {
  const calls = [];
  const fetchBuffer = async (url) => {
    calls.push(url);
    return typeof data === 'function' ? data(url) : data;
  };
  fetchBuffer.calls = calls;
  return fetchBuffer;
}

test('planEnsure touches no files and plans nothing for a satisfied ledger', (t) => {
  const dir = tempDir(t);
  const ledger = recordInstall(emptyLedger(), recordedEntry(RENDERERS.mermaid));
  const before = fs.readdirSync(dir);
  const plan = planEnsure(RENDERERS.mermaid, ledger, dir);
  assert.deepEqual(plan, { action: 'noop', steps: [], entryDraft: ledger.entries.mermaid });
  assert.deepEqual(fs.readdirSync(dir), before, 'planning must not write anything');
});

test('planEnsure seeds package.json and pins the npm install', (t) => {
  const dir = path.join(tempDir(t), 'tools');
  const renderer = RENDERERS.mermaid;
  const plan = planEnsure(renderer, emptyLedger(), dir);
  assert.equal(plan.action, 'install');
  assert.deepEqual(plan.steps, [
    { type: 'seed-package-json' },
    {
      type: 'npm-install',
      args: ['install', ...npmShared(dir), '--prefix', dir, '--ignore-scripts', ...renderer.packages],
    },
  ]);
  const draft = plan.entryDraft;
  assert.equal(draft.id, renderer.id);
  assert.equal(draft.kind, 'npm');
  assert.equal(draft.runtime, renderer.runtime);
  assert.equal(draft.version, pinnedVersion(renderer));
  assert.deepEqual(draft.packages, [...renderer.packages], 'the draft records the pinned packages');
  assert.deepEqual(draft.artifacts, []);
  assert.match(draft.installedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('planEnsure keeps lifecycle scripts and adds a rebuild when needed', (t) => {
  const dir = path.join(tempDir(t), 'tools');
  const renderer = RENDERERS.drawio;
  assert.equal(renderer.needsRebuild, true);
  const plan = planEnsure(renderer, emptyLedger(), dir);
  assert.deepEqual(plan.steps.map((step) => step.type), ['seed-package-json', 'npm-install', 'npm-rebuild']);
  assert.deepEqual(plan.steps[1].args, ['install', ...npmShared(dir), '--prefix', dir, ...renderer.packages]);
  assert.equal(
    plan.steps[1].args.includes('--ignore-scripts'),
    false,
    'a renderer that needs its build step must not skip lifecycle scripts',
  );
  const packageName = renderer.packages[0].slice(0, renderer.packages[0].lastIndexOf('@'));
  assert.deepEqual(plan.steps[2].args, [
    'rebuild',
    packageName,
    '--foreground-scripts',
    ...npmShared(dir),
    '--prefix',
    dir,
  ]);
});

test('planEnsure plans a checksum-verified jar download', (t) => {
  const dir = path.join(tempDir(t), 'tools');
  const renderer = RENDERERS.plantuml;
  const plan = planEnsure(renderer, emptyLedger(), dir);
  assert.equal(plan.action, 'install');
  assert.deepEqual(plan.steps, [
    {
      type: 'download',
      url: renderer.url,
      dest: renderer.download,
      sha256: renderer.sha256,
      version: pinnedVersion(renderer),
    },
  ]);
  assert.equal(plan.entryDraft.kind, 'jar');
  assert.equal(plan.entryDraft.runtime, renderer.runtime);
  assert.deepEqual(plan.entryDraft.packages, []);
});

test('planEnsure downloads and unpacks a version-scoped archive', (t) => {
  const dir = path.join(tempDir(t), 'tools');
  const renderer = RENDERERS.structurizr;
  const plan = planEnsure(renderer, emptyLedger(), dir);
  assert.deepEqual(plan.steps.map((step) => step.type), ['download', 'unpack']);
  assert.deepEqual(plan.steps[1], {
    type: 'unpack',
    archive: renderer.download,
    dir: renderer.unpack.dir,
    keepArchive: false,
  });
  assert.ok(plan.steps[1].dir.includes(pinnedVersion(renderer)), 'an upgrade must not merge two trees');
});

test('planEnsure repairs a stale ledger entry', (t) => {
  const dir = path.join(tempDir(t), 'tools');
  const renderer = RENDERERS.mermaid;
  const stale = recordedEntry(renderer);
  stale.version = '0.0.1';
  const plan = planEnsure(renderer, recordInstall(emptyLedger(), stale), dir);
  assert.equal(plan.action, 'repair');
  assert.deepEqual(plan.steps.map((step) => step.type), ['seed-package-json', 'npm-install']);
  assert.equal(plan.entryDraft.version, pinnedVersion(renderer), 'the draft carries the pinned version');
});

test('planEnsure refuses an unknown renderer kind', () => {
  const renderer = { id: 'mystery', kind: 'binary', runtime: 'native', packages: ['demo@1.0.0'] };
  assert.throws(() => planEnsure(renderer, emptyLedger(), 'tools'), /unknown renderer kind: binary/);
});

test('the seeded tools package.json marks the directory private', () => {
  const manifest = JSON.parse(TOOLS_PACKAGE_JSON);
  assert.equal(manifest.name, 'software-diagrams-tools');
  assert.equal(manifest.private, true);
});

test('executeEnsure installs an npm renderer through injected IO', async (t) => {
  const dir = tempDir(t);
  const fsx = fakeFs();
  const run = recordingRun();
  const fetchBuffer = fetcher(Buffer.from('unused'));
  const result = await executeEnsure(RENDERERS.mermaid, { dir, fsx, run, fetchBuffer });

  assert.equal(result.action, 'installed');
  assert.equal(result.entry.version, pinnedVersion(RENDERERS.mermaid));
  assert.deepEqual(result.entry.packages, [...RENDERERS.mermaid.packages]);
  assert.deepEqual(result.entry.artifacts, [{ path: 'node_modules', bytes: 0 }]);
  assert.equal(fsx.readFileSync(toolsPath(dir, 'package.json'), 'utf8'), TOOLS_PACKAGE_JSON);

  assert.equal(run.calls.length, 1);
  assert.equal(run.calls[0][0], 'npm');
  const args = run.calls[0].slice(1);
  assert.equal(args[0], 'install');
  assert.ok(args.includes('--prefix'));
  assert.ok(args.includes('--ignore-scripts'));
  assert.deepEqual(args.slice(-RENDERERS.mermaid.packages.length), RENDERERS.mermaid.packages);
  assert.equal(fetchBuffer.calls.length, 0, 'an npm install must not download anything');

  assert.equal(fsx.existsSync(toolsPath(dir, 'installed.json')), true);
  assert.deepEqual(loadLedger(dir, fsx).entries[RENDERERS.mermaid.id], result.entry);
});

test('executeEnsure rejects a checksum mismatch and installs nothing', async (t) => {
  const dir = tempDir(t);
  const fsx = fakeFs();
  const payload = Buffer.from('tampered archive bytes');
  const run = recordingRun();
  const fetchBuffer = fetcher(payload);

  await assert.rejects(
    () => executeEnsure(RENDERERS.structurizr, { dir, fsx, run, fetchBuffer }),
    (error) => {
      assert.match(error.message, /checksum mismatch for https:\/\/github\.com\/structurizr\/cli/);
      assert.ok(error.message.includes(`expected ${RENDERERS.structurizr.sha256}`), error.message);
      assert.ok(error.message.includes(`actual   ${sha256(payload)}`), error.message);
      assert.match(error.message, /The download was rejected and nothing was installed\./);
      return true;
    },
  );
  assert.equal(fsx.files.size, 0, 'a rejected download must not write a file');
  assert.equal(fsx.existsSync(toolsPath(dir, 'installed.json')), false);
  assert.equal(run.calls.length, 0);
});

test('executeEnsure downloads and unpacks a jar, deleting the archive', async (t) => {
  const dir = tempDir(t);
  const fsx = fakeFs();
  const payload = Buffer.from('structurizr archive bytes');
  const renderer = { ...RENDERERS.structurizr, sha256: sha256(payload) };
  const run = recordingRun();
  const fetchBuffer = fetcher(payload);
  const result = await executeEnsure(renderer, { dir, fsx, run, fetchBuffer, platform: 'win32' });

  const archive = toolsPath(dir, renderer.download);
  const unpacked = toolsPath(dir, renderer.unpack.dir);
  assert.equal(result.action, 'installed');
  assert.deepEqual(fetchBuffer.calls, [renderer.url]);
  assert.deepEqual(run.calls, [['tar', '-xf', archive, '-C', unpacked]]);
  assert.equal(fsx.existsSync(archive), false, 'keepArchive:false deletes the archive');
  assert.equal(fsx.existsSync(unpacked), true);
  assert.deepEqual(result.entry.artifacts, [{ path: renderer.unpack.dir, bytes: 0 }]);
  assert.deepEqual(loadLedger(dir, fsx).entries[renderer.id], result.entry);
});

test('executeEnsure unpacks a zip with unzip on linux', async (t) => {
  const dir = tempDir(t);
  const fsx = fakeFs();
  const payload = Buffer.from('structurizr zip bytes');
  const renderer = { ...RENDERERS.structurizr, sha256: sha256(payload) };
  const run = recordingRun();
  await executeEnsure(renderer, { dir, fsx, run, fetchBuffer: fetcher(payload), platform: 'linux' });

  const archive = toolsPath(dir, renderer.download);
  const unpacked = toolsPath(dir, renderer.unpack.dir);
  assert.deepEqual(run.calls, [['unzip', '-o', archive, '-d', unpacked]]);
});

test('executeEnsure keeps the archive when the plan asks to', async (t) => {
  const dir = tempDir(t);
  const fsx = fakeFs();
  const payload = Buffer.from('structurizr archive bytes');
  const renderer = { ...RENDERERS.structurizr, sha256: sha256(payload), keepArchive: true };
  const run = recordingRun();
  const result = await executeEnsure(renderer, {
    dir,
    fsx,
    run,
    fetchBuffer: fetcher(payload),
    platform: 'win32',
  });

  assert.equal(fsx.existsSync(toolsPath(dir, renderer.download)), true);
  assert.deepEqual(result.entry.artifacts, [
    { path: renderer.download, sha256: sha256(payload), bytes: payload.length },
    { path: renderer.unpack.dir, bytes: 0 },
  ]);
});

test('executeEnsure downloads a bare jar without unpacking', async (t) => {
  const dir = tempDir(t);
  const fsx = fakeFs();
  const payload = Buffer.from('plantuml jar bytes');
  const renderer = { ...RENDERERS.plantuml, sha256: sha256(payload) };
  const run = recordingRun();
  const result = await executeEnsure(renderer, { dir, fsx, run, fetchBuffer: fetcher(payload) });

  assert.equal(result.action, 'installed');
  assert.deepEqual(run.calls, [], 'a jar download must not spawn a process');
  assert.deepEqual(result.entry.artifacts, [
    { path: renderer.download, sha256: sha256(payload), bytes: payload.length },
  ]);
  assert.equal(fsx.existsSync(toolsPath(dir, renderer.download)), true);
  assert.deepEqual(loadLedger(dir, fsx).entries[renderer.id], result.entry);
});

test('executeEnsure rolls back a failed npm install and records nothing', async (t) => {
  const dir = tempDir(t);
  const fsx = fakeFs();
  const run = recordingRun(() => ({ status: 1, error: 'EPERM' }));

  await assert.rejects(
    () => executeEnsure(RENDERERS.mermaid, { dir, fsx, run }),
    (error) => {
      assert.match(error.message, /npm-install failed: npm install/);
      assert.match(error.message, /\(EPERM\)/);
      return true;
    },
  );
  assert.equal(fsx.existsSync(toolsPath(dir, 'package.json')), false, 'the seeded manifest is rolled back');
  assert.equal(fsx.existsSync(toolsPath(dir, 'installed.json')), false, 'a failed install must not look installed');
  assert.deepEqual(loadLedger(dir, fsx), emptyLedger());
});

test('executeEnsure records nothing when a later npm step fails', async (t) => {
  const dir = tempDir(t);
  const fsx = fakeFs();
  const run = recordingRun((command, args) => {
    if (args[0] === 'install') {
      fsx.mkdirSync(toolsPath(dir, 'node_modules'), { recursive: true });
      fsx.writeFileSync(toolsPath(dir, 'node_modules', 'pkg', 'index.js'), 'half installed');
      return { status: 0 };
    }
    return { status: 1, error: 'EPERM' };
  });

  await assert.rejects(() => executeEnsure(RENDERERS.drawio, { dir, fsx, run }), /npm-rebuild failed/);
  assert.equal(run.calls.length, 2);
  assert.equal(fsx.existsSync(toolsPath(dir, 'package.json')), false, 'the seeded manifest is rolled back');
  assert.equal(fsx.existsSync(toolsPath(dir, 'installed.json')), false, 'a failed rebuild must not look installed');
  assert.equal(
    fsx.existsSync(toolsPath(dir, 'node_modules')),
    false,
    'the dependency tree this run created is rolled back, not just the ledger',
  );
  assert.deepEqual(loadLedger(dir, fsx), emptyLedger());
});

test('executeEnsure adopts a renderer that already probes ready', async (t) => {
  const dir = tempDir(t);
  const fsx = fakeFs();
  const renderer = RENDERERS.structurizr;
  fsx.writeFileSync(toolsPath(dir, renderer.probe.path), 'already on disk');
  const run = recordingRun();
  const fetchBuffer = fetcher(Buffer.from('unused'));

  const result = await executeEnsure(renderer, { dir, fsx, run, fetchBuffer });
  assert.equal(result.action, 'adopted');
  assert.equal(result.entry.adopted, true);
  assert.equal(result.entry.version, pinnedVersion(renderer));
  assert.deepEqual(result.entry.artifacts, [{ path: renderer.probe.path, bytes: 0 }]);
  assert.deepEqual(run.calls, []);
  assert.deepEqual(fetchBuffer.calls, []);
  assert.deepEqual(loadLedger(dir, fsx).entries[renderer.id], result.entry);
});

test('executeEnsure lets evidence correct a stale ledger entry', async (t) => {
  const dir = tempDir(t);
  const fsx = fakeFs();
  const renderer = RENDERERS.structurizr;
  fsx.writeFileSync(toolsPath(dir, renderer.probe.path), 'already on disk');
  const stale = { ...recordedEntry(renderer), version: '0.0.1', artifacts: [] };

  const result = await executeEnsure(renderer, {
    dir,
    fsx,
    run: recordingRun(),
    fetchBuffer: fetcher(Buffer.from('unused')),
    ledger: recordInstall(emptyLedger(), stale),
  });
  assert.equal(result.action, 'adopted');
  assert.equal(loadLedger(dir, fsx).entries[renderer.id].version, pinnedVersion(renderer));
});

test('executeEnsure is a noop when the probe and ledger agree', async (t) => {
  const dir = tempDir(t);
  const fsx = fakeFs();
  const renderer = RENDERERS.structurizr;
  fsx.writeFileSync(toolsPath(dir, renderer.probe.path), 'already on disk');
  const recorded = {
    id: renderer.id,
    kind: renderer.kind,
    runtime: renderer.runtime,
    version: pinnedVersion(renderer),
    packages: [],
    artifacts: [{ path: renderer.probe.path, bytes: 0 }],
  };
  const run = recordingRun();
  const fetchBuffer = fetcher(Buffer.from('unused'));

  const result = await executeEnsure(renderer, {
    dir,
    fsx,
    run,
    fetchBuffer,
    ledger: recordInstall(emptyLedger(), recorded),
  });
  assert.equal(result.action, 'noop');
  assert.deepEqual(result.entry, recorded);
  assert.deepEqual(run.calls, []);
  assert.deepEqual(fetchBuffer.calls, []);
  assert.deepEqual(loadLedger(dir, fsx), emptyLedger(), 'a noop must not rewrite the ledger');
});

test('executeEnsure reinstalls when the ledger is satisfied but files are gone', async (t) => {
  const dir = tempDir(t);
  const fsx = fakeFs();
  const renderer = RENDERERS.mermaid;
  const run = recordingRun();
  const result = await executeEnsure(renderer, {
    dir,
    fsx,
    run,
    ledger: recordInstall(emptyLedger(), recordedEntry(renderer)),
  });

  // A satisfied ledger entry is reset to an install plan because the files it
  // claims do not exist; the tree is rebuilt rather than trusted.
  assert.equal(result.action, 'installed');
  assert.equal(run.calls.length, 1);
  assert.equal(run.calls[0].slice(1)[0], 'install');
  assert.equal(result.entry.version, pinnedVersion(renderer));
  assert.equal(loadLedger(dir, fsx).entries[renderer.id].version, pinnedVersion(renderer));
});

test('executeEnsure reports a repair when a stale ledger entry is reinstalled', async (t) => {
  const dir = tempDir(t);
  const fsx = fakeFs();
  const renderer = RENDERERS.mermaid;
  const stale = { ...recordedEntry(renderer), version: '0.0.1' };
  const run = recordingRun();
  const result = await executeEnsure(renderer, {
    dir,
    fsx,
    run,
    ledger: recordInstall(emptyLedger(), stale),
  });

  assert.equal(result.action, 'repaired');
  assert.equal(run.calls.length, 1);
  assert.equal(result.entry.version, pinnedVersion(renderer));
  assert.equal(loadLedger(dir, fsx).entries[renderer.id].version, pinnedVersion(renderer));
});