import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../skills/software-diagrams/scripts/sd.mjs';
import { RENDERERS } from '../skills/software-diagrams/scripts/lib/registry.mjs';

// Every command is driven in-process. Child processes are always faked: the
// only process-shaped seam is `spawn`, which sd.mjs hands to makeRun.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cli-test-'));
const TOOLS = path.join(SANDBOX, 'tools');
const CWD = path.join(SANDBOX, 'workspace');
fs.mkdirSync(TOOLS, { recursive: true });
fs.mkdirSync(CWD, { recursive: true });
const JAVA_LOG = 'openjdk version "17.0.2" 2024-01-16';
after(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));

function norm(file) {
  return String(file).split('\\').join('/');
}

function collector() {
  const chunks = [];
  return {
    chunks,
    stream: {
      write: (chunk) => {
        chunks.push(String(chunk));
        return true;
      },
    },
    text: () => chunks.join(''),
  };
}

async function runCli(argv, options = {}) {
  const out = collector();
  const err = collector();
  const code = await main(argv, { stdout: out.stream, stderr: err.stream, ...options });
  return { code, out: out.text(), err: err.text() };
}

// In-memory filesystem for the fsx seam. Keys are compared with forward
// slashes, matching the normalization ledger.mjs and probe.mjs already use.
function makeFs(initial = {}) {
  const files = new Map();
  const dirs = new Set();
  const fds = new Map();
  const removed = [];
  let nextFd = 10;
  for (const [file, content] of Object.entries(initial)) files.set(norm(file), String(content));
  return {
    files,
    dirs,
    removed,
    seedDir: (dir) => {
      dirs.add(norm(dir));
    },
    writeFd: (fd, text) => {
      const key = fds.get(fd);
      if (key !== undefined) files.set(key, files.get(key) + text);
    },
    existsSync: (file) => files.has(norm(file)) || dirs.has(norm(file)),
    readFileSync: (file) => {
      const key = norm(file);
      if (!files.has(key)) throw new Error(`ENOENT: ${file}`);
      return files.get(key);
    },
    writeFileSync: (file, content) => {
      files.set(norm(file), String(content));
    },
    mkdirSync: (dir) => {
      dirs.add(norm(dir));
    },
    openSync: (file) => {
      const key = norm(file);
      files.set(key, '');
      fds.set(nextFd, key);
      return nextFd++;
    },
    closeSync: (fd) => {
      fds.delete(fd);
    },
    unlinkSync: (file) => {
      files.delete(norm(file));
    },
    renameSync: (from, to) => {
      const source = norm(from);
      const target = norm(to);
      files.set(target, files.get(source));
      files.delete(source);
    },
    statSync: (file) => {
      const key = norm(file);
      if (!files.has(key)) throw new Error(`ENOENT: ${file}`);
      return { size: files.get(key).length };
    },
    readdirSync: (dir) => {
      const key = norm(dir);
      return [...files.keys()]
        .filter((file) => file.startsWith(`${key}/`) && !file.slice(key.length + 1).includes('/'))
        .map((file) => file.slice(key.length + 1));
    },
    rmSync: (dir) => {
      const key = norm(dir);
      removed.push(key);
      for (const file of [...files.keys()]) {
        if (file === key || file.startsWith(`${key}/`)) files.delete(file);
      }
      for (const entry of [...dirs]) {
        if (entry === key || entry.startsWith(`${key}/`)) dirs.delete(entry);
      }
    },
  };
}

// A spawnSync fake that never spawns. Captured runs (java -version) write their
// output through the fake file descriptor, exactly like a real child would.
function fakeSpawn(fsx) {
  const calls = [];
  const spawn = (command, args = [], options = {}) => {
    calls.push({ command, args, options });
    if (Array.isArray(options.stdio)) {
      for (const fd of options.stdio) {
        if (typeof fd === 'number') fsx.writeFd(fd, `${JAVA_LOG}\n`);
      }
    }
    return { status: 0 };
  };
  spawn.calls = calls;
  return spawn;
}

