import crypto from 'node:crypto';
import path from 'node:path';
import { pinnedVersion } from './registry.mjs';
import { toolsPath } from './tools-dir.mjs';
import { emptyLedger, isSatisfied, loadLedger, recordInstall, saveLedger } from './ledger.mjs';
import { probeRenderer } from './probe.mjs';

/** A minimal package.json so npm has a prefix root and tooling can resolve it. */
export const TOOLS_PACKAGE_JSON = `${JSON.stringify(
  {
    name: 'software-diagrams-tools',
    private: true,
    description: 'Renderers installed by the software-diagrams skill. Safe to delete.',
  },
  null,
  2,
)}\n`;

export function sha256Of(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Plan the install steps for one renderer. Pure: no fs, no network, no child
 * process. `dir` is only used to build argument vectors.
 */
export function planEnsure(renderer, ledger, dir) {
  const existing = ledger.entries[renderer.id] ?? null;
  const check = isSatisfied(existing, renderer);
  const version = pinnedVersion(renderer);
  const entryDraft = {
    id: renderer.id,
    kind: renderer.kind,
    runtime: renderer.runtime,
    version,
    packages: [...(renderer.packages ?? [])],
    artifacts: [],
    installedAt: new Date().toISOString(),
  };
  if (check.ok) return { action: 'noop', steps: [], entryDraft: existing };

  const steps = [];
  if (renderer.kind === 'npm') {
    steps.push({ type: 'seed-package-json' });
    // npm's cache defaults to the user home, which a confined agent sandbox
    // forbids; keeping it inside the tools directory makes installs work there
    // and makes `reset` delete the whole footprint in one step.
    const shared = ['--no-audit', '--no-fund', '--loglevel=error', '--cache', toolsPath(dir, '.npm-cache')];
    const installArgs = ['install', ...shared, '--prefix', dir];
    // Only renderers that genuinely need lifecycle scripts get them.
    if (!renderer.needsRebuild && !renderer.needsInstallScripts) installArgs.push('--ignore-scripts');
    installArgs.push(...renderer.packages);
    steps.push({ type: 'npm-install', args: installArgs });
    if (renderer.needsRebuild) {
      const pkgName = renderer.packages[0].slice(0, renderer.packages[0].lastIndexOf('@'));
      steps.push({
        type: 'npm-rebuild',
        args: ['rebuild', pkgName, '--foreground-scripts', ...shared, '--prefix', dir],
      });
    }
  } else if (renderer.kind === 'jar') {
    steps.push({
      type: 'download',
      url: renderer.url,
      dest: renderer.download,
      sha256: renderer.sha256,
      version,
    });
    if (renderer.unpack) {
      steps.push({
        type: 'unpack',
        archive: renderer.unpack.archive,
        dir: renderer.unpack.dir,
        keepArchive: renderer.keepArchive !== false,
      });
    }
  } else {
    throw new Error(`unknown renderer kind: ${renderer.kind}`);
  }
  return { action: existing ? 'repair' : 'install', steps, entryDraft };
}

/**
 * Execute an install plan through injected IO seams. A failure rolls back what
 * this run created, so a half-installed tree never looks installed.
 */
export async function executeEnsure(renderer, { dir, fsx, run, fetchBuffer, ledger, platform = process.platform }) {
  const useLedger = ledger ?? loadLedger(dir, fsx);
  const probe = probeRenderer(renderer, dir, fsx);
  const recorded = useLedger.entries[renderer.id];
  if (probe.ok) {
    // Evidence wins over the ledger: files that match the pins are usable.
    // Record them so version tracking and `doctor` agree with reality.
    if (recorded && isSatisfied(recorded, renderer).ok) {
      return { action: 'noop', entry: recorded };
    }
    const adopted = {
      id: renderer.id,
      kind: renderer.kind,
      runtime: renderer.runtime,
      version: pinnedVersion(renderer),
      packages: [...(renderer.packages ?? [])],
      artifacts: [{ path: renderer.probe.type === 'file' ? renderer.probe.path : 'node_modules', bytes: 0 }],
      installedAt: new Date().toISOString(),
      adopted: true,
    };
    saveLedger(dir, recordInstall(useLedger, adopted), fsx);
    return { action: 'adopted', entry: adopted };
  }

  let plan = planEnsure(renderer, useLedger, dir);
  // The ledger claims a version but the files do not back it: reinstall.
  if (plan.action === 'noop') plan = planEnsure(renderer, emptyLedger(), dir);

  const undo = [];
  const artifacts = [];
  const track = (fn) => undo.push(fn);
  const rollback = () => {
    for (const fn of undo.reverse()) {
      try {
        fn();
      } catch {
        // Best effort: the original error is the one worth reporting.
      }
    }
  };

  try {
    fsx.mkdirSync(dir, { recursive: true });
    for (const step of plan.steps) {
      if (step.type === 'seed-package-json') {
        const manifest = toolsPath(dir, 'package.json');
        if (!fsx.existsSync(manifest)) {
          fsx.writeFileSync(manifest, TOOLS_PACKAGE_JSON, 'utf8');
          track(() => fsx.unlinkSync(manifest));
        }
        continue;
      }

      if (step.type === 'download') {
        const buffer = await fetchBuffer(step.url);
        if (step.sha256) {
          const actual = sha256Of(buffer);
          if (actual !== step.sha256) {
            throw new Error(
              `checksum mismatch for ${step.url}\n  expected ${step.sha256}\n  actual   ${actual}\n` +
                'The download was rejected and nothing was installed.',
            );
          }
        }
        const abs = toolsPath(dir, step.dest);
        fsx.mkdirSync(path.dirname(abs), { recursive: true });
        fsx.writeFileSync(abs, buffer);
        track(() => fsx.unlinkSync(abs));
        artifacts.push({ path: step.dest, sha256: sha256Of(buffer), bytes: buffer.length });
        continue;
      }

      if (step.type === 'unpack') {
        const abs = toolsPath(dir, step.dir);
        if (fsx.existsSync(abs)) {
          fsx.rmSync(abs, { recursive: true, force: true });
        }
        fsx.mkdirSync(abs, { recursive: true });
        track(() => fsx.rmSync(abs, { recursive: true, force: true }));
        const archive = toolsPath(dir, step.archive);
        // GNU tar cannot read zip; bsdtar (Windows, macOS) can; unzip is the
        // Linux default. Both write into an empty, version-scoped directory.
        const useUnzip = platform === 'linux' && /\.zip$/i.test(step.archive);
        const command = useUnzip ? 'unzip' : 'tar';
        const args = useUnzip ? ['-o', archive, '-d', abs] : ['-xf', archive, '-C', abs];
        const result = run(command, args);
        if (result.status !== 0) {
          throw new Error(
            `unpack failed for ${step.archive} with ${command}` +
              (result.error ? ` (${result.error})` : '') +
              `\n${command} is required to unpack ${renderer.label}. ` +
              `If it is missing, unpack ${archive} into ${abs} by hand and re-run.`,
          );
        }
        if (step.keepArchive === false) {
          fsx.unlinkSync(archive);
          const index = artifacts.findIndex((a) => a.path === step.archive);
          if (index >= 0) artifacts.splice(index, 1);
        }
        artifacts.push({ path: step.dir, bytes: 0 });
        continue;
      }

      const nodeModules = toolsPath(dir, 'node_modules');
      // Sample this before npm runs: npm creates the directory, so sampling it
      // afterwards would make the rollback below dead code.
      const existed = fsx.existsSync(nodeModules);
      const result = run('npm', step.args);
      if (result.status !== 0) {
        throw new Error(
          `${step.type} failed: npm ${step.args.join(' ')}` +
            (result.error ? ` (${result.error})` : ''),
        );
      }
      artifacts.push({ path: 'node_modules', bytes: 0 });
      if (!existed) track(() => fsx.rmSync(nodeModules, { recursive: true, force: true }));
    }

    const entry = {
      ...plan.entryDraft,
      installedAt: new Date().toISOString(),
      artifacts: dedupe(artifacts),
    };
    saveLedger(dir, recordInstall(useLedger, entry), fsx);
    return { action: plan.action === 'repair' ? 'repaired' : 'installed', entry };
  } catch (error) {
    rollback();
    throw error;
  }
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((artifact) => (seen.has(artifact.path) ? false : (seen.add(artifact.path), true)));
}