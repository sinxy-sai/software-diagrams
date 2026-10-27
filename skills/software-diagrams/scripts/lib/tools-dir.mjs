import path from 'node:path';
import os from 'node:os';

export class ToolsDirError extends Error {}

export const TOOLS_DIR_ENV = 'SOFTWARE_DIAGRAMS_TOOLS';
const DEFAULT_SEGMENTS = ['.cache', 'software-diagrams', 'tools'];

/**
 * Resolve the preferred tools directory without touching the filesystem.
 * `$SOFTWARE_DIAGRAMS_TOOLS` wins; otherwise the user cache directory.
 */
export function resolveToolsDir(env = process.env, homedir = os.homedir()) {
  const override = (env[TOOLS_DIR_ENV] ?? '').trim();
  if (override) return { dir: path.resolve(override), source: 'env', explicit: true };
  return { dir: path.join(homedir, ...DEFAULT_SEGMENTS), source: 'cache', explicit: false };
}

/** A workspace-local fallback, used when the cache directory is not writable. */
export function workspaceToolsDir(projectRoot) {
  return path.join(projectRoot, '.dsh', 'tools');
}

/** Nearest ancestor containing `.git`, else the directory itself. */
export function findProjectRoot(start = process.cwd(), fsx = undefined) {
  let current = path.resolve(start);
  for (;;) {
    if (fsx && fsx.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

function normalized(dir) {
  return String(dir).split(path.sep).join('/').toLowerCase();
}

/**
 * Refuse directories that would put renderers inside a plugin cache, a
 * dependency tree, or a skill bundle. This is a denylist on purpose: the
 * canonical default is a user cache directory, and an explicit override is the
 * user's decision unless it lands somewhere a host garbage-collects.
 */
export function assertToolsDirSafe(dir) {
  const norm = normalized(dir);
  const deny = [
    [/(^|\/)\.claude\/plugins\/cache(\/|$)/, 'the Claude Code plugin cache'],
    [/(^|\/)\.codex\/plugins\/cache(\/|$)/, 'the Codex plugin cache'],
    [/(^|\/)node_modules(\/|$)/, 'node_modules'],
    [/(^|\/)skills\/[^/]+\/scripts(\/|$)/, 'a skill bundle'],
  ];
  for (const [pattern, label] of deny) {
    if (pattern.test(norm)) {
      throw new ToolsDirError(`refusing tools dir inside ${label}: ${dir}`);
    }
  }
}

export function toolsPath(dir, ...parts) {
  return path.join(dir, ...parts);
}

/** True when `dir` can actually be created and written. This touches disk. */
export function isWritableDir(dir, fsx) {
  const probe = path.join(dir, `.probe-${process.pid}-${Date.now()}`);
  try {
    fsx.mkdirSync(dir, { recursive: true });
    fsx.writeFileSync(probe, '');
    try {
      fsx.unlinkSync(probe);
    } catch {
      // A probe file that cannot be removed is not a reason to reject the dir.
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Choose the one tools directory to use. An explicit override is honoured
 * as-is; otherwise the cache directory is used when writable, then a
 * workspace-local directory (the case under a sandbox that forbids writes to
 * the home directory), then the OS temp directory. The chosen source is
 * returned so callers can tell the user where renderers actually live.
 */
export function chooseToolsDir({ env = process.env, homedir = os.homedir(), projectRoot, fsx, tmpdir = os.tmpdir() }) {
  const preferred = resolveToolsDir(env, homedir);
  assertToolsDirSafe(preferred.dir);
  if (preferred.explicit) return { ...preferred, dir: preferred.dir, fallback: false };
  if (isWritableDir(preferred.dir, fsx)) return { ...preferred, fallback: false };

  const workspace = workspaceToolsDir(projectRoot);
  assertToolsDirSafe(workspace);
  if (isWritableDir(workspace, fsx)) {
    return { dir: workspace, source: 'workspace', explicit: false, fallback: true, preferred: preferred.dir };
  }

  const temp = path.join(tmpdir, 'software-diagrams-tools');
  assertToolsDirSafe(temp);
  if (isWritableDir(temp, fsx)) {
    return { dir: temp, source: 'temp', explicit: false, fallback: true, preferred: preferred.dir };
  }

  throw new ToolsDirError(
    `no writable tools directory. Tried ${preferred.dir}, ${workspace} and ${temp}. ` +
      `Set ${TOOLS_DIR_ENV} to a writable directory.`,
  );
}