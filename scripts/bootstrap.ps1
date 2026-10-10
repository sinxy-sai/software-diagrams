$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$bin = Join-Path $root 'tools/bin'
$plantumlVersion = '1.2026.8'
$structurizrVersion = '2025.11.09'
$plantuml = Join-Path $bin 'plantuml.jar'
$structurizrDir = Join-Path $bin 'structurizr'
$structurizrZip = Join-Path $bin 'structurizr-cli.zip'

New-Item -ItemType Directory -Force $bin | Out-Null
Push-Location $root
try { npm rebuild drawio-headless --foreground-scripts }
finally { Pop-Location }
if (-not (Test-Path $plantuml)) {
  Invoke-WebRequest "https://github.com/plantuml/plantuml/releases/download/v$plantumlVersion/plantuml-$plantumlVersion.jar" -OutFile $plantuml
}
if (-not (Test-Path (Join-Path $structurizrDir 'structurizr.bat'))) {
  Invoke-WebRequest "https://github.com/structurizr/cli/releases/download/v$structurizrVersion/structurizr-cli.zip" -OutFile $structurizrZip
  Expand-Archive -Force $structurizrZip $structurizrDir
}
Write-Host "Java tools installed under $bin"
