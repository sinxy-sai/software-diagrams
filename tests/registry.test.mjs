import test from 'node:test';
import assert from 'node:assert/strict';
import { RENDERERS, rendererFor, rendererIds, rendererForExtension, pinnedVersion } from '../skills/software-diagrams/scripts/lib/registry.mjs';

test('every renderer declares a complete, pinned contract', () => {
  for (const id of rendererIds()) {
    const renderer = RENDERERS[id];
    assert.equal(renderer.id, id, `${id}: id must match its key`);
    assert.ok(['npm', 'jar'].includes(renderer.kind), `${id}: kind`);
    assert.ok(['wasm', 'node', 'jar'].includes(renderer.runtime), `${id}: runtime`);
    assert.ok(renderer.extensions.length > 0, `${id}: extensions`);
    assert.equal(typeof renderer.probe, 'object', `${id}: probe is mandatory`);
    for (const spec of renderer.packages ?? []) {
      assert.match(spec, /@\d+\.\d+\.\d+$/, `${id}: package must be pinned exactly: ${spec}`);
      assert.doesNotMatch(spec, /[\^~]/, `${id}: package must not carry a range: ${spec}`);
    }
    assert.match(pinnedVersion(renderer), /^\d+(\.\d+)+$/, `${id}: pinned version must parse`);
  }
});

test('jar renderers pin an https url, a checksum, and a download path', () => {
  for (const renderer of Object.values(RENDERERS).filter((r) => r.kind === 'jar')) {
    assert.match(renderer.url, /^https:\/\//, `${renderer.id}: https url`);
    assert.match(renderer.sha256, /^[0-9a-f]{64}$/, `${renderer.id}: sha256`);
    assert.ok(renderer.download, `${renderer.id}: download path`);
    assert.ok(renderer.requiresJava, `${renderer.id}: jar renderers need java`);
  }
  assert.ok(RENDERERS.plantuml.url.includes(RENDERERS.plantuml.version));
  assert.ok(RENDERERS.structurizr.url.includes(RENDERERS.structurizr.version));
});

test('version is derived in exactly one place', () => {
  assert.equal(pinnedVersion(RENDERERS.d2), '0.1.33');
  assert.equal(pinnedVersion(RENDERERS.mermaid), '12.0.0');
  assert.equal(pinnedVersion(RENDERERS.plantuml), '1.2026.8');
  assert.throws(() => pinnedVersion({ id: 'x', kind: 'npm', packages: ['left-pad'] }), /not pinned/);
});

test('only native renderers advertise PNG', () => {
  const png = Object.values(RENDERERS).filter((r) => r.formats.png).map((r) => r.id).sort();
  assert.deepEqual(png, ['drawio', 'mermaid', 'plantuml']);
  const svg = Object.values(RENDERERS).filter((r) => r.formats.svg).map((r) => r.id).sort();
  assert.deepEqual(svg, ['d2', 'drawio', 'graphviz', 'mermaid', 'plantuml', 'structurizr']);
});

test('lookup is case-insensitive and understands aliases', () => {
  assert.equal(rendererFor('GraphViz'), RENDERERS.graphviz);
  assert.equal(rendererFor('  dot '), RENDERERS.graphviz);
  assert.equal(rendererFor('puml'), RENDERERS.plantuml);
  assert.equal(rendererFor('c4'), RENDERERS.structurizr);
  assert.equal(rendererFor('mmd'), RENDERERS.mermaid);
  assert.equal(rendererFor('not-a-renderer'), null);
  assert.equal(rendererFor(undefined), null);
});

test('extensions map to exactly one renderer', () => {
  assert.equal(rendererForExtension('.dot'), RENDERERS.graphviz);
  assert.equal(rendererForExtension('.D2'), RENDERERS.d2);
  assert.equal(rendererForExtension('.mmd'), RENDERERS.mermaid);
  assert.equal(rendererForExtension('.drawio'), RENDERERS.drawio);
  assert.equal(rendererForExtension('.txt'), null);
});

test('structurizr is the only multi-view renderer', () => {
  const multi = Object.values(RENDERERS).filter((r) => r.multiView).map((r) => r.id);
  assert.deepEqual(multi, ['structurizr']);
});