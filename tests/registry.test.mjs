import test from 'node:test';
import assert from 'node:assert/strict';
import { RENDERERS, rendererFor, rendererIds } from '../scripts/lib/registry.mjs';

test('every renderer is internally consistent', () => {
  for (const id of rendererIds()) {
    const r = RENDERERS[id];
    assert.equal(r.id, id);
    assert.ok(['npm', 'jar', 'wasm'].includes(r.kind), `${id} has unknown kind ${r.kind}`);
    if (r.kind === 'npm') assert.ok(r.packages.length > 0, `${id} npm renderer has no packages`);
    if (r.kind === 'jar') assert.match(r.url, /^https:\/\//, `${id} jar has no pinned url`);
    if (r.kind === 'wasm') assert.ok(r.packages.length > 0, `${id} wasm renderer has no packages`);
    assert.ok(r.formats.svg, `${id} must be able to produce SVG`);
  }
});

test('versions are pinned exactly, no ranges', () => {
  for (const r of rendererIds().map((id) => RENDERERS[id])) {
    for (const spec of r.packages) {
      assert.match(spec, /^(@[^/]+\/)?[^@]+@\d+\.\d+\.\d+$/, `${r.id}: ${spec} is not an exact pin`);
      assert.doesNotMatch(spec, /[\^~*]/, `${r.id}: ${spec} is a range`);
    }
    if (r.url) assert.doesNotMatch(r.url, /latest/, `${r.id} url must not use latest`);
  }
});

test('lookup is case-insensitive and understands aliases', () => {
  assert.equal(rendererFor('Mermaid').id, 'mermaid');
  assert.equal(rendererFor('mmd').id, 'mermaid');
  assert.equal(rendererFor('graphviz-dot').id, 'graphviz');
  assert.equal(rendererFor('structurizr-dsl').id, 'structurizr');
  assert.equal(rendererFor('nope'), null);
});

test('plantuml and structurizr are the java renderers', () => {
  assert.equal(RENDERERS.plantuml.requiresJava, true);
  assert.equal(RENDERERS.structurizr.requiresJava, true);
  assert.equal(RENDERERS.mermaid.requiresJava, false);
});

test('drawio is the only renderer that unpacks nothing but needs a rebuild', () => {
  assert.deepEqual(RENDERERS.drawio.needsRebuild, true);
  assert.equal(RENDERERS.structurizr.unpack.dir, 'bin/structurizr');
});
