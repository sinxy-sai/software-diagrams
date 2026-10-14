import path from 'node:path';
import os from 'node:os';

export class ToolsDirError extends Error {}

const DEFAULT_SEGMENTS = ['.cache', 'software-diagrams', 'tools'];

export function resolveToolsDir(env = process.env, homedir = os.homedir()) {
  const override = (env.SOFTWARE_DIAGRAMS_TOOLS ?? '').trim();
  if (override) {
    return { dir: path.resolve(override), source: 'env' };
  }
  return { dir: path.join(homedir, ...DEFAULT_SEGMENTS), source: 'default' };
}

export function assertToolsDirSafe(dir) {
  const norm = dir.split(path.sep).join('/');
  if (/[\\/]/.test(dir) && /(^|\/)\.claude\/plugins\/cache\//.test(norm)) {
    throw new ToolsDirError(`refusing tools dir inside the Claude Code plugin cache: ${dir}`);
  }
  if (/(^|\/)\.codex\/plugins\/cache\//.test(norm)) {
    throw new ToolsDirError(`refusing tools dir inside the Codex plugin cache: ${dir}`);
  }
  if (/(^|\/)node_modules\//.test(norm)) {
    throw new ToolsDirError(`refusing tools dir inside node_modules: ${dir}`);
  }
  if (norm.endsWith('/node_modules')) {
    throw new ToolsDirError(`refusing tools dir inside node_modules: ${dir}`);
  }
}

export function toolsPath(dir, ...parts) {
  return path.join(dir, ...parts);
}
