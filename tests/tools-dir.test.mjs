import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  assertToolsDirSafe,
  chooseToolsDir,
  findProjectRoot,
  isWritableDir,
  resolveToolsDir,
  toolsPath,
  ToolsDirError,
  workspaceToolsDir,
} from '../skills/software-diagrams/scripts/lib/tools-dir.mjs';

const HOME = path.join(path.sep, 'home', 'u');

test('an explicit override wins and resolves to an absolute path', () => {
  const fromEnv = resolveToolsDir({ SOFTWARE_DIAGRAMS_TOOLS: path.join('some', 'dir') }, HOME);
  assert.equal(fromEnv.source, 'env');
  assert.equal(fromEnv.explicit, true);
  assert.ok(path.isAbsolute(fromEnv.dir));
});

test('blank or whitespace-only override is ignored', () => {
  for (const value of ['', '   ']) {
    const resolved = resolveToolsDir({ SOFTWARE_DIAGRAMS_TOOLS: value }, HOME);
    assert.equal(resolved.source, 'cache');
    assert.equal(resolved.dir, path.join(HOME, '.cache', 'software-diagrams', 'tools'));
  }
});

test('the default is the user cache directory', () => {
  assert.equal(resolveToolsDir({}, HOME).dir, path.join(HOME, '.cache', 'software-diagrams', 'tools'));
});

test('directories that a host garbage-collects or owns are refused', () => {
  const denied = [
    path.join(HOME, '.claude', 'plugins', 'cache', 'mp', 'p', '0.1.0', 'tools'),
    path.join(HOME, '.codex', 'plugins', 'cache', 'mp', 'tools'),
    path.join('repo', 'node_modules', 'tools'),
    path.join('repo', 'skills', 'software-diagrams', 'scripts', 'tools'),
  ];
  for (const dir of denied) {
    assert.throws(() => assertToolsDirSafe(dir), ToolsDirError, dir);
  }
  assert.throws(() => assertToolsDirSafe(path.join('repo', 'Node_Modules', 'x')), ToolsDirError);
});

test('normal cache, workspace, and temp locations are allowed', () => {
  assert.doesNotThrow(() => assertToolsDirSafe(path.join(HOME, '.cache', 'software-diagrams', 'tools')));
  assert.doesNotThrow(() => assertToolsDirSafe(path.join('repo', '.dsh', 'tools')));
  assert.doesNotThrow(() => assertToolsDirSafe(path.join('tmp', 'software-diagrams-tools')));
});

test('findProjectRoot walks up to the nearest .git', () => {
  // Real paths are resolved (on Windows this prepends the drive), so build the
  // fixture resolved too; the fake fs then sees the same absolute form.
  const root = path.resolve(path.join(path.sep, 'work', 'repo'));
  const fsx = { existsSync: (p) => p === path.join(root, '.git') };
  assert.equal(findProjectRoot(path.join(root, 'docs', 'diagrams'), fsx), root);
  assert.equal(findProjectRoot(root, fsx), root);
  const nowhere = path.resolve(path.join(path.sep, 'work', 'plain'));
  assert.equal(findProjectRoot(nowhere, { existsSync: () => false }), nowhere);
});

test('toolsPath joins onto the tools directory', () => {
  assert.equal(toolsPath(path.join('a', 'b'), 'bin', 'x.jar'), path.join('a', 'b', 'bin', 'x.jar'));
});

test('a relative workspace fallback stays inside the project', () => {
  assert.equal(workspaceToolsDir('repo'), path.join('repo', '.dsh', 'tools'));
});

// A fake filesystem whose writability is decided by an explicit set of prefixes.
function fakeFs(writablePrefixes) {
  const files = new Set();
  const writable = (p) => writablePrefixes.some((prefix) => String(p).startsWith(prefix));
  return {
    files,
    existsSync: (p) => files.has(p),
    mkdirSync: (p) => {
      if (!writable(p)) throw new Error('EPERM');
    },
    writeFileSync: (p) => {
      if (!writable(p)) throw new Error('EPERM');
      files.add(p);
    },
    unlinkSync: (p) => files.delete(p),
  };
}

test('chooseToolsDir reports why it picked a directory', () => {
  const cache = path.join(HOME, '.cache', 'software-diagrams', 'tools');
  const fsx = fakeFs([cache]);
  const chosen = chooseToolsDir({ env: {}, homedir: HOME, projectRoot: 'repo', fsx, tmpdir: path.join(path.sep, 'tmp') });
  assert.equal(chosen.dir, cache);
  assert.equal(chosen.source, 'cache');
  assert.equal(chosen.fallback, false);
});

test('an unwritable home falls back to the workspace with a reason', () => {
  const projectRoot = path.join(path.sep, 'work', 'repo');
  const workspace = workspaceToolsDir(projectRoot);
  const fsx = fakeFs([workspace]);
  const chosen = chooseToolsDir({ env: {}, homedir: HOME, projectRoot, fsx, tmpdir: path.join(path.sep, 'tmp') });
  assert.equal(chosen.dir, workspace);
  assert.equal(chosen.source, 'workspace');
  assert.equal(chosen.fallback, true);
  assert.equal(chosen.preferred, path.join(HOME, '.cache', 'software-diagrams', 'tools'));
});

test('an unwritable home and workspace fall back to temp', () => {
  const temp = path.join(path.sep, 'tmp');
  const fsx = fakeFs([temp]);
  const chosen = chooseToolsDir({ env: {}, homedir: HOME, projectRoot: 'repo', fsx, tmpdir: temp });
  assert.equal(chosen.dir, path.join(temp, 'software-diagrams-tools'));
  assert.equal(chosen.source, 'temp');
});

test('no writable candidate raises a remedy, not a crash', () => {
  const fsx = fakeFs([]);
  assert.throws(
    () => chooseToolsDir({ env: {}, homedir: HOME, projectRoot: 'repo', fsx, tmpdir: path.join(path.sep, 'tmp') }),
    /Set SOFTWARE_DIAGRAMS_TOOLS/,
  );
});

test('isWritableDir probes by writing and cleaning up', () => {
  const dir = path.join(path.sep, 'w');
  const fsx = fakeFs([dir]);
  assert.equal(isWritableDir(dir, fsx), true);
  assert.equal(fsx.files.size, 0, 'the probe file must not be left behind');
  assert.equal(isWritableDir(path.join(path.sep, 'ro'), fsx), false);
});