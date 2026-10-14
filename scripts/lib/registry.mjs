const PLANTUML_VERSION = '1.2026.8';
const STRUCTURIZR_VERSION = '2025.11.09';

export const RENDERERS = {
  mermaid: {
    id: 'mermaid', kind: 'npm', label: 'Mermaid', aliases: ['mmd'],
    packages: ['@mermaid-js/mermaid-cli@12.0.0'],
    binaries: ['mmdc'], requiresJava: false, needsRebuild: false,
    formats: { svg: true, png: true }, extensions: ['.mmd'],
  },
  plantuml: {
    id: 'plantuml', kind: 'jar', label: 'PlantUML', aliases: ['puml'],
    packages: [], binaries: [], requiresJava: true, needsRebuild: false,
    url: `https://github.com/plantuml/plantuml/releases/download/v${PLANTUML_VERSION}/plantuml-${PLANTUML_VERSION}.jar`,
    archive: 'bin/plantuml.jar',
    formats: { svg: true, png: true }, extensions: ['.puml', '.plantuml', '.iuml'],
  },
  structurizr: {
    id: 'structurizr', kind: 'jar', label: 'Structurizr CLI', aliases: ['structurizr-dsl'],
    packages: [], binaries: [], requiresJava: true, needsRebuild: false,
    url: `https://github.com/structurizr/cli/releases/download/v${STRUCTURIZR_VERSION}/structurizr-cli.zip`,
    archive: 'bin/structurizr-cli.zip', unpack: { archive: 'bin/structurizr-cli.zip', dir: 'bin/structurizr' },
    formats: { svg: true, png: false }, extensions: ['.dsl'],
  },
  d2: {
    id: 'd2', kind: 'wasm', label: 'D2 (WASM)', aliases: [],
    packages: ['@terrastruct/d2@0.1.33'], binaries: [], requiresJava: false, needsRebuild: false,
    formats: { svg: true, png: false }, extensions: ['.d2'],
  },
  graphviz: {
    id: 'graphviz', kind: 'wasm', label: 'Graphviz (WASM)', aliases: ['graphviz-dot', 'dot'],
    packages: ['@hpcc-js/wasm-graphviz@1.29.2'], binaries: [], requiresJava: false, needsRebuild: false,
    formats: { svg: true, png: false }, extensions: ['.dot', '.gv'],
  },
  drawio: {
    id: 'drawio', kind: 'npm', label: 'draw.io headless', aliases: ['diagrams.net'],
    packages: ['drawio-headless@0.4.2'], binaries: ['drawio-headless'],
    requiresJava: false, needsRebuild: true,
    formats: { svg: true, png: true }, extensions: ['.drawio'],
  },
};

const ALIAS_INDEX = new Map(
  Object.values(RENDERERS).flatMap((r) => [
    [r.id.toLowerCase(), r],
    [r.label.toLowerCase(), r],
    ...r.aliases.map((a) => [a.toLowerCase(), r]),
  ]),
);

export function rendererFor(name) {
  if (typeof name !== 'string') return null;
  return ALIAS_INDEX.get(name.trim().toLowerCase()) ?? null;
}

export function rendererIds() {
  return Object.keys(RENDERERS);
}