// The same fake against the real filesystem: sd.mjs still owns the capture file
// descriptors, the test only writes plausible output into them.
function realSpawn() {
  const calls = [];
  const spawn = (command, args = [], options = {}) => {
    calls.push({ command, args, options });
    if (Array.isArray(options.stdio)) {
      for (const fd of options.stdio) {
        if (typeof fd === 'number') fs.writeSync(fd, `${JAVA_LOG}\n`);
      }
    }
    return { status: 0 };
  };
  spawn.calls = calls;
  return spawn;
}

function envFor(toolsDir = TOOLS, extra = {}) {
  return { SOFTWARE_DIAGRAMS_TOOLS: toolsDir, ...extra };
}

function graphvizLoad(calls) {
  return async (dir, name) => {
    calls.push({ dir, name });
    return {
      Graphviz: {
        load: async () => ({
          layout: (source, format, engine, options) => {
            calls.push({ source, format, engine, options });
            return '<svg id="graphviz"/>';
          },
        }),
      },
    };
  };
}

// Answers both the source renderer and the rasterizer for `--format png`.
function pngLoad(calls) {
  return async (dir, name) => {
    calls.push({ dir, name });
    if (name === '@resvg/resvg-js') {
      return { Resvg: class { render() { return { asPng: () => Buffer.from('PNG') }; } } };
    }
    return { Graphviz: { load: async () => ({ layout: () => '<svg id="graphviz"/>' }) } };
  };
}

function seedGraphvizTool(fsx, tools) {
  fsx.writeFileSync(
    path.join(tools, 'node_modules', '@hpcc-js', 'wasm-graphviz', 'package.json'),
    JSON.stringify({ version: '1.29.2' }),
  );
}

test('no command prints usage and returns 2', async () => {
  const result = await runCli([], { env: {} });
  assert.equal(result.code, 2);
  assert.match(result.out, /usage: node sd\.mjs <command>/);
  assert.match(result.out, /doctor\s+report every renderer/);
  assert.match(result.out, /Renderers: mermaid, plantuml, structurizr, d2, graphviz, drawio/);
  assert.match(result.out, /Rasterizer: resvg \(PNG output for graphviz and d2\)/);
  assert.match(result.out, /lint <file\.svg\|manifest>/);
  assert.equal(result.err, '');
});

test('help prints usage and returns 0', async () => {
  const result = await runCli(['help'], { env: {} });
  assert.equal(result.code, 0);
  assert.match(result.out, /usage: node sd\.mjs <command>/);
});

test('an unknown command reports itself and returns 2', async () => {
  const result = await runCli(['frobnicate'], { env: {} });
  assert.equal(result.code, 2);
  assert.match(result.err, /unknown command: frobnicate/);
  assert.match(result.out, /usage: node sd\.mjs <command>/);
});

