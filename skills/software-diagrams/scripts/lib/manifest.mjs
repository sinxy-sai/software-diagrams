import path from 'node:path';
import { rendererFor } from './registry.mjs';

export const ALLOWED_PROFILES = ['tracked-source', 'local-source/published-artifacts', 'local-only-preview'];

const PROFILE_PUBLICATION = {
  'tracked-source': new Set(['source', 'output', 'both']),
  'local-source/published-artifacts': new Set(['output']),
  'local-only-preview': new Set(['local']),
};

const REQUIRED_FIELDS = ['id', 'purpose', 'source', 'renderer', 'outputs', 'documents', 'publication'];

function isRemote(value) {
  return /^(?:https?:|mailto:|data:|#)/i.test(value);
}

function insideRoot(root, value) {
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Validate a diagram manifest. Pure: filesystem access goes through `exists`
 * and `readFile`, so the rules are testable without touching disk.
 *
 * Returns { errors, warnings }. An empty errors array means the asset set is
 * structurally sound.
 */
export function validateManifest(manifest, { root, exists, readFile }) {
  const errors = [];
  const warnings = [];
  const fail = (message) => errors.push(message);
  const warn = (message) => warnings.push(message);

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { errors: ['manifest must be a JSON object'], warnings };
  }
  if (!ALLOWED_PROFILES.includes(manifest.profile)) {
    fail(`profile must be one of ${ALLOWED_PROFILES.join(', ')}`);
  }
  if (!Array.isArray(manifest.diagrams) || manifest.diagrams.length === 0) {
    fail('diagrams must be a non-empty array');
    return { errors, warnings };
  }

  const ids = new Set();
  const sources = new Set();
  const outputs = new Set();

  for (const diagram of manifest.diagrams) {
    if (!diagram || typeof diagram !== 'object' || Array.isArray(diagram)) {
      fail('each diagram entry must be an object');
      continue;
    }
    const label = typeof diagram.id === 'string' && diagram.id ? diagram.id : '<unknown>';
    const missing = REQUIRED_FIELDS.filter((field) => !(field in diagram));
    for (const field of missing) fail(`${label} is missing ${field}`);
    if (missing.length) continue;

    // Track errors for THIS diagram only: a global substring match would let an
    // earlier diagram's message suppress later checks whenever its id happens to
    // be a substring of that message.
    const errorsBefore = errors.length;
    if (typeof diagram.id !== 'string' || !diagram.id) fail('diagram id must be a non-empty string');
    if (typeof diagram.purpose !== 'string' || !diagram.purpose) fail(`${label}: purpose must be a non-empty string`);
    if (typeof diagram.source !== 'string' || !diagram.source) fail(`${label}: source must be a non-empty string`);
    if (typeof diagram.renderer !== 'string' || !diagram.renderer) fail(`${label}: renderer must be a non-empty string`);
    if (!Array.isArray(diagram.outputs) || diagram.outputs.length === 0 || !diagram.outputs.every((v) => typeof v === 'string')) {
      fail(`${label}: outputs must be a non-empty array of strings`);
    }
    if (!Array.isArray(diagram.documents) || !diagram.documents.every((v) => typeof v === 'string')) {
      fail(`${label}: documents must be an array of strings`);
    }
    if (errors.length > errorsBefore) continue;

    if (ids.has(diagram.id)) fail(`duplicate diagram id: ${diagram.id}`);
    ids.add(diagram.id);

    const renderer = rendererFor(diagram.renderer);
    if (!renderer) {
      fail(`${label}: unknown renderer "${diagram.renderer}"`);
    } else {
      const extension = path.extname(diagram.source).toLowerCase();
      if (!renderer.extensions.includes(extension)) {
        warn(`${label}: source extension ${extension} is not one of ${renderer.extensions.join(', ')} for ${renderer.id}`);
      }
    }

    const normalizedSource = path.normalize(diagram.source);
    if (sources.has(normalizedSource)) fail(`source is reused by multiple diagrams: ${diagram.source}`);
    sources.add(normalizedSource);

    if (!insideRoot(root, diagram.source)) {
      fail(`${label}: source escapes the project root: ${diagram.source}`);
    } else if (!exists(path.resolve(root, diagram.source))) {
      fail(`${label}: source is missing: ${diagram.source}`);
    }

    if (!['source', 'output', 'both', 'local'].includes(diagram.publication)) {
      fail(`${label}: publication must be source, output, both, or local`);
    } else {
      const allowed = PROFILE_PUBLICATION[manifest.profile];
      if (allowed && !allowed.has(diagram.publication)) {
        fail(`${label}: publication ${diagram.publication} is incompatible with profile ${manifest.profile}`);
      }
    }

    const referenced = new Set();
    for (const document of diagram.documents) {
      const documentPath = path.resolve(root, document);
      if (!insideRoot(root, document)) {
        fail(`${label}: document escapes the project root: ${document}`);
        continue;
      }
      if (!exists(documentPath)) {
        fail(`${label}: document is missing: ${document}`);
        continue;
      }
      const text = readFile(documentPath);
      const links = [
        ...text.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g),
        ...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g),
      ].map((match) => match[1]);
      for (const reference of links) {
        if (isRemote(reference)) continue;
        const target = path.resolve(path.dirname(documentPath), reference.split('#')[0]);
        referenced.add(target);
        if (!exists(target)) fail(`${document}: link target is missing: ${reference}`);
      }
    }

    for (const output of diagram.outputs) {
      const normalized = path.normalize(output);
      if (outputs.has(normalized)) fail(`output is reused by multiple diagrams: ${output}`);
      outputs.add(normalized);
      if (!insideRoot(root, output)) {
        fail(`${label}: output escapes the project root: ${output}`);
        continue;
      }
      if (!exists(path.resolve(root, output))) {
        fail(`${label}: rendered output is missing: ${output}`);
      }
      const sourceStem = path.basename(diagram.source, path.extname(diagram.source));
      const outputStem = path.basename(output, path.extname(output));
      if (sourceStem !== outputStem && !renderer?.multiView) {
        warn(`${label}: source/output basenames differ: ${sourceStem} -> ${outputStem}`);
      }
      if (diagram.documents.length && ['output', 'both'].includes(diagram.publication) && !referenced.has(path.resolve(root, output))) {
        warn(`${label}: output is not referenced by its declared documents: ${output}`);
      }
    }
  }

  return { errors, warnings };
}