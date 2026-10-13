function Resolve-SoftwareDiagramsToolRoot {
  param([Parameter(Mandatory)][string]$SkillRoot)

  $candidates = @(
    (Join-Path $SkillRoot 'tools'),
    $(if ($env:SOFTWARE_DIAGRAMS_TOOLS) { $env:SOFTWARE_DIAGRAMS_TOOLS }),
    $(try {
      $commonGit = (& git -C $SkillRoot rev-parse --git-common-dir 2>$null)
      if ($LASTEXITCODE -eq 0 -and $commonGit) {
        $commonPath = $commonGit.Trim()
        if (-not [IO.Path]::IsPathRooted($commonPath)) { $commonPath = Join-Path $SkillRoot $commonPath }
        $commonRoot = (Resolve-Path $commonPath -ErrorAction Stop).Path
        Join-Path (Split-Path $commonRoot -Parent) 'tools'
      }
    } catch {})
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path (Join-Path $candidate 'bin/plantuml.jar'))) {
      return (Resolve-Path $candidate).Path
    }
  }
  return (Join-Path $SkillRoot 'tools')
}

function Require-LocalFile {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Name)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Name is missing: $Path. Run the setup command for a clean checkout or configure SOFTWARE_DIAGRAMS_TOOLS."
  }
  return (Resolve-Path -LiteralPath $Path).Path
}

function Assert-OutputFiles {
  param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string[]]$RelativePaths)
  foreach ($relative in $RelativePaths) {
    $path = Join-Path $Root $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Expected output was not created: $path" }
    if ((Get-Item -LiteralPath $path).Length -le 0) { throw "Expected output is empty: $path" }
  }
}