test('doctor on an empty tools directory reports missing renderers and the tools dir', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-doctor-empty-'));
  const tools = path.join(sandbox, 'tools');
  fs.mkdirSync(tools);
  try {
    const spawn = realSpawn();
    const result = await runCli(['doctor'], {
      cwd: sandbox,
      env: envFor(tools),
      spawn,
      tmpdir: sandbox,
      homedir: sandbox,
    });
    assert.equal(result.code, 1);
    assert.ok(result.out.includes(`tools dir: ${tools} (from $SOFTWARE_DIAGRAMS_TOOLS)`));
    assert.match(result.out, /^java: java 17$/m);
    for (const id of ['mermaid', 'plantuml', 'structurizr', 'd2', 'graphviz', 'drawio']) {
      assert.match(result.out, new RegExp(`^${id}\\s+missing\\s`, 'm'), `${id} must be missing`);
    }
    assert.match(result.out, /^resvg\s+missing\s+PNG for graphviz and d2/m);
    assert.ok(spawn.calls.some((call) => call.command === 'java' && call.args[0] === '-version'));
    assert.equal(result.err, '');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('doctor reports ready when the on-disk probe matches the registry pin', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-doctor-ready-'));
  const tools = path.join(sandbox, 'tools');
  const packageDir = path.join(tools, 'node_modules', '@mermaid-js', 'mermaid-cli');
  const binDir = path.join(tools, 'node_modules', '.bin');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ version: '12.0.0' }));
  fs.writeFileSync(path.join(binDir, 'mmdc.cmd'), '');
  try {
    const result = await runCli(['doctor'], {
      cwd: sandbox,
      env: envFor(tools),
      spawn: realSpawn(),
      tmpdir: sandbox,
      homedir: sandbox,
    });
    // Only Mermaid is installed, so the overall verdict is still not ready.
    assert.equal(result.code, 1);
    assert.match(result.out, /^mermaid\s+ready\s+@mermaid-js\/mermaid-cli@12\.0\.0$/m);
    assert.match(result.out, /^d2\s+missing\s/m);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('render cannot infer a renderer from an unknown extension', async () => {
  const fsx = makeFs();
  fsx.writeFileSync(path.join(CWD, 'notes.txt'), 'no diagram here');
  const result = await runCli(['render', 'notes.txt'], {
    cwd: CWD,
    env: envFor(),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
  });
  assert.equal(result.code, 2);
  assert.match(result.err, /cannot infer a renderer from \.txt; pass --renderer with one of: mermaid, plantuml/);
  assert.equal(result.out, '');
});

test('render on a missing source returns 1', async () => {
  const fsx = makeFs();
  const result = await runCli(['render', 'missing.dot'], {
    cwd: CWD,
    env: envFor(),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
  });
  assert.equal(result.code, 1);
  assert.match(result.err, /source does not exist: missing\.dot/);
});

test('render refuses PNG when the resvg rasterizer is missing', async () => {
  const fsx = makeFs();
  const tools = path.join(SANDBOX, 'fake-tools-png-missing');
  seedGraphvizTool(fsx, tools);
  fsx.writeFileSync(path.join(CWD, 'diagrams', 'architecture.dot'), 'digraph {}');
  const result = await runCli(['render', path.join('diagrams', 'architecture.dot'), '--format', 'png'], {
    cwd: CWD,
    env: envFor(tools),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
  });
  assert.equal(result.code, 1);
  assert.match(result.err, /graphviz can only emit PNG through the resvg rasterizer, which is not usable/);
  assert.match(result.err, /ensure resvg/);
  assert.equal(result.out, '');
});

test('render --format png reports the rasterizer it used', async () => {
  const fsx = makeFs();
  const tools = path.join(SANDBOX, 'fake-tools-png');
  seedGraphvizTool(fsx, tools);
  fsx.writeFileSync(
    path.join(tools, 'node_modules', '@resvg', 'resvg-js', 'package.json'),
    JSON.stringify({ version: '2.6.2' }),
  );
  fsx.writeFileSync(path.join(CWD, 'diagrams', 'architecture.dot'), 'digraph { a -> b; }');
  const calls = [];
  const result = await runCli(['render', path.join('diagrams', 'architecture.dot'), '--format', 'png'], {
    cwd: CWD,
    env: envFor(tools),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
    load: pngLoad(calls),
  });
  assert.equal(result.code, 0, result.err);
  assert.equal(fsx.files.get(norm(path.join(CWD, 'diagrams', 'architecture.png'))), 'PNG');
  assert.match(result.out, /^rendered diagrams[\\/]architecture\.png \(\d+ B\)$/m);
  assert.match(result.out, /^rasterizer: resvg 2\.6\.2$/m);
  assert.ok(calls.some((call) => call.name === '@resvg/resvg-js'));
});

test('render writes SVG for graphviz through the injected loader', async () => {
  const fsx = makeFs();
  const tools = path.join(SANDBOX, 'fake-tools');
  fsx.writeFileSync(
    path.join(tools, 'node_modules', '@hpcc-js', 'wasm-graphviz', 'package.json'),
    JSON.stringify({ version: '1.29.2' }),
  );
  fsx.writeFileSync(path.join(CWD, 'diagrams', 'architecture.dot'), 'digraph { a -> b; }');
  const calls = [];
  const result = await runCli(['render', path.join('diagrams', 'architecture.dot')], {
    cwd: CWD,
    env: envFor(tools),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
    load: graphvizLoad(calls),
  });
  const output = path.join(CWD, 'diagrams', 'architecture.svg');
  assert.equal(result.code, 0);
  assert.equal(fsx.files.get(norm(output)), '<svg id="graphviz"/>');
  assert.match(result.out, /^rendered diagrams[\\/]architecture\.svg \(\d+ B\)$/m);
  assert.match(result.out, /^mode: engine dot$/m);
  assert.match(result.out, /^renderer: graphviz 1\.29\.2$/m);
  assert.deepEqual(calls[0], { dir: tools, name: '@hpcc-js/wasm-graphviz' });
  assert.equal(calls[1].engine, 'dot');
  assert.equal(calls[1].options, undefined);
  assert.equal(result.err, '');
});

test('render --fidelity asks graphviz for neato with nop', async () => {
  const fsx = makeFs();
  const tools = path.join(SANDBOX, 'fake-tools-fidelity');
  fsx.writeFileSync(
    path.join(tools, 'node_modules', '@hpcc-js', 'wasm-graphviz', 'package.json'),
    JSON.stringify({ version: '1.29.2' }),
  );
  fsx.writeFileSync(path.join(CWD, 'diagrams', 'fixed.dot'), 'digraph { a [pos="0,0!"]; }');
  const calls = [];
  const result = await runCli(['render', path.join('diagrams', 'fixed.dot'), '--fidelity'], {
    cwd: CWD,
    env: envFor(tools),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
    load: graphvizLoad(calls),
  });
  assert.equal(result.code, 0);
  assert.match(result.out, /^mode: engine neato, nop 1 \(explicit positions preserved\)$/m);
  assert.deepEqual(calls[1], {
    source: 'digraph { a [pos="0,0!"]; }',
    format: 'svg',
    engine: 'neato',
    options: { nop: 1 },
  });
});

function seedValidManifestProject(fsx) {
  fsx.seedDir(path.join(CWD, '.git'));
  const manifest = {
    profile: 'tracked-source',
    diagrams: [
      {
        id: 'context',
        purpose: 'explain the system context',
        source: 'docs/diagrams/sources/context.dot',
        renderer: 'graphviz',
        outputs: ['docs/diagrams/rendered/context.svg'],
        documents: ['docs/README.md'],
        publication: 'both',
      },
    ],
  };
  fsx.writeFileSync(
    path.join(CWD, 'docs', 'diagram-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  fsx.writeFileSync(path.join(CWD, 'docs', 'diagrams', 'sources', 'context.dot'), 'digraph {}');
  fsx.writeFileSync(path.join(CWD, 'docs', 'diagrams', 'rendered', 'context.svg'), '<svg/>');
  fsx.writeFileSync(
    path.join(CWD, 'docs', 'README.md'),
    '# Docs\n\n![context](diagrams/rendered/context.svg)\n',
  );
}

test('validate accepts a sound manifest and names the root it used', async () => {
  const fsx = makeFs();
  seedValidManifestProject(fsx);
  const result = await runCli(['validate', path.join('docs', 'diagram-manifest.json')], {
    cwd: CWD,
    env: envFor(),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
  });
  assert.equal(result.code, 0);
  assert.ok(result.out.includes(`validated 1 diagram(s) against root ${CWD}`));
  assert.equal(result.err, '');
});

test('validate returns 1 when the manifest file is missing', async () => {
  const fsx = makeFs();
  const result = await runCli(['validate', 'missing.json'], {
    cwd: CWD,
    env: envFor(),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
  });
  assert.equal(result.code, 1);
  assert.match(result.err, /manifest does not exist: missing\.json/);
});

test('validate returns 1 for invalid JSON', async () => {
  const fsx = makeFs();
  fsx.writeFileSync(path.join(CWD, 'docs', 'diagram-manifest.json'), '{ "profile": ');
  const result = await runCli(['validate', path.join('docs', 'diagram-manifest.json')], {
    cwd: CWD,
    env: envFor(),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
  });
  assert.equal(result.code, 1);
  assert.match(result.err, /invalid JSON in docs[\\/]diagram-manifest\.json/);
});

test('reset refuses without confirmation and deletes with --yes', async () => {
  const refusedFs = makeFs();
  refusedFs.seedDir(TOOLS);
  const refused = await runCli(['reset'], {
    cwd: CWD,
    env: envFor(),
    fsx: refusedFs,
    spawn: fakeSpawn(refusedFs),
    tmpdir: SANDBOX,
  });
  assert.equal(refused.code, 1);
  assert.match(refused.err, /refusing to delete .* without confirmation/);
  assert.match(refused.err, /Re-run with --yes to delete it/);
  assert.equal(refusedFs.existsSync(TOOLS), true);

  const deletedFs = makeFs();
  deletedFs.seedDir(TOOLS);
  const deleted = await runCli(['reset', '--yes'], {
    cwd: CWD,
    env: envFor(),
    fsx: deletedFs,
    spawn: fakeSpawn(deletedFs),
    tmpdir: SANDBOX,
  });
  assert.equal(deleted.code, 0);
  assert.ok(deleted.out.includes(`deleted ${TOOLS}`));
  assert.equal(deletedFs.existsSync(TOOLS), false);
});

test('reset accepts SOFTWARE_DIAGRAMS_RESET_CONFIRM as confirmation', async () => {
  const fsx = makeFs();
  fsx.seedDir(TOOLS);
  const result = await runCli(['reset'], {
    cwd: CWD,
    env: envFor(TOOLS, { SOFTWARE_DIAGRAMS_RESET_CONFIRM: '1' }),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
  });
  assert.equal(result.code, 0);
  assert.ok(result.out.includes(`deleted ${TOOLS}`));
  assert.equal(fsx.existsSync(TOOLS), false);
});

test('lint reports a clean render and exits 0', async () => {
  const fsx = makeFs();
  fsx.writeFileSync(
    path.join(CWD, 'render.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text x="20" y="60" font-size="14" fill="#111">ok</text></svg>',
  );
  const result = await runCli(['lint', 'render.svg'], {
    cwd: CWD,
    env: envFor(),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
  });
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /^linted 1 file\(s\): 0 error\(s\), 0 warning\(s\)$/m);
  assert.equal(result.err, '');
});

test('lint warns on tiny type and --strict turns the warning into a failure', async () => {
  const fsx = makeFs();
  fsx.writeFileSync(
    path.join(CWD, 'tiny.svg'),
    '<svg viewBox="0 0 200 100"><text x="20" y="60" font-size="4" fill="#111">tiny</text></svg>',
  );
  const options = { cwd: CWD, env: envFor(), fsx, spawn: fakeSpawn(fsx), tmpdir: SANDBOX };
  const relaxed = await runCli(['lint', 'tiny.svg'], options);
  assert.equal(relaxed.code, 0, relaxed.err);
  assert.match(relaxed.err, /^warning: tiny\.svg: .*has font-size 4 below the 6-unit minimum$/m);
  assert.match(relaxed.out, /0 error\(s\), 1 warning\(s\)/);

  const strict = await runCli(['lint', 'tiny.svg', '--strict'], options);
  assert.equal(strict.code, 1);
});

test('lint reports cropped output as an error', async () => {
  const fsx = makeFs();
  fsx.writeFileSync(
    path.join(CWD, 'cropped.svg'),
    '<svg viewBox="0 0 100 100"><text x="10" y="50" font-size="12" fill="#111">a very long line of text that runs past the right edge</text></svg>',
  );
  const result = await runCli(['lint', 'cropped.svg'], {
    cwd: CWD,
    env: envFor(),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
  });
  assert.equal(result.code, 1);
  assert.match(result.err, /^error: cropped\.svg: .*past the right edge of the viewBox$/m);
});

test('lint rejects a missing file and an unsupported extension', async () => {
  const fsx = makeFs();
  fsx.writeFileSync(path.join(CWD, 'notes.txt'), 'no diagram');
  const missing = await runCli(['lint', 'missing.svg'], {
    cwd: CWD,
    env: envFor(),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
  });
  assert.equal(missing.code, 1);
  assert.match(missing.err, /file does not exist: missing\.svg/);

  const unsupported = await runCli(['lint', 'notes.txt'], {
    cwd: CWD,
    env: envFor(),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
  });
  assert.equal(unsupported.code, 2);
  assert.match(unsupported.err, /lint reads \.svg files and diagram manifests, not \.txt/);
});

test('lint accepts a manifest and lints every SVG output it lists', async () => {
  const fsx = makeFs();
  seedValidManifestProject(fsx);
  fsx.writeFileSync(
    path.join(CWD, 'docs', 'diagrams', 'rendered', 'context.svg'),
    '<svg viewBox="0 0 100 100"><text x="10" y="40" font-size="12" fill="#111">context</text></svg>',
  );
  const result = await runCli(['lint', path.join('docs', 'diagram-manifest.json')], {
    cwd: CWD,
    env: envFor(),
    fsx,
    spawn: fakeSpawn(fsx),
    tmpdir: SANDBOX,
  });
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /^linted 1 file\(s\): 0 error\(s\), 0 warning\(s\)$/m);
});

test('render writes every structurizr view into a named output directory', async () => {
  const fsx = makeFs();
  const tools = path.join(SANDBOX, 'fake-tools-structurizr');
  fsx.writeFileSync(path.join(tools, RENDERERS.structurizr.probe.path), 'structurizr jar');
  fsx.writeFileSync(path.join(tools, 'bin', 'plantuml.jar'), 'plantuml jar');
  fsx.writeFileSync(path.join(CWD, 'model', 'shop.dsl'), 'workspace {}');

  // Java never runs: validate succeeds, the export step drops two views, and
  // each PlantUML run writes the file named after the view it was handed.
  const spawn = (command, args = []) => {
    if (command !== 'java') return { status: 0 };
    if (args[0] === '-cp' && args.includes('export')) {
      const dir = args[args.indexOf('-o') + 1];
      fsx.writeFileSync(path.join(dir, 'containers.puml'), '@startuml');
      fsx.writeFileSync(path.join(dir, 'containers-key.puml'), '@startuml');
    } else if (args[0] === '-jar') {
      const source = args[args.length - 1];
      const dir = args[args.indexOf('-o') + 1];
      const format = args.find((flag) => flag.startsWith('-t')).slice(2);
      fsx.writeFileSync(path.join(dir, `${path.parse(source).name}.${format}`), '<svg/>');
    }
    return { status: 0 };
  };

  const result = await runCli(['render', path.join('model', 'shop.dsl'), '-o', 'rendered/'], {
    cwd: CWD,
    env: envFor(tools),
    fsx,
    spawn,
    tmpdir: SANDBOX,
  });
  assert.equal(result.code, 0, result.err);
  assert.equal(fsx.existsSync(path.join(CWD, 'rendered', 'containers.svg')), true);
  assert.equal(fsx.existsSync(path.join(CWD, 'rendered', 'containers-key.svg')), true);
  assert.equal(
    fsx.existsSync(path.join(CWD, 'rendered', 'shop.svg')),
    false,
    'a multi-view source names a directory; the -o file stem is not a view',
  );
  assert.match(result.out, /^rendered rendered[\\/]containers(?:-key)?\.svg \(\d+ B\)$/m);
  assert.match(result.out, /^renderer: structurizr 2025\.11\.09$/m);
  assert.equal(result.err, '');
});
