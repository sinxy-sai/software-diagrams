import path from 'node:path';
import { pinnedVersion } from './registry.mjs';
import { toolsPath } from './tools-dir.mjs';

export const LEDGER_FILENAME = 'installed.json';
export const LEDGER_SCHEMA_VERSION = 1;

// Every path handed to fsx uses forward slashes so a ledger written on Windows
// is readable on macOS/Linux and fake filesystems in tests agree with real ones.
function fsPath(dir, ...parts) {
  return toolsPath(dir, ...parts).split(path.sep).join('/');
}

export function emptyLedger() {
  return { schemaVersion: LEDGER_SCHEMA_VERSION, entries: {} };
}

export function loadLedger(dir, fsx) {
  const file = fsPath(dir, LEDGER_FILENAME);
  if (!fsx.existsSync(file)) return emptyLedger();
  const raw = fsx.readFileSync(file, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`cannot parse ${file}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`cannot parse ${file}: expected a JSON object`);
  }
  const version = parsed.schemaVersion ?? LEDGER_SCHEMA_VERSION;
  if (version !== LEDGER_SCHEMA_VERSION) {
    throw new Error(
      `${file} uses ledger schemaVersion ${version}; this build understands ${LEDGER_SCHEMA_VERSION}. ` +
        'Delete the file or run: node sd.mjs reset',
    );
  }
  if (!parsed.entries || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) {
    throw new Error(`cannot parse ${file}: entries must be an object`);
  }
  return { schemaVersion: version, entries: parsed.entries };
}

/**
 * Write the ledger atomically: a crash mid-write must never leave a file that
 * loadLedger cannot parse, because that would brick the tools directory.
 */
export function saveLedger(dir, ledger, fsx) {
  const file = fsPath(dir, LEDGER_FILENAME);
  const temp = `${file}.tmp-${process.pid}`;
  fsx.mkdirSync(fsPath(dir), { recursive: true });
  fsx.writeFileSync(temp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  fsx.renameSync(temp, file);
}

export function recordInstall(ledger, entry) {
  return { ...ledger, entries: { ...ledger.entries, [entry.id]: entry } };
}

export function recordRemoval(ledger, id) {
  const entries = { ...ledger.entries };
  delete entries[id];
  return { ...ledger, entries };
}

/** Compare one ledger entry against the registry pins. Pure. */
export function isSatisfied(entry, renderer) {
  if (!entry) return { ok: false, reason: 'no ledger entry' };
  const want = pinnedVersion(renderer);
  if (entry.version !== want) {
    return { ok: false, reason: `installed ${entry.version}, pinned ${want}` };
  }
  const wantPackages = renderer.packages ?? [];
  const havePackages = entry.packages ?? [];
  const missing = wantPackages.filter((spec) => !havePackages.includes(spec));
  if (missing.length) {
    return { ok: false, reason: `installed packages differ from pinned: missing ${missing.join(', ')}` };
  }
  return { ok: true };
}

/** Ledger entries whose recorded artifacts are no longer on disk. */
export function installedState(dir, fsx) {
  const ledger = loadLedger(dir, fsx);
  const state = {};
  for (const [id, entry] of Object.entries(ledger.entries)) {
    const artifacts = entry.artifacts ?? [];
    const broken = artifacts.filter((a) => a.path && !fsx.existsSync(fsPath(dir, a.path)));
    state[id] = broken.length
      ? { ...entry, brokenArtifacts: broken.map((a) => fsPath(dir, a.path)) }
      : entry;
  }
  return state;
}