#!/usr/bin/env node
// sd.mjs — the single CLI entry for the software-diagrams skill.
//
//   doctor                 what is really usable, and where renderers live
//   ensure <id>|--all      install pinned renderers into the tools directory
//   render <source> ...    render one canonical source to SVG (or PNG)
//   lint <svg|manifest>    report visual defects in rendered output
//   validate <manifest>    check a diagram manifest's structure and links
//   reset [--yes]          delete the tools directory
//
// Every IO collaborator is injectable, so the commands run and are tested
// in-process without spawning a child, a browser, or Java.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  RENDERERS,
  RASTERIZER,
  rendererFor,
  rendererIds,
  rendererForExtension,
  installableFor,
  installableIds,
  pinnedVersion,
} from './lib/registry.mjs';
import {
  chooseToolsDir,
  findProjectRoot,
  ToolsDirError,
  TOOLS_DIR_ENV,
} from './lib/tools-dir.mjs';
import { isSatisfied, loadLedger } from './lib/ledger.mjs';
import { probeRenderer } from './lib/probe.mjs';
import { executeEnsure } from './lib/ensure.mjs';
import { executeRender, outputPathFor, supportedFormats } from './lib/render.mjs';
import { validateManifest } from './lib/manifest.mjs';
import { lintSvg } from './lib/lint.mjs';
import { checkJava, makeRun } from './lib/run.mjs';

