// Renderer registry: the single source of truth for every pinned renderer.
//
// Nothing else may restate a version, a URL, a digest, or a renderer id. The
// planner in ensure.mjs, the renderer in render.mjs, the readiness probe in
// probe.mjs and the CLI in sd.mjs all read this table.
//
// kind:    how the renderer is installed ('npm' or 'jar').
// runtime: how the renderer executes ('wasm' loads a package, 'node' spawns a
//          package binary, 'jar' spawns java -jar).
// probe:   the on-disk fact that proves the renderer is really usable; a ledger
//          entry alone never proves it.

const PLANTUML = {
  version: '1.2026.8',
  url: 'https://github.com/plantuml/plantuml/releases/download/v1.2026.8/plantuml-1.2026.8.jar',
  // 29,871,497 bytes; Implementation-Version in the jar manifest is 1.2026.8.
  sha256: '5e1ecfa8ecd32c90b03bbf3b1eb6f020943f98ab0fcf4032be31a0002ee2c462',
};

const STRUCTURIZR = {
  version: '2025.11.09',
  url: 'https://github.com/structurizr/cli/releases/download/v2025.11.09/structurizr-cli.zip',
  // 98,857,530 bytes.
  sha256: 'f5365a463fc44d539ed19bec00c48ba1e1ecda0ccfd1ba40d2e7472d264eb79a',
};

export const RENDERERS = {
  mermaid: {
    id: 'mermaid',
    label: 'Mermaid',
    aliases: ['mmd'],
    kind: 'npm',
    runtime: 'node',
    packages: ['@mermaid-js/mermaid-cli@12.0.0'],
    binary: 'node_modules/.bin/mmdc',
    requiresJava: false,
    needsRebuild: false,
    probe: { type: 'npm-package', name: '@mermaid-js/mermaid-cli', version: '12.0.0' },
    formats: { svg: true, png: true },
    extensions: ['.mmd', '.mermaid'],
  },
  plantuml: {
    id: 'plantuml',
    label: 'PlantUML',
    aliases: ['puml'],
    kind: 'jar',
    runtime: 'jar',
    requiresJava: true,
    needsRebuild: false,
    version: PLANTUML.version,
    url: PLANTUML.url,
    sha256: PLANTUML.sha256,
    download: 'bin/plantuml.jar',
    probe: { type: 'file', path: 'bin/plantuml.jar' },
    formats: { svg: true, png: true },
    extensions: ['.puml', '.plantuml', '.iuml'],
  },
  structurizr: {
    id: 'structurizr',
    label: 'Structurizr CLI',
    aliases: ['structurizr-dsl', 'c4'],
    kind: 'jar',
    runtime: 'jar',
    requiresJava: true,
    needsRebuild: false,
    version: STRUCTURIZR.version,
    url: STRUCTURIZR.url,
    sha256: STRUCTURIZR.sha256,
    download: 'bin/structurizr-cli.zip',
    // Extraction is version-scoped so an upgrade never merges two trees.
    unpack: { archive: 'bin/structurizr-cli.zip', dir: `bin/structurizr-${STRUCTURIZR.version}` },
    keepArchive: false,
    mainClass: 'com.structurizr.cli.StructurizrCliApplication',
    multiView: true,
    probe: { type: 'file', path: `bin/structurizr-${STRUCTURIZR.version}/lib/structurizr-cli.jar` },
    formats: { svg: true, png: false },
    extensions: ['.dsl'],
  },
  d2: {
    id: 'd2',
    label: 'D2 (WASM)',
    aliases: ['terrastruct'],
    kind: 'npm',
    runtime: 'wasm',
    packages: ['@terrastruct/d2@0.1.33'],
    requiresJava: false,
    needsRebuild: false,
    probe: { type: 'npm-package', name: '@terrastruct/d2', version: '0.1.33' },
    formats: { svg: true, png: false },
    extensions: ['.d2'],
  },
  graphviz: {
    id: 'graphviz',
    label: 'Graphviz (WASM)',
    aliases: ['graphviz-dot', 'dot'],
    kind: 'npm',
    runtime: 'wasm',
    packages: ['@hpcc-js/wasm-graphviz@1.29.2'],
    requiresJava: false,
    needsRebuild: false,
    probe: { type: 'npm-package', name: '@hpcc-js/wasm-graphviz', version: '1.29.2' },
    formats: { svg: true, png: false },
    extensions: ['.dot', '.gv'],
  },
  drawio: {
    id: 'drawio',
    label: 'draw.io headless',
    aliases: ['diagrams.net'],
    kind: 'npm',
    runtime: 'node',
    packages: ['drawio-headless@0.4.2'],
    binary: 'node_modules/.bin/drawio-headless',
    requiresJava: false,
    needsRebuild: true,
    probe: { type: 'npm-package', name: 'drawio-headless', version: '0.4.2' },
    formats: { svg: true, png: true },
    extensions: ['.drawio'],
  },
};

const ALIAS_INDEX = new Map(
  Object.values(RENDERERS).flatMap((renderer) => [
    [renderer.id.toLowerCase(), renderer],
    [renderer.label.toLowerCase(), renderer],
    ...renderer.aliases.map((alias) => [alias.toLowerCase(), renderer]),
  ]),
);

export function rendererFor(name) {
  if (typeof name !== 'string') return null;
  return ALIAS_INDEX.get(name.trim().toLowerCase()) ?? null;
}

export function rendererIds() {
  return Object.keys(RENDERERS);
}

/** The pinned version of a renderer, derived in exactly one place. */
export function pinnedVersion(renderer) {
  if (renderer.kind === 'jar') {
    if (!renderer.version) throw new Error(`renderer ${renderer.id} has no pinned version`);
    return renderer.version;
  }
  const spec = renderer.packages?.[0];
  if (!spec) throw new Error(`renderer ${renderer.id} has no pinned package`);
  const at = spec.lastIndexOf('@');
  if (at <= 0) throw new Error(`renderer ${renderer.id} package is not pinned: ${spec}`);
  return spec.slice(at + 1);
}

/** The renderer that owns a source extension, or null. */
export function rendererForExtension(ext) {
  const normalized = String(ext).toLowerCase();
  const hit = Object.values(RENDERERS).find((r) => r.extensions.includes(normalized));
  return hit ?? null;
}