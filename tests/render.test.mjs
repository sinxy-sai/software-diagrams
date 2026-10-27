import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { RENDERERS } from '../skills/software-diagrams/scripts/lib/registry.mjs';
import {
  executeRender,
  outputPathFor,
  resolveBinary,
  supportedFormats,
} from '../skills/software-diagrams/scripts/lib/render.mjs';

const DIR = path.resolve(path.join(path.sep, 'tools'));
const WORK = path.resolve(path.join(path.sep, 'work', 'diagrams'));

// Every fake path is compared with forward slashes so the same fixture works on
// Windows and POSIX. The implementation itself normalizes the same way in the
// ledger and probe modules.
function norm(file) {
  return String(file).split('\\').join('/');
}

// A small in-memory filesystem: enough surface for executeRender and nothing it
// is not supposed to touch. `dirs` records mkdirSync targets, `renames` records
// moves, `removed` records rmSync targets.
function makeFs(initial = {}) {
  const files = new Map();
  const dirs = [];
  const renames = [];
  const removed = [];
  for (const [file, content] of Object.entries(initial)) files.set(norm(file), String(content));
  return {
    files,
    dirs,
    renames,
    removed,
    existsSync: (file) => files.has(norm(file)),
    readFileSync: (file) => {
      const key = norm(file);
      if (!files.has(key)) throw new Error(`ENOENT: ${file}`);
      return files.get(key);
    },
    writeFileSync: (file, content) => {
      files.set(norm(file), String(content));
    },
    mkdirSync: (dir) => {
      dirs.push(norm(dir));
    },
    renameSync: (from, to) => {
      const source = norm(from);
      const target = norm(to);
      if (!files.has(source)) throw new Error(`ENOENT: ${from}`);
      files.set(target, files.get(source));
      files.delete(source);
      renames.push([source, target]);
    },
    rmSync: (dir) => {
      removed.push(norm(dir));
      const key = norm(dir);
      for (const file of [...files.keys()]) {
        if (file === key || file.startsWith(`${key}/`)) files.delete(file);
      }
    },
    readdirSync: (dir) => {
      const key = norm(dir);
      return [...files.keys()]
        .filter((file) => file.startsWith(`${key}/`) && !file.slice(key.length + 1).includes('/'))
        .map((file) => file.slice(key.length + 1));
    },
  };
}

// A run collaborator that fails the test if executeRender ever tries to spawn a
// child process: the WASM renderers must work entirely in-process.
function noSpawn() {
  throw new Error('executeRender must not spawn a child process for this renderer');
}