const USAGE = `usage: node sd.mjs <command>

  doctor                     report every renderer: ready | stale | missing | broken | blocked
  ensure <renderer>...|--all install pinned renderer(s) into the tools directory
  render <source> [options]  render one source file
      -o, --output <path>      output path (default: beside the source)
      --format <svg|png>       output format (default: svg)
      --engine <name>          layout engine for Graphviz (default: dot)
      --nop [1|2]              keep explicit positions (Graphviz neato mode)
      --fidelity               shorthand for --engine neato --nop
      --renderer <id>          override renderer detection
  lint <file.svg|manifest>... visual lint of rendered output
      --strict                 exit non-zero on warnings as well as errors
      --json                   print findings as JSON
  validate <manifest>        validate a diagram manifest and its links
      --root <dir>             project root (default: the git root above the manifest)
  reset [--yes]              delete the tools directory

Renderers: ${rendererIds().join(', ')}
Rasterizer: resvg (PNG output for graphviz and d2)
Tools directory: $${TOOLS_DIR_ENV}, else ~/.cache/software-diagrams/tools, else a
writable workspace or temp directory.`;

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${bytes} B`;
}

function takeFlag(argv, names) {
  for (const name of names) {
    const index = argv.indexOf(name);
    if (index >= 0) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('-')) return { found: true, value: undefined };
      argv.splice(index, 2);
      return { found: true, value };
    }
  }
  return { found: false, value: undefined };
}

function takeBool(argv, names) {
  for (const name of names) {
    const index = argv.indexOf(name);
    if (index >= 0) {
      argv.splice(index, 1);
      return true;
    }
  }
  return false;
}

export async function main(argv = [], options = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    platform = process.platform,
    fsx = fs,
    stdout = process.stdout,
    stderr = process.stderr,
    spawn = spawnSync,
    fetchImpl = globalThis.fetch,
    homedir = os.homedir(),
    tmpdir = os.tmpdir(),
    load = undefined,
  } = options;

  const log = (line = '') => stdout.write(`${line}\n`);
  const logErr = (line = '') => stderr.write(`${line}\n`);
  const run = makeRun({ platform, spawnSync: spawn, fsx, tmpDir: tmpdir });

  const resolveActiveDir = () => {
    const projectRoot = findProjectRoot(cwd, fsx);
    const chosen = chooseToolsDir({ env, homedir, projectRoot, fsx, tmpdir });
    return { ...chosen, projectRoot };
  };

  async function fetchBuffer(url) {
    const maxBytes = 256 * 1024 * 1024;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow' });
      if (!response.ok) throw new Error(`download failed: HTTP ${response.status} for ${url}`);
      const declared = Number(response.headers?.get?.('content-length') ?? 0);
      if (declared > maxBytes) throw new Error(`refusing to download ${formatBytes(declared)} from ${url}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxBytes) throw new Error(`refusing to download ${formatBytes(buffer.length)} from ${url}`);
      return buffer;
    } finally {
      clearTimeout(timer);
    }
  }

  function printDir(chosen) {
    const from = chosen.source === 'env' ? `$${TOOLS_DIR_ENV}` : `${chosen.source} directory`;
    log(`tools dir: ${chosen.dir} (from ${from})`);
    if (chosen.fallback) {
      log(`  note: ${chosen.preferred} is not writable here; using a workspace/temp fallback.`);
    }
  }

  function doctor() {
    let chosen;
    try {
      chosen = resolveActiveDir();
    } catch (error) {
      if (error instanceof ToolsDirError) {
        logErr(error.message);
        return 1;
      }
      throw error;
    }
    printDir(chosen);
    const ledger = loadLedger(chosen.dir, fsx);
    const java = checkJava(run);
    log(`java: ${java.ok ? java.detail : `unavailable (${java.detail})`}\n`);

    let allReady = true;
    for (const id of rendererIds()) {
      const renderer = RENDERERS[id];
      const entry = ledger.entries[id];
      const probe = probeRenderer(renderer, chosen.dir, fsx);
      const satisfied = isSatisfied(entry, renderer);
      let status;
      let detail;
      if (renderer.requiresJava && !java.ok) {
        status = 'blocked';
        detail = probe.ok ? java.detail : `${java.detail}; ${probe.reason}`;
      } else if (probe.ok) {
        status = entry && !satisfied.ok ? 'stale' : 'ready';
        detail = entry && !satisfied.ok ? `${probe.detail} (${satisfied.reason})` : probe.detail;
      } else if (entry) {
        status = 'broken';
        detail = probe.reason;
      } else {
        status = 'missing';
        detail =
          renderer.kind === 'jar'
            ? `downloads ${renderer.url.replace(/^https:\/\/github\.com\//, 'github.com/')}`
            : `npm install ${renderer.packages.join(' ')}`;
      }
      if (status !== 'ready') allReady = false;
      log(`${id.padEnd(11)} ${status.padEnd(9)} ${detail}`);
    }
    // The rasterizer is advisory: it is only needed for PNG output from the two
    // SVG-only renderers, so it never flips doctor's overall verdict.
    const raster = probeRenderer(RASTERIZER, chosen.dir, fsx);
    log(
      `${RASTERIZER.id.padEnd(11)} ${(raster.ok ? 'ready' : 'missing').padEnd(9)} ${
        raster.ok ? raster.detail : `PNG for graphviz and d2; install with ensure ${RASTERIZER.id}`
      }`,
    );
    log('\ninstall one:  sd.mjs ensure <renderer>');
    log('install all:  sd.mjs ensure --all');
    return allReady ? 0 : 1;
  }

  async function ensure(argv) {
    let chosen;
    try {
      chosen = resolveActiveDir();
    } catch (error) {
      if (error instanceof ToolsDirError) {
        logErr(error.message);
        return 1;
      }
      throw error;
    }
    printDir(chosen);
    const java = checkJava(run);

    const targets = [];
    if (argv.includes('--all')) {
      for (const id of installableIds()) targets.push(id === RASTERIZER.id ? RASTERIZER : RENDERERS[id]);
    } else {
      for (const name of argv) {
        const renderer = installableFor(name);
        if (!renderer) {
          logErr(`unknown renderer: ${name}\nknown renderers: ${installableIds().join(', ')}`);
          return 2;
        }
        targets.push(renderer);
      }
    }
    if (targets.length === 0) {
      logErr('usage: sd.mjs ensure <renderer> [<renderer> ...] | --all');
      return 2;
    }

    let failed = 0;
    for (const renderer of targets) {
      if (renderer.requiresJava && !java.ok) {
        logErr(`${renderer.id}: blocked — ${java.detail}`);
        failed += 1;
        continue;
      }
      try {
        const candidate = probeRenderer(renderer, chosen.dir, fsx);
        // Re-read per renderer: each install rewrites the ledger, so a stale
        // in-memory copy would silently drop the previous renderer's entry.
        const ledger = loadLedger(chosen.dir, fsx);
        const result = await executeEnsure(renderer, {
          dir: chosen.dir,
          fsx,
          run,
          fetchBuffer,
          ledger,
        });
        if (result.action === 'noop') {
          const detail = candidate.ok ? candidate.detail : probeRenderer(renderer, chosen.dir, fsx).detail;
          log(`${renderer.id.padEnd(11)} ready     ${detail ?? 'installed'}`);
        } else {
          const note = result.entry.artifacts.map((artifact) => artifact.path).join(', ');
          log(`${renderer.id.padEnd(11)} ${result.action.padEnd(9)} ${note}`);
        }
      } catch (error) {
        failed += 1;
        logErr(
          `${renderer.id.padEnd(11)} FAILED    ${error.message}\n` +
            `  If ${chosen.dir} is not writable, set ${TOOLS_DIR_ENV} to a writable directory.`,
        );
      }
    }
    return failed ? 1 : 0;
  }

  async function render(argv) {
    const outputFlag = takeFlag(argv, ['-o', '--output']);
    const formatFlag = takeFlag(argv, ['--format']);
    const engineFlag = takeFlag(argv, ['--engine']);
    const rendererFlag = takeFlag(argv, ['--renderer']);
    const fidelity = takeBool(argv, ['--fidelity']);
    const nopFlag = takeFlag(argv, ['--nop']);

    const source = argv[0];
    if (!source) {
      logErr('usage: sd.mjs render <source> [-o <output>] [--format svg|png]');
      return 2;
    }
    const absoluteSource = path.resolve(cwd, source);
    if (!fsx.existsSync(absoluteSource)) {
      logErr(`source does not exist: ${source}`);
      return 1;
    }

    const renderer = rendererFlag.value
      ? rendererFor(rendererFlag.value)
      : rendererForExtension(path.extname(absoluteSource));
    if (!renderer) {
      logErr(
        rendererFlag.value
          ? `unknown renderer: ${rendererFlag.value}\nknown renderers: ${rendererIds().join(', ')}`
          : `cannot infer a renderer from ${path.extname(absoluteSource) || '(no extension)'}; ` +
              `pass --renderer with one of: ${rendererIds().join(', ')}`,
      );
      return 2;
    }

    const format = (formatFlag.value ?? 'svg').toLowerCase();
    if (!supportedFormats(renderer).includes(format)) {
      logErr(
        `${renderer.label} cannot render ${format.toUpperCase()}; it supports ${supportedFormats(renderer).join(', ')}.`,
      );
      return 2;
    }

    let chosen;
    try {
      chosen = resolveActiveDir();
    } catch (error) {
      if (error instanceof ToolsDirError) {
        logErr(error.message);
        return 1;
      }
      throw error;
    }

    const probe = probeRenderer(renderer, chosen.dir, fsx);
    if (!probe.ok) {
      logErr(
        `${renderer.id} is not usable: ${probe.reason}\n` +
          `install it with: node sd.mjs ensure ${renderer.id}`,
      );
      return 1;
    }
    if (renderer.requiresJava) {
      const java = checkJava(run);
      if (!java.ok) {
        logErr(`${renderer.id} is blocked — ${java.detail}`);
        return 1;
      }
    }
    if (format === 'png' && renderer.pngVia === 'resvg') {
      const raster = probeRenderer(RASTERIZER, chosen.dir, fsx);
      if (!raster.ok) {
        logErr(
          `${renderer.id} can only emit PNG through the resvg rasterizer, which is not usable: ${raster.reason}\n` +
            `install it with: node sd.mjs ensure ${RASTERIZER.id}`,
        );
        return 1;
      }
    }

    let engine = engineFlag.value;
    let nop = null;
    if (nopFlag.found) {
      nop = nopFlag.value === undefined ? 1 : Number(nopFlag.value);
      if (![1, 2].includes(nop)) {
        logErr('--nop takes 1 or 2');
        return 2;
      }
    }
    if (fidelity) {
      engine = engine ?? 'neato';
      nop = nop ?? 1;
    }

    let output = outputFlag.value ? path.resolve(cwd, outputFlag.value) : outputPathFor(absoluteSource, format);
    if (renderer.multiView && outputFlag.value) {
      // A multi-view renderer writes one file per view, so `-o` naturally names
      // a directory: honour a trailing separator, an existing directory, or an
      // extensionless path, and derive the single-file form from the source.
      const raw = outputFlag.value;
      const isDirectory = () => {
        try {
          return fsx.statSync(output).isDirectory() === true;
        } catch {
          return false;
        }
      };
      const namesDirectory =
        /[\\/]$/.test(raw) || path.extname(raw) === '' || (fsx.existsSync(output) && isDirectory());
      if (namesDirectory) {
        fsx.mkdirSync(output, { recursive: true });
        output = path.join(output, `${path.parse(absoluteSource).name}.${format}`);
      }
    }
    try {
      const result = await executeRender(renderer, {
        dir: chosen.dir,
        source: absoluteSource,
        output,
        format,
        engine,
        nop,
        fsx,
        run,
        platform,
        load,
      });
      for (const file of result.outputs) {
        const size = fsx.statSync(file).size;
        log(`rendered ${path.relative(cwd, file) || file} (${formatBytes(size)})`);
      }
      if (result.nop) log(`mode: engine ${result.engine}, nop ${result.nop} (explicit positions preserved)`);
      else if (renderer.id === 'graphviz') log(`mode: engine ${result.engine}`);
      log(`renderer: ${renderer.id} ${pinnedVersion(renderer)}`);
      if (result.rasterized) log(`rasterizer: ${result.rasterized} ${pinnedVersion(RASTERIZER)}`);
      return 0;
    } catch (error) {
      logErr(error.message);
      return 1;
    }
  }

  function lint(argv) {
    const strict = takeBool(argv, ['--strict']);
    const json = takeBool(argv, ['--json']);
    if (argv.length === 0) {
      logErr('usage: sd.mjs lint <file.svg|manifest>... [--strict] [--json]');
      return 2;
    }

    const targets = [];
    let missing = 0;
    for (const arg of argv) {
      const absolute = path.resolve(cwd, arg);
      if (!fsx.existsSync(absolute)) {
        logErr(`file does not exist: ${arg}`);
        return 1;
      }
      const extension = path.extname(absolute).toLowerCase();
      if (extension === '.svg') {
        targets.push({ file: absolute, svg: fsx.readFileSync(absolute, 'utf8') });
        continue;
      }
      if (extension !== '.json') {
        logErr(`lint reads .svg files and diagram manifests, not ${extension || '(no extension)'}: ${arg}`);
        return 2;
      }
      let manifest;
      try {
        manifest = JSON.parse(fsx.readFileSync(absolute, 'utf8'));
      } catch (error) {
        logErr(`invalid JSON in ${arg}: ${error.message}`);
        return 1;
      }
      const root = findProjectRoot(path.dirname(absolute), fsx);
      for (const diagram of manifest.diagrams ?? []) {
        for (const output of diagram.outputs ?? []) {
          if (!/\.svg$/i.test(output)) continue;
          const rendered = path.resolve(root, output);
          if (!fsx.existsSync(rendered)) {
            logErr(`error: ${output}: rendered output is missing (${diagram.id})`);
            missing += 1;
            continue;
          }
          targets.push({ file: rendered, svg: fsx.readFileSync(rendered, 'utf8'), diagram: diagram.id });
        }
      }
    }
    if (targets.length === 0) {
      logErr('nothing to lint: no SVG outputs were found');
      return 1;
    }

    let errors = missing;
    let warnings = 0;
    const report = [];
    for (const target of targets) {
      const relative = path.relative(cwd, target.file) || target.file;
      const { findings, stats } = lintSvg(target.svg, { file: relative });
      report.push({ file: relative, diagram: target.diagram ?? null, stats, findings });
      for (const finding of findings) {
        if (finding.severity === 'error') errors += 1;
        else warnings += 1;
        if (!json) logErr(`${finding.severity}: ${finding.message}`);
      }
    }

    if (json) {
      log(JSON.stringify({ files: report, errors, warnings }, null, 2));
    } else {
      log(`linted ${targets.length} file(s): ${errors} error(s), ${warnings} warning(s)`);
    }
    if (errors > 0 || (strict && warnings > 0)) return 1;
    return 0;
  }

  function validate(argv) {
    const rootFlag = takeFlag(argv, ['--root']);
    const manifestArg = argv[0];
    if (!manifestArg) {
      logErr('usage: sd.mjs validate <manifest> [--root <dir>]');
      return 2;
    }
    const manifestPath = path.resolve(cwd, manifestArg);
    if (!fsx.existsSync(manifestPath)) {
      logErr(`manifest does not exist: ${manifestArg}`);
      return 1;
    }
    const root = rootFlag.value
      ? path.resolve(cwd, rootFlag.value)
      : findProjectRoot(path.dirname(manifestPath), fsx);

    let manifest;
    try {
      manifest = JSON.parse(fsx.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      logErr(`invalid JSON in ${manifestArg}: ${error.message}`);
      return 1;
    }

    const { errors, warnings } = validateManifest(manifest, {
      root,
      exists: (file) => fsx.existsSync(file),
      readFile: (file) => fsx.readFileSync(file, 'utf8'),
    });
    for (const warning of warnings) logErr(`warning: ${warning}`);
    for (const error of errors) logErr(`error: ${error}`);
    if (errors.length) {
      logErr(`\n${errors.length} error(s); the asset set is not valid.`);
      return 1;
    }
    log(`validated ${manifest.diagrams.length} diagram(s) against root ${root}`);
    return 0;
  }

  function reset(argv) {
    const confirmed = argv.includes('--yes') || argv.includes('-y') || env.SOFTWARE_DIAGRAMS_RESET_CONFIRM === '1';
    let chosen;
    try {
      chosen = resolveActiveDir();
    } catch (error) {
      if (error instanceof ToolsDirError) {
        logErr(error.message);
        return 1;
      }
      throw error;
    }
    if (!fsx.existsSync(chosen.dir)) {
      log(`nothing to reset: ${chosen.dir} does not exist`);
      return 0;
    }
    if (!confirmed) {
      logErr(`refusing to delete ${chosen.dir} without confirmation.\nRe-run with --yes to delete it.`);
      return 1;
    }
    fsx.rmSync(chosen.dir, { recursive: true, force: true });
    log(`deleted ${chosen.dir}`);
    return 0;
  }

  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    log(USAGE);
    return command ? 0 : 2;
  }
  if (command === 'doctor') return doctor();
  if (command === 'ensure') return await ensure(rest);
  if (command === 'render') return await render(rest);
  if (command === 'lint') return lint(rest);
  if (command === 'validate') return validate(rest);
  if (command === 'reset') return reset(rest);

  logErr(`unknown command: ${command}`);
  log(USAGE);
  return 2;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invoked === import.meta.url) {
  const code = await main(process.argv.slice(2));
  // D2 keeps a worker alive after rendering; exit explicitly once output is out.
  process.exit(code);
}