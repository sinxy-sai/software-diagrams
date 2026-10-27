import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RENDERERS, pinnedVersion } from '../skills/software-diagrams/scripts/lib/registry.mjs';
import { probeRenderer } from '../skills/software-diagrams/scripts/lib/probe.mjs';
import { toolsPath } from '../skills/software-diagrams/scripts/lib/tools-dir.mjs';

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-probe-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeFile(dir, relative, content) {
  const file = toolsPath(dir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeJson(dir, relative, value) {
  writeFile(dir, relative, JSON.stringify(value));
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const NPM_RENDERER = {
  id: 'demo',
  kind: 'npm',
  runtime: 'node',
  packages: ['demo-cli@1.2.3'],
  binary: 'node_modules/.bin/demo',
  probe: { type: 'npm-package', name: 'demo-cli', version: '1.2.3' },
};
const MANIFEST = `node_modules/${NPM_RENDERER.probe.name}/package.json`;
const JAR_RENDERER = {
  id: 'demojar',
  kind: 'jar',
  runtime: 'jar',
  version: '1.2.3',
  download: 'bin/demo.jar',
  sha256: sha256('jar-bytes'),
  probe: { type: 'file', path: 'bin/demo.jar' },
};

test('a renderer that declares no probe is never ready', (t) => {
  assert.deepEqual(probeRenderer({ id: 'demo', kind: 'jar', version: '1.0.0' }, tempDir(t), fs), {
    ok: false,
    reason: 'renderer demo declares no probe',
  });
});

test('an npm package that is not installed is reported as missing', (t) => {
  assert.deepEqual(probeRenderer(NPM_RENDERER, tempDir(t), fs), {
    ok: false,
    reason: 'demo-cli is not installed',
  });
});

test('an npm package at the wrong version is not ready', (t) => {
  const dir = tempDir(t);
  writeJson(dir, MANIFEST, { name: 'demo-cli', version: '0.9.0' });
  assert.deepEqual(probeRenderer(NPM_RENDERER, dir, fs), {
    ok: false,
    reason: 'demo-cli is 0.9.0, pinned 1.2.3',
  });
});

test('an unreadable npm manifest is a broken probe, not a crash', (t) => {
  const dir = tempDir(t);
  writeFile(dir, MANIFEST, 'not json');
  const result = probeRenderer(NPM_RENDERER, dir, fs);
  assert.equal(result.ok, false);
  assert.match(result.reason, /^demo-cli\/package\.json is unreadable: /);
});

test('an installed npm package without its binary is not ready', (t) => {
  const dir = tempDir(t);
  writeJson(dir, MANIFEST, { name: 'demo-cli', version: '1.2.3' });
  assert.deepEqual(probeRenderer(NPM_RENDERER, dir, fs), {
    ok: false,
    reason: 'demo-cli is installed but node_modules/.bin/demo is missing',
  });
});

test('npm binary shims and executables satisfy the probe', (t) => {
  for (const suffix of ['.cmd', '.exe']) {
    const dir = tempDir(t);
    writeJson(dir, MANIFEST, { name: 'demo-cli', version: '1.2.3' });
    writeFile(dir, `${NPM_RENDERER.binary}${suffix}`, '');
    assert.deepEqual(probeRenderer(NPM_RENDERER, dir, fs), { ok: true, detail: 'demo-cli@1.2.3' }, suffix);
  }
});

test('an npm package with its pinned version and binary is ready', (t) => {
  const dir = tempDir(t);
  writeJson(dir, MANIFEST, { name: 'demo-cli', version: '1.2.3' });
  writeFile(dir, NPM_RENDERER.binary, 'shim');
  assert.deepEqual(probeRenderer(NPM_RENDERER, dir, fs), { ok: true, detail: 'demo-cli@1.2.3' });
});

test('a missing file renderer reports the path it expected', (t) => {
  assert.deepEqual(probeRenderer(JAR_RENDERER, tempDir(t), fs), {
    ok: false,
    reason: 'missing bin/demo.jar',
  });
});

test('a downloaded file is ready when its checksum matches the pin', (t) => {
  const dir = tempDir(t);
  writeFile(dir, JAR_RENDERER.probe.path, 'jar-bytes');
  assert.deepEqual(probeRenderer(JAR_RENDERER, dir, fs), { ok: true, detail: 'bin/demo.jar' });
});

test('a downloaded file whose checksum differs is not ready', (t) => {
  const dir = tempDir(t);
  writeFile(dir, JAR_RENDERER.probe.path, 'tampered bytes');
  assert.deepEqual(probeRenderer(JAR_RENDERER, dir, fs), {
    ok: false,
    reason: 'bin/demo.jar does not match the pinned checksum',
  });
});

test('an unpacked renderer is not re-hashed against the archive digest', (t) => {
  // The pinned sha256 describes the archive, so it cannot describe an extracted
  // file: probing that file must not compare it to the archive digest.
  const renderer = {
    ...JAR_RENDERER,
    download: 'bin/demo-cli.zip',
    probe: { type: 'file', path: 'bin/demo-cli/lib/demo.jar' },
  };
  const dir = tempDir(t);
  writeFile(dir, renderer.probe.path, 'extracted bytes that do not match the archive');
  assert.deepEqual(probeRenderer(renderer, dir, fs), { ok: true, detail: renderer.probe.path });
});

test('an unknown probe type is rejected by name', (t) => {
  const renderer = { id: 'mystery', kind: 'jar', runtime: 'jar', version: '3.4.5', probe: { type: 'magic' } };
  assert.deepEqual(probeRenderer(renderer, tempDir(t), fs), {
    ok: false,
    reason: 'unknown probe type magic (pinned 3.4.5)',
  });
});

test('registry renderers report their documented missing state', (t) => {
  const dir = tempDir(t);
  assert.deepEqual(probeRenderer(RENDERERS.mermaid, dir, fs), {
    ok: false,
    reason: '@mermaid-js/mermaid-cli is not installed',
  });
  assert.deepEqual(probeRenderer(RENDERERS.plantuml, dir, fs), {
    ok: false,
    reason: 'missing bin/plantuml.jar',
  });
  assert.deepEqual(probeRenderer(RENDERERS.structurizr, dir, fs), {
    ok: false,
    reason: `missing ${RENDERERS.structurizr.probe.path}`,
  });
});

test('a real unpacked jar renderer probes ready without its archive', (t) => {
  const dir = tempDir(t);
  const renderer = RENDERERS.structurizr;
  assert.notEqual(renderer.download, renderer.probe.path);
  writeFile(dir, renderer.probe.path, 'bytes that are not the pinned archive');
  assert.deepEqual(probeRenderer(renderer, dir, fs), { ok: true, detail: renderer.probe.path });
  assert.ok(renderer.probe.path.includes(pinnedVersion(renderer)), 'the probed path is version scoped');
});