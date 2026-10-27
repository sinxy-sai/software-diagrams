import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { toolsPath } from './tools-dir.mjs';

/**
 * Import a renderer package that was installed into the tools directory.
 *
 * A bare specifier resolves from the importing file, so the import has to
 * originate inside the tools directory. A generated loader does that and keeps
 * the ESM export condition, which `require.resolve` would bypass.
 */
export async function loadModule(dir, name) {
  const safe = name.replace(/[^a-zA-Z0-9]+/g, '_');
  const loader = toolsPath(dir, `.sd-loader-${safe}.mjs`);
  const source = `export * from ${JSON.stringify(name)};\n`;
  fs.mkdirSync(dir, { recursive: true });
  const current = fs.existsSync(loader) ? fs.readFileSync(loader, 'utf8') : null;
  if (current !== source) fs.writeFileSync(loader, source, 'utf8');
  return import(pathToFileURL(loader).href);
}

/** Locate a renderer's executable in `<tools>/node_modules/.bin`. */
export function resolveBinary(renderer, dir, fsx, platform = process.platform) {
  const base = toolsPath(dir, renderer.binary).split('\\').join(path.sep);
  const candidates = platform === 'win32' ? [`${base}.cmd`, `${base}.exe`, base] : [base];
  return candidates.find((candidate) => fsx.existsSync(candidate)) ?? null;
}

export function supportedFormats(renderer) {
  return Object.entries(renderer.formats)
    .filter(([, supported]) => supported)
    .map(([format]) => format);
}

/** The output path for a source when the caller did not name one. */
export function outputPathFor(source, format, output) {
  if (output) return path.resolve(output);
  const parsed = path.parse(path.resolve(source));
  return path.join(parsed.dir, `${parsed.name}.${format}`);
}

function requireFormat(renderer, format) {
  const supported = supportedFormats(renderer);
  if (supported.includes(format)) return;
  throw new Error(
    `${renderer.label} cannot render ${format.toUpperCase()}; it supports ${supported.join(', ')}. ` +
      (supported.length === 1
        ? 'Use the SVG output and rasterize it separately if a bitmap is required.'
        : 'Pass --format with one of the supported values.'),
  );
}

function writeSvg(fsx, output, svg) {
  fsx.mkdirSync(path.dirname(output), { recursive: true });
  fsx.writeFileSync(output, svg, 'utf8');
}

const RASTER_MODULE = '@resvg/resvg-js';

/**
 * Graphviz writes HTML-label sub/superscripts as SVG 1.1 `baseline-shift`
 * attributes. resvg does not implement that attribute, so it would flatten every
 * `h_t`, `s(i,t)` and `y_t` onto one baseline. `dy` is supported, so the shim
 * rewrites the attribute on a copy of the SVG; the rendered bitmap then matches
 * what a browser shows, and the SVG output stays untouched.
 */
function normalizeBaselineShift(svg) {
  return svg
    .replace(/\sbaseline-shift="sub"/g, ' dy="0.30em"')
    .replace(/\sbaseline-shift="super"/g, ' dy="-0.45em"');
}

/**
 * Rasterize an SVG string with the pinned resvg module.
 *
 * Graphviz and D2 only emit SVG, so a PNG request is an SVG render followed by
 * this step. resvg loads the system fonts the SVG names, which keeps the bitmap
 * consistent with the vector on every platform; it needs no browser.
 */
async function rasterizeSvg(svg, { dir, load }) {
  let mod;
  try {
    mod = await load(dir, RASTER_MODULE);
  } catch (error) {
    throw new Error(
      `PNG output needs the resvg rasterizer, which is not installed (${error.message})\n` +
        'Install it with: node <skill-dir>/scripts/sd.mjs ensure resvg',
    );
  }
  if (typeof mod.Resvg !== 'function') {
    throw new Error(`${RASTER_MODULE} does not export Resvg; run ensure resvg to repair the install`);
  }
  const image = new mod.Resvg(normalizeBaselineShift(svg), {
    fitTo: { mode: 'original' },
    font: { loadSystemFonts: true },
  });
  return Buffer.from(image.render().asPng());
}

function writePng(fsx, output, png) {
  fsx.mkdirSync(path.dirname(output), { recursive: true });
  fsx.writeFileSync(output, png);
}

/** PlantUML writes <stem>.<format> into its output directory; move it if asked. */
function renderPlantUml({ jar, source, output, format, run, fsx }) {
  const outDir = path.dirname(output);
  fsx.mkdirSync(outDir, { recursive: true });
  const result = run('java', ['-jar', jar, `-t${format}`, '-o', outDir, source]);
  if (result.status !== 0) {
    throw new Error(`PlantUML failed for ${source}${result.error ? ` (${result.error})` : ''}`);
  }
  const produced = path.join(outDir, `${path.parse(source).name}.${format}`);
  if (path.resolve(produced) !== path.resolve(output)) {
    if (!fsx.existsSync(produced)) {
      throw new Error(`PlantUML reported success but wrote no ${format} for ${source}`);
    }
    fsx.renameSync(produced, output);
  }
  return output;
}

/**
 * Render one canonical source into one or more outputs.
 *
 * `--fidelity` is the fixed-position mode: for Graphviz it means the neato
 * layout with `nop`, which honours explicit `pos` attributes instead of
 * re-laying the graph out. That is what makes a faithful redraw possible.
 */
