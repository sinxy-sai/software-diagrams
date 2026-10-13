$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$OutputEncoding = [Console]::OutputEncoding
$env:PYTHONIOENCODING = 'utf-8'
. (Join-Path $PSScriptRoot 'toolchain.ps1')

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$demo = Join-Path $repoRoot 'examples/ai-algorithms'
$source = Join-Path $demo 'sources'
$rendered = Join-Path $demo 'rendered'
$toolRoot = Resolve-SoftwareDiagramsToolRoot -SkillRoot $repoRoot
$bin = Join-Path $toolRoot 'bin'
$structurizr = Join-Path $bin 'structurizr/structurizr.bat'
$plantuml = Join-Path $bin 'plantuml.jar'
$drawio = Join-Path $repoRoot 'node_modules/drawio-headless/vendor/drawio-headless.exe'
$puppeteerConfig = Join-Path $repoRoot 'scripts/puppeteer-ci.json'

$plantuml = Require-LocalFile -Path $plantuml -Name 'PlantUML'
$structurizr = Require-LocalFile -Path $structurizr -Name 'Structurizr CLI'
$drawio = Require-LocalFile -Path $drawio -Name 'drawio-headless'

New-Item -ItemType Directory -Force $rendered | Out-Null

npm exec -- mmdc -p $puppeteerConfig -i (Join-Path $source 'mermaid-transformer.mmd') -o (Join-Path $rendered 'mermaid-transformer.svg')
npm exec -- mmdc -p $puppeteerConfig -i (Join-Path $source 'mermaid-bfs.mmd') -o (Join-Path $rendered 'mermaid-bfs.png') -b transparent

Push-Location $demo
try {
  java -jar $plantuml -tsvg -o $rendered -Playout=smetana (Join-Path $source 'plantuml-resnet.puml')

  & $structurizr validate -w (Join-Path $source 'structurizr-llm-serving.dsl')
  & $structurizr export -w (Join-Path $source 'structurizr-llm-serving.dsl') -f plantuml -o $rendered
  java -jar $plantuml -tsvg -Playout=smetana (Join-Path $rendered 'structurizr-context.puml') (Join-Path $rendered 'structurizr-containers.puml')

  Push-Location $repoRoot
  try {
    node scripts/render-ai-wasm.mjs
    npm exec -- drawio-headless render --format png (Join-Path $source 'drawio-transformer.drawio') (Join-Path $rendered 'drawio-transformer.png')
  }
  finally { Pop-Location }
}
finally { Pop-Location }

Assert-OutputFiles -Root $rendered -RelativePaths @(
  'mermaid-transformer.svg', 'mermaid-bfs.png', 'plantuml-resnet.svg',
  'structurizr-context.svg', 'structurizr-containers.svg', 'd2-moe-inference.svg',
  'graphviz-transformer.svg', 'graphviz-bst.svg', 'graphviz-graph.svg',
  'graphviz-stack.svg', 'graphviz-queue.svg', 'graphviz-hash-table.svg',
  'drawio-transformer.png'
)

Write-Host "Rendered diagrams in $demo"
Get-ChildItem -LiteralPath $rendered -File | Sort-Object Name | ForEach-Object { Write-Host ("- " + $_.FullName) }
