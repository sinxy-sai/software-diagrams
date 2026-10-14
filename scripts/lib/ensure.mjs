import crypto from 'node:crypto';
import path from 'node:path';
import { toolsPath } from './tools-dir.mjs';
import { isSatisfied, loadLedger, recordInstall, saveLedger } from './ledger.mjs';

export function sha256Of(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function sha256OfFile(absPath, fsx) {
  return sha256Of(fsx.readFileSync(absPath));
}

function pinnedVersion(renderer) {
  if (renderer.kind === 'jar') {
    const m = renderer.url.match(/v(\d+\.\d+\.\d+)/);
    return m ? m[1] : 'unknown';
  }
  return renderer.packages[0].slice(renderer.packages[0].lastIndexOf('@') + 1);
}

export function planEnsure(renderer, ledger, dir) {
  const existing = ledger.entries[renderer.id] ?? null;
  const check = isSatisfied(existing, renderer);
  const entryDraft = {
    id: renderer.id,
    kind: renderer.kind,
    version: pinnedVersion(renderer),
    packages: [...renderer.packages],
    artifacts: [],
    installedAt: new Date().toISOString(),
    hostNode: process.version,
  };
  if (check.ok) return { action: 'noop', steps: [], entryDraft: existing };

  const steps = [];
  if (renderer.kind === 'npm' || renderer.kind === 'wasm') {
    steps.push({
      type: 'npm-install',
      args: ['install', '--no-audit', '--no-fund', '--prefix', dir, ...renderer.packages],
    });
    if (renderer.needsRebuild) {
      steps.push({ type: 'npm-rebuild', args: ['rebuild', renderer.packages[0].split('@')[0], '--foreground-scripts', '--prefix', dir] });
    }
  }
  if (renderer.kind === 'jar') {
    steps.push({ type: 'download', url: renderer.url, dest: renderer.archive });
    if (renderer.unpack) steps.push({ type: 'unpack', archive: renderer.unpack.archive, dir: renderer.unpack.dir });
  }
  return { action: 'install', steps, entryDraft };
}

export async function executeEnsure(renderer, { dir, fsx, run, fetchBuffer, ledger }) {
  const useLedger = ledger ?? loadLedger(dir, fsx);
  const plan = planEnsure(renderer, useLedger, dir);
  if (plan.action === 'noop') return { action: 'noop', entry: plan.entryDraft };

  fsx.mkdirSync(dir, { recursive: true });
  const artifacts = [];
  for (const step of plan.steps) {
    if (step.type === 'download') {
      const buffer = await fetchBuffer(step.url);
      const abs = toolsPath(dir, step.dest);
      fsx.mkdirSync(path.dirname(abs), { recursive: true });
      fsx.writeFileSync(abs, buffer);
      artifacts.push({ path: step.dest, sha256: sha256Of(buffer), bytes: buffer.length });
      continue;
    }
    if (step.type === 'unpack') {
      const abs = toolsPath(dir, step.dir);
      fsx.mkdirSync(abs, { recursive: true });
      const result = run('tar', ['-xf', toolsPath(dir, step.archive), '-C', abs]);
      if (result.status !== 0) {
        throw new Error(
          `unpack failed for ${step.archive}: ${result.stderr}\n` +
          'tar is required to unpack the Structurizr CLI. On Windows it ships with Git for Windows and Windows 10+; ' +
          `if it is missing, unpack ${toolsPath(dir, step.archive)} into ${toolsPath(dir, step.dir)} by hand and re-run.`,
        );
      }
      artifacts.push({ path: step.dir, bytes: 0 });
      continue;
    }
    const result = run('npm', step.args, { stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${step.type} failed: npm ${step.args.join(' ')}`);
    artifacts.push({ path: 'node_modules', bytes: 0 });
  }

  const entry = { ...plan.entryDraft, installedAt: new Date().toISOString(), artifacts: dedupe(artifacts) };
  saveLedger(dir, recordInstall(useLedger, entry), fsx);
  return { action: 'installed', entry };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((a) => (seen.has(a.path) ? false : (seen.add(a.path), true)));
}
