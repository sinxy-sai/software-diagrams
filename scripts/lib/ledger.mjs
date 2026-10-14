import path from 'node:path';
import { toolsPath } from './tools-dir.mjs';

export const LEDGER_FILENAME = 'installed.json';
export const LEDGER_SCHEMA_VERSION = 1;

// path.join returns backslashes on Windows, but every path handed to fsx must
// use one stable form: tests key their fake fs with forward slashes, and
// real node:fs on Windows accepts them too. Normalizing keeps ledger file
// lookups consistent with the rest of the tools-dir path layer.
function fsPath(dir, ...parts) {
  return toolsPath(dir, ...parts).split(path.sep).join('/');
}

function versionOf(spec) {
  const at = spec.lastIndexOf('@');
  return at > 0 ? spec.slice(at + 1) : spec;
}

function registryVersion(renderer) {
  if (renderer.kind === 'jar') {
    const m = renderer.archive.match(/(\d+\.\d+\.\d+)/) ?? renderer.url.match(/v(\d+\.\d+\.\d+)/);
    return m ? m[1] : 'unknown';
  }
  return versionOf(renderer.packages[0] ?? '');
}

export function loadLedger(dir, fsx) {
  const file = fsPath(dir, LEDGER_FILENAME);
  if (!fsx.existsSync(file)) return { schemaVersion: LEDGER_SCHEMA_VERSION, entries: {} };
  const raw = fsx.readFileSync(file, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return { schemaVersion: parsed.schemaVersion ?? LEDGER_SCHEMA_VERSION, entries: parsed.entries ?? {} };
  } catch (error) {
    throw new Error(`cannot parse ${file}: ${error.message}`);
  }
}

export function saveLedger(dir, ledger, fsx) {
  fsx.mkdirSync(dir, { recursive: true });
  fsx.writeFileSync(fsPath(dir, LEDGER_FILENAME), `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
}

export function recordInstall(ledger, entry) {
  return { ...ledger, entries: { ...ledger.entries, [entry.id]: entry } };
}

export function isSatisfied(entry, renderer) {
  if (!entry) return { ok: false, reason: 'not installed' };
  const want = registryVersion(renderer);
  if (entry.version !== want) {
    return { ok: false, reason: `installed version ${entry.version} does not match pinned ${want}` };
  }
  const missing = renderer.packages.filter((p) => !entry.packages.includes(p));
  if (missing.length) {
    return { ok: false, reason: `installed packages differ from pinned: missing ${missing.join(', ')}` };
  }
  return { ok: true };
}

export function installedState(dir, fsx) {
  const ledger = loadLedger(dir, fsx);
  const state = {};
  for (const [id, entry] of Object.entries(ledger.entries)) {
    const broken = entry.artifacts.filter((a) => a.path && !fsx.existsSync(fsPath(dir, a.path)));
    state[id] = broken.length
      ? { ...entry, brokenArtifacts: broken.map((b) => path.join(dir, b.path)) }
      : entry;
  }
  return state;
}
