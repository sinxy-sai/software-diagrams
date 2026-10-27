import crypto from 'node:crypto';
import { pinnedVersion } from './registry.mjs';
import { toolsPath } from './tools-dir.mjs';

function sha256OfFile(file, fsx) {
  return crypto.createHash('sha256').update(fsx.readFileSync(file)).digest('hex');
}

/**
 * Prove that a renderer is actually usable on disk.
 *
 * A ledger entry records intent; it is not evidence. A pruned npm package, a
 * missing Puppeteer browser, or a jar deleted behind our back must show up as
 * `broken` rather than `ready`.
 *
 * Pure planning uses the registry; this function is the one place that reads
 * the filesystem to answer "can we really render with this?".
 */
export function probeRenderer(renderer, dir, fsx) {
  const probe = renderer.probe;
  if (!probe) return { ok: false, reason: `renderer ${renderer.id} declares no probe` };
  const want = pinnedVersion(renderer);

  if (probe.type === 'npm-package') {
    const manifest = toolsPath(dir, 'node_modules', probe.name, 'package.json').split('\\').join('/');
    if (!fsx.existsSync(manifest)) {
      return { ok: false, reason: `${probe.name} is not installed` };
    }
    let pkg;
    try {
      pkg = JSON.parse(fsx.readFileSync(manifest, 'utf8'));
    } catch (error) {
      return { ok: false, reason: `${probe.name}/package.json is unreadable: ${error.message}` };
    }
    if (probe.version && pkg.version !== probe.version) {
      return { ok: false, reason: `${probe.name} is ${pkg.version}, pinned ${probe.version}` };
    }
    if (renderer.binary) {
      const binary = toolsPath(dir, renderer.binary).split('\\').join('/');
      const variants = [binary, `${binary}.cmd`, `${binary}.exe`];
      if (!variants.some((candidate) => fsx.existsSync(candidate))) {
        return { ok: false, reason: `${probe.name} is installed but ${renderer.binary} is missing` };
      }
    }
    return { ok: true, detail: `${probe.name}@${pkg.version}` };
  }

  if (probe.type === 'file') {
    const file = toolsPath(dir, probe.path).split('\\').join('/');
    if (!fsx.existsSync(file)) return { ok: false, reason: `missing ${probe.path}` };
    // Verify the pinned digest only where the pinned digest describes this file
    // (a downloaded archive is deleted after unpack and cannot be re-hashed).
    if (renderer.sha256 && renderer.download === probe.path) {
      const actual = sha256OfFile(file, fsx);
      if (actual !== renderer.sha256) {
        return { ok: false, reason: `${probe.path} does not match the pinned checksum` };
      }
    }
    return { ok: true, detail: probe.path };
  }

  return { ok: false, reason: `unknown probe type ${probe.type} (pinned ${want})` };
}