<#
.SYNOPSIS
  Installs and launches the OUAGX gateway app on Windows.
.EXAMPLE
  irm https://ouagx.com/install.ps1 | iex
#>
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'OUAGX'),
  [int]$Port = 4173,
  [string]$RepoZip = 'https://github.com/codingkonet/ouagxaimodel/archive/refs/heads/main.zip',
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

function Need-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

if (-not (Need-Command 'node') -or -not (Need-Command 'npm')) {
  Write-Host 'Node.js is required. Installing Node.js LTS via winget...'
  winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements --silent
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (Need-Command 'npm')) { throw 'Node.js install did not complete. Restart PowerShell and run this installer again.' }
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) ('ouagx-' + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $zip = Join-Path $work 'ouagx.zip'
  Write-Host "Downloading OUAGX from $RepoZip ..."
  Invoke-WebRequest -Uri $RepoZip -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $work -Force
  $src = Get-ChildItem -Path $work -Directory | Select-Object -First 1
  if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
  New-Item -ItemType Directory -Path $InstallDir | Out-Null
  Copy-Item -Path (Join-Path $src.FullName '*') -Destination $InstallDir -Recurse -Force
}
finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}

Set-Location $InstallDir
Write-Host 'Installing dependencies (first run only)...'
npm install --no-audit --no-fund
Write-Host 'Building...'
npm run build

Write-Host "Starting OUAGX on http://localhost:$Port/ ..."
if (-not $NoBrowser) { Start-Process "http://localhost:$Port/" }
npm run preview -- --port $Port
