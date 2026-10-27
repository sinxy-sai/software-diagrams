import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  ALLOWED_PROFILES,
  validateManifest,
} from '../skills/software-diagrams/scripts/lib/manifest.mjs';

const ROOT = path.resolve(path.join(path.sep, 'repo'));

// The manifest validator is pure: filesystem facts arrive through `exists` and
// `readFile`. This fake maps absolute paths to contents; no disk is touched.
function makeIo({ files = [], documents = {} } = {}) {
  const map = new Map();
  for (const file of files) map.set(path.resolve(ROOT, file), '');
  for (const [document, text] of Object.entries(documents)) map.set(path.resolve(ROOT, document), text);
  return {
    exists: (file) => map.has(file),
    readFile: (file) => {
      if (!map.has(file)) throw new Error(`unexpected read: ${file}`);
      return map.get(file);
    },
  };
}

function diagram(overrides = {}) {
  return {
    id: 'context',
    purpose: 'explain the system context',
    source: 'diagrams/sources/context.dot',
    renderer: 'graphviz',
    outputs: ['diagrams/rendered/context.svg'],
    documents: ['README.md'],
    publication: 'both',
    ...overrides,
  };
}

function manifest(overrides = {}) {
  return { profile: 'tracked-source', diagrams: [diagram()], ...overrides };
}

// The project README references the rendered output, so the happy path has no
// warning about an unreferenced output either.
function validIo() {
  return makeIo({
    files: ['diagrams/sources/context.dot', 'diagrams/rendered/context.svg'],
    documents: { 'README.md': '# Context\n\n![context](diagrams/rendered/context.svg)\n' },
  });
}

function validate(value, io = validIo()) {
  return validateManifest(value, { root: ROOT, ...io });
}

test('a valid manifest validates without errors or warnings', () => {
  assert.deepEqual(validate(manifest()), { errors: [], warnings: [] });
});

test('the declared profiles are the three publication policies', () => {
  assert.deepEqual(ALLOWED_PROFILES, [
    'tracked-source',
    'local-source/published-artifacts',
    'local-only-preview',
  ]);
});

test('an unknown profile is an error', () => {
  const result = validate(manifest({ profile: 'rogue' }));
  assert.deepEqual(result.errors, [`profile must be one of ${ALLOWED_PROFILES.join(', ')}`]);
  assert.deepEqual(result.warnings, []);
});

test('diagrams must be a non-empty array', () => {
  for (const diagrams of [[], undefined, null, {}]) {
    const result = validate({ profile: 'tracked-source', diagrams });
    assert.deepEqual(result.errors, ['diagrams must be a non-empty array']);
    assert.deepEqual(result.warnings, []);
  }
});

test('a non-object manifest is rejected before anything else', () => {
  for (const value of [null, undefined, [], 'manifest', 7]) {
    const result = validateManifest(value, { root: ROOT, exists: () => false, readFile: () => '' });
    assert.deepEqual(result.errors, ['manifest must be a JSON object']);
    assert.deepEqual(result.warnings, []);
  }
});

test('a non-object diagram entry is reported and skipped', () => {
  const result = validate(manifest({ diagrams: [null] }));
  assert.deepEqual(result.errors, ['each diagram entry must be an object']);
  assert.deepEqual(result.warnings, []);
});

test('missing required diagram fields are reported by name', () => {
  const entry = diagram();
  delete entry.purpose;
  delete entry.documents;
  const result = validate(manifest({ diagrams: [entry] }));
  assert.deepEqual(result.errors, ['context is missing purpose', 'context is missing documents']);
  assert.deepEqual(result.warnings, []);
});

test('a diagram without an id is labeled <unknown>', () => {
  const entry = diagram();
  delete entry.id;
  const result = validate(manifest({ diagrams: [entry] }));
  assert.deepEqual(result.errors, ['<unknown> is missing id']);
});

test('malformed field values are reported with the diagram id', () => {
  const entry = diagram({ purpose: '', outputs: ['ok.svg', 7], documents: 'README.md' });
  const result = validate(manifest({ diagrams: [entry] }));
  assert.deepEqual(result.errors, [
    'context: purpose must be a non-empty string',
    'context: outputs must be a non-empty array of strings',
    'context: documents must be an array of strings',
  ]);
});

test('an empty-string diagram id is rejected', () => {
  const result = validate(manifest({ diagrams: [diagram({ id: '' })] }));
  assert.deepEqual(result.errors, ['diagram id must be a non-empty string']);
});