function graphvizLoader(calls) {
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

// Simulate PlantUML: java -jar writes <outDir>/<stem>.<format> and returns 0.
function plantumlRun(calls, fsx, { write = true } = {}) {
  return (command, args) => {
    calls.push({ command, args });
    if (write) {
      const outDir = args[args.indexOf('-o') + 1];
      const format = args[2].replace(/^-t/, '');
      const source = args[args.length - 1];
      fsx.writeFileSync(path.join(outDir, `${path.parse(source).name}.${format}`), '<svg id="plantuml"/>');
    }
    return { status: 0 };
  };
}

test('outputPathFor defaults beside the source and honours an explicit output', () => {
  const source = path.join(WORK, 'context.dot');
  assert.equal(outputPathFor(source, 'svg'), path.join(WORK, 'context.svg'));
  assert.equal(outputPathFor(source, 'png'), path.join(WORK, 'context.png'));
  assert.equal(outputPathFor(source, 'svg', path.join('build', 'deep', 'name.svg')), path.resolve('build', 'deep', 'name.svg'));
  // An explicit path is used verbatim even when its extension matches no format.
  assert.equal(outputPathFor(source, 'svg', path.join('build', 'name.out')), path.resolve('build', 'name.out'));
});

test('supportedFormats lists only the formats a renderer advertises', () => {
  assert.deepEqual(supportedFormats(RENDERERS.graphviz), ['svg']);
  assert.deepEqual(supportedFormats(RENDERERS.structurizr), ['svg']);
  assert.deepEqual(supportedFormats(RENDERERS.mermaid), ['svg', 'png']);
  assert.deepEqual(supportedFormats({ formats: { svg: true, png: false, webp: true } }), ['svg', 'webp']);
  assert.deepEqual(supportedFormats({ formats: {} }), []);
});

test('an unsupported format is rejected with the renderer and a remedy', async () => {
  await assert.rejects(
    executeRender(RENDERERS.graphviz, {
      dir: DIR,
      source: path.join(WORK, 'context.dot'),
      format: 'png',
      fsx: makeFs(),
      run: noSpawn,
    }),
    /Graphviz \(WASM\) cannot render PNG; it supports svg\. Use the SVG output and rasterize it separately if a bitmap is required\./,
  );
  await assert.rejects(
    executeRender(RENDERERS.structurizr, {
      dir: DIR,
      source: path.join(WORK, 'workspace.dsl'),
      format: 'png',
      fsx: makeFs(),
      run: noSpawn,
    }),
    /Structurizr CLI cannot render PNG; it supports svg\./,
  );
  // A renderer with more than one format points at --format instead.
  await assert.rejects(
    executeRender({ id: 'fake', label: 'Fake renderer', formats: { svg: true, png: true } }, {
      dir: DIR,
      source: path.join(WORK, 'context.svg'),
      format: 'jpg',
      fsx: makeFs(),
      run: noSpawn,
    }),
    /Fake renderer cannot render JPG; it supports svg, png\. Pass --format with one of the supported values\./,
  );
});

test('resolveBinary prefers a platform shim on win32 and the bare path elsewhere', () => {
  const binary = path.join(DIR, 'node_modules', '.bin', 'mmdc');
  const only = (file) => ({ existsSync: (candidate) => candidate === file });
  assert.equal(resolveBinary(RENDERERS.mermaid, DIR, only(`${binary}.cmd`), 'win32'), `${binary}.cmd`);
  assert.equal(resolveBinary(RENDERERS.mermaid, DIR, only(`${binary}.exe`), 'win32'), `${binary}.exe`);
  assert.equal(resolveBinary(RENDERERS.mermaid, DIR, only(binary), 'win32'), binary);
  assert.equal(resolveBinary(RENDERERS.mermaid, DIR, { existsSync: () => true }, 'win32'), `${binary}.cmd`);
  assert.equal(resolveBinary(RENDERERS.mermaid, DIR, only(binary), 'linux'), binary);
  assert.equal(resolveBinary(RENDERERS.mermaid, DIR, only(`${binary}.cmd`), 'linux'), null);
  assert.equal(resolveBinary(RENDERERS.mermaid, DIR, only(path.join(DIR, 'unrelated')), 'win32'), null);
});

test('graphviz renders SVG through the WASM loader with the dot engine and no nop', async () => {
  const source = path.join(WORK, 'context.dot');
  const fsx = makeFs({ [source]: 'digraph { a -> b; }' });
  const calls = [];
  const result = await executeRender(RENDERERS.graphviz, {
    dir: DIR,
    source,
    fsx,
    run: noSpawn,
    load: graphvizLoader(calls),
  });
  const target = path.join(WORK, 'context.svg');
  assert.deepEqual(result, { outputs: [target], engine: 'dot', nop: null });
  assert.deepEqual(calls[0], { dir: DIR, name: '@hpcc-js/wasm-graphviz' });
  assert.deepEqual(calls[1], { source: 'digraph { a -> b; }', format: 'svg', engine: 'dot', options: undefined });
  assert.equal(fsx.files.get(norm(target)), '<svg id="graphviz"/>');
});

test('graphviz fidelity mode asks for neato with nop 1', async () => {
  const source = path.join(WORK, 'fixed.dot');
  const content = 'digraph { a [pos="10,20!"]; }';
  const fsx = makeFs({ [source]: content });
  const calls = [];
  const result = await executeRender(RENDERERS.graphviz, {
    dir: DIR,
    source,
    fsx,
    run: noSpawn,
    load: graphvizLoader(calls),
    engine: 'neato',
    nop: 1,
  });
  assert.equal(result.engine, 'neato');
  assert.equal(result.nop, 1);
  assert.deepEqual(calls[1], { source: content, format: 'svg', engine: 'neato', options: { nop: 1 } });

  // The nop layout engines imply fixed positions even without an explicit flag.
  const impliedCalls = [];
  const implied = await executeRender(RENDERERS.graphviz, {
    dir: DIR,
    source,
    fsx,
    run: noSpawn,
    load: graphvizLoader(impliedCalls),
    engine: 'nop',
  });
  assert.equal(implied.engine, 'nop');
  assert.equal(implied.nop, 1);
  assert.deepEqual(impliedCalls[1].options, { nop: 1 });
});

test('graphviz writes to an explicit output and creates its directory', async () => {
  const source = path.join(WORK, 'context.dot');
  const output = path.join(WORK, 'build', 'deep', 'custom.svg');
  const fsx = makeFs({ [source]: 'digraph {}' });
  const result = await executeRender(RENDERERS.graphviz, {
    dir: DIR,
    source,
    output,
    fsx,
    run: noSpawn,
    load: graphvizLoader([]),
  });
  assert.deepEqual(result.outputs, [output]);
  assert.ok(fsx.dirs.includes(norm(path.dirname(output))));
  assert.equal(fsx.files.get(norm(output)), '<svg id="graphviz"/>');
});

test('d2 compiles and renders through the WASM loader in-process', async () => {
  const source = path.join(WORK, 'checkout.d2');
  const fsx = makeFs({ [source]: 'a -> b' });
  const calls = [];
  class D2 {
    async compile(text) {
      calls.push({ step: 'compile', text });
      return { diagram: { name: 'checkout' }, renderOptions: { layout: 'elk', pad: 10 } };
    }
    async render(diagram, options) {
      calls.push({ step: 'render', diagram, options });
      return '<svg id="d2"/>';
    }
  }
  const load = async (dir, name) => {
    calls.push({ step: 'load', dir, name });
    return { D2 };
  };
  const result = await executeRender(RENDERERS.d2, { dir: DIR, source, fsx, run: noSpawn, load });
  const target = path.join(WORK, 'checkout.svg');
  assert.deepEqual(result, { outputs: [target], engine: 'd2', nop: null });
  assert.deepEqual(calls, [
    { step: 'load', dir: DIR, name: '@terrastruct/d2' },
    { step: 'compile', text: 'a -> b' },
    { step: 'render', diagram: { name: 'checkout' }, options: { layout: 'elk', pad: 10 } },
  ]);
  assert.equal(fsx.files.get(norm(target)), '<svg id="d2"/>');
});

test('mermaid spawns mmdc and adds a transparent background for png', async () => {
  const source = path.join(WORK, 'sequence.mmd');
  const binary = path.join(DIR, 'node_modules', '.bin', 'mmdc');
  const cases = [
    { format: 'svg', extra: [], name: 'sequence.svg' },
    { format: 'png', extra: ['-b', 'transparent'], name: 'sequence.png' },
  ];
  for (const item of cases) {
    const fsx = makeFs({ [source]: 'sequenceDiagram\n  A->>B: hi', [binary]: '' });
    const calls = [];
    const run = (command, args) => {
      calls.push({ command, args });
      return { status: 0 };
    };
    const result = await executeRender(RENDERERS.mermaid, {
      dir: DIR,
      source,
      format: item.format,
      fsx,
      run,
      platform: 'linux',
    });
    const target = path.join(WORK, item.name);
    assert.deepEqual(result, { outputs: [target], engine: 'mermaid', nop: null });
    assert.deepEqual(calls, [{ command: binary, args: ['-i', source, '-o', target, ...item.extra] }]);
    assert.ok(fsx.dirs.includes(norm(WORK)));
  }
});

test('draw.io spawns the headless binary and passes --format png when asked', async () => {
  const source = path.join(WORK, 'architecture.drawio');
  const binary = path.join(DIR, 'node_modules', '.bin', 'drawio-headless');
  const cases = [
    { format: 'svg', middle: [], name: 'architecture.svg' },
    { format: 'png', middle: ['--format', 'png'], name: 'architecture.png' },
  ];
  for (const item of cases) {
    const fsx = makeFs({ [source]: '<mxfile/>', [binary]: '' });
    const calls = [];
    const run = (command, args) => {
      calls.push({ command, args });
      return { status: 0 };
    };
    const result = await executeRender(RENDERERS.drawio, {
      dir: DIR,
      source,
      format: item.format,
      fsx,
      run,
      platform: 'linux',
    });
    const target = path.join(WORK, item.name);
    assert.deepEqual(result, { outputs: [target], engine: 'drawio', nop: null });
    assert.deepEqual(calls, [{ command: binary, args: ['render', ...item.middle, source, target] }]);
  }
});

test('a missing npm binary is reported with the renderer it belongs to', async () => {
  const source = path.join(WORK, 'sequence.mmd');
  const fsx = makeFs({ [source]: 'graph TD' });
  await assert.rejects(
    executeRender(RENDERERS.mermaid, { dir: DIR, source, fsx, run: noSpawn, platform: 'linux' }),
    /mermaid is installed but node_modules\/\.bin\/mmdc is missing; run ensure mermaid again/,
  );
  const drawioSource = path.join(WORK, 'architecture.drawio');
  const drawioFs = makeFs({ [drawioSource]: '<mxfile/>' });
  await assert.rejects(
    executeRender(RENDERERS.drawio, { dir: DIR, source: drawioSource, fsx: drawioFs, run: noSpawn, platform: 'linux' }),
    /drawio is installed but node_modules\/\.bin\/drawio-headless is missing; run ensure drawio again/,
  );
});

test('a failed external renderer surfaces its status and error code', async () => {
  const source = path.join(WORK, 'sequence.mmd');
  const binary = path.join(DIR, 'node_modules', '.bin', 'mmdc');
  const fsx = makeFs({ [source]: 'graph TD', [binary]: '' });
  const run = () => ({ status: 1, error: 'EPERM' });
  await assert.rejects(
    executeRender(RENDERERS.mermaid, { dir: DIR, source, fsx, run, platform: 'linux' }),
    /Mermaid failed for .* \(EPERM\)/,
  );

  const drawioSource = path.join(WORK, 'architecture.drawio');
  const drawioBinary = path.join(DIR, 'node_modules', '.bin', 'drawio-headless');
  const drawioFs = makeFs({ [drawioSource]: '<mxfile/>', [drawioBinary]: '' });
  await assert.rejects(
    executeRender(RENDERERS.drawio, {
      dir: DIR,
      source: drawioSource,
      fsx: drawioFs,
      run: () => ({ status: 2, error: 'ENOENT' }),
      platform: 'linux',
    }),
    /draw\.io failed for .* \(ENOENT\)/,
  );
});

test('plantuml runs java -jar in the output directory for svg and png', async () => {
  const source = path.join(WORK, 'class.puml');
  const jar = path.join(DIR, 'bin', 'plantuml.jar');
  const cases = [
    { format: 'svg', name: 'class.svg' },
    { format: 'png', name: 'class.png' },
  ];
  for (const item of cases) {
    const fsx = makeFs({ [source]: '@startuml\n@enduml\n', [jar]: 'jar bytes' });
    const calls = [];
    const result = await executeRender(RENDERERS.plantuml, {
      dir: DIR,
      source,
      format: item.format,
      fsx,
      run: plantumlRun(calls, fsx),
    });
    const target = path.join(WORK, item.name);
    assert.deepEqual(result, { outputs: [target], engine: 'plantuml', nop: null });
    assert.deepEqual(calls, [{ command: 'java', args: ['-jar', jar, `-t${item.format}`, '-o', WORK, source] }]);
    assert.equal(fsx.files.get(norm(target)), '<svg id="plantuml"/>');
    assert.deepEqual(fsx.renames, []);
  }
});

test('plantuml moves the produced file to an explicit output path', async () => {
  const source = path.join(WORK, 'class.puml');
  const jar = path.join(DIR, 'bin', 'plantuml.jar');
  const fsx = makeFs({ [source]: '@startuml\n@enduml\n', [jar]: 'jar bytes' });
  const calls = [];
  const output = path.join(WORK, 'exports', 'custom.svg');
  const result = await executeRender(RENDERERS.plantuml, {
    dir: DIR,
    source,
    output,
    fsx,
    run: plantumlRun(calls, fsx),
  });
  const produced = path.join(WORK, 'exports', 'class.svg');
  assert.deepEqual(result, { outputs: [output], engine: 'plantuml', nop: null });
  assert.deepEqual(calls[0].args, ['-jar', jar, '-tsvg', '-o', path.dirname(output), source]);
  assert.deepEqual(fsx.renames, [[norm(produced), norm(output)]]);
  assert.equal(fsx.files.get(norm(output)), '<svg id="plantuml"/>');
  assert.equal(fsx.files.has(norm(produced)), false);
});

test('plantuml reports a missing jar, a failed run, and a silent success', async () => {
  const source = path.join(WORK, 'class.puml');
  await assert.rejects(
    executeRender(RENDERERS.plantuml, {
      dir: DIR,
      source,
      fsx: makeFs({ [source]: '@startuml\n@enduml\n' }),
      run: noSpawn,
    }),
    /PlantUML is not installed; run ensure plantuml/,
  );

  const jar = path.join(DIR, 'bin', 'plantuml.jar');
  await assert.rejects(
    executeRender(RENDERERS.plantuml, {
      dir: DIR,
      source,
      fsx: makeFs({ [source]: '@startuml\n@enduml\n', [jar]: 'jar bytes' }),
      run: () => ({ status: 1, error: 'EPERM' }),
    }),
    /PlantUML failed for .* \(EPERM\)/,
  );

  const fsx = makeFs({ [source]: '@startuml\n@enduml\n', [jar]: 'jar bytes' });
  await assert.rejects(
    executeRender(RENDERERS.plantuml, {
      dir: DIR,
      source,
      output: path.join(WORK, 'renamed.svg'),
      fsx,
      run: plantumlRun([], fsx, { write: false }),
    }),
    /PlantUML reported success but wrote no svg for/,
  );
});

test('structurizr validates before exporting and renders every exported view', async () => {
  const source = path.join(WORK, 'workspace.dsl');
  const unpackDir = path.join(DIR, RENDERERS.structurizr.unpack.dir);
  const structurizrJar = path.join(unpackDir, 'lib', 'structurizr-cli.jar');
  const plantumlJar = path.join(DIR, 'bin', 'plantuml.jar');
  const fsx = makeFs({
    [source]: 'workspace {}',
    [structurizrJar]: 'jar bytes',
    [plantumlJar]: 'jar bytes',
  });
  const calls = [];
  const run = (command, args) => {
    calls.push({ command, args });
    if (args.includes('validate')) return { status: 0 };
    if (args.includes('export')) {
      const exported = args[args.indexOf('-o') + 1];
      // Deliberately unsorted: the renderer must order the views.
      fsx.writeFileSync(path.join(exported, 'context.puml'), '@startuml\n@enduml\n');
      fsx.writeFileSync(path.join(exported, 'containers.puml'), '@startuml\n@enduml\n');
      return { status: 0 };
    }
    const outDir = args[args.indexOf('-o') + 1];
    const sourceFile = args[args.length - 1];
    fsx.writeFileSync(
      path.join(outDir, `${path.parse(sourceFile).name}.svg`),
      '<svg id="plantuml"/>',
    );
    return { status: 0 };
  };

  const result = await executeRender(RENDERERS.structurizr, { dir: DIR, source, fsx, run, platform: 'linux' });
  const exported = path.join(WORK, '.structurizr-export');
  const classpath = `${unpackDir}:${path.join(unpackDir, 'lib', '*')}`;
  assert.deepEqual(result, {
    outputs: [path.join(WORK, 'containers.svg'), path.join(WORK, 'context.svg')],
    engine: 'structurizr',
    nop: null,
    views: ['containers.puml', 'context.puml'],
  });
  assert.deepEqual(calls, [
    { command: 'java', args: ['-cp', classpath, RENDERERS.structurizr.mainClass, 'validate', '-w', source] },
    {
      command: 'java',
      args: ['-cp', classpath, RENDERERS.structurizr.mainClass, 'export', '-w', source, '-f', 'plantuml', '-o', exported],
    },
    {
      command: 'java',
      args: ['-jar', plantumlJar, '-tsvg', '-o', WORK, path.join(exported, 'containers.puml')],
    },
    {
      command: 'java',
      args: ['-jar', plantumlJar, '-tsvg', '-o', WORK, path.join(exported, 'context.puml')],
    },
  ]);
  assert.ok(fsx.removed.includes(norm(exported)), 'the temporary export directory is removed');
  assert.equal(fsx.files.has(norm(path.join(exported, 'context.puml'))), false);
});

test('structurizr stops when validation or installation fails', async () => {
  const source = path.join(WORK, 'workspace.dsl');
  const unpackDir = path.join(DIR, RENDERERS.structurizr.unpack.dir);
  const structurizrJar = path.join(unpackDir, 'lib', 'structurizr-cli.jar');

  await assert.rejects(
    executeRender(RENDERERS.structurizr, { dir: DIR, source, fsx: makeFs({ [source]: 'workspace {}' }), run: noSpawn }),
    /Structurizr is not installed; run ensure structurizr/,
  );

  const fsx = makeFs({ [source]: 'workspace {}', [structurizrJar]: 'jar bytes' });
  const calls = [];
  const run = (command, args) => {
    calls.push({ command, args });
    return { status: 1, error: 'BUILD FAILED' };
  };
  await assert.rejects(
    executeRender(RENDERERS.structurizr, { dir: DIR, source, fsx, run, platform: 'linux' }),
    /Structurizr validation failed for .* \(BUILD FAILED\)/,
  );
  assert.equal(calls.length, 1, 'validation failure must stop before export');
});

test('an unknown renderer id has no render implementation', async () => {
  await assert.rejects(
    executeRender({ id: 'warp', label: 'Warp', formats: { svg: true } }, {
      dir: DIR,
      source: path.join(WORK, 'context.warp'),
      fsx: makeFs(),
      run: noSpawn,
    }),
    /no render implementation for warp/,
  );
});