export async function executeRender(renderer, options) {
  const {
    dir,
    source,
    output,
    format = 'svg',
    engine,
    nop,
    fsx,
    run,
    platform = process.platform,
    load = loadModule,
  } = options;

  requireFormat(renderer, format);
  const target = outputPathFor(source, format, output);

  if (renderer.id === 'graphviz') {
    const { Graphviz } = await load(dir, '@hpcc-js/wasm-graphviz');
    const graphviz = await Graphviz.load();
    const layoutEngine = engine ?? 'dot';
    const fixed = nop ?? (layoutEngine === 'nop' || layoutEngine === 'nop2' ? 1 : undefined);
    const svg = graphviz.layout(
      fsx.readFileSync(source, 'utf8'),
      'svg',
      layoutEngine,
      fixed ? { nop: typeof fixed === 'number' ? fixed : 1 } : undefined,
    );
    if (format === 'png') {
      writePng(fsx, target, await rasterizeSvg(svg, { dir, load }));
      return { outputs: [target], engine: layoutEngine, nop: fixed ?? null, rasterized: 'resvg' };
    }
    writeSvg(fsx, target, svg);
    return { outputs: [target], engine: layoutEngine, nop: fixed ?? null };
  }

  if (renderer.id === 'd2') {
    const { D2 } = await load(dir, '@terrastruct/d2');
    const d2 = new D2();
    const compiled = await d2.compile(fsx.readFileSync(source, 'utf8'));
    const svg = await d2.render(compiled.diagram, compiled.renderOptions);
    if (format === 'png') {
      writePng(fsx, target, await rasterizeSvg(svg, { dir, load }));
      return { outputs: [target], engine: 'd2', nop: null, rasterized: 'resvg' };
    }
    writeSvg(fsx, target, svg);
    return { outputs: [target], engine: 'd2', nop: null };
  }

  if (renderer.id === 'mermaid') {
    const binary = resolveBinary(renderer, dir, fsx, platform);
    if (!binary) throw new Error(`mermaid is installed but ${renderer.binary} is missing; run ensure mermaid again`);
    fsx.mkdirSync(path.dirname(target), { recursive: true });
    const args = ['-i', source, '-o', target];
    if (format === 'png') args.push('-b', 'transparent');
    const result = run(binary, args);
    if (result.status !== 0) throw new Error(`Mermaid failed for ${source}${result.error ? ` (${result.error})` : ''}`);
    return { outputs: [target], engine: 'mermaid', nop: null };
  }

  if (renderer.id === 'drawio') {
    const binary = resolveBinary(renderer, dir, fsx, platform);
    if (!binary) throw new Error(`drawio is installed but ${renderer.binary} is missing; run ensure drawio again`);
    fsx.mkdirSync(path.dirname(target), { recursive: true });
    const args = ['render'];
    if (format === 'png') args.push('--format', 'png');
    args.push(source, target);
    const result = run(binary, args);
    if (result.status !== 0) throw new Error(`draw.io failed for ${source}${result.error ? ` (${result.error})` : ''}`);
    return { outputs: [target], engine: 'drawio', nop: null };
  }

  if (renderer.id === 'plantuml') {
    const jar = toolsPath(dir, 'bin/plantuml.jar');
    if (!fsx.existsSync(jar)) throw new Error('PlantUML is not installed; run ensure plantuml');
    // PNG is a native PlantUML output, so no rasterizer is needed either way.
    const rendered = renderPlantUml({ jar, source, output: target, format, run, fsx });
    return { outputs: [rendered], engine: 'plantuml', nop: null };
  }

  if (renderer.id === 'structurizr') {
    const unpackDir = toolsPath(dir, renderer.unpack.dir);
    const jars = toolsPath(unpackDir, 'lib');
    if (!fsx.existsSync(toolsPath(jars, 'structurizr-cli.jar'))) {
      throw new Error('Structurizr is not installed; run ensure structurizr');
    }
    const classpath =
      platform === 'win32'
        ? `${unpackDir};${path.join(unpackDir, 'lib', '*')}`
        : `${unpackDir}:${path.join(unpackDir, 'lib', '*')}`;
    const cli = (args) =>
      run('java', ['-cp', classpath, renderer.mainClass, ...args]);

    const validate = cli(['validate', '-w', source]);
    if (validate.status !== 0) {
      throw new Error(`Structurizr validation failed for ${source}${validate.error ? ` (${validate.error})` : ''}`);
    }

    // One model, many views: export PlantUML, then render every view.
    const outDir = path.dirname(target);
    fsx.mkdirSync(outDir, { recursive: true });
    const exported = path.join(outDir, '.structurizr-export');
    fsx.mkdirSync(exported, { recursive: true });
    try {
      const result = cli(['export', '-w', source, '-f', 'plantuml', '-o', exported]);
      if (result.status !== 0) {
        throw new Error(`Structurizr export failed for ${source}${result.error ? ` (${result.error})` : ''}`);
      }
      const views = fsx
        .readdirSync(exported)
        .filter((name) => name.endsWith('.puml'))
        .sort();
      if (views.length === 0) throw new Error(`Structurizr produced no PlantUML views for ${source}`);
      const plantumlJar = toolsPath(dir, 'bin/plantuml.jar');
      if (!fsx.existsSync(plantumlJar)) {
        throw new Error('Structurizr exports PlantUML views; install plantuml as well: sd.mjs ensure plantuml');
      }
      const outputs = views.map((view) =>
        renderPlantUml({
          jar: plantumlJar,
          source: path.join(exported, view),
          output: path.join(outDir, `${path.parse(view).name}.${format}`),
          format,
          run,
          fsx,
        }),
      );
      return { outputs, engine: 'structurizr', nop: null, views };
    } finally {
      fsx.rmSync(exported, { recursive: true, force: true });
    }
  }

  throw new Error(`no render implementation for ${renderer.id}`);
}