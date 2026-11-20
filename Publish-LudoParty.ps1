$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Report = New-Object System.Collections.Generic.List[string]
function Add-Report($s){ $Report.Add($s); Write-Host $s }
try {
  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) { throw 'Git is not installed. Install Git for Windows from https://git-scm.com/download/win then rerun.' }
  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if (-not $gh) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
      Write-Host 'Installing GitHub CLI with winget...'
      winget install --id GitHub.cli --exact --accept-source-agreements --accept-package-agreements
      $env:Path += ';' + "$env:ProgramFiles\GitHub CLI"
      $gh = Get-Command gh -ErrorAction SilentlyContinue
    }
  }
  if (-not $gh) { throw 'GitHub CLI (gh) is unavailable. Install from https://cli.github.com and rerun.' }
  if (-not (gh auth status 2>$null)) { Write-Host 'Opening GitHub authentication...'; gh auth login --web --git-protocol https }
  gh auth status | Out-Null
  if (-not (Test-Path (Join-Path $Root 'server.js'))) { throw 'server.js missing. Run this script from the extracted ludo-party folder.' }
  if (-not (Test-Path (Join-Path $Root '.git'))) { git -C $Root init | Out-Null }
  git -C $Root add .
  git -C $Root commit -m 'Publish Ludo Party' 2>$null | Out-Null
  $repo = 'ludo-party'
  $existing = gh repo view $repo --json name -q .name 2>$null
  if (-not $existing) {
    gh repo create $repo --public --source $Root --remote origin --push
  } else {
    if (-not (git -C $Root remote get-url origin 2>$null)) { gh repo set-default $repo; git -C $Root remote add origin (gh repo view $repo --json url -q .url) }
    git -C $Root branch -M main
    git -C $Root push -u origin main
  }
  $url = gh repo view $repo --json url -q .url
  Add-Report "GitHub repository: $url"
  Add-Report 'Next: Open Render Blueprint deployment page; connect the repository and apply render.yaml.'
  Start-Process 'https://render.com/deploy'
  Add-Report 'Render deployment page opened in your browser. Finish account authorization and deployment there.'
} catch { Add-Report ('ERROR: ' + $_.Exception.Message) }
$final = $Report -join [Environment]::NewLine
Write-Host $final
try { Set-Clipboard -Value $final; Write-Host 'Report copied to clipboard.' } catch {}
