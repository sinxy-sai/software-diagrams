import fs from 'node:fs';
import path from 'node:path';

const manifestPath = process.argv[2] ?? 'diagram-manifest.json';
const root = path.resolve(process.argv[3] ?? process.cwd());
const absoluteManifest = path.resolve(root, manifestPath);

function fail(message) {
  console.error(`Manifest validation failed: ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(absoluteManifest)) {
  fail(`manifest does not exist: ${manifestPath}`);
  process.exit();
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(absoluteManifest, 'utf8'));
} catch (error) {
  fail(`invalid JSON: ${error.message}`);
  process.exit();
}

const allowedProfiles = new Set([
  'tracked-source',
  'local-source/published-artifacts',
  'local-only-preview',
]);
if (!allowedProfiles.has(manifest.profile)) {
  fail(`profile must be one of ${[...allowedProfiles].join(', ')}`);
}
if (!Array.isArray(manifest.diagrams) || manifest.diagrams.length === 0) {
  fail('diagrams must be a non-empty array');
  process.exit();
}

const ids = new Set();
const sources = new Set();
const outputs = new Set();
const localPath = (value) => path.resolve(root, value);
const isRemote = (value) => /^(?:https?:|mailto:|data:|#)/i.test(value);

for (const diagram of manifest.diagrams) {
  const required = ['id', 'purpose', 'source', 'renderer', 'outputs', 'documents', 'publication'];
  for (const field of required) {
    if (!(field in diagram)) fail(`${diagram.id ?? '<unknown>'} is missing ${field}`);
  }
  if (ids.has(diagram.id)) fail(`duplicate diagram id: ${diagram.id}`);
  ids.add(diagram.id);
  if (sources.has(diagram.source)) fail(`source is reused by multiple diagrams: ${diagram.source}`);
  sources.add(diagram.source);
  if (!fs.existsSync(localPath(diagram.source))) fail(`${diagram.id}: source is missing: ${diagram.source}`);
  if (!['source', 'output', 'both', 'local'].includes(diagram.publication)) {
    fail(`${diagram.id}: publication must be source, output, both, or local`);
  }

  const referencedPaths = new Set();
  for (const document of diagram.documents ?? []) {
    const documentPath = localPath(document);
    if (!fs.existsSync(documentPath)) {
      fail(`${diagram.id}: document is missing: ${document}`);
      continue;
    }
    const text = fs.readFileSync(documentPath, 'utf8');
    const links = [...text.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)].map((match) => match[1]);
    for (const ref of links) {
      if (isRemote(ref)) continue;
      const resolved = path.resolve(path.dirname(documentPath), ref.split('#')[0]);
      referencedPaths.add(resolved);
      if (!fs.existsSync(resolved)) fail(`${document}: link target is missing: ${ref}`);
    }
    const imageRefs = [...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)].map((match) => match[1]);
    for (const ref of imageRefs) {
      if (isRemote(ref)) continue;
      const resolved = path.resolve(path.dirname(documentPath), ref.split('#')[0]);
      referencedPaths.add(resolved);
      if (!fs.existsSync(resolved)) fail(`${document}: image reference is missing: ${ref}`);
    }
  }

  for (const output of diagram.outputs ?? []) {
    if (outputs.has(output)) fail(`output is reused by multiple diagrams: ${output}`);
    outputs.add(output);
    if (!fs.existsSync(localPath(output))) fail(`${diagram.id}: rendered output is missing: ${output}`);
    const sourceStem = path.basename(diagram.source).replace(path.extname(diagram.source), '');
    const outputStem = path.basename(output).replace(path.extname(output), '');
    if (sourceStem !== outputStem) {
      console.warn(`Warning: ${diagram.id} source/output basenames differ: ${sourceStem} -> ${outputStem}`);
    }
    if (diagram.documents?.length && ['output', 'both'].includes(diagram.publication) && !referencedPaths.has(localPath(output))) {
      console.warn(`Warning: ${diagram.id} output is not referenced by its declared documents: ${output}`);
    }
  }
}

if (process.exitCode) process.exit();
console.log(`Validated ${manifest.diagrams.length} diagram entries from ${manifestPath}`);