test('duplicate diagram ids are rejected', () => {
  const first = diagram({ id: 'ctx', documents: [], publication: 'source' });
  const second = diagram({
    id: 'ctx',
    source: 'diagrams/sources/second.dot',
    outputs: ['diagrams/rendered/second.svg'],
    documents: [],
    publication: 'source',
  });
  const io = makeIo({
    files: [
      'diagrams/sources/context.dot',
      'diagrams/sources/second.dot',
      'diagrams/rendered/context.svg',
      'diagrams/rendered/second.svg',
    ],
  });
  const result = validate(manifest({ diagrams: [first, second] }), io);
  assert.deepEqual(result.errors, ['duplicate diagram id: ctx']);
  assert.deepEqual(result.warnings, []);
});

test('an earlier error containing this id as a substring does not skip its checks', () => {
  // Regression: the validator used to skip the rest of a diagram's checks when
  // ANY earlier error happened to contain its id, so one bad neighbour silently
  // hid a duplicate id.
  const first = diagram({ id: 'ctx1', renderer: 'warp', documents: [], publication: 'source' });
  const second = diagram({ id: 'ctx', documents: [], publication: 'source' });
  const third = diagram({
    id: 'ctx',
    source: 'diagrams/sources/third.dot',
    outputs: ['diagrams/rendered/third.svg'],
    documents: [],
    publication: 'source',
  });
  const io = makeIo({
    files: [
      'diagrams/sources/context.dot',
      'diagrams/sources/third.dot',
      'diagrams/rendered/context.svg',
      'diagrams/rendered/third.svg',
    ],
  });
  const result = validate(manifest({ diagrams: [first, second, third] }), io);
  assert.ok(result.errors.includes('ctx1: unknown renderer "warp"'), result.errors.join('; '));
  assert.ok(result.errors.includes('duplicate diagram id: ctx'), result.errors.join('; '));
});

test('one source may not be reused by two diagrams', () => {
  const first = diagram({ id: 'a', outputs: ['rendered-a/context.svg'], documents: [], publication: 'source' });
  const second = diagram({ id: 'b', outputs: ['rendered-b/context.svg'], documents: [], publication: 'source' });
  const io = makeIo({
    files: [
      'diagrams/sources/context.dot',
      'rendered-a/context.svg',
      'rendered-b/context.svg',
    ],
  });
  const result = validate(manifest({ diagrams: [first, second] }), io);
  assert.deepEqual(result.errors, ['source is reused by multiple diagrams: diagrams/sources/context.dot']);
  assert.deepEqual(result.warnings, []);
});

test('a source outside the project root is rejected', () => {
  const result = validate(
    manifest({
      diagrams: [diagram({ source: '../outside.dot', outputs: ['diagrams/rendered/outside.svg'], documents: [], publication: 'source' })],
    }),
    makeIo({ files: ['diagrams/rendered/outside.svg'] }),
  );
  assert.deepEqual(result.errors, ['context: source escapes the project root: ../outside.dot']);
  assert.deepEqual(result.warnings, []);
});

test('a source that does not exist is rejected', () => {
  const result = validate(
    manifest({
      diagrams: [diagram({ source: 'diagrams/sources/missing.dot', outputs: ['diagrams/rendered/missing.svg'], documents: [], publication: 'source' })],
    }),
    makeIo({ files: ['diagrams/rendered/missing.svg'] }),
  );
  assert.deepEqual(result.errors, ['context: source is missing: diagrams/sources/missing.dot']);
  assert.deepEqual(result.warnings, []);
});

test('an unknown renderer is rejected', () => {
  const result = validate(
    manifest({ diagrams: [diagram({ renderer: 'warp', documents: [], publication: 'source' })] }),
    makeIo({ files: ['diagrams/sources/context.dot', 'diagrams/rendered/context.svg'] }),
  );
  assert.deepEqual(result.errors, ['context: unknown renderer "warp"']);
  assert.deepEqual(result.warnings, []);
});

test('a source extension outside the renderer set only warns', () => {
  const result = validate(
    manifest({
      diagrams: [diagram({ source: 'diagrams/sources/context.mmd', documents: [], publication: 'source' })],
    }),
    makeIo({ files: ['diagrams/sources/context.mmd', 'diagrams/rendered/context.svg'] }),
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, [
    'context: source extension .mmd is not one of .dot, .gv for graphviz',
  ]);
});

test('publication must agree with the profile', () => {
  const allowed = {
    'tracked-source': ['source', 'output', 'both'],
    'local-source/published-artifacts': ['output'],
    'local-only-preview': ['local'],
  };
  for (const profile of ALLOWED_PROFILES) {
    for (const publication of ['source', 'output', 'both', 'local']) {
      const result = validate(
        manifest({ profile, diagrams: [diagram({ publication, documents: [] })] }),
        validIo(),
      );
      if (allowed[profile].includes(publication)) {
        assert.deepEqual(result.errors, [], `${profile} + ${publication} must be compatible`);
      } else {
        assert.deepEqual(
          result.errors,
          [`context: publication ${publication} is incompatible with profile ${profile}`],
          `${profile} + ${publication} must be incompatible`,
        );
      }
      assert.deepEqual(result.warnings, []);
    }
  }
});

