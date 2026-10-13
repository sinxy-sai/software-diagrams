#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$root/scripts/toolchain.sh"
demo="$root/examples/ai-algorithms"
source_dir="$demo/sources"
rendered="$demo/rendered"
tool_root="$(resolve_tool_root "$root")"
bin="$tool_root/bin"
mkdir -p "$rendered"
require_file "$bin/plantuml.jar" "PlantUML"
require_file "$bin/structurizr/structurizr.sh" "Structurizr CLI"
require_file "$root/node_modules/drawio-headless/vendor/drawio-headless" "drawio-headless"

npm --prefix "$root" exec -- mmdc -p "$root/scripts/puppeteer-ci.json" -i "$source_dir/mermaid-transformer.mmd" -o "$rendered/mermaid-transformer.svg"
npm --prefix "$root" exec -- mmdc -p "$root/scripts/puppeteer-ci.json" -i "$source_dir/mermaid-bfs.mmd" -o "$rendered/mermaid-bfs.png" -b transparent

java -jar "$bin/plantuml.jar" -tsvg -o "$rendered" -Playout=smetana "$source_dir/plantuml-resnet.puml"

"$bin/structurizr/structurizr.sh" validate -w "$source_dir/structurizr-llm-serving.dsl"
"$bin/structurizr/structurizr.sh" export -w "$source_dir/structurizr-llm-serving.dsl" -f plantuml -o "$rendered"
java -jar "$bin/plantuml.jar" -tsvg -Playout=smetana "$rendered/structurizr-context.puml" "$rendered/structurizr-containers.puml"

node "$root/scripts/render-ai-wasm.mjs"
npm --prefix "$root" exec -- drawio-headless render --format png "$source_dir/drawio-transformer.drawio" "$rendered/drawio-transformer.png"

assert_outputs "$rendered" mermaid-transformer.svg mermaid-bfs.png plantuml-resnet.svg structurizr-context.svg structurizr-containers.svg d2-moe-inference.svg graphviz-transformer.svg graphviz-bst.svg graphviz-graph.svg graphviz-stack.svg graphviz-queue.svg graphviz-hash-table.svg drawio-transformer.png

echo "Rendered diagrams in $demo"
find "$rendered" -maxdepth 1 -type f -printf '%f\n' | sort
