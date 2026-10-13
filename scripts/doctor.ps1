$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$OutputEncoding = [Console]::OutputEncoding

$skillRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$toolRoot = Join-Path $skillRoot 'tools'
if (-not (Test-Path (Join-Path $toolRoot 'bin/plantuml.jar')) -and $env:SOFTWARE_DIAGRAMS_TOOLS) {
  $toolRoot = (Resolve-Path $env:SOFTWARE_DIAGRAMS_TOOLS).Path
}
if (-not (Test-Path (Join-Path $toolRoot 'bin/plantuml.jar'))) {
  $commonGit = (& git -C $skillRoot rev-parse --git-common-dir 2>$null)
  if ($LASTEXITCODE -eq 0 -and $commonGit) {
    $commonPath = $commonGit.Trim()
    if (-not [IO.Path]::IsPathRooted($commonPath)) { $commonPath = Join-Path $skillRoot $commonPath }
    $commonRoot = (Resolve-Path $commonPath).Path
    $candidate = Join-Path (Split-Path $commonRoot -Parent) 'tools'
    if (Test-Path (Join-Path $candidate 'bin/plantuml.jar')) { $toolRoot = $candidate }
  }
}
$checks = @(
  @{ Name = 'Node.js'; Path = 'node'; Args = @('--version') },
  @{ Name = 'Java'; Path = 'java'; Args = @() },
  @{ Name = 'Mermaid CLI'; Path = (Join-Path $skillRoot 'node_modules/.bin/mmdc.cmd'); Args = @('--version') },
  @{ Name = 'draw.io headless'; Path = (Join-Path $skillRoot 'node_modules/drawio-headless/vendor/drawio-headless.exe'); Args = @() },
  @{ Name = 'PlantUML jar'; Path = (Join-Path $toolRoot 'bin/plantuml.jar'); Args = @() },
  @{ Name = 'Structurizr CLI'; Path = (Join-Path $toolRoot 'bin/structurizr/structurizr.bat'); Args = @() }
)

$missing = 0
foreach ($check in $checks) {
  $path = $check.Path
  $available = if ($path -match '[\\/]') { Test-Path -LiteralPath $path } else { $null -ne (Get-Command $path -ErrorAction SilentlyContinue) }
  if ($available) {
    Write-Host ("[ok]   {0}: {1}" -f $check.Name, $path)
    if ($check.Args.Count -gt 0 -and $path -notmatch '\.(jar|exe|bat)$') {
      & $path @($check.Args) 2>&1 | Select-Object -First 1 | ForEach-Object { Write-Host ("       {0}" -f $_) }
    }
  } else {
    Write-Host ("[miss] {0}: {1}" -f $check.Name, $path)
    $missing++
  }
}

if ($missing -gt 0) {
  Write-Host ("`n{0} local capability check(s) failed. Existing dependencies were not changed." -f $missing)
  exit 1
}

Write-Host "`nAll local diagram capabilities are available."
Write-Host ("Tool root: {0}" -f $toolRoot)