test('an unknown publication value is rejected', () => {
  const result = validate(
    manifest({ diagrams: [diagram({ publication: 'public', documents: [] })] }),
    validIo(),
  );
  assert.deepEqual(result.errors, ['context: publication must be source, output, both, or local']);
  assert.deepEqual(result.warnings, []);
});

test('a rendered output that does not exist is rejected', () => {
  const result = validate(
    manifest({ diagrams: [diagram({ documents: [], publication: 'source' })] }),
    makeIo({ files: ['diagrams/sources/context.dot'] }),
  );
  assert.deepEqual(result.errors, ['context: rendered output is missing: diagrams/rendered/context.svg']);
  assert.deepEqual(result.warnings, []);
});

test('differing source and output basenames warn', () => {
  const result = validate(
    manifest({
      diagrams: [diagram({ outputs: ['diagrams/rendered/other.svg'], documents: [], publication: 'source' })],
    }),
    makeIo({ files: ['diagrams/sources/context.dot', 'diagrams/rendered/other.svg'] }),
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, ['context: source/output basenames differ: context -> other']);
});

test('a multi-view renderer may name its outputs after views, not the source', () => {
  const result = validate(
    manifest({
      diagrams: [
        diagram({
          renderer: 'structurizr',
          source: 'diagrams/sources/context.dsl',
          outputs: ['diagrams/rendered/other.svg'],
          documents: [],
          publication: 'source',
        }),
      ],
    }),
    makeIo({ files: ['diagrams/sources/context.dsl', 'diagrams/rendered/other.svg'] }),
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('a missing document is rejected', () => {
  const result = validate(
    manifest({ diagrams: [diagram({ documents: ['docs/missing.md'], publication: 'source' })] }),
    makeIo({ files: ['diagrams/sources/context.dot', 'diagrams/rendered/context.svg'] }),
  );
  assert.deepEqual(result.errors, ['context: document is missing: docs/missing.md']);
  assert.deepEqual(result.warnings, []);
});

test('a document outside the project root is rejected', () => {
  const result = validate(
    manifest({ diagrams: [diagram({ documents: ['../notes.md'], publication: 'source' })] }),
    makeIo({ files: ['diagrams/sources/context.dot', 'diagrams/rendered/context.svg'] }),
  );
  assert.deepEqual(result.errors, ['context: document escapes the project root: ../notes.md']);
  assert.deepEqual(result.warnings, []);
});

test('links from a document must resolve, and anchors are ignored when resolving', () => {
  const io = makeIo({
    files: ['diagrams/sources/context.dot', 'diagrams/rendered/context.svg'],
    documents: {
      'docs/README.md': [
        '# Context',
        '',
        '- [source](../diagrams/sources/context.dot)',
        '- ![rendered](../diagrams/rendered/context.svg)',
        '- [anchored](../diagrams/rendered/context.svg#layers)',
        '- [gone](../diagrams/rendered/missing.svg)',
      ].join('\n'),
    },
  });
  const result = validate(manifest({ diagrams: [diagram({ documents: ['docs/README.md'] })] }), io);
  assert.deepEqual(result.errors, ['docs/README.md: link target is missing: ../diagrams/rendered/missing.svg']);
  assert.deepEqual(result.warnings, []);
});

test('remote document links are skipped', () => {
  const io = makeIo({
    files: ['diagrams/sources/context.dot', 'diagrams/rendered/context.svg'],
    documents: {
      'docs/README.md': [
        '# Context',
        '',
        '- [site](https://example.com/architecture)',
        '- [mail](mailto:team@example.com)',
        '- [data](data:text/plain;base64,AA==)',
        '- [anchor](#overview)',
      ].join('\n'),
    },
  });
  const result = validate(
    manifest({ diagrams: [diagram({ documents: ['docs/README.md'], publication: 'source' })] }),
    io,
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('a declared output that its documents do not reference warns', () => {
  const io = makeIo({
    files: ['diagrams/sources/context.dot', 'diagrams/rendered/context.svg'],
    documents: { 'docs/README.md': '# Context\n\nNo diagram here yet.\n' },
  });
  const result = validate(manifest({ diagrams: [diagram({ documents: ['docs/README.md'] })] }), io);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, [
    'context: output is not referenced by its declared documents: diagrams/rendered/context.svg',
  ]);
